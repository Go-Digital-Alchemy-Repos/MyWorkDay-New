#!/usr/bin/env tsx
/**
 * CLI Script: Purge All Application Data
 * 
 * DANGER: This script deletes ALL application data from the database.
 * Tables remain intact but all records are removed.
 * After purge, the app behaves like a fresh install.
 * 
 * SAFETY GUARDS:
 * 1. Requires env var: PURGE_APP_DATA_ALLOWED=true
 * 2. Requires env var: PURGE_APP_DATA_CONFIRM="YES_PURGE_APP_DATA"
 * 3. Refuses to run in production unless PURGE_PROD_ALLOWED=true
 * 4. Never runs automatically - must be invoked manually
 * 
 * Usage:
 *   PURGE_APP_DATA_ALLOWED=true PURGE_APP_DATA_CONFIRM=YES_PURGE_APP_DATA npx tsx server/scripts/purge_app_data.ts
 * 
 * For production (if absolutely necessary):
 *   PURGE_APP_DATA_ALLOWED=true PURGE_APP_DATA_CONFIRM=YES_PURGE_APP_DATA PURGE_PROD_ALLOWED=true NODE_ENV=production npx tsx server/scripts/purge_app_data.ts
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

const CONFIRM_PHRASE = "YES_PURGE_APP_DATA";

// Tables to purge in FK-safe order (child tables first, parent tables last)
// This order respects foreign key constraints
const TABLES_TO_PURGE = [
  // Child tables (most dependent first)
  "user_sessions",              // Session data
  "tenant_agreement_acceptances", // Agreement acceptances
  "tenant_agreements",          // Tenant agreements
  "task_comments",              // Task comments
  "task_attachments",           // Task attachments  
  "subtasks",                   // Subtasks
  "task_assignees",             // Task assignees (many-to-many)
  "task_tags",                  // Task tags (many-to-many)
  "time_entries",               // Time tracking entries
  "active_timers",              // Active timers
  "activity_logs",              // Activity logs
  "personal_task_sections",     // Personal task sections
  "tasks",                      // Tasks
  "tags",                       // Tags
  "sections",                   // Project sections
  "projects",                   // Projects
  "client_invites",             // Client portal invites
  "client_contacts",            // Client contacts
  "clients",                    // Clients (CRM)
  "team_members",               // Team members
  "teams",                      // Teams
  "workspace_members",          // Workspace members
  "workspaces",                 // Workspaces
  "invitations",                // Tenant invitations
  "tenant_integrations",        // Tenant integrations
  "tenant_settings",            // Tenant settings
  "users",                      // Users (before tenants due to owner reference)
  "tenants",                    // Tenants (top-level)
] as const;

// Tables to NEVER purge (internal/system tables)
const PROTECTED_TABLES = [
  "drizzle_migrations",      // Migration tracking
  "__drizzle_migrations",    // Alternative migration tracking
  "pg_stat_statements",      // PostgreSQL internal
] as const;

interface PurgeResult {
  table: string;
  rowsDeleted: number;
  status: "success" | "skipped" | "error";
  error?: string;
}

async function checkSafetyGuards(): Promise<{ safe: boolean; reason?: string }> {
  // Guard 1: PURGE_APP_DATA_ALLOWED must be "true"
  if (process.env.PURGE_APP_DATA_ALLOWED !== "true") {
    return {
      safe: false,
      reason: "PURGE_APP_DATA_ALLOWED environment variable must be set to 'true'",
    };
  }

  // Guard 2: PURGE_APP_DATA_CONFIRM must match exact phrase
  if (process.env.PURGE_APP_DATA_CONFIRM !== CONFIRM_PHRASE) {
    return {
      safe: false,
      reason: `PURGE_APP_DATA_CONFIRM must be set to '${CONFIRM_PHRASE}'`,
    };
  }

  // Guard 3: Production check
  const isProduction = process.env.NODE_ENV === "production";
  const prodAllowed = process.env.PURGE_PROD_ALLOWED === "true";

  if (isProduction && !prodAllowed) {
    return {
      safe: false,
      reason: "Cannot run in production without PURGE_PROD_ALLOWED=true",
    };
  }

  return { safe: true };
}

async function purgeTable(tableName: string): Promise<PurgeResult> {
  try {
    // Check if table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      ) as exists
    `);

    if (!(tableExists.rows[0] as { exists: boolean }).exists) {
      return { table: tableName, rowsDeleted: 0, status: "skipped", error: "Table does not exist" };
    }

    // Get row count before deletion
    const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::int as count FROM "${tableName}"`));
    const rowCount = (countResult.rows[0] as { count: number }).count;

    if (rowCount === 0) {
      return { table: tableName, rowsDeleted: 0, status: "success" };
    }

    // Delete all rows (TRUNCATE would be faster but DELETE respects triggers)
    await db.execute(sql.raw(`DELETE FROM "${tableName}"`));

    // Reset sequence if table has a serial/identity column
    try {
      await db.execute(sql.raw(`
        SELECT setval(pg_get_serial_sequence('"${tableName}"', 'id'), 1, false)
        WHERE pg_get_serial_sequence('"${tableName}"', 'id') IS NOT NULL
      `));
    } catch {
      // Table might not have a serial column, ignore
    }

    return { table: tableName, rowsDeleted: rowCount, status: "success" };
  } catch (error) {
    return { 
      table: tableName, 
      rowsDeleted: 0, 
      status: "error", 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

async function purgeAllData(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           PURGE APP DATA - DANGER ZONE                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  // Check safety guards
  const { safe, reason } = await checkSafetyGuards();
  if (!safe) {
    console.error("❌ SAFETY CHECK FAILED:", reason);
    console.error("");
    console.error("Required environment variables:");
    console.error("  PURGE_APP_DATA_ALLOWED=true");
    console.error("  PURGE_APP_DATA_CONFIRM=YES_PURGE_APP_DATA");
    console.error("  PURGE_PROD_ALLOWED=true  (only for production)");
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";
  console.log(`Environment: ${isProduction ? "PRODUCTION ⚠️" : "Development"}`);
  console.log(`Database: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] || "unknown"}`);
  console.log("");
  console.log("Starting purge...");
  console.log("");

  const results: PurgeResult[] = [];
  let totalRowsDeleted = 0;

  for (const table of TABLES_TO_PURGE) {
    process.stdout.write(`  Purging ${table}... `);
    const result = await purgeTable(table);
    results.push(result);

    if (result.status === "success") {
      console.log(`✓ ${result.rowsDeleted} rows deleted`);
      totalRowsDeleted += result.rowsDeleted;
    } else if (result.status === "skipped") {
      console.log(`⊘ skipped (${result.error})`);
    } else {
      console.log(`✗ error: ${result.error}`);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("PURGE COMPLETE");
  console.log(`  Tables processed: ${results.length}`);
  console.log(`  Total rows deleted: ${totalRowsDeleted}`);
  console.log(`  Successful: ${results.filter(r => r.status === "success").length}`);
  console.log(`  Skipped: ${results.filter(r => r.status === "skipped").length}`);
  console.log(`  Errors: ${results.filter(r => r.status === "error").length}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");
  console.log("The application is now in a fresh state.");
  console.log("The first user to register will become Super Admin.");

  process.exit(0);
}

// Run the purge
purgeAllData().catch((error) => {
  console.error("Fatal error during purge:", error);
  process.exit(1);
});
