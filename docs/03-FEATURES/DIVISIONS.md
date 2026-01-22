# Client Divisions

## Overview

Client Divisions provide an optional organizational structure within clients for finer-grained access control. Divisions allow you to organize users and projects into logical groups (e.g., "Engineering", "Marketing", "Sales") within a single client.

## Data Model

### Tables

#### `client_divisions`
| Column | Type | Description |
|--------|------|-------------|
| id | varchar (UUID) | Primary key |
| tenantId | varchar | Required, FK to tenants |
| clientId | varchar | Required, FK to clients |
| name | varchar | Required, division name |
| description | text | Optional description |
| color | varchar | Optional hex color code |
| isActive | boolean | Default true |
| createdAt | timestamp | Auto-generated |
| updatedAt | timestamp | Auto-updated |

#### `division_members`
| Column | Type | Description |
|--------|------|-------------|
| id | varchar (UUID) | Primary key |
| tenantId | varchar | Required, FK to tenants |
| divisionId | varchar | Required, FK to client_divisions |
| userId | varchar | Required, FK to users |
| role | varchar | "member" or "manage" |
| createdAt | timestamp | Auto-generated |

**Constraints:**
- Unique constraint on `(divisionId, userId)` - a user can only be a member once per division

### Projects Integration

Projects have an optional `divisionId` column that links them to a division. Projects without a divisionId continue to work as before (backward compatibility).

## API Endpoints

All endpoints require tenant authentication context.

### List Divisions

```
GET /api/v1/clients/:clientId/divisions
```

Returns divisions for a specific client. Employees only see divisions they are members of.

**Response:**
```json
[
  {
    "id": "uuid",
    "tenantId": "uuid",
    "clientId": "uuid",
    "name": "Engineering",
    "description": "Engineering team",
    "color": "#3B82F6",
    "isActive": true,
    "memberCount": 5,
    "projectCount": 12,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

### Create Division

```
POST /api/v1/clients/:clientId/divisions
```

**Permissions:** Tenant admin only

**Request Body:**
```json
{
  "name": "Marketing",
  "description": "Marketing team division",
  "color": "#10B981",
  "isActive": true
}
```

**Response:** Created division object (201)

### Update Division

```
PATCH /api/v1/divisions/:divisionId
```

**Permissions:** Tenant admin only

**Request Body (partial update):**
```json
{
  "name": "Updated Name",
  "isActive": false
}
```

**Response:** Updated division object

### Get Division Members

```
GET /api/v1/divisions/:divisionId/members
```

Returns the list of users assigned to a division with their details.

**Response:**
```json
{
  "members": [
    {
      "id": "uuid",
      "divisionId": "uuid",
      "userId": "uuid",
      "role": "member",
      "user": {
        "id": "uuid",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "employee"
      }
    }
  ]
}
```

### Set Division Members

```
POST /api/v1/divisions/:divisionId/members
```

**Permissions:** Tenant admin only

Replaces all current members with the provided list.

**Request Body:**
```json
{
  "userIds": ["user-uuid-1", "user-uuid-2"]
}
```

**Response:**
```json
{
  "success": true,
  "members": [...]
}
```

### Remove Division Member

```
DELETE /api/v1/divisions/:divisionId/members/:userId
```

**Permissions:** Tenant admin only

**Response:**
```json
{
  "success": true
}
```

## Access Control

### Scoping Rules

1. **Admins/Super Users**: See all divisions across all clients in their tenant
2. **Employees**: Only see divisions they are members of

### Helper Functions

The storage layer provides scoping helpers:

- `getEffectiveDivisionScope(userId, tenantId)`: Returns "ALL" for admins or array of division IDs for employees
- `validateDivisionBelongsToClientTenant(divisionId, clientId, tenantId)`: Validates division ownership
- `validateUserBelongsToTenant(userId, tenantId)`: Validates user belongs to tenant

## Backward Compatibility

- Clients without divisions continue to work unchanged
- Projects without divisionId continue to work unchanged
- No breaking changes to existing endpoints or workflows

## UI Integration

Divisions are managed through the Client profile:
1. Navigate to a Client
2. Click the "Divisions" tab
3. Create, edit, or manage division membership

See TENANT_ADMIN_GUIDE.md for detailed UI workflows.
