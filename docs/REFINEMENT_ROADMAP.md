# Refinement Roadmap - Next 3-5 Safe Prompts

This document outlines the next 3-5 implementation prompts for improving MyWorkDay, 
organized in recommended execution order. Each prompt is scoped for safety with clear boundaries.

---

## Prompt 1: Test Fixture Cleanup & Coverage Expansion

### Objective
Fix the foreign key constraint violations in test cleanup and expand test coverage for critical CRUD flows.

### Scope Boundaries
**DO:**
- Fix test cleanup order in `purge-guards.test.ts`, `bootstrap-registration.test.ts`, `tenant-pre-provisioning.test.ts`
- Create `server/tests/fixtures.ts` with proper cleanup utilities
- Add integration tests for authenticated Task CRUD
- Add integration tests for authenticated Client CRUD

**DO NOT:**
- Change any production code logic
- Modify database schema
- Change API response shapes
- Touch auth or tenancy enforcement

### Acceptance Criteria
- [ ] All 12 previously failing tests now pass
- [ ] New test file for Task CRUD with 8+ test cases
- [ ] New test file for Client CRUD with 6+ test cases
- [ ] Total test count increases by 20+

### Test Coverage to Add
- Task creation with tenant context
- Task update with authorization checks
- Task deletion cascade behavior
- Client creation and listing with tenant scoping

### Risk Level
**Low** - Tests only, no production code changes

### Recommended Run Order
**1 of 5** - Foundation for safe iteration

---

## Prompt 2: Agreement Gating Edge Cases (Phase 3C Hardening)

### Objective
Harden the agreement enforcement middleware to handle edge cases properly.

### Scope Boundaries
**DO:**
- Audit `server/middleware/agreementEnforcement.ts` for edge cases
- Handle case where tenant has no active agreement (should enforce or not?)
- Review error handling (currently fails open on exceptions)
- Add tests for agreement edge cases
- Document expected behavior in code comments

**DO NOT:**
- Change the overall enforcement strategy
- Modify database schema
- Change the 451 response shape
- Alter super user bypass logic without explicit confirmation
- Touch tenant onboarding flow

### Acceptance Criteria
- [ ] Explicit handling for "no active agreement" case documented and tested
- [ ] Error handling changed to fail-safe (block if unsure) with logging
- [ ] 5+ new tests covering edge cases
- [ ] Inline comments explaining invariants

### Test Coverage to Add
- Tenant with no agreements (new tenant, first agreement)
- Expired agreement with no replacement
- Agreement enforcement during error conditions
- Super user impersonating tenant with required agreement

### Risk Level
**Medium** - Security-sensitive area, requires careful testing

### Recommended Run Order
**2 of 5** - Security hardening before feature work

---

## Prompt 3: Time Tracking Editability & Task Selection

### Objective
Improve time entry editing UX and task/subtask selection in time tracking.

### Scope Boundaries
**DO:**
- Add ability to edit existing time entries (duration, description, task)
- Add task/subtask dropdown to time entry form
- Add validation for time entry edits
- Update `TimeEntryDrawer` component

**DO NOT:**
- Change database schema (use existing fields)
- Modify time entry API response shape (only add PUT if missing)
- Touch timer functionality
- Alter project/client association logic

### Acceptance Criteria
- [ ] Users can edit time entry description
- [ ] Users can edit time entry duration
- [ ] Users can change associated task
- [ ] Edit confirmation saves correctly
- [ ] Activity log records time entry edits

### Test Coverage to Add
- Time entry PATCH endpoint
- Time entry validation
- Authorization checks for editing

### Risk Level
**Low** - Self-contained feature enhancement

### Recommended Run Order
**3 of 5** - User-requested feature

---

## Prompt 4: Super Admin Tenant Drawer Usability

### Objective
Improve the tenant management drawer UX in Super Admin.

### Scope Boundaries
**DO:**
- Improve tab loading states in TenantDrawer
- Add confirmation dialogs for destructive actions (suspend, deactivate)
- Improve error message display
- Add success toasts for actions
- Fix any focus/scroll issues in drawer

**DO NOT:**
- Change tenant status enum values
- Modify tenant API endpoints
- Change impersonation logic
- Alter onboarding flow

### Acceptance Criteria
- [ ] All tabs load with visible spinner states
- [ ] Destructive actions require confirmation
- [ ] Success/error feedback is consistent
- [ ] Drawer scrolls properly on long content

### Test Coverage to Add
- Component tests for TenantDrawer tabs
- Integration test for tenant status changes

### Risk Level
**Low** - UI polish only

### Recommended Run Order
**4 of 5** - Polish after core functionality

---

## Prompt 5: Performance Optimization for List Endpoints

### Objective
Address N+1 query patterns in heavy list endpoints.

### Scope Boundaries
**DO:**
- Optimize `/api/v1/projects` with joins instead of loops
- Optimize `/api/v1/super/tenants-detail` with batch queries
- Add database indexes if clearly needed (non-destructive)
- Measure before/after query counts

**DO NOT:**
- Change API response shapes
- Add pagination where it doesn't exist (separate prompt)
- Restructure storage layer
- Touch auth or tenancy logic

### Acceptance Criteria
- [ ] Projects list endpoint reduces queries by 50%+
- [ ] Tenant detail endpoint uses batched queries
- [ ] Response times documented before/after
- [ ] No API contract changes

### Test Coverage to Add
- Load tests for optimized endpoints
- Regression tests for response shape

### Risk Level
**Medium** - Performance changes can have subtle effects

### Recommended Run Order
**5 of 5** - Optimization after stability

---

## Summary Table

| Order | Prompt | Risk | Focus Area |
|-------|--------|------|------------|
| 1 | Test Fixtures & Coverage | Low | Testing infrastructure |
| 2 | Agreement Gating Hardening | Medium | Security |
| 3 | Time Entry Editability | Low | Feature |
| 4 | Tenant Drawer Usability | Low | UX Polish |
| 5 | Performance Optimization | Medium | Performance |

---

## Additional Backlog (Not Prioritized)

These items were identified but not included in the immediate roadmap:

- **Mailgun Settings Persistence/Masking** - Tenant integration secrets handling
- **S3 Upload Consistency** - Unified upload service for branding/avatars
- **Navigation Mode Switching** - Super vs tenant mode edge cases
- **Rate Limiting** - API protection for production
- **Error Response Standardization** - Consistent error shapes

---

*Created: January 14, 2026*
*Review Frequency: After each prompt completion*
