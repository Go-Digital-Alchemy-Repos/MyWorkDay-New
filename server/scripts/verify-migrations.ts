/**
 * Migration Verification Script
 * 
 * Checks all migration files for:
 * - Idempotent syntax (IF NOT EXISTS, IF EXISTS)
 * - Dangerous operations (DROP, TRUNCATE, DELETE)
 * - Required structure and naming
 * 
 * Usage:
 *   npx tsx server/scripts/verify-migrations.ts           # Normal mode (non-idempotent = warnings)
 *   npx tsx server/scripts/verify-migrations.ts --strict  # Strict mode (non-idempotent = issues)
 *   npx tsx server/scripts/verify-migrations.ts --json    # JSON output
 * 
 * Exit codes:
 *   0 = PASS (no issues)
 *   1 = FAIL (issues found)
 * 
 * Note: In normal mode, non-idempotent operations are warnings (exit 0).
 * In --strict mode, non-idempotent operations are issues (exit 1).
 */

import * as fs from "fs";
import * as path from "path";

interface MigrationCheck {
  file: string;
  hasIdempotentTables: boolean;
  hasIdempotentIndexes: boolean;
  hasIdempotentColumns: boolean;
  hasDangerousOperations: string[];
  warnings: string[];
  issues: string[];
}

interface VerificationResult {
  passed: boolean;
  timestamp: string;
  migrationsChecked: number;
  totalIssues: number;
  totalWarnings: number;
  migrations: MigrationCheck[];
  summary: string[];
}

const IDEMPOTENT_PATTERNS = {
  createTable: /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/gi,
  createIndex: /CREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?IF\s+NOT\s+EXISTS/gi,
  addColumn: /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi,
  dropTableIfExists: /DROP\s+TABLE\s+IF\s+EXISTS/gi,
  dropIndexIfExists: /DROP\s+INDEX\s+(CONCURRENTLY\s+)?IF\s+EXISTS/gi,
};

// These patterns are truly dangerous - always issues
const DANGEROUS_PATTERNS = [
  { pattern: /TRUNCATE\s+TABLE/gi, name: "TRUNCATE TABLE" },
  { pattern: /DROP\s+DATABASE/gi, name: "DROP DATABASE" },
  { pattern: /DROP\s+SCHEMA/gi, name: "DROP SCHEMA" },
];

// Helper to count safe vs unsafe drops
function countUnsafeDrops(content: string, type: "TABLE" | "INDEX"): number {
  const allDrops = content.match(new RegExp(`DROP\\s+${type}`, "gi")) || [];
  const safeDrops = content.match(
    new RegExp(`DROP\\s+${type}\\s+(CONCURRENTLY\\s+)?IF\\s+EXISTS`, "gi")
  ) || [];
  return allDrops.length - safeDrops.length;
}

// Helper to count unsafe deletes (DELETE without WHERE)
function countUnsafeDeletes(content: string): number {
  const lines = content.split("\n");
  let unsafeCount = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) continue; // Skip comments
    
    // Match DELETE FROM table_name; (without WHERE)
    if (/DELETE\s+FROM\s+["'\w]+\s*;/i.test(trimmed)) {
      unsafeCount++;
    }
  }
  return unsafeCount;
}

