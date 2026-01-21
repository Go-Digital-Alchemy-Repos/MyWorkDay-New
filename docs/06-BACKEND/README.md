# Backend

**Status:** Current  
**Last Updated:** January 2026

This section covers the Express.js backend architecture, middleware, and services.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [MIDDLEWARE.md](./MIDDLEWARE.md) | All middleware explained |
| [SERVICES.md](./SERVICES.md) | Business logic services |
| [DATABASE.md](./DATABASE.md) | Drizzle ORM usage |
| [SESSIONS.md](./SESSIONS.md) | Session management |
| [ENCRYPTION.md](./ENCRYPTION.md) | Secrets encryption |
| [ERROR_HANDLING.md](./ERROR_HANDLING.md) | Error handling patterns |

---

## Project Structure

```
server/
├── index.ts              # Entry point
├── routes.ts             # Main route definitions (~3.8K lines)
├── routes/               # Modular route files
│   ├── superAdmin.ts     # Super admin endpoints
│   ├── tenantOnboarding.ts
│   ├── timeTracking.ts
│   ├── projectsDashboard.ts
│   ├── workloadReports.ts
│   └── ...
├── middleware/           # Express middleware
│   ├── tenantContext.ts  # Tenant extraction
│   ├── tenancyEnforcement.ts
│   ├── agreementEnforcement.ts
│   ├── rateLimit.ts
│   └── ...
├── services/             # Business logic
│   ├── emailOutbox.ts
│   ├── tenantIntegrations.ts
│   └── uploads/
├── scripts/              # Maintenance scripts
└── storage.ts            # Database storage class
```

---

## Middleware Stack

### Request Flow

```
Request → requestId → session → passport → tenantContext → rateLimit → routes
```

### Key Middleware

| Middleware | File | Purpose |
|------------|------|---------|
| `requestId` | `requestId.ts` | Add unique request ID |
| `tenantContext` | `tenantContext.ts` | Extract tenant from user/header |
| `tenancyEnforcement` | `tenancyEnforcement.ts` | Enforce tenant rules |
| `agreementEnforcement` | `agreementEnforcement.ts` | SaaS agreement gating |
| `rateLimit` | `rateLimit.ts` | Brute-force protection |
| `errorHandler` | `errorHandler.ts` | Global error handling |

### Auth Middleware

```typescript
// Any authenticated user
app.get('/api/tasks', requireAuth, handler);

// Tenant admin only
app.post('/api/teams', requireAuth, requireTenantAdmin, handler);

// Super user only
app.get('/api/v1/super/tenants', requireAuth, requireSuperUser, handler);
```

---

## Database Access

### Storage Pattern

All database operations go through `DatabaseStorage`:

```typescript
class DatabaseStorage implements IStorage {
  async getProjects(tenantId: string) {
    return db.query.projects.findMany({
      where: eq(projects.tenantId, tenantId),
    });
  }
}
```

### Tenant Scoping

Most queries include tenant filtering:

```typescript
const results = await db.query.tasks.findMany({
  where: and(
    eq(tasks.tenantId, tenantId),
    eq(tasks.projectId, projectId)
  ),
});
```

---

## Route Organization

### Main Routes File

`server/routes.ts` contains core CRUD endpoints:
- Workspaces, Projects, Tasks, Subtasks
- Clients, Teams, Users
- Time entries, Comments, Tags

### Modular Route Files

| File | Prefix | Purpose |
|------|--------|---------|
| `superAdmin.ts` | `/api/v1/super` | Tenant management |
| `tenantOnboarding.ts` | `/api/v1/tenant` | Onboarding wizard |
| `timeTracking.ts` | `/api/timer` | Timer operations |
| `projectsDashboard.ts` | `/api/v1/projects` | Project analytics |
| `workloadReports.ts` | `/api/v1/workload` | Workload reports |
| `uploads.ts` | `/api/v1/uploads` | S3 presigned URLs |
| `emailOutbox.ts` | `/api/v1/email` | Email logs |

---

## Error Handling

### Standard Error Response

```typescript
res.status(400).json({
  error: 'Validation failed',
  code: 'VALIDATION_ERROR',
  requestId: req.requestId,
  details: { field: 'email', message: 'Invalid format' }
});
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | No permission |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMITED` | 429 | Too many requests |

---

## Services

### Email Service

```typescript
// server/services/emailOutbox.ts
await sendEmail({
  to: user.email,
  subject: 'Invitation',
  template: 'invite',
  data: { inviteUrl, tenantName }
});
```

### Integration Service

```typescript
// server/services/tenantIntegrations.ts
const mailgun = await getTenantMailgunConfig(tenantId);
await sendViaTenantMailgun(mailgun, message);
```

---

## Related Sections

- [04-API](../04-API/) - Endpoint reference
- [07-SECURITY](../07-SECURITY/) - Security patterns
- [08-DATABASE](../08-DATABASE/) - Schema and queries
