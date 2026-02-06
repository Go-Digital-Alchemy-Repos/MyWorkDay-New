# Refactor Roadmap Baseline

**Created:** February 2026  
**Purpose:** Comprehensive inventory of the server codebase prior to hardening + modularization sprint.

---

## 1. Route Inventory

### 1.1 Main Routes (`server/routes.ts` — 6,131 lines)

| Method | Path | Domain |
|--------|------|--------|
| GET | `/api/workspaces/current` | Workspaces |
| GET | `/api/workspaces/:id` | Workspaces |
| POST | `/api/workspaces` | Workspaces |
| GET | `/api/workspaces/:workspaceId/members` | Workspaces |
| POST | `/api/workspaces/:workspaceId/members` | Workspaces |
| PATCH | `/api/workspaces/:id` | Workspaces |
| GET | `/api/workspaces` | Workspaces |
| GET | `/api/workspace-members` | Workspaces |
| GET | `/api/projects` | Projects |
| GET | `/api/projects/unassigned` | Projects |
| GET | `/api/projects/:id` | Projects |
| POST | `/api/projects` | Projects |
| PATCH | `/api/projects/:id` | Projects |
| PATCH | `/api/projects/:projectId/client` | Projects |
| GET | `/api/projects/:projectId/members` | Projects |
| POST | `/api/projects/:projectId/members` | Projects |
| DELETE | `/api/projects/:projectId/members/:userId` | Projects |
| PUT | `/api/projects/:projectId/members` | Projects |
| POST | `/api/projects/:projectId/hide` | Projects |
| DELETE | `/api/projects/:projectId/hide` | Projects |
| GET | `/api/projects/:projectId/hidden` | Projects |
| GET | `/api/projects/hidden` | Projects |
| GET | `/api/teams` | Teams |
| GET | `/api/teams/:id` | Teams |
| POST | `/api/teams` | Teams |
| GET | `/api/teams/:teamId/members` | Teams |
| POST | `/api/teams/:teamId/members` | Teams |
| PATCH | `/api/teams/:id` | Teams |
| DELETE | `/api/teams/:id` | Teams |
| DELETE | `/api/teams/:teamId/members/:userId` | Teams |
| GET | `/api/projects/:projectId/sections` | Sections |
| PATCH | `/api/projects/:projectId/tasks/reorder` | Sections |
| POST | `/api/sections` | Sections |
| PATCH | `/api/sections/:id` | Sections |
| DELETE | `/api/sections/:id` | Sections |
| GET | `/api/projects/:projectId/tasks` | Tasks |
| GET | `/api/projects/:projectId/calendar-events` | Tasks |
| GET | `/api/projects/:projectId/activity` | Tasks |
| GET | `/api/tasks/my` | Tasks |
| POST | `/api/tasks/personal` | Tasks |
| GET | `/api/v1/my-tasks/sections` | My Tasks |
| POST | `/api/v1/my-tasks/sections` | My Tasks |
| PATCH | `/api/v1/my-tasks/sections/:id` | My Tasks |
| DELETE | `/api/v1/my-tasks/sections/:id` | My Tasks |
| POST | `/api/v1/my-tasks/tasks/:taskId/move` | My Tasks |
| GET | `/api/tasks/:id` | Tasks |
| GET | `/api/tasks/:id/childtasks` | Tasks |
| POST | `/api/tasks` | Tasks |
| POST | `/api/tasks/:taskId/childtasks` | Tasks |
| PATCH | `/api/tasks/:id` | Tasks |
| DELETE | `/api/tasks/:id` | Tasks |
| POST | `/api/tasks/:id/move` | Tasks |
| POST | `/api/tasks/:taskId/assignees` | Tasks |
| DELETE | `/api/tasks/:taskId/assignees/:userId` | Tasks |
| GET | `/api/tasks/:taskId/watchers` | Tasks |
| POST | `/api/tasks/:taskId/watchers` | Tasks |
| DELETE | `/api/tasks/:taskId/watchers/:userId` | Tasks |
| GET | `/api/tasks/:taskId/subtasks` | Subtasks |
| POST | `/api/tasks/:taskId/subtasks` | Subtasks |
| PATCH | `/api/subtasks/:id` | Subtasks |
| DELETE | `/api/subtasks/:id` | Subtasks |
| POST | `/api/subtasks/:id/move` | Subtasks |
| GET | `/api/subtasks/:id/full` | Subtasks |
| GET | `/api/subtasks/:id/assignees` | Subtasks |
| POST | `/api/subtasks/:id/assignees` | Subtasks |
| DELETE | `/api/subtasks/:subtaskId/assignees/:userId` | Subtasks |
| GET | `/api/subtasks/:id/tags` | Subtasks |
| POST | `/api/subtasks/:id/tags` | Subtasks |
| DELETE | `/api/subtasks/:subtaskId/tags/:tagId` | Subtasks |
| GET | `/api/subtasks/:subtaskId/comments` | Subtasks |
| POST | `/api/subtasks/:subtaskId/comments` | Subtasks |
| GET | `/api/workspaces/:workspaceId/tags` | Tags |
| POST | `/api/workspaces/:workspaceId/tags` | Tags |
| PATCH | `/api/tags/:id` | Tags |
| DELETE | `/api/tags/:id` | Tags |
| POST | `/api/tasks/:taskId/tags` | Tags |
| DELETE | `/api/tasks/:taskId/tags/:tagId` | Tags |
| GET | `/api/tasks/:taskId/comments` | Comments |
| POST | `/api/tasks/:taskId/comments` | Comments |
| PATCH | `/api/comments/:id` | Comments |
| DELETE | `/api/comments/:id` | Comments |
| POST | `/api/comments/:id/resolve` | Comments |
| POST | `/api/comments/:id/unresolve` | Comments |
| POST | `/api/activity-log` | Activity |
| GET | `/api/activity-log/:entityType/:entityId` | Activity |
| GET | `/api/attachments/config` | Attachments |
| GET | `/api/attachments/presign` | Attachments |
| POST | `/api/attachments` | Attachments |
| POST | `/api/attachments/complete` | Attachments |
| GET | `/api/attachments/task/:taskId` | Attachments |
| DELETE | `/api/attachments/:attachmentId` | Attachments |
| GET | `/api/clients` | Clients |
| GET | `/api/clients/:id` | Clients |
| POST | `/api/clients` | Clients |
| PATCH | `/api/clients/:id` | Clients |
| DELETE | `/api/clients/:id` | Clients |
| GET | `/api/clients/:clientId/contacts` | Clients |
| POST | `/api/clients/:clientId/contacts` | Clients |
| PATCH | `/api/clients/:clientId/contacts/:contactId` | Clients |
| DELETE | `/api/clients/:clientId/contacts/:contactId` | Clients |
| GET | `/api/clients/:clientId/invites` | Client Portal |
| POST | `/api/clients/:clientId/invites` | Client Portal |
| DELETE | `/api/clients/:clientId/invites/:inviteId` | Client Portal |
| GET | `/api/clients/:clientId/projects` | Clients |
| POST | `/api/clients/:clientId/projects` | Clients |
| GET | `/api/v1/clients/:clientId/divisions` | Divisions |
| POST | `/api/v1/clients/:clientId/divisions` | Divisions |
| PATCH | `/api/v1/divisions/:divisionId` | Divisions |
| GET | `/api/v1/divisions/:divisionId/members` | Divisions |
| POST | `/api/v1/divisions/:divisionId/members` | Divisions |
| DELETE | `/api/v1/divisions/:divisionId/members/:userId` | Divisions |
| GET | `/api/clients/:clientId/notes` | Client Notes |
| POST | `/api/clients/:clientId/notes` | Client Notes |
| PUT | `/api/clients/:clientId/notes/:noteId` | Client Notes |
| GET | `/api/clients/:clientId/notes/:noteId/versions` | Client Notes |
| DELETE | `/api/clients/:clientId/notes/:noteId` | Client Notes |
| GET | `/api/clients/:clientId/note-categories` | Client Notes |
| POST | `/api/clients/:clientId/note-categories` | Client Notes |
| GET | `/api/timer/current` | Timer |
| POST | `/api/timer/start` | Timer |
| POST | `/api/timer/pause` | Timer |
| POST | `/api/timer/resume` | Timer |
| PATCH | `/api/timer/current` | Timer |
| POST | `/api/timer/stop` | Timer |
| DELETE | `/api/timer/current` | Timer |
| GET | `/api/time-entries` | Time Entries |
| GET | `/api/time-entries/my` | Time Entries |
| GET | `/api/time-entries/my/stats` | Time Entries |
| GET | `/api/time-entries/:id` | Time Entries |
| POST | `/api/time-entries` | Time Entries |
| PATCH | `/api/time-entries/:id` | Time Entries |
| DELETE | `/api/time-entries/:id` | Time Entries |
| GET | `/api/calendar/events` | Calendar |
| GET | `/api/my-calendar/events` | Calendar |
| GET | `/api/time-entries/report/summary` | Reports |
| GET | `/api/users` | Users |
| GET | `/api/tenant/users` | Users |
| POST | `/api/users` | Users |
| PATCH | `/api/users/me` | Users |
| POST | `/api/users/me/change-password` | Users |
| GET | `/api/users/me/ui-preferences` | Users |
| PATCH | `/api/users/me/ui-preferences` | Users |
| PATCH | `/api/users/:id` | Users |
| POST | `/api/users/:id/reset-password` | Users |
| POST | `/api/users/:id/activate` | Users |
| POST | `/api/users/:id/deactivate` | Users |
| GET | `/api/invitations` | Users |
| POST | `/api/invitations` | Users |
| DELETE | `/api/invitations/:id` | Users |
| POST | `/api/invitations/for-user` | Users |
| GET | `/api/settings/mailgun` | Settings |
| PUT | `/api/settings/mailgun` | Settings |
| POST | `/api/settings/mailgun/test` | Settings |
| GET | `/api/time-entries/export/csv` | Reports |
| POST | `/api/v1/me/avatar` | Me |
| DELETE | `/api/v1/me/avatar` | Me |
| GET | `/api/v1/me/agreement/status` | Me |
| POST | `/api/v1/me/agreement/accept` | Me |

