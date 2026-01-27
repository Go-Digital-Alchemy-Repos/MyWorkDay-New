# Railway Deployment Guide

Complete guide for deploying MyWorkDay on Railway with automatic database migrations.

## Quick Start

### 1. Create Railway Project

1. Go to [Railway](https://railway.app)
2. Create new project from GitHub repo
3. Add PostgreSQL database (New → Database → PostgreSQL)

### 2. Set Required Environment Variables

In Railway Dashboard → Variables, add:

```
AUTO_MIGRATE=true
FAIL_ON_SCHEMA_ISSUES=true
SESSION_SECRET=<generate-32-char-random-string>
APP_ENCRYPTION_KEY=<generate-with-openssl-rand-base64-32>
```

**Note**: `DATABASE_URL` and `NODE_ENV` are automatically set by Railway.

### 3. Deploy

Push to your connected branch or click "Deploy" in Railway dashboard.

---

## Environment Variables Reference

### Required Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `AUTO_MIGRATE` | `true` | **REQUIRED** - Runs database migrations automatically on startup |
| `FAIL_ON_SCHEMA_ISSUES` | `true` | **REQUIRED** - Fails fast if schema is incomplete |
| `SESSION_SECRET` | Random string | **REQUIRED** - Min 32 characters for session encryption |
| `APP_ENCRYPTION_KEY` | Base64 string | **REQUIRED** - 32 bytes, base64-encoded for tenant secrets |

### Auto-Set by Railway

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (from Railway PostgreSQL plugin) |
| `NODE_ENV` | Set to `production` automatically |
| `PORT` | Server port (Railway assigns dynamically) |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TENANCY_ENFORCEMENT` | `off` | Tenant isolation mode: `off`, `soft`, `strict` |
| `S3_BUCKET` | - | S3 bucket for file uploads |
| `S3_REGION` | - | AWS region |
| `S3_ACCESS_KEY_ID` | - | AWS access key |
| `S3_SECRET_ACCESS_KEY` | - | AWS secret key |

### Generating Secrets

```bash
# Generate SESSION_SECRET (32+ random characters)
openssl rand -hex 32

# Generate APP_ENCRYPTION_KEY (32 bytes, base64)
openssl rand -base64 32
```

---

## How Migrations Work

### Automatic Migration Flow

When `AUTO_MIGRATE=true`:

1. Server starts and binds to port (health checks pass immediately)
2. Schema readiness check runs
3. Drizzle migrations execute automatically
4. Tables and columns are verified
5. App becomes fully ready

### Startup Logs

Look for these log entries to confirm migrations ran:

```
[startup] Phase 2/6: schema started at <timestamp>
[schema] AUTO_MIGRATE=true, NODE_ENV=production
[migrations] Migrations started at <timestamp>
[migrations] Migrations completed in <ms>ms - applied <count> new migrations
[startup] Phase 6/6: App fully ready in <total>ms
```

### Verifying Migrations

**Before Deployment (Local)**:

```bash
# Verify migration files are idempotent
npx tsx server/scripts/verify-migrations.ts

# Run startup health check
npx tsx server/scripts/startup-health-check.ts
```

**After deployment**, check migration status:

```bash
# Via Super Admin API (requires authentication)
curl https://your-app.railway.app/api/v1/super/status/db \
  -H "Cookie: <session-cookie>"
```

Response includes:
- `migrations.total` - Count of applied migrations
- `migrations.applied` - List of all migrations with timestamps
- `migrations.pending` - Any unapplied migration files
- `tables.allExist` - Whether all required tables exist
- `schemaReady` - Overall schema readiness status

---

## Troubleshooting

### Issue: "relation does not exist" errors

**Cause**: Migrations didn't run - `AUTO_MIGRATE` not set or failed.

**Solution**:
1. Verify `AUTO_MIGRATE=true` is set in Railway variables
2. Check deployment logs for migration errors
3. Redeploy after setting the variable

**Logs to look for**:
```
[schema] AUTO_MIGRATE disabled - skipping automatic migrations
[schema] FATAL: Schema is NOT ready
```

### Issue: Deployment failing health checks

**Cause**: Server startup taking too long (>300 seconds).

**Solution**:
1. Check Railway logs for which phase is slow
2. Look for timeout warnings:
   ```
   [startup] ERROR: Phase <name> is taking longer than 25000ms
   ```
3. Database connection issues are common - verify PostgreSQL plugin is linked

### Issue: Migrations fail with errors

**Cause**: SQL syntax error or constraint violation in migration files.

**Solution**:
1. Check Railway logs for specific SQL error
2. Look for:
   ```
   [migrations] MIGRATION FAILED after <ms>ms
   [migrations] Error: <specific-error>
   ```
3. Fix the migration file and redeploy

### Issue: Sessions not persisting

**Cause**: `SESSION_SECRET` missing or changed.

**Solution**:
1. Ensure `SESSION_SECRET` is set (32+ characters)
2. Once set, never change it (invalidates all sessions)
3. Check auth diagnostics: `GET /api/v1/super/status/auth-diagnostics`

### Issue: File uploads failing

**Cause**: S3 not configured or credentials wrong.

**Solution**:
1. Set S3 environment variables (bucket, region, keys)
2. Verify bucket permissions and CORS settings
3. Check S3 status: `GET /api/v1/super/status/health`

---

## Deployment Checklist

Before deploying:

- [ ] `AUTO_MIGRATE=true` is set
- [ ] `FAIL_ON_SCHEMA_ISSUES=true` is set
- [ ] `SESSION_SECRET` is set (32+ characters, random)
- [ ] `APP_ENCRYPTION_KEY` is set (32 bytes, base64)
- [ ] PostgreSQL plugin is added and linked
- [ ] GitHub repo is connected

After deploying:

- [ ] Check deployment logs show "App fully ready"
- [ ] Health check at `/health` returns `{"ok":true}`
- [ ] No "relation does not exist" errors in logs
- [ ] Super Admin can access `/api/v1/super/status/db`
- [ ] All required tables exist (check status endpoint)

---

## Health Check Endpoints

Railway monitors these endpoints:

| Endpoint | Purpose | Returns |
|----------|---------|---------|
| `/health` | Primary health check | `{"ok":true/false, "ready":true/false}` |
| `/ready` | Startup phase status | `{"status":"ready", "phase":"ready", ...}` |
| `/healthz` | Kubernetes-style check | `ok` (text) |
| `/api/health` | API health check | `{"ok":true/false}` |

All endpoints return `200` immediately even during startup (status in body indicates readiness).

---

## Rolling Back

If a deployment causes issues:

### Via Railway Dashboard

1. Go to Deployments tab
2. Find the last working deployment
3. Click "Rollback"

### Via CLI

```bash
railway rollback
```

### Database Rollback

For database issues, use the rollback procedure documented in `docs/ROLLBACK_PROCEDURE.md`.

---

## Monitoring

### Logs

```bash
# View recent logs
railway logs

# Follow logs in real-time
railway logs --follow
```

### Key Log Patterns

```bash
# Check for startup issues
railway logs | grep "\[startup\]"

# Check for migration issues
railway logs | grep "\[migrations\]"

# Check for schema issues
railway logs | grep "\[schema\]"

# Check for errors
railway logs | grep "ERROR\|FATAL"
```

---

## Database Backups

Railway PostgreSQL includes automatic backups. For manual backup:

```bash
# Create backup
railway run pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore backup
railway run psql $DATABASE_URL < backup-20240101.sql
```

---

## Custom Domain

1. Railway Dashboard → Settings → Domains
2. Add your custom domain
3. Configure DNS as instructed
4. Railway handles SSL automatically

Set `APP_BASE_URL` to your custom domain for proper CORS and redirects.
