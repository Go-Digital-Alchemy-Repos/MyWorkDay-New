# Client Portal Permissions

## Overview
The client portal provides external client users with restricted access to project data, approvals, and messaging. Access is controlled through role-based permissions and token-based invitations.

## Access Control

### User Roles
| Role | Portal Access | Admin Features |
|------|--------------|----------------|
| `super_user` | Full internal access | All CRM admin features |
| `admin` | Full internal access | CRM management, invite clients |
| `employee` | Internal access (scoped) | Limited CRM features |
| `client` | Portal access only | View/respond to assigned items |

### Client Role Capabilities
Client users can:
- View dashboard with project/task statistics
- Browse assigned projects and tasks
- Review and respond to approval requests (approve or request changes)
- Send and receive messages in client conversations
- View client-visible files

Client users cannot:
- Access internal workspace data
- Create projects or tasks
- View internal-only files
- Access other clients' data
- Modify approval requests after responding

## Portal Routes

| Route | Description | Auth Required |
|-------|-------------|---------------|
| `/portal` | Dashboard | Client role |
| `/portal/projects` | Project list | Client role |
| `/portal/projects/:id` | Project tasks | Client role |
| `/portal/tasks` | Task list | Client role |
| `/portal/approvals` | Approval requests | Client role |
| `/portal/messages` | Conversations | Client role |

## Invitation Flow
1. Admin navigates to client detail page
2. Admin creates portal invitation (email + access level)
3. System generates invitation token
4. Client receives invitation email with registration link
5. Client registers and gains portal access

## Data Scoping
- All portal queries are scoped to the client's `tenantId` and `clientId`
- Projects visible only if client is assigned
- Tasks visible only within assigned projects
- Conversations visible only if client is a participant
- Approval requests visible only if addressed to client

## Onboarding
First-time portal users (no projects/tasks) see a "Getting Started" guide with:
- View Projects card (link to `/portal/projects`)
- Approvals card (link to `/portal/approvals`)
- Messages card (link to `/portal/messages`)

Guide cards automatically hide once the client has active projects or tasks.