### 1.2 Extracted Route Files (`server/routes/*.ts`)

| File | Line Count | Mount Path | Domain |
|------|-----------|------------|--------|
| `superAdmin.ts` | 9,587 | `/v1/super` | Super Admin (tenants, users, invitations, settings, health, bulk ops) |
| `chat.ts` | 1,294 | `/v1/chat` | Chat (channels, DMs, messages, threads, reads) |
| `superDebug.ts` | 1,135 | `/v1/super/debug` | Debug tools (quarantine, orphans, schema) |
| `tenantOnboarding.ts` | 1,050 | `/v1/tenant` | Tenant onboarding, branding, settings |
| `tenancyHealth.ts` | 1,059 | `/v1` | Tenancy health checks, backfill, constraints |
| `systemStatus.ts` | 745 | `/v1/super/status` | System status, error logs, schema diagnostics |
| `systemIntegrations.ts` | 513 | `/v1/system` | Tenant integrations management |
| `projectsDashboard.ts` | 559 | `/v1` | Projects dashboard analytics |
| `chatRetention.ts` | 379 | `/v1` | Chat retention policies, export |
| `workloadReports.ts` | 372 | `/v1` | Workload reports by assignee |
| `tenantBilling.ts` | 303 | `/v1/tenant` | Billing, usage stats |
| `uploads.ts` | 421 | `/v1/uploads` | File uploads, presigned URLs |
| `timeTracking.ts` | 289 | `/timer` | Timer-related routes |
| `superChat.ts` | 280 | `/v1/super/chat` | Super admin chat monitoring |
| `ai.ts` | 140 | `/v1/ai` | AI suggestions |
| `presence.ts` | 47 | `/v1/presence` | User presence |
| `chatDebug.ts` | 106 | `/v1/super/debug/chat` | Chat debug |
| `emailOutbox.ts` | 244 | `/v1` | Email outbox management |
| `webhooks.ts` | 84 | N/A | Webhook handling |

