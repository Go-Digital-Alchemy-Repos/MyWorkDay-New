# Tasks API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Tasks |
| **Route File** | `server/routes/tasks.ts` |
| **Base Path(s)** | `/api/v1/tasks`, `/api/v1/projects/:projectId/tasks` |
| **Related Models** | `tasks`, `subtasks` in `shared/schema.ts` |

---

## Authentication & Authorization

| Requirement | Details |
|-------------|---------|
| **Auth Required** | Yes |
| **Auth Method** | Session-based (Passport.js) |
| **Required Roles** | `member`, `manager`, `admin` |
| **Tenant Scoped** | Yes |
| **Client Portal Access** | Yes (viewer/collaborator restrictions) |

---

## Tenant Scoping Rules

- tenantId derived from authenticated user's session
- All queries filtered by `tenantId`
- Cross-tenant access prohibited
- Client portal users have restricted access based on client assignment

---

## Endpoints

### GET /api/v1/tasks

**Description:** List tasks with optional filtering.

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `projectId` | string | No | - | Filter by project |
| `status` | string | No | - | Filter by status |
| `assigneeId` | string | No | - | Filter by assignee |
| `priority` | string | No | - | Filter by priority |

---

### POST /api/v1/tasks

**Description:** Create a new task.

**Request Body Schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Task title |
| `description` | string | No | Task description (TipTap JSON) |
| `projectId` | string | Yes | Parent project ID |
| `status` | string | No | Task status |
| `priority` | string | No | Task priority |
| `dueDate` | string | No | Due date (ISO8601) |
| `assigneeIds` | string[] | No | Assigned user IDs |

**Side Effects:**
- Creates row in `tasks` table
- Emits Socket.IO event: `task:created`
- Logs activity in `activity_logs` table
- May send notifications to assignees

---

### GET /api/v1/tasks/:id

**Description:** Get a single task with full details.

---

### PATCH /api/v1/tasks/:id

**Description:** Update a task.

**Side Effects:**
- Updates row in `tasks` table
- Emits Socket.IO event: `task:updated`
- Logs activity in `activity_logs` table
- May send notifications on status changes

---

### DELETE /api/v1/tasks/:id

**Description:** Delete a task.

**Side Effects:**
- Deletes row from `tasks` table
- Cascades to subtasks, comments, attachments
- Emits Socket.IO event: `task:deleted`
- Logs activity

---

## Side Effects Summary

| Operation | DB Writes | Socket Events | Emails | Webhooks |
|-----------|-----------|---------------|--------|----------|
| Create | `tasks` | `task:created` | Maybe | No |
| Update | `tasks` | `task:updated` | Maybe | No |
| Delete | `tasks`, related | `task:deleted` | No | No |

---

## Notes / Gotchas

- Task descriptions use TipTap JSON format, not HTML
- Subtasks have their own endpoints under `/api/v1/tasks/:taskId/subtasks`
- Time tracking entries are linked via `taskId`

---

*Last Updated: 2026-02-04*
