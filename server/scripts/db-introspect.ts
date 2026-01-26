/**
 * Database Introspection Tool (READ-ONLY)
 * 
 * Connects to PostgreSQL and prints a schema report showing:
 * - All tables in the public schema
 * - Column details for critical tables
 * - Present/missing status for required columns
 * 
 * Usage: 
 *   Local:   npx tsx server/scripts/db-introspect.ts
 *   Railway: railway run npx tsx server/scripts/db-introspect.ts
 */

import pg from "pg";

const CRITICAL_TABLES = [
  "tenants",
  "tenant_settings",
  "notifications",
  "notification_preferences",
  "chat_attachments",
  "chat_messages",
  "chat_channels",
  "users",
];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  notifications: ["tenant_id", "tenantId"],
  tenant_settings: ["chat_retention_days", "chatRetentionDays"],
  chat_attachments: ["tenant_id", "tenantId"],
  tenants: ["id", "name", "status"],
  users: ["id", "email", "tenant_id", "tenantId"],
};

interface TableInfo {
  table_name: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

async function introspect() {
  console.log("=".repeat(70));
  console.log("DATABASE INTROSPECTION REPORT");
  console.log("=".repeat(70));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    // Get database info
    const { rows: dbInfo } = await pool.query<{ current_database: string; version: string }>(
      "SELECT current_database(), version()"
    );
    console.log(`Database: ${dbInfo[0].current_database}`);
    console.log(`Version: ${dbInfo[0].version.split(",")[0]}`);
    console.log("");

    // List all tables in public schema
    console.log("-".repeat(70));
    console.log("TABLES IN PUBLIC SCHEMA");
    console.log("-".repeat(70));
    
    const { rows: tables } = await pool.query<TableInfo>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const tableNames = new Set(tables.map(t => t.table_name));
    console.log(`Total tables: ${tables.length}`);
    console.log("");
    
    for (const table of tables) {
      console.log(`  - ${table.table_name}`);
    }
    console.log("");

    // Check critical tables
    console.log("-".repeat(70));
    console.log("CRITICAL TABLES STATUS");
    console.log("-".repeat(70));
    
    for (const tableName of CRITICAL_TABLES) {
      const exists = tableNames.has(tableName);
      const status = exists ? "[PRESENT]" : "[MISSING]";
      console.log(`${status.padEnd(12)} ${tableName}`);
    }
    console.log("");

    // Column details for critical tables
    console.log("-".repeat(70));
    console.log("COLUMN DETAILS FOR CRITICAL TABLES");
    console.log("-".repeat(70));

    for (const tableName of CRITICAL_TABLES) {
      if (!tableNames.has(tableName)) {
        console.log(`\n${tableName.toUpperCase()}: [TABLE MISSING]`);
        continue;
      }

      const { rows: columns } = await pool.query<ColumnInfo>(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      console.log(`\n${tableName.toUpperCase()} (${columns.length} columns):`);
      
      for (const col of columns) {
        const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default.substring(0, 30)}` : "";
        console.log(`  - ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${nullable}${defaultVal}`);
      }
    }
    console.log("");

    // Required columns check
    console.log("-".repeat(70));
    console.log("REQUIRED COLUMNS CHECK");
    console.log("-".repeat(70));

    let allPresent = true;

    for (const [tableName, requiredCols] of Object.entries(REQUIRED_COLUMNS)) {
      console.log(`\n${tableName}:`);
      
      if (!tableNames.has(tableName)) {
        console.log(`  [TABLE MISSING] - Cannot check columns`);
        allPresent = false;
        continue;
      }

      const { rows: columns } = await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName]);

      const columnNames = new Set(columns.map(c => c.column_name));

      for (const reqCol of requiredCols) {
        // Check both snake_case and camelCase versions
        const snakeCase = reqCol.replace(/([A-Z])/g, "_$1").toLowerCase();
        const camelCase = reqCol.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        
        const hasColumn = columnNames.has(reqCol) || columnNames.has(snakeCase) || columnNames.has(camelCase);
        const status = hasColumn ? "[PRESENT]" : "[MISSING]";
        
        if (!hasColumn) {
          allPresent = false;
        }

        const foundAs = hasColumn 
          ? columnNames.has(reqCol) ? reqCol : (columnNames.has(snakeCase) ? snakeCase : camelCase)
          : "N/A";
        
        console.log(`  ${status.padEnd(12)} ${reqCol}${hasColumn ? ` (found as: ${foundAs})` : ""}`);
      }
    }

    console.log("");
    console.log("-".repeat(70));
    console.log("SUMMARY");
    console.log("-".repeat(70));
    
    if (allPresent) {
      console.log("[OK] All required tables and columns are present");
    } else {
      console.log("[WARNING] Some required tables or columns are missing");
      console.log("         Review the report above for details");
    }
    
    console.log("");
    console.log("=".repeat(70));

    await pool.end();
    process.exit(allPresent ? 0 : 1);
  } catch (error) {
    console.error("ERROR: Introspection failed:", error);
    await pool.end();
    process.exit(1);
  }
}

introspect();
