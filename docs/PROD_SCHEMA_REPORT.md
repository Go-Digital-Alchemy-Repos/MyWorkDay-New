# Production Schema Report Tool

A read-only database introspection tool to verify schema state in any environment.

## Commands

### Run Locally
```bash
npx tsx server/scripts/db-introspect.ts
```

### Run on Railway
```bash
railway run npx tsx server/scripts/db-introspect.ts
```

### Run with Custom DATABASE_URL
```bash
DATABASE_URL="postgresql://user:pass@host:5432/db" npx tsx server/scripts/db-introspect.ts
```

## Sample Output

```
======================================================================
DATABASE INTROSPECTION REPORT
======================================================================
Timestamp: 2026-01-26T23:30:00.000Z
Database: myworkday
Version: PostgreSQL 15.4

----------------------------------------------------------------------
TABLES IN PUBLIC SCHEMA
----------------------------------------------------------------------
Total tables: 54

  - active_timers
  - activity_log
  - chat_attachments
  - chat_channels
  - notifications
  - tenant_settings
  - tenants
  - users
  ... (additional tables)

----------------------------------------------------------------------
CRITICAL TABLES STATUS
----------------------------------------------------------------------
[PRESENT]    tenants
[PRESENT]    tenant_settings
[PRESENT]    notifications
[PRESENT]    notification_preferences
[PRESENT]    chat_attachments
[PRESENT]    chat_messages
[PRESENT]    chat_channels
[PRESENT]    users

----------------------------------------------------------------------
COLUMN DETAILS FOR CRITICAL TABLES
----------------------------------------------------------------------

TENANTS (30 columns):
  - id                             varchar              NOT NULL
  - name                           varchar              NOT NULL
  - status                         varchar              NOT NULL DEFAULT 'active'
  ...

NOTIFICATIONS (9 columns):
  - id                             varchar              NOT NULL
  - tenant_id                      varchar              NOT NULL
  - user_id                        varchar              NOT NULL
  ...

----------------------------------------------------------------------
REQUIRED COLUMNS CHECK
----------------------------------------------------------------------

notifications:
  [PRESENT]    tenant_id (found as: tenant_id)

tenant_settings:
  [PRESENT]    chat_retention_days (found as: chat_retention_days)

chat_attachments:
  [PRESENT]    tenant_id (found as: tenant_id)

----------------------------------------------------------------------
SUMMARY
----------------------------------------------------------------------
[OK] All required tables and columns are present

======================================================================
```

## Exit Codes

- `0` - All required tables and columns are present
- `1` - Missing tables or columns detected (or error occurred)

## What It Checks

1. **All Tables** - Lists every table in the `public` schema
2. **Critical Tables** - Verifies presence of key application tables
3. **Column Details** - Shows all columns with types for critical tables
4. **Required Columns** - Checks specific columns that have caused issues:
   - `notifications.tenant_id`
   - `tenant_settings.chat_retention_days`
   - `chat_attachments.tenant_id`
   - `tenants.id`, `tenants.name`, `tenants.status`
   - `users.id`, `users.email`, `users.tenant_id`

## Troubleshooting

If columns are reported as missing:

1. Check if migrations have been run: `railway run npx tsx server/scripts/migrate.ts`
2. Compare schema.ts definitions with actual database columns
3. Generate new migrations if needed: `npx drizzle-kit generate`
