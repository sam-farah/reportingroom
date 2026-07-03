import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "./storage";
import { sendSms, normalisePhone, isSmsConfigured } from "./twilio";

// Strip every sensitive field from a user row before sending it to the client.
function stripSensitive(user: any) {
  const {
    passwordHash,
    twoFactorCodeHash,
    twoFactorCodeExpiresAt,
    twoFactorAttempts,
    twoFactorLastSentAt,
    ...safe
  } = user;
  return safe;
}

// Show only the last 3 digits of a mobile number, e.g. "•••• ••• 123".
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last3 = digits.slice(-3);
  return `•••• ••• ${last3}`;
}

const TWO_FACTOR_TTL_MS = 5 * 60 * 1000; // codes expire after 5 minutes
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const TWO_FACTOR_RESEND_COOLDOWN_MS = 30 * 1000;
const PENDING_2FA_TTL_MS = 10 * 60 * 1000; // pending login must verify within 10 min

// Generate a 6-digit numeric code, hash it, store it on the user, and SMS it.
// Returns a masked phone hint for the UI. Throws if the SMS send fails.
async function issueTwoFactorCode(user: any): Promise<string> {
  const phone = normalisePhone(user.phoneNumber);
  if (!phone) throw new Error("NO_PHONE");
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  await storage.setUserTwoFactorCode(user.id, codeHash, new Date(Date.now() + TWO_FACTOR_TTL_MS));
  await sendSms({
    to: phone,
    body: `Your Reporting Room verification code is ${code}. It expires in 5 minutes. If you didn't try to sign in, ignore this message.`,
  });
  return maskPhone(phone);
}

function clientIp(req: any): string | null {
  const xf = (req.headers?.["x-forwarded-for"] || "") as string;
  const ip = xf.split(",")[0]?.trim() || req.ip || req.connection?.remoteAddress || null;
  return ip ? ip.replace(/^::ffff:/, "").slice(0, 64) : null;
}

function clientUserAgent(req: any): string | null {
  const ua = (req.headers?.["user-agent"] || "") as string;
  return ua ? ua.slice(0, 500) : null;
}

async function safeAudit(entry: any): Promise<void> {
  try {
    await storage.recordLoginAudit(entry);
  } catch (err) {
    console.error("[loginAudit] failed to record entry:", err);
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    pending2fa?: { userId: string; at: number };
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

  // In Replit (REPL_ID set) or production, the app is served over HTTPS
  // so we need secure + sameSite "none" to allow cookies in cross-origin iframe contexts
  const isHttps = process.env.NODE_ENV === "production" || !!process.env.REPL_ID;

  return session({
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isHttps,
      maxAge: sessionTtl,
      sameSite: isHttps ? "none" : "lax",
    },
  });
}

// Shared session middleware instance — created once in setupAuth and reused by
// the WebSocket upgrade handler so it can parse the same session cookie.
export let sessionMiddleware: ReturnType<typeof getSession> | null = null;

