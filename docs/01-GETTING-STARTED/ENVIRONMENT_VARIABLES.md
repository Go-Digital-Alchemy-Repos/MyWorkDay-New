# Environment Variables

**Status:** Current  
**Last Updated:** January 2026  
**Related Docs:** [Deployment](../10-DEPLOYMENT/), [Security](../07-SECURITY/)

---

## Overview

MyWorkDay uses environment variables for configuration. This document provides a complete reference for all available variables.

---

## Required Variables

These variables must be set for the application to run:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Secret for session signing | Random 32+ character string |
| `APP_ENCRYPTION_KEY` | 32-byte base64 key for secrets | See generation below |

### Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Production Variables

Set these for production deployments:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Enables secure cookies, production mode |
| `TRUST_PROXY` | `true` | Required for Railway/reverse proxy |

---

## Authentication

### Session Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | Required | Session signing secret |
| `SESSION_MAX_AGE` | 86400000 | Session duration (ms) |

### Google OAuth

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |

### Bootstrap

| Variable | Description |
|----------|-------------|
| `BOOTSTRAP_TOKEN` | One-time token for super admin creation |

---

## Multi-Tenancy

| Variable | Values | Description |
|----------|--------|-------------|
| `TENANCY_ENFORCEMENT` | `off`, `soft`, `strict` | Tenant isolation mode |

**Modes:**
- `off` - No enforcement (development only)
- `soft` - Log warnings, allow requests
- `strict` - Block requests without valid tenant

---

## Integrations

### Mailgun (Email)

| Variable | Description |
|----------|-------------|
| `MAILGUN_API_KEY` | Global Mailgun API key |
| `MAILGUN_DOMAIN` | Global Mailgun domain |
| `MAILGUN_FROM_EMAIL` | Default from address |
| `MAILGUN_DEBUG` | Set to `true` for debug logging |

### S3/R2 (Storage)

| Variable | Description |
|----------|-------------|
| `S3_ENDPOINT` | S3-compatible endpoint URL |
| `S3_ACCESS_KEY_ID` | Access key ID |
| `S3_SECRET_ACCESS_KEY` | Secret access key |
| `S3_BUCKET_NAME` | Bucket name |
| `S3_REGION` | Region (use `auto` for R2) |

### Stripe (Payments)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |

---

## Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_LOGIN_MAX` | 5 | Max login attempts |
| `RATE_LIMIT_LOGIN_WINDOW` | 900000 | Window in ms (15 min) |
| `RATE_LIMIT_REGISTER_MAX` | 3 | Max register attempts |
| `RATE_LIMIT_REGISTER_WINDOW` | 3600000 | Window in ms (1 hour) |

---

## Debug Flags

**⚠️ Use only in development or with extreme caution:**

| Variable | Description |
|----------|-------------|
| `MAILGUN_DEBUG` | Enable Mailgun request/response logging |
| `SUPER_DEBUG_DELETE_ALLOWED` | Enable data deletion in debug tools |
| `SUPER_DEBUG_ACTIONS_ALLOWED` | Enable debug actions (cache clear) |
| `BACKFILL_TENANT_IDS_ALLOWED` | Enable tenant ID backfill script |
| `BACKFILL_DRY_RUN` | Run backfill in dry-run mode |
| `PURGE_APP_DATA_ALLOWED` | Enable data purge script |
| `PURGE_APP_DATA_CONFIRM` | Confirmation for purge |
| `PURGE_PROD_ALLOWED` | Allow purge in production |
| `SUPER_USER_PROVISION_DEBUG` | Enable provisioning diagnostics |

---

## Example .env File

```env
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/myworkday
SESSION_SECRET=your-very-long-random-secret-string-here
APP_ENCRYPTION_KEY=base64-encoded-32-byte-key

# Production
NODE_ENV=production
TRUST_PROXY=true

# Optional: Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Optional: Mailgun
MAILGUN_API_KEY=key-xxx
MAILGUN_DOMAIN=mg.example.com
MAILGUN_FROM_EMAIL=noreply@example.com

# Optional: S3/R2
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=xxx
S3_SECRET_ACCESS_KEY=xxx
S3_BUCKET_NAME=myworkday
S3_REGION=auto

# Multi-tenancy
TENANCY_ENFORCEMENT=strict
```

---

## Frontend Variables

Variables prefixed with `VITE_` are available in the frontend:

```typescript
const value = import.meta.env.VITE_MY_VARIABLE;
```

Currently used:
- None (all configuration handled server-side)

---

## Related Sections

- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Production setup
- [07-SECURITY](../07-SECURITY/) - Security configuration
- [13-INTEGRATIONS](../13-INTEGRATIONS/) - Integration setup
