# MyWorkDay - Regression Test Checklist

## Overview
Manual regression checklist for verifying core functionality. Run through this checklist after major changes or before releases.

---

## 1. Authentication

### 1.1 Login
- [ ] Navigate to `/login`
- [ ] Enter valid credentials
- [ ] Verify redirect to appropriate page (Super Admin → `/super-admin/dashboard`, Tenant User → `/`)
- [ ] Verify session persists on page refresh

### 1.2 Registration (First User)
- [ ] Fresh database: First registered user becomes Super Admin
- [ ] Verify `role` field ignored from client (always server-determined)

### 1.3 Logout
- [ ] Click logout
- [ ] Verify redirect to login page
- [ ] Verify protected routes inaccessible

---

## 2. Super Admin Mode

### 2.1 Navigation Isolation
- [ ] Super Admin sees only super-admin menu items (Dashboard, Tenants, Settings, Status, Docs)
- [ ] "Global Reports" removed from navigation (now part of Dashboard)
- [ ] No tenant-specific items visible (Clients, Projects, Tasks, etc.)
- [ ] Tenant switcher visible in header

### 2.2 Dashboard (Default Landing)
- [ ] Super Admin lands on `/super-admin/dashboard` after login
- [ ] Dashboard shows cross-tenant analytics (Tenants, Projects, Users, Tasks, Time tabs)
- [ ] Old `/super-admin/reports` URL redirects to `/super-admin/dashboard`
- [ ] Old `/super-admin` URL redirects to `/super-admin/dashboard`

### 2.3 Tenant Management
- [ ] Navigate to `/super-admin/tenants` or click "Tenants" in sidebar
- [ ] List tenants displays correctly
- [ ] Create new tenant (transactional: tenant + workspace + settings)
- [ ] Edit tenant via drawer
- [ ] Activate/Suspend/Deactivate tenant
- [ ] Invite tenant admin (link or email)

### 2.4 Act-As-Tenant (Impersonation)
- [ ] Select tenant from picker
- [ ] Impersonation banner appears with tenant name
- [ ] Navigation switches to full tenant menu
- [ ] All data operations scoped to impersonated tenant
- [ ] Click "Exit" button on banner
- [ ] Returns to super-admin mode (dashboard)

### 2.5 System Settings (`/super-admin/settings`)
- [ ] Platform Admins tab lists super users
- [ ] Agreements tab shows tenant compliance
- [ ] Global Branding tab allows editing defaults
- [ ] Integrations tab shows Mailgun/S3 status

### 2.6 System Status (`/super-admin/status`)
- [ ] System Health tab shows database/S3/Mailgun/WebSocket status
- [ ] Tenant Health tab shows tenancy mode and missing ID counts
- [ ] Debug Tools tab visible

### 2.7 Debug Tools
- [ ] Quarantine Manager shows counts (if quarantine tenant exists)
- [ ] Backfill Scan shows missing tenantId counts
- [ ] Integrity Checks runs and shows results
- [ ] Confirm buttons require env flags (verify disabled state)

---

## 3. Phase 3C Agreement Gating

### 3.1 Agreement Setup (Tenant Admin)
- [ ] Create draft agreement in Settings → Agreements
- [ ] Activate agreement
- [ ] Verify only one active agreement at a time

### 3.2 User Acceptance
- [ ] Log in as tenant user (non-admin)
- [ ] Verify redirect to `/accept-terms` (451 response)
- [ ] Accept agreement
- [ ] Verify access to tenant routes

### 3.3 Version Bump
- [ ] Bump version on active agreement
- [ ] Users must re-accept
- [ ] Super Admin bypasses gating

---

## 4. Tenant Admin Settings

### 4.1 Teams
- [ ] List teams
- [ ] Create team
- [ ] Edit team
- [ ] Add/remove members

### 4.2 Workspaces
- [ ] List workspaces
- [ ] Create workspace
- [ ] Primary workspace indicator

### 4.3 Reports
- [ ] Workload by employee loads
- [ ] Task distribution metrics correct

### 4.4 Integrations
- [ ] Mailgun settings form loads
- [ ] Save Mailgun settings
- [ ] **CRITICAL:** Refresh page, verify settings persisted
- [ ] Test Mailgun connection
- [ ] S3 settings form loads (if applicable)

### 4.5 Branding
- [ ] Upload logo
- [ ] Set primary color
- [ ] Verify changes reflect in tenant UI

---

## 5. Clients & Projects

### 5.1 Clients
- [ ] List clients
- [ ] Create client
- [ ] Edit client via drawer
- [ ] Add client contact
- [ ] Delete client

### 5.2 Client Divisions
- [ ] Navigate to Client detail page
- [ ] Click "Divisions" tab
- [ ] Create division (Admin only)
  - [ ] Fill name, description, color
  - [ ] Save division
- [ ] Edit division
  - [ ] Click division card to open drawer
  - [ ] Update details
  - [ ] Switch to "Team" tab
  - [ ] Add/remove members via checkboxes
  - [ ] Save members
