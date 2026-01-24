/**
 * Tenancy NOT NULL Migration Script
 * 
 * This script conditionally adds NOT NULL constraints to tenant_id columns
 * ONLY when there are zero rows with NULL tenant_id values.
 * 
 * Safety Features:
 * - Pre-flight check ensures no NULL values exist before migration
 * - Dry-run mode shows what would happen without making changes
 * - Atomic transactions ensure all-or-nothing behavior (all tables or none)
 * - Never deletes data - only adds constraints
 * - Pre-checks ALL tables for NULLs before applying ANY constraints
 * 
 * Usage:
 *   npx tsx server/scripts/tenancyNotNullMigration.ts --mode=dry-run
 *   npx tsx server/scripts/tenancyNotNullMigration.ts --mode=apply
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { TENANT_OWNED_TABLES_LIST } from "./tenantOwnedTables";

interface TableInfo {
  name: string;
  hasConstraint: boolean;
  nullCount: number;
  canMigrate: boolean;
}

interface MigrationResult {
  table: string;
  success: boolean;
  action: string;
  error?: string;
}

const TENANT_OWNED_TABLES = TENANT_OWNED_TABLES_LIST;

async function checkTableStatus(tableName: string): Promise<TableInfo> {
  try {
    const constraintCheck = await db.execute(sql.raw(`
      SELECT 
        is_nullable
      FROM information_schema.columns
      WHERE table_name = '${tableName}'
        AND column_name = 'tenant_id'
    `));

    if (constraintCheck.rows.length === 0) {
      return {
        name: tableName,
        hasConstraint: false,
        nullCount: -1,
        canMigrate: false,
      };
    }

    const hasConstraint = (constraintCheck.rows[0] as any).is_nullable === "NO";

    const nullCountResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as count FROM ${tableName} WHERE tenant_id IS NULL
    `));
    const nullCount = parseInt(String((nullCountResult.rows[0] as any).count || 0), 10);

    return {
      name: tableName,
      hasConstraint,
      nullCount,
      canMigrate: !hasConstraint && nullCount === 0,
    };
  } catch (error) {
    return {
      name: tableName,
      hasConstraint: false,
      nullCount: -1,
      canMigrate: false,
    };
  }
}

async function addNotNullConstraint(tableName: string): Promise<MigrationResult> {
  try {
    await db.execute(sql.raw(`
      ALTER TABLE ${tableName} 
      ALTER COLUMN tenant_id SET NOT NULL
    `));

    return {
      table: tableName,
      success: true,
      action: "added_not_null_constraint",
    };
  } catch (error) {
    return {
      table: tableName,
      success: false,
      action: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runMigration(applyMode: boolean): Promise<void> {
  console.log("=".repeat(60));
  console.log(`Tenancy NOT NULL Migration - ${applyMode ? "APPLY" : "DRY-RUN"} Mode`);
  console.log("=".repeat(60));
  console.log();

  console.log("Checking table status...\n");

  const tableStatuses: TableInfo[] = [];

  for (const tableName of TENANT_OWNED_TABLES) {
    const status = await checkTableStatus(tableName);
    tableStatuses.push(status);
  }

  console.log("Table Status Report:");
  console.log("-".repeat(60));
  console.log("| Table                      | Has NOT NULL | Null Count | Can Migrate |");
  console.log("-".repeat(60));

  for (const status of tableStatuses) {
    const hasConstraint = status.hasConstraint ? "YES" : "NO ";
    const nullCount = status.nullCount === -1 ? "N/A" : String(status.nullCount).padStart(4);
    const canMigrate = status.canMigrate ? "YES" : "NO ";
    console.log(
      `| ${status.name.padEnd(26)} | ${hasConstraint.padEnd(12)} | ${nullCount.padEnd(10)} | ${canMigrate.padEnd(11)} |`
    );
  }
  console.log("-".repeat(60));
  console.log();

  const migratable = tableStatuses.filter(t => t.canMigrate);
  const blocked = tableStatuses.filter(t => !t.canMigrate && !t.hasConstraint && t.nullCount > 0);
  const alreadyMigrated = tableStatuses.filter(t => t.hasConstraint);
  const notApplicable = tableStatuses.filter(t => t.nullCount === -1);

  console.log("Summary:");
  console.log(`  - Tables already with NOT NULL: ${alreadyMigrated.length}`);
  console.log(`  - Tables ready to migrate: ${migratable.length}`);
  console.log(`  - Tables blocked (has NULL values): ${blocked.length}`);
  console.log(`  - Tables not applicable: ${notApplicable.length}`);
  console.log();

  if (blocked.length > 0) {
    console.log("BLOCKED TABLES (require remediation first):");
    for (const table of blocked) {
      console.log(`  - ${table.name}: ${table.nullCount} NULL rows`);
    }
    console.log();
    console.log("Run POST /api/v1/super/tenancy/remediate?mode=apply to fix these first.");
    console.log();
    console.log("MIGRATION ABORTED: Cannot proceed with blocked tables.");
    return;
  }

  if (migratable.length === 0) {
    if (alreadyMigrated.length === TENANT_OWNED_TABLES.length) {
      console.log("All tables already have NOT NULL constraints. Migration complete!");
    } else {
      console.log("No tables need migration.");
    }
    return;
  }

  if (!applyMode) {
    console.log("DRY-RUN: Would add NOT NULL constraints to:");
    for (const table of migratable) {
      console.log(`  - ${table.name}`);
    }
    console.log();
    console.log("Run with --mode=apply to execute migration.");
    return;
  }

  console.log("Applying NOT NULL constraints in atomic transaction...\n");

  const results: MigrationResult[] = [];

  await db.transaction(async (tx) => {
    for (const table of migratable) {
      console.log(`  Migrating ${table.name}...`);
      try {
        await tx.execute(sql.raw(`
          ALTER TABLE ${table.name} ALTER COLUMN tenant_id SET NOT NULL
        `));
        results.push({
          table: table.name,
          success: true,
          action: "added_not_null_constraint",
        });
        console.log(`    ✓ Added NOT NULL constraint`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`    ✗ Failed: ${errorMsg}`);
        throw new Error(`Migration failed on ${table.name}: ${errorMsg}`);
      }
    }
  });

  console.log();
  console.log("Migration Results:");
  console.log("-".repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`  - Successful: ${successful.length}`);
  console.log(`  - Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log();
    console.log("Failed migrations:");
    for (const f of failed) {
      console.log(`  - ${f.table}: ${f.error}`);
    }
  }

  console.log();
  console.log("Migration complete.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const modeArg = args.find(a => a.startsWith("--mode="));
  const mode = modeArg?.split("=")[1] || "dry-run";

  if (mode !== "dry-run" && mode !== "apply") {
    console.error("Invalid mode. Use --mode=dry-run or --mode=apply");
    process.exit(1);
  }

  try {
    await runMigration(mode === "apply");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
