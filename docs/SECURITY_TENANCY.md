# Tenant Isolation & Security

## Overview

MyWorkDay implements multi-tenancy at the application layer. Each tenant has isolated data, and cross-tenant access is strictly controlled.

## Tenancy Enforcement Modes

The application supports three enforcement modes controlled by the `TENANCY_ENFORCEMENT` environment variable:

### Mode: `off` (Default)
- No tenant isolation enforcement
- Legacy mode for pre-migration data
- All data is accessible regardless of tenant
- **Use only for development/testing**

### Mode: `soft`
- Tenant isolation is checked but not enforced
- Violations are logged as warnings
- Warning headers are added to responses (`X-Tenancy-Warn`)
- Records violations in `tenancy_warnings` table for monitoring
- **Recommended during migration period**

### Mode: `strict`
- Full tenant isolation enforcement
- Cross-tenant access attempts return 403 Forbidden
- Resources without `tenantId` are blocked
- **Recommended for production**

## How Tenant Context Works

### Authentication Flow

1. User authenticates via `/api/auth/login`
2. Session is created with user ID
3. `tenantContextMiddleware` sets `req.tenant`:
   - `tenantId`: User's assigned tenant
   - `effectiveTenantId`: Active tenant (may differ for super users)
   - `isSuperUser`: Boolean flag

### Super User "Act as Tenant"

Super users can access any tenant's data by sending the `X-Tenant-Id` header:

```javascript
// Frontend: Set header for API requests
const headers = { "X-Tenant-Id": "tenant-uuid-here" };
```

This allows super admins to:
- Pre-provision tenants before activation
- Debug tenant-specific issues
- Manage tenant data directly

### Tenant Status Guard

The `tenantStatusGuard` middleware blocks access for inactive/suspended tenants:

| Status | Regular Users | Super Users |
|--------|---------------|-------------|
| ACTIVE | ✅ Full access | ✅ Full access |
| INACTIVE | ⛔ Blocked | ✅ Can access |
| SUSPENDED | ⛔ Blocked | ✅ Can access |

**Always-allowed routes** (regardless of tenant status):
- `/api/auth/*` - Authentication
- `/api/v1/tenant/*` - Onboarding
- `/api/v1/settings/mailgun*` - Email setup during onboarding
- `/api/health` - Health check
- `/api/v1/super/bootstrap` - Super admin initialization

## Data Model Requirements

### Required `tenantId` Column

Most tables include a `tenantId` column that references `tenants.id`:

```sql
-- Example: tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  -- other columns
);
```

### Tables That Are Tenant-Scoped

- `users` (except super_user role)
- `workspaces`
- `projects`
- `tasks`
- `sections`
- `subtasks`
- `teams`
- `clients`
- `time_entries`
- `active_timers`
- `tags`
- `comments`
- `attachments`
- `activity_logs`
- `invitations`
- `tenant_settings`
- `tenant_integrations`

### Tables That Are NOT Tenant-Scoped

- `tenants` - The tenants themselves
- `user_sessions` - Session storage

## Validation Functions

### `validateTenantOwnership()`

```typescript
function validateTenantOwnership(
  resourceTenantId: string | null,
  effectiveTenantId: string | null,
  resourceType: string,
  resourceId: string
): TenancyValidationResult
```

Returns:
- `valid`: Boolean - whether access is allowed
- `warning`: Optional string - explanation
- `shouldFallback`: Boolean - whether to use legacy behavior

### `handleTenancyViolation()`

Helper to respond with 403 and log the violation.

## Debugging Tenant Issues

### Enable Soft Mode

```bash
export TENANCY_ENFORCEMENT=soft
```

This will log warnings without blocking:

```
[TENANCY:SOFT] GET /api/tasks/123: Task:123 has legacy null tenantId (user: abc)
```

### Check Warning Headers

In soft mode, check response headers:

```
X-Tenancy-Warn: Task:123 has legacy null tenantId
```

### View Health Dashboard

