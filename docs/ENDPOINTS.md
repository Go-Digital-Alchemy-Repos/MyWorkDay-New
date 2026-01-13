# MyWorkDay - API Endpoints Reference

## Overview
This document provides a comprehensive inventory of all API endpoints in the application.

### Authentication Middleware Legend
- **Public**: No authentication required
- **Auth**: Requires authenticated user (`requireAuth`)
- **Admin**: Requires admin role (`requireAdmin`)
- **Super**: Requires super_user role (`requireSuperUser`)

### Tenant Scoping
- **Scoped**: Data filtered by user's tenant
- **Global**: Super user can access all tenants
- **None**: Not tenant-scoped

---

## Authentication (`server/auth.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| POST | `/api/auth/login` | Public | None | User login |
| POST | `/api/auth/logout` | Auth | None | User logout |
| GET | `/api/auth/me` | Auth | None | Get current user and session |

---

## Super Admin (`server/routes/superAdmin.ts`)

### Bootstrap
| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| POST | `/api/v1/super/bootstrap` | Token | None | One-time super admin creation |

### Tenant Management
| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/v1/super/tenants` | Super | Global | List all tenants |
| GET | `/api/v1/super/tenants/:id` | Super | Global | Get tenant by ID |
| POST | `/api/v1/super/tenants` | Super | Global | Create new tenant |
| PATCH | `/api/v1/super/tenants/:id` | Super | Global | Update tenant |
| POST | `/api/v1/super/tenants/:tenantId/activate` | Super | Global | Activate tenant |
| POST | `/api/v1/super/tenants/:tenantId/suspend` | Super | Global | Suspend tenant |
| POST | `/api/v1/super/tenants/:tenantId/deactivate` | Super | Global | Deactivate tenant |
| POST | `/api/v1/super/tenants/:tenantId/invite-admin` | Super | Global | Invite tenant admin |
| POST | `/api/v1/super/tenants/:tenantId/import-users` | Super | Global | Bulk CSV user import |
| GET | `/api/v1/super/tenants/:tenantId/onboarding-status` | Super | Global | Get onboarding status |
| GET | `/api/v1/super/tenants-detail` | Super | Global | List tenants with details |
| GET | `/api/v1/super/tenants/:tenantId/settings` | Super | Global | Get tenant settings |
| PATCH | `/api/v1/super/tenants/:tenantId/settings` | Super | Global | Update tenant settings |
| GET | `/api/v1/super/tenants/:tenantId/users` | Super | Global | List tenant users |
| GET | `/api/v1/super/tenants/:tenantId/invitations` | Super | Global | List tenant invitations |
| DELETE | `/api/v1/super/tenants/:tenantId/invitations/:invitationId` | Super | Global | Delete invitation |
| GET | `/api/v1/super/tenants/:tenantId/integration/:provider` | Super | Global | Get integration config |
| PUT | `/api/v1/super/tenants/:tenantId/integration/:provider` | Super | Global | Update integration |
| POST | `/api/v1/super/tenants/:tenantId/integration/:provider/test` | Super | Global | Test integration |
| POST | `/api/v1/super/tenants/:tenantId/brand-assets` | Super | Global | Upload brand asset |

---

## Tenant Onboarding (`server/routes/tenantOnboarding.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/v1/tenant/onboarding/state` | Auth | Scoped | Get onboarding state |
| PATCH | `/api/v1/tenant/onboarding/step/:step` | Auth | Scoped | Update onboarding step |
| POST | `/api/v1/tenant/onboarding/complete` | Auth | Scoped | Complete onboarding |

---

## Tenancy Health (`server/routes/tenancyHealth.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/super/tenancy-health/dashboard` | Super | Global | Health dashboard data |
| GET | `/api/super/tenancy-health/warnings` | Super | Global | Get tenancy warnings |
| POST | `/api/super/tenancy-health/backfill` | Super | Global | Trigger data backfill |

---

## Health Check (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/health` | Public | None | Server health check |

---

## Workspaces (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/workspaces` | Auth | Scoped | List user's workspaces |
| GET | `/api/workspaces/current` | Auth | Scoped | Get current workspace |
| GET | `/api/workspaces/:id` | Auth | Scoped | Get workspace by ID |
| POST | `/api/workspaces` | Auth | Scoped | Create workspace |
| PATCH | `/api/workspaces/:id` | Auth | Scoped | Update workspace |
| GET | `/api/workspaces/:workspaceId/members` | Auth | Scoped | Get workspace members |
| POST | `/api/workspaces/:workspaceId/members` | Auth | Scoped | Add workspace member |
| GET | `/api/workspace-members` | Auth | Scoped | Get all accessible members |

---

