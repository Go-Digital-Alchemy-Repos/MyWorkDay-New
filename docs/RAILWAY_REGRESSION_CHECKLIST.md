# Railway Deployment Regression Checklist

## Pre-Deployment Checks

### 1. Run Smoke Tests Locally
```bash
npx vitest run server/tests/tenant-core-flows-smoke.test.ts
```
All tests should pass. Any schema-related failures indicate production parity issues.

### 2. Run Schema Introspection
```bash
npx tsx server/scripts/db-introspect.ts
```
Verify all required columns show `[PRESENT]`.

### 3. Run Production Parity Check
```bash
npx tsx server/scripts/production-parity-check.ts
```
Should output: `Passed: true`

---

## Post-Deployment Verification

### 1. Check Error Logs
- Login as Super Admin
- Navigate to System Status > Error Logs
- Look for any `SchemaParityError` entries
- Check for 500 errors in the last hour

### 2. Verify Core Endpoints (No 500s)

| Endpoint | Expected |
|----------|----------|
| `GET /api/clients` | 200 (array) |
| `GET /api/projects` | 200 (array) |
| `GET /api/tasks` | 200 (array) |
| `GET /api/v1/notifications` | 200 (array) |
| `GET /api/v1/tenant/settings` | 200 (object or 404) |
| `GET /api/v1/super/status/summary` | 200 (Super Admin only) |

### 3. Test Tenant Core Flows
1. **Create a test client** - Should have `tenantId` populated
2. **Create a test project** - Should have `tenantId` populated
3. **Create a test task** - Should have `tenantId` populated
4. **Trigger a notification** (assign task) - Should not 500

### 4. Verify Schema Parity

Run on Railway:
```bash
railway run npx tsx server/scripts/db-introspect.ts
```

Critical columns that must exist:
- `notifications.tenant_id`
- `notification_preferences` (table)
- `tenant_settings.chat_retention_days`
- `error_logs.request_id`

---

## Rollback Triggers

Rollback immediately if:
1. Any 500 errors on core tenant endpoints
2. `SchemaParityError` in error logs
3. Missing critical columns detected by parity check
4. Users unable to create clients/projects/tasks

---

## Migration Safety

### Additive-Only Pattern
All migrations use `IF NOT EXISTS` patterns:
```sql
DO $$
BEGIN
    IF NOT EXISTS (...) THEN
        ALTER TABLE ... ADD COLUMN ...;
    END IF;
END $$;
```

### Run Migrations on Railway
```bash
railway run npx tsx server/scripts/migrate.ts
```

This is automatically run on deployment via `railway.toml`:
```toml
[deploy]
startCommand = "npx tsx server/scripts/migrate.ts && npm run start"
```

---

## Monitoring

### Error Log Query (Super Admin)
```
GET /api/v1/super/status/error-logs?status=500&limit=50
```

### X-Request-Id Correlation
Every error response includes `X-Request-Id` header.
Users see: `"Something went wrong (Ref: abc12345)"`
Super Admin can search error logs by this ID.

---

## Files Reference

| File | Purpose |
|------|---------|
| `server/tests/tenant-core-flows-smoke.test.ts` | Smoke tests for schema parity |
| `server/scripts/production-parity-check.ts` | Startup schema verification |
| `server/scripts/db-introspect.ts` | Manual schema inspection |
| `migrations/0002_safe_additive_fixes.sql` | Additive schema repairs |
