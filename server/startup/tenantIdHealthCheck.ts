/**
 * @module server/startup/tenantIdHealthCheck
 * @description Startup check for rows with NULL tenantId.
 * 
 * Runs on server boot to detect data integrity issues early.
 * Logs warnings but does not block startup.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface NullTenantIdReport {
  table: string;
  count: number;
}

const TABLE_QUERIES: Record<string, string> = {
  users: "SELECT COUNT(*) as count FROM users WHERE tenant_id IS NULL",
  projects: "SELECT COUNT(*) as count FROM projects WHERE tenant_id IS NULL",
  tasks: "SELECT COUNT(*) as count FROM tasks WHERE tenant_id IS NULL",
  teams: "SELECT COUNT(*) as count FROM teams WHERE tenant_id IS NULL",
  clients: "SELECT COUNT(*) as count FROM clients WHERE tenant_id IS NULL",
  workspaces: "SELECT COUNT(*) as count FROM workspaces WHERE tenant_id IS NULL",
  time_entries: "SELECT COUNT(*) as count FROM time_entries WHERE tenant_id IS NULL",
  active_timers: "SELECT COUNT(*) as count FROM active_timers WHERE tenant_id IS NULL",
};

export async function checkNullTenantIds(): Promise<NullTenantIdReport[]> {
  const reports: NullTenantIdReport[] = [];

  for (const [table, query] of Object.entries(TABLE_QUERIES)) {
    try {
      const result = await db.execute(sql.raw(query));
      const count = parseInt((result.rows[0] as any)?.count || "0");
      if (count > 0) {
        reports.push({ table, count });
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes("does not exist")) {
        console.warn(`[tenantIdHealthCheck] Table or column missing for ${table}: ${msg}`);
      } else {
        console.error(`[tenantIdHealthCheck] Error checking ${table}:`, msg);
      }
    }
  }

  return reports;
}

export async function logNullTenantIdWarnings(): Promise<void> {
  try {
    const reports = await checkNullTenantIds();
    
    if (reports.length === 0) {
      console.log("[tenantIdHealthCheck] All tables have valid tenantId values");
      return;
    }

    const totalMissing = reports.reduce((sum, r) => sum + r.count, 0);
    console.warn(`[tenantIdHealthCheck] Found ${totalMissing} rows with NULL tenantId:`);
    
    for (const report of reports) {
      console.warn(`  - ${report.table}: ${report.count} rows`);
    }
    
    console.warn("[tenantIdHealthCheck] Run backfill script: npx tsx server/scripts/backfillTenantId.ts --dry-run");
  } catch (error) {
    console.error("[tenantIdHealthCheck] Failed to check NULL tenantIds:", error);
  }
}
