# Testing

**Status:** Current  
**Last Updated:** January 2026

This section covers testing strategies, frameworks, and best practices.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [UNIT_TESTS.md](./UNIT_TESTS.md) | Unit testing guide |
| [INTEGRATION_TESTS.md](./INTEGRATION_TESTS.md) | API testing with Vitest |
| [E2E_TESTS.md](./E2E_TESTS.md) | End-to-end testing |
| [TEST_FIXTURES.md](./TEST_FIXTURES.md) | Test data and fixtures |
| [REGRESSION_CHECKLIST.md](./REGRESSION_CHECKLIST.md) | Manual testing checklist |

---

## Testing Stack

| Tool | Purpose |
|------|---------|
| Vitest | Unit and integration tests |
| Testing Library | React component tests |
| Supertest | API endpoint tests |

---

## Test Structure

```
server/tests/
├── *.test.ts         # Integration tests
└── fixtures/         # Test data

client/src/
├── __tests__/        # Component tests
└── setupTests.ts     # Test configuration
```

---

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific file
npm test -- time-entry-edit.test.ts
```

---

## Integration Test Example

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('GET /api/projects', () => {
  it('returns projects for authenticated user', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Cookie', sessionCookie);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });
});
```

---

## Regression Checklist

Before each release, verify:

### Authentication
- [ ] Login with email/password
- [ ] Login with Google OAuth
- [ ] Password reset flow
- [ ] Session persistence

### Core Features
- [ ] Create/edit project
- [ ] Task CRUD operations
- [ ] Time tracking (start/stop/pause)
- [ ] Client management

### Multi-Tenancy
- [ ] Tenant isolation
- [ ] Super admin impersonation
- [ ] Cross-tenant data protection

---

## Related Sections

- [11-DEVELOPMENT](../11-DEVELOPMENT/) - Development practices
- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Pre-deployment checks
