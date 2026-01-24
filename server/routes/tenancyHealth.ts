import { Router, Request, Response } from "express";
import { requireSuperUser } from "../middleware/tenantContext";
import { requireAuth } from "../auth";
import { getTenancyEnforcementMode } from "../middleware/tenancyEnforcement";
import { tenancyHealthTracker } from "../middleware/tenancyHealthTracker";
import { db } from "../db";
import { 
  clients, projects, tasks, teams, users, 
  timeEntries, activeTimers, appSettings, tenants,
  workspaces, invitations, subtasks, taskAttachments,
  tenantAuditEvents, TenantStatus
} from "@shared/schema";
import { sql, eq, isNull, and } from "drizzle-orm";

const router = Router();

interface MissingTenantIdCount {
  table: string;
  missingTenantIdCount: number;
}

interface WarningStats {
  total: number;
  byType: Record<string, number>;
  byRouteTop: Array<{ route: string; method: string; count: number }>;
}

interface ReadinessResult {
  canEnableStrict: boolean;
  reasons: string[];
}

async function getMissingTenantIdCounts(): Promise<MissingTenantIdCount[]> {
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

  const results: MissingTenantIdCount[] = [];

  for (const { name, table } of tables) {
    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(isNull((table as any).tenantId));
      
      results.push({
        table: name,
        missingTenantIdCount: countResult[0]?.count || 0,
      });
    } catch (error) {
      results.push({
        table: name,
        missingTenantIdCount: -1,
      });
    }
  }

  return results;
}

function computeReadiness(
  tableCounts: MissingTenantIdCount[],
  warningsLast24h: WarningStats
): ReadinessResult {
  const reasons: string[] = [];
  const criticalTables = ["clients", "projects", "tasks", "users", "teams", "app_settings"];
  
  for (const tableCount of tableCounts) {
    if (criticalTables.includes(tableCount.table) && tableCount.missingTenantIdCount > 0) {
      reasons.push(`${tableCount.table} has ${tableCount.missingTenantIdCount} rows without tenantId`);
    }
  }

  if (warningsLast24h.total > 5) {
    reasons.push(`${warningsLast24h.total} tenancy warnings in last 24 hours (threshold: 5)`);
  }

  return {
    canEnableStrict: reasons.length === 0,
    reasons,
  };
}

router.get("/v1/super/tenancy/health", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[TenancyHealth] Health endpoint hit by user:", (req as any).user?.id, "role:", (req as any).user?.role);
  }
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const tableCounts = await getMissingTenantIdCounts();

    let warnings24h: WarningStats;
    let warnings7d: WarningStats;

    if (tenancyHealthTracker.isPersistenceEnabled()) {
      const [stats24h, stats7d] = await Promise.all([
        tenancyHealthTracker.getDbStats(last24h),
        tenancyHealthTracker.getDbStats(last7d),
      ]);

      const topRoutes = tenancyHealthTracker.getTopRoutes(5);

      warnings24h = {
        total: stats24h.total,
        byType: stats24h.byType,
        byRouteTop: topRoutes,
      };

      warnings7d = {
        total: stats7d.total,
        byType: stats7d.byType,
        byRouteTop: topRoutes,
      };
    } else {
      const inMemStats = tenancyHealthTracker.getInMemoryStats(last24h);
      const topRoutes = tenancyHealthTracker.getTopRoutes(5);

      warnings24h = {
        total: inMemStats.total,
        byType: inMemStats.byType,
        byRouteTop: topRoutes,
      };

      const inMemStats7d = tenancyHealthTracker.getInMemoryStats(last7d);
      warnings7d = {
        total: inMemStats7d.total,
        byType: inMemStats7d.byType,
        byRouteTop: topRoutes,
      };
    }

    const readiness = computeReadiness(tableCounts, warnings24h);
    const totalMissing = tableCounts.reduce((sum, t) => sum + (t.missingTenantIdCount > 0 ? t.missingTenantIdCount : 0), 0);
    
    const [activeTenantResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenants)
      .where(eq(tenants.status, "active"));
    const activeTenantCount = activeTenantResult?.count || 0;

    const allTimeStats = tenancyHealthTracker.isPersistenceEnabled()
      ? await tenancyHealthTracker.getDbStats(new Date(0))
      : tenancyHealthTracker.getInMemoryStats(new Date(0));

    res.json({
      currentMode: getTenancyEnforcementMode(),
      missingTenantIds: tableCounts,
      totalMissing,
      warningStats: {
        last24Hours: warnings24h.total,
        last7Days: warnings7d.total,
        total: allTimeStats.total,
      },
      readinessCheck: {
        canEnableStrict: readiness.canEnableStrict,
        blockers: readiness.reasons,
      },
      activeTenantCount,
      persistenceEnabled: tenancyHealthTracker.isPersistenceEnabled(),
    });
  } catch (error) {
    console.error("[TenancyHealth] Error getting health:", error);
    res.status(500).json({ error: "Failed to get tenancy health" });
  }
});

