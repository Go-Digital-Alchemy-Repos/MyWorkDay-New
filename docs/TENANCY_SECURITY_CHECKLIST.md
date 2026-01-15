# Tenancy Security Checklist

This document provides a comprehensive checklist for validating multi-tenant security in MyWorkDay.

## Overview

MyWorkDay is a multi-tenant SaaS application where:
- **Tenants** are isolated organizations with their own data
- **Users** belong to exactly one tenant
- **Super Users** can access any tenant via the `X-Tenant-Id` header

## Critical Security Invariants

### 1. Tenant Isolation
- [ ] Regular users can ONLY access resources within their own tenant
- [ ] Tenant A users cannot access Tenant B resources by ID
- [ ] List endpoints filter by `effectiveTenantId`
- [ ] Detail endpoints validate resource ownership against `effectiveTenantId`

### 2. Super User Access Control
- [ ] Super users MUST provide `X-Tenant-Id` header for tenant-scoped operations
- [ ] Without `X-Tenant-Id`, super users receive 400/500 errors (not empty lists)
- [ ] `X-Tenant-Id` header is ONLY processed for verified super users
- [ ] Non-super users cannot use `X-Tenant-Id` header (ignored)

### 3. Authentication Requirements
- [ ] All `/api/*` routes require authentication (except `/api/auth/*`, `/api/health`)
- [ ] `requireAuth` middleware validates session before route handlers
- [ ] `requireTenantContext` middleware validates tenant context
- [ ] Super-only routes use `requireSuperUser` middleware

## Audited Endpoints

The following endpoints have been audited for tenant isolation:

| Entity | Endpoints | Tenant Scoping |
|--------|-----------|----------------|
| **Clients** | `GET /api/clients`, `GET /api/clients/:id` | ✅ Uses `getClientsByTenant`, `getClientByIdAndTenant` |
| **Projects** | `GET /api/projects`, `GET /api/projects/:id` | ✅ Uses `getProjectsByTenant`, `getProjectByIdAndTenant` |
| **Tasks** | `GET /api/tasks/my`, `GET /api/tasks/:id` | ✅ Tenant context enforced |
| **Teams** | `GET /api/teams`, `GET /api/teams/:id` | ✅ Uses `getTeamsByTenant`, `getTeamByIdAndTenant` |
| **Users** | `GET /api/users`, `GET /api/users/:id` | ✅ Uses `getUserByIdAndTenant` |
| **Time Entries** | `GET /api/time-entries` | ✅ Tenant context enforced |
| **Workspaces** | `GET /api/workspaces` | ✅ Tenant-scoped queries |

## Middleware Chain

```
Request → Session → Auth → TenantContext → TenancyEnforcement → Route Handler
```

### Key Middleware

1. **`tenantContextMiddleware`** - Injects `req.tenant` with:
   - `tenantId`: User's actual tenant ID
   - `effectiveTenantId`: Active tenant context (may differ for super users)
   - `isSuperUser`: Boolean flag

2. **`requireTenantContext`** - Ensures tenant context is available
   - Regular users: Must have `tenantId`
   - Super users: Allowed through (may use `X-Tenant-Id`)

3. **`validateTenantOwnership`** - Resource ownership validation
   - Modes: `off` | `soft` | `strict`
   - Configured via `TENANCY_ENFORCEMENT` env var

## Tenancy Enforcement Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `off` | No enforcement, legacy fallback | Development, initial migration |
| `soft` | Log warnings, allow access | Data migration, gradual rollout |
| `strict` | Block with 403, audit logs | **Production recommended** |

## Test Coverage

The test suite `server/tests/tenancy_permissions_audit.test.ts` covers:

### Cross-Tenant Access Prevention (6 tests)
- Tenant A user cannot access Tenant B client
- Tenant A user cannot access Tenant B project
- Tenant A user cannot access Tenant B task
- Tenant A user cannot access Tenant B team
- Tenant A user cannot access Tenant B user
- Tenant A user cannot access Tenant B time entry

### Own Tenant Access (3 tests)
- Can access own tenant client
- Can access own tenant project
- List returns only own tenant resources

### Super User Access Control (5 tests)
- Blocked from listing without `X-Tenant-Id`
- Blocked from detail access without `X-Tenant-Id`
- Can list with valid `X-Tenant-Id`
- Can access resource with matching `X-Tenant-Id`
- Cannot access cross-tenant resource even with header

### Enforcement Modes (3 tests)
- Strict mode blocks cross-tenant access
- Soft mode logs but allows legacy access
- Same-tenant access always allowed

## Self-Check Endpoint

Super admins can run a permissions audit via:

```
GET /api/v1/super/status/permissions-audit
```

Response includes:
- Routes audited count
- Critical entities covered
- Check results (pass/fail/warning)
- Current enforcement mode
- Missing middleware warnings
- Orphan data detection

## Recommended Production Configuration

```env
# Enable strict tenancy enforcement
TENANCY_ENFORCEMENT=strict

# Ensure session security
SESSION_SECRET=<strong-random-value>
NODE_ENV=production
```

## Common Attack Vectors Mitigated

1. **Direct ID enumeration**: Resources fetched by ID are validated against tenant ownership
2. **Parameter tampering**: `effectiveTenantId` derived from session, not request params
3. **Header injection**: `X-Tenant-Id` only processed for authenticated super users
4. **List data leakage**: All list queries scoped by `effectiveTenantId`
5. **Orphan data access**: Legacy null-tenant records handled by enforcement modes

## Audit Logging

When `TENANCY_ENFORCEMENT=soft` or `strict`:
- Cross-tenant access attempts are logged
- Orphan data access is logged
- Missing tenant context errors are logged

## Next Steps

1. **Enable strict mode** in production environments
2. **Backfill missing tenantId** using data health remediation tools
3. **Monitor audit logs** for cross-tenant access attempts
4. **Review orphan counts** in System Status Dashboard
5. **Run test suite** regularly: `npx vitest run server/tests/tenancy_permissions_audit.test.ts`