function checkMigrationFile(filePath: string, strictMode: boolean): MigrationCheck {
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, "utf-8");
  
  const issues: string[] = [];
  const warnings: string[] = [];
  const hasDangerousOperations: string[] = [];
  
  // Check for truly dangerous operations (always issues)
  for (const { pattern, name } of DANGEROUS_PATTERNS) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      hasDangerousOperations.push(name);
      issues.push(`Found dangerous operation: ${name} (${matches.length} occurrence(s))`);
    }
  }
  
  // Check for unsafe DROP TABLE (without IF EXISTS)
  const unsafeTableDrops = countUnsafeDrops(content, "TABLE");
  if (unsafeTableDrops > 0) {
    hasDangerousOperations.push("DROP TABLE (without IF EXISTS)");
    issues.push(`Found ${unsafeTableDrops} DROP TABLE without IF EXISTS`);
  }
  
  // Check for unsafe DROP INDEX (without IF EXISTS)
  const unsafeIndexDrops = countUnsafeDrops(content, "INDEX");
  if (unsafeIndexDrops > 0) {
    hasDangerousOperations.push("DROP INDEX (without IF EXISTS)");
    issues.push(`Found ${unsafeIndexDrops} DROP INDEX without IF EXISTS`);
  }
  
  // Check for unsafe DELETE (without WHERE)
  const unsafeDeletes = countUnsafeDeletes(content);
  if (unsafeDeletes > 0) {
    hasDangerousOperations.push("DELETE FROM (without WHERE)");
    issues.push(`Found ${unsafeDeletes} DELETE FROM without WHERE clause`);
  }
  
  // Check for idempotent CREATE TABLE
  const createTableMatches = content.match(/CREATE\s+TABLE/gi) || [];
  const idempotentTableMatches = content.match(IDEMPOTENT_PATTERNS.createTable) || [];
  const hasIdempotentTables = createTableMatches.length === 0 || 
    createTableMatches.length === idempotentTableMatches.length;
  
  if (!hasIdempotentTables) {
    const nonIdempotent = createTableMatches.length - idempotentTableMatches.length;
    const msg = `${nonIdempotent} CREATE TABLE statement(s) missing IF NOT EXISTS`;
    if (strictMode) {
      issues.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  
  // Check for idempotent CREATE INDEX (handle CONCURRENTLY)
  const createIndexMatches = content.match(/CREATE\s+(UNIQUE\s+)?INDEX/gi) || [];
  const idempotentIndexMatches = content.match(IDEMPOTENT_PATTERNS.createIndex) || [];
  const hasIdempotentIndexes = createIndexMatches.length === 0 || 
    createIndexMatches.length === idempotentIndexMatches.length;
  
  if (!hasIdempotentIndexes) {
    const nonIdempotent = createIndexMatches.length - idempotentIndexMatches.length;
    const msg = `${nonIdempotent} CREATE INDEX statement(s) missing IF NOT EXISTS`;
    if (strictMode) {
      issues.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  
  // Check for idempotent ADD COLUMN
  const addColumnMatches = content.match(/ADD\s+COLUMN/gi) || [];
  const idempotentColumnMatches = content.match(IDEMPOTENT_PATTERNS.addColumn) || [];
  const hasIdempotentColumns = addColumnMatches.length === 0 || 
    addColumnMatches.length === idempotentColumnMatches.length;
  
  if (!hasIdempotentColumns) {
    const nonIdempotent = addColumnMatches.length - idempotentColumnMatches.length;
    const msg = `${nonIdempotent} ADD COLUMN statement(s) missing IF NOT EXISTS`;
    if (strictMode) {
      issues.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  
  return {
    file: fileName,
    hasIdempotentTables,
    hasIdempotentIndexes,
    hasIdempotentColumns,
    hasDangerousOperations,
    warnings,
    issues,
  };
}

function verifyMigrations(strictMode: boolean = false): VerificationResult {
  const migrationsPath = path.resolve(process.cwd(), "migrations");
  
  if (!fs.existsSync(migrationsPath)) {
    return {
      passed: false,
      timestamp: new Date().toISOString(),
      migrationsChecked: 0,
      totalIssues: 1,
      totalWarnings: 0,
      migrations: [],
      summary: ["Migrations folder not found: " + migrationsPath],
    };
  }
  
  const migrationFiles = fs.readdirSync(migrationsPath)
    .filter(f => f.endsWith(".sql"))
    .sort();
  
  if (migrationFiles.length === 0) {
    return {
      passed: false,
      timestamp: new Date().toISOString(),
      migrationsChecked: 0,
      totalIssues: 1,
      totalWarnings: 0,
      migrations: [],
      summary: ["No migration files found in: " + migrationsPath],
    };
  }
  
  const migrations: MigrationCheck[] = [];
  let totalIssues = 0;
  let totalWarnings = 0;
  const summary: string[] = [];
  
  for (const file of migrationFiles) {
    const filePath = path.join(migrationsPath, file);
    const check = checkMigrationFile(filePath, strictMode);
    migrations.push(check);
    totalIssues += check.issues.length;
    totalWarnings += check.warnings.length;
  }
  
  // Check for required files
  const requiredFiles = [
    "0000_petite_spyke.sql",
    "0001_cloudy_spot.sql", 
    "0002_safe_additive_fixes.sql",
    "0003_fast_imperial_guard.sql",
    "0004_add_missing_production_tables.sql",
  ];
  
  for (const required of requiredFiles) {
    if (!migrationFiles.includes(required)) {
      summary.push(`Missing required migration: ${required}`);
      totalIssues++;
    }
  }
  
  // Check meta files
  const metaPath = path.join(migrationsPath, "meta");
  if (!fs.existsSync(metaPath)) {
    summary.push("Missing migrations/meta directory");
    totalIssues++;
  } else {
    const journalPath = path.join(metaPath, "_journal.json");
    if (!fs.existsSync(journalPath)) {
      summary.push("Missing migrations/meta/_journal.json");
      totalIssues++;
    }
  }
  
  // Build summary
  if (totalIssues === 0 && totalWarnings === 0) {
    summary.push("All migrations pass verification checks");
  } else {
    if (totalIssues > 0) {
      summary.push(`${totalIssues} issue(s) found that may cause deployment failures`);
    }
    if (totalWarnings > 0) {
      summary.push(`${totalWarnings} warning(s) found (may not be idempotent)`);
    }
  }
  
  return {
    passed: totalIssues === 0,
    timestamp: new Date().toISOString(),
    migrationsChecked: migrationFiles.length,
    totalIssues,
    totalWarnings,
    migrations,
    summary,
  };
}

// CLI execution
function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const strictMode = args.includes("--strict");
  
  console.log("[verify-migrations] Starting migration verification...");
  if (strictMode) {
    console.log("[verify-migrations] Running in STRICT mode (non-idempotent = issues)\n");
  } else {
    console.log("[verify-migrations] Running in normal mode (non-idempotent = warnings)\n");
  }
  
  const result = verifyMigrations(strictMode);
  
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("========================================");
    console.log(`VERIFICATION: ${result.passed ? "✓ PASS" : "✗ FAIL"}`);
    console.log("========================================\n");
    
    console.log(`Migrations checked: ${result.migrationsChecked}`);
    console.log(`Issues: ${result.totalIssues}`);
    console.log(`Warnings: ${result.totalWarnings}`);
    
    if (result.migrations.length > 0) {
      console.log("\nMigration Details:");
      for (const m of result.migrations) {
        const status = m.issues.length === 0 ? "✓" : "✗";
        console.log(`\n  ${status} ${m.file}`);
        
        if (m.issues.length > 0) {
          console.log("    Issues:");
          m.issues.forEach(i => console.log(`      - ${i}`));
        }
        
        if (m.warnings.length > 0) {
          console.log("    Warnings:");
          m.warnings.forEach(w => console.log(`      - ${w}`));
        }
        
        if (m.issues.length === 0 && m.warnings.length === 0) {
          console.log("    Idempotent: Tables ✓ | Indexes ✓ | Columns ✓");
        }
      }
    }
    
    if (result.summary.length > 0) {
      console.log("\nSummary:");
      result.summary.forEach(s => console.log(`  → ${s}`));
    }
    
    console.log("");
  }
  
  process.exit(result.passed ? 0 : 1);
}

// Export for programmatic use
export { verifyMigrations, VerificationResult, MigrationCheck };

// Run if executed directly
main();