## Teams (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/teams` | Auth | Scoped | List teams in workspace |
| GET | `/api/teams/:id` | Auth | Scoped | Get team by ID |
| POST | `/api/teams` | Auth | Scoped | Create team |
| PATCH | `/api/teams/:id` | Auth | Scoped | Update team |
| DELETE | `/api/teams/:id` | Auth | Scoped | Delete team |
| GET | `/api/teams/:teamId/members` | Auth | Scoped | Get team members |
| POST | `/api/teams/:teamId/members` | Auth | Scoped | Add team member |
| DELETE | `/api/teams/:teamId/members/:userId` | Auth | Scoped | Remove team member |

---

## Projects (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/projects` | Auth | Scoped | List projects |
| GET | `/api/projects/unassigned` | Auth | Scoped | List unassigned projects |
| GET | `/api/projects/:id` | Auth | Scoped | Get project by ID |
| POST | `/api/projects` | Auth | Scoped | Create project |
| PATCH | `/api/projects/:id` | Auth | Scoped | Update project |
| PATCH | `/api/projects/:projectId/client` | Auth | Scoped | Link/unlink client |
| GET | `/api/projects/:projectId/sections` | Auth | Scoped | Get project sections |
| PATCH | `/api/projects/:projectId/tasks/reorder` | Auth | Scoped | Reorder tasks |
| GET | `/api/projects/:projectId/tasks` | Auth | Scoped | Get project tasks |
| GET | `/api/projects/:projectId/calendar-events` | Auth | Scoped | Get calendar events |

---

## Sections (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| POST | `/api/sections` | Auth | Scoped | Create section |
| PATCH | `/api/sections/:id` | Auth | Scoped | Update section |
| DELETE | `/api/sections/:id` | Auth | Scoped | Delete section |

---

## Tasks (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/tasks/my` | Auth | Scoped | Get user's assigned tasks |
| POST | `/api/tasks/personal` | Auth | Scoped | Create personal task |
| GET | `/api/tasks/:id` | Auth | Scoped | Get task by ID |
| GET | `/api/tasks/:id/childtasks` | Auth | Scoped | Get child tasks |
| POST | `/api/tasks` | Auth | Scoped | Create task |
| POST | `/api/tasks/:taskId/childtasks` | Auth | Scoped | Create child task |
| PATCH | `/api/tasks/:id` | Auth | Scoped | Update task |
| DELETE | `/api/tasks/:id` | Auth | Scoped | Delete task |
| POST | `/api/tasks/:id/move` | Auth | Scoped | Move task to section |
| POST | `/api/tasks/:taskId/assignees` | Auth | Scoped | Add task assignee |
| DELETE | `/api/tasks/:taskId/assignees/:userId` | Auth | Scoped | Remove task assignee |

---

## My Tasks Sections (v1 API) (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/v1/my-tasks/sections` | Auth | Scoped | Get personal sections |
| POST | `/api/v1/my-tasks/sections` | Auth | Scoped | Create personal section |
| PATCH | `/api/v1/my-tasks/sections/:id` | Auth | Scoped | Update personal section |
| DELETE | `/api/v1/my-tasks/sections/:id` | Auth | Scoped | Delete personal section |
| POST | `/api/v1/my-tasks/tasks/:taskId/move` | Auth | Scoped | Move task to section |

---

## Subtasks (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/tasks/:taskId/subtasks` | Auth | Scoped | Get subtasks for task |
| POST | `/api/tasks/:taskId/subtasks` | Auth | Scoped | Create subtask |
| PATCH | `/api/subtasks/:id` | Auth | Scoped | Update subtask |
| DELETE | `/api/subtasks/:id` | Auth | Scoped | Delete subtask |
| POST | `/api/subtasks/:id/move` | Auth | Scoped | Move subtask |

---

## Tags (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/workspaces/:workspaceId/tags` | Auth | Scoped | Get workspace tags |
| POST | `/api/workspaces/:workspaceId/tags` | Auth | Scoped | Create tag |
| PATCH | `/api/tags/:id` | Auth | Scoped | Update tag |
| DELETE | `/api/tags/:id` | Auth | Scoped | Delete tag |
| POST | `/api/tasks/:taskId/tags` | Auth | Scoped | Add tag to task |
| DELETE | `/api/tasks/:taskId/tags/:tagId` | Auth | Scoped | Remove tag from task |

---

## Comments (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/tasks/:taskId/comments` | Auth | Scoped | Get task comments |
| POST | `/api/tasks/:taskId/comments` | Auth | Scoped | Add comment |
| PATCH | `/api/comments/:id` | Auth | Scoped | Update comment |
| DELETE | `/api/comments/:id` | Auth | Scoped | Delete comment |

---

## Activity Log (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| POST | `/api/activity-log` | Auth | Scoped | Create activity log entry |
| GET | `/api/activity-log/:entityType/:entityId` | Auth | Scoped | Get activity logs |

---

