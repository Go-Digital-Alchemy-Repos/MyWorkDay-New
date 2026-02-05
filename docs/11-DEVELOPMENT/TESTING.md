# Testing Guide

This document describes the server testing infrastructure and how to write and run tests.

## Quick Start

```bash
# Run all tests
npx vitest run

# Run tests in watch mode
npx vitest

# Run specific test file
npx vitest run server/tests/server-integration.test.ts

# Run with verbose output
npx vitest run --reporter=verbose
```

## Test Infrastructure

### Test Framework

- **Vitest**: Fast, Vite-native test runner
- **Supertest**: HTTP assertion library for testing Express apps
- **Node environment**: Tests run in Node.js, not browser

### Configuration

Test configuration is in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/tests/**/*.test.ts"],
    setupFiles: ["server/tests/setup.ts"],
    testTimeout: 30000,
    fileParallelism: false,  // Sequential for DB isolation
  },
});
```

### Test Files

| File | Purpose |
|------|---------|
| `server/tests/setup.ts` | Global test setup |
| `server/tests/fixtures.ts` | Test data factories and cleanup utilities |
| `server/tests/server-harness.ts` | Express app builder for integration tests |
| `server/tests/server-integration.test.ts` | Core server integration tests |

## Server Test Harness

The test harness (`server-harness.ts`) provides utilities to create minimal Express apps for testing:

```typescript
import { createTestApp, isDatabaseAvailable } from "./server-harness";
import request from "supertest";

describe("My Test", () => {
  let app;

  beforeAll(async () => {
    app = createTestApp();
  });

  it("should respond to health check", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});
```

### Harness Options

```typescript
interface TestAppOptions {
  withAuth?: boolean;       // Enable mock authentication
  mockUserId?: string;      // User ID to inject
  mockTenantId?: string;    // Tenant ID to inject
  mockUserRole?: string;    // User role to inject
}

// Create app with mock auth
const app = createTestApp({
  withAuth: true,
  mockUserId: "test-user-id",
  mockTenantId: "test-tenant-id",
  mockUserRole: "admin",
});
```

## Test Fixtures

Use fixtures for creating test data with proper cleanup:

```typescript
import { 
  createTestTenant, 
  createTestUser, 
  createTestProject,
  cleanupTestData 
} from "./fixtures";

describe("My Feature", () => {
  let tenant, user;

  beforeAll(async () => {
    tenant = await createTestTenant({ name: "Test Tenant" });
    user = await createTestUser({
      email: `test-${Date.now()}@example.com`,
      tenantId: tenant.id,
    });
  });

  afterAll(async () => {
    await cleanupTestData([tenant.id]);
  });
});
```

## Writing Tests

### Integration Test Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp, resetTestApp } from "./server-harness";

describe("Feature Name", () => {
  let app;

  beforeAll(async () => {
    app = createTestApp({ withAuth: true, mockUserId: "user-1" });
    // Add routes/middleware specific to this test
  });

  afterAll(() => {
    resetTestApp();
  });

  it("should do something", async () => {
    const res = await request(app).get("/api/endpoint");
    expect(res.status).toBe(200);
  });
});
```

### Testing Authentication

**Note:** The `requireAuth` middleware returns a simple `{ error: "Authentication required" }` 
response rather than the standard error envelope. This is a known exception to the standard 
error format.

```typescript
// Test unauthenticated access (against real server)
it("returns 401 without auth", async () => {
  const res = await request("http://localhost:5000").get("/api/projects");
  expect(res.status).toBe(401);
  expect(res.body).toHaveProperty("error", "Authentication required");
});

// Test authenticated access (with mock auth)
it("returns 200 with auth", async () => {
  const app = createTestApp({
    withAuth: true,
    mockUserId: "user-id",
    mockTenantId: "tenant-id",
  });
  const res = await request(app).get("/api/protected");
  expect(res.status).toBe(200);
});
```

### Testing Validation

The real error handler produces this envelope structure:

```typescript
// Standard error envelope
{
  ok: false,
  requestId: "uuid-string",
  error: {
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    status: 400,
    requestId: "uuid-string",
    details: [
      { path: "fieldName", message: "Error message" }
    ]
  },
  // Legacy compatibility fields
  message: "Validation failed",
  code: "VALIDATION_ERROR",
  details: [...]
}
```

Test example:

```typescript
it("returns consistent error shape on bad input", async () => {
  const res = await request(app)
    .post("/api/v1/time-entries")
    .send({ invalid: "data" });
  
  expect(res.status).toBe(400);
  expect(res.body).toHaveProperty("ok", false);
  expect(res.body).toHaveProperty("requestId");
  expect(res.body.error).toHaveProperty("code", "VALIDATION_ERROR");
  expect(res.body.error).toHaveProperty("message", "Validation failed");
  expect(res.body.error).toHaveProperty("details");
});
```

## Current Test Coverage

### Server Integration Tests

| Test | Description |
|------|-------------|
| Health endpoints | `/health`, `/healthz`, `/ready` respond correctly |
| Auth protection | Protected endpoints return 401 without auth |
| Input validation | Invalid input returns consistent error shape |
| Error responses | Include requestId for debugging |

### Tenant Tests

| File | Coverage |
|------|----------|
| `tenant-task-create.test.ts` | Task creation with tenant isolation |
| `tenant-crud-cross-tenant.test.ts` | Cross-tenant access prevention |
| `tenant-core-flows-smoke.test.ts` | Core tenant workflows |
| `tenant-health-repair.test.ts` | Tenant data repair utilities |

## Best Practices

1. **Isolate tests**: Each test should be independent
2. **Clean up data**: Use `afterAll` to remove test data
3. **Use unique identifiers**: Include timestamps in test emails/names
4. **Test error cases**: Verify error responses have consistent shape
5. **Check requestId**: Error responses should include requestId

## Troubleshooting

### Tests timing out

Increase timeout in test file:
```typescript
describe("Slow Test", { timeout: 60000 }, () => { ... });
```

### Database conflicts

Tests run sequentially by default. If you see conflicts:
- Ensure unique test data names (use timestamps)
- Use proper cleanup in `afterAll`

### Missing database

Some tests require a database. Check availability:
```typescript
const dbAvailable = await isDatabaseAvailable();
if (!dbAvailable) {
  console.log("Skipping DB-dependent tests");
  return;
}
```
