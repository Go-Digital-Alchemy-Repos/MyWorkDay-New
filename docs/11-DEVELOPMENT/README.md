# Development

**Status:** Current  
**Last Updated:** January 2026

This section covers development practices, coding standards, and workflows.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Code style and conventions |
| [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) | Branching and commits |
| [PULL_REQUESTS.md](./PULL_REQUESTS.md) | PR guidelines |
| [DEBUGGING.md](./DEBUGGING.md) | Debugging techniques |
| [PERFORMANCE.md](./PERFORMANCE.md) | Performance optimization |
| [ADDING_FEATURES.md](./ADDING_FEATURES.md) | How to add new features |

---

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (local or DATABASE_URL)
- Git

### Quick Start

```bash
npm install
npm run dev
```

Server runs at `http://localhost:5000`

---

## Code Organization

### Frontend

```
client/src/
├── pages/        # Route components (one per route)
├── components/   # Reusable components
├── hooks/        # Custom React hooks
└── lib/          # Utilities
```

### Backend

```
server/
├── routes/       # API route handlers
├── middleware/   # Express middleware
├── services/     # Business logic
└── scripts/      # Maintenance scripts
```

### Shared

```
shared/
└── schema.ts     # Drizzle schema + types
```

---

## Adding a New Feature

### 1. Define Schema

Add tables/columns to `shared/schema.ts`:

```typescript
export const myFeature = pgTable("my_feature", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 256 }).notNull(),
});

export const insertMyFeatureSchema = createInsertSchema(myFeature).omit({
  id: true,
});
```

### 2. Add Storage Methods

Update `server/storage.ts`:

```typescript
async getMyFeatures(tenantId: string) {
  return db.query.myFeature.findMany({
    where: eq(myFeature.tenantId, tenantId),
  });
}
```

### 3. Create API Endpoints

Add routes to `server/routes.ts` or create new file in `server/routes/`:

```typescript
app.get('/api/my-feature', requireAuth, async (req, res) => {
  const items = await storage.getMyFeatures(req.tenant.effectiveTenantId!);
  res.json(items);
});
```

### 4. Build UI

Create page in `client/src/pages/` and components in `client/src/components/`.

### 5. Update Docs

Add feature to relevant documentation files.

---

## Coding Conventions

### TypeScript

- Strict mode enabled
- Use explicit types for function returns
- Prefer interfaces over type aliases

### React

- Functional components only
- Use TanStack Query for server state
- Follow shadcn/ui patterns

### API

- RESTful conventions
- Consistent error responses
- Zod validation on all inputs

---

## Debugging

### Frontend

```typescript
// React Query DevTools (development only)
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
```

### Backend

```typescript
// Add debug logging
console.log('[debug]', { tenantId, userId, action });
```

### Database

```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM tasks WHERE tenant_id = '...';
```

---

## Related Sections

- [02-ARCHITECTURE](../02-ARCHITECTURE/) - System design
- [09-TESTING](../09-TESTING/) - Testing practices
- [04-API](../04-API/) - API conventions
