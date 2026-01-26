# Incident Log

This document tracks production incidents, root causes, and fixes for reference and prevention.

---

## INCIDENT-2026-01-26-001: Task Creation 500 Error in Tenant Accounts

### Summary
Task creation was failing with HTTP 500 ("Unable to save") for tenant users in production (Railway).

### Affected Endpoints
- `POST /api/tasks` - Main task creation
- `POST /api/tasks/personal` - Personal task creation
- `POST /api/tasks/:taskId/childtasks` - Child task creation
- `POST /api/tasks/:taskId/assignees` - Adding task assignees

### Root Cause Analysis

**Primary Issue: Missing tenantId on Task Assignees**
The `addTaskAssignee` function was being called without the `tenantId` parameter. While the `task_assignees.tenant_id` column is nullable in the database, this created:
1. Data integrity issues - assignees lacked tenant context
2. Potential foreign key chain problems in complex queries
3. Race conditions where the assignee creation could fail silently

**Secondary Issue: Unhandled Exceptions**
The `addTaskAssignee` call was not wrapped in try-catch, so any database error during assignee creation would bubble up as a 500 error even though the task itself was created successfully.

**Legacy Data Issue**
Some projects in the database have `tenant_id = NULL` (created before tenant enforcement). When tenant users try to create tasks for these projects, `getProjectByIdAndTenant` returns undefined, causing a 400 error (not 500).

### Fix Applied

1. **Added tenantId to all addTaskAssignee calls**:
   - `POST /api/tasks` - Line 1633
   - `POST /api/tasks/personal` - Line 1388
   - `POST /api/tasks/:taskId/childtasks` - Line 1700
   - `POST /api/tasks/:taskId/assignees` - Line 1903

2. **Wrapped assignee creation in try-catch**:
   - Auto-assignment now fails gracefully with a warning log
   - Task creation still succeeds even if assignee fails

3. **Improved error logging**:
   - All error responses now include `requestId`
   - Structured logging format: `[Route Error] requestId=... userId=... tenantId=... error=...`

### Files Changed
- `server/routes.ts` - Task creation endpoints

### Testing
- Existing tests: `server/tests/tenant-task-create.test.ts`
- Test coverage:
  - Create task with valid project (tenant-scoped)
  - Create task validates project belongs to tenant
  - Create task rejects cross-tenant project
  - Create personal task (no project)
  - Error responses include requestId only (no stack traces)

### Verification Checklist

**Local Testing:**
- [ ] Create task as tenant admin → succeeds with tenantId
- [ ] Create task as tenant employee → succeeds with tenantId
- [ ] Create personal task → succeeds with isPersonal=true
- [ ] Create task for project with null tenantId → returns 400, not 500
- [ ] All error responses include requestId in body

**Railway Verification:**
- [ ] Deploy changes
- [ ] Create task in tenant account → succeeds
- [ ] Check error_logs table for any new 500s on task routes

### Using RequestId for Debugging

1. When a user reports "Unable to create task", ask for the Request ID from the error toast
2. In Super Admin > Error Logs, search by request_id
3. Error log entry shows: path, method, error_name, message, db_code, db_constraint, meta

### Prevention

- All `addTaskAssignee` calls must include `tenantId` parameter
- All storage operations that could fail should be wrapped in try-catch
- Error responses must always include `requestId` for correlation

---

## Template for New Incidents

```markdown
## INCIDENT-YYYY-MM-DD-NNN: Brief Title

### Summary
One-line description of the issue.

### Affected Endpoints
- `METHOD /path` - Description

### Root Cause Analysis
What caused the issue.

### Fix Applied
What was changed.

### Files Changed
- `path/to/file.ts` - What changed

### Testing
Test coverage and commands.

### Verification Checklist
- [ ] Step 1
- [ ] Step 2

### Prevention
How to prevent similar issues.
```