router.get("/v1/super/tenancy/warnings", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  if (!tenancyHealthTracker.isPersistenceEnabled()) {
    return res.status(501).json({
      error: "Warning persistence not enabled",
      message: "Set TENANCY_WARN_PERSIST=true to enable warning storage",
    });
  }

  try {
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const tenantId = req.query.tenantId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await tenancyHealthTracker.getWarnings({
      from,
      to,
      tenantId,
      limit,
      offset,
    });

    res.json(result);
  } catch (error) {
    console.error("[TenancyHealth] Error getting warnings:", error);
    res.status(500).json({ error: "Failed to get warnings" });
  }
});

router.post("/v1/super/tenancy/backfill", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const confirmHeader = req.headers["x-confirm-backfill"];
  if (confirmHeader !== "YES") {
    return res.status(400).json({
      error: "Backfill requires confirmation",
      message: "Include header 'X-Confirm-Backfill: YES' to proceed",
    });
  }

  const { dryRun } = req.body;

  try {
    const defaultTenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, "default"))
      .limit(1);

    if (!defaultTenant.length) {
      return res.status(404).json({
        error: "Default tenant not found",
        message: "Create a tenant with slug 'default' first",
      });
    }

    const defaultTenantId = defaultTenant[0].id;

    const tablesToBackfill = [
      { name: "clients", table: clients },
      { name: "projects", table: projects },
      { name: "tasks", table: tasks },
      { name: "teams", table: teams },
      { name: "users", table: users },
      { name: "time_entries", table: timeEntries },
      { name: "active_timers", table: activeTimers },
      { name: "app_settings", table: appSettings },
    ];

    const beforeCounts = await getMissingTenantIdCounts();
    const updated: Array<{ table: string; rowsUpdated: number }> = [];

    if (!dryRun) {
      for (const { name, table } of tablesToBackfill) {
        try {
          const result = await db
            .update(table)
            .set({ tenantId: defaultTenantId } as any)
            .where(isNull((table as any).tenantId));
          
          const beforeCount = beforeCounts.find(c => c.table === name)?.missingTenantIdCount || 0;
          updated.push({
            table: name,
            rowsUpdated: beforeCount,
          });
        } catch (error) {
          console.error(`[TenancyBackfill] Error updating ${name}:`, error);
          updated.push({
            table: name,
            rowsUpdated: -1,
          });
        }
      }
    } else {
      for (const tableCount of beforeCounts) {
        updated.push({
          table: tableCount.table,
          rowsUpdated: tableCount.missingTenantIdCount,
        });
      }
    }

    const remainingNulls = dryRun ? beforeCounts : await getMissingTenantIdCounts();

    const results = updated.map(u => ({
      table: u.table,
      wouldUpdate: dryRun ? u.rowsUpdated : 0,
      updated: dryRun ? 0 : u.rowsUpdated,
    }));

    res.json({
      defaultTenantId,
      dryRun,
      results,
      remainingNulls,
    });
  } catch (error) {
    console.error("[TenancyBackfill] Error during backfill:", error);
    res.status(500).json({ error: "Failed to perform backfill" });
  }
});

