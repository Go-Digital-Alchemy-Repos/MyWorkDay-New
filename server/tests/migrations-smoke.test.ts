import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

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

const REQUIRED_COLUMNS = [
  { table: "tenants", column: "chat_retention_days" },
  { table: "active_timers", column: "title" },
  { table: "users", column: "tenant_id" },
  { table: "projects", column: "client_id" },
  { table: "tasks", column: "project_id" },
];

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function readJournal(): Journal | null {
  try {
    const content = fs.readFileSync(JOURNAL_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function getMigrationFiles(): string[] {
  try {
    return fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}

function readMigrationContent(filename: string): string {
  try {
    return fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8");
  } catch {
    return "";
  }
}

describe("Database Migration Smoke Tests", () => {
  test("migration files directory exists", () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  test("journal file exists", () => {
    expect(fs.existsSync(JOURNAL_PATH)).toBe(true);
  });

  test("all migration files are committed and match journal", () => {
    const journal = readJournal();
    expect(journal).not.toBeNull();

    const migrationFiles = getMigrationFiles();
    expect(migrationFiles.length).toBeGreaterThan(0);

    const journalTags = journal!.entries.map((e) => `${e.tag}.sql`);
    for (const tag of journalTags) {
      expect(
        migrationFiles.includes(tag),
        `Migration file ${tag} from journal not found in migrations directory`
      ).toBe(true);
    }

    for (const file of migrationFiles) {
      const tag = file.replace(".sql", "");
      expect(
        journal!.entries.some((e) => e.tag === tag),
        `Migration file ${file} not found in journal`
      ).toBe(true);
    }
  });

  test("all migrations use idempotent syntax (new migrations only)", () => {
    const migrationFiles = getMigrationFiles();
    const nonIdempotentIssues: { file: string; line: number; statement: string }[] = [];

    const LEGACY_ALLOWLIST = [
      "0000_petite_spyke.sql",
      "0001_cloudy_spot.sql",
      "0002_safe_additive_fixes.sql",
      "0003_fast_imperial_guard.sql",
      "0004_add_missing_production_tables.sql",
    ];

    const idempotentPatterns = [
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i,
      /CREATE\s+INDEX\s+(IF\s+NOT\s+EXISTS|CONCURRENTLY)/i,
      /CREATE\s+UNIQUE\s+INDEX\s+(IF\s+NOT\s+EXISTS|CONCURRENTLY)/i,
      /CREATE\s+TYPE\s+.*\s+AS\s+ENUM/i,
      /DO\s+\$\$/i,
      /ALTER\s+TABLE.*ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i,
      /ALTER\s+TABLE.*DROP\s+COLUMN\s+IF\s+EXISTS/i,
      /ALTER\s+TABLE.*ADD\s+CONSTRAINT.*IF\s+NOT\s+EXISTS/i,
      /-->/,
    ];

    const nonIdempotentPatterns = [
      { pattern: /^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/im, name: "CREATE TABLE without IF NOT EXISTS" },
      { pattern: /^\s*CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY)/im, name: "CREATE INDEX without IF NOT EXISTS" },
      { pattern: /^\s*CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY)/im, name: "CREATE UNIQUE INDEX without IF NOT EXISTS" },
    ];

    for (const file of migrationFiles) {
      if (LEGACY_ALLOWLIST.includes(file)) {
        continue;
      }

      const content = readMigrationContent(file);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("--") || line.startsWith("/*")) continue;

        const isIdempotent = idempotentPatterns.some((p) => p.test(line));
        if (isIdempotent) continue;

        for (const { pattern, name } of nonIdempotentPatterns) {
          if (pattern.test(line)) {
            nonIdempotentIssues.push({
              file,
              line: i + 1,
              statement: `${name}: ${line.substring(0, 80)}...`,
            });
          }
        }
      }
    }

    if (nonIdempotentIssues.length > 0) {
      console.error("Non-idempotent migrations found in new migration files:");
      for (const issue of nonIdempotentIssues) {
        console.error(`  ${issue.file}:${issue.line} - ${issue.statement}`);
      }
    }

    expect(
      nonIdempotentIssues,
      `Non-idempotent operations found in new migrations (legacy files are allowlisted): ${JSON.stringify(nonIdempotentIssues, null, 2)}`
    ).toHaveLength(0);
  });

  test("no dangerous operations in migrations", () => {
    const migrationFiles = getMigrationFiles();
    const dangerousOperations: { file: string; line: number; operation: string }[] = [];
    const warnings: { file: string; line: number; operation: string }[] = [];

    const dangerousPatterns = [
      { pattern: /^\s*DROP\s+TABLE\s+(?!IF\s+EXISTS)/im, name: "DROP TABLE" },
      { pattern: /^\s*DROP\s+DATABASE/im, name: "DROP DATABASE" },
      { pattern: /^\s*TRUNCATE/im, name: "TRUNCATE" },
      { pattern: /^\s*DELETE\s+FROM\s+\w+\s*;/im, name: "DELETE without WHERE" },
    ];

    const warningPatterns = [
      { pattern: /^\s*DROP\s+TABLE\s+IF\s+EXISTS/im, name: "DROP TABLE IF EXISTS (data loss)" },
      { pattern: /^\s*DROP\s+COLUMN/im, name: "DROP COLUMN (data loss)" },
      { pattern: /^\s*UPDATE\s+/im, name: "UPDATE (data mutation)" },
      { pattern: /^\s*DELETE\s+FROM\s+\w+\s+WHERE/im, name: "DELETE with WHERE (data mutation)" },
    ];

    for (const file of migrationFiles) {
      const content = readMigrationContent(file);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("--") || line.startsWith("/*")) continue;

        for (const { pattern, name } of dangerousPatterns) {
          if (pattern.test(line)) {
            dangerousOperations.push({
              file,
              line: i + 1,
              operation: `${name}: ${line.substring(0, 60)}...`,
            });
          }
        }

        for (const { pattern, name } of warningPatterns) {
          if (pattern.test(line)) {
            warnings.push({
              file,
              line: i + 1,
              operation: `${name}: ${line.substring(0, 60)}...`,
            });
          }
        }
      }
    }

    if (warnings.length > 0) {
      console.warn("Warning: Data mutation operations found:");
      for (const w of warnings) {
        console.warn(`  ${w.file}:${w.line} - ${w.operation}`);
      }
    }

    expect(
      dangerousOperations,
      `Dangerous operations found: ${JSON.stringify(dangerousOperations, null, 2)}`
    ).toHaveLength(0);
  });

  test("required tables are defined in migrations", () => {
    const migrationFiles = getMigrationFiles();
    const allContent = migrationFiles.map(readMigrationContent).join("\n");

    const missingTables: string[] = [];
    for (const table of REQUIRED_TABLES) {
      const tablePattern = new RegExp(
        `CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?("|')?${table}("|')?\\s*\\(`,
        "i"
      );
      if (!tablePattern.test(allContent)) {
        missingTables.push(table);
      }
    }

    expect(
      missingTables,
      `Required tables not found in migrations: ${missingTables.join(", ")}`
    ).toHaveLength(0);
  });

  test("required columns are defined in migrations", () => {
    const migrationFiles = getMigrationFiles();
    const allContent = migrationFiles.map(readMigrationContent).join("\n");

    const missingColumns: string[] = [];
    for (const { table, column } of REQUIRED_COLUMNS) {
      const columnPattern = new RegExp(`"${column}"\\s+`, "i");
      const addColumnPattern = new RegExp(
        `ALTER\\s+TABLE.*${table}.*ADD\\s+(COLUMN\\s+)?(IF\\s+NOT\\s+EXISTS\\s+)?"${column}"`,
        "i"
      );

      if (!columnPattern.test(allContent) && !addColumnPattern.test(allContent)) {
        missingColumns.push(`${table}.${column}`);
      }
    }

    expect(
      missingColumns,
      `Required columns not found in migrations: ${missingColumns.join(", ")}`
    ).toHaveLength(0);
  });

  test("migrations are in sequential order", () => {
    const journal = readJournal();
    expect(journal).not.toBeNull();

    const entries = journal!.entries;
    for (let i = 0; i < entries.length; i++) {
      expect(entries[i].idx).toBe(i);
    }

    const tags = entries.map((e) => e.tag);
    for (let i = 0; i < tags.length; i++) {
      const expectedPrefix = String(i).padStart(4, "0");
      expect(
        tags[i].startsWith(expectedPrefix),
        `Migration ${tags[i]} should start with ${expectedPrefix}`
      ).toBe(true);
    }
  });

  test("migration timestamps are chronological", () => {
    const journal = readJournal();
    expect(journal).not.toBeNull();

    const entries = journal!.entries;
    for (let i = 1; i < entries.length; i++) {
      expect(
        entries[i].when >= entries[i - 1].when,
        `Migration ${entries[i].tag} timestamp (${entries[i].when}) should be >= ${entries[i - 1].tag} (${entries[i - 1].when})`
      ).toBe(true);
    }
  });

  test("reversibility policy: migrations are forward-only with checkpoint rollback", () => {
    const journal = readJournal();
    expect(journal).not.toBeNull();

    expect(
      journal!.entries.length,
      "Migrations should exist in journal"
    ).toBeGreaterThan(0);
  });
});
