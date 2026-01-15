# MyWorkDay - Architecture Overview

## Repository Structure

```
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/           # shadcn/ui components
│   │   │   ├── task-*.tsx    # Task-related components
│   │   │   ├── *-drawer.tsx  # FullScreenDrawer patterns
│   │   │   └── ...
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Utilities (queryClient, utils)
│   │   ├── pages/            # Route components
│   │   │   ├── super-admin*.tsx  # Super admin pages
│   │   │   ├── settings.tsx      # Tenant admin settings
│   │   │   └── ...
│   │   ├── App.tsx           # Router + providers
│   │   └── index.css         # Tailwind + custom styles
│   └── index.html
├── server/                    # Express backend
│   ├── routes/               # API route modules
│   │   ├── index.ts          # Route aggregator
│   │   ├── superAdmin.ts     # Super admin routes (~120KB)
│   │   ├── superDebug.ts     # Debug tools
│   │   ├── tenantOnboarding.ts  # Tenant admin routes
│   │   ├── timeTracking.ts   # Timer/time entries
│   │   ├── projectsDashboard.ts # Analytics
│   │   ├── workloadReports.ts   # Workload metrics
│   │   └── tenancyHealth.ts  # Health dashboard
│   ├── middleware/           # Express middleware
│   │   ├── tenantContext.ts  # Tenant context injection
│   │   ├── tenancyEnforcement.ts # Isolation enforcement
│   │   └── agreementGuard.ts # Phase 3C gating
│   ├── services/             # Business logic
│   │   └── tenantIntegrations.ts # Mailgun/S3 integration
│   ├── scripts/              # Maintenance scripts
│   │   ├── backfill_tenant_ids.ts
│   │   └── purge_app_data.ts
│   ├── tests/                # Vitest tests
│   ├── lib/                  # Utilities (errors, encryption)
│   ├── auth.ts               # Passport.js authentication
│   ├── db.ts                 # Drizzle database connection
│   ├── routes.ts             # Main routes (~3.7K lines)
│   ├── s3.ts                 # AWS S3 utilities
│   ├── storage.ts            # Database storage interface
│   └── index.ts              # Server entry point
├── shared/                    # Shared types
│   └── schema.ts             # Drizzle schema + Zod validators
├── docs/                      # Documentation
│   ├── ENDPOINTS.md          # API reference
│   ├── FEATURE_INVENTORY.md  # This file
│   └── ...
├── drizzle.config.ts         # Drizzle Kit config
├── package.json
├── replit.md                 # Project memory/context
└── vite.config.ts            # Vite config
```

---

## Technology Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Tailwind CSS | Utility-first styling |
| shadcn/ui | Component library |
| TanStack Query v5 | Server state management |
| Wouter | Client-side routing |
| FullCalendar | Calendar views |
| Framer Motion | Animations |
| Socket.IO Client | Real-time updates |
| Lucide React | Icons |

### Backend
| Technology | Purpose |
|------------|---------|
| Express.js | HTTP server |
| TypeScript | Type safety |
| Passport.js + passport-local | Session authentication |
| Express-session | Session management |
| connect-pg-simple | PostgreSQL session store |
| Socket.IO | Real-time WebSocket server |
| Multer | File uploads |
| AWS SDK v3 | S3 integration |
| Mailgun.js | Email integration |
| Zod | Request validation |

### Database
| Technology | Purpose |
|------------|---------|
| PostgreSQL | Primary database |
| Drizzle ORM | Type-safe ORM |
| Drizzle Kit | Migrations |
| drizzle-zod | Schema-to-Zod validation |

---

## Tenancy Enforcement Flow

```
Request
   │
   ▼
┌─────────────────────────────┐
│ Auth Middleware (requireAuth)│
│ - Check session             │
│ - Attach req.user           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Tenant Context Middleware   │
│ (requireTenantContext)      │
│ - Set req.tenant.tenantId   │
│ - Set req.tenant.effectiveTenantId │
│ - Handle X-Tenant-Id header │
│   (super users only)        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Agreement Guard             │
│ (if AGREEMENT_GUARD enabled)│
│ - Check user acceptance     │
│ - Return 451 if not accepted│
│ - Super users bypass        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Route Handler               │
│ - Use effectiveTenantId     │
│ - All queries scoped        │
└─────────────────────────────┘
```

### Tenancy Enforcement Modes

Controlled via `TENANCY_ENFORCEMENT` env var:

| Mode | Behavior |
|------|----------|
| `off` | No enforcement (development) |
| `soft` | Log warnings, allow operations |
| `strict` | Block cross-tenant operations |

### X-Tenant-Id Header (Super Admin Impersonation)

