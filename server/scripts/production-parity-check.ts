/**
 * Production Parity Check
 * 
 * Purpose: Verify critical schema elements exist on startup.
 * Logs clear errors to the error log if issues are found.
 * 
 * INVARIANTS:
 * - Read-only: does not modify schema
 * - Non-blocking: logs warnings but does not crash the app
 * - Captures to error_logs for visibility in Super Admin UI
 * 
 * Usage:
 *   import { runProductionParityCheck } from "./scripts/production-parity-check";
 *   await runProductionParityCheck();
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";

interface ColumnCheck {
  table: string;
  column: string;
  critical: boolean;
  guidance: string;
}

interface TableCheck {
  table: string;
  critical: boolean;
  guidance: string;
}

const CRITICAL_TABLES: TableCheck[] = [
  { 
    table: "tenants", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "users", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "workspaces", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "projects", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "tasks", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "clients", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "notifications", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "notification_preferences", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "error_logs", 
    critical: true, 
    guidance: "Run migrations: npx tsx server/scripts/migrate.ts" 
  },
  { 
    table: "tenant_settings", 
    critical: false, 
    guidance: "Run migrations for tenant settings support" 
  },
];

const CRITICAL_COLUMNS: ColumnCheck[] = [
  { 
    table: "notifications", 
    column: "tenant_id", 
    critical: true,
    guidance: "notifications.tenant_id missing - run migration 0002_safe_additive_fixes.sql"
  },
  { 
    table: "projects", 
    column: "tenant_id", 
    critical: true,
    guidance: "projects.tenant_id missing - multi-tenancy broken"
  },
  { 
    table: "tasks", 
    column: "tenant_id", 
    critical: true,
    guidance: "tasks.tenant_id missing - multi-tenancy broken"
  },
  { 
    table: "clients", 
    column: "tenant_id", 
    critical: true,
    guidance: "clients.tenant_id missing - multi-tenancy broken"
  },
  { 
    table: "users", 
    column: "tenant_id", 
    critical: true,
    guidance: "users.tenant_id missing - multi-tenancy broken"
  },
  { 
    table: "tenant_settings", 
    column: "chat_retention_days", 
    critical: false,
    guidance: "tenant_settings.chat_retention_days missing - chat retention won't work"
  },
  { 
    table: "error_logs", 
    column: "request_id", 
    critical: true,
    guidance: "error_logs.request_id missing - error correlation broken"
  },
];

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `);
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${tableName} AND column_name = ${columnName}
    `);
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

async function logSchemaIssue(
  issueType: "missing_table" | "missing_column",
  target: string,
  guidance: string,
  critical: boolean
): Promise<void> {
  const requestId = `startup-check-${Date.now()}`;
  const message = critical
    ? `CRITICAL SCHEMA ISSUE: ${issueType} - ${target}`
    : `SCHEMA WARNING: ${issueType} - ${target}`;

  console.error(`[Production Parity] ${message}`);
  console.error(`[Production Parity] Guidance: ${guidance}`);

  try {
    await storage.createErrorLog({
      requestId,
      tenantId: null,
      userId: null,
      method: "STARTUP",
      path: "/production-parity-check",
      status: critical ? 500 : 400,
      errorName: "SchemaParityError",
      message: `${message}. ${guidance}`,
      stack: new Error().stack || "",
      dbCode: null,
      dbConstraint: null,
      meta: {
        issueType,
        target,
        guidance,
        critical,
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
      },
      environment: process.env.NODE_ENV || "development",
      resolved: false,
    });
  } catch (logError) {
    console.error("[Production Parity] Failed to log to error_logs:", logError);
  }
}

export interface ParityCheckResult {
  passed: boolean;
  criticalIssues: string[];
  warnings: string[];
  checkedAt: Date;
}

export async function runProductionParityCheck(): Promise<ParityCheckResult> {
  const result: ParityCheckResult = {
    passed: true,
    criticalIssues: [],
    warnings: [],
    checkedAt: new Date(),
  };

  console.log("[Production Parity] Starting schema parity check...");

  for (const check of CRITICAL_TABLES) {
    const exists = await tableExists(check.table);
    if (!exists) {
      const issue = `Missing table: ${check.table}`;
      if (check.critical) {
        result.criticalIssues.push(issue);
        result.passed = false;
      } else {
        result.warnings.push(issue);
      }
      await logSchemaIssue("missing_table", check.table, check.guidance, check.critical);
    }
  }

  for (const check of CRITICAL_COLUMNS) {
    const tablePresent = await tableExists(check.table);
    if (!tablePresent) {
      continue;
    }

    const exists = await columnExists(check.table, check.column);
    if (!exists) {
      const issue = `Missing column: ${check.table}.${check.column}`;
      if (check.critical) {
        result.criticalIssues.push(issue);
        result.passed = false;
      } else {
        result.warnings.push(issue);
      }
      await logSchemaIssue("missing_column", `${check.table}.${check.column}`, check.guidance, check.critical);
    }
  }

  if (result.passed) {
    console.log("[Production Parity] All schema checks passed!");
  } else {
    console.error("[Production Parity] CRITICAL ISSUES DETECTED:");
    result.criticalIssues.forEach(issue => console.error(`  - ${issue}`));
  }

  if (result.warnings.length > 0) {
    console.warn("[Production Parity] Warnings:");
    result.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  return result;
}

// Only run as main module when explicitly called via CLI (not when bundled)
const isMainModule = typeof require !== 'undefined' && require.main === module;

if (isMainModule) {
  runProductionParityCheck()
    .then(result => {
      console.log("\n=== Production Parity Check Result ===");
      console.log(`Passed: ${result.passed}`);
      console.log(`Critical Issues: ${result.criticalIssues.length}`);
      console.log(`Warnings: ${result.warnings.length}`);
      process.exit(result.passed ? 0 : 1);
    })
    .catch(err => {
      console.error("Parity check failed:", err);
      process.exit(1);
    });
}
