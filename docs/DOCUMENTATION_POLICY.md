# Documentation & Annotation Policy

This document establishes the documentation standards for MyWorkDay development.
All contributors should follow these guidelines when adding or modifying features.

---

## Core Principles

1. **Document why, not what** - Code shows what; comments explain intent and constraints
2. **Keep docs near code** - Annotations in files, not separate documents when possible
3. **Update as you go** - Documentation is part of the feature, not an afterthought
4. **Concise over verbose** - Short, useful comments beat lengthy explanations

---

## Required Documentation per Feature

### 1. Module-Level Header Comments

Every new route file, service, or major component must include a header block:

**Server Route Example:**
```typescript
/**
 * [Module Name] Routes
 * 
 * Purpose: [1-2 sentence description]
 * 
 * Auth: [authenticated | super_user | tenant_admin | public]
 * Tenancy: [tenant-scoped | global | super-only]
 * 
 * Key Invariants:
 * - [Important rule #1]
 * - [Important rule #2]
 */
```

**React Page Example:**
```tsx
/**
 * [Page Name]
 * 
 * Purpose: [What the page does]
 * 
 * User Roles: [Who can access]
 * API Dependencies: [Key endpoints used]
 * Key State: [Main state management approach]
 */
```

### 2. Feature Inventory Entry

Update `/docs/FEATURE_INVENTORY.md` with:
- Feature name
- Related API endpoints
- UI routes (if any)
- Brief description

### 3. Environment Variables

If adding new environment variables:
- Add to `/docs/ENVIRONMENT_VARIABLES.md`
- Include: name, purpose, default value, required/optional

### 4. README Updates

Update relevant README when:
- Adding new major features
- Changing setup requirements
- Modifying configuration

---

## Security-Sensitive Areas

The following areas require extra documentation care:

### Authentication (`server/auth.ts`)
- Session handling invariants
- Password storage rules
- Token expiration logic

### Tenant Context (`server/middleware/tenantContext.ts`)
- Header processing rules (X-Tenant-Id)
- Super user special handling
- DO NOT BREAK notes for isolation

### Agreement Enforcement (`server/middleware/agreementEnforcement.ts`)
- Exempt routes list
- Enforcement modes
- Error handling behavior

### Impersonation (`superAdmin.ts` impersonate routes)
- Audit logging requirements
- State management
- Exit conditions

### File Uploads (`server/s3.ts`)
- Allowed file types
- Size limits
- Security validation

---

## Annotation Guidelines

### DO:
- Explain business logic that isn't obvious from code
- Note "sharp edges" that could cause bugs
- Document API contracts that must not change
- Add TODO comments with context (not just "TODO: fix")

### DON'T:
- Repeat what the code clearly shows
- Write essays in comments
- Leave outdated comments
- Comment every function

### Good Example:
```typescript
// Super users can access inactive tenants for pre-provisioning.
// This is intentional - don't add isActive check here.
if (user.role === UserRole.SUPER_USER) {
  return tenantId;
}
```

### Bad Example:
```typescript
// Check if user is super user and return tenant ID
if (user.role === UserRole.SUPER_USER) {
  return tenantId;
}
```

---

## Test Documentation

### Required for New Endpoints:
- Test file in `server/tests/`
- Cover happy path + error cases
- Document edge cases in test descriptions

### Test Naming Convention:
```typescript
describe("POST /api/v1/resource", () => {
  it("should create resource with valid data", ...);
  it("should return 401 when unauthenticated", ...);
  it("should return 403 when accessing other tenant", ...);
});
```

---

## When to Update Documentation

| Trigger | Required Updates |
|---------|------------------|
| New API endpoint | ENDPOINTS.md, FEATURE_INVENTORY.md, route header |
| New UI page | FEATURE_INVENTORY.md, page header comment |
| New env variable | ENVIRONMENT_VARIABLES.md |
| Schema change | ARCHITECTURE_OVERVIEW.md |
| Security change | Inline comments + relevant policy doc |
| Bug fix | Consider KNOWN_ISSUES.md update |

---

## Review Checklist

Before completing any feature, verify:
- [ ] Header comments added to new files
- [ ] FEATURE_INVENTORY.md updated
- [ ] ENVIRONMENT_VARIABLES.md updated (if applicable)
- [ ] Security-sensitive code has invariant comments
- [ ] Tests have descriptive names

---

*Established: January 14, 2026*
*Policy Version: 1.0*
