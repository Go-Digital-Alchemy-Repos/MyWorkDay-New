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

const TABLES_TO_CHECK = [
  "users",
  "projects", 
  "tasks",
  "teams",
  "clients",
  "workspaces",
  "time_entries",
  "active_timers",
];

export async function checkNullTenantIds(): Promise<NullTenantIdReport[]> {
  const reports: NullTenantIdReport[] = [];

  for (const table of TABLES_TO_CHECK) {
    try {
      const result = await db.execute(sql.raw(`
        SELECT COUNT(*) as count FROM ${table} WHERE tenant_id IS NULL
      `));
      const count = parseInt((result.rows[0] as any)?.count || "0");
      if (count > 0) {
        reports.push({ table, count });
      }
    } catch {
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
