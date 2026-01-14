# Documentation Checklist

Use this checklist when adding or modifying features to ensure documentation is complete.

---

## Before Submitting Changes

### Code Documentation
- [ ] Module-level header comment added to new files
- [ ] Inline comments for complex/security-sensitive logic
- [ ] TODO comments have context (not just "TODO")
- [ ] No outdated comments left behind

### API Documentation
- [ ] New endpoints added to `/docs/ENDPOINTS.md`
- [ ] Request/response shapes documented
- [ ] Authentication requirements noted
- [ ] Error responses documented

### Feature Tracking
- [ ] Feature added to `/docs/FEATURE_INVENTORY.md`
- [ ] Related API endpoints listed
- [ ] UI routes documented (if applicable)

### Environment & Configuration
- [ ] New env variables added to `/docs/ENVIRONMENT_VARIABLES.md`
- [ ] Default values documented
- [ ] Required vs optional clearly marked
- [ ] Secrets identified (use `request_env_var` tool)

### Tenancy & Security
- [ ] Tenant isolation enforced in new endpoints
- [ ] `getEffectiveTenantId()` used for tenant context
- [ ] Super user handling documented if special
- [ ] Impersonation behavior verified

### Testing
- [ ] Unit/integration tests added for new functionality
- [ ] Edge cases covered
- [ ] Test descriptions are clear and descriptive
- [ ] Tests pass locally before submit

### UI Changes
- [ ] Page header comment added for new pages
- [ ] Key state flows documented
- [ ] API dependencies listed
- [ ] User roles noted

---

## Quick Reference

| Changed... | Update... |
|------------|-----------|
| API endpoint | ENDPOINTS.md, route header |
| UI page | FEATURE_INVENTORY.md, page header |
| Env variable | ENVIRONMENT_VARIABLES.md |
| Auth logic | Inline comments + auth.ts header |
| Tenancy logic | Inline comments + SECURITY_TENANCY.md |
| Database query | Consider performance notes |

---

## Security-Sensitive Checklist

If touching these areas, extra care required:

### Authentication Changes
- [ ] Session handling unchanged or documented
- [ ] Password rules maintained
- [ ] No secrets exposed in logs/responses

### Tenant Context Changes
- [ ] Isolation not weakened
- [ ] Super user bypass intentional and documented
- [ ] X-Tenant-Id header handling secure

### Agreement Enforcement Changes
- [ ] Exempt routes list reviewed
- [ ] Error handling is fail-safe
- [ ] Super user behavior documented

### File Upload Changes
- [ ] File type validation in place
- [ ] Size limits enforced
- [ ] Path traversal prevented

---

## Post-Feature Cleanup

After feature is complete:
- [ ] Remove debug console.log statements
- [ ] Remove commented-out code
- [ ] Verify no hardcoded test data
- [ ] Run full test suite
- [ ] Update KNOWN_ISSUES.md if needed

---

*Use this checklist with every PR or feature addition.*
