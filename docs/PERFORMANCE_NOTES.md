# Performance Optimization Notes

This document tracks N+1 query optimizations and recommended database indexes for the MyWorkDay application.

## N+1 Query Optimizations (Completed)

### Overview
Four critical endpoints have been optimized to reduce query count from O(N+1) to O(1) or O(2-4) fixed queries:

| Endpoint | Before | After | Method |
|----------|--------|-------|--------|
| `GET /api/v1/super/tenants-detail` | 2N+1 queries | 3 queries | `getTenantsWithDetails()` with batch fetches |
| `GET /api/v1/projects?includeCounts=true` | N+1 queries | 2 queries | `getOpenTaskCountsByProjectIds()` with GROUP BY |
| `GET /api/v1/projects/analytics/summary` | N+1 queries | 3 queries | `getTasksByProjectIds()` batch fetch |
| `GET /api/v1/projects/forecast/summary` | N+1 queries | 3-4 queries | `getTasksByProjectIds()` + parallel time entries |

### New Storage Methods

Located in `server/storage.ts`:

```typescript
// Batch count open tasks for multiple projects (GROUP BY optimization)
getOpenTaskCountsByProjectIds(projectIds: string[]): Promise<Map<string, number>>

// Batch fetch lightweight tasks for multiple projects (IN query)
getTasksByProjectIds(projectIds: string[]): Promise<Map<string, LightweightTask[]>>

// Fetch all tenants with settings and user counts (3 queries instead of 2N+1)
getTenantsWithDetails(): Promise<TenantWithDetails[]>
```

### Query Debug Utility

Enable query count tracking in development with:

```bash
QUERY_DEBUG=true npm run dev
```

Usage in code:
```typescript
import { createQueryTracker } from './lib/queryDebug';

const tracker = createQueryTracker("endpoint-name");
tracker.track("fetch-projects");
tracker.track("fetch-tasks");
tracker.log(); // Outputs: [QUERY_DEBUG] endpoint-name: 2 queries in Xms
```

## Recommended Database Indexes

The following indexes are recommended for optimal query performance but are not yet implemented. Add to `shared/schema.ts` when ready:

### Priority 1: High-Impact Foreign Key Indexes

```sql
-- Tasks by projectId (critical for batch task fetches)
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);

-- Task assignees by taskId (used in batch assignee fetches)
CREATE INDEX idx_task_assignees_task_id ON task_assignees(task_id);

-- Tenant scoping (critical for multi-tenant queries)
CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_time_entries_tenant_id ON time_entries(tenant_id);
```

### Priority 2: Workspace Scoping

```sql
-- Projects by workspace
CREATE INDEX idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX idx_projects_tenant_workspace ON projects(tenant_id, workspace_id);

-- Time entries by project (used in forecast calculations)
CREATE INDEX idx_time_entries_project_id ON time_entries(project_id);
```

### Priority 3: Analytics and Filtering

```sql
-- Tasks by due date (used in overdue/due today calculations)
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;

-- Tenant settings by tenantId
CREATE INDEX idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);

-- Projects by status (common filter)
CREATE INDEX idx_projects_status ON projects(status);
```

## Adding Indexes via Drizzle

To add indexes in `shared/schema.ts`:

```typescript
import { index } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id),
  tenantId: varchar("tenant_id").references(() => tenants.id),
  // ... other columns
}, (table) => ({
  projectIdIdx: index("idx_tasks_project_id").on(table.projectId),
  tenantIdIdx: index("idx_tasks_tenant_id").on(table.tenantId),
}));
```

Then run:
```bash
npm run db:push
```

## API Contract Guarantee

All optimizations maintain **zero API contract changes**:
- Response shapes remain identical
- Query parameters unchanged
- Tenancy scoping behavior preserved
- No new pagination requirements introduced

## Testing

Run existing smoke tests to verify no regressions:
```bash
npm test -- --grep "smoke|tenancy|workload"
```

## Future Optimization Candidates

1. **Time entries batch fetch**: Similar pattern could be applied to time entry aggregations
2. **Activity logs**: Could benefit from batch fetches in activity timeline
3. **Comments/attachments**: Candidate for batch loading in task drawer
4. **User lookups**: Frequently accessed, could use in-memory caching layer
