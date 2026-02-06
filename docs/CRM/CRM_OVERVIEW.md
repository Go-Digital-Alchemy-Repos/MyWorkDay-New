# CRM Module Overview

## Purpose
The CRM module extends MyWorkDay's project management capabilities with client relationship management features. It provides a centralized Client 360 view, contact management, approval workflows, client messaging, file sharing, profitability reporting, and a self-service client portal.

## Architecture

### Feature Flags
All CRM features are gated behind environment-driven feature flags, defaulting to `false`:

| Flag | Controls |
|------|----------|
| `CRM_CLIENT_360_ENABLED` | Client 360 tabbed profile page |
| `CRM_CONTACTS_ENABLED` | Contact management (CRUD) |
| `CRM_TIMELINE_ENABLED` | Activity timeline tab |
| `CRM_PORTAL_ENABLED` | Client portal access |
| `CRM_FILES_ENABLED` | Client file management |
| `CRM_APPROVALS_ENABLED` | Approval request workflows |
| `CRM_CLIENT_MESSAGING_ENABLED` | Client-safe messaging |

Flags are exposed via `GET /api/crm/flags` and consumed by the `useCrmFlags()` hook on the frontend.

### Data Model
- **`client_crm`** table: Extends client records with pipeline tracking (lead/prospect/active/past/on_hold), owner assignment, tags, and follow-up scheduling.
- **`crm_contacts`**: Contact persons for each client with name, email, phone, title, and primary flag.
- **`approval_requests`**: Client review/approve workflow records tied to clients (optionally projects/tasks).
- **`client_conversations`** / **`client_messages`**: Client-safe messaging separate from internal chat.

See `CRM_DATA_MODEL.md` for full schema details.

### API Structure
CRM APIs live at `/api/crm/` (separate from `/api/clients`). All endpoints enforce tenant scoping and RBAC.

See `CRM_API_REGISTRY.md` for the complete endpoint reference.

## Key Features

### Client 360 View
Tabbed profile page at `/clients/:id/360` providing a unified view of all client data:
- **Overview**: CRM summary cards (pipeline status, owner, follow-up, project/task/hours counts), quick actions
- **Projects**: Client project listing (placeholder)
- **Contacts**: Contact persons with search, add/edit drawer, primary designation
- **Activity**: Timeline of client-related activity
- **Files**: Document management with visibility controls (client-visible vs internal)
- **Notes**: Rich text notes with author tracking
- **Reports**: Client profitability dashboard with hours breakdown and CSV export
- **Approvals**: Approval request management (gated by `CRM_APPROVALS_ENABLED`)
- **Messages**: Client conversations (gated by `CRM_CLIENT_MESSAGING_ENABLED`)

### Client Portal
External client access via token-based invitation:
- Dashboard with project/task stats and getting-started guide cards
- Project and task browsing with restricted permissions
- Approval review and response
- Messaging with internal team
- Access at `/portal/*` routes

### Approval Workflows
Admin creates approval request tied to client -> client receives in portal -> client approves or requests changes with comment -> requester notified.

### Client Messaging
Separate from internal chat. Conversations scoped by client (optionally project). Admin/employee can start conversations; clients can reply. Closed conversations become read-only.

### Client Profitability Reports
Admin-only reporting in Client 360 "Reports" tab with:
- Total/billable/non-billable hours summary
- Hours breakdown by project and employee (bar charts)
- Time entries table with CSV export
- Date range filtering

## Security
- All endpoints are tenant-scoped
- RBAC enforcement (admin/employee vs client roles)
- Portal access requires client role with valid token
- Approval PATCH restricted to client role only
- Status locked after approval response
