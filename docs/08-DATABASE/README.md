# Database

**Status:** Current  
**Last Updated:** January 2026

This section covers the PostgreSQL database schema, migrations, and query patterns.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [SCHEMA_REFERENCE.md](./SCHEMA_REFERENCE.md) | Complete schema docs |
| [MIGRATIONS.md](./MIGRATIONS.md) | Migration workflow |
| [RELATIONSHIPS.md](./RELATIONSHIPS.md) | Table relationships |
| [INDEXES.md](./INDEXES.md) | Index strategy |
| [BACKUPS.md](./BACKUPS.md) | Backup procedures |
| [QUERIES.md](./QUERIES.md) | Common query patterns |

---

## Overview

MyWorkDay uses PostgreSQL with Drizzle ORM for type-safe database access.

### Connection

```typescript
const db = drizzle(client, { schema });
```

Connection string via `DATABASE_URL` environment variable.

---

## Schema Structure

### Core Tables

| Table | Description |
|-------|-------------|
| `tenants` | Tenant organizations |
| `tenant_settings` | Tenant configuration |
| `users` | User accounts |
| `workspaces` | Workspaces within tenants |
| `workspace_members` | User-workspace associations |
| `teams` | Teams within workspaces |
| `team_members` | User-team associations |

### Project Management

| Table | Description |
|-------|-------------|
| `projects` | Projects within workspaces |
| `project_members` | User-project associations |
| `sections` | Kanban columns in projects |
| `tasks` | Tasks within sections |
| `task_assignees` | Multi-assignee support |
| `subtasks` | Child tasks |
| `tags` | Workspace-level tags |
| `task_tags` | Task-tag associations |

### CRM

| Table | Description |
|-------|-------------|
| `clients` | Client organizations |
| `client_contacts` | Contacts within clients |
| `client_invites` | Portal invitations |

### Time Tracking

| Table | Description |
|-------|-------------|
| `time_entries` | Logged time entries |
| `active_timers` | Running timers |

### Administration

| Table | Description |
|-------|-------------|
| `tenant_integrations` | Mailgun/S3 config |
| `tenant_agreements` | SaaS agreements |
| `tenant_agreement_acceptances` | User acceptances |
| `email_outbox` | Email logs |
| `tenancy_warnings` | Health warnings |
| `tenant_notes` | Internal notes |
| `tenant_audit_events` | Audit trail |

---

## Key Relationships

```
tenants
  └── users (tenantId)
  └── workspaces (tenantId)
       └── workspace_members
       └── teams
            └── team_members
       └── projects
            └── sections
                 └── tasks
                      └── task_assignees
                      └── subtasks
                      └── time_entries
       └── clients
            └── client_contacts
            └── projects (clientId)
```

---

## Tenant Isolation

Every data table includes a `tenantId` column:

```typescript
tenantId: uuid("tenant_id").notNull().references(() => tenants.id)
```

All queries filter by tenant:

```typescript
const projects = await db.query.projects.findMany({
  where: eq(projects.tenantId, tenantId),
});
```

---

## Migrations

### Development

```bash
# Push schema changes directly
npm run db:push
```

### Production

```bash
# Generate migration file
npx drizzle-kit generate

# Apply migration
npx drizzle-kit migrate
```

### Important Notes

- Never use `db:push` in production
- Always generate and review migrations
- Migrations preserve existing data

---

## Common Patterns

### Fetching with Relations

```typescript
const project = await db.query.projects.findFirst({
  where: eq(projects.id, projectId),
  with: {
    sections: {
      with: { tasks: true }
    },
    members: true
  }
});
```

### Transactions

```typescript
await db.transaction(async (tx) => {
  const tenant = await tx.insert(tenants).values(data).returning();
  await tx.insert(workspaces).values({ tenantId: tenant.id, ... });
});
```

---

## Performance

### Index Strategy

Key indexes on:
- All `tenantId` columns
- Foreign keys
- Search fields (name, email)
- Status/type fields for filtering

### Query Optimization

- Use `with` for related data (avoids N+1)
- Limit result sets with pagination
- Use indexed columns in WHERE clauses

---

## Related Sections

- [02-ARCHITECTURE](../02-ARCHITECTURE/) - System design
- [06-BACKEND](../06-BACKEND/) - Storage patterns
- [07-SECURITY](../07-SECURITY/) - Data protection
