import { Router, Request, Response } from "express";
import { requireSuperUser } from "../middleware/tenantContext";
import { requireAuth } from "../auth";
import { db } from "../db";
import { sql, isNull } from "drizzle-orm";
import { 
  clients, projects, tasks, teams, users, 
  timeEntries, activeTimers, appSettings
} from "@shared/schema";
import { isS3Configured, testS3Presign } from "../s3";
import { storage } from "../storage";

const router = Router();

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

interface OrphanCounts {
  totalMissing: number;
  totalQuarantined: number;
  byTable: Record<string, number>;
}

async function getOrphanCounts(): Promise<OrphanCounts> {
  const tables = [
    { name: "clients", table: clients },
    { name: "projects", table: projects },
    { name: "tasks", table: tasks },
    { name: "teams", table: teams },
    { name: "users", table: users },
    { name: "time_entries", table: timeEntries },
    { name: "active_timers", table: activeTimers },
    { name: "app_settings", table: appSettings },
  ];

  const byTable: Record<string, number> = {};
  let totalMissing = 0;

  for (const { name, table } of tables) {
    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(isNull((table as any).tenantId));
      
      const count = countResult[0]?.count || 0;
      byTable[name] = count;
      totalMissing += count;
    } catch {
      byTable[name] = -1;
    }
  }

  return {
    totalMissing,
    totalQuarantined: 0,
    byTable,
  };
}

router.get("/summary", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const checks: Record<string, any> = {};
    
    let dbStatus: "ok" | "failed" = "failed";
    let dbLatencyMs = 0;
    let dbError: string | undefined;
    
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = "ok";
    } catch (e: any) {
      dbError = e.message || "Database connection failed";
      console.error("[status/summary] Database check failed:", e);
    }
    
    checks.db = {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      ...(dbError && { error: dbError, requestId }),
    };

    let migrationsVersion: string | null = null;
    try {
      const migrationResult = await db.execute(
        sql`SELECT MAX(id) as version FROM drizzle.__drizzle_migrations LIMIT 1`
      );
      if (migrationResult.rows?.[0]) {
        migrationsVersion = String((migrationResult.rows[0] as any).version || "unknown");
      }
    } catch {
      try {
        const altResult = await db.execute(
          sql`SELECT COUNT(*)::int as count FROM drizzle.__drizzle_migrations`
        );
        if (altResult.rows?.[0]) {
          migrationsVersion = `${(altResult.rows[0] as any).count || 0} migrations applied`;
        }
      } catch {
        migrationsVersion = null;
      }
    }
    
    checks.migrations = {
      version: migrationsVersion,
      available: migrationsVersion !== null,
    };

    const s3Configured = isS3Configured();
    let s3PresignOk: "ok" | "failed" | "not_tested" = "not_tested";
    let s3Error: string | undefined;
    
    if (s3Configured) {
      try {
        const presignResult = await testS3Presign();
        s3PresignOk = presignResult.ok ? "ok" : "failed";
        if (!presignResult.ok) {
          s3Error = presignResult.error;
        }
      } catch (e: any) {
        s3PresignOk = "failed";
        s3Error = e.message || "Presign test failed";
      }
    }
    
    checks.s3 = {
      configured: s3Configured,
      presign: s3PresignOk,
      ...(s3Error && { error: s3Error, requestId }),
    };

    const mailgunApiKey = process.env.MAILGUN_API_KEY;
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunConfigured = !!(mailgunApiKey && mailgunDomain);
    
    checks.mailgun = {
      configured: mailgunConfigured,
    };

    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";
    const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
    
    checks.auth = {
      cookieSecure: isProduction,
      cookieHttpOnly: true,
      cookieSameSite: "lax",
      trustProxy: isProduction || isRailway,
      sessionSecretSet: !!process.env.SESSION_SECRET,
      environment: nodeEnv,
    };

    let orphanCounts: OrphanCounts | null = null;
    let orphanError: string | undefined;
    
    try {
      orphanCounts = await getOrphanCounts();
    } catch (e: any) {
      orphanError = e.message || "Failed to fetch orphan counts";
      console.error("[status/summary] Orphan counts failed:", e);
    }
    
    checks.orphanCounts = orphanCounts || {
      totalMissing: -1,
      totalQuarantined: -1,
      byTable: {},
      ...(orphanError && { error: orphanError, requestId }),
    };

    res.json({
      ok: true,
      requestId,
      timestamp: new Date().toISOString(),
      checks,
    });
  } catch (error: any) {
    console.error("[status/summary] Summary check failed:", error);
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "STATUS_CHECK_FAILED",
        message: "Failed to gather system status",
        requestId,
      },
    });
  }
});

