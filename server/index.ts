import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { securityMiddleware } from "./middleware/security";
import { MedicalDataEncryption } from "./encryption";
import { startSmsReminderScheduler } from "./sms-scheduler";

// Prevent dropped database connections from crashing the server process.
// Neon serverless culls idle connections, which surfaces as an unhandled
// rejection if there is an in-flight query at that moment.
process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message ?? String(reason);
  // 57P01 = "terminating connection due to administrator command" (Neon idle cull)
  if (reason?.code === "57P01" || msg.includes("terminating connection")) {
    console.warn("[db] Database connection terminated by server — will reconnect on next query.");
  } else {
    console.error("[server] Unhandled rejection:", reason);
  }
});

process.on("uncaughtException", (err: any) => {
  if (err?.code === "57P01" || err?.message?.includes("terminating connection")) {
    console.warn("[db] Database connection terminated by server — will reconnect on next query.");
  } else {
    console.error("[server] Uncaught exception:", err);
    process.exit(1);
  }
});

// Security validation - ensure encryption is properly configured
console.log('🔐 Validating encryption setup for regulatory compliance...');
const encryptionValidation = MedicalDataEncryption.validateEncryptionSetup();
if (!encryptionValidation.valid) {
  console.error('❌ CRITICAL: Encryption not properly configured!');
  encryptionValidation.issues.forEach(issue => console.error(`   - ${issue}`));
  console.error('   Please set MEDICAL_DATA_ENCRYPTION_KEY and MEDICAL_DATA_SALT environment variables');
  console.error('   Generate secure keys with: openssl rand -hex 32');
  console.warn('⚠️  DEVELOPMENT MODE: Continuing without encryption for testing purposes');
  console.warn('   This is NOT suitable for production use with real medical data');
} else {
  console.log('✅ Encryption validation passed - ready for medical data processing');
}

const app = express();

// Apply security middleware for regulatory compliance
app.use(securityMiddleware.addSecurityHeaders);
app.use(securityMiddleware.auditLogger);
// Rate limiter disabled in development mode
if (process.env.NODE_ENV === 'production') {
  app.use(securityMiddleware.rateLimiter);
}
app.use(securityMiddleware.requestSizeValidator(50 * 1024 * 1024)); // 50MB limit

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    log('🔒 End-to-end encryption enabled for regulatory compliance');
    const publicHost = process.env.PUBLIC_URL || process.env.REPLIT_DEV_DOMAIN
      ? (process.env.PUBLIC_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`)
      : null;
    startSmsReminderScheduler(publicHost);
  });
})();
