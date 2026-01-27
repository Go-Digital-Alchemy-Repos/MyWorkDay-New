import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isProduction = process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 10,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

console.log(`[db] Pool initialized: min=2 max=10 idleTimeout=30s connectTimeout=5s ssl=${isProduction}`);

export interface PoolStats {
  total: number;
  active: number;
  idle: number;
  waiting: number;
}

export function getPoolStats(): PoolStats {
  return {
    total: pool.totalCount,
    active: pool.totalCount - pool.idleCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export async function connectWithRetry(maxRetries = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      const latency = Date.now() - start;
      console.log(`[db] Connected successfully on attempt ${attempt} (${latency}ms)`);
      return;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (attempt === maxRetries) {
        console.error(`[db] Connection failed after ${maxRetries} attempts: ${errMsg}`);
        throw err;
      }
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[db] Connection failed (attempt ${attempt}/${maxRetries}): ${errMsg}`);
      console.log(`[db] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export async function checkDbHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  pool: PoolStats;
  error?: string;
}> {
  const poolStats = getPoolStats();
  
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    
    return {
      connected: true,
      latencyMs,
      pool: poolStats,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: 0,
      pool: poolStats,
      error: err?.message || String(err),
    };
  }
}

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err?.message || err);
});

pool.on("connect", () => {
  const stats = getPoolStats();
  if (stats.total === stats.active && stats.waiting > 0) {
    console.warn(`[db] Pool exhausted! total=${stats.total} active=${stats.active} waiting=${stats.waiting}`);
  }
});
