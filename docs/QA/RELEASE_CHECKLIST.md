# Release Checklist - MyWorkDay

## Pre-Release Verification

### Server Startup
- [ ] Application starts without errors
- [ ] Database connection successful
- [ ] Schema check passes
- [ ] No critical warnings in startup logs

### Authentication
- [ ] Login works
- [ ] Logout works
- [ ] Session persists across page refreshes
- [ ] Password reset works (if applicable)
- [ ] Google OAuth works (if configured)

### Core Features
- [ ] Dashboard loads after login
- [ ] Projects list loads
- [ ] Create project works
- [ ] Project detail page loads
- [ ] Create task works
- [ ] Task detail drawer opens
- [ ] Time tracking start/stop works
- [ ] Clients list loads
- [ ] Create client works
- [ ] Client detail page loads

### Chat System
- [ ] Chat page loads
- [ ] Create channel works
- [ ] Send message works
- [ ] Messages appear in real-time
- [ ] Unread indicators work

### Super Admin (if applicable)
- [ ] Super Admin dashboard loads
- [ ] Tenant list loads
- [ ] System status page loads
- [ ] Reports load

## Database Health

### Data Integrity
- [ ] No NULL tenantId rows (run backfill if needed)
- [ ] No orphaned data
- [ ] All FK constraints valid

### Migrations
- [ ] All migrations applied
- [ ] Schema matches expected state

## Security

### Authentication
- [ ] Protected routes require login
- [ ] Rate limiting enabled in production
- [ ] Session secrets configured

### Tenant Isolation
- [ ] Users can only see their tenant's data
- [ ] Super Admin impersonation works correctly

## Performance

### Response Times
- [ ] API responses under 500ms
- [ ] Page loads under 3 seconds
- [ ] No blocking database queries

### Resource Usage
- [ ] Memory usage stable
- [ ] No memory leaks in long sessions

## Known Issues

See `BUG_LOG.md` for current known issues:

1. **BUG-001**: 10 rows with NULL tenantId - run backfill script
2. **BUG-002**: FK constraint violations in tests - infrastructure issue
3. **BUG-003**: Client selector overlay flakiness - minor UI issue

## Post-Release

- [ ] Monitor error logs for first 24 hours
- [ ] Verify production database connectivity
- [ ] Test one critical user flow in production
- [ ] Notify stakeholders of successful release

## Rollback Plan

If critical issues are found:

1. Revert to previous deployment
2. Restore database from backup (if data corruption)
3. Investigate root cause
4. Fix and re-deploy

---

**Last Updated**: February 2026