router.get("/v1/tenant/tenancy/health", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (user.role !== "admin" && user.role !== "super_user") {
    return res.status(403).json({ error: "Forbidden - admin access required" });
  }

  const effectiveTenantId = user.tenantId;
  if (!effectiveTenantId) {
    return res.status(400).json({ error: "No tenant context" });
  }

  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let warningStats = { total: 0, byType: {} as Record<string, number> };

    if (tenancyHealthTracker.isPersistenceEnabled()) {
      const result = await tenancyHealthTracker.getWarnings({
        from: last24h,
        tenantId: effectiveTenantId,
        limit: 1000,
      });
      
      const byType: Record<string, number> = {};
      for (const warning of result.warnings) {
        byType[warning.warnType] = (byType[warning.warnType] || 0) + 1;
      }
      
      warningStats = {
        total: result.total,
        byType,
      };
    }

    res.json({
      enforcementMode: getTenancyEnforcementMode(),
      tenantId: effectiveTenantId,
      warningsLast24h: warningStats,
      persistenceEnabled: tenancyHealthTracker.isPersistenceEnabled(),
    });
  } catch (error) {
    console.error("[TenancyHealth] Error getting tenant health:", error);
    res.status(500).json({ error: "Failed to get tenant health" });
  }
});

const QUARANTINE_TENANT_SLUG = "quarantine";
const QUARANTINE_TENANT_NAME = "Quarantine / Legacy Data";

interface OrphanTableInfo {
  name: string;
  table: any;
  idField: string;
  displayField: string;
}

const orphanTables: OrphanTableInfo[] = [
  { name: "clients", table: clients, idField: "id", displayField: "name" },
  { name: "projects", table: projects, idField: "id", displayField: "name" },
  { name: "tasks", table: tasks, idField: "id", displayField: "title" },
  { name: "teams", table: teams, idField: "id", displayField: "name" },
  { name: "users", table: users, idField: "id", displayField: "email" },
  { name: "workspaces", table: workspaces, idField: "id", displayField: "name" },
  { name: "time_entries", table: timeEntries, idField: "id", displayField: "id" },
  { name: "active_timers", table: activeTimers, idField: "id", displayField: "id" },
  { name: "invitations", table: invitations, idField: "id", displayField: "email" },
  { name: "subtasks", table: subtasks, idField: "id", displayField: "title" },
  { name: "task_attachments", table: taskAttachments, idField: "id", displayField: "fileName" },
];

async function getOrCreateQuarantineTenant(): Promise<{ id: string; created: boolean }> {
  const [existing] = await db.select()
    .from(tenants)
    .where(eq(tenants.slug, QUARANTINE_TENANT_SLUG))
    .limit(1);
  
  if (existing) {
    return { id: existing.id, created: false };
  }
  
  const [created] = await db.insert(tenants).values({
    name: QUARANTINE_TENANT_NAME,
    slug: QUARANTINE_TENANT_SLUG,
    status: TenantStatus.SUSPENDED,
  }).returning();
  
  return { id: created.id, created: true };
}

async function writeAuditEvent(
  tenantId: string,
  userId: string | null,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(tenantAuditEvents).values({
    tenantId,
    actorUserId: userId,
    eventType,
    message,
    metadata,
  });
}

