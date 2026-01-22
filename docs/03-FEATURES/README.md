# Features

**Status:** Current  
**Last Updated:** January 2026

This section documents all major features and modules in MyWorkDay.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [DIVISIONS.md](./DIVISIONS.md) | Client divisions for access control |
| [CHAT.md](./CHAT.md) | Real-time messaging system |
| [ERROR_HANDLING.md](./ERROR_HANDLING.md) | Error handling and logging |
| [MODULAR_ARCHITECTURE.md](./MODULAR_ARCHITECTURE.md) | Feature-based code organization |
| [TIME_TRACKING.md](./TIME_TRACKING.md) | Time tracking and reports |
| [TENANT_ADMIN_GUIDE.md](./TENANT_ADMIN_GUIDE.md) | Tenant admin features |

### Also See (Root /docs)

| Document | Description |
|----------|-------------|
| [AUTHENTICATION.md](../AUTHENTICATION.md) | Auth flows and implementation |
| [CHAT.md](../CHAT.md) | Full chat technical docs |
| [DIVISIONS.md](../DIVISIONS.md) | Full divisions technical docs |
| [ERROR_LOGGING.md](../ERROR_LOGGING.md) | Error logging details |
| [UPLOADS_S3.md](../UPLOADS_S3.md) | S3 upload system |
| [EMAIL_OBSERVABILITY.md](../EMAIL_OBSERVABILITY.md) | Email delivery and tracking |

---

## Feature Overview

### Core Features

| Feature | Description | Key Components |
|---------|-------------|----------------|
| Authentication | Session-based login, Google OAuth, password reset | `/api/auth/*` |
| Projects | Kanban boards, sections, tasks | `project.tsx`, `project-detail-drawer.tsx` |
| Tasks | Multi-assignee, subtasks, comments, attachments | `task-detail-drawer.tsx` |
| Time Tracking | Timer, manual entries, reports | `time-tracking.tsx`, `global-active-timer.tsx` |
| Clients | CRM with 17 fields, contacts, portal invites | `clients.tsx`, `client-detail.tsx` |
| My Tasks | Personal task views, custom sections | `my-tasks.tsx` |

### Administration

| Feature | Description | Access Level |
|---------|-------------|--------------|
| Tenant Admin | Teams, workspaces, branding, integrations | Tenant Admin |
| Super Admin | Tenant management, global reports, system status | Super User |
| System Health | Database, S3, Mailgun, WebSocket status | Super User |
| Debug Tools | Quarantine manager, backfill, integrity checks | Super User |

### Multi-Tenancy

| Feature | Description |
|---------|-------------|
| Tenant Isolation | Complete data separation per tenant |
| White Label | Custom branding per tenant |
| SaaS Agreements | Version-gated terms acceptance |
| Tenant Onboarding | 4-step wizard for new tenants |

---

## Feature Matrix by Role

| Feature | Employee | Admin | Super |
|---------|----------|-------|-------|
| Projects/Tasks | ✓ | ✓ | ✓* |
| Time Tracking | ✓ | ✓ | ✓* |
| Clients | ✓ | ✓ | ✓* |
| Team Management | - | ✓ | ✓* |
| Branding | - | ✓ | ✓ |
| Integrations | - | ✓ | ✓ |
| Tenant Management | - | - | ✓ |
| System Status | - | - | ✓ |
| Global Reports | - | - | ✓ |

*Super users access tenant features via impersonation

---

## Quick Links

### Most Common Tasks

- **Track time**: [TIME_TRACKING.md](./TIME_TRACKING.md#using-the-timer)
- **Manage divisions**: [DIVISIONS.md](./DIVISIONS.md)
- **Use chat**: [CHAT.md](./CHAT.md)

### Technical References

- **Error handling**: [ERROR_HANDLING.md](./ERROR_HANDLING.md)
- **Architecture**: [MODULAR_ARCHITECTURE.md](./MODULAR_ARCHITECTURE.md)
- **Tenant admin guide**: [TENANT_ADMIN_GUIDE.md](./TENANT_ADMIN_GUIDE.md)

---

## Related Sections

- [04-API](../04-API/) - API endpoints for each feature
- [05-FRONTEND](../05-FRONTEND/) - Component documentation
- [07-SECURITY](../07-SECURITY/) - Access control and permissions