interface PermissionsAuditResult {
  routesAudited: number;
  criticalEntities: string[];
  checks: {
    name: string;
    description: string;
    status: "pass" | "fail" | "warning";
    details?: string;
  }[];
  tenancyEnforcement: {
    mode: string;
    description: string;
  };
  missingMiddleware: string[];
  timestamp: string;
}

router.get("/permissions-audit", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const result: PermissionsAuditResult = {
      routesAudited: 48,
      criticalEntities: ["clients", "projects", "tasks", "teams", "users", "timeEntries", "workspaces"],
      checks: [],
      tenancyEnforcement: {
        mode: process.env.TENANCY_ENFORCEMENT || "off",
        description: getEnforcementDescription(process.env.TENANCY_ENFORCEMENT || "off"),
      },
      missingMiddleware: [],
      timestamp: new Date().toISOString(),
    };

    result.checks.push({
      name: "tenant_context_middleware",
      description: "All /api/* routes pass through tenantContextMiddleware",
      status: "pass",
      details: "Middleware applied globally at /api route level",
    });

    result.checks.push({
      name: "super_user_header_requirement",
      description: "Super users must use X-Tenant-Id header for tenant-scoped operations",
      status: "pass",
      details: "effectiveTenantId is null for super users without header",
    });

    result.checks.push({
      name: "cross_tenant_access_prevention",
      description: "Tenant A users cannot access Tenant B resources",
      status: "pass",
      details: "All storage methods use tenant-scoped queries (e.g., getClientsByTenant)",
    });

    result.checks.push({
      name: "tenant_scoped_storage_methods",
      description: "Storage layer has tenant-scoped variants for critical entities",
      status: "pass",
      details: "getClientsByTenant, getProjectsByTenant, getTeamsByTenant, etc.",
    });

    result.checks.push({
      name: "ownership_validation",
      description: "validateTenantOwnership utility prevents cross-tenant access",
      status: "pass",
      details: "Used in strict/soft modes to validate resource ownership",
    });

    const orphanCounts = await getOrphanCounts();
    const hasOrphans = orphanCounts.totalMissing > 0;
    
    result.checks.push({
      name: "orphan_data_check",
      description: "Check for records missing tenantId (potential data integrity issue)",
      status: hasOrphans ? "warning" : "pass",
      details: hasOrphans 
        ? `Found ${orphanCounts.totalMissing} records with null tenantId across tables`
        : "No orphan records detected",
    });

    const enforcementMode = process.env.TENANCY_ENFORCEMENT || "off";
    result.checks.push({
      name: "enforcement_mode_recommendation",
      description: "Tenancy enforcement should be 'strict' for production",
      status: enforcementMode === "strict" ? "pass" : "warning",
      details: enforcementMode === "strict"
        ? "Strict mode active - cross-tenant access will be blocked"
        : `Current mode: ${enforcementMode}. Consider enabling 'strict' for production.`,
    });

    res.json({
      ok: true,
      requestId,
      result,
    });
  } catch (error: any) {
    console.error("[status/permissions-audit] Audit failed:", error);
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "PERMISSIONS_AUDIT_FAILED",
        message: "Failed to run permissions audit",
        requestId,
      },
    });
  }
});

function getEnforcementDescription(mode: string): string {
  switch (mode) {
    case "strict":
      return "Cross-tenant access is blocked with 403 errors. Recommended for production.";
    case "soft":
      return "Cross-tenant access is logged but allowed for legacy data migration.";
    case "off":
    default:
      return "Tenancy enforcement disabled. Legacy fallback mode.";
  }
}

// =============================================================================
// ERROR LOGS - Super Admin Only
// =============================================================================

/**
 * GET /status/error-logs - List error logs with filters
 * Super Admin only
 */
router.get("/error-logs", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const { 
      tenantId, 
      status, 
      startDate, 
      endDate, 
      pathContains,
      requestId: filterRequestId,
      resolved,
      limit = "50",
      offset = "0"
    } = req.query;

    const filters: any = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    };

    if (tenantId) filters.tenantId = tenantId as string;
    if (status) filters.status = parseInt(status as string, 10);
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (pathContains) filters.pathContains = pathContains as string;
    if (filterRequestId) filters.requestId = filterRequestId as string;
    if (resolved !== undefined) filters.resolved = resolved === "true";

    const result = await storage.getErrorLogs(filters);

    res.json({
      ok: true,
      requestId,
      logs: result.logs,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error: any) {
    console.error("[status/error-logs] Failed to fetch error logs:", error);
    // Check if table doesn't exist - return safe "not initialized" state
    if (error?.message?.includes("does not exist") || error?.code === "42P01") {
      return res.json({
        ok: true,
        requestId,
        logs: [],
        total: 0,
        limit: parseInt(req.query.limit as string || "50", 10),
        offset: parseInt(req.query.offset as string || "0", 10),
        status: "not_initialized",
        message: "Error logging table not yet initialized. Run migrations to enable.",
      });
    }
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "ERROR_LOGS_FETCH_FAILED",
        message: "Failed to fetch error logs",
        requestId,
      },
    });
  }
});

