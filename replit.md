# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application designed to streamline project workflows and enhance team collaboration. It provides comprehensive tools for organizing projects, teams, and clients, featuring workspaces, tasks with subtasks, tags, comments, and activity tracking. The application aims to be a robust solution for managing diverse project needs and improving productivity by offering a centralized platform for project and client management, robust reporting, and real-time communication capabilities.

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- **Database migrations**: When pushing schema changes, preserve existing data - only update schema structure, never wipe the database. Use Drizzle migrations (`drizzle-kit generate` + `drizzle-kit migrate`) instead of `drizzle-kit push` for production deployments.
- Calendar view displays tasks with due dates using FullCalendar, with filtering by client/project/assignee/scope; read-only visualization with task detail drawer on click. Uses lightweight CalendarTask DTO (id, title, status, priority, dueDate, projectId, assignees) for performance - full task data fetched on demand when clicked.
- My Tasks view with two viewing modes: date-based grouping (overdue, today, tomorrow, upcoming) and personal sections organization
- Projects Dashboard with search, status/client/team filters, table view showing project details via drawer, and budget utilization indicators
- Workload Reports in Settings showing task distribution by employee with completion metrics
- Workload Forecast with task time estimates, project budgets, budget tracking, and workload distribution by assignee

## System Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query (TanStack Query v5), FullCalendar
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend)
- **State Management**: React Query for server state
- **Real-time**: Socket.IO for live updates across connected clients

