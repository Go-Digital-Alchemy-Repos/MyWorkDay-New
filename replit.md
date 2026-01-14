# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application designed to streamline project workflows and enhance team collaboration. It provides comprehensive tools for organizing projects, teams, and clients, featuring workspaces, tasks with subtasks, tags, comments, and activity tracking. The application aims to be a robust solution for managing diverse project needs and improving productivity.

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
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
- **Multi-Tenancy**: The application supports multi-tenancy with a `tenants` table and tenant-scoped data access. A `TENANCY_ENFORCEMENT` environment variable (`off|soft|strict`) controls tenant isolation behavior, with `soft` mode logging warnings and `strict` mode blocking cross-tenant access. A Super Admin dashboard provides tools for tenant management, health monitoring, and data backfilling.
- **White Label Branding**: Tenants can customize their app appearance with custom app names, logos, favicons, colors (primary/secondary/accent), and login messages. White-labeling is controlled via `whiteLabelEnabled` flag, with optional `hideVendorBranding` to remove platform branding.
- **Per-Tenant Integrations**: Tenants can configure their own Mailgun (email) and S3 (storage) integrations with AES-256-GCM encrypted secrets. Integration status tracking (not_configured/configured/error) with test endpoints.
- **Authentication**: Session-based authentication using Passport.js.
- **Real-time Communication**: Socket.IO is used for live updates, with shared event contracts and client-side hooks for event subscription and cache invalidation.
- **Database Schema**: Includes entities for users, workspaces, teams, clients, projects (with budgetMinutes), sections, tasks (with subtasks, tags, comments, multi-assignee support via task_assignees, estimateMinutes), personal_task_sections (for My Tasks organization), activity logs, time tracking, tenant_settings, and tenant_integrations.
- **Workload Forecast**: Project-level forecast analytics with budget tracking. Time entries use `durationSeconds` field converted to minutes for display. Forecast endpoints provide: tracked time (total and weekly), task estimates, budget remaining, due date forecast (6 buckets: overdue, today, next 7 days, next 30 days, later, no due date), and per-assignee workload with multi-assignee task estimates split evenly.
- **Production Bootstrap**: A secure one-time process for creating a super admin user in production environments.
- **Tenant Onboarding Flow**: A structured 4-step wizard for new tenants to configure their organization profile, branding, and email settings, transitioning from an inactive to an active state.
- **Flexible Tenant Invitations**: Super admins can invite tenant admins via "link" (copyable URL) or "email" (Mailgun-based delivery). Email invitations use the tenant's configured Mailgun integration with graceful fallback to link generation if email fails.
- **Bulk CSV User Import**: Super admins can import users in bulk via CSV file upload. The CSV supports columns: email, firstName, lastName, role (admin/employee). After import, invite links are generated for all users and can be copied individually or in bulk.
- **Tenant Pre-Provisioning**: Super users can fully configure tenants before any tenant admin accepts an invitation. This includes: (a) activating/suspending/deactivating tenants with dedicated endpoints, (b) using "Act as Tenant" mode via X-Tenant-Id header to access/create tenant data, (c) inviting users to inactive tenants, and (d) configuring settings/integrations before activation. The `activatedBySuperUserAt` timestamp tracks super user activations. Security: X-Tenant-Id header is only processed for verified super users on both frontend (localStorage dual-flag guard) and backend (middleware role check).
- **Frontend Structure**: Organized into `pages/` for route components and `components/` for reusable UI elements, with specialized components for task management, settings, and project views.
- **Backend Structure**: Modular routes, a `DatabaseStorage` class for CRUD, database connection, authentication, and real-time infrastructure. Middleware handles error handling, request validation, and authentication context.
- **Design Guidelines**: Adheres to a professional design, using Inter font for UI and JetBrains Mono for monospace, featuring a 3-column layout and dark mode support.

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar view for tasks.
- **Passport.js**: Session-based authentication.
- **Railway**: Deployment platform.
- **openssl**: Used for generating encryption keys.