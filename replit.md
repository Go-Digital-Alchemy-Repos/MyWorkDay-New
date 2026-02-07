# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application aimed at streamlining project workflows and enhancing team collaboration. It provides comprehensive tools for organizing projects, teams, and clients, featuring workspaces, tasks with subtasks, tags, comments, and activity tracking. The application focuses on centralizing project and client management, offering robust reporting, and real-time communication to improve productivity.

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
- **Multi-Tenancy**: Supports multi-tenancy with admin dashboard, white-label branding, per-tenant integrations, onboarding, and user management.
- **Authentication**: Session-based authentication using Passport.js with email/password and Google OAuth.
- **Real-time Communication**: Socket.IO for live updates, supporting a tenant-scoped chat system with channels, DMs, file attachments, and user presence tracking. Includes threaded replies and unread message management.
- **Project Management**: Includes workspaces, teams, clients, projects, tasks, activity logs, and time tracking. Projects support client assignment, team membership, and a division model for access control.
- **Client Management**: Client detail pages feature Notes (rich text, categorization, version tracking) and Documents (Cloudflare R2 uploads, categories, metadata). CRM features include client pipeline tracking, contacts, and an external client portal. Enhanced CRM list view with filters (status, industry), sort options (8 variants), view mode toggle (grid/table), density toggle (comfortable/compact), saved views (localStorage), bulk actions (multi-select, bulk status change), and a ClientProfileDrawer (health score, overview/timeline/projects/files tabs, quick note logging).
- **Task Management**: Tasks support subtasks, tags, comments with rich text, @mentions, and notifications. Project templates allow reusable project structures.
- **Collaboration System**: Reusable `CommentThread` component (supports task/project/client entity types with readOnly mode), generic `ActivityFeed` component (virtualized, with type and date range filters, backed by `/api/activity-log/:entityType/:entityId` or custom endpoints), and `CommandPalette` (Cmd+K global search with debounced `/api/search` endpoint).
- **Workload Management**: Features workload forecast and reports for task distribution and budget utilization.
- **Time Tracking**: Stopwatch-based time tracking with persistence and a dedicated dashboard.
- **Notifications**: Customizable real-time notification system with NotificationCenter popover (virtualized list, unread badge, per-type preferences, Socket.IO real-time updates). Backend: `POST /api/notifications/mark-all-read`, `PATCH /api/notifications/:id/read`.
- **Rich Text Editor**: Unified TipTap-based rich text editor for various features.
- **Client Portal**: External client access to projects/tasks with restricted permissions and token-based invitation.
- **CRM Feature Flags**: Environment-driven feature flags (`CRM_CLIENT_360_ENABLED`, `CRM_CONTACTS_ENABLED`, `CRM_TIMELINE_ENABLED`, `CRM_PORTAL_ENABLED`, `CRM_FILES_ENABLED`, `CRM_APPROVALS_ENABLED`, `CRM_CLIENT_MESSAGING_ENABLED`) control CRM module visibility and functionality.
- **Client 360 View**: A tabbed CRM profile page providing an overview, projects, contacts, activity timeline, files, notes, profitability reports, approvals, and messaging.
- **Client Profitability Reports**: Admin-only reporting in Client 360 view, providing metrics like total/billable hours, revenue estimates, and detailed time entries by project and employee.
- **Client Approval Workflows**: Allows admins to create approval requests for clients, which clients can review and approve or request changes via the portal.
- **Client Messaging**: A client-safe communication system separate from internal chat, allowing admins/employees to converse with clients within client-specific conversations.
- **System Robustness**: Includes centralized error logging, standardized API error handling, data purge capabilities, and schema readiness checks.
- **Super Admin Capabilities**: Full tenant user management, diagnostics, and repair automation.
- **User Experience**: Global command palette, keyboard shortcuts, `useUnsavedChanges` hook, dark mode, and a CSS-variable-based accent color theming system.
- **Design Token System**: Formal CSS design tokens for spacing, typography, motion, radii, z-index, and semantic surface aliases ensure UI consistency.
- **SaaS Agreement System**: Manages tenant SaaS agreements with lifecycle, versioning, and user acceptance tracking.
- **Cloudflare R2 Storage**: Exclusive file storage with automatic image compression.
- **Modular Architecture**: Modular API routes are organized by domain, including dedicated Super Admin sub-routers, with standardized error handling.
- **DB Performance Indexes**: Composite and single-column indexes are strategically applied for performance.
- **React Query Performance**: Tuned defaults, per-data-type stale times, optimistic updates with rollback, and array-based query keys for efficient cache management.
- **List Virtualization**: `VirtualizedList` component and React Virtuoso for efficient rendering of large lists. Chat timeline uses Virtuoso directly with `firstItemIndex` prepend pattern, `followOutput` for stick-to-bottom, and `atBottomStateChange` for new-messages pill.
- **Error Boundaries**: Comprehensive error boundaries for React render errors with recovery UI.
- **Motion System**: Framer Motion-based animation primitives for enhanced user experience.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar view for tasks.
- **Passport.js**: Session-based authentication.
- **Railway**: Deployment platform.
- **Mailgun**: Email sending.
- **Cloudflare R2**: Exclusive file storage.