# API Error Handling Guide

This document describes the standardized error handling approach used throughout the MyWorkDay application.

## Standard Error Envelope

All API errors return a consistent JSON structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "status": 400,
    "requestId": "uuid-for-correlation",
    "details": { "field": "value" }
  },
  "message": "Human-readable error message",
  "code": "VALIDATION_ERROR"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `error.code` | string | Stable, machine-readable error code (see below) |
| `error.message` | string | Human-readable message safe to display to users |
| `error.status` | number | HTTP status code |
| `error.requestId` | string | Unique request ID for log correlation |
| `error.details` | any? | Optional additional context (validation errors, redirect URLs, etc.) |

### Legacy Compatibility

For backward compatibility, the top-level `message` and `code` fields are also included. New code should use the nested `error` object.

## Stable Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Request data failed validation |
| `UNAUTHORIZED` | 401 | Authentication required or invalid |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Resource state conflict |
| `TENANT_REQUIRED` | 400/403 | Tenant context missing |
| `AGREEMENT_REQUIRED` | 451 | Agreement acceptance needed |
| `TENANCY_VIOLATION` | 403 | Cross-tenant access attempt |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Request ID Correlation

Every request is assigned a unique `requestId`:

1. If the client sends an `X-Request-Id` header, that value is used
2. Otherwise, a UUID is generated server-side
3. The `X-Request-Id` header is always included in responses
4. All errors include the `requestId` for log correlation

### Usage for Debugging

When a user reports an error:
1. Ask them for the request ID (visible in error responses)
2. Search server logs: `grep "requestId=<uuid>" /var/log/app.log`

## Backend Implementation

### Creating Errors

Use the `AppError` class with static factory methods:

```typescript
import { AppError } from "../lib/errors";

// Bad request / validation error
throw AppError.badRequest("Email is required", { field: "email" });

// Not found (pass the resource name, "not found" is appended automatically)
throw AppError.notFound("Project");

// Forbidden
throw AppError.forbidden("You cannot access this resource");

// Internal error
throw AppError.internal("Database connection failed");

// Agreement required
throw AppError.agreementRequired("Please accept terms", "/accept-terms");

// Tenant required
throw AppError.tenantRequired("No tenant context");
```

### Route Handler Pattern

```typescript
import { handleRouteError, sendError, AppError } from "../lib/errors";

app.get("/api/resource/:id", async (req, res) => {
  try {
    const resource = await storage.getResource(req.params.id);
    if (!resource) {
      return sendError(res, AppError.notFound("Resource not found"), req);
    }
    res.json(resource);
  } catch (error) {
    return handleRouteError(res, error, "getResource", req);
  }
});
```

### Global Error Handler

The global error handler (`server/middleware/errorHandler.ts`) catches all unhandled errors and formats them using the standard envelope.

## Frontend Implementation

### Parsing Errors

Use the `parseApiError` utility:

```typescript
import { parseApiError, getErrorMessage, isAuthError } from "@/lib/parseApiError";

try {
  await apiRequest("POST", "/api/resource", data);
} catch (error) {
  const parsed = parseApiError(error);
  
  console.log(parsed.code);      // "VALIDATION_ERROR"
  console.log(parsed.message);   // "Email is required"
  console.log(parsed.status);    // 400
  console.log(parsed.requestId); // "uuid..."
  
  // Get user-friendly message
  const friendlyMessage = getErrorMessage(parsed);
  
  // Check error types
  if (isAuthError(parsed)) {
    // Redirect to login
  }
}
```

### Available Helpers

```typescript
// Parse any error into normalized structure
parseApiError(error): ParsedApiError

// Get user-friendly message for common codes
getErrorMessage(error): string

// Type checks
isAuthError(error): boolean     // UNAUTHORIZED or 401
isAgreementError(error): boolean // AGREEMENT_REQUIRED or 451
isTenantError(error): boolean   // TENANT_REQUIRED
```

### React Query Integration

Errors from `apiRequest` include the status code prefix:

```typescript
// Error message format: "401: {\"error\":{...}}"
const parsed = parseApiError(error);
```

## Testing Errors

### Backend Tests

```typescript
import { AppError, toErrorResponse } from "../lib/errors";

describe("Error handling", () => {
  it("should include requestId in error response", async () => {
    const res = await request(app)
      .get("/api/nonexistent")
      .set("X-Request-Id", "test-123");
    
    expect(res.body.error.requestId).toBe("test-123");
    expect(res.headers["x-request-id"]).toBe("test-123");
  });
  
  it("should use standard envelope format", async () => {
    const res = await request(app)
      .post("/api/resource")
      .send({});
    
    expect(res.body.error).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
      status: expect.any(Number),
      requestId: expect.any(String),
    });
  });
});
```

## Middleware Order

The request ID middleware must be registered first to ensure all errors include the correlation ID:

```typescript
// server/index.ts
app.use(requestIdMiddleware);  // Must be first
app.use(express.json());
// ... other middleware
app.use(errorHandler);         // Must be last
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `production` to hide internal error details |

## Request ID in Toast Notifications

For 500+ errors, the `formatErrorForToast` utility includes a truncated request ID for support correlation:

```typescript
import { formatErrorForToast } from "@/lib/parseApiError";

onError: (error: Error) => {
  const { title, description } = formatErrorForToast(error);
  toast({ title, description, variant: "destructive" });
}
```

This displays as:
```
Something went wrong
Please try again later. (Ref: abc12345)
```

Users can provide this reference ID to support, who can search error logs using the full request ID.

## Error Logging

Server-side error logging captures both 500+ errors and key 4xx errors (403, 404, 429) automatically. See [ERROR_LOGGING.md](./ERROR_LOGGING.md) for details.

## Migration: Legacy to Standard Pattern

### Legacy Pattern (Not Recommended)

```typescript
if (!user) {
  return res.status(404).json({ error: "User not found" });
}
```

This pattern:
- Does not include `requestId` for debugging
- Does not include `code` for client parsing
- Does not use standard envelope structure

### Standard Pattern (Recommended)

```typescript
import { AppError } from "../lib/errors";

if (!user) {
  return next(AppError.notFound("User"));
}
```

This pattern:
- Includes all standard envelope fields
- Includes `requestId` from middleware
- Includes legacy fields for backward compatibility
- Is captured by error logging middleware

### Migration Priority

1. **High**: Routes handling sensitive operations or returning security-related errors
2. **Medium**: Routes with validation that should include field details
3. **Low**: Simple not-found responses in non-critical paths

## Best Practices

1. **Always use error codes** - Don't rely on message strings for logic
2. **Include context in details** - Validation errors should include field names
3. **Log with requestId** - Include `requestId` in all log messages
4. **User-friendly messages** - Use `getErrorMessage()` for display
5. **Handle all codes** - Use switch statements with exhaustive cases
6. **Use next(err)** - Prefer `next(AppError.xxx())` over `res.status().json()`
7. **Use formatErrorForToast** - For mutation error handlers to include request ID references
