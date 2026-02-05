import "dotenv/config";
// Import config early to validate env vars before anything else runs
import { config, logConfigStatus } from "./config";
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
import { requestLogger } from "./middleware/requestLogger";
import { logMigrationStatus } from "./scripts/migration-status";
import { ensureSchemaReady, getLastSchemaCheck } from "./startup/schemaReadiness";
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

// ============================================================================
// CRITICAL: Health check endpoints MUST be registered BEFORE all middleware
// to ensure immediate responses during startup for deployment health checks
// ============================================================================

// Track application readiness for health checks (must be before health endpoints)
let appReady = false;
let startupError: Error | null = null;

// Root endpoint - CRITICAL: Return 200 immediately WITHOUT any checks
// Cloud Run health checks have very strict timeouts (4s default) - must respond instantly
app.head("/", (_req, res) => {
  // Simplest possible response - no body, no checks, just 200
  res.status(200).end();
});

app.get("/", (req, res, next) => {
  // Check if it's a health check vs browser request FIRST
  const acceptHeader = req.headers.accept || "";
  const userAgent = req.headers["user-agent"] || "";
  
  const isBrowser = acceptHeader.includes("text/html") && 
                    (userAgent.includes("Mozilla") || userAgent.includes("Chrome") || userAgent.includes("Safari"));
  
  // For health checks (non-browser), return 200 immediately - don't wait for app readiness
  if (!isBrowser) {
    return res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  }
  
  // For browser requests, let it fall through to static file serving for the React app
  next();
});

// Main health endpoint - always responds 200 for load balancer health checks
// IMPORTANT: Always returns 200 to pass Cloud Run/Railway health checks during startup
app.get("/health", (_req, res) => {
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
    response.error = startupError.message;
  } else if (!appReady) {
    response.reason = "starting";
  }
  
  res.status(200).json(response);
});

// Backwards-compatible /api/health alias
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
    response.error = startupError.message;
  } else if (!appReady) {
    response.reason = "starting";
  }
  
  res.status(200).json(response);
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

// ============================================================================
// Now register middleware after health checks
// ============================================================================

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

// Request logging middleware (after auth and tenant context for user/tenant info)
app.use(requestLogger);

// Setup agreement enforcement (must be after tenant context)
app.use(agreementEnforcementGuard);

// API JSON response guard - ensures all /api routes return JSON, never HTML
app.use(apiJsonResponseGuard);

import { log } from "./lib/log";
export { log };

// Database health endpoint - public, no auth required
// Returns database connectivity, latency, pool stats, and migration count
app.get("/api/v1/system/health/db", async (_req, res) => {
  try {
    const { checkDbHealth, getPoolStats } = await import("./db");
    const dbHealth = await checkDbHealth();
    
    let migrationCount = 0;
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`SELECT COUNT(*)::int as count FROM drizzle.__drizzle_migrations`
      );
      migrationCount = (result.rows[0] as any)?.count || 0;
    } catch {
      // Migrations table may not exist yet
    }
    
    res.json({
      connected: dbHealth.connected,
      latency: dbHealth.latencyMs,
      pool: dbHealth.pool,
      migrations: {
        applied: migrationCount,
      },
      timestamp: new Date().toISOString(),
      ...(dbHealth.error && { error: dbHealth.error }),
    });
  } catch (error: any) {
    console.error("[health/db] Health check failed:", error);
    res.status(500).json({
      connected: false,
      latency: 0,
      pool: { total: 0, active: 0, idle: 0, waiting: 0 },
      migrations: { applied: 0 },
      timestamp: new Date().toISOString(),
      error: error?.message || "Health check failed",
    });
  }
});