### 1.3 Feature Routes (`server/features/`)

Mounted via `server/routes/index.ts` as `featuresRoutes`:

| File | Domain |
|------|--------|
| `clients/router.ts` | Client CRUD (feature-level) |
| `clients/notes.router.ts` | Client notes |
| `clients/documents.router.ts` | Client documents (R2 uploads) |
| `clients/divisions.router.ts` | Divisions |
| `clients/portal.router.ts` | Client portal |
| `client-portal/portal.router.ts` | Client portal (public) |
| `notifications/notifications.router.ts` | Notification CRUD & preferences |
| `templates/router.ts` | Project templates |

### 1.4 Modular Route Files (`server/routes/modules/`)

These files exist but are **mostly NOT wired in**. Only `searchRouter` is mounted in `server/routes/index.ts`. The rest appear to be extracted stubs or planned extractions not yet active.

**Active:** `search/search.router.ts`  
**Inactive (not mounted):** All others (workspaces, projects, teams, sections, tasks, subtasks, tags, comments, activity, attachments, clients, divisions, timer, time-entries, users, settings, my-tasks, me, super-admin/*)

> **Note:** `docs/KNOWN_ISSUES.md` (Jan 2026) reported routes.ts at ~3,700 lines and superAdmin.ts at ~3,500 lines. Both files have grown significantly since then. Current verified line counts (Feb 2026): routes.ts = 6,131 lines, superAdmin.ts = 9,587 lines.

---

## 2. Duplicated Middleware/Helper Locations

### 2.1 `requireAuth` — 5 definitions

| Location | Type |
|----------|------|
| `server/auth.ts:366` | Canonical export (RequestHandler) |
| `server/routes/ai.ts:14` | Local function |
| `server/routes/chatRetention.ts:20` | Local const |
| `server/routes/tenantOnboarding.ts:39` | Local function (uses `any` types) |
| `server/routes/uploads.ts:61` | Local function |

### 2.2 `getEffectiveTenantId` — 3 definitions

| Location | Type |
|----------|------|
| `server/middleware/tenantContext.ts:115` | Canonical export |
| `server/middleware/errorLogging.ts:85` | Local function (copy) |
| `server/routes/tenantOnboarding.ts:59` | Local function (copy with `any` types) |

### 2.3 Re-exported via `server/routes/helpers.ts:83`

The `helpers.ts` file re-exports `getEffectiveTenantId` from `tenantContext.ts`, adding an indirection layer.

---

## 3. Storage Responsibilities (`server/storage.ts` — 4,399 lines)

The `DatabaseStorage` class in `storage.ts` implements the `IStorage` interface with methods for all entities. Partial modularization exists:

### Already Extracted to `server/storage/`
| File | Domain | Lines |
|------|--------|-------|
| `clients.repo.ts` | Client CRUD, contacts | 508 |
| `projects.repo.ts` | Project CRUD, members | 360 |
| `tasks.repo.ts` | Task CRUD, assignees, subtasks | 875 |
| `timeTracking.repo.ts` | Time entries CRUD | 317 |
| `getStorageProvider.ts` | Storage provider factory | 305 |

### Still in `storage.ts`
- Workspace CRUD
- Team CRUD, team members
- Section CRUD
- Tag CRUD
- Comment CRUD
- Activity log CRUD
- Attachment CRUD
- User CRUD, user search
- Invitation CRUD
- Notification CRUD
- Tenant CRUD, tenant settings
- Chat CRUD (channels, messages, reads)
- Client portal invites
- Project templates
- SaaS agreements
- User UI preferences
- Batch query helpers

---

## 4. Error Response Variations

The codebase uses **inconsistent error response shapes**:

| Pattern | Count (est.) | Example |
|---------|-------------|---------|
| `{ error: "string" }` | ~180 | `res.status(404).json({ error: "Not found" })` |
| `{ error: zodErrors }` | ~20 | `res.status(400).json({ error: error.errors })` |
| `{ message: "string" }` | ~3 | `res.status(500).json({ message: "..." })` |
| `{ ok: false, error: { code, message } }` | ~5 | Rate limit responses |
| AppError class | ~10 | Via `server/lib/errors.ts` |

**Target shape (from plan):**
```json
{ "error": "string", "code": "string?", "details": "object?" }
```

---

## 5. POST/PATCH Routes Missing Validation

`server/routes.ts` has ~74 POST/PATCH/PUT routes. Validation usage (via `validateBody`, `.parse`, `.safeParse`, `z.`) occurs ~93 times, but many routes directly use `req.body` without schema validation.

**Routes needing validation audit:**
- Workspace creation/update
- Team creation/update
- Section creation/update
- Tag creation
- Comment creation/update
- Activity log creation
- Some task operations (move, reorder)
- Client contact creation/update
- Division operations
- Timer operations

---

## 6. Current Rate Limiting Scope

Rate limiting is implemented in `server/middleware/rateLimit.ts` with in-memory storage.

### Currently Protected (Observed)

| Endpoint | IP Limit | Email Limit |
|----------|----------|-------------|
| `POST /api/auth/login` | 10/min | 5/min |
| `POST /api/v1/auth/bootstrap-register` | 5/min | N/A |
| `POST /api/v1/auth/platform-invite/accept` | 10/min | N/A |
| `POST /api/v1/auth/forgot-password` | 5/min | 3/min |

### Not Currently Protected (Recommended for Phase 1 Expansion)

- Invite creation (`POST /api/invitations`)
- User creation (`POST /api/users`)
- Admin mutations (PATCH/DELETE on admin-only routes)
- Chat send (`POST /api/v1/chat/*/messages`)
- File uploads
- Bulk operations

### Storage Limitation

In-memory `Map` — not suitable for multi-instance deployments. Redis store recommended as optional enhancement.

---

## 7. FK Cleanup Issues

**Affected tests (per AUDIT_FINDINGS.md):**
- `purge-guards.test.ts` (5 tests)
- `bootstrap-registration.test.ts` (4 tests)
- `tenant-pre-provisioning.test.ts` (3 tests)

**Root cause (documented):** Test cleanup `DELETE FROM users` fails due to FK constraint from `project_members` table.

**Potentially affected FK tables (need verification against schema):**
- `project_members` (FK → users) — confirmed blocker
- `user_ui_preferences` (FK → users) — confirmed blocker (fixed in production code but not test cleanup)
- `task_assignees` (FK → users) — likely blocker
- `time_entries` (FK → users) — likely blocker
- `comments` (FK → users) — likely blocker
- `activity_log` (FK → users) — likely blocker
- `notifications` (FK → users) — likely blocker
- `chat_reads` (FK → users) — likely blocker

**Recommendation:** Create a shared test cleanup helper that deletes dependent rows in proper FK order before deleting users.

---

## 8. Port-Binding Test Issues

**Affected tests (5+):**
- `super-only-integrations.test.ts`
- `platform-admins.test.ts`
- `bootstrap-registration.test.ts`
- `global-integrations-persist.test.ts`
- `seed-endpoints.test.ts`

**Root cause:** Tests import modules that chain-import `server/index.ts`, which calls `httpServer.listen(5000)`, conflicting with the running dev server.

**Existing mitigation:** `server/test-app.ts` provides `createTestApp()` factory that creates an Express app without binding to a port. Some tests use it; others don't.

**Fix:** Update all test files to use `createTestApp()` instead of importing from `server/index.ts`.

---

## 9. Tenancy Inconsistencies

### 9.1 Mixed Scoping Patterns

Some routes use the canonical tenant middleware pipeline:
```
tenantContextMiddleware → getEffectiveTenantId(req) → tenant-scoped storage
```

Others bypass it:
- Direct storage calls without tenant scoping
- Legacy routes that pre-date multi-tenancy
- Some routes use `req.user?.tenantId` directly instead of `getEffectiveTenantId`

### 9.2 Enforcement Modes

`server/middleware/tenancyEnforcement.ts` supports three modes:
- **off** — No enforcement (legacy)
- **soft** — Log warnings for cross-tenant access
- **strict** — Block cross-tenant access

Not all routes handle all modes consistently.

### 9.3 Specific Issues

1. `tenantOnboarding.ts` defines its own `getEffectiveTenantId` with `any` types
2. `errorLogging.ts` has a duplicate `getEffectiveTenantId`
3. Some storage methods accept optional `tenantId` but don't enforce it
4. `assertInsertHasTenantId` guard exists but isn't applied universally

---

## 10. Test Inventory

### Test Files (50 total in `server/tests/`)

| Test File | Status (per AUDIT_FINDINGS.md Jan 2026) |
|-----------|--------|
| debug-endpoints.test.ts | Pass (26 tests) |
| smoke.test.ts | Pass (30 tests) |
| tenancy-enforcement.test.ts | Pass (12 tests) |
| backfill-inference.test.ts | Pass (15 tests) |
| workload-reports.test.ts | Pass (18 tests) |
| encryption.test.ts | Pass (6 tests) |
| validation.test.ts | Pass (4 tests) |
| errors.test.ts | Pass (5 tests) |
| auth.test.ts | Pass (3 tests) |
| tenant-integrations.test.ts | Pass (10 tests) |
| seed-endpoints.test.ts | Pass (9 tests) |
| purge-guards.test.ts | FK cleanup failure (5 tests) |
| bootstrap-registration.test.ts | FK cleanup failure (4 tests) |
| tenant-pre-provisioning.test.ts | FK cleanup failure (3 tests) |

### Additional Test Files (status not documented in audit)

- `add_division_member_tenant_only.test.ts`
- `agreement-enforcement.test.ts`
- `auth-diagnostics.test.ts`
- `bootstrap-endpoints.test.ts`
- `chatDebugRoutes.test.ts`, `chatDebug.test.ts`
- `chat-tenancy.test.ts`
- `client-crud.test.ts`
- `create_division_requires_client_and_tenant.test.ts`
- `db-introspect.test.ts`
- `division_member_scoping_helper.test.ts`
- `divisions_schema_migration_smoke.test.ts`
- `errorHandling.test.ts`, `error-logging.test.ts`
- `global-integrations-persist.test.ts`
- `legacy-error-shapes.test.ts`
- `list_divisions_scoped_to_tenant.test.ts`
- `migrations-smoke.test.ts`
- `orphan-health.test.ts`
- `platform-admins.test.ts`
- `project-membership.test.ts`
- `project_rejects_division_not_in_client.test.ts`
- `project_requires_division_when_client_has_divisions.test.ts`
- `provisioning-visibility.test.ts`
- `system-status.test.ts`
- `task-creation-visibility.test.ts`, `task-crud.test.ts`
- `tenancy_permissions_audit.test.ts`
- `tenant-billing.test.ts`, `tenant-core-flows-smoke.test.ts`
- `tenant-create.test.ts`, `tenant-crud-cross-tenant.test.ts`, `tenant-crud-smoke.test.ts`
- `tenant-health-repair.test.ts`, `tenant-task-create.test.ts`
- `time-entry-edit.test.ts`
- `time_entry_selection_supports_division_filter.test.ts`
- `time_tracking_division_cascade.test.ts`
- `uploads-presign.test.ts`

### Coverage Gaps (per KNOWN_ISSUES.md)

Tests exist for client-crud, task-crud, and time-entry-edit but the audit doc notes missing coverage for **authenticated CRUD flows** (end-to-end with auth context). The above test files may have been added post-audit but their pass/fail status needs verification.

---

## 11. Existing Infrastructure

### Already in Place
- `server/types.d.ts` — Partial Express Request augmentation (tenant, requestId, clientAccess)
- `server/test-app.ts` — `createTestApp()` factory (not universally used)
- `server/middleware/tenantContext.ts` — Canonical tenant middleware
- `server/middleware/rateLimit.ts` — Auth rate limiting
- `server/lib/errors.ts` — AppError class, validation helpers
- `server/middleware/errorHandler.ts` — Central error handler
- `server/middleware/validate.ts` — Zod validation middleware
- `server/routes/modules/` — Partial route modularization (mostly unmounted)
- `server/storage/` — Partial storage modularization (4 repo files)

### Modularization Progress
Route extraction has been started in `server/routes/modules/` with domain routers for workspaces, projects, teams, sections, tasks, subtasks, tags, comments, activity, attachments, clients, divisions, timer, time-entries, users, settings, my-tasks, me, and super-admin subdomains. However, only `searchRouter` is actually mounted. The main `routes.ts` god file still handles all of these domains.

---

## 12. File Size Summary

| File | Lines | Priority |
|------|-------|----------|
| `server/routes/superAdmin.ts` | 9,587 | High — needs splitting |
| `server/routes.ts` | 6,131 | High — needs splitting |
| `server/storage.ts` | 4,399 | Medium — partially modularized |
| `server/auth.ts` | ~1,700 | Low — complex but cohesive |
| `server/routes/chat.ts` | ~1,300 | Low — domain-specific |
| `server/index.ts` | ~500 | Low — server entry point |

---

*Baseline inventory complete. Ready for Phase 1.*
