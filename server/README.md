# Server - MyWorkDay API

## Overview

Express.js backend with TypeScript, providing RESTful APIs for the project management application.

## Directory Structure

```
server/
├── index.ts              # Application entry point, middleware setup
├── auth.ts               # Authentication (Passport.js, session management)
├── bootstrap.ts          # Initial admin user creation
├── db.ts                 # Database connection (Drizzle ORM)
├── storage.ts            # Data access layer (CRUD operations)
├── s3.ts                 # S3 file upload utilities
├── routes.ts             # Main API routes (to be modularized)
├── routes/               # Modular route handlers
│   ├── index.ts          # Route aggregator
│   ├── superAdmin.ts     # Super admin tenant management
│   ├── tenantOnboarding.ts # Tenant onboarding flow
│   ├── tenancyHealth.ts  # Tenancy monitoring
│   └── timeTracking.ts   # Timer routes
├── middleware/           # Express middleware
│   ├── authContext.ts    # Authentication context
│   ├── tenantContext.ts  # Tenant context & super user handling
│   ├── tenantStatusGuard.ts # Block inactive tenants
│   ├── tenancyEnforcement.ts # Tenant isolation validation
│   ├── tenancyHealthTracker.ts # Warning recorder
│   ├── errorHandler.ts   # Global error handling
│   ├── validate.ts       # Request validation helpers
│   └── asyncHandler.ts   # Async error wrapper
├── services/             # Business logic services
│   └── tenantIntegrations.ts # Mailgun/S3 per-tenant config
├── realtime/             # WebSocket (Socket.IO)
│   ├── index.ts          # Socket server setup
│   ├── socket.ts         # Connection handling
│   └── events.ts         # Event emitters
├── lib/                  # Shared utilities
│   ├── errors.ts         # Custom error classes
│   └── encryption.ts     # AES encryption for secrets
├── scripts/              # One-off scripts
│   ├── smoke.ts          # Smoke test runner
│   ├── bootstrap_super_user.ts # CLI super user creation
│   ├── backfillTenants.ts # Data migration
│   └── backfillPhase3A.ts # Tenant settings migration
├── tests/                # Test files
│   ├── setup.ts          # Test configuration
│   ├── auth.test.ts      # Authentication tests
│   ├── validation.test.ts # Validation tests
│   ├── errors.test.ts    # Error handling tests
│   └── tenant-pre-provisioning.test.ts
├── static.ts             # Static file serving (production)
└── vite.ts               # Vite dev server integration
```

## Middleware Order

Middleware is applied in this order (critical for proper operation):

1. **JSON/URL encoding** - Request body parsing
2. **Session** - PostgreSQL-backed session store
3. **Passport** - Authentication initialization
4. **Tenant Context** - Sets `req.tenant` with tenant info
5. **Request Logger** - API request/response logging
6. **Routes** - API route handlers

Within routes:
1. **requireAuth** - Blocks unauthenticated requests
2. **requireTenantContext** - Ensures tenant ID available
3. **requireAdmin** - Admin role check
4. **requireSuperUser** - Super user role check

## Tenant Scoping

### Automatic Scoping

Most storage methods accept `tenantId` parameter:

```typescript
// In route handler
const tenantId = getEffectiveTenantId(req);
const tasks = await storage.getTasksByProject(projectId, tenantId);
```

### Super User Override

Super users can access any tenant via header:

```typescript
// Super user accessing specific tenant
const headerTenantId = req.headers["x-tenant-id"];
const effectiveTenantId = headerTenantId || req.user.tenantId;
```

### Enforcement Modes

Set via `TENANCY_ENFORCEMENT` env var:
- `off` - No enforcement (development)
- `soft` - Log warnings, allow access
- `strict` - Block cross-tenant access

## API Patterns

### Response Format

Success:
```json
{
  "id": "uuid",
  "name": "Resource Name",
  // ... other fields
}
```

Error:
```json
{
  "error": "Error message",
  "details": [{ "path": ["field"], "message": "Validation error" }]
}
```

### Validation

Use Zod schemas from `@shared/schema`:

```typescript
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";

const data = insertTaskSchema.parse(req.body);
```

### Real-time Updates

Emit events after mutations:

```typescript
import { emitTaskCreated } from "./realtime/events";

// After creating task
emitTaskCreated(workspaceId, task);
```

## Authentication

### Session-Based

- PostgreSQL session store (`user_sessions` table)
- 30-day cookie expiration
- httpOnly, secure (production), sameSite: lax

### Password Hashing

Uses scrypt with random salt:

```typescript
import { hashPassword, comparePasswords } from "./auth";

const hash = await hashPassword(password);
const isValid = await comparePasswords(supplied, stored);
```

### Roles

- `employee` - Regular user
- `admin` - Tenant admin
- `super_user` - Platform super admin

## File Uploads

### S3 Integration

Per-tenant S3 configuration or global fallback:

```typescript
import { uploadToS3, createPresignedDownloadUrl } from "./s3";

// Upload
const s3Key = await uploadToS3(buffer, key, mimeType, tenantId);

// Download URL
const url = await createPresignedDownloadUrl(key, fileName, tenantId);
```

### Validation

```typescript
import { validateFile, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "./s3";

validateFile(mimeType, size); // Throws on invalid
```

## Running

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Database Migrations

```bash
npx drizzle-kit push
npx drizzle-kit generate
```

## Testing

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

## Environment Variables

See `/docs/DEPLOYMENT_RAILWAY.md` for full list.

Key variables:
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption key
- `TENANCY_ENFORCEMENT` - Tenant isolation mode
- `S3_*` - Global S3 configuration
- `ENCRYPTION_KEY` - Tenant secret encryption
