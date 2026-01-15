# Super Admin System Status Dashboard

## Overview

The System Status Dashboard provides Super Admins with comprehensive visibility into the health and configuration of the MyWorkDay platform. It consolidates multiple health checks into a single, easy-to-read interface.

## Accessing the Dashboard

1. Log in as a Super Admin user (`role: "super_user"`)
2. Navigate to **System Status** from the super admin sidebar
3. The **System Health** tab shows both quick health checks and detailed status summary

## API Endpoint

```
GET /api/v1/super/status/summary
```

### Authentication
- Requires authenticated user session
- Requires `super_user` role
- Returns 401 for unauthenticated requests
- Returns 403 for non-super users (including tenant admins)

### Response Format

```json
{
  "ok": true,
  "requestId": "req_1705312345_abc1234",
  "timestamp": "2025-01-15T07:00:00.000Z",
  "checks": {
    "db": {
      "status": "ok",
      "latencyMs": 5
    },
    "migrations": {
      "version": "5 migrations applied",
      "available": true
    },
    "s3": {
      "configured": true,
      "presign": "ok"
    },
    "mailgun": {
      "configured": true
    },
    "auth": {
      "cookieSecure": true,
      "cookieHttpOnly": true,
      "cookieSameSite": "lax",
      "trustProxy": true,
      "sessionSecretSet": true,
      "environment": "production"
    },
    "orphanCounts": {
      "totalMissing": 0,
      "totalQuarantined": 0,
      "byTable": {
        "users": 0,
        "projects": 0,
        "tasks": 0
      }
    }
  }
}
```

## Health Check Details

### Database (`checks.db`)
- **status**: `"ok"` or `"failed"` - connectivity check via `SELECT 1`
- **latencyMs**: Round-trip time in milliseconds
- **error**: Present only when status is failed

### Migrations (`checks.migrations`)
- **version**: Current migration version or count
- **available**: Whether migration table is accessible

### S3 Storage (`checks.s3`)
- **configured**: Whether AWS credentials and bucket are set
- **presign**: `"ok"`, `"failed"`, or `"not_tested"` - tests presigned URL generation
- **error**: Present only when presign test fails

The presign test generates a temporary upload URL without actually uploading data, verifying that:
1. S3 credentials are valid
2. Bucket exists and is accessible
3. Presigned URL generation works correctly

### Mailgun (`checks.mailgun`)
- **configured**: Whether MAILGUN_API_KEY and MAILGUN_DOMAIN are set

Note: This check only verifies configuration presence, not API validity. Use the "Send Test Email" feature in Tenant Integrations for full validation.

### Auth Configuration (`checks.auth`)
- **cookieSecure**: Whether cookies require HTTPS (should be `true` in production)
- **cookieHttpOnly**: Whether cookies are HTTP-only (prevents XSS access)
- **cookieSameSite**: Cookie SameSite policy (`"lax"`, `"strict"`, or `"none"`)
- **trustProxy**: Whether Express trusts proxy headers (required behind load balancers)
- **sessionSecretSet**: Whether SESSION_SECRET environment variable is configured
- **environment**: Current NODE_ENV value

### Orphan Counts (`checks.orphanCounts`)
- **totalMissing**: Count of records across all tables missing `tenantId`
- **totalQuarantined**: Count of records moved to quarantine tenant
- **byTable**: Breakdown by table name

## Security Considerations

### No Secrets Exposed
The endpoint never exposes actual secret values:
- API keys are reported only as boolean (configured/not configured)
- Database URLs are never included
- Session secrets are reported only as presence check

### Request ID Correlation
Every response includes a top-level `requestId` for debugging and audit trail purposes. Additionally, when individual checks fail, their error objects may include the `requestId` for correlation.

### Access Control
- Endpoint is protected by both `requireAuth` and `requireSuperUser` middleware
- Tenant admins cannot access this endpoint
- All access is logged via standard request logging

## UI Features

The Detailed Status Summary card in the System Health tab provides:

1. **Visual Status Indicators**: Color-coded badges for quick status assessment
2. **Expandable Orphan Details**: Click to view per-table breakdown
3. **Refresh Button**: Manual refresh with loading state
4. **Timestamp Display**: Shows when data was last fetched
5. **Request ID**: Displayed for debugging purposes

## Troubleshooting

### Common Issues

**Database check fails**
- Verify DATABASE_URL environment variable is correct
- Check PostgreSQL server connectivity
- Look for connection pool exhaustion in logs

**S3 presign test fails**
- Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are valid
- Check AWS_REGION matches your bucket location
- Ensure AWS_S3_BUCKET_NAME exists and IAM user has write permissions

**Orphan counts show issues**
- Navigate to Tenant Health tab for detailed remediation tools
- Use backfill or quarantine features to address orphaned records

**Session secret not set warning**
- Set SESSION_SECRET in production environment
- Use a strong, randomly generated secret (at least 32 characters)

## Related Documentation

- [Email Observability](./EMAIL_OBSERVABILITY.md) - Email outbox and resend features
- [Security Rate Limits](./SECURITY_RATE_LIMITS.md) - Rate limiting configuration
- [Multi-Tenancy](./MULTI_TENANCY.md) - Tenant health and enforcement
