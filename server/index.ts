import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializeSocketIO } from "./realtime/socket";
import { setupAuth, setupBootstrapEndpoints, setupPlatformInviteEndpoints, setupTenantInviteEndpoints, setupPasswordResetEndpoints, setupGoogleAuth } from "./auth";
import { bootstrapAdminUser } from "./bootstrap";
import { runProductionParityCheck } from "./scripts/production-parity-check";
import { tenantContextMiddleware } from "./middleware/tenantContext";
import { agreementEnforcementGuard } from "./middleware/agreementEnforcement";
import { requestIdMiddleware } from "./middleware/requestId";
import { errorHandler } from "./middleware/errorHandler";
import { errorLoggingMiddleware } from "./middleware/errorLogging";
import { apiJsonResponseGuard, apiNotFoundHandler } from "./middleware/apiJsonGuard";
import { logMigrationStatus } from "./scripts/migration-status";
import { ensureSchemaReady } from "./startup/schemaReadiness";
import { logAppInfo } from "./startup/appInfo";
import { logNullTenantIdWarnings } from "./startup/tenantIdHealthCheck";

export const app = express();
const httpServer = createServer(app);

// Trust the reverse proxy (needed for secure cookies in production)
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Request ID middleware (must be first for error correlation)
app.use(requestIdMiddleware);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Setup authentication middleware (session + passport) - must be before Socket.IO
setupAuth(app);

// Initialize Socket.IO server for real-time updates (after auth for session access)
initializeSocketIO(httpServer);

// Setup bootstrap endpoints (first-user registration)
setupBootstrapEndpoints(app);

// Setup platform invite endpoints (for platform admin onboarding)
setupPlatformInviteEndpoints(app);

// Setup tenant invite endpoints (for tenant user onboarding - public, no auth required)
setupTenantInviteEndpoints(app);

// Setup password reset endpoints (public, no auth required)
setupPasswordResetEndpoints(app);

// Setup Google OAuth endpoints (must be after session middleware)
setupGoogleAuth(app);

// Setup tenant context middleware (must be after auth)
app.use(tenantContextMiddleware);

// Setup agreement enforcement (must be after tenant context)
app.use(agreementEnforcementGuard);

// API JSON response guard - ensures all /api routes return JSON, never HTML
app.use(apiJsonResponseGuard);

import { log } from "./lib/log";
export { log };

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

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Boot logging for deployment verification
  const env = process.env.NODE_ENV || "development";
  const version = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) 
    || process.env.GIT_COMMIT_SHA?.slice(0, 7) 
    || "dev";
  console.log(`[boot] environment=${env} version=${version}`);
  
  // Schema readiness check - runs migrations if AUTO_MIGRATE=true
  // Fails fast if schema is not ready (missing tables/columns)
  try {
    await ensureSchemaReady();
  } catch (schemaErr) {
    console.error("[boot] FATAL: Schema readiness check failed");
    console.error("[boot]", schemaErr instanceof Error ? schemaErr.message : schemaErr);
    console.error("[boot] Application cannot start with incomplete schema.");
    console.error("[boot] Set AUTO_MIGRATE=true or run: npx drizzle-kit migrate");
    process.exit(1);
  }
  
  // Log app version and configuration
  logAppInfo();
  
  // Log migration status at startup (already verified above, but provides visibility)
  await logMigrationStatus();
  
  // Run production parity check (logs issues but doesn't crash)
  await runProductionParityCheck();
  
  // Check for NULL tenantId values (logs warnings, doesn't crash)
  await logNullTenantIdWarnings();
  
  // Bootstrap admin user if not exists (for production first run)
  await bootstrapAdminUser();
  
  await registerRoutes(httpServer, app);

  // API 404 handler - BEFORE error handlers to catch unmatched /api routes first
  // This ensures /api routes that don't exist return JSON 404 instead of HTML
  app.use(apiNotFoundHandler);

  // Error logging middleware (captures 500+ errors to database)
  app.use(errorLoggingMiddleware);

  // Global error handler (uses standard error envelope)
  app.use(errorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, () => {
    log(`serving on port ${port}`);
  });
})();
