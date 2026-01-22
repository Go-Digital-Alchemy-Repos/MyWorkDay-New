# Error Logging System

## Overview

MyWorkDay includes a centralized error logging system designed for production debugging. All server-side errors with status codes 500+ are automatically captured to a dedicated database table with full context for troubleshooting.

## Key Features

- **Automatic Error Capture**: All 500+ errors and key 4xx errors are logged with request context
- **Key 4xx Capture**: Captures 403 (Forbidden), 404 (Not Found), and 429 (Rate Limited) for security/debugging
- **Request ID Correlation**: Every error includes the requestId for tracing across logs
- **Request ID in Toasts**: 500+ errors display a reference ID in toast notifications for user support
- **Secret Redaction**: Sensitive data (passwords, API keys, tokens) are automatically redacted
- **Stack Trace Storage**: Full stack traces stored server-side only, never exposed to tenants
- **Tenant/User Context**: Errors include tenantId and userId for scoped debugging
- **Database Error Details**: PostgreSQL error codes and constraint names captured
- **Super Admin Only Access**: Only platform administrators can view error logs

## Architecture

### Database Schema

```sql
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(64) NOT NULL,
  tenant_id UUID,
  user_id UUID,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(512) NOT NULL,
  status INTEGER NOT NULL,
  error_name VARCHAR(128),
  message TEXT NOT NULL,
  stack TEXT,
  db_code VARCHAR(32),
  db_constraint VARCHAR(256),
  meta JSONB,
  environment VARCHAR(32),
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Middleware Chain

```
Request → requestIdMiddleware → ... → errorLoggingMiddleware → errorHandler
```

The `errorLoggingMiddleware` intercepts errors after they're thrown and before the final error response is sent, capturing the error context asynchronously without blocking the response.

## Secret Redaction

The following patterns are automatically redacted from error logs:

| Pattern | Example |
|---------|---------|
| password | `password="secret"` → `[REDACTED]` |
| api_key, apiKey | `api_key="sk-abc"` → `[REDACTED]` |
| token, accessToken | `token="jwt..."` → `[REDACTED]` |
| authorization | `Authorization: Bearer ...` → `[REDACTED]` |
| secret | `clientSecret="xyz"` → `[REDACTED]` |
| private_key | `private_key="..."` → `[REDACTED]` |
| database_url | `database_url="postgres://..."` → `[REDACTED]` |

Both string patterns (in stack traces/messages) and object keys (in request bodies) are redacted.

## API Endpoints

All endpoints require Super Admin authentication (`role: super_user`).

### List Error Logs

```
GET /api/v1/super/status/error-logs
```

Query Parameters:
- `status` (number): Filter by HTTP status code
- `pathContains` (string): Filter by path substring
- `resolved` (boolean): Filter by resolved status
- `limit` (number): Page size (default: 20)
- `offset` (number): Page offset (default: 0)

Response:
```json
{
  "ok": true,
  "requestId": "req_abc123",
  "logs": [...],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### Get Error Log Detail

```
GET /api/v1/super/status/error-logs/:id
```

Returns full error details including stack trace.

### Resolve Error Log

```
PATCH /api/v1/super/status/error-logs/:id/resolve
```

Body:
```json
{
  "resolved": true
}
```

## UI Access

Error logs are accessible in the Super Admin dashboard:

1. Navigate to **System Status** tab
2. Click the **Error Logs** tab
3. Use filters to narrow down errors:
   - Path contains (e.g., `/api/tasks`)
   - Status code (500, 501, 502, 503)
   - Resolved status (all, unresolved, resolved)
4. Click any row to view full error details
5. Copy request ID to correlate with other logs

## Captured Error Types

### 500+ Server Errors (Always Captured)

All internal server errors are automatically captured, including:
- Database connection failures
- Unhandled exceptions
- Internal processing errors
- Integration failures

### Key 4xx Errors (Selective Capture)

The following 4xx errors are captured for debugging and security monitoring:

| Status | Name | Why Captured |
|--------|------|--------------|
| 403 | Forbidden | Security - potential permission misconfigurations or unauthorized access attempts |
| 404 | Not Found | May indicate broken links, invalid API calls, or route misconfigurations |
| 429 | Rate Limited | Abuse detection, rate limit tuning, capacity planning |

Non-key 4xx errors (400, 401, 402, etc.) are NOT captured to reduce log noise.

## Request ID in Tenant UI

When a 500+ error occurs, tenant users see a toast notification with a reference ID:

```
Something went wrong
Please try again later. (Ref: abc12345)
```

This reference ID is the first 8 characters of the request ID, allowing users to report issues to support. Support can then look up the full error in the Error Logs panel using the reference.

The utility function `formatErrorForToast(error)` in `client/src/lib/parseApiError.ts` handles this:

```typescript
import { formatErrorForToast } from "@/lib/parseApiError";

onError: (error: Error) => {
  const { title, description } = formatErrorForToast(error);
  toast({ title, description, variant: "destructive" });
}
```

## Debugging Workflow

### 1. Error Discovery

When a user reports an issue, get the request ID from:
- Error toast message (if shown to user)
- Browser network tab (X-Request-Id header)
- User's screenshot

### 2. Error Lookup

```
GET /api/v1/super/status/error-logs?pathContains=/api/tasks
```

Or use the UI filter with the path or request ID.

### 3. Error Analysis

Check the error details:
- **Error Message**: What went wrong
- **Stack Trace**: Where in code
- **DB Code/Constraint**: Database-specific issues
- **Meta**: Request body, query params (redacted)
- **Tenant/User ID**: Which tenant/user affected

### 4. Log Correlation

Use the request ID to search server logs:

```bash
grep "req_abc123" /var/log/myworkday/*.log
```

Or check Railway logs with the request ID.

## Testing

Run the error logging test suite:

```bash
npx vitest run server/tests/error-logging.test.ts
```

Tests cover:
- Super user only access enforcement
- String secret redaction patterns
- Object key secret redaction
- API response shape stability

## Configuration

### Environment Variables

None required - error logging is always enabled.

### Retention

Error logs are not automatically purged. Consider implementing a retention policy for production:

```sql
DELETE FROM error_logs 
WHERE created_at < NOW() - INTERVAL '90 days'
  AND resolved = TRUE;
```

## Security Considerations

1. **Stack Traces**: Never exposed to non-super-users
2. **Secret Redaction**: Applied before storage
3. **Access Control**: Enforced at API level
4. **Request ID**: Non-sequential, unpredictable
5. **Tenant Isolation**: Errors tagged with tenantId for scoped access (future)

## Integration with Existing Systems

### Chat Debug Panel

Error logs complement the Chat Debug panel. Chat-specific errors appear in both:
- Chat Debug: Real-time socket events and metrics
- Error Logs: Persistent 500+ errors with full context

### Request ID Middleware

Error logging uses the same `requestId` from `requestIdMiddleware`, ensuring consistent correlation across:
- HTTP response headers (X-Request-Id)
- Server logs
- Error toasts
- Error logs table

## Troubleshooting

### Errors Not Appearing

1. Check status code - captured errors include 500+ and key 4xx (403, 404, 429)
2. Verify `errorLoggingMiddleware` is in middleware chain
3. Check database connectivity

### Missing Stack Traces

Stack traces are only available to super users viewing error details. They are never exposed in list views or to tenant users.

### Performance Impact

Error logging is asynchronous (fire-and-forget) and does not block error responses. Storage failures are caught and logged to console without impacting the application.