### Core Features and Design Patterns
- **Multi-Tenancy**: Supports multi-tenancy with configurable enforcement levels, admin dashboard, white-label branding, per-tenant integrations, onboarding, invitations, bulk user import, and pre-provisioning.
- **Authentication**: Session-based authentication using Passport.js with email/password and Google OAuth, including account linking, first-user bootstrap, and rate limiting.
- **Real-time Communication**: Socket.IO for live updates, supporting a tenant-scoped chat system with channels, DMs, file attachments, unread tracking, message search, @mentions, retention policies, and export. Features a draggable/resizable chat modal with minimize/maximize capabilities and persistent position/size via localStorage. Includes threaded replies (single-level threads with reply count indicators) and jump-to-unread functionality with unread divider visualization.
- **User Presence**: Real-time online/idle/offline status tracking via Socket.IO.
- **Chat Read State & Unread Counts**: Durable read state tracking via `chat_reads` table with `lastReadMessageId` and `lastReadAt` per user per conversation.
- **Project Management**: Includes entities for workspaces, teams, clients, projects, tasks, activity logs, and time tracking. Projects support client assignment, team membership, and an optional division model for finer-grained access control.
- **Client Notes & Documents**: Client detail pages include Notes and Documents tabs. Notes feature rich text, categorization, and version tracking. Documents support Cloudflare R2 uploads with presigned URLs, categories per client, file metadata, and download functionality.
- **Task Management**: Tasks support subtasks, tags, comments with rich text, @mentions, and notifications.
- **Project Templates**: Admin-only template editor for creating reusable project structures with sections and tasks.
- **Workload Management**: Features workload forecast and reports for task distribution and budget utilization.
- **Time Tracking**: Stopwatch-based time tracking with reliability features, cross-session persistence, and `My Time` dashboard.
- **Notifications**: Customizable real-time notification system with user preferences.
- **Rich Text Editor**: Unified TipTap-based rich text editor for various features, storing content as JSON.
- **Client Portal**: External client access to projects/tasks with restricted permissions and a token-based invitation flow.
- **CRM Feature Flags**: Environment-driven feature flags (`CRM_CLIENT_360_ENABLED`, `CRM_CONTACTS_ENABLED`, `CRM_TIMELINE_ENABLED`, `CRM_PORTAL_ENABLED`, `CRM_FILES_ENABLED`, `CRM_APPROVALS_ENABLED`, `CRM_CLIENT_MESSAGING_ENABLED`) all defaulting to `false`. Exposed via `GET /api/crm/flags` and consumed by `useCrmFlags()` hook. Navigation placeholders hidden unless flags enabled. See `docs/CRM/CRM_PORTAL_ROADMAP.md` for full roadmap.
- **CRM Data Model & API**: `client_crm` table for pipeline/status tracking (lead/prospect/active/past/on_hold), owner assignment, tags, and follow-ups. CRM API at `/api/crm/` (separate from `/api/clients`) with summary, contacts CRUD, CRM field upsert (admin-only), and notes CRUD. All endpoints enforce tenant scoping and RBAC. See `docs/CRM/CRM_DATA_MODEL.md` and `docs/CRM/CRM_API_REGISTRY.md`.
- **Client 360 View**: Tabbed CRM profile page (`/clients/:id/360`) behind `CRM_CLIENT_360_ENABLED` feature flag. Tabs: Overview (CRM summary cards, quick actions), Projects (placeholder), Contacts (list, add/edit drawer, mark primary via CRM API), Activity (placeholder), Files (placeholder), Notes (rich text editor, notes feed with author + timestamp via CRM API), Reports (placeholder). Navigation link added to client detail header when flag is enabled. Non-destructive: existing client detail page unchanged.
- **System Robustness**: Includes centralized error logging, standardized API error handling, data purge capabilities, tenant data health remediation tools, startup production parity check, and tenant core flows smoke tests.
- **Super Admin Capabilities**: Full tenant user management including inline editing, permanent user deletion, password reset, and comprehensive tenant health diagnostics with repair automation.
- **User Experience**: Global command palette, keyboard shortcuts, `useUnsavedChanges` hook for dirty state management, and a professional UI design with dark mode support. Includes a CSS-variable-based accent color theming system with six presets (blue/indigo/teal/green/orange/slate, default: blue) managed via `useTheme()` hook from `client/src/lib/theme-provider.tsx`. Supports light/dark/system theme modes. User preferences (themeMode, themeAccent) are persisted server-side in `user_ui_preferences` table and synced via `useThemeSync` hook. Tenant admins can set a `defaultThemeAccent` in tenant settings (Branding tab) as the org-wide fallback. Appearance controls are on the User Profile page. LocalStorage keys use `myworkday.theme.*` prefix (migrated from `dasana-*`). See `docs/UX/theme_tokens.md` for full documentation.
- **SaaS Agreement System**: Manages tenant SaaS agreements with lifecycle, versioning, and user acceptance tracking.
- **Cloudflare R2 Storage**: Cloudflare R2 is the exclusive storage provider for all file uploads. All image uploads are automatically compressed through a server-side and client-side pipeline.
- **Centralized Type Augmentation**: `server/types.d.ts` provides TypeScript declarations for Express Request properties attached by middleware.
- **Database Migrations & Schema Readiness**: Uses Drizzle ORM migrations with a startup schema readiness check.
- **Rate Limiting**: Configurable rate limiting for various endpoints, enabled by default in production.
- **Tenant Data Integrity**: Storage layer includes `assertInsertHasTenantId` guards to prevent creating rows without a `tenantId`. A backfill script and Super Admin API endpoint are available for orphaned rows.
- **Modular Route Architecture**: API routes are split into domain-specific router files under `server/routes/`: `tasks.router.ts`, `timeTracking.router.ts`, `clients.router.ts`, `projects.router.ts`, `users.router.ts`, mounted via `server/routes/index.ts`. The main `server/routes.ts` handles workspaces, teams, sections, tags, comments, activity, attachments, notifications, and remaining routes. All route handlers use `handleRouteError()` for standardized error responses. Super Admin routes (`/api/v1/super/*`) are further modularized into 22 domain-specific sub-routers under `server/routes/modules/super-admin/` (tenants, tenant-users, tenant-invitations, admins, agreements, reports, impersonation, system-settings, docs, diagnostics, etc.), aggregated by `server/routes/superAdmin.ts` (~90 lines, down from 9,587).
- **DB Performance Indexes**: Composite and single-column indexes on `sections` (project+order), `activityLog` (entity, workspace, created_at), plus existing indexes on tasks, time_entries, comments, and client-related tables.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar view for tasks.
- **Passport.js**: Session-based authentication.
- **Railway**: Deployment platform.
- **Mailgun**: Email sending.
- **Cloudflare R2**: Exclusive file storage (S3-compatible API).