- [ ] Verify employee visibility
  - [ ] Log in as employee assigned to Division A
  - [ ] Only Division A visible in Divisions tab
  - [ ] Divisions B, C not visible
- [ ] Project-division requirement
  - [ ] Create project for client with divisions
  - [ ] Division selection required
  - [ ] Selecting invalid division rejected

### 5.3 Projects
- [ ] Create project
- [ ] Assign to client (optional)
- [ ] Set budget minutes
- [ ] View project board

### 5.4 Sections (Board View)
- [ ] Add section
- [ ] Rename section
- [ ] Delete section
- [ ] Reorder sections (drag-drop)

---

## 6. Tasks & Subtasks

### 6.1 Task Creation (Critical Path)
- [ ] Create task with valid project (tenant admin) - should succeed, task has tenantId
- [ ] Create task with valid project (employee) - should succeed
- [ ] Create task in section - section must belong to same project
- [ ] Create personal task (no project) - should succeed with isPersonal=true
- [ ] Create task with project from another tenant - should return 400 with "Invalid project"
- [ ] Create task with non-existent projectId - should return 400 with "Invalid project"
- [ ] Create task with sectionId from different project - should return 400 with "Invalid section"
- [ ] Error responses include requestId (no stack traces exposed)
- [ ] All 500 errors logged to error_logs table with requestId correlation

### 6.2 Task Operations
- [ ] Edit task via drawer
- [ ] Set due date, priority, status
- [ ] Add multiple assignees
- [ ] Move task between sections (drag-drop)
- [ ] Delete task

### 6.3 Subtasks
- [ ] Add subtask to task
- [ ] Toggle subtask complete
- [ ] Edit subtask
- [ ] Delete subtask

### 6.4 Comments
- [ ] Add comment to task
- [ ] Edit comment
- [ ] Delete comment

### 6.5 Attachments
- [ ] Upload attachment (if S3 configured)
- [ ] Download attachment
- [ ] Delete attachment

---

## 7. My Tasks

### 7.1 Date Grouping View
- [ ] Tasks grouped by: Overdue, Today, Tomorrow, Upcoming
- [ ] Correct date calculations

### 7.2 Personal Sections View
- [ ] Create personal section
- [ ] Move tasks between personal sections
- [ ] Delete personal section

### 7.3 Quick Add
- [ ] Create personal task
- [ ] Task appears in "Today" or appropriate group

---

## 8. Time Tracking

### 8.1 Time Entries
- [ ] Create time entry
- [ ] **CRITICAL:** Title field visible and editable
- [ ] Set duration, project, task
- [ ] Edit time entry
- [ ] Delete time entry

### 8.2 Stopwatch
- [ ] Start timer
- [ ] Timer shows elapsed time
- [ ] Pause timer
- [ ] Resume timer
- [ ] Stop timer (creates entry)
- [ ] Title/description editable while running

### 8.3 Reports
- [ ] Time by project loads
- [ ] Time by user loads
- [ ] Weekly/monthly totals correct

---

## 9. Calendar View

- [ ] Navigate to Calendar view
- [ ] Tasks with due dates appear as events
- [ ] Filter by project/assignee
- [ ] Drag task to reschedule (updates due date)

---

## 10. Projects Dashboard

- [ ] Navigate to Projects Dashboard
- [ ] Search works
- [ ] Status/Client/Team filters work
- [ ] Table view shows project details
- [ ] Click project opens drawer with analytics
- [ ] Budget utilization indicators display

---

## 11. Tenant Health (Super Admin)

- [ ] Navigate to System Status → Tenant Health
- [ ] View tenancy mode (off/soft/strict)
- [ ] Missing tenantId counts by table
- [ ] No blockers after successful backfill

---

## 12. Real-time Updates

- [ ] Open app in two browser tabs
- [ ] Create task in Tab A
- [ ] Task appears in Tab B without refresh
- [ ] Update task in Tab A
- [ ] Update reflects in Tab B

---

## Known Issues to Verify Fixed

### Railway-specific
- [ ] Mailgun settings persist after page refresh (was: settings not saving)
- [ ] No "login twice" issue (was: first login sometimes failed)

### Data Integrity
- [ ] Tasks have tenantId after creation (POST /api/tasks, /api/tasks/personal, /api/tasks/:id/childtasks)
- [ ] Child tasks inherit parent's tenantId
- [ ] Projects have tenantId after creation
- [ ] Users have tenantId after invitation acceptance
- [ ] Error responses include requestId for debugging

---

## Post-Test Actions

If issues found:
1. Document in `docs/KNOWN_ISSUES.md`
2. Create GitHub issue if applicable
3. Prioritize based on severity

If all pass:
1. Update this checklist's "Last Verified" date
2. Commit checklist result

---

*Last Verified: [DATE]*
*Verified By: [NAME]*