router.get("/v1/super/health/orphans", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  try {
    const sampleLimit = Math.min(parseInt(req.query.sampleLimit as string) || 10, 50);
    
    const results: Array<{
      table: string;
      count: number;
      sampleIds: Array<{ id: string; display: string }>;
      recommendedAction: string;
    }> = [];
    
    for (const tableInfo of orphanTables) {
      try {
        const [countResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tableInfo.table)
          .where(isNull(tableInfo.table.tenantId));
        
        const count = countResult?.count || 0;
        
        let sampleIds: Array<{ id: string; display: string }> = [];
        if (count > 0) {
          const samples = await db
            .select({
              id: tableInfo.table[tableInfo.idField],
              display: tableInfo.table[tableInfo.displayField] || tableInfo.table[tableInfo.idField],
            })
            .from(tableInfo.table)
            .where(isNull(tableInfo.table.tenantId))
            .limit(sampleLimit);
          
          sampleIds = samples.map(s => ({
            id: String(s.id),
            display: String(s.display || s.id),
          }));
        }
        
        results.push({
          table: tableInfo.name,
          count,
          sampleIds,
          recommendedAction: count > 0 ? "quarantine" : "skip",
        });
      } catch (error) {
        console.error(`[OrphanDetection] Error checking ${tableInfo.name}:`, error);
        results.push({
          table: tableInfo.name,
          count: -1,
          sampleIds: [],
          recommendedAction: "error",
        });
      }
    }
    
    const totalOrphans = results.reduce((sum, r) => sum + (r.count > 0 ? r.count : 0), 0);
    const tablesWithOrphans = results.filter(r => r.count > 0).length;
    
    const [quarantineTenant] = await db.select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.slug, QUARANTINE_TENANT_SLUG))
      .limit(1);
    
    res.json({
      totalOrphans,
      tablesWithOrphans,
      tables: results,
      quarantineTenant: quarantineTenant ? { 
        id: quarantineTenant.id, 
        name: quarantineTenant.name,
        exists: true 
      } : { exists: false },
    });
  } catch (error) {
    console.error("[OrphanDetection] Error:", error);
    res.status(500).json({ error: { code: "internal_error", message: "Failed to detect orphans" } });
  }
});

router.post("/v1/super/health/orphans/fix", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const { dryRun = true, confirmText, plan } = req.body;
  const user = req.user as any;
  
  if (!dryRun && confirmText !== "FIX_ORPHANS") {
    return res.status(400).json({
      error: {
        code: "confirmation_required",
        message: "To execute orphan fix, set dryRun=false and confirmText='FIX_ORPHANS'",
      },
    });
  }
  
  try {
    const results: Array<{
      table: string;
      action: string;
      countBefore: number;
      countFixed: number;
      targetTenantId: string | null;
    }> = [];
    
    let quarantineTenantId: string | null = null;
    let quarantineCreated = false;
    
    if (!dryRun) {
      const qt = await getOrCreateQuarantineTenant();
      quarantineTenantId = qt.id;
      quarantineCreated = qt.created;
      
      if (quarantineCreated) {
        await writeAuditEvent(
          quarantineTenantId,
          user.id,
          "quarantine_tenant_created",
          "Created quarantine tenant for orphan data remediation",
          { createdBy: user.email }
        );
      }
      
      await writeAuditEvent(
        quarantineTenantId,
        user.id,
        "orphan_fix_planned",
        `Orphan fix execution started by ${user.email}`,
        { dryRun: false, tablesInPlan: plan?.length || orphanTables.length }
      );
    } else {
      const [existing] = await db.select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, QUARANTINE_TENANT_SLUG))
        .limit(1);
      quarantineTenantId = existing?.id || null;
    }
    
    const tablesToProcess = plan?.map((p: any) => p.table) || orphanTables.map(t => t.name);
    
    for (const tableInfo of orphanTables) {
      if (!tablesToProcess.includes(tableInfo.name)) {
        continue;
      }
      
      const planItem = plan?.find((p: any) => p.table === tableInfo.name);
      const action = planItem?.action || "quarantine";
      const targetTenantId = planItem?.tenantIdTarget || quarantineTenantId;
      
      if (action === "skip") {
        results.push({
          table: tableInfo.name,
          action: "skipped",
          countBefore: 0,
          countFixed: 0,
          targetTenantId: null,
        });
        continue;
      }
      
      try {
        const [countResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tableInfo.table)
          .where(isNull(tableInfo.table.tenantId));
        
        const countBefore = countResult?.count || 0;
        
        if (countBefore === 0) {
          results.push({
            table: tableInfo.name,
            action: "no_orphans",
            countBefore: 0,
            countFixed: 0,
            targetTenantId: null,
          });
          continue;
        }
        
        if (!dryRun && targetTenantId) {
          await db
            .update(tableInfo.table)
            .set({ tenantId: targetTenantId })
            .where(isNull(tableInfo.table.tenantId));
          
          results.push({
            table: tableInfo.name,
            action: "fixed",
            countBefore,
            countFixed: countBefore,
            targetTenantId,
          });
        } else {
          results.push({
            table: tableInfo.name,
            action: dryRun ? "would_fix" : "skipped_no_target",
            countBefore,
            countFixed: 0,
            targetTenantId: dryRun ? (targetTenantId || "quarantine") : null,
          });
        }
      } catch (error) {
        console.error(`[OrphanFix] Error processing ${tableInfo.name}:`, error);
        results.push({
          table: tableInfo.name,
          action: "error",
          countBefore: -1,
          countFixed: 0,
          targetTenantId: null,
        });
      }
    }
    
    const totalFixed = results.reduce((sum, r) => sum + r.countFixed, 0);
    const totalWouldFix = results.reduce((sum, r) => 
      r.action === "would_fix" ? sum + r.countBefore : sum, 0);
    
    if (!dryRun && quarantineTenantId && totalFixed > 0) {
      await writeAuditEvent(
        quarantineTenantId,
        user.id,
        "orphan_fix_executed",
        `Fixed ${totalFixed} orphan rows across ${results.filter(r => r.action === "fixed").length} tables`,
        { 
          results: results.map(r => ({ table: r.table, action: r.action, count: r.countFixed })),
          executedBy: user.email,
        }
      );
    }
    
    res.json({
      dryRun,
      quarantineTenantId,
      quarantineCreated,
      totalFixed: dryRun ? 0 : totalFixed,
      totalWouldFix: dryRun ? totalWouldFix : 0,
      results,
    });
  } catch (error) {
    console.error("[OrphanFix] Error:", error);
    res.status(500).json({ error: { code: "internal_error", message: "Failed to fix orphans" } });
  }
});

