# Deployment

**Status:** Current  
**Last Updated:** January 2026

This section covers production deployment, monitoring, and operations.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [RAILWAY.md](./RAILWAY.md) | Railway deployment guide |
| [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) | Production env setup |
| [DATABASE_SETUP.md](./DATABASE_SETUP.md) | Production database |
| [MONITORING.md](./MONITORING.md) | Logging and monitoring |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Common issues and fixes |
| [ROLLBACK.md](./ROLLBACK.md) | Rollback procedures |

---

## Deployment Overview

MyWorkDay is designed for deployment on Railway with a PostgreSQL database.

### Architecture

```
┌─────────────────────────────────────┐
│           Railway                    │
│  ┌─────────────┐  ┌──────────────┐  │
│  │  App        │  │  PostgreSQL  │  │
│  │  Service    │──│  (Neon)      │  │
│  └─────────────┘  └──────────────┘  │
└─────────────────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
┌───▼───┐   ┌─────▼────┐
│  S3   │   │ Mailgun  │
│ (R2)  │   │          │
└───────┘   └──────────┘
```

---

## Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Session signing secret |
| `APP_ENCRYPTION_KEY` | Yes | 32-byte base64 encryption key |
| `NODE_ENV` | Yes | Set to `production` |
| `TRUST_PROXY` | Yes | Set to `true` for Railway |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `MAILGUN_API_KEY` | Global Mailgun API key |
| `MAILGUN_DOMAIN` | Global Mailgun domain |
| `S3_*` | S3/R2 storage configuration |

---

## Deployment Steps

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init
```

### 2. Add PostgreSQL

Add PostgreSQL service in Railway dashboard or:

```bash
railway add postgresql
```

### 3. Configure Environment

Set all required environment variables in Railway dashboard.

### 4. Deploy

```bash
railway up
```

---

## Database Migrations

### Production Migration Workflow

```bash
# 1. Generate migration
npx drizzle-kit generate

# 2. Review migration file
cat drizzle/*.sql

# 3. Apply migration
npx drizzle-kit migrate
```

**Important**: Never use `db:push` in production.

---

## First User Setup

The first user to register becomes Super Admin. For production:

1. Set `BOOTSTRAP_TOKEN` environment variable
2. POST to `/api/v1/super/bootstrap` with token
3. Or register first user through UI

---

## Health Checks

Railway performs health checks on:

```
GET /api/health
```

Returns:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-01-21T12:00:00Z"
}
```

---

## Related Sections

- [01-GETTING-STARTED](../01-GETTING-STARTED/) - Local setup
- [07-SECURITY](../07-SECURITY/) - Security configuration
- [12-OPERATIONS](../12-OPERATIONS/) - Ongoing operations