1. Super Admin sets `actingTenantId` in localStorage
2. Frontend attaches `X-Tenant-Id` header to requests
3. Backend validates super user role before processing header
4. `effectiveTenantId` is set to header value (not user's tenant)

---

## Agreement Guard Flow

```
Incoming Request
       │
       ▼
┌──────────────────────────────┐
│ Is route exempt?             │
│ - /api/auth/*                │
│ - /api/v1/super/*            │
│ - /api/v1/me/agreement/*     │
│ - /api/health                │
└──────────────┬───────────────┘
       │ No
       ▼
┌──────────────────────────────┐
│ Is user super_user?          │──Yes──▶ Continue
└──────────────┬───────────────┘
       │ No
       ▼
┌──────────────────────────────┐
│ Does tenant have active      │
│ agreement?                   │──No───▶ Continue (no gating)
└──────────────┬───────────────┘
       │ Yes
       ▼
┌──────────────────────────────┐
│ Has user accepted current    │
│ version?                     │
└──────────────┬───────────────┘
       │ No
       ▼
┌──────────────────────────────┐
│ Return 451 Unavailable For   │
│ Legal Reasons                │
│ { redirectTo: "/accept-terms"}│
└──────────────────────────────┘
```

---

## Real-time Architecture (Socket.IO)

### Server Setup
```typescript
// server/realtime/index.ts
io.on("connection", (socket) => {
  // Join tenant room
  socket.join(`tenant:${tenantId}`);
  
  // Join project rooms
  socket.join(`project:${projectId}`);
});
```

### Event Emitters
All mutations emit events via centralized emitters:
- `emitTaskCreated(task)` → `task:created`
- `emitTaskUpdated(task)` → `task:updated`
- `emitTimerStarted(timer)` → `timer:started`
- etc.

### Client Subscription
```typescript
// client/src/hooks/useRealtime.ts
useEffect(() => {
  socket.on("task:created", handleTaskCreated);
  return () => socket.off("task:created");
}, []);
```

---

## Super-Only Route Bypasses

The following middleware patterns bypass tenant context for super users:

```typescript
// In requireTenantContext
if (user.role === UserRole.SUPER_USER) {
  // Allow without tenantId
  return next();
}

// In agreementEnforcementGuard
if (user.role === UserRole.SUPER_USER) {
  // Bypass agreement check
  return next();
}
```

Routes that are fully super-only:
- `/api/v1/super/*` - All super admin routes
- `/api/v1/super/debug/*` - Debug tools

---

## S3 Upload Flow

### Brand Assets (via Multer)
1. Admin uploads file to `/api/v1/tenant/settings/brand-assets`
2. Multer stores in memory
3. Server validates file type/size
4. Upload to S3 with tenant-prefixed key
5. Store S3 URL in tenant_settings

### Attachments (via Presigned URL)
1. Client requests presigned URL: `POST /api/projects/:id/attachments/presigned`
2. Server generates presigned PUT URL
3. Client uploads directly to S3
4. Server confirms and stores metadata

---

## Navigation & Mode Switching

### App Modes

The application supports two primary modes:

1. **Super Mode** - For super admin users managing tenants
2. **Tenant Mode** - For regular users or super admins impersonating a tenant

### Mode Determination Rules

```
If user.role == "super_user" AND effectiveTenantId is null:
  → appMode = "super"

If effectiveTenantId exists (regardless of user role):
  → appMode = "tenant" AND isImpersonating = true

If user.role != "super_user":
  → appMode = "tenant" AND isImpersonating = false
```

### Route Guards

| Guard | Purpose |
|-------|---------|
| `ProtectedRoute` | Requires authentication |
| `SuperRouteGuard` | Requires super_user role |
| `TenantRouteGuard` | Requires tenant context (blocks super users not impersonating) |

### Cache Isolation Strategy

The app uses tenant-scoped and super-scoped query key prefixes for selective cache clearing:

**Tenant-Scoped Prefixes** (cleared on mode transitions):
- `/api/projects`, `/api/clients`, `/api/teams`, `/api/workspaces`
- `/api/tasks`, `/api/time-entries`, `/api/user`, `/api/auth/me`
- `/api/v1/projects`, `/api/v1/tenant`, `/api/v1/workspaces`
- `/api/v1/tasks`, `/api/v1/clients`, `/api/v1/teams`, `/api/v1/time`
- `/api/v1/analytics`, `/api/v1/forecast`, `/api/v1/workload`
- `/api/activities`, `/api/comments`, `/api/tags`, `/api/sections`, `/api/attachments`

**Super-Scoped Prefixes** (preserved in tenant mode):
- `/api/v1/super`

**Limitation**: This is prefix-based matching. For guaranteed isolation, future
improvements could implement tenantId namespacing in query keys.

### Cache Invalidation Functions

```typescript
clearTenantScopedCaches()  // Called when switching tenants or exiting impersonation
clearSuperScopedCaches()   // Optional, for complete isolation
validateTenantExists(id)   // Validates tenant before impersonation restoration
```

### Impersonation Flow

1. **Start Impersonation**:
   - Clear tenant caches
   - Store tenant ID in localStorage with super user verification
   - Set `X-Tenant-Id` header on all API requests

2. **Stop Impersonation**:
   - Clear tenant caches
   - Remove localStorage state
   - Invalidate super tenant list query
   - Reset to super mode navigation

3. **Restore on Page Load**:
   - Validate stored tenant ID still exists
   - If invalid, force exit impersonation with cache clear

### Key Navigation Files

| File | Purpose |
|------|---------|
| `client/src/hooks/useAppMode.ts` | Central mode management hook |
| `client/src/lib/queryClient.ts` | Cache utilities and query configuration |
| `client/src/App.tsx` | Route guards and layout switching |
| `client/src/components/impersonation-banner.tsx` | Tenant impersonation UI |
| `client/src/components/tenant-switcher.tsx` | Tenant selection dropdown |

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `drizzle.config.ts` | Database migrations config |
| `vite.config.ts` | Frontend build config (DO NOT MODIFY) |
| `server/vite.ts` | Vite dev server integration (DO NOT MODIFY) |
| `tailwind.config.ts` | Tailwind theme config |
| `design_guidelines.md` | UI/UX design rules |

---

## Environment Variable Groups

### Required for Operation
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption

### Optional Integrations
- `S3_*` - AWS S3 configuration
- `MAILGUN_*` - Mailgun configuration

### Feature Flags
- `TENANCY_ENFORCEMENT` - off/soft/strict
- `AGREEMENT_GUARD_ENABLED` - Enable Phase 3C gating

### Dangerous Operations
- `PURGE_APP_DATA_ALLOWED` - Enable data purge
- `BACKFILL_TENANT_IDS_ALLOWED` - Enable backfill
- `SUPER_DEBUG_DELETE_ALLOWED` - Enable quarantine delete

---

*Last Updated: January 2026*
