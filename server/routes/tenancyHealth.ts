import { Router, Request, Response } from "express";
import { requireSuperUser } from "../middleware/tenantContext";
import { requireAuth } from "../auth";
import { getTenancyEnforcementMode } from "../middleware/tenancyEnforcement";
import { tenancyHealthTracker } from "../middleware/tenancyHealthTracker";
import { db } from "../db";
import { 
  clients, projects, tasks, teams, users, 
  timeEntries, activeTimers, appSettings, tenants
} from "@shared/schema";
import { sql, eq, isNull } from "drizzle-orm";

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

export default router;