## Attachments (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/attachments/config` | Auth | Scoped | Get upload configuration |
| GET | `/api/projects/:projectId/attachments/:id/url` | Auth | Scoped | Get signed download URL |
| POST | `/api/projects/:projectId/attachments` | Auth | Scoped | Upload attachment |
| POST | `/api/projects/:projectId/attachments/presigned` | Auth | Scoped | Get presigned upload URL |
| GET | `/api/projects/:projectId/attachments` | Auth | Scoped | List project attachments |
| DELETE | `/api/projects/:projectId/attachments/:id` | Auth | Scoped | Delete attachment |

---

## Clients (CRM) (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/clients` | Auth | Scoped | List clients |
| GET | `/api/clients/:id` | Auth | Scoped | Get client by ID |
| POST | `/api/clients` | Auth | Scoped | Create client |
| PATCH | `/api/clients/:id` | Auth | Scoped | Update client |
| DELETE | `/api/clients/:id` | Auth | Scoped | Delete client |
| GET | `/api/clients/:clientId/contacts` | Auth | Scoped | Get client contacts |
| POST | `/api/clients/:clientId/contacts` | Auth | Scoped | Add contact |
| PATCH | `/api/clients/:clientId/contacts/:contactId` | Auth | Scoped | Update contact |
| DELETE | `/api/clients/:clientId/contacts/:contactId` | Auth | Scoped | Delete contact |
| GET | `/api/clients/:clientId/invites` | Auth | Scoped | Get client invites |
| POST | `/api/clients/:clientId/invites` | Auth | Scoped | Create client invite |
| DELETE | `/api/clients/:clientId/invites/:inviteId` | Auth | Scoped | Delete client invite |
| GET | `/api/clients/:clientId/projects` | Auth | Scoped | Get client projects |
| POST | `/api/clients/:clientId/projects` | Auth | Scoped | Link project to client |

---

## Time Tracking - Timer (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/timer/current` | Auth | Scoped | Get running timer |
| POST | `/api/timer/start` | Auth | Scoped | Start timer |
| POST | `/api/timer/pause` | Auth | Scoped | Pause timer |
| POST | `/api/timer/resume` | Auth | Scoped | Resume timer |
| PATCH | `/api/timer/current` | Auth | Scoped | Update running timer |
| POST | `/api/timer/stop` | Auth | Scoped | Stop timer and save entry |
| DELETE | `/api/timer/current` | Auth | Scoped | Discard running timer |

---

## Time Tracking - Entries (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/time-entries` | Auth | Scoped | List time entries |
| GET | `/api/time-entries/my` | Auth | Scoped | Get user's time entries |
| GET | `/api/time-entries/:id` | Auth | Scoped | Get time entry by ID |
| POST | `/api/time-entries` | Auth | Scoped | Create time entry |
| PATCH | `/api/time-entries/:id` | Auth | Scoped | Update time entry |
| DELETE | `/api/time-entries/:id` | Auth | Scoped | Delete time entry |
| GET | `/api/time-entries/report/summary` | Auth | Scoped | Get time report summary |
| GET | `/api/time-entries/export/csv` | Auth | Scoped | Export entries as CSV |

---

## User Management (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/users` | Admin | Scoped | List tenant users |
| POST | `/api/users` | Admin | Scoped | Create user |
| PATCH | `/api/users/:id` | Admin | Scoped | Update user |
| PATCH | `/api/users/me` | Auth | Scoped | Update current user |
| POST | `/api/v1/me/avatar` | Auth | Scoped | Upload user avatar |

---

## Invitations (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/invitations` | Admin | Scoped | List invitations |
| POST | `/api/invitations` | Admin | Scoped | Create invitation |
| DELETE | `/api/invitations/:id` | Admin | Scoped | Delete invitation |
| POST | `/api/invitations/for-user` | Admin | Scoped | Generate invite for user |

---

## Settings (`server/routes.ts`)

| Method | Path | Auth | Tenant | Description |
|--------|------|------|--------|-------------|
| GET | `/api/settings/mailgun` | Admin | Scoped | Get Mailgun settings |
| PUT | `/api/settings/mailgun` | Admin | Scoped | Update Mailgun settings |
| POST | `/api/settings/mailgun/test` | Admin | Scoped | Send test email |

---

## Request/Response Patterns

### Standard Success Response
```json
{
  "data": { ... },
  "message": "Optional success message"
}
```

### Standard Error Response
```json
{
  "error": "Error description",
  "details": [ ... ]  // Optional validation errors
}
```

### Common HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error

---

## Notes

### Tenant Scoping
Most endpoints automatically scope data to the authenticated user's tenant. Super users can use the `X-Tenant-Id` header to access specific tenant data.

### Pagination
List endpoints may support pagination with query parameters:
- `page` - Page number (1-indexed)
- `limit` - Items per page
- `offset` - Alternative to page

### File Uploads
File upload endpoints use `multipart/form-data`:
- `POST /api/projects/:projectId/attachments`
- `POST /api/v1/me/avatar`
- `POST /api/v1/super/tenants/:tenantId/brand-assets`

### Rate Limiting
Currently no rate limiting is implemented. Consider adding for production.
