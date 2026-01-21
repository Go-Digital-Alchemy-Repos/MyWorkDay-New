# Features

**Status:** Current  
**Last Updated:** January 2026

This section documents all major features and modules in MyWorkDay.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Auth flows and implementation |
| [PROJECT_MANAGEMENT.md](./PROJECT_MANAGEMENT.md) | Projects, tasks, workspaces |
| [TIME_TRACKING.md](./TIME_TRACKING.md) | Time tracking and reports |
| [CLIENT_MANAGEMENT.md](./CLIENT_MANAGEMENT.md) | CRM functionality |
| [SUPER_ADMIN.md](./SUPER_ADMIN.md) | Super admin capabilities |
| [TENANT_ADMIN.md](./TENANT_ADMIN.md) | Tenant admin features |
| [WHITE_LABEL.md](./WHITE_LABEL.md) | Branding and customization |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | Third-party integrations |
| [FILE_UPLOADS.md](./FILE_UPLOADS.md) | S3 upload system |
| [EMAIL_SYSTEM.md](./EMAIL_SYSTEM.md) | Email delivery and templates |
| [WORKLOAD_REPORTS.md](./WORKLOAD_REPORTS.md) | Analytics and reporting |

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

- **Create a project**: [PROJECT_MANAGEMENT.md](./PROJECT_MANAGEMENT.md#creating-projects)
- **Track time**: [TIME_TRACKING.md](./TIME_TRACKING.md#using-the-timer)
- **Add a client**: [CLIENT_MANAGEMENT.md](./CLIENT_MANAGEMENT.md#creating-clients)
- **Configure branding**: [WHITE_LABEL.md](./WHITE_LABEL.md)

### Administration

- **Manage tenants**: [SUPER_ADMIN.md](./SUPER_ADMIN.md#tenant-management)
- **Set up integrations**: [INTEGRATIONS.md](./INTEGRATIONS.md)
- **View system health**: [SUPER_ADMIN.md](./SUPER_ADMIN.md#system-status)

---

## Related Sections

- [04-API](../04-API/) - API endpoints for each feature
- [05-FRONTEND](../05-FRONTEND/) - Component documentation
- [07-SECURITY](../07-SECURITY/) - Access control and permissions
