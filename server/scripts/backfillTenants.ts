#!/usr/bin/env tsx
/**
 * CLI Backfill Script for Tenant Assignment
 * 
 * This script assigns tenantId to records that are missing tenant assignments.
 * Safe to run in production as part of Railway jobs.
 * 
 * Usage:
 *   npx tsx server/scripts/backfillTenants.ts [--dry-run] [--target-tenant <slug-or-id>]
 * 
 * Options:
 *   --dry-run         Show what would be updated without making changes
 *   --target-tenant   Specify target tenant by slug or ID (defaults to 'default' or first active tenant)
 * 
 * Examples:
 *   npx tsx server/scripts/backfillTenants.ts --dry-run
 *   npx tsx server/scripts/backfillTenants.ts --target-tenant acme-corp
 *   npx tsx server/scripts/backfillTenants.ts
 */

import { db } from "../db";
import { 
  tenants, users, teams, clients, projects, tasks, 
  timeEntries, activeTimers, invitations, appSettings,
  TenantStatus
} from "@shared/schema";
import { eq, sql, isNull, or } from "drizzle-orm";

interface BackfillResult {
  table: string;
  beforeCount: number;
  updatedCount: number;
  afterCount: number;
}

function parseArgs(): { dryRun: boolean; targetTenant: string | null } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let targetTenant: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--target-tenant" && args[i + 1]) {
      targetTenant = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Tenant Backfill Script

Usage:
  npx tsx server/scripts/backfillTenants.ts [options]

Options:
  --dry-run             Show what would be updated without making changes
  --target-tenant <id>  Specify target tenant by slug or ID
  --help, -h            Show this help message

Examples:
  npx tsx server/scripts/backfillTenants.ts --dry-run
  npx tsx server/scripts/backfillTenants.ts --target-tenant acme-corp
  npx tsx server/scripts/backfillTenants.ts
      `);
      process.exit(0);
    }
  }

  return { dryRun, targetTenant };
}

async function findOrCreateTargetTenant(targetTenant: string | null): Promise<{ id: string; slug: string; name: string }> {
  const DEFAULT_TENANT_ID = "default-tenant";
  const DEFAULT_TENANT_SLUG = "default";
  const DEFAULT_TENANT_NAME = "Default Organization";

  if (targetTenant) {
    const [tenant] = await db
      .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
      .from(tenants)
      .where(or(eq(tenants.slug, targetTenant), eq(tenants.id, targetTenant)))
      .limit(1);
    
    if (tenant) return tenant;
    throw new Error(`Tenant not found: ${targetTenant}`);
  }

  const [defaultTenant] = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, DEFAULT_TENANT_ID))
    .limit(1);

  if (defaultTenant) return defaultTenant;

  console.log("Creating default tenant...");
  await db.insert(tenants).values({
    id: DEFAULT_TENANT_ID,
    name: DEFAULT_TENANT_NAME,
    slug: DEFAULT_TENANT_SLUG,
    status: TenantStatus.ACTIVE,
  });
  console.log("Default tenant created.");

  return { id: DEFAULT_TENANT_ID, slug: DEFAULT_TENANT_SLUG, name: DEFAULT_TENANT_NAME };
}

async function countMissingTenantIds(): Promise<Record<string, number>> {
  const tablesToCheck = [
    { name: "users", table: users },
    { name: "teams", table: teams },
    { name: "clients", table: clients },
    { name: "projects", table: projects },
    { name: "tasks", table: tasks },
    { name: "timeEntries", table: timeEntries },
    { name: "activeTimers", table: activeTimers },
    { name: "invitations", table: invitations },
    { name: "appSettings", table: appSettings },
  ];

  const counts: Record<string, number> = {};

  for (const { name, table } of tablesToCheck) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(table as any)
      .where(isNull((table as any).tenantId));
    counts[name] = Number(result[0]?.count || 0);
  }

  return counts;
}

async function backfillTable(
  tableName: string, 
  table: any, 
  tenantId: string, 
  dryRun: boolean
): Promise<BackfillResult> {
  const beforeResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .where(isNull(table.tenantId));
  const beforeCount = Number(beforeResult[0]?.count || 0);

  let updatedCount = 0;
  if (!dryRun && beforeCount > 0) {
    await db
      .update(table)
      .set({ tenantId })
      .where(isNull(table.tenantId));
    updatedCount = beforeCount;
  }

  const afterResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .where(isNull(table.tenantId));
  const afterCount = dryRun ? beforeCount : Number(afterResult[0]?.count || 0);

  return {
    table: tableName,
    beforeCount,
    updatedCount: dryRun ? 0 : updatedCount,
    afterCount
  };
}

async function main() {
  console.log("========================================");
  console.log("   Tenant Backfill Script");
  console.log("========================================\n");

  const { dryRun, targetTenant } = parseArgs();

  if (dryRun) {
    console.log("MODE: DRY RUN (no changes will be made)\n");
  } else {
    console.log("MODE: LIVE (changes will be applied)\n");
  }

  console.log("Finding target tenant...");
  const tenant = await findOrCreateTargetTenant(targetTenant);
  console.log(`Target tenant: ${tenant.name} (${tenant.slug})\n`);

  console.log("Scanning for missing tenantIds...");
  const initialCounts = await countMissingTenantIds();
  
  const totalMissing = Object.values(initialCounts).reduce((a, b) => a + b, 0);
  if (totalMissing === 0) {
    console.log("\n✅ All records already have tenantId assigned. Nothing to do.");
    process.exit(0);
  }

  console.log("\nRecords missing tenantId:");
  console.log("----------------------------------------");
  for (const [table, count] of Object.entries(initialCounts)) {
    if (count > 0) {
      console.log(`  ${table}: ${count}`);
    }
  }
  console.log(`----------------------------------------`);
  console.log(`  Total: ${totalMissing}\n`);

  if (dryRun) {
    console.log("DRY RUN: Would assign these records to tenant:", tenant.slug);
    console.log("\nRun without --dry-run to apply changes.");
    process.exit(0);
  }

  console.log("Starting backfill...\n");

  const tablesToBackfill = [
    { name: "users", table: users },
    { name: "teams", table: teams },
    { name: "clients", table: clients },
    { name: "projects", table: projects },
    { name: "tasks", table: tasks },
    { name: "timeEntries", table: timeEntries },
    { name: "activeTimers", table: activeTimers },
    { name: "invitations", table: invitations },
    { name: "appSettings", table: appSettings },
  ];

  const results: BackfillResult[] = [];

  for (const { name, table } of tablesToBackfill) {
    if (initialCounts[name] > 0) {
      console.log(`  Backfilling ${name}...`);
      const result = await backfillTable(name, table, tenant.id, dryRun);
      results.push(result);
      console.log(`    ✓ Updated ${result.updatedCount} records`);
    }
  }

  console.log("\n========================================");
  console.log("   Backfill Complete");
  console.log("========================================\n");

  console.log("Results:");
  console.log("----------------------------------------");
  for (const result of results) {
    console.log(`  ${result.table}: ${result.beforeCount} → ${result.afterCount}`);
  }
  console.log("----------------------------------------");

  const finalCounts = await countMissingTenantIds();
  const remaining = Object.values(finalCounts).reduce((a, b) => a + b, 0);

  if (remaining === 0) {
    console.log("\n✅ All records now have tenantId assigned.");
    console.log("\nYou can now safely enable TENANCY_ENFORCEMENT=strict");
  } else {
    console.log(`\n⚠️  ${remaining} records still missing tenantId`);
    console.log("Check for errors and re-run if needed.");
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("\n❌ Backfill failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});
