# Deployment Guide - Railway

## Overview

MyWorkDay is deployed on Railway with a PostgreSQL database. This guide covers setup, configuration, and common issues.

## Prerequisites

- Railway account
- GitHub repository connected
- PostgreSQL plugin added

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `SESSION_SECRET` | Session encryption key (32+ chars) | `your-secure-random-string` |
| `ENCRYPTION_KEY` | Tenant secrets encryption (64 hex chars) | Generate with `openssl rand -hex 32` |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (Railway sets this) | `5000` |

### Super Admin Bootstrap

| Variable | Description |
|----------|-------------|
| `SUPER_ADMIN_BOOTSTRAP_TOKEN` | One-time token for super admin creation |
| `SUPER_ADMIN_EMAIL` | Super admin email (optional, can be in request) |
| `SUPER_ADMIN_PASSWORD` | Super admin password (optional) |
| `SUPER_ADMIN_FIRST_NAME` | Super admin first name |
| `SUPER_ADMIN_LAST_NAME` | Super admin last name |

### Optional: Global S3 Configuration

| Variable | Description |
|----------|-------------|
| `S3_BUCKET` | S3 bucket name |
| `S3_REGION` | AWS region |
| `S3_ACCESS_KEY_ID` | AWS access key |
| `S3_SECRET_ACCESS_KEY` | AWS secret key |
| `S3_ENDPOINT` | Custom endpoint (for S3-compatible services) |

### Optional: Tenancy Configuration

| Variable | Description | Options |
|----------|-------------|---------|
| `TENANCY_ENFORCEMENT` | Tenant isolation mode | `off`, `soft`, `strict` |

## Initial Setup

### 1. Create Railway Project

```bash
railway init
railway add
```

### 2. Add PostgreSQL

In Railway dashboard:
1. Click "New"
2. Select "Database"
3. Choose "PostgreSQL"
4. Link to your project

### 3. Set Environment Variables

In Railway dashboard → Variables:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=your-secure-random-string
ENCRYPTION_KEY=<run: openssl rand -hex 32>
NODE_ENV=production
```

### 4. Deploy

```bash
railway up
```

Or connect GitHub for automatic deployments.

### 5. Run Database Migrations

```bash
railway run npx drizzle-kit push
```

### 6. Create Super Admin

```bash
curl -X POST https://your-app.railway.app/api/v1/super/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: your-bootstrap-token" \
  -d '{
    "email": "admin@example.com",
    "password": "secure-password",
    "firstName": "Super",
    "lastName": "Admin"
  }'
```

## Common Issues

### Issue: Session Not Persisting

**Cause**: Missing or invalid `SESSION_SECRET`

**Solution**:
1. Generate a strong random string (32+ characters)
2. Set `SESSION_SECRET` in Railway variables
3. Redeploy

### Issue: "Encryption key not configured"

**Cause**: `ENCRYPTION_KEY` not set or wrong format

**Solution**:
1. Generate key: `openssl rand -hex 32`
2. Set `ENCRYPTION_KEY` in Railway (64 hex characters)
3. Redeploy

**Important**: Once set, do NOT change the encryption key or you'll lose access to encrypted tenant secrets.

### Issue: Mailgun Settings Not Saving

**Cause**: Usually encryption key issue

**Solution**:
1. Verify `ENCRYPTION_KEY` is set correctly
2. Check Railway logs for encryption errors
3. If key changed, tenant integrations need re-configuration

### Issue: 403 Errors After Login

**Cause**: User has no workspace or tenant is inactive

**Solution**:
1. Check user has `tenantId` assigned
2. Verify tenant status is ACTIVE
3. Ensure user is member of at least one workspace

### Issue: File Uploads Failing

**Cause**: S3 not configured or credentials wrong

**Solution**:
1. Configure S3 variables (global or per-tenant)
2. Verify bucket permissions
3. Check CORS configuration on bucket

### Issue: Real-time Updates Not Working

**Cause**: WebSocket connection failing

**Solution**:
1. Ensure Railway supports WebSockets
2. Check browser console for connection errors
3. Verify no proxy blocking WebSocket upgrade

## Health Checks

Railway automatically monitors the `/api/health` endpoint:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Scaling

Railway handles scaling automatically. For manual control:

1. Dashboard → Settings → Scale
2. Adjust replicas as needed
3. Note: Session store is PostgreSQL-backed for multi-replica support

## Logs

View logs in Railway dashboard or CLI:

```bash
railway logs
railway logs --follow
```

## Database Backups

Railway PostgreSQL includes automatic backups. For manual backup:

```bash
railway run pg_dump $DATABASE_URL > backup.sql
```

## Rolling Back

In Railway dashboard:
1. Go to Deployments
2. Find previous working deployment
3. Click "Rollback"

Or via CLI:

```bash
railway rollback
```

## Custom Domain

1. Railway Dashboard → Settings → Domains
2. Add custom domain
3. Configure DNS as instructed
4. Railway handles SSL automatically

## Monitoring

Recommended monitoring setup:
1. Railway's built-in metrics
2. Sentry for error tracking (add `SENTRY_DSN` env var)
3. Application-level logging to Railway logs

## Security Checklist

- [ ] `SESSION_SECRET` is unique and secure
- [ ] `ENCRYPTION_KEY` is backed up securely
- [ ] `SUPER_ADMIN_BOOTSTRAP_TOKEN` removed after use
- [ ] `NODE_ENV` set to `production`
- [ ] `TENANCY_ENFORCEMENT` set to `strict`
- [ ] Database has strong password
- [ ] S3 bucket has minimal required permissions
