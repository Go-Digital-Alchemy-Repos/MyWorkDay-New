# Server Features

Modular feature-based organization for the MyWorkDay API.

## Overview

This directory contains feature modules extracted from the monolithic `routes.ts` file. Each feature follows the same structure:
- **router.ts** - Express router with route handlers
- **[sub].router.ts** - Additional routers for sub-features (e.g., divisions.router.ts)
- **index.ts** - Feature entry point that combines routers
- **README.md** - Feature documentation

## Features

| Feature | Description | Status |
|---------|-------------|--------|
| clients | Client CRM, contacts, invites, divisions | ✅ Extracted |
| projects | Project CRUD, members, sections | 🔜 Planned |
| tasks | Task CRUD, subtasks, comments, assignees | 🔜 Planned |
| teams | Team management and membership | 🔜 Planned |
| timer | Time tracking and active timers | 🔜 Planned |
| workspaces | Workspace management | 🔜 Planned |

## Architecture

### Route Mounting

Features are mounted via `routes/index.ts`:

```typescript
import featuresRoutes from "../features";
router.use(featuresRoutes);
```

This is mounted at `/api`, so a route like `/clients` becomes `/api/clients`.

### Coexistence with Legacy Routes

During migration, feature routes are mounted BEFORE legacy routes in `routes.ts`. Express uses the first matching route, so feature routes take precedence. This allows incremental migration without breaking existing functionality.

### Testing

Run feature-specific tests:

```bash
npx vitest run server/tests/client-crud.test.ts
npx vitest run server/tests/create_division_requires_client_and_tenant.test.ts
```

## Adding New Features

1. Create feature directory: `server/features/{feature-name}/`
2. Create router.ts with Express Router
3. Create index.ts exporting the router
4. Add README.md documenting the feature
5. Import and mount in `server/features/index.ts`
6. Run tests to verify functionality
7. Remove corresponding routes from `routes.ts`

## Design Principles

- **Tenant Scoping**: All routes respect tenant context via `getEffectiveTenantId()`
- **Real-time Events**: Mutations emit Socket.IO events for live updates
- **Validation**: Request bodies validated with Zod schemas
- **Error Handling**: Consistent error responses with proper status codes
