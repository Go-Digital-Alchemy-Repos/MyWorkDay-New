/**
 * Baseline migrations script for existing databases.
 * 
 * Run this ONCE on databases that were created using db:push to mark
 * existing migrations as "already applied" without running them.
 * 
 * Usage: npx tsx server/scripts/baseline-migrations.ts
 * 
 * This is needed when:
 * - Database was set up using drizzle-kit push
 * - You're switching to migration-based deployments
 * - Running migrations fails with "table already exists" errors
 */

import pg from "pg";
import { readFileSync } from "fs";
import path from "path";

// Use process.cwd() for bundled environments
const __dirname = process.cwd();

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

async function baselineMigrations() {
  console.log("[baseline] Starting migration baseline...");

  if (!process.env.DATABASE_URL) {
    console.error("[baseline] ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    // Read the migrations journal
    const journalPath = path.resolve(__dirname, "../../migrations/meta/_journal.json");
    const journal: Journal = JSON.parse(readFileSync(journalPath, "utf-8"));
    
    console.log(`[baseline] Found ${journal.entries.length} migrations to baseline`);

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
    for (const entry of journal.entries) {
      if (existingHashes.has(entry.tag)) {
        console.log(`[baseline] Already baselined: ${entry.tag}`);
        continue;
      }

      await pool.query(
        "INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES ($1, $2, $3)",
        [entry.idx, entry.tag, entry.when]
      );
      console.log(`[baseline] Baselined: ${entry.tag}`);
    }

    console.log("[baseline] Baseline completed successfully");
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("[baseline] Baseline failed:", error);
    await pool.end();
    process.exit(1);
  }
}

baselineMigrations();
