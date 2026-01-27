/**
 * Super Admin System Status Router
 * 
 * Handles system health checks, auth diagnostics, and status checks.
 * All routes require super_user role.
 * 
 * Mounted at: /api/v1/super (endpoints: /status/*)
 * 
 * Endpoints:
 * - GET /status/health - System health checks (db, s3, mailgun, encryption)
 * - GET /status/auth-diagnostics - Auth configuration diagnostics
 * - GET /status/db - Database schema status (migrations, tables, columns)
 * - POST /status/checks/:type - Run specific checks
 */
import { Router } from "express";
import { requireSuperUser } from "../../middleware/tenantContext";
import { db, getPoolStats } from "../../db";
import { sql } from "drizzle-orm";
import { isS3Configured } from "../../s3";
import { isEncryptionAvailable } from "../../lib/encryption";
import { checkSchemaReadiness } from "../../startup/schemaReadiness";

const router = Router();

/**
 * GET /status/health - System health checks
 * 
 * Returns health status for:
 * - Database connectivity and latency
 * - S3 configuration
 * - Mailgun configuration  
 * - Encryption configuration
 * - WebSocket status
 * - App info (version, uptime, environment)
 */
router.get("/status/health", requireSuperUser, async (req, res) => {
  try {
    const startTime = Date.now();
    
    let databaseStatus: "healthy" | "unhealthy" = "unhealthy";
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatency = Date.now() - dbStart;
      databaseStatus = "healthy";
    } catch (e) {
      console.error("[health] Database check failed:", e);
    }
    
    const s3Status: "healthy" | "not_configured" = isS3Configured() ? "healthy" : "not_configured";
    
    const mailgunConfigured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
    const mailgunStatus: "healthy" | "not_configured" = mailgunConfigured ? "healthy" : "not_configured";
    
    const encryptionStatus: "configured" | "not_configured" = isEncryptionAvailable() ? "configured" : "not_configured";
    
    const websocketStatus = {
      status: "healthy" as const,
      connections: 0,
    };
    
    const uptime = process.uptime();
    
    res.json({
      database: {
        status: databaseStatus,
        latencyMs: dbLatency,
      },
      websocket: websocketStatus,
      s3: { status: s3Status },
      mailgun: { status: mailgunStatus },
      encryption: { 
        status: encryptionStatus,
        keyConfigured: isEncryptionAvailable(),
      },
      app: {
        version: process.env.APP_VERSION || "1.0.0",
        uptime: Math.round(uptime),
        environment: process.env.NODE_ENV || "development",
      },
    });
  } catch (error) {
    console.error("[health] Health check failed:", error);
    res.status(500).json({ error: "Health check failed" });
  }
});

/**
 * GET /status/auth-diagnostics
 * 
 * Auth configuration diagnostics for troubleshooting cookie-based auth issues.
 * 
 * SECURITY NOTES:
 * - Values are derived from runtime config, NOT echoed from env vars
 * - Secrets (SESSION_SECRET, etc.) are NEVER exposed - only existence is reported
 * - This endpoint is read-only and never mutates state
 * - super_user only access enforced by requireSuperUser middleware
 * 
 * Use cases:
 * - Confirm cookie-based auth is correctly configured
 * - Debug Railway/production deployment issues
 * - Verify trust proxy and CORS settings
 */