import { TENANT_OWNED_TABLES_SET, isValidTenantOwnedTable, TENANT_OWNED_TABLES_LIST } from "../scripts/tenantOwnedTables";

/**
 * Check NOT NULL constraint readiness
 * GET /api/v1/super/tenancy/constraints
 */
router.get("/v1/super/tenancy/constraints", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const TENANT_OWNED_TABLES = TENANT_OWNED_TABLES_LIST;

  try {
    interface TableStatus {
      name: string;
      hasNotNullConstraint: boolean;
      nullCount: number;
      canMigrate: boolean;
    }

    const tableStatuses: TableStatus[] = [];

    for (const tableName of TENANT_OWNED_TABLES) {
      try {
        const constraintCheck = await db.execute(sql.raw(`
          SELECT is_nullable
          FROM information_schema.columns
          WHERE table_name = '${tableName}' AND column_name = 'tenant_id'
        `));

        if (constraintCheck.rows.length === 0) {
          continue;
        }

        const hasNotNullConstraint = (constraintCheck.rows[0] as any).is_nullable === "NO";

        const nullCountResult = await db.execute(sql.raw(`
          SELECT COUNT(*) as count FROM ${tableName} WHERE tenant_id IS NULL
        `));
        const nullCount = parseInt(String((nullCountResult.rows[0] as any).count || 0), 10);

        tableStatuses.push({
          name: tableName,
          hasNotNullConstraint,
          nullCount,
          canMigrate: !hasNotNullConstraint && nullCount === 0,
        });
      } catch {
        tableStatuses.push({
          name: tableName,
          hasNotNullConstraint: false,
          nullCount: -1,
          canMigrate: false,
        });
      }
    }

    const alreadyMigrated = tableStatuses.filter(t => t.hasNotNullConstraint);
    const readyToMigrate = tableStatuses.filter(t => t.canMigrate);
    const blocked = tableStatuses.filter(t => !t.hasNotNullConstraint && t.nullCount > 0);

    res.json({
      tables: tableStatuses,
      summary: {
        total: tableStatuses.length,
        alreadyMigrated: alreadyMigrated.length,
        readyToMigrate: readyToMigrate.length,
        blocked: blocked.length,
        canApplyAll: blocked.length === 0 && readyToMigrate.length > 0,
      },
      blockedTables: blocked.map(t => ({ name: t.name, nullCount: t.nullCount })),
    });
  } catch (error) {
    console.error("[TenancyConstraints] Error:", error);
    res.status(500).json({ error: { code: "internal_error", message: "Failed to check constraints" } });
  }
});

