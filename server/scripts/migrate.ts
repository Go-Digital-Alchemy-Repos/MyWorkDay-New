/**
 * Non-interactive migration script for production deployments.
 * Runs all pending Drizzle migrations and exits.
 * 
 * Usage: npx tsx server/scripts/migrate.ts
 * 
 * This script:
 * - Connects to the database using DATABASE_URL
 * - Auto-baselines if database was created via db:push
 * - Runs all pending migrations from ./migrations folder
 * - Exits with code 0 on success, 1 on failure
 * - Never prompts for user input (safe for CI/CD)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { readFileSync, existsSync } from "fs";

// Migrations folder is always at project root/migrations
// process.cwd() is the project root in all environments
const PROJECT_ROOT = process.cwd();

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

/**
 * Auto-baseline migrations for databases created via db:push.
 * This marks all existing migrations as "applied" without running them.
 */
async function autoBaseline(pool: pg.Pool): Promise<void> {
  const journalPath = path.resolve(PROJECT_ROOT, "migrations/meta/_journal.json");
  
  if (!existsSync(journalPath)) {
    console.log("[migrate] No migrations journal found, skipping baseline");
    return;
  }

  const journal: Journal = JSON.parse(readFileSync(journalPath, "utf-8"));
  
  // Ensure drizzle migrations table exists
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
  `);

  // Check existing entries
  const { rows: existing } = await pool.query<{ hash: string }>(
    "SELECT hash FROM drizzle.__drizzle_migrations"
  );
  const existingHashes = new Set(existing.map(r => r.hash));

  // Insert missing entries
  let baselined = 0;
  for (const entry of journal.entries) {
    if (!existingHashes.has(entry.tag)) {
      await pool.query(
        "INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
        [entry.idx, entry.tag, entry.when]
      );
      baselined++;
    }
  }

  if (baselined > 0) {
    console.log(`[migrate] Auto-baselined ${baselined} migration(s)`);
  }
}

async function runMigrations() {
  const startTime = Date.now();
  console.log("[migrate] Starting database migrations...");

  if (!process.env.DATABASE_URL) {
    console.error("[migrate] ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    const db = drizzle(pool);
    const migrationsFolder = path.resolve(PROJECT_ROOT, "migrations");
    
    console.log(`[migrate] Running migrations from: ${migrationsFolder}`);
    
    try {
      await migrate(db, { migrationsFolder });
    } catch (migrationError: any) {
      // Check if this is a "table already exists" error (code 42P07)
      // This means the DB was set up via db:push - auto-baseline and retry
      if (migrationError?.code === "42P07") {
        console.log("[migrate] Detected db:push database, auto-baselining...");
        await autoBaseline(pool);
        
        // Retry migration after baseline
        await migrate(db, { migrationsFolder });
      } else {
        throw migrationError;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[migrate] Migrations completed successfully in ${duration}ms`);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("[migrate] Migration failed:", error);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();