// Features endpoint - public, no auth required
// Returns feature availability based on database schema presence
app.get("/api/v1/system/features", async (_req, res) => {
  try {
    const { getFeatureFlags, getRecommendations } = await import("./lib/features");
    const features = await getFeatureFlags(true);
    const recommendations = getRecommendations(features);

    res.json({
      features,
      recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[features] Feature check failed:", error);
    res.status(500).json({
      features: {},
      recommendations: ["Unable to check feature status - database may be unavailable"],
      timestamp: new Date().toISOString(),
      error: error?.message || "Feature check failed",
    });
  }
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

// Startup state tracking for health checks and /ready endpoint
// Note: appReady and startupError are declared at the top of the file before health endpoints
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

// Enhanced /ready endpoint with phase tracking and schema status
// Returns 200 only if app is fully ready (DB reachable + migrations ok)
// Returns 503 if not ready - use /health for basic liveness check
app.get("/ready", async (_req, res) => {
  const now = Date.now();
  const totalDuration = now - serverStartTime;
  const phaseDuration = now - startupPhaseStart;
  const uptime = process.uptime();
  
  // Check database health if app is supposedly ready
  let dbHealthy = false;
  let dbError: string | undefined;
  if (appReady) {
    try {
      const { checkDbHealth } = await import("./db");
      const dbStatus = await checkDbHealth();
      dbHealthy = dbStatus.connected;
      if (!dbStatus.connected) {
        dbError = dbStatus.error;
      }
    } catch (err: any) {
      dbError = err?.message || String(err);
    }
  }
  
  // App is truly ready only if:
  // 1. Startup completed successfully
  // 2. No startup errors
  // 3. Database is reachable
  const schemaCheck = getLastSchemaCheck();
  const schemaReady = schemaCheck?.isReady ?? false;
  const isFullyReady = appReady && !startupError && dbHealthy && schemaReady;
  
  const response: Record<string, any> = {
    status: startupError ? "error" : isFullyReady ? "ready" : appReady ? "degraded" : "starting",
    phase: startupPhase,
    uptime: Math.round(uptime),
    startupDuration: appReady ? totalDuration : null,
    phaseDurationMs: phaseDuration,
    totalDurationMs: totalDuration,
    phaseTimings,
    checks: {
      startup: appReady,
      database: dbHealthy,
      schema: schemaReady,
    },
  };
  
  if (startupError) {
    response.lastError = startupError.message;
  }
  
  if (dbError) {
    response.dbError = dbError;
  }
  
  // Include schema status if available (after schema phase completes)
  if (schemaCheck) {
    const missingTables = schemaCheck.tablesCheck.filter(t => !t.exists).map(t => t.table);
    const presentTables = schemaCheck.tablesCheck.filter(t => t.exists).map(t => t.table);
    
    response.migrations = {
      applied: schemaCheck.migrationAppliedCount,
      lastApplied: schemaCheck.lastMigrationHash,
    };
    
    response.requiredTables = {
      present: presentTables,
      missing: missingTables,
      allPresent: missingTables.length === 0,
    };
    
    response.schemaReady = schemaCheck.isReady;
  }
  
  // Return 200 only if fully ready, 503 otherwise
  // This allows Railway/Replit to use /ready as readiness probe
  res.status(isFullyReady ? 200 : 503).json(response);
});

// Start the server IMMEDIATELY so health checks pass
// Bind to 0.0.0.0 explicitly for Replit Autoscale deployment
const port = parseInt(process.env.PORT || "5000", 10);
const host = "0.0.0.0";
const PHASE_TIMEOUT_MS = 2000; // Warn if any phase takes >2 seconds (Cloud Run default health check timeout is 4s)

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
  
  // ============================================================================
  // CRITICAL PATH: Only essential startup tasks that MUST complete before ready
  // ============================================================================
  
  // Phase 2: Schema readiness check - runs migrations if AUTO_MIGRATE=true
  try {
    await runPhase("schema", "2/4", async () => {
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
  
  // Phase 3: Register routes (CRITICAL - must complete before ready)
  try {
    await runPhase("routes", "3/4", async () => {
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

  // Phase 4: Mark app as READY immediately after routes are registered
  // This ensures health checks pass quickly - diagnostics run in background
  setPhase("ready");
  appReady = true;
  const totalDuration = Date.now() - serverStartTime;
  console.log(`[startup] Phase 4/4: App READY in ${totalDuration}ms`);
  log(`[boot] Application ready - running background diagnostics...`);
  
  // ============================================================================
  // BACKGROUND TASKS: Run AFTER app is marked ready (non-blocking)
  // ============================================================================
  
  // Run background diagnostics without blocking the app
  setImmediate(async () => {
    try {
      // Log app version and configuration
      logAppInfo();
      
      // Migration status logging
      console.log("[background] Starting diagnostic tasks...");
      await logMigrationStatus();
      
      // Run production parity check (logs issues but doesn't crash)
      if (process.env.SKIP_PARITY_CHECK !== "true" && process.env.NODE_ENV !== "production") {
        await runProductionParityCheck();
      } else if (process.env.NODE_ENV === "production") {
        console.log("[Production Parity] Skipped in production for faster startup");
      }
      
      // Check for NULL tenantId values (logs warnings, doesn't crash)
      await logNullTenantIdWarnings();
      
      // Bootstrap admin user if not exists (for production first run)
      try {
        await bootstrapAdminUser();
      } catch (bootstrapErr) {
        console.error("[background] Bootstrap failed:", bootstrapErr instanceof Error ? bootstrapErr.message : bootstrapErr);
        // Don't set startup error - app is already ready
      }
      
      console.log("[background] Diagnostic tasks completed");
    } catch (bgErr) {
      console.error("[background] Error in background tasks:", bgErr);
      // Don't fail - these are non-critical
    }
  });
})().catch((err) => {
  setPhase("error");
  console.error("[boot] Unhandled startup error:", err);
  startupError = err instanceof Error ? err : new Error(String(err));
});
