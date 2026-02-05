# API Registry

This category contains documentation for all API route modules in the application. Each document follows a standard template to ensure consistency and completeness.

## Purpose

The API Registry serves as a central reference for:
- All available API endpoints
- Request/response schemas
- Authentication requirements
- Tenant scoping rules
- Side effects (database writes, emails, webhooks)

## Document Status

Documents may have one of the following statuses:

| Status | Meaning |
|--------|---------|
| **Draft** | Incomplete documentation, work in progress |
| **Review** | Complete but pending technical review |
| **Published** | Reviewed and accurate |
| **Deprecated** | API still exists but is being phased out |

## How to Add a New API Document

1. Create a new `.md` file in `/docs/17-API-REGISTRY/`
2. Use the naming convention: `{DOMAIN}.md` (e.g., `TASKS.md`, `PROJECTS.md`)
3. Copy the template from `01-TEMPLATE.md`
4. Fill in as much as you can; partial docs are acceptable with "Draft" status
5. Update the status field as documentation progresses

## Covered Domains

| Domain | File | Status |
|--------|------|--------|
| Template | `01-TEMPLATE.md` | Reference |
| Tasks | `TASKS.md` | Draft |
| Projects | `PROJECTS.md` | Draft |
| Clients | `CLIENTS.md` | Draft |
| Time Entries | `TIME-ENTRIES.md` | Draft |
| Comments | `COMMENTS.md` | Draft |
| Users | `USERS.md` | Draft |
| Teams | `TEAMS.md` | Draft |
| Workspaces | `WORKSPACES.md` | Draft |
| Tags | `TAGS.md` | Draft |
| Notifications | `NOTIFICATIONS.md` | Draft |
| Chat | `CHAT.md` | Draft |
| Agreements | `AGREEMENTS.md` | Draft |
| Super Admin | `SUPER-ADMIN.md` | Draft |

---

*Last Updated: 2026-02-04*