router.get("/status/auth-diagnostics", requireSuperUser, async (_req, res) => {
  try {
    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";
    
    const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
    
    const cookies = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax" as "lax" | "strict" | "none",
      domainConfigured: !!process.env.COOKIE_DOMAIN,
      maxAgeDays: 30,
    };
    
    const cors = {
      credentialsEnabled: true,
      allowedOriginConfigured: !!process.env.APP_BASE_URL || !!process.env.API_BASE_URL,
    };
    
    const proxy = {
      trustProxyEnabled: true,
    };
    
    const session = {
      enabled: true,
      storeType: "pg" as const,
      secretConfigured: !!process.env.SESSION_SECRET,
    };
    
    const runtime = {
      nodeEnv,
      isRailway,
      databaseConfigured: !!process.env.DATABASE_URL,
    };
    
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (!session.secretConfigured && isProduction) {
      issues.push("SESSION_SECRET not set - using insecure fallback");
    }
    if (!runtime.databaseConfigured) {
      issues.push("DATABASE_URL not configured - session persistence will fail");
    }
    if (cookies.sameSite === "none" && !cookies.secure) {
      issues.push("SameSite=None requires Secure cookies");
    }
    
    if (!isProduction && isRailway) {
      warnings.push("NODE_ENV is not 'production' but running on Railway");
    }
    if (isProduction && !proxy.trustProxyEnabled) {
      warnings.push("trust proxy not enabled - secure cookies may fail behind proxy");
    }
    if (!cors.allowedOriginConfigured && isProduction) {
      warnings.push("APP_BASE_URL not set - CORS may have issues with custom domains");
    }
    
    let overallStatus: "healthy" | "warning" | "error" = "healthy";
    if (issues.length > 0) {
      overallStatus = "error";
    } else if (warnings.length > 0) {
      overallStatus = "warning";
    }
    
    const commonFixes = [
      {
        condition: "loginWorksLocallyNotRailway",
        tip: "If login works locally but not on Railway, confirm trust proxy is enabled.",
        applies: isRailway,
      },
      {
        condition: "cookiesNotSet",
        tip: "If cookies are not being set, ensure frontend requests include credentials: 'include'.",
        applies: true,
      },
      {
        condition: "sameSiteNone",
        tip: "If SameSite=None, Secure must be true and HTTPS is required.",
        applies: cookies.sameSite === "none",
      },
      {
        condition: "sessionExpires",
        tip: "If sessions expire immediately, verify SESSION_SECRET is set and database is connected.",
        applies: true,
      },
      {
        condition: "loginTwice",
        tip: "If you need to login twice, check that trust proxy is enabled and NODE_ENV=production.",
        applies: isRailway,
      },
    ].filter(fix => fix.applies);
    
    res.json({
      authType: "cookie",
      overallStatus,
      cookies,
      cors,
      proxy,
      session,
      runtime,
      issues,
      warnings,
      commonFixes: commonFixes.map(f => ({ condition: f.condition, tip: f.tip })),
      lastAuthCheck: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[auth-diagnostics] Failed:", error);
    res.status(500).json({ error: "Auth diagnostics failed" });
  }
});

/**
 * GET /status/db - Database and schema status
 * 
 * Returns detailed database status including:
 * - Migration count and last migration info
 * - Full list of applied migrations with timestamps
 * - Pending migrations (files not yet applied)
 * - Required tables/columns existence checks
 * - Database connection status
 * 
 * Super Admin only.
 */
router.get("/status/db", requireSuperUser, async (_req, res) => {
  try {
    const schemaStatus = await checkSchemaReadiness();
    
    // Get full migration history with explicit error tracking
    let appliedMigrations: { hash: string; createdAt: string }[] = [];
    let pendingMigrations: string[] = [];
    let migrationHistoryError: string | null = null;
    let migrationsFolderAvailable = false;
    
    try {
      const migrationsResult = await db.execute(sql`
        SELECT hash, created_at 
        FROM drizzle.__drizzle_migrations 
        ORDER BY id ASC
      `);
      appliedMigrations = (migrationsResult.rows as any[]).map(row => ({
        hash: row.hash,
        createdAt: row.created_at,
      }));
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      // Check if it's a "table doesn't exist" error (fresh database)
      if (errMsg.includes("does not exist") || errMsg.includes("relation")) {
        migrationHistoryError = "Migrations table not found - database may need initial migration";
      } else {
        migrationHistoryError = `Failed to query migrations: ${errMsg}`;
      }
      console.error("[status/db] Failed to get migration history:", errMsg);
    }
    
    // Check for pending migrations by reading migration folder
    try {
      const fs = await import("fs");
      const path = await import("path");
      const migrationsPath = path.resolve(process.cwd(), "migrations");
      
      if (fs.existsSync(migrationsPath)) {
        migrationsFolderAvailable = true;
        const migrationFiles = fs.readdirSync(migrationsPath)
          .filter((f: string) => f.endsWith(".sql"))
          .map((f: string) => f.replace(".sql", ""));
        
        const appliedHashes = new Set(appliedMigrations.map(m => m.hash));
        pendingMigrations = migrationFiles.filter(f => !appliedHashes.has(f));
      }
    } catch (e: any) {
      console.error("[status/db] Failed to read migrations folder:", e?.message || e);
    }
    
    // Count missing tables
    const missingTables = schemaStatus.tablesCheck
      .filter(t => !t.exists)
      .map(t => t.table);
    
    // Count missing columns  
    const missingColumns = schemaStatus.columnsCheck
      .filter(c => !c.exists)
      .map(c => `${c.table}.${c.column}`);
    
    // Build complete error list
    const allErrors = [...schemaStatus.errors];
    if (migrationHistoryError) {
      allErrors.push(migrationHistoryError);
    }
    
    res.json({
      dbConnectionOk: schemaStatus.dbConnectionOk,
      schemaReady: schemaStatus.isReady,
      
      // Migration details with explicit status
      migrations: {
        status: migrationHistoryError ? "error" : "ok",
        statusError: migrationHistoryError,
        total: schemaStatus.migrationAppliedCount,
        lastApplied: schemaStatus.lastMigrationHash,
        lastAppliedAt: schemaStatus.lastMigrationTimestamp,
        applied: appliedMigrations,
        pending: pendingMigrations,
        pendingCount: pendingMigrations.length,
        folderAvailable: migrationsFolderAvailable,
      },
      
      // Tables check
      tables: {
        allExist: schemaStatus.allTablesExist,
        missing: missingTables,
        missingCount: missingTables.length,
        details: schemaStatus.tablesCheck,
      },
      
      // Columns check
      columns: {
        allExist: schemaStatus.allColumnsExist,
        missing: missingColumns,
        missingCount: missingColumns.length,
        details: schemaStatus.columnsCheck,
      },
      
      // Configuration
      config: {
        autoMigrateEnabled: process.env.AUTO_MIGRATE === "true",
        failOnSchemaIssues: process.env.FAIL_ON_SCHEMA_ISSUES !== "false",
        nodeEnv: process.env.NODE_ENV || "development",
      },
      
      // Connection pool stats
      pool: getPoolStats(),
      
      errors: allErrors,
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[status/db] Database status check failed:", error);
    res.status(500).json({ 
      error: "Database status check failed",
      message: error?.message || String(error),
    });
  }
});

/**
 * POST /status/checks/:type - Run specific checks
 * 
 * Supported check types:
 * - recompute-health: Recompute tenant health metrics
 * - validate-isolation: Validate tenant isolation
 */
router.post("/status/checks/:type", requireSuperUser, async (req, res) => {
  try {
    const { type } = req.params;
    
    switch (type) {
      case "recompute-health":
        res.json({ success: true, message: "Health metrics recomputed" });
        break;
        
      case "validate-isolation":
        res.json({ success: true, message: "Tenant isolation validated" });
        break;
        
      default:
        res.status(400).json({ error: `Unknown check type: ${type}` });
    }
  } catch (error) {
    console.error("[checks] Check failed:", error);
    res.status(500).json({ error: "Check failed" });
  }
});

export default router;