/**
 * Apply NOT NULL constraints (atomic via transaction)
 * POST /api/v1/super/tenancy/constraints/apply
 */
router.post("/v1/super/tenancy/constraints/apply", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const { dryRun = true, tables } = req.body;
  const user = req.user as any;

  const confirmHeader = req.headers["x-confirm-constraints"];
  if (!dryRun && confirmHeader !== "YES") {
    return res.status(400).json({
      error: {
        code: "confirmation_required",
        message: "To apply constraints, set dryRun=false and include header 'X-Confirm-Constraints: YES'",
      },
    });
  }

  let requestedTables: string[];
  if (tables && Array.isArray(tables)) {
    const invalidTables = tables.filter((t: string) => !isValidTenantOwnedTable(t));
    if (invalidTables.length > 0) {
      return res.status(400).json({
        error: {
          code: "invalid_tables",
          message: `Invalid table names: ${invalidTables.join(", ")}. Only tables from the allowlist are permitted.`,
        },
      });
    }
    requestedTables = tables;
  } else {
    requestedTables = [...TENANT_OWNED_TABLES_LIST];
  }

  console.log(`[TenancyConstraints] ${dryRun ? "DRY-RUN" : "APPLY"} by ${user.email}`);

  interface MigrationResult {
    table: string;
    action: string;
    success: boolean;
    error?: string;
  }

  const results: MigrationResult[] = [];

  try {
    for (const tableName of requestedTables) {
      if (!isValidTenantOwnedTable(tableName)) {
        results.push({ table: tableName, action: "skipped_not_allowed", success: false, error: "Table not in allowlist" });
        continue;
      }

      try {
        const constraintCheck = await db.execute(sql.raw(`
          SELECT is_nullable
          FROM information_schema.columns
          WHERE table_name = '${tableName}' AND column_name = 'tenant_id'
        `));

        if (constraintCheck.rows.length === 0) {
          results.push({ table: tableName, action: "skipped_no_column", success: true });
          continue;
        }

        const hasNotNullConstraint = (constraintCheck.rows[0] as any).is_nullable === "NO";
        if (hasNotNullConstraint) {
          results.push({ table: tableName, action: "already_not_null", success: true });
          continue;
        }

        const nullCountResult = await db.execute(sql.raw(`
          SELECT COUNT(*) as count FROM ${tableName} WHERE tenant_id IS NULL
        `));
        const nullCount = parseInt(String((nullCountResult.rows[0] as any).count || 0), 10);

        if (nullCount > 0) {
          results.push({
            table: tableName,
            action: "blocked_has_nulls",
            success: false,
            error: `${nullCount} rows with NULL tenant_id`,
          });
          continue;
        }

        if (dryRun) {
          results.push({ table: tableName, action: "would_add_constraint", success: true });
          continue;
        }

        results.push({ table: tableName, action: "pending", success: true });
      } catch (error) {
        results.push({
          table: tableName,
          action: "error",
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const tablesToMigrate = results.filter(r => r.action === "pending").map(r => r.table);
    const blockedTables = results.filter(r => r.action === "blocked_has_nulls");

    if (blockedTables.length > 0) {
      return res.status(400).json({
        error: {
          code: "blocked_tables",
          message: "Some tables have NULL tenant_id values and cannot be migrated",
        },
        blockedTables: blockedTables.map(t => ({ table: t.table, error: t.error })),
        results,
      });
    }

    if (!dryRun && tablesToMigrate.length > 0) {
      try {
        await db.transaction(async (tx) => {
          for (const tableName of tablesToMigrate) {
            await tx.execute(sql.raw(`
              ALTER TABLE ${tableName} ALTER COLUMN tenant_id SET NOT NULL
            `));
            const result = results.find(r => r.table === tableName);
            if (result) {
              result.action = "added_not_null";
            }
          }
        });
      } catch (txError) {
        for (const r of results) {
          if (r.action === "pending") {
            r.action = "transaction_failed";
            r.success = false;
            r.error = txError instanceof Error ? txError.message : String(txError);
          }
        }
        throw txError;
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      dryRun,
      executedBy: user.email,
      results,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        constraintsAdded: results.filter(r => r.action === "added_not_null").length,
        wouldAdd: results.filter(r => r.action === "would_add_constraint").length,
      },
    });
  } catch (error) {
    console.error("[TenancyConstraints] Error:", error);
    res.status(500).json({ 
      error: { code: "internal_error", message: "Failed to apply constraints" },
      results,
    });
  }
});

/**
 * Remediate endpoint - uses relationship-based backfill (more accurate than default tenant assignment)
 * POST /api/v1/super/tenancy/remediate?mode=dry-run|apply
 */
router.post("/v1/super/tenancy/remediate", requireAuth, requireSuperUser, async (req: Request, res: Response) => {
  const mode = (req.query.mode as string) || "dry-run";
  const user = req.user as any;

  if (mode !== "dry-run" && mode !== "apply") {
    return res.status(400).json({
      error: { code: "invalid_mode", message: "Mode must be 'dry-run' or 'apply'" },
    });
  }

  const applyMode = mode === "apply";

  if (applyMode) {
    const confirmHeader = req.headers["x-confirm-remediate"];
    if (confirmHeader !== "YES") {
      return res.status(400).json({
        error: {
          code: "confirmation_required",
          message: "To apply remediation, include header 'X-Confirm-Remediate: YES'",
        },
      });
    }
  }

  console.log(`[TenancyRemediate] ${applyMode ? "APPLY" : "DRY-RUN"} mode started by ${user.email}`);

  try {
    const REMEDIATION_TABLES = [
      { name: "workspaces", resolveVia: null },
      { name: "teams", resolveVia: "workspaces" },
      { name: "clients", resolveVia: "workspaces" },
      { name: "projects", resolveVia: "workspaces" },
      { name: "tasks", resolveVia: "projects" },
      { name: "time_entries", resolveVia: "workspaces" },
      { name: "active_timers", resolveVia: "workspaces" },
      { name: "invitations", resolveVia: "workspaces" },
      { name: "personal_task_sections", resolveVia: "users" },
      { name: "task_assignees", resolveVia: "tasks" },
      { name: "task_watchers", resolveVia: "tasks" },
      { name: "notifications", resolveVia: "users" },
      { name: "notification_preferences", resolveVia: "users" },
    ];

    interface TableResult {
      table: string;
      nullBefore: number;
      resolvable: number;
      updated: number;
      unresolvedAfter: number;
      unresolvedSampleIds: string[];
    }

    const results: TableResult[] = [];

    for (const { name, resolveVia } of REMEDIATION_TABLES) {
      const countBefore = await db.execute(
        sql.raw(`SELECT COUNT(*) as count FROM ${name} WHERE tenant_id IS NULL`)
      );
      const nullBefore = parseInt(String((countBefore.rows[0] as any).count || 0), 10);

      if (nullBefore === 0) {
        results.push({
          table: name,
          nullBefore: 0,
          resolvable: 0,
          updated: 0,
          unresolvedAfter: 0,
          unresolvedSampleIds: [],
        });
        continue;
      }

      let resolvable = 0;
      let updated = 0;

      if (resolveVia) {
        let countQuery: string;
        let updateQuery: string;

        switch (resolveVia) {
          case "workspaces":
            countQuery = `
              SELECT COUNT(*) as count FROM ${name} t
              INNER JOIN workspaces w ON t.workspace_id = w.id
              WHERE t.tenant_id IS NULL AND w.tenant_id IS NOT NULL
            `;
            updateQuery = `
              UPDATE ${name} t SET tenant_id = w.tenant_id
              FROM workspaces w
              WHERE t.workspace_id = w.id AND t.tenant_id IS NULL AND w.tenant_id IS NOT NULL
            `;
            break;
          case "projects":
            countQuery = `
              SELECT COUNT(*) as count FROM ${name} t
              INNER JOIN projects p ON t.project_id = p.id
              WHERE t.tenant_id IS NULL AND p.tenant_id IS NOT NULL
            `;
            updateQuery = `
              UPDATE ${name} t SET tenant_id = p.tenant_id
              FROM projects p
              WHERE t.project_id = p.id AND t.tenant_id IS NULL AND p.tenant_id IS NOT NULL
            `;
            break;
          case "tasks":
            countQuery = `
              SELECT COUNT(*) as count FROM ${name} t
              INNER JOIN tasks tk ON t.task_id = tk.id
              WHERE t.tenant_id IS NULL AND tk.tenant_id IS NOT NULL
            `;
            updateQuery = `
              UPDATE ${name} t SET tenant_id = tk.tenant_id
              FROM tasks tk
              WHERE t.task_id = tk.id AND t.tenant_id IS NULL AND tk.tenant_id IS NOT NULL
            `;
            break;
          case "users":
            countQuery = `
              SELECT COUNT(*) as count FROM ${name} t
              INNER JOIN users u ON t.user_id = u.id
              WHERE t.tenant_id IS NULL AND u.tenant_id IS NOT NULL
            `;
            updateQuery = `
              UPDATE ${name} t SET tenant_id = u.tenant_id
              FROM users u
              WHERE t.user_id = u.id AND t.tenant_id IS NULL AND u.tenant_id IS NOT NULL
            `;
            break;
          default:
            countQuery = "";
            updateQuery = "";
        }

        if (countQuery) {
          const resolvableResult = await db.execute(sql.raw(countQuery));
          resolvable = parseInt(String((resolvableResult.rows[0] as any).count || 0), 10);

          if (applyMode && resolvable > 0 && updateQuery) {
            const updateResult = await db.execute(sql.raw(updateQuery));
            updated = updateResult.rowCount || 0;
          }
        }
      }

      const countAfter = await db.execute(
        sql.raw(`SELECT COUNT(*) as count FROM ${name} WHERE tenant_id IS NULL`)
      );
      const unresolvedAfter = parseInt(String((countAfter.rows[0] as any).count || 0), 10);

      let unresolvedSampleIds: string[] = [];
      if (unresolvedAfter > 0) {
        const sampleResult = await db.execute(
          sql.raw(`SELECT id FROM ${name} WHERE tenant_id IS NULL LIMIT 50`)
        );
        unresolvedSampleIds = (sampleResult.rows as any[]).map(r => r.id);
      }

      results.push({
        table: name,
        nullBefore,
        resolvable,
        updated,
        unresolvedAfter,
        unresolvedSampleIds,
      });
    }

    const usersResult = await db.execute(sql`
      SELECT id, email, role FROM users WHERE tenant_id IS NULL
    `);
    const usersRows = usersResult.rows as any[];
    const superUsers = usersRows.filter(u => u.role === "super_user");
    const nonSuperUsers = usersRows.filter(u => u.role !== "super_user");

    const totalNull = results.reduce((sum, r) => sum + r.nullBefore, 0);
    const totalResolvable = results.reduce((sum, r) => sum + r.resolvable, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    const totalUnresolved = results.reduce((sum, r) => sum + r.unresolvedAfter, 0) + nonSuperUsers.length;

    res.json({
      mode,
      timestamp: new Date().toISOString(),
      executedBy: user.email,
      tables: results,
      users: {
        superUsersWithNullTenantId: superUsers.length,
        nonSuperUsersWithNullTenantId: nonSuperUsers.length,
        nonSuperUserSampleIds: nonSuperUsers.slice(0, 50).map((u: any) => u.id),
      },
      summary: {
        totalNull,
        totalResolvable,
        totalUpdated,
        totalUnresolved,
        canApplyNotNullConstraints: totalUnresolved === 0,
      },
    });
  } catch (error) {
    console.error("[TenancyRemediate] Error:", error);
    res.status(500).json({ error: { code: "internal_error", message: "Remediation failed" } });
  }
});

export default router;
