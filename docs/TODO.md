# TODO - Future Improvements

This document tracks known issues and planned improvements identified during the quality audit.

## High Priority

### Code Organization

- [ ] **Split routes.ts** - The main routes file is 3500+ lines
  - Extract workspace routes → `server/routes/workspaces.ts`
  - Extract project routes → `server/routes/projects.ts`
  - Extract task routes → `server/routes/tasks.ts`
  - Extract client routes → `server/routes/clients.ts`
  - Extract time entry routes → `server/routes/timeEntries.ts`
  - Extract user routes → `server/routes/users.ts`
  - Extract settings routes → `server/routes/settings.ts`
  - Extract attachment routes → `server/routes/attachments.ts`
  - Keep middleware and index mounting unchanged
  - **Risk**: High - requires careful testing
  - **Approach**: One domain at a time with tests

### Testing

- [ ] **Add integration tests for critical paths**
  - Authentication flow tests
  - Tenant isolation tests
  - Task CRUD tests
  - Time tracking persistence tests

- [ ] **Add E2E tests**
  - Login → create project → add task flow
  - Time tracking timer lifecycle
  - Super admin tenant management

### Security

- [x] **Rate limiting** - Implemented (in-memory, see `docs/SECURITY_RATE_LIMITS.md`)
  - [x] Rate limiting middleware for auth endpoints (login, bootstrap, invite, forgot-password)
  - [x] Rate limiting for file uploads and admin endpoints (invite/user creation)
  - [x] Rate limiting for chat and CRM client messaging
  - [ ] Consider per-tenant rate limits
  - [ ] Consider Redis-backed storage for multi-instance deployments

- [ ] **CSRF protection** - Currently relying on SameSite cookies
  - Consider adding CSRF tokens for sensitive operations

## Medium Priority

### Performance

- [ ] **Database query optimization**
  - Add indexes for common query patterns
  - Review N+1 query issues in list endpoints
  - Consider query caching for read-heavy endpoints

- [ ] **Real-time event optimization**
  - Reduce unnecessary broadcast events
  - Add room-based subscriptions per project

### Validation

- [ ] **Standardize input validation**
  - Create shared validation schemas
  - Add consistent UUID validation for all ID parameters
  - Add pagination validation helpers

- [ ] **Error response consistency**
  - Standardize error format across all endpoints
  - Add error codes for client-side handling

### Documentation

- [ ] **API documentation**
  - Add OpenAPI/Swagger specification
  - Generate API docs from schema

- [ ] **Code documentation**
  - Add JSDoc comments to storage methods
  - Document complex business logic
  - Add architecture decision records (ADRs)

## Low Priority

### Developer Experience

- [ ] **Add development seeds**
  - Script to create demo data
  - Per-tenant seed data

- [ ] **Improve logging**
  - Structured logging format
  - Request ID tracing
  - Performance timing logs

### Features (Future Consideration)

- [ ] **Webhook system** - Allow external integrations
- [ ] **API keys** - Programmatic access without sessions
- [ ] **Audit log export** - Compliance reporting
- [ ] **Bulk operations** - Batch task updates/deletions

## Known Issues

### Minor Bugs

1. **Timer state edge case**: If browser is closed during pause, resume may calculate duration incorrectly
   - Location: `server/routes.ts` timer routes
   - Workaround: Clear timer and start fresh

2. **Section reorder race condition**: Concurrent reorders may result in inconsistent order
   - Location: `server/routes.ts` reorder endpoint
   - Workaround: None, affects multi-user editing

### Technical Debt

1. **Demo user fallback**: `getCurrentUserId()` returns hardcoded ID if no user
   - Should throw error or require auth
   - Low risk: protected by auth middleware

2. **Workspace context**: `getCurrentWorkspaceId()` returns hardcoded ID
   - Should use session workspace or throw
   - Consider: workspace context middleware

3. **Tenant ID type consistency**: Some places use `string`, others `string | null`
   - Standardize on `string` for required, add explicit null checks

## Completed

- [x] Create audit checklist (`docs/AUDIT_CHECKLIST.md`)
- [x] Document all API endpoints (`docs/ENDPOINTS.md`)
- [x] Document tenant isolation (`docs/SECURITY_TENANCY.md`)
- [x] Create deployment guide (`docs/DEPLOYMENT_RAILWAY.md`)
- [x] Create server README (`server/README.md`)
- [x] Create client README (`client/README.md`)
- [x] Create main README (`README.md`)
- [x] Verify middleware order is correct
- [x] Add basic test infrastructure

## Notes

- All changes should follow the safety rules: no schema changes, no endpoint path changes
- Large refactors should be done incrementally with tests
- Consider feature flags for gradual rollouts
