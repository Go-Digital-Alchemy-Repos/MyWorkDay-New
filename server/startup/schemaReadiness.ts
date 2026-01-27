/**
 * Schema Readiness Check
 * 
 * Ensures database schema is ready before the app starts serving traffic.
 * - Runs Drizzle migrations if AUTO_MIGRATE=true
 * - Validates required tables/columns exist
 * - Fails fast with clear error if critical issues found
 */

import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";

const REQUIRED_TABLES = [
  "users",
  "tenants",
  "workspaces",
  "projects",
  "tasks",
  "clients",
  "teams",
  "chat_channels",
  "chat_dm_members",
  "chat_messages",
  "error_logs",
  "notification_preferences",
  "time_entries",
  "active_timers",
];

const REQUIRED_COLUMNS: { table: string; column: string }[] = [
  { table: "tenants", column: "chat_retention_days" },
  { table: "active_timers", column: "title" },
  { table: "users", column: "tenant_id" },
  { table: "projects", column: "client_id" },
  { table: "tasks", column: "project_id" },
];

export interface SchemaCheckResult {
  migrationAppliedCount: number;
  lastMigrationTimestamp: string | null;
  lastMigrationHash: string | null;
  dbConnectionOk: boolean;
  tablesCheck: { table: string; exists: boolean }[];
  columnsCheck: { table: string; column: string; exists: boolean }[];
  allTablesExist: boolean;
  allColumnsExist: boolean;
  isReady: boolean;
  errors: string[];
}

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      ) as exists
    `);
    return (result.rows[0] as any)?.exists === true;
  } catch {
    return false;
  }
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      ) as exists
    `);
    return (result.rows[0] as any)?.exists === true;
  } catch {
    return false;
  }
}

