import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    try {
      console.log('Getting OIDC config with:', {
        issuer: process.env.ISSUER_URL ?? "https://replit.com/oidc",
        clientId: process.env.REPL_ID
      });
      const config = await client.discovery(
        new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
        process.env.REPL_ID!
      );
      console.log('OIDC config obtained successfully');
      return config;
    } catch (error) {
      console.error('Failed to get OIDC config:', error);
      throw error;
    }
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true, // Allow session table creation
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Disable secure for localhost development
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  try {
    console.log('Upserting user with claims:', { 
      sub: claims["sub"], 
      email: claims["email"],
      first_name: claims["first_name"],
      last_name: claims["last_name"]
    });
    
    if (!claims["sub"]) {
      throw new Error('Missing required field: sub');
    }
    
    const userId = String(claims["sub"]);
    const existingUser = await storage.getUser(userId);
    
    const userData = {
      id: userId,
      email: claims["email"] || null,
      firstName: claims["first_name"] || null,
      lastName: claims["last_name"] || null,
      profileImageUrl: claims["profile_image_url"] || null,
      role: existingUser?.role || 'sonographer',
      isActive: existingUser?.isActive ?? true,
    };
    
    console.log('Attempting to upsert user data:', userData);
    const result = await storage.upsertUser(userData);
    console.log('User upserted successfully:', { id: result.id, email: result.email, role: result.role });
    
    return result;
  } catch (error) {
    console.error('Error upserting user - Full error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    throw error;
  }
}

export async function setupAuth(app: Express) {
  try {
    // Trust proxy for custom domains like reportingroom.net
    app.set("trust proxy", true);
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());

    console.log('Getting OIDC configuration...');
    const config = await getOidcConfig();
    console.log('OIDC configuration loaded successfully');

    const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      console.log('Starting verification process...');
      const user = {};
      updateUserSession(user, tokens);
      console.log('User session updated');
      
      await upsertUser(tokens.claims());
      console.log('User upserted, calling verified callback');
      
      verified(null, user);
    } catch (error) {
      console.error('Verification process failed:', error);
      verified(error instanceof Error ? error : new Error('Authentication failed'), null);
    }
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    try {
      // Add localhost strategy for development
      const localStrategy = new Strategy(
        {
          name: `replitauth:localhost:5000`,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `http://localhost:5000/api/callback`,
        },
        verify,
      );
      passport.use(localStrategy);
      console.log(`✅ Registered strategy: replitauth:localhost:5000`);
      
      // Remove custom domain strategy - use production strategy for reportingroom.net
      // since the OAuth is configured for the main replit domain
      
      // Production strategy for main replit domain
      const strategy = new Strategy(
        {
          name: `replitauth:${domain}`,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      console.log(`✅ Registered strategy: replitauth:${domain}`);
      
      // Custom domain strategy that redirects back to custom domain
      const customStrategy = new Strategy(
        {
          name: `replitauth:reportingroom.net`,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://reportingroom.net/api/callback`,
        },
        verify,
      );
      passport.use(customStrategy);
      console.log(`✅ Registered custom domain strategy: replitauth:reportingroom.net`);
    } catch (error) {
      console.error(`❌ Failed to register strategy for ${domain}:`, error);
    }
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    let strategyName;
    
    console.log(`Login attempt: hostname=${req.hostname}, headers=${JSON.stringify(req.headers.host)}`);
    
    if (req.hostname === 'localhost') {
      strategyName = 'replitauth:localhost:5000';
      console.log(`Using LOCAL strategy=${strategyName}`);
    } else if (req.hostname === 'reportingroom.net' || req.hostname.includes('reportingroom.net')) {
      // Handle custom domain with dedicated strategy
      strategyName = 'replitauth:reportingroom.net';
      console.log(`Using CUSTOM DOMAIN strategy=${strategyName} for reportingroom.net`);
    } else {
      // Get the configured domain or fallback to hostname
      const domains = process.env.REPLIT_DOMAINS!.split(",");
      const targetDomain = domains.find(domain => 
        req.hostname.includes(domain) || domain.includes(req.hostname)
      ) || domains[0];
      strategyName = `replitauth:${targetDomain}`;
      console.log(`Using PRODUCTION strategy=${strategyName}`);
    }
    
    try {
      passport.authenticate(strategyName, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    } catch (error) {
      console.error(`CRITICAL LOGIN ERROR for ${req.hostname}:`, error);
      res.status(500).json({ error: "Authentication failed", details: error.message });
    }
  });

  app.get("/api/callback", (req, res, next) => {
    let strategyName;
    
    console.log(`Callback attempt: hostname=${req.hostname}, headers=${JSON.stringify(req.headers.host)}`);
    console.log(`Query params:`, req.query);
    
    if (req.hostname === 'localhost') {
      strategyName = 'replitauth:localhost:5000';
      console.log(`Using LOCAL callback strategy=${strategyName}`);
    } else if (req.hostname === 'reportingroom.net' || req.hostname.includes('reportingroom.net')) {
      // Handle custom domain with dedicated strategy
      strategyName = 'replitauth:reportingroom.net';
      console.log(`Using CUSTOM DOMAIN callback strategy=${strategyName} for reportingroom.net`);
    } else {
      // Get the configured domain or fallback to hostname
      const domains = process.env.REPLIT_DOMAINS!.split(",");
      const targetDomain = domains.find(domain => 
        req.hostname.includes(domain) || domain.includes(req.hostname)
      ) || domains[0];
      strategyName = `replitauth:${targetDomain}`;
      console.log(`Using PRODUCTION callback strategy=${strategyName}`);
    }
    
    try {
      passport.authenticate(strategyName, {
        successReturnToOrRedirect: "/",
        failureRedirect: "/api/login",
        failureFlash: false,
      })(req, res, (err) => {
        if (err) {
          console.error(`CRITICAL CALLBACK ERROR for ${req.hostname}:`, err);
          return res.status(500).json({ error: "Callback authentication failed", details: err.message });
        }
        next();
      });
    } catch (error) {
      console.error(`CRITICAL CALLBACK ERROR for ${req.hostname}:`, error);
      res.status(500).json({ error: "Callback failed", details: error.message });
    }
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
  
    console.log('Authentication setup completed successfully');
  } catch (error) {
    console.error('Failed to setup authentication:', error);
    throw error;
  }
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};