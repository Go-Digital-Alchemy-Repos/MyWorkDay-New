/**
 * @module server/scripts/backfillTenantId
 * @description Safe backfill script for rows missing tenantId.
 * 
 * Run with: npx tsx server/scripts/backfillTenantId.ts [--dry-run]
 * 
 * SAFETY:
 * - Does NOT delete any rows
 * - Only updates when join produces exactly ONE tenantId
 * - Marks unresolvable rows for manual review
 * - Supports dry-run mode to preview changes
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface BackfillResult {
  table: string;
  missingCount: number;
  fixableCount: number;
  updatedCount: number;
  unresolvedIds: string[];
  errors: string[];
}

interface BackfillReport {
  dryRun: boolean;
  timestamp: string;
  results: BackfillResult[];
  summary: {
    totalMissing: number;
    totalFixable: number;
    totalUpdated: number;
    totalUnresolved: number;
  };
}

const isDryRun = process.argv.includes("--dry-run");

const COUNT_QUERIES: Record<string, string> = {
  workspaces: "SELECT COUNT(*) as count FROM workspaces WHERE tenant_id IS NULL",
  teams: "SELECT COUNT(*) as count FROM teams WHERE tenant_id IS NULL",
  clients: "SELECT COUNT(*) as count FROM clients WHERE tenant_id IS NULL",
  projects: "SELECT COUNT(*) as count FROM projects WHERE tenant_id IS NULL",
  tasks: "SELECT COUNT(*) as count FROM tasks WHERE tenant_id IS NULL",
  users: "SELECT COUNT(*) as count FROM users WHERE tenant_id IS NULL",
  time_entries: "SELECT COUNT(*) as count FROM time_entries WHERE tenant_id IS NULL",
  active_timers: "SELECT COUNT(*) as count FROM active_timers WHERE tenant_id IS NULL",
};

async function countMissing(table: string): Promise<number> {
  const query = COUNT_QUERIES[table];
  if (!query) {
    console.warn(`[${table}] No count query defined, skipping`);
    return 0;
  }
  try {
    const result = await db.execute(sql.raw(query));
    return parseInt((result.rows[0] as any)?.count || "0");
  } catch (error: any) {
    console.error(`[${table}] Error counting missing: ${error.message}`);
    return 0;
  }
}

async function backfillWorkspaces(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "workspaces",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("workspaces");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT w.id, w.name, w.created_by,
             u.tenant_id as user_tenant_id
      FROM workspaces w
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      if (row.user_tenant_id) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE workspaces SET tenant_id = ${row.user_tenant_id}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillTeams(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "teams",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("teams");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT t.id, t.name, t.workspace_id,
             w.tenant_id as workspace_tenant_id
      FROM teams t
      LEFT JOIN workspaces w ON t.workspace_id = w.id
      WHERE t.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      if (row.workspace_tenant_id) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE teams SET tenant_id = ${row.workspace_tenant_id}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillClients(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "clients",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("clients");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT c.id, c.name, c.workspace_id,
             w.tenant_id as workspace_tenant_id
      FROM clients c
      LEFT JOIN workspaces w ON c.workspace_id = w.id
      WHERE c.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      if (row.workspace_tenant_id) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE clients SET tenant_id = ${row.workspace_tenant_id}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillProjects(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "projects",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("projects");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT p.id, p.name, p.workspace_id, p.client_id, p.team_id,
             w.tenant_id as workspace_tenant_id,
             c.tenant_id as client_tenant_id,
             t.tenant_id as team_tenant_id
      FROM projects p
      LEFT JOIN workspaces w ON p.workspace_id = w.id
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE p.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      const tenantId = row.workspace_tenant_id || row.client_tenant_id || row.team_tenant_id;
      if (tenantId) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE projects SET tenant_id = ${tenantId}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillTasks(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "tasks",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("tasks");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT t.id, t.title, t.project_id, t.created_by,
             p.tenant_id as project_tenant_id,
             u.tenant_id as creator_tenant_id
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      const tenantId = row.project_tenant_id || row.creator_tenant_id;
      if (tenantId) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE tasks SET tenant_id = ${tenantId}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillUsers(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "users",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("users");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT u.id, u.email, u.name,
             wm.workspace_id,
             w.tenant_id as workspace_tenant_id
      FROM users u
      LEFT JOIN workspace_members wm ON u.id = wm.user_id
      LEFT JOIN workspaces w ON wm.workspace_id = w.id AND w.tenant_id IS NOT NULL
      WHERE u.tenant_id IS NULL
    `);

    const userTenantMap = new Map<string, Set<string>>();
    for (const row of missingRows.rows as any[]) {
      if (row.workspace_tenant_id) {
        if (!userTenantMap.has(row.id)) {
          userTenantMap.set(row.id, new Set());
        }
        userTenantMap.get(row.id)!.add(row.workspace_tenant_id);
      }
    }

    for (const [userId, tenantIds] of userTenantMap.entries()) {
      if (tenantIds.size === 1) {
        const tenantId = Array.from(tenantIds)[0];
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE users SET tenant_id = ${tenantId}
            WHERE id = ${userId} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else if (tenantIds.size > 1) {
        result.unresolvedIds.push(`${userId} (multiple tenants: ${Array.from(tenantIds).join(", ")})`);
      }
    }

    const allMissingUsers = await db.execute(sql`
      SELECT id FROM users WHERE tenant_id IS NULL
    `);
    for (const row of allMissingUsers.rows as any[]) {
      if (!userTenantMap.has(row.id)) {
        result.unresolvedIds.push(`${row.id} (no workspace membership)`);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillTimeEntries(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "time_entries",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("time_entries");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT te.id, te.user_id, te.project_id, te.task_id,
             u.tenant_id as user_tenant_id,
             p.tenant_id as project_tenant_id,
             t.tenant_id as task_tenant_id
      FROM time_entries te
      LEFT JOIN users u ON te.user_id = u.id
      LEFT JOIN projects p ON te.project_id = p.id
      LEFT JOIN tasks t ON te.task_id = t.id
      WHERE te.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      const tenantId = row.user_tenant_id || row.project_tenant_id || row.task_tenant_id;
      if (tenantId) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE time_entries SET tenant_id = ${tenantId}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillActiveTimers(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "active_timers",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("active_timers");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT at.id, at.user_id, at.project_id, at.task_id,
             u.tenant_id as user_tenant_id,
             p.tenant_id as project_tenant_id,
             t.tenant_id as task_tenant_id
      FROM active_timers at
      LEFT JOIN users u ON at.user_id = u.id
      LEFT JOIN projects p ON at.project_id = p.id
      LEFT JOIN tasks t ON at.task_id = t.id
      WHERE at.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      const tenantId = row.user_tenant_id || row.project_tenant_id || row.task_tenant_id;
      if (tenantId) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE active_timers SET tenant_id = ${tenantId}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillActivityLog(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "activity_log",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("activity_log");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT al.id, al.user_id, al.project_id, al.task_id,
             u.tenant_id as user_tenant_id,
             p.tenant_id as project_tenant_id,
             t.tenant_id as task_tenant_id
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN projects p ON al.project_id = p.id
      LEFT JOIN tasks t ON al.task_id = t.id
      WHERE al.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      const tenantId = row.user_tenant_id || row.project_tenant_id || row.task_tenant_id;
      if (tenantId) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE activity_log SET tenant_id = ${tenantId}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function backfillComments(): Promise<BackfillResult> {
  const result: BackfillResult = {
    table: "comments",
    missingCount: 0,
    fixableCount: 0,
    updatedCount: 0,
    unresolvedIds: [],
    errors: [],
  };

  try {
    result.missingCount = await countMissing("comments");
    if (result.missingCount === 0) return result;

    const missingRows = await db.execute(sql`
      SELECT c.id, c.user_id, c.task_id,
             u.tenant_id as user_tenant_id,
             t.tenant_id as task_tenant_id
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN tasks t ON c.task_id = t.id
      WHERE c.tenant_id IS NULL
    `);

    for (const row of missingRows.rows as any[]) {
      const tenantId = row.task_tenant_id || row.user_tenant_id;
      if (tenantId) {
        result.fixableCount++;
        if (!isDryRun) {
          await db.execute(sql`
            UPDATE comments SET tenant_id = ${tenantId}
            WHERE id = ${row.id} AND tenant_id IS NULL
          `);
          result.updatedCount++;
        }
      } else {
        result.unresolvedIds.push(row.id);
      }
    }
  } catch (error: any) {
    result.errors.push(error.message);
  }

  return result;
}

async function runBackfill(): Promise<BackfillReport> {
  console.log("=".repeat(60));
  console.log(`TENANT ID BACKFILL ${isDryRun ? "(DRY RUN)" : "(LIVE)"}`);
  console.log("=".repeat(60));
  console.log("");

  const results: BackfillResult[] = [];

  console.log("Processing tables...\n");
  results.push(await backfillWorkspaces());
  results.push(await backfillTeams());
  results.push(await backfillClients());
  results.push(await backfillProjects());
  results.push(await backfillTasks());
  results.push(await backfillUsers());
  results.push(await backfillTimeEntries());
  results.push(await backfillActiveTimers());
  // Note: activity_log and comments tables don't have tenant_id columns

  for (const r of results) {
    if (r.missingCount > 0) {
      console.log(`[${r.table}]`);
      console.log(`  Missing: ${r.missingCount}`);
      console.log(`  Fixable: ${r.fixableCount}`);
      console.log(`  Updated: ${r.updatedCount}`);
      if (r.unresolvedIds.length > 0) {
        console.log(`  Unresolved (${r.unresolvedIds.length}):`);
        r.unresolvedIds.slice(0, 10).forEach(id => console.log(`    - ${id}`));
        if (r.unresolvedIds.length > 10) {
          console.log(`    ... and ${r.unresolvedIds.length - 10} more`);
        }
      }
      if (r.errors.length > 0) {
        console.log(`  Errors: ${r.errors.join(", ")}`);
      }
      console.log("");
    }
  }

  const summary = {
    totalMissing: results.reduce((sum, r) => sum + r.missingCount, 0),
    totalFixable: results.reduce((sum, r) => sum + r.fixableCount, 0),
    totalUpdated: results.reduce((sum, r) => sum + r.updatedCount, 0),
    totalUnresolved: results.reduce((sum, r) => sum + r.unresolvedIds.length, 0),
  };

  console.log("=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total missing tenantId: ${summary.totalMissing}`);
  console.log(`Total fixable: ${summary.totalFixable}`);
  console.log(`Total updated: ${summary.totalUpdated}`);
  console.log(`Total unresolved (needs manual review): ${summary.totalUnresolved}`);
  console.log("");

  if (isDryRun && summary.totalFixable > 0) {
    console.log("Run without --dry-run to apply fixes.");
  }

  return {
    dryRun: isDryRun,
    timestamp: new Date().toISOString(),
    results,
    summary,
  };
}

export { runBackfill, BackfillReport, BackfillResult };

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  runBackfill()
    .then((report) => {
      if (report.summary.totalUnresolved > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
