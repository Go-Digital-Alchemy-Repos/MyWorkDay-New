# MyWorkDay - Feature Inventory

## Overview
This document provides a comprehensive inventory of all features and API route groups in the MyWorkDay application.

---

## Major Modules

### 1. Authentication
**Files:** `server/auth.ts`

| Feature | Description |
|---------|-------------|
| Login | Session-based login with Passport.js + passport-local strategy |
| Logout | Session destruction |
| Registration | New user creation with automatic Super Admin assignment for first user |
| Session Management | Express-session with PostgreSQL store (connect-pg-simple) |
| Password Hashing | Secure password storage with bcrypt-compatible hashing |

**Key Routes:**
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user session
- `POST /api/auth/register` - New user registration

---

### 2. Multi-Tenancy + Impersonation
**Files:** `server/middleware/tenantContext.ts`, `server/middleware/tenancyEnforcement.ts`

| Feature | Description |
|---------|-------------|
| Tenant Isolation | All data scoped to user's `tenantId` |
| Effective Tenant ID | Users act within their tenant; Super Admins can impersonate |
| Act-As-Tenant | Super Admins use `X-Tenant-Id` header to access tenant data |
| Tenancy Enforcement | Configurable via `TENANCY_ENFORCEMENT` env (off/soft/strict) |
| Quarantine Tenant | Special tenant for orphaned/legacy data |

**Key Guards:**
- `requireTenantContext` - Ensures tenant context for non-super routes
- `requireSuperUser` - Restricts to super_user role
- `requireTenantAdmin` - Restricts to admin role within tenant

---

### 3. Super Admin Suite
**Files:** `server/routes/superAdmin.ts`, `server/routes/superDebug.ts`

#### 3a. Tenant Management
| Feature | Description |
|---------|-------------|
| Tenant CRUD | Create, read, update tenants |
| Tenant Status | Activate, suspend, deactivate tenants |
| Invite Admin | Generate invitation links for tenant admins |
| Bulk User Import | CSV import with invite link generation |
| Tenant Health | Health metrics per tenant |
| Internal Notes | Super admin notes on tenants |
| Audit Trail | Tenant-level audit events |

#### 3b. System Settings (`/super-admin/settings`)
| Feature | Description |
|---------|-------------|
| Platform Admins | List super_user accounts |
| Agreements | Tenant compliance overview |
| Global Branding | Default app name, colors, support email |
| Integrations | Mailgun/S3 status overview |

#### 3c. Global Reports (`/super-admin/reports`)
| Feature | Description |
|---------|-------------|
| Tenants Report | Status, config gaps by tenant |
| Projects Report | Projects by tenant, overdue counts |
| Users Report | Users by role, active/pending |
| Tasks Report | By status, overdue/unassigned |
| Time Report | Weekly/monthly totals, top performers |

#### 3d. System Status (`/super-admin/status`)
| Feature | Description |
|---------|-------------|
| System Health | Database latency, S3, Mailgun, WebSocket |
| Tenant Health | Tenancy mode, missing IDs, warnings |
| Logs | External logging reference |
| Debug Tools | Quarantine manager, backfill, integrity checks |

#### 3e. Debug Tools
| Feature | Description | Env Flag |
|---------|-------------|----------|
| Quarantine Manager | View/assign/archive/delete quarantined rows | `SUPER_DEBUG_DELETE_ALLOWED` |
| TenantId Backfill | Scan/dry-run/apply backfill | `BACKFILL_TENANT_IDS_ALLOWED` |
| Integrity Checks | Cross-tenant mismatches, orphaned rows | None (read-only) |
| Cache Invalidation | Clear caches | `SUPER_DEBUG_ACTIONS_ALLOWED` |

---

### 4. Tenant Admin Settings
**Files:** `server/routes/tenantOnboarding.ts`, Settings pages

| Feature | Description |
|---------|-------------|
| Teams | Manage teams within tenant |
| Workspaces | Manage workspaces |
| Reports | Tenant-level workload reports |
| Integrations | Mailgun, S3 configuration per tenant |
| Branding | White-label settings |
| Agreements | SaaS agreement management |

---

### 5. Clients / CRM
**Files:** `server/routes.ts`

| Feature | Description |
|---------|-------------|
| Client CRUD | Create, read, update, delete clients |
| Client Contacts | Multiple contacts per client |
| Client Invites | Portal invitations (optional) |
| Client-Project Link | Associate projects with clients |

---

### 6. Projects
**Files:** `server/routes.ts`, `server/routes/projectsDashboard.ts`

| Feature | Description |
|---------|-------------|
| Project CRUD | Create, read, update projects |
| Sections | Kanban-style columns |
| Budget | budgetMinutes for forecast |
| Analytics | Summary and per-project analytics |
| Forecast | Budget tracking, due date distribution |

---

### 7. Tasks / Subtasks
**Files:** `server/routes.ts`

| Feature | Description |
|---------|-------------|
| Task CRUD | Create, read, update, delete tasks |
| Multi-Assignee | Multiple assignees via task_assignees |
| Subtasks | Child tasks with independent status |
| Comments | Task-level comments |
| Attachments | S3-based file attachments |
| Tags | Workspace-level tags |
| Move/Reorder | Drag-drop between sections |
| Calendar Events | Tasks with due dates |

---

### 8. My Tasks
**Files:** `server/routes.ts`, `client/src/pages/my-tasks.tsx`

