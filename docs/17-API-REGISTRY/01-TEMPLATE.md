# API Route Template

**Status:** Draft | Review | Published | Deprecated

---

## Module Information

| Field | Value |
|-------|-------|
| **Domain** | (e.g., Tasks, Projects, Clients, Billing) |
| **Route File** | `server/routes/{filename}.ts` |
| **Base Path(s)** | `/api/v1/{resource}` |
| **Related Models** | `{tableName}` in `shared/schema.ts` |

---

## Authentication & Authorization

| Requirement | Details |
|-------------|---------|
| **Auth Required** | Yes / No |
| **Auth Method** | Session-based (Passport.js) |
| **Required Roles** | `member`, `manager`, `admin`, `super_user` |
| **Tenant Scoped** | Yes / No |
| **Client Portal Access** | Yes / No (with role restrictions) |

---

## Tenant Scoping Rules

Describe how tenant isolation is enforced:
- How tenantId is derived (from session, path param, etc.)
- Which middleware handles tenant context
- Any cross-tenant access exceptions

---

## Endpoints

### GET /api/v1/{resource}

**Description:** Brief description of what this endpoint does.

**Query Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | number | No | 50 | Max results |
| `offset` | number | No | 0 | Pagination offset |
| `filter` | string | No | - | Filter criteria |

**Request Example:**
```
GET /api/v1/{resource}?limit=10&offset=0
```

**Response Schema:**
```json
{
  "data": [...],
  "total": 100,
  "limit": 10,
  "offset": 0
}
```

**Response Example:**
```json
{
  "data": [
    { "id": "abc123", "name": "Example" }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

---

### POST /api/v1/{resource}

**Description:** Create a new resource.

**Request Body Schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Resource name |
| `description` | string | No | Optional description |

**Request Example:**
```json
{
  "name": "New Resource",
  "description": "Optional description"
}
```

**Response Schema:**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "createdAt": "ISO8601"
}
```

**Side Effects:**
- Creates row in `{table}` table
- Emits Socket.IO event: `{resource}:created`
- Logs activity in `activity_logs` table

---

### GET /api/v1/{resource}/:id

**Description:** Get a single resource by ID.

**Path Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Resource ID |

**Response Schema:**
```json
{
  "id": "string",
  "name": "string",
  ...
}
```

---

### PATCH /api/v1/{resource}/:id

**Description:** Update a resource.

**Request Body Schema:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Updated name |

**Side Effects:**
- Updates row in `{table}` table
- Emits Socket.IO event: `{resource}:updated`
- Logs activity in `activity_logs` table

---

### DELETE /api/v1/{resource}/:id

**Description:** Delete a resource.

**Side Effects:**
- Deletes row from `{table}` table (or soft-deletes)
- Emits Socket.IO event: `{resource}:deleted`
- May cascade delete related records
- Logs activity in `activity_logs` table

---

## Side Effects Summary

| Operation | DB Writes | Socket Events | Emails | Webhooks |
|-----------|-----------|---------------|--------|----------|
| Create | `{table}` | `{resource}:created` | No | No |
| Update | `{table}` | `{resource}:updated` | No | No |
| Delete | `{table}` | `{resource}:deleted` | No | No |

---

## Error Responses

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | `UNAUTHORIZED` | Not authenticated |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate or conflict |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Notes / Gotchas

- List any known issues, edge cases, or important implementation details
- Document any rate limiting applied to these endpoints
- Note any deprecated endpoints or planned changes

---

*Last Updated: YYYY-MM-DD*
