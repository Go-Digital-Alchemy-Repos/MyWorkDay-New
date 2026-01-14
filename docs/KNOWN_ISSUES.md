# Known Issues & Technical Debt

This document tracks known issues, technical debt, and areas for improvement.

## High Priority

### 1. Large Route File (routes.ts)
**File**: `server/routes.ts`  
**Size**: ~3,700 lines  
**Impact**: Maintainability, code navigation difficulty

**Description**: The main routes file contains most API endpoints in a single file. While functional, this makes it harder to navigate and understand the codebase.

**Recommended Action**: Consider splitting into domain modules when undertaking significant refactoring. The current structure has been deemed "safe" to avoid breaking changes, but should be addressed during a dedicated refactoring sprint.

**Sections that could be extracted**:
- Tasks routes (~600 lines)
- Timer/Time entries routes (~400 lines)
- Client (CRM) routes (~400 lines)
- Section routes (~200 lines)

---

### 2. Mixed Tenant Scoping Patterns
**Files**: Various route files  
**Impact**: Security, consistency

**Description**: Some endpoints use `getEffectiveTenantId()` with tenant-scoped storage methods, while others fall back to legacy non-scoped methods. The TENANCY_ENFORCEMENT mode (off/soft/strict) controls behavior, but not all routes handle all modes consistently.

**Recommended Action**: Audit all routes for consistent tenant scoping. In strict mode, all tenant data access should use tenant-scoped storage methods exclusively.

---

## Medium Priority

### 3. Inconsistent Error Response Format
**Files**: `server/routes.ts`, `server/routes/*.ts`  
**Impact**: API consistency, client error handling

**Description**: Error responses vary between:
- `{ error: "message" }`
- `{ error: { ... } }` (Zod errors)
- `{ message: "..." }`

**Recommended Action**: Standardize all error responses using the `AppError` class and helpers from `server/lib/errors.ts`.

---

### 4. Missing Request Validation
**Impact**: Data integrity, security

**Description**: Not all endpoints validate request bodies using Zod schemas. Some endpoints directly use `req.body` without validation.

**Recommended Action**: Use `validateBody()` helper from `server/lib/errors.ts` for all POST/PATCH endpoints.

---

### 5. Large Storage Class (storage.ts)
**File**: `server/storage.ts`  
**Size**: ~1,800 lines  
**Impact**: Maintainability

**Description**: The DatabaseStorage class contains methods for all entities. While it implements a clean interface, the class size makes it harder to maintain.

**Recommended Action**: Consider splitting into entity-specific modules (e.g., `TaskStorage`, `ClientStorage`) that implement portions of the interface.

---

## Low Priority

### 6. Test Coverage Gaps
**Impact**: Reliability

**Description**: Current test coverage focuses on:
- ✅ Tenancy enforcement
- ✅ Workload reports
- ✅ Tenant integrations
- ✅ Bootstrap/registration flow
- ❌ Task CRUD with auth
- ❌ Project CRUD with auth
- ❌ Client CRUD with auth
- ❌ Time tracking flows

**Recommended Action**: Add integration tests for authenticated CRUD flows.

---

### 7. No Rate Limiting
**Impact**: Security, reliability

**Description**: No rate limiting is currently implemented for API endpoints.

**Recommended Action**: Add rate limiting middleware (e.g., express-rate-limit) for production deployments.

---

### 8. Activity Log Coverage
**Impact**: Audit trail completeness

**Description**: Not all entity changes are logged to the activity log. Coverage is inconsistent across different entity types.

**Recommended Action**: Audit all CRUD operations and ensure significant changes are logged.

---

## Completed Items

### ✅ Error Handling Utilities
Enhanced `server/lib/errors.ts` with:
- Validation helpers (`validateBody`, `validateQuery`)
- Zod error formatting
- Route error handling
- UUID validation

### ✅ API Documentation
Updated `docs/ENDPOINTS.md` with:
- Workload Reports endpoints (6)
- Projects Dashboard endpoints (5)
- User Profile & Agreement endpoints (4)

---

## Notes

- **Last Updated**: January 2026
- **Review Frequency**: Monthly or when undertaking major changes
- When addressing any issue, update this document to track progress.
