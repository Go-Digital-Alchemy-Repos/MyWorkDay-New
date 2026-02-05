# Projects API

**Status:** Draft

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | Projects |
| **Route File** | `server/routes/projects.ts` |
| **Base Path(s)** | `/api/v1/projects` |
| **Related Models** | `projects` in `shared/schema.ts` |

---

## Authentication & Authorization

| Requirement | Details |
|-------------|---------|
| **Auth Required** | Yes |
| **Auth Method** | Session-based (Passport.js) |
| **Required Roles** | `member`, `manager`, `admin` |
| **Tenant Scoped** | Yes |
| **Client Portal Access** | Yes (restricted to assigned projects) |

---

## Tenant Scoping Rules

- tenantId derived from authenticated user's session
- All project queries filtered by `tenantId`
- Team membership may restrict visible projects
- Client portal users see only their client's projects

---

## Endpoints

### GET /api/v1/projects

**Description:** List all accessible projects.

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `clientId` | string | No | - | Filter by client |
| `teamId` | string | No | - | Filter by team |
| `status` | string | No | - | Filter by status |

---

### POST /api/v1/projects

**Description:** Create a new project.

**Request Body Schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Project name |
| `description` | string | No | Project description |
| `clientId` | string | No | Associated client |
| `teamId` | string | No | Owning team |
| `status` | string | No | Project status |
| `startDate` | string | No | Start date |
| `endDate` | string | No | End date |
| `budget` | number | No | Budget in minutes |

**Side Effects:**
- Creates row in `projects` table
- Emits Socket.IO event: `project:created`
- Logs activity

---

### GET /api/v1/projects/:id

**Description:** Get project details.

---

### PATCH /api/v1/projects/:id

**Description:** Update project.

**Side Effects:**
- Updates row in `projects` table
- Emits Socket.IO event: `project:updated`
- Logs activity

---

### DELETE /api/v1/projects/:id

**Description:** Delete project.

**Side Effects:**
- Deletes/archives project
- May cascade to tasks
- Emits Socket.IO event: `project:deleted`

---

## Side Effects Summary

| Operation | DB Writes | Socket Events | Emails | Webhooks |
|-----------|-----------|---------------|--------|----------|
| Create | `projects` | `project:created` | No | No |
| Update | `projects` | `project:updated` | No | No |
| Delete | `projects` | `project:deleted` | No | No |

---

## Notes / Gotchas

- Projects can have budget tracking enabled
- Division-based access control may apply
- Project activity feed aggregates from multiple sources

---

*Last Updated: 2026-02-04*
