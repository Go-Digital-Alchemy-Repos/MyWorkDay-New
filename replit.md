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
- **Real-time Communication**: Socket.IO for live updates, supporting a tenant-scoped chat system with channels, DMs, file attachments, unread tracking, message search, @mentions, retention policies, and export.
- **Project Management**: Includes entities for workspaces, teams, clients, projects, tasks, activity logs, and time tracking. Projects support client assignment, team membership, and an optional division model for finer-grained access control.
- **Client Notes & Documents**: Client detail pages include Notes and Documents tabs. Notes feature rich text (TipTap JSON), categorization (general, project, feedback, meeting, requirement), and version tracking with full edit history. Documents support S3 uploads with presigned URLs, categories per client, file metadata, and download functionality.
- **Task Management**: Tasks support subtasks, tags, comments with rich text, @mentions, and notifications.
- **Workload Management**: Features workload forecast and reports for task distribution and budget utilization.
- **Time Tracking**: Stopwatch-based time tracking with reliability features, cross-session persistence, and `My Time` dashboard.
- **Notifications**: Customizable real-time notification system with user preferences for various event types (task, comment, project updates).
- **Rich Text Editor**: JSON-only rich text storage using TipTap for descriptions and comments with server-side validation and mention parsing.
- **Client Portal**: External client access to projects/tasks with restricted permissions (viewer/collaborator roles) and a token-based invitation flow.
- **System Robustness**: Includes centralized error logging with request ID correlation, standardized API error handling, data purge capabilities, tenant data health remediation tools, startup production parity check (validates schema against expected tables/columns on server boot), and tenant core flows smoke tests.
- **Super Admin Capabilities**: Full tenant user management including inline editing (firstName, lastName, email, role), permanent user deletion with confirmation dialogs, password reset with session invalidation, and comprehensive tenant health diagnostics with repair automation.
- **User Experience**: Global command palette, keyboard shortcuts, `useUnsavedChanges` hook for dirty state management, and a professional UI design with dark mode support.
- **SaaS Agreement System**: Manages tenant SaaS agreements with lifecycle, versioning, and user acceptance tracking.
- **Hierarchical S3 Storage**: Configurable 3-tier S3 storage (tenant-specific → system-level → env vars) for file attachments.
- **Centralized Type Augmentation**: `server/types.d.ts` provides TypeScript declarations for Express Request properties (tenant context, requestId, clientAccess) attached by middleware, eliminating `(req as any)` casts.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar view for tasks.
- **Passport.js**: Session-based authentication.
- **Railway**: Deployment platform.
- **Mailgun**: Email sending.
- **AWS S3 (or compatible)**: File storage for attachments and exports.