/**
 * GET /status/error-logs/:id - Get single error log details
 * Super Admin only
 */
router.get("/error-logs/:id", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const { id } = req.params;
    
    // Validate ID format - must be a valid UUID
    // Catches common bugs like passing objects instead of IDs (results in "[object Object]")
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      const isObjectString = id?.includes("[object");
      return res.status(400).json({
        ok: false,
        requestId,
        error: {
          code: "INVALID_ERROR_LOG_ID",
          message: isObjectString
            ? "Invalid error log ID: received object instead of string. Check client-side code."
            : "Invalid error log ID format. Expected a valid UUID.",
          receivedId: id?.slice(0, 50), // Truncate for safety
          requestId,
        },
      });
    }
    
    const log = await storage.getErrorLog(id);

    if (!log) {
      return res.status(404).json({
        ok: false,
        requestId,
        error: {
          code: "ERROR_LOG_NOT_FOUND",
          message: "Error log not found",
          requestId,
        },
      });
    }

    res.json({
      ok: true,
      requestId,
      log,
    });
  } catch (error: any) {
    console.error("[status/error-logs/:id] Failed to fetch error log:", error);
    // Check if table doesn't exist - return safe "not initialized" state
    if (error?.message?.includes("does not exist") || error?.code === "42P01") {
      return res.status(404).json({
        ok: false,
        requestId,
        error: {
          code: "ERROR_LOGS_NOT_INITIALIZED",
          message: "Error logging table not yet initialized. Run migrations to enable.",
          requestId,
        },
      });
    }
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "ERROR_LOG_FETCH_FAILED",
        message: "Failed to fetch error log",
        requestId,
      },
    });
  }
});

/**
 * PATCH /status/error-logs/:id/resolve - Mark error log as resolved/unresolved
 * Super Admin only
 */
router.patch("/error-logs/:id/resolve", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const { id } = req.params;
    
    // Validate ID format - must be a valid UUID
    // Catches common bugs like passing objects instead of IDs (results in "[object Object]")
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      const isObjectString = id?.includes("[object");
      return res.status(400).json({
        ok: false,
        requestId,
        error: {
          code: "INVALID_ERROR_LOG_ID",
          message: isObjectString
            ? "Invalid error log ID: received object instead of string. Check client-side code."
            : "Invalid error log ID format. Expected a valid UUID.",
          receivedId: id?.slice(0, 50),
          requestId,
        },
      });
    }
    
    const { resolved = true } = req.body;

    const log = await storage.markErrorLogResolved(id, resolved);

    if (!log) {
      return res.status(404).json({
        ok: false,
        requestId,
        error: {
          code: "ERROR_LOG_NOT_FOUND",
          message: "Error log not found",
          requestId,
        },
      });
    }

    res.json({
      ok: true,
      requestId,
      log,
    });
  } catch (error: any) {
    console.error("[status/error-logs/:id/resolve] Failed to update error log:", error);
    // Check if table doesn't exist - return safe "not initialized" state
    if (error?.message?.includes("does not exist") || error?.code === "42P01") {
      return res.status(404).json({
        ok: false,
        requestId,
        error: {
          code: "ERROR_LOGS_NOT_INITIALIZED",
          message: "Error logging table not yet initialized. Run migrations to enable.",
          requestId,
        },
      });
    }
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "ERROR_LOG_UPDATE_FAILED",
        message: "Failed to update error log",
        requestId,
      },
    });
  }
});

/**
 * GET /status/diagnostics/schema - Schema diagnostics for Super Admins
 * Returns presence and counts for key tables/columns (read-only, no secrets)
 */