| Feature | Description |
|---------|-------------|
| Personal Sections | User-defined sections for task organization |
| Date Grouping | Overdue, today, tomorrow, upcoming |
| Quick Add | Create personal tasks |

---

### 9. Time Tracking
**Files:** `server/routes/timeTracking.ts`, `client/src/pages/time-tracking.tsx`

| Feature | Description |
|---------|-------------|
| Time Entries | CRUD for time entries |
| Stopwatch | Active timer with pause/resume |
| Entry Editing | Full-screen drawer with cascading selection |
| Manual Entry | Create entries with Client → Project → Task → Subtask selection |
| Reports | Time by project, task, user |

#### Time Entry Selection Cascade
Both create and edit forms use a cascading selection pattern:
1. **Client** → filters available Projects to that client
2. **Project** → enables Task dropdown with open tasks from project
3. **Task** → if task has subtasks, shows Subtask dropdown

Clear cascade behavior:
- Changing Client clears Project/Task/Subtask
- Changing Project clears Task/Subtask
- Changing Task clears Subtask

Final task assignment: `finalTaskId = subtaskId || taskId`

**Components:**
- `ManualEntryDialog` - Create time entry via full-screen drawer with cascade selection
- `EditTimeEntryDrawer` - Edit existing entry with same cascade pattern

**Tests:** `server/tests/time-entry-edit.test.ts` - Pattern tests for validation, authorization, relationship scoping

---

### 10. Phase 3C Agreements
**Files:** `server/middleware/agreementGuard.ts`, `server/routes/tenantOnboarding.ts`

| Feature | Description |
|---------|-------------|
| Agreement Drafting | Create/edit draft agreements |
| Agreement Activation | Activate agreement (gates users) |
| User Acceptance | Track acceptance per user |
| Version Gating | New version requires re-acceptance |
| Guard Middleware | Blocks non-compliant users (451 status) |

**Exempt Routes:** Super admin routes, auth routes, agreement acceptance route

---

### 11. S3 Uploads
**Files:** `server/s3.ts`

| Feature | Description |
|---------|-------------|
| Brand Assets | Logo, favicon, icon uploads |
| Attachments | Task/project file attachments |
| Presigned URLs | Secure upload/download |
| Per-Tenant S3 | Tenant-configured bucket (optional) |

---

### 12. Mailgun Integration
**Files:** `server/services/tenantIntegrations.ts`

| Feature | Description |
|---------|-------------|
| Email Sending | Invitation emails, notifications |
| Per-Tenant Config | Tenant-specific Mailgun credentials |
| Secret Masking | API keys masked in responses |
| Test Endpoint | Verify Mailgun connectivity |

---

## API Route Groups

### `/api/auth/*`
- **Purpose:** Authentication (login, logout, registration, session)
- **Auth:** Public for login/register; Auth for logout/me
- **Tenant:** Not scoped

### `/api/v1/super/*`
- **Purpose:** Super admin operations
- **Auth:** `requireSuperUser` middleware
- **Tenant:** Global access, bypasses tenant context
- **Files:** `server/routes/superAdmin.ts`, `server/routes/superDebug.ts`

### `/api/v1/tenant/*`
- **Purpose:** Tenant admin settings, onboarding, integrations
- **Auth:** `requireAuth` + `requireTenantAdmin`
- **Tenant:** Scoped to authenticated user's tenant
- **File:** `server/routes/tenantOnboarding.ts`

### `/api/v1/me/*`
- **Purpose:** Current user operations (agreement status/acceptance)
- **Auth:** `requireAuth`
- **Tenant:** Scoped to authenticated user

### `/api/workspaces/*`
- **Purpose:** Workspace management
- **Auth:** `requireAuth`
- **Tenant:** Scoped

### `/api/teams/*`
- **Purpose:** Team management
- **Auth:** `requireAuth`
- **Tenant:** Scoped

### `/api/projects/*`
- **Purpose:** Project management
- **Auth:** `requireAuth`
- **Tenant:** Scoped

### `/api/tasks/*`
- **Purpose:** Task management
- **Auth:** `requireAuth`
- **Tenant:** Scoped

### `/api/clients/*`
- **Purpose:** CRM / Client management
- **Auth:** `requireAuth`
- **Tenant:** Scoped

### `/api/timer/*`
- **Purpose:** Time tracking stopwatch
- **Auth:** `requireAuth`
- **Tenant:** Scoped
- **File:** `server/routes/timeTracking.ts`

### `/api/v1/projects/*`
- **Purpose:** Projects dashboard, analytics, forecast
- **Auth:** `requireAuth`
- **Tenant:** Scoped
- **File:** `server/routes/projectsDashboard.ts`

### `/api/v1/workload/*`
- **Purpose:** Workload reports
- **Auth:** `requireAuth`
- **Tenant:** Scoped
- **File:** `server/routes/workloadReports.ts`

### `/api/health`
- **Purpose:** Health check
- **Auth:** Public
- **Tenant:** Not scoped

---

## Maintenance Scripts

| Script | Purpose | Env Flags |
|--------|---------|-----------|
| `server/scripts/backfill_tenant_ids.ts` | Backfill missing tenantId values | `BACKFILL_TENANT_IDS_ALLOWED`, `BACKFILL_DRY_RUN` |
| `server/scripts/purge_app_data.ts` | Delete all application data | `PURGE_APP_DATA_ALLOWED`, `PURGE_APP_DATA_CONFIRM`, `PURGE_PROD_ALLOWED` |

---

*Last Updated: January 2026*
