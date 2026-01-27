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

// Health check endpoints for deployment platforms (Railway, Replit, etc.)
// These must respond immediately without database/auth dependencies
// Root endpoint for platforms that check / by default
app.get("/", (req, res, next) => {
  // If it's a health check (no Accept: text/html), return JSON
  const acceptHeader = req.headers.accept || "";
  if (!acceptHeader.includes("text/html")) {
    return res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  }
  // Otherwise, let it fall through to static file serving for the React app
  next();
});

// Main health endpoint - always responds 200 for load balancer health checks
// Returns readiness status in body for monitoring; use /api/v1/super/diagnostics/schema for full details
// IMPORTANT: Always returns 200 to pass Cloud Run/Railway health checks during startup
app.get("/health", (_req, res) => {
  const version = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) 
    || process.env.GIT_COMMIT_SHA?.slice(0, 7) 
    || "dev";
  
  // Base response - minimal for public endpoint
  const response: Record<string, any> = {
    ok: appReady && !startupError,
    timestamp: new Date().toISOString(),
    version,
    ready: appReady,
  };
  
  // If startup failed, report in body but still return 200 for health check
  if (startupError) {
    response.ok = false;
    response.ready = false;
    response.reason = "startup_failed";
  } else if (!appReady) {
    // If still starting up, report in body but return 200
    response.reason = "starting";
  }
  
  // Always return 200 to pass health checks during initialization
  res.status(200).json(response);
});

