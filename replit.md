# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application designed to streamline project workflows and enhance team collaboration. It provides comprehensive tools for organizing projects, teams, and clients, featuring workspaces, tasks with subtasks, tags, comments, and activity tracking. The application aims to be a robust solution for managing diverse project needs and improving productivity.

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- **Database migrations**: When pushing schema changes, preserve existing data - only update schema structure, never wipe the database. Use Drizzle migrations (`drizzle-kit generate` + `drizzle-kit migrate`) instead of `drizzle-kit push` for production deployments.
- Calendar view displays tasks with due dates using FullCalendar, with filtering and drag-to-reschedule
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
- **Multi-Tenancy**: Supports multi-tenancy with configurable enforcement levels.
- **Admin Dashboard**: Expanded Super Admin Dashboard for tenant management, global reports, and system settings.
- **White Label Branding**: Tenants can customize app appearance (names, logos, favicons, colors, login messages).
- **Per-Tenant Integrations**: Tenants can configure Mailgun (email) and S3 (storage) with encrypted secrets.
- **Authentication**: Session-based authentication using Passport.js with email/password and Google OAuth. Includes account linking and first-user bootstrap.
- **Rate Limiting**: IP and email-based brute-force protection for auth endpoints.
- **Email Observability**: Outbox logging for all emails with status tracking and resend capability.
- **Real-time Communication**: Socket.IO for live updates.
- **Database Schema**: Includes entities for users, workspaces, teams, clients, projects, tasks, activity logs, time tracking, tenant settings, and integrations.
- **Workload Forecast**: Project-level analytics with budget tracking and assignee workload distribution.
- **Production Bootstrap**: Secure one-time super admin creation or first-user registration.
- **Data Purge**: Controlled script and API endpoint for deleting all application data with safety guards.
- **Tenant Onboarding**: Structured 4-step wizard for new tenants.
- **Tenant Invitations**: Super admins can invite tenant admins via link or email.
- **Bulk CSV User Import**: Super admins can import users in bulk via CSV.
- **Tenant Pre-Provisioning**: Super users can fully configure tenants before activation, including "Act as Tenant" mode.
- **Tenant Management UI**: Comprehensive drawer-based UI for tenant management including overview, onboarding, workspaces, users, and branding.
- **User Provisioning**: Unified workflow for creating/updating tenant users with immediate access or password reset links.
- **Platform Admin Provisioning**: Password management for other platform administrators with audit logging.
- **User Impersonation**: Allows super admins to view the app as a tenant user.
- **Password Security**: `mustChangePasswordOnNextLogin` flag for forced password changes.
- **SaaS Agreement System**: Manages tenant SaaS agreements with lifecycle, versioning, and user acceptance tracking, enforced by middleware.
- **Frontend Structure**: Organized into `pages/` and `components/`, using `FullScreenDrawer` with unsaved changes guards.
- **Backend Structure**: Modular routes, `DatabaseStorage` class, middleware for error handling, validation, and authentication.
- **Design Guidelines**: Professional design with Inter font, 3-column layout, and dark mode support.
- **API Error Handling**: Standardized error envelope with stable error codes and request ID correlation.
- **Tenant Data Health Remediation**: Tools for backfilling missing `tenantId` values, quarantine management, and data integrity checks.
- **Performance Optimizations**: N+1 query fixes and query debugging utilities.
- **Navigation Mode Hardening**: Enhanced super/tenant mode switching with `useAppMode` hook, cache isolation, and route guards.
- **Time Tracking Reliability**: Timer hardening for cross-session/tab reliability using `BroadcastChannel`, `localStorage` fallback, and optimistic mutations.
- **Hierarchical S3 Storage**: 3-tier storage configuration with automatic fallback (tenant-specific → system-level → env vars).
- **Global Command Palette**: Keyboard-driven search (⌘K / Ctrl+K) and quick actions across clients, projects, and tasks.
- **Enhanced Task Comments**: Full comment management with edit/delete permissions, resolve/unresolve, and @mention support with email notifications.
- **Tenant-Scoped Chat System**: Slack-like messaging with channels and direct messages via Socket.IO, including file attachments using hierarchical S3 storage. Includes comprehensive stability features: infinite reconnection with automatic room rejoin, duplicate message guards, optimistic UI with pending/sent/failed states, retry mechanism for failed messages, consistent message ordering, stale pending cleanup (2-minute timeout), connection status indicator, and toast notifications when removed from channels.
- **Chat Unread Tracking**: Real-time unread badge indicators using `chat_reads` table and auto-mark as read.
- **Chat Message Search**: Tenant-scoped message search across accessible channels and DMs.
- **Chat @Mentions**: Real-time @mention autocomplete and rendering with tenant-scoped validation.
- **Chat Retention Policies**: Configurable message retention with system-level and tenant-level settings and an archive job.
- **Chat Transcript Export**: JSON export of chat conversations to S3 for tenant admins.
- **Chat Debugging**: Super Admin diagnostic tools with CHAT_DEBUG=true env flag enabling socket event logging, in-memory metrics, debug endpoints (/api/v1/super/debug/chat/*), and UI panel. Request IDs surface in error toasts for log correlation. See /docs/CHAT_DEBUGGING.md.
- **Centralized Error Logging**: All 500+ server errors and key 4xx errors (403, 404, 429) are automatically captured to `error_logs` table with request context, secret redaction, and requestId correlation. Request IDs surface in tenant error toasts (Ref: abc12345) for support correlation. Super Admin UI panel for filtering/viewing errors with stack traces. See /docs/ERROR_LOGGING.md.
- **Project Membership Model**: Projects require client assignment and track team membership. Employees see only projects they're members of; admins see all tenant projects. Project creators are automatically added as "owner" role members. Member management via ProjectDrawer with Overview and Team tabs.
- **Client Divisions Data Model (DIV-1)**: Optional organizational divisions within clients for finer-grained access control. New tables: `client_divisions` (id, tenantId, clientId, name, description, color, isActive, timestamps) and `division_members` (id, tenantId, divisionId, userId, role, createdAt). Projects have optional `divisionId` FK for division assignment. Legacy clients/projects without divisions continue working unchanged. Server-side scoping helpers: `getEffectiveDivisionScope()` returns "ALL" for admins or division IDs for employees; `validateDivisionBelongsToClientTenant()` and `validateUserBelongsToTenant()` for tenant isolation.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar view for tasks.
- **Passport.js**: Session-based authentication.
- **Railway**: Deployment platform.
- **Mailgun**: Email sending.
- **AWS S3 (or compatible)**: File storage for attachments and exports.