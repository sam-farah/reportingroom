import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "./storage";

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
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
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
        passwordHash,
        role: "sonographer",
        isActive: true,
      });

      req.session.userId = user.id;

      const { passwordHash: _, ...safeUser } = user;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Registration failed. Please try again." });
        }
        res.status(201).json(safeUser);
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

      req.session.userId = user.id;

      const { passwordHash: _, ...safeUser } = user;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Login failed. Please try again." });
        }
        void safeAudit({ userId: user.id, email, clinicId: user.clinicId ?? null, eventType: "login_success", ipAddress: clientIp(req), userAgent: clientUserAgent(req), failureReason: null });
        res.json(safeUser);
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { passwordHash: _, ...safeUser } = user;
      res.json(safeUser);
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