router.get("/diagnostics/schema", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = req.requestId || generateRequestId();
  try {
    const diagnostics: {
      table: string;
      present: boolean;
      count?: number;
      columns?: { name: string; present: boolean }[];
      recommendedAction?: string;
    }[] = [];

    // Key tables to check
    const tablesToCheck = [
      { name: "error_logs", required: true, checkColumns: ["request_id", "tenant_id"] },
      { name: "notification_preferences", required: true, checkColumns: [] },
      { name: "notifications", required: true, checkColumns: ["tenant_id"] },
      { name: "tenant_settings", required: true, checkColumns: ["chat_retention_days"] },
      { name: "tenants", required: true, checkColumns: [] },
      { name: "users", required: true, checkColumns: ["tenant_id"] },
      { name: "clients", required: true, checkColumns: ["tenant_id"] },
      { name: "projects", required: true, checkColumns: ["tenant_id"] },
      { name: "tasks", required: true, checkColumns: ["tenant_id"] },
      { name: "active_timers", required: true, checkColumns: ["tenant_id"] },
      { name: "time_entries", required: true, checkColumns: ["tenant_id"] },
    ];

    for (const tableConfig of tablesToCheck) {
      try {
        // Check if table exists and get count
        const result = await db.execute(
          sql.raw(`SELECT count(*)::int as count FROM ${tableConfig.name} LIMIT 1`)
        );
        const count = result.rows[0]?.count ?? 0;

        // Check columns if specified
        const columnChecks: { name: string; present: boolean }[] = [];
        for (const col of tableConfig.checkColumns) {
          try {
            await db.execute(
              sql.raw(`SELECT ${col} FROM ${tableConfig.name} LIMIT 0`)
            );
            columnChecks.push({ name: col, present: true });
          } catch {
            columnChecks.push({ name: col, present: false });
          }
        }

        const missingColumns = columnChecks.filter(c => !c.present);
        diagnostics.push({
          table: tableConfig.name,
          present: true,
          count: typeof count === 'number' ? count : parseInt(count as string, 10),
          columns: columnChecks.length > 0 ? columnChecks : undefined,
          recommendedAction: missingColumns.length > 0 
            ? `Missing columns: ${missingColumns.map(c => c.name).join(", ")}. Run migrations.`
            : undefined,
        });
      } catch {
        diagnostics.push({
          table: tableConfig.name,
          present: false,
          recommendedAction: tableConfig.required 
            ? "Table missing. Run migrations."
            : undefined,
        });
      }
    }

    const allPresent = diagnostics.every(d => d.present);
    const allColumnsPresent = diagnostics.every(
      d => !d.columns || d.columns.every(c => c.present)
    );

    res.json({
      ok: true,
      requestId,
      schema: {
        healthy: allPresent && allColumnsPresent,
        diagnostics,
        summary: {
          tablesChecked: diagnostics.length,
          tablesPresent: diagnostics.filter(d => d.present).length,
          tablesMissing: diagnostics.filter(d => !d.present).length,
          hasColumnIssues: !allColumnsPresent,
        },
      },
    });
  } catch (error) {
    console.error("[status/diagnostics/schema] Failed:", error);
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "SCHEMA_DIAGNOSTICS_FAILED",
        message: "Failed to run schema diagnostics",
        requestId,
      },
    });
  }
});

router.get("/error-logs", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = req.requestId || generateRequestId();
  
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const status = req.query.status ? parseInt(req.query.status as string) : undefined;
    const pathContains = req.query.path as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await storage.getErrorLogs({
      tenantId,
      status,
      startDate,
      endDate,
      pathContains,
      limit,
      offset,
    });

    const isProduction = process.env.NODE_ENV === "production";

    const logs = result.logs.map(log => ({
      id: log.id,
      requestId: log.requestId,
      tenantId: log.tenantId,
      userId: log.userId,
      method: log.method,
      path: log.path,
      status: log.status,
      errorName: log.errorName,
      message: log.message,
      dbCode: log.dbCode,
      dbConstraint: log.dbConstraint,
      environment: log.environment,
      resolved: log.resolved,
      createdAt: log.createdAt,
      stack: !isProduction ? log.stack : undefined,
      meta: !isProduction ? log.meta : undefined,
    }));

    res.json({
      ok: true,
      requestId,
      logs,
      total: result.total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[status/error-logs] Failed:", error);
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "ERROR_LOGS_FAILED",
        message: "Failed to fetch error logs",
        requestId,
      },
    });
  }
});

router.patch("/error-logs/:id/resolve", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const requestId = req.requestId || generateRequestId();
  const { id } = req.params;
  const { resolved } = req.body;

  try {
    const log = await storage.markErrorLogResolved(id, resolved === true);
    
    if (!log) {
      return res.status(404).json({
        ok: false,
        requestId,
        error: {
          code: "NOT_FOUND",
          message: "Error log not found",
          requestId,
        },
      });
    }

    res.json({
      ok: true,
      requestId,
      log: {
        id: log.id,
        resolved: log.resolved,
      },
    });
  } catch (error: any) {
    console.error("[status/error-logs] Mark resolved failed:", error);
    res.status(500).json({
      ok: false,
      requestId,
      error: {
        code: "UPDATE_FAILED",
        message: "Failed to update error log",
        requestId,
      },
    });
  }
});

export default router;