async function getMigrationInfo(): Promise<{ count: number; lastHash: string | null; lastTimestamp: string | null }> {
  try {
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int as total FROM drizzle.__drizzle_migrations
    `);
    const count = (countResult.rows[0] as any)?.total || 0;

    if (count > 0) {
      const lastResult = await db.execute(sql`
        SELECT hash, created_at 
        FROM drizzle.__drizzle_migrations 
        ORDER BY id DESC 
        LIMIT 1
      `);
      const last = lastResult.rows[0] as any;
      return {
        count,
        lastHash: last?.hash || null,
        lastTimestamp: last?.created_at || null,
      };
    }
    return { count: 0, lastHash: null, lastTimestamp: null };
  } catch (error: any) {
    if (error?.code === "42P01") {
      return { count: 0, lastHash: null, lastTimestamp: null };
    }
    throw error;
  }
}

export async function runMigrations(): Promise<{ success: boolean; error?: string; durationMs?: number; appliedCount?: number }> {
  const migrationsPath = path.resolve(process.cwd(), "migrations");
  const startTime = Date.now();
  console.log(`[migrations] Migrations started at ${new Date(startTime).toISOString()}`);
  console.log(`[migrations] Migrations folder: ${migrationsPath}`);
  
  // Get count before migration
  let beforeCount = 0;
  try {
    const beforeInfo = await getMigrationInfo();
    beforeCount = beforeInfo.count;
  } catch { /* ignore */ }
  
  try {
    await migrate(db, { migrationsFolder: migrationsPath });
    const durationMs = Date.now() - startTime;
    
    // Get count after migration
    let afterCount = beforeCount;
    try {
      const afterInfo = await getMigrationInfo();
      afterCount = afterInfo.count;
    } catch { /* ignore */ }
    
    const appliedCount = afterCount - beforeCount;
    console.log(`[migrations] Migrations completed in ${durationMs}ms - applied ${appliedCount} new migrations`);
    return { success: true, durationMs, appliedCount };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error?.message || String(error);
    console.error(`[migrations] MIGRATION FAILED after ${durationMs}ms`);
    console.error("[migrations] Error:", errorMessage);
    console.error("[migrations] Fix: Check migration SQL syntax or database permissions");
    return { success: false, error: errorMessage, durationMs };
  }
}

export async function checkSchemaReadiness(): Promise<SchemaCheckResult> {
  const errors: string[] = [];
  let dbConnectionOk = false;
  let migrationAppliedCount = 0;
  let lastMigrationTimestamp: string | null = null;
  let lastMigrationHash: string | null = null;

  try {
    await db.execute(sql`SELECT 1`);
    dbConnectionOk = true;
  } catch (error: any) {
    errors.push(`Database connection failed: ${error?.message || error}`);
  }

  if (dbConnectionOk) {
    try {
      const migInfo = await getMigrationInfo();
      migrationAppliedCount = migInfo.count;
      lastMigrationHash = migInfo.lastHash;
      lastMigrationTimestamp = migInfo.lastTimestamp;
    } catch (error: any) {
      errors.push(`Failed to get migration info: ${error?.message || error}`);
    }
  }

  const tablesCheck: { table: string; exists: boolean }[] = [];
  for (const table of REQUIRED_TABLES) {
    const exists = dbConnectionOk ? await checkTableExists(table) : false;
    tablesCheck.push({ table, exists });
    if (!exists) {
      errors.push(`Required table missing: ${table}`);
    }
  }

  const columnsCheck: { table: string; column: string; exists: boolean }[] = [];
  for (const { table, column } of REQUIRED_COLUMNS) {
    const exists = dbConnectionOk ? await checkColumnExists(table, column) : false;
    columnsCheck.push({ table, column, exists });
    if (!exists) {
      errors.push(`Required column missing: ${table}.${column}`);
    }
  }

  const allTablesExist = tablesCheck.every((t) => t.exists);
  const allColumnsExist = columnsCheck.every((c) => c.exists);
  const isReady = dbConnectionOk && allTablesExist && allColumnsExist;

  return {
    migrationAppliedCount,
    lastMigrationTimestamp,
    lastMigrationHash,
    dbConnectionOk,
    tablesCheck,
    columnsCheck,
    allTablesExist,
    allColumnsExist,
    isReady,
    errors,
  };
}

// Global state for health check reporting
let lastSchemaCheck: SchemaCheckResult | null = null;

export function getLastSchemaCheck(): SchemaCheckResult | null {
  return lastSchemaCheck;
}

export async function ensureSchemaReady(): Promise<void> {
  const autoMigrate = process.env.AUTO_MIGRATE === "true";
  const env = process.env.NODE_ENV || "development";
  const isProduction = env === "production";
  const failOnSchemaIssues = process.env.FAIL_ON_SCHEMA_ISSUES !== "false";

  const schemaCheckStart = Date.now();
  console.log(`[schema] Schema check started at ${new Date(schemaCheckStart).toISOString()}`);
  console.log(`[schema] AUTO_MIGRATE=${autoMigrate}, NODE_ENV=${env}`);

  let preCheck = await checkSchemaReadiness();
  lastSchemaCheck = preCheck;

  if (!preCheck.dbConnectionOk) {
    console.error("[schema] FATAL: Cannot connect to database");
    console.error("[schema] Errors:", preCheck.errors);
    console.error("[schema] Fix: Check DATABASE_URL environment variable and database accessibility");
    throw new Error("Database connection failed - cannot start application");
  }

  if (autoMigrate) {
    console.log("[schema] AUTO_MIGRATE enabled - running migrations...");
    const migResult = await runMigrations();
    if (!migResult.success) {
      console.error("[schema] FATAL: Migration failed");
      console.error("[schema] Error:", migResult.error);
      console.error("[schema] Fix: Check migration SQL syntax or database permissions");
      throw new Error(`Migration failed: ${migResult.error}`);
    }
    preCheck = await checkSchemaReadiness();
    lastSchemaCheck = preCheck;
  } else {
    console.log("[schema] AUTO_MIGRATE disabled - skipping automatic migrations");
    if (!preCheck.isReady) {
      console.warn("[schema] WARNING: Schema is not ready. Set AUTO_MIGRATE=true to run migrations on boot.");
    }
  }

  console.log(`[schema] Migrations applied: ${preCheck.migrationAppliedCount}`);
  if (preCheck.lastMigrationHash) {
    console.log(`[schema] Last migration: ${preCheck.lastMigrationHash}`);
  }

  const missingTables = preCheck.tablesCheck.filter((t) => !t.exists);
  const missingColumns = preCheck.columnsCheck.filter((c) => !c.exists);

  if (missingTables.length > 0) {
    console.error("[schema] Schema readiness failed: Missing tables:", missingTables.map((t) => t.table).join(", "));
  }

  if (missingColumns.length > 0) {
    console.error("[schema] Schema readiness failed: Missing columns:", missingColumns.map((c) => `${c.table}.${c.column}`).join(", "));
  }

  const schemaCheckDuration = Date.now() - schemaCheckStart;

  if (preCheck.isReady) {
    console.log(`[schema] Schema check completed in ${schemaCheckDuration}ms - all required tables and columns exist`);
  } else {
    // In production: always fail fast
    // In development: fail unless FAIL_ON_SCHEMA_ISSUES=false
    if (isProduction || failOnSchemaIssues) {
      console.error("[schema] FATAL: Schema is NOT ready");
      console.error("[schema] Errors:", preCheck.errors);
      console.error("[schema] Fix: Set AUTO_MIGRATE=true or run: npx drizzle-kit migrate");
      
      throw new Error(`Schema not ready: ${preCheck.errors.join("; ")}`);
    } else {
      console.warn(`[schema] Schema check completed in ${schemaCheckDuration}ms - WARNING: NOT ready, continuing in dev mode`);
      console.warn("[schema] Issues:", preCheck.errors);
      console.warn("[schema] Fix: Set AUTO_MIGRATE=true or run migrations manually");
    }
  }
}