export async function setupAuth(app: Express) {
  app.set("trust proxy", true);
  sessionMiddleware = getSession();
  app.use(sessionMiddleware);

  // Add `Partitioned` attribute to session cookies so they survive inside
  // third-party iframe contexts (Replit workspace preview, embedded demos, etc).
  // Browsers (Chrome/Edge/Safari) increasingly require Partitioned for cookies
  // sent from iframes under cross-site cookie restrictions. Only applied when
  // we're already setting SameSite=None; Secure (i.e. on HTTPS).
  app.use((req, res, next) => {
    const origSetHeader = res.setHeader.bind(res);
    res.setHeader = function (name: string, value: any) {
      if (name.toLowerCase() === "set-cookie" && value) {
        const transform = (v: string) => {
          if (typeof v === "string" && /SameSite=None/i.test(v) && !/Partitioned/i.test(v)) {
            return v + "; Partitioned";
          }
          return v;
        };
        if (Array.isArray(value)) value = value.map(transform);
        else value = transform(value as string);
      }
      return origSetHeader(name, value);
    } as any;
    next();
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName, phoneNumber } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      // A mobile number is mandatory — it's required for the SMS sign-in code.
      const phone = normalisePhone(phoneNumber);
      if (!phone) {
        return res.status(400).json({ message: "A valid mobile number is required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const userId = crypto.randomUUID();

      const user = await storage.upsertUser({
        id: userId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        phoneNumber: phone,
        passwordHash,
        role: "sonographer",
        isActive: true,
      });

      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Registration failed. Please try again." });
        }
        res.status(201).json(stripSensitive(user));
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        await safeAudit({ userId: user?.id ?? null, email, clinicId: user?.clinicId ?? null, eventType: "login_failed", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: user ? "no_password_set" : "unknown_email" });
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        await safeAudit({ userId: user.id, email, clinicId: user.clinicId ?? null, eventType: "login_failed", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: "bad_password" });
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.isActive) {
        await safeAudit({ userId: user.id, email, clinicId: user.clinicId ?? null, eventType: "login_failed", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: "deactivated" });
        return res.status(403).json({ message: "Your account has been deactivated" });
      }

      // Password is correct — now require the SMS second factor for everyone.
      if (!isSmsConfigured()) {
        return res.status(503).json({ message: "Two-step sign-in is temporarily unavailable. Please contact your clinic administrator." });
      }
      if (!normalisePhone(user.phoneNumber)) {
        await safeAudit({ userId: user.id, email, clinicId: user.clinicId ?? null, eventType: "login_failed", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: "no_phone" });
        return res.status(403).json({ code: "NO_PHONE", message: "No mobile number is on file for your account. Please ask your clinic administrator to add one before you can sign in." });
      }

      let phoneHint: string;
      try {
        phoneHint = await issueTwoFactorCode(user);
      } catch (smsErr: any) {
        if (smsErr?.message === "NO_PHONE") {
          return res.status(403).json({ code: "NO_PHONE", message: "No mobile number is on file for your account. Please ask your clinic administrator to add one before you can sign in." });
        }
        console.error("2FA SMS send error:", smsErr);
        return res.status(502).json({ message: "We couldn't send your verification code by SMS. Please try again shortly." });
      }

      // Hold the login as "pending" — the session is NOT authenticated until the
      // code is verified (req.session.userId is only set in /verify-2fa).
      (req.session as any).pending2fa = { userId: user.id, at: Date.now() };
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Login failed. Please try again." });
        }
        res.json({ requiresTwoFactor: true, phoneHint });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // Step 2 of login: verify the 6-digit SMS code and complete authentication.
  app.post("/api/auth/verify-2fa", async (req: any, res) => {
    try {
      const { code } = req.body;
      const pending = req.session?.pending2fa;
      if (!pending?.userId || (Date.now() - pending.at) > PENDING_2FA_TTL_MS) {
        delete req.session.pending2fa;
        return res.status(440).json({ message: "Your sign-in session expired. Please sign in again." });
      }
      if (!code || !/^\d{6}$/.test(String(code).trim())) {
        return res.status(400).json({ message: "Please enter the 6-digit code." });
      }

      const user = await storage.getUser(pending.userId);
      if (!user || !user.twoFactorCodeHash || !user.twoFactorCodeExpiresAt) {
        return res.status(400).json({ message: "Your code has expired. Please request a new one." });
      }
      if (new Date(user.twoFactorCodeExpiresAt).getTime() < Date.now()) {
        await storage.clearUserTwoFactorCode(user.id);
        return res.status(400).json({ message: "Your code has expired. Please request a new one." });
      }
      // Atomically count this attempt FIRST, then compare. Doing the increment
      // before the bcrypt compare means concurrent requests each get a distinct,
      // serialized attempt number from the DB, so the max-attempt ceiling cannot
      // be raced past by firing many verifications in parallel.
      const attempts = await storage.incrementTwoFactorAttempts(user.id);
      if (attempts > TWO_FACTOR_MAX_ATTEMPTS) {
        await storage.clearUserTwoFactorCode(user.id);
        delete req.session.pending2fa;
        await safeAudit({ userId: user.id, email: user.email, clinicId: user.clinicId ?? null, eventType: "login_failed", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: "2fa_too_many_attempts" });
        return res.status(429).json({ message: "Too many incorrect codes. Please sign in again." });
      }

      const valid = await bcrypt.compare(String(code).trim(), user.twoFactorCodeHash);
      if (!valid) {
        await safeAudit({ userId: user.id, email: user.email, clinicId: user.clinicId ?? null, eventType: "login_failed", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: "bad_2fa_code" });
        const left = Math.max(0, TWO_FACTOR_MAX_ATTEMPTS - attempts);
        if (left <= 0) {
          await storage.clearUserTwoFactorCode(user.id);
          delete req.session.pending2fa;
          return res.status(429).json({ message: "Too many incorrect codes. Please sign in again." });
        }
        return res.status(401).json({ message: `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.` });
      }

      // Success — clear the code, authenticate the session.
      await storage.clearUserTwoFactorCode(user.id);
      delete req.session.pending2fa;
      req.session.userId = user.id;
      req.session.save((err: any) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Login failed. Please try again." });
        }
        void safeAudit({ userId: user.id, email: user.email, clinicId: user.clinicId ?? null, eventType: "login_success", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: null });
        res.json(stripSensitive(user));
      });
    } catch (error) {
      console.error("Verify 2FA error:", error);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });

  // Resend a fresh SMS code for an in-progress login (rate-limited).
  app.post("/api/auth/resend-2fa", async (req: any, res) => {
    try {
      const pending = req.session?.pending2fa;
      if (!pending?.userId || (Date.now() - pending.at) > PENDING_2FA_TTL_MS) {
        delete req.session.pending2fa;
        return res.status(440).json({ message: "Your sign-in session expired. Please sign in again." });
      }
      const user = await storage.getUser(pending.userId);
      if (!user) {
        delete req.session.pending2fa;
        return res.status(440).json({ message: "Your sign-in session expired. Please sign in again." });
      }
      if (user.twoFactorLastSentAt && (Date.now() - new Date(user.twoFactorLastSentAt).getTime()) < TWO_FACTOR_RESEND_COOLDOWN_MS) {
        return res.status(429).json({ message: "Please wait a few seconds before requesting another code." });
      }
      let phoneHint: string;
      try {
        phoneHint = await issueTwoFactorCode(user);
      } catch (smsErr: any) {
        console.error("2FA resend error:", smsErr);
        return res.status(502).json({ message: "We couldn't send your verification code by SMS. Please try again shortly." });
      }
      res.json({ requiresTwoFactor: true, phoneHint });
    } catch (error) {
      console.error("Resend 2FA error:", error);
      res.status(500).json({ message: "Could not resend the code. Please try again." });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(stripSensitive(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const userId = req.session?.userId;
    let user: any = null;
    if (userId) {
      try { user = await storage.getUser(userId); } catch {}
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      if (userId) {
        void safeAudit({ userId, email: user?.email ?? null, clinicId: user?.clinicId ?? null, eventType: "logout", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: null });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      res.redirect("/login");
    });
  });

  console.log("Email/password authentication setup completed successfully");
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    (req as any).user = user;
    return next();
  } catch {
    return res.status(500).json({ message: "Authentication error" });
  }
};
