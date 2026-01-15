# Security Rate Limiting

This document describes the rate limiting implementation for brute-force protection on authentication endpoints.

## Overview

Rate limiting protects authentication endpoints from:
- **Brute-force attacks**: Prevents automated password guessing
- **Credential stuffing**: Limits attempts using stolen credential lists
- **Resource exhaustion**: Protects server resources from abuse

## Protected Endpoints

| Endpoint | Description | IP Limit | Email Limit |
|----------|-------------|----------|-------------|
| `POST /api/auth/login` | User login | 10/min | 5/min |
| `POST /api/v1/auth/bootstrap-register` | First user registration | 5/min | N/A |
| `POST /api/v1/auth/platform-invite/accept` | Platform invite acceptance | 10/min | N/A |
| `POST /api/v1/auth/forgot-password` | Password reset request (when implemented) | 5/min | 3/min |

## Configuration

All rate limits are configurable via environment variables:

### Login Rate Limits

```bash
# Time window in milliseconds (default: 60000 = 1 minute)
RATE_LIMIT_LOGIN_WINDOW_MS=60000

# Maximum requests per IP address within the window (default: 10)
RATE_LIMIT_LOGIN_MAX_IP=10

# Maximum requests per email address within the window (default: 5)
RATE_LIMIT_LOGIN_MAX_EMAIL=5
```

### Bootstrap Registration Rate Limits

```bash
# Time window in milliseconds (default: 60000 = 1 minute)
RATE_LIMIT_BOOTSTRAP_WINDOW_MS=60000

# Maximum requests per IP address within the window (default: 5)
RATE_LIMIT_BOOTSTRAP_MAX_IP=5
```

### Invite Acceptance Rate Limits

```bash
# Time window in milliseconds (default: 60000 = 1 minute)
RATE_LIMIT_INVITE_WINDOW_MS=60000

# Maximum requests per IP address within the window (default: 10)
RATE_LIMIT_INVITE_MAX_IP=10
```

### Forgot Password Rate Limits

```bash
# Time window in milliseconds (default: 60000 = 1 minute)
RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS=60000

# Maximum requests per IP address within the window (default: 5)
RATE_LIMIT_FORGOT_PASSWORD_MAX_IP=5

# Maximum requests per email address within the window (default: 3)
RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL=3
```

### Debug Logging

```bash
# Enable verbose rate limit logging (default: false)
RATE_LIMIT_DEBUG=true
```

## Strategy

### Dual-Layer Protection

1. **IP-based throttling**: Limits total requests from a single IP address
   - Prevents distributed attacks from a single source
   - Higher limit to avoid blocking shared IP addresses (NAT, corporate networks)

2. **Email-based throttling**: Limits attempts against a specific email
   - Prevents targeted attacks on individual accounts
   - Lower limit since legitimate users rarely fail this many times
   - Only applies to endpoints with email in request body

### Soft Throttling

The limits are intentionally permissive to avoid locking out legitimate users:
- 10 login attempts per minute per IP allows for typos and shared networks
- 5 attempts per email per minute handles password mistakes
- Limits reset after the window expires (no progressive lockout)

## Error Response

When rate limited, the endpoint returns:

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later.",
    "requestId": "req_1234567890_abc123",
    "retryAfter": 45
  }
}
```

### HTTP Headers

```
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1705312800
```

| Header | Description |
|--------|-------------|
| `Retry-After` | Seconds until the client can retry |
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Remaining requests in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

## Logging

Rate limit events are logged with structured JSON:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1234567890_abc123",
  "event": "rate_limit_blocked",
  "endpoint": "/api/auth/login",
  "ip": "192.168.1.1",
  "email": "tes***",
  "limitType": "ip",
  "remaining": 0,
  "blocked": true
}
```

**Privacy notes:**
- Email addresses are masked (first 3 chars + `***`)
- Passwords are never logged
- Full IP addresses are logged for security investigation

## Implementation Details

### Storage

Rate limit counters are stored in-memory using JavaScript `Map` objects:
- **Pros**: Fast, no external dependencies
- **Cons**: Not shared across multiple server instances

For multi-instance deployments, consider:
- Redis-based rate limiting
- Database-backed counters
- Distributed rate limit service

### Cleanup

Expired entries are automatically cleaned up every 60 seconds to prevent memory leaks.

### Key Generation

Rate limit keys follow the pattern:
- IP-based: `{prefix}:ip:{client_ip}`
- Email-based: `{prefix}:email:{lowercase_email}`

Email addresses are normalized to lowercase for consistent counting.

## Testing

Run the rate limit tests:

```bash
npx vitest run server/tests/rate_limit_triggers_429.test.ts
npx vitest run server/tests/rate_limit_does_not_break_normal_login.test.ts
```

## Production Recommendations

1. **Monitor rate limit logs** for attack patterns
2. **Adjust limits** based on legitimate usage patterns
3. **Consider Redis** for multi-instance deployments
4. **Add alerting** for sustained rate limit events
5. **Review limits** periodically as traffic grows

## Security Considerations

- Rate limiting alone is not sufficient - use strong password policies
- Consider adding CAPTCHA for repeated failures (not implemented)
- Monitor for distributed attacks across many IPs
- Log and analyze blocked requests for threat intelligence
