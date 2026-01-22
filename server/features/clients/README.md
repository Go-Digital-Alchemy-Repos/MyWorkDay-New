# Clients Feature

Client management (CRM) functionality for the project management system.

## Overview

This feature provides CRUD operations for:
- **Clients**: Company/organization entities that own projects
- **Contacts**: People associated with clients
- **Invites**: Client portal access invitations (placeholder for future auth)

## Routes

### Core Client Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clients` | List all clients for tenant |
| GET | `/api/clients/:id` | Get client with contacts |
| POST | `/api/clients` | Create new client |
| PATCH | `/api/clients/:id` | Update client |
| DELETE | `/api/clients/:id` | Delete client |

### Contact Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clients/:clientId/contacts` | List client contacts |
| POST | `/api/clients/:clientId/contacts` | Add contact |
| PATCH | `/api/clients/:clientId/contacts/:contactId` | Update contact |
| DELETE | `/api/clients/:clientId/contacts/:contactId` | Delete contact |

### Invite Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/clients/:clientId/invites` | List pending invites |
| POST | `/api/clients/:clientId/invites` | Send invite to contact |
| DELETE | `/api/clients/:clientId/invites/:inviteId` | Revoke invite |

## Tenant Scoping

All routes respect tenant context:
- Tenant users see only their tenant's clients
- Super users can access any client (legacy mode)
- Division-based access control (see divisions router)

## Files

- `router.ts` - Express router with route handlers
- `helpers.ts` - Utility functions (getCurrentUserId, etc.)
- `README.md` - This documentation

## Real-time Events

Client mutations emit Socket.IO events for live updates:
- `client:created`, `client:updated`, `client:deleted`
- `client:contact:created`, `client:contact:updated`, `client:contact:deleted`
- `client:invite:sent`, `client:invite:revoked`

## Related Features

- **Divisions** (`/api/v1/clients/:clientId/divisions`) - Organizational units within clients
- **Projects** (`/api/clients/:clientId/projects`) - Projects linked to clients