Super admins can access the tenancy health dashboard:
- `/api/super/tenancy-health/dashboard` - Summary statistics
- `/api/super/tenancy-health/warnings` - Recent warnings

### Backfill Missing Tenant IDs

Use the backfill endpoint to fix legacy data:

```bash
POST /api/super/tenancy-health/backfill
```

## Common Issues & Solutions

### "No tenant context for X access"

**Cause**: User doesn't have a `tenantId` set or request lacks context.

**Solution**:
1. Verify user has `tenantId` in database
2. Check that auth middleware is running before tenant middleware
3. For super users, ensure `X-Tenant-Id` header is set

### "Resource has legacy null tenantId"

**Cause**: Data created before tenant isolation was added.

**Solution**:
1. Run backfill script to assign tenant IDs
2. Manually update specific records in database

### "Cross-tenant access denied"

**Cause**: User trying to access another tenant's data.

**Solution**:
1. Verify the resource belongs to user's tenant
2. Check for data corruption (wrong tenant assignment)
3. Super users: ensure correct `X-Tenant-Id` header

## SaaS Agreement Enforcement

### Overview

Tenants can require users to accept a Terms of Service / SaaS Agreement before accessing the application. This is enforced at the middleware level.

### How It Works

1. Tenant admin creates and publishes an agreement via `/api/v1/tenant/agreement`
2. Agreement has status: `draft` → `active` → `archived`
3. Only ONE active agreement per tenant at a time
4. Publishing a new version archives the previous active agreement

### Agreement Gating

When an active agreement exists:
- Authenticated users must accept before accessing protected routes
- Gated users receive HTTP 451 with `code: AGREEMENT_REQUIRED`
- Frontend redirects to `/accept-terms` page

### Exempt Routes (Always Allowed)

These routes bypass agreement enforcement:

| Route Pattern | Purpose |
|---------------|---------|
| `/api/auth/*` | Authentication |
| `/api/v1/me/agreement/*` | Check/accept agreement |
| `/api/v1/tenant/onboarding/*` | Tenant setup |
| `/api/v1/invitations/*` | User invitations |
| `/api/v1/super/*` | Super admin operations |
| `/api/user` | Current user info |
| Static assets (`.js`, `.css`, etc.) | Frontend resources |

### Super Admin Behavior

| Scenario | Behavior |
|----------|----------|
| Super user direct access | ✅ Bypasses agreement check |
| Super user "acting as tenant" via X-Tenant-Id | ✅ Still bypasses (role-based) |

**Rationale**: Super admins need unrestricted access for support/debugging. Agreement enforcement is role-based, not tenant-based.

### Version Bump Re-gating

When a new agreement version is published:
1. Previous active agreement is archived
2. All existing acceptances remain (for audit trail)
3. Users must accept the NEW version
4. Check is: `agreementId + version` match required

### Tenant Isolation

- `/api/v1/me/agreement/status` only returns current user's tenant agreement
- `/api/v1/me/agreement/accept` validates agreement belongs to user's tenant
- Cross-tenant access returns 404 (agreement not found)

### Acceptance Tracking

Each acceptance records:
- `userId`, `agreementId`, `version`
- `ipAddress`, `userAgent` (for audit)
- `acceptedAt` timestamp
- Unique constraint: one acceptance per (tenant, user, agreement, version)

## Security Best Practices

1. **Always use strict mode in production**
2. **Never log actual tenant/user IDs in client-facing errors**
3. **Validate tenant ownership before any data access**
4. **Use parameterized queries to prevent SQL injection**
5. **Super user access should be audited**
6. **Regularly review tenancy health dashboard**

## Migration Checklist

When migrating to strict mode:

- [ ] All tables have `tenantId` column
- [ ] All existing data has `tenantId` populated
- [ ] All queries filter by tenant
- [ ] Soft mode enabled without critical warnings
- [ ] Health dashboard shows no violations
- [ ] Enable strict mode in staging first
- [ ] Monitor for 403 errors after enabling strict mode