// Backwards-compatible /api/health alias - same behavior as /health
// IMPORTANT: Always returns 200 to pass Cloud Run/Railway health checks during startup
app.get("/api/health", (_req, res) => {
  const version = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) 
    || process.env.GIT_COMMIT_SHA?.slice(0, 7) 
    || "dev";
  
  const response: Record<string, any> = {
    ok: appReady && !startupError,
    timestamp: new Date().toISOString(),
    version,
    ready: appReady,
  };
  
  if (startupError) {
    response.ok = false;
    response.ready = false;
    response.reason = "startup_failed";
  } else if (!appReady) {
    response.reason = "starting";
  }
  
  // Always return 200 to pass health checks during initialization
  res.status(200).json(response);
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

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

// Track application readiness for health checks
// Startup state tracking for health checks and /ready endpoint
let appReady = false;
let startupError: Error | null = null;
let startupPhase: "starting" | "schema" | "migrating" | "bootstrapping" | "routes" | "ready" | "error" = "starting";
let startupPhaseStart = Date.now();
let serverStartTime = Date.now();

// Phase timing for diagnostics
interface PhaseTiming {
  phase: string;
  startedAt: string;
  durationMs: number;
}
const phaseTimings: PhaseTiming[] = [];

function setPhase(phase: typeof startupPhase) {
  const now = Date.now();
  const prevDuration = now - startupPhaseStart;
  
  // Log completion of previous phase
  if (startupPhase !== "starting" && startupPhase !== phase) {
    phaseTimings.push({
      phase: startupPhase,
      startedAt: new Date(startupPhaseStart).toISOString(),
      durationMs: prevDuration,
    });
  }
  
  startupPhase = phase;
  startupPhaseStart = now;
  console.log(`[startup] Phase: ${phase} started at ${new Date(now).toISOString()}`);
}

// Enhanced /ready endpoint with phase tracking
app.get("/ready", (_req, res) => {
  const now = Date.now();
  const totalDuration = now - serverStartTime;
  const phaseDuration = now - startupPhaseStart;
  
  const response: Record<string, any> = {
    status: startupError ? "error" : appReady ? "ready" : startupPhase,
    phase: startupPhase,
    phaseDurationMs: phaseDuration,
    totalDurationMs: totalDuration,
    phaseTimings,
  };
  
  if (startupError) {
    response.error = startupError.message;
  }
  
  // Always return 200 to pass health checks, status in body indicates readiness
  res.status(200).json(response);
});

// Start the server IMMEDIATELY so health checks pass
// Bind to 0.0.0.0 explicitly for Replit Autoscale deployment
const port = parseInt(process.env.PORT || "5000", 10);
const host = "0.0.0.0";
const PHASE_TIMEOUT_MS = 25000; // Warn if any phase takes >25 seconds

// Helper to run a phase with timing and timeout warning
async function runPhase<T>(
  phaseName: typeof startupPhase,
  phaseNumber: string,
  fn: () => Promise<T>
): Promise<T> {
  setPhase(phaseName);
  const phaseStart = Date.now();
  console.log(`[startup] Phase ${phaseNumber}: ${phaseName} started at ${new Date(phaseStart).toISOString()}`);
  
  // Set up timeout warning (doesn't cancel the operation)
  const timeoutId = setTimeout(() => {
    console.error(`[startup] ERROR: Phase ${phaseName} is taking longer than ${PHASE_TIMEOUT_MS}ms - may cause health check timeout`);
  }, PHASE_TIMEOUT_MS);
  
  try {
    const result = await fn();
    clearTimeout(timeoutId);
    const duration = Date.now() - phaseStart;
    console.log(`[startup] Phase ${phaseNumber}: ${phaseName} completed in ${duration}ms`);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    const duration = Date.now() - phaseStart;
    console.error(`[startup] Phase ${phaseNumber}: ${phaseName} FAILED after ${duration}ms`);
    throw err;
  }
}

httpServer.listen(port, host, () => {
  serverStartTime = Date.now();
  console.log(`[startup] Phase 1/6: Server listening started at ${new Date(serverStartTime).toISOString()}`);
  console.log(`[startup] Server listening on ${host}:${port}`);
});

// Run async initialization in the background
(async () => {
  // Boot logging for deployment verification
  const env = process.env.NODE_ENV || "development";
  const version = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) 
    || process.env.GIT_COMMIT_SHA?.slice(0, 7) 
    || "dev";
  console.log(`[boot] environment=${env} version=${version}`);
  
  // Phase 2: Schema readiness check - runs migrations if AUTO_MIGRATE=true
  try {
    await runPhase("schema", "2/6", async () => {
      await ensureSchemaReady();
    });
  } catch (schemaErr) {
    setPhase("error");
    console.error("[boot] FATAL: Schema readiness check failed");
    console.error("[boot]", schemaErr instanceof Error ? schemaErr.message : schemaErr);
    console.error("[boot] Application cannot start with incomplete schema.");
    console.error("[boot] Fix: Set AUTO_MIGRATE=true or run: npx drizzle-kit migrate");
    startupError = schemaErr instanceof Error ? schemaErr : new Error(String(schemaErr));
    // Don't exit - keep server running for health checks to report the error
    return;
  }
  
  // Log app version and configuration
  logAppInfo();
  
  // Phase 3: Migration status logging (already applied above, but provides visibility)
  await runPhase("migrating", "3/6", async () => {
    await logMigrationStatus();
    // Run production parity check (logs issues but doesn't crash)
    await runProductionParityCheck();
    // Check for NULL tenantId values (logs warnings, doesn't crash)
    await logNullTenantIdWarnings();
  });
  
  // Phase 4: Bootstrap admin user if not exists (for production first run)
  try {
    await runPhase("bootstrapping", "4/6", async () => {
      await bootstrapAdminUser();
    });
  } catch (bootstrapErr) {
    setPhase("error");
    console.error("[boot] Bootstrap failed:", bootstrapErr instanceof Error ? bootstrapErr.message : bootstrapErr);
    console.error("[boot] Fix: Check database permissions and user table schema");
    startupError = bootstrapErr instanceof Error ? bootstrapErr : new Error(String(bootstrapErr));
    return;
  }
  
  // Phase 5: Register routes
  try {
    await runPhase("routes", "5/6", async () => {
      await registerRoutes(httpServer, app);
      
      // API 404 handler - BEFORE error handlers to catch unmatched /api routes first
      app.use(apiNotFoundHandler);
      
      // Error logging middleware (captures 500+ errors to database)
      app.use(errorLoggingMiddleware);
      
      // Global error handler (uses standard error envelope)
      app.use(errorHandler);
      
      // Setup static serving or Vite dev server
      if (process.env.NODE_ENV === "production") {
        serveStatic(app);
      } else {
        const { setupVite } = await import("./vite");
        await setupVite(httpServer, app);
      }
    });
  } catch (routesErr) {
    setPhase("error");
    console.error("[boot] Routes registration failed:", routesErr instanceof Error ? routesErr.message : routesErr);
    startupError = routesErr instanceof Error ? routesErr : new Error(String(routesErr));
    return;
  }

  // Phase 6: Mark app as ready
  setPhase("ready");
  appReady = true;
  const totalDuration = Date.now() - serverStartTime;
  console.log(`[startup] Phase 6/6: App fully ready in ${totalDuration}ms`);
  log(`[boot] Application fully initialized and ready`);
})().catch((err) => {
  setPhase("error");
  console.error("[boot] Unhandled startup error:", err);
  startupError = err instanceof Error ? err : new Error(String(err));
});
