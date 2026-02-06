# MyWorkDay - Environment Variables Reference

## Overview
This document lists all environment variables used in the application, grouped by category.

---

## Database

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `DATABASE_URL` | Yes | Yes | PostgreSQL connection string | - |
| `PGHOST` | No | No | PostgreSQL host (auto-set by Replit) | - |
| `PGPORT` | No | No | PostgreSQL port | 5432 |
| `PGUSER` | No | No | PostgreSQL user | - |
| `PGPASSWORD` | No | Yes | PostgreSQL password | - |
| `PGDATABASE` | No | No | PostgreSQL database name | - |

---

## Authentication

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `SESSION_SECRET` | Yes | Yes | Secret for session encryption. Generate with `openssl rand -hex 32` | - |

---

## S3 Storage (Optional)

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `S3_BUCKET` | No | No | S3 bucket name | - |
| `S3_REGION` | No | No | AWS region | `us-east-1` |
| `S3_ACCESS_KEY_ID` | No | Yes | AWS access key ID | - |
| `S3_SECRET_ACCESS_KEY` | No | Yes | AWS secret access key | - |
| `S3_ENDPOINT` | No | No | Custom S3 endpoint (for S3-compatible services) | - |

**Note:** If S3 is not configured, file upload features will be disabled.

---

## Mailgun (Optional)

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `MAILGUN_API_KEY` | No | Yes | Mailgun API key | - |
| `MAILGUN_DOMAIN` | No | No | Mailgun sending domain | - |
| `MAILGUN_SENDER_EMAIL` | No | No | Default sender email | `noreply@{domain}` |

**Note:** Per-tenant Mailgun configuration overrides global settings.

---

## Tenancy Enforcement

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `TENANCY_ENFORCEMENT` | No | No | Tenancy isolation mode: `off`, `soft`, `strict` | `soft` |

**Modes:**
- `off` - No enforcement (development only)
- `soft` - Log warnings but allow operations
- `strict` - Block cross-tenant operations

---

## Feature Flags

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `AGREEMENT_GUARD_ENABLED` | No | No | Enable Phase 3C agreement gating | `false` |
| `BOOTSTRAP_TOKEN` | No | Yes | One-time token for super admin creation | - |

---

## Dangerous Operations Flags

These flags enable destructive operations. **Never enable in production without explicit intent.**

### Data Purge
| Variable | Required | Description |
|----------|----------|-------------|
| `PURGE_APP_DATA_ALLOWED` | No | Set to `true` to enable purge endpoint |
| `PURGE_APP_DATA_CONFIRM` | No | Must equal `YES_PURGE_APP_DATA` |
| `PURGE_PROD_ALLOWED` | No | Set to `true` to allow purge in production |

### TenantId Backfill
| Variable | Required | Description |
|----------|----------|-------------|
| `BACKFILL_TENANT_IDS_ALLOWED` | No | Set to `true` to enable backfill apply mode |
| `BACKFILL_DRY_RUN` | No | Set to `false` to apply changes (default: `true`) |

### Super Admin Debug Tools
| Variable | Required | Description |
|----------|----------|-------------|
| `SUPER_DEBUG_DELETE_ALLOWED` | No | Set to `true` to enable permanent delete from quarantine |
| `SUPER_DEBUG_ACTIONS_ALLOWED` | No | Set to `true` to enable cache/health recompute actions |

---

## Encryption

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `ENCRYPTION_KEY` | No | Yes | 32-byte hex key for tenant secret encryption. Generate with `openssl rand -hex 32` | Auto-derived from SESSION_SECRET |

**Note:** If not set, derived from SESSION_SECRET using HKDF. For production, set explicitly.

---

## Runtime

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `NODE_ENV` | No | No | Environment: `development`, `production` | `development` |
| `PORT` | No | No | Server port | `5000` |

---

## Quick Reference: Production Checklist

### Must Set (Secrets)
- [ ] `DATABASE_URL`
- [ ] `SESSION_SECRET`
- [ ] `ENCRYPTION_KEY` (recommended)

### Should Set (Integrations)
- [ ] `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (for file uploads)
- [ ] `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` (for email)

### Production Configuration
- [ ] `NODE_ENV=production`
- [ ] `TENANCY_ENFORCEMENT=strict` (after data cleanup)

### Never Set in Production (Unless Emergency)
- [ ] `PURGE_APP_DATA_ALLOWED`
- [ ] `PURGE_PROD_ALLOWED`
- [ ] `BACKFILL_TENANT_IDS_ALLOWED`
- [ ] `SUPER_DEBUG_DELETE_ALLOWED`

---

## CRM & Client Portal Feature Flags (Optional)

All flags default to `false`. Set to `true` to enable the corresponding CRM feature.

| Variable | Required | Secret | Description | Default |
|----------|----------|--------|-------------|---------|
| `CRM_CLIENT_360_ENABLED` | No | No | Enable Customer 360 client profile, follow-ups, pipeline, profitability | `false` |
| `CRM_CONTACTS_ENABLED` | No | No | Enable contacts management per client | `false` |
| `CRM_TIMELINE_ENABLED` | No | No | Enable unified activity timeline on client pages | `false` |
| `CRM_PORTAL_ENABLED` | No | No | Enable enhanced client portal dashboard and features | `false` |
| `CRM_FILES_ENABLED` | No | No | Enable files & deliverables library | `false` |
| `CRM_APPROVALS_ENABLED` | No | No | Enable review & approve workflows | `false` |
| `CRM_CLIENT_MESSAGING_ENABLED` | No | No | Enable secure messaging between team and client portal users | `false` |

> See `docs/CRM/CRM_PORTAL_ROADMAP.md` for full feature descriptions and implementation phases.

---

## Environment Variable Sources

### Replit
Set in the "Secrets" tab. Secrets are encrypted and injected at runtime.

### Railway
Set in the "Variables" tab of your service. Can be grouped into shared variable groups.

### Local Development
Create a `.env` file (not committed to git):
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/myworkday
SESSION_SECRET=development-secret-change-in-production
```

---

*Last Updated: January 2026*
