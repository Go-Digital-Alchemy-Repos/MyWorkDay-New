# Phase 3C Regression Checklist - Agreement Gating

## Overview
This document tracks regression testing for the SaaS Agreement enforcement feature.

## Exempt Endpoints (Must NOT be blocked)

| Route | Expected | Status |
|-------|----------|--------|
| `/api/auth/login` | 200/401 (auth result) | ✅ |
| `/api/auth/logout` | 200 | ✅ |
| `/api/auth/register` | 200/400 | ✅ |
| `/api/user` | 200 (current user) | ✅ |
| `/api/v1/me/agreement/status` | 200 | ✅ |
| `/api/v1/me/agreement/accept` | 200 | ✅ |
| `/api/v1/tenant/onboarding/*` | 200 | ✅ |
| `/api/v1/invitations/*` | 200 | ✅ |
| `/api/v1/super/*` | 200 (super users) | ✅ |

## Gated Endpoints (Must return 451 if not accepted)

| Route | Expected when gated | Status |
|-------|---------------------|--------|
| `/api/workspaces` | 451 AGREEMENT_REQUIRED | ✅ |
| `/api/projects` | 451 AGREEMENT_REQUIRED | ✅ |
| `/api/tasks` | 451 AGREEMENT_REQUIRED | ✅ |
| `/api/teams` | 451 AGREEMENT_REQUIRED | ✅ |
| `/api/clients` | 451 AGREEMENT_REQUIRED | ✅ |

## Super Admin Behavior

| Scenario | Expected | Status |
|----------|----------|--------|
| Super user bypasses agreement check | ✅ Allowed | ✅ |
| Super user "acting as tenant" via X-Tenant-Id | ✅ Still bypassed | ✅ |

## Version Bump Behavior

| Scenario | Expected | Status |
|----------|----------|--------|
| User accepts v1 | User can access app | ✅ |
| Admin publishes v2 | User re-gated, must accept v2 | ✅ |
| User accepts v2 | User can access app | ✅ |

## Tenant Isolation

| Scenario | Expected | Status |
|----------|----------|--------|
| Tenant A user checks Tenant B agreement | 403/404 | ✅ |
| Tenant A user accepts Tenant B agreement | 403/404 | ✅ |
| Agreement status only shows user's tenant | ✅ Isolated | ✅ |

## First User Bootstrap

| Scenario | Expected | Status |
|----------|----------|--------|
| Empty users table + register | User becomes super_user | ✅ |
| Second user registers | User becomes employee | ✅ |
| After purge + register | First user becomes super_user | ✅ |

## Purge Script Safety

| Guard | Condition | Status |
|-------|-----------|--------|
| PURGE_APP_DATA_ALLOWED | Must be "true" | ✅ |
| PURGE_APP_DATA_CONFIRM | Must be "YES_PURGE_APP_DATA" | ✅ |
| Production block | Refuses unless PURGE_PROD_ALLOWED=true | ✅ |

## Manual Test Steps

### Test 1: Agreement Gating Flow
1. Login as tenant user
2. Tenant admin publishes agreement
3. Verify API returns 451 for protected routes
4. Navigate to /accept-terms
5. Accept agreement
6. Verify app unlocks immediately

### Test 2: Version Bump Re-gating
1. User accepts v1 agreement
2. Admin publishes v2
3. Verify user is re-gated
4. User accepts v2
5. Verify access restored

### Test 3: Tenant Isolation
1. Create two tenants with agreements
2. User A cannot see/accept Tenant B agreement
3. API returns 404 or filtered response

### Test 4: First User Bootstrap
1. Purge all data (dev environment)
2. Register first user
3. Verify user has super_user role
4. Register second user  
5. Verify second user has employee role

---
Last Updated: 2025-01-14
