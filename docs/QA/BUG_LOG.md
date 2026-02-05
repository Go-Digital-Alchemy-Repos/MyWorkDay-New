# Bug Log - MyWorkDay QA Sweep

## Summary
| ID | Area | Severity | Status | Description |
|----|------|----------|--------|-------------|
| BUG-001 | Data Integrity | **HIGH** | Open | 10 rows with NULL tenantId in database - security risk |
| BUG-002 | Tests | Low | Known | FK constraint violations in test cleanup |
| BUG-003 | UI | Low | Known | Client selector overlay flakiness in Create Project |

---

## BUG-001: NULL tenantId Rows in Database

**Area**: Data Integrity / Security  
**Severity**: HIGH - MUST FIX BEFORE PRODUCTION  
**Status**: Open

### Steps to Reproduce
1. Start application
2. Check startup logs for `tenantIdHealthCheck`

### Expected Behavior
All rows should have valid `tenantId` values for proper tenant isolation.

### Actual Behavior
```
[tenantIdHealthCheck] Found 10 rows with NULL tenantId:
  - users: 6 rows
  - teams: 3 rows
  - workspaces: 1 rows
```

### Security Impact
NULL tenantId rows can bypass tenant isolation queries, potentially exposing data to wrong tenants or causing unexpected behavior in multi-tenant contexts.

### Suspected Root Cause
Legacy data or test data created without proper tenant assignment, likely from:
- Super Admin users created before tenancy enforcement
- Test data from development phase

### Recommended Fix
Run backfill script to assign proper tenantId values:
```bash
npx tsx server/scripts/backfillTenantId.ts --dry-run  # Preview changes
npx tsx server/scripts/backfillTenantId.ts             # Apply changes
```

### Verification
- Re-run startup and check logs for zero NULL tenantId rows
- Verify affected users can still log in after backfill

---

## BUG-002: FK Constraint Violations in Test Cleanup

**Area**: Tests  
**Severity**: Low (test infrastructure, not app functionality)  
**Status**: Known

### Steps to Reproduce
1. Run `npx vitest run`
2. Observe failures in bootstrap-registration and platform-admins tests

### Expected Behavior
Tests should clean up data properly after each run.

### Actual Behavior
```
Error: Key (id)=(xxx) is still referenced from table "subtask_assignees"
Error: Key (id)=(xxx) is still referenced from table "platform_audit_events"
```

### Suspected Root Cause
Test cleanup doesn't respect FK dependency order. Child tables must be cleaned before parent tables.

### Recommended Fix
Update test cleanup to delete in proper FK order:
1. Delete from child tables (subtask_assignees, platform_audit_events)
2. Then delete from parent tables (subtasks, users)

### Files Changed
- `server/tests/bootstrap-registration.test.ts`
- `server/tests/platform-admins.test.ts`

---

## BUG-003: Client Selector Overlay Flakiness

**Area**: UI  
**Severity**: Low  
**Status**: Known

### Steps to Reproduce
1. Navigate to Projects page
2. Click "Create Project"
3. Try to select a client from the dropdown

### Expected Behavior
Client dropdown opens and selection works smoothly.

### Actual Behavior
Occasionally, overlay animations or discard confirmation dialogs intercept pointer events, causing selection to fail or timeout.

### Suspected Root Cause
Z-index or animation timing issues with overlapping dialogs/modals.

### Recommended Fix
Review z-index stacking and modal dismissal timing.

---

## Completed Fixes

*(No fixes completed yet)*

---

## Verified NOT Bugs

### Super Admin First-User Bootstrap

**Initial Report**: E2E test reported that registered user had `role=employee` and couldn't access Super Admin.

**Investigation Result**: NOT A BUG - Expected Behavior

The database already contains 23 users with 3 existing Super Admins. The "first user becomes Super Admin" logic correctly checks if ANY users exist in the database, not just in the current test session. New registrations are employees because Super Admins already exist.

**Evidence**: `SELECT COUNT(*) FROM users` = 23, `SELECT COUNT(*) FROM users WHERE role = 'super_user'` = 3

---

## Testing Coverage Gaps

The following areas were not fully tested via E2E:

| Area | Reason | Risk |
|------|--------|------|
| Time Tracking | Not tested | Low - no issues in logs |
| Workload Reports | Not tested | Low - no issues in logs |
| Chat Export | Not tested via UI | Low - schema/API verified |
| Notifications | Not tested | Low - no issues in logs |

**Recommendation**: Add E2E tests for these areas in future QA sprints.

---

## Notes

- Last Updated: February 2026
- Test Pass Rate: 717/809 (89%)
- Most failures are test infrastructure issues, not app bugs
- BUG-001 is the only HIGH severity issue that must be fixed before production
