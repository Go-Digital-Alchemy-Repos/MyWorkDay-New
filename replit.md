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
- **Multi-Tenancy**: Supports multi-tenancy with configurable enforcement levels (`off|soft|strict`).
- **Expanded Super Admin Dashboard**: Features tenant management, global reports, system settings, and system status.
- **System Settings Table**: Stores platform-wide defaults for branding and configuration.
- **White Label Branding**: Tenants can customize app appearance (app names, logos, favicons, colors, login messages).
- **Per-Tenant Integrations**: Tenants can configure their own Mailgun (email) and S3 (storage) integrations with encrypted secrets. Features include:
  - Secret masking in API responses (shows last 4 chars: `••••XXXX`)
  - Debug logging behind `MAILGUN_DEBUG=true` env flag
  - Real Mailgun domain validation via API on test
  - Send Test Email functionality with actual email delivery via Mailgun API
- **Authentication**: Session-based authentication using Passport.js.
- **Real-time Communication**: Socket.IO for live updates.
- **Database Schema**: Includes entities for users, workspaces, teams, clients, projects, tasks, activity logs, time tracking, tenant settings, and integrations.
- **Workload Forecast**: Project-level analytics with budget tracking and assignee workload distribution.
- **Production Bootstrap**: Secure one-time super admin creation or first-user registration.
- **Data Purge**: Controlled script and API endpoint for deleting all application data with multiple safety guards.
- **Tenant Onboarding Flow**: Structured 4-step wizard for new tenants.
- **Flexible Tenant Invitations**: Super admins can invite tenant admins via link or email.
- **Bulk CSV User Import**: Super admins can import users in bulk via CSV.
- **Tenant Pre-Provisioning**: Super users can fully configure tenants before activation, including "Act as Tenant" mode using `X-Tenant-Id` header.
- **Super Admin Navigation Isolation**: Separate navigation for Super Mode and Tenant Impersonation Mode.
- **Tenant Drawer (Super Admin)**: Comprehensive drawer-based UI for tenant management including overview, onboarding, workspaces, users, and branding. Tenant creation is transactional.
- **SaaS Agreement System**: Manages tenant SaaS agreements with an active/archived lifecycle, versioning, and user acceptance tracking, enforced by middleware.
- **Frontend Structure**: Organized into `pages/` and `components/`, utilizing FullScreenDrawer for entity editing with unsaved changes guards.
- **Backend Structure**: Modular routes, `DatabaseStorage` class, middleware for error handling, validation, and authentication.
- **Design Guidelines**: Professional design with Inter font, 3-column layout, and dark mode support.
- **API Error Handling**: Standardized error envelope with stable error codes and request ID correlation.
- **Tenant Data Health Remediation**: Tools for backfilling missing `tenantId` values, quarantine management, and data integrity checks.
- **Performance Optimizations**: N+1 query fixes and query debugging utilities.
- **Navigation Mode Hardening**: Enhanced super/tenant mode switching with:
  - `useAppMode` hook with tenant validation on impersonation restoration
  - `isModeTransitioning` state for UI transition handling
  - Cache isolation utilities (`clearTenantScopedCaches`, `validateTenantExists`)
  - Tenant-scoped query prefix constants for selective invalidation
  - Route guards (SuperRouteGuard, TenantRouteGuard) for access control

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar view for tasks.
- **Passport.js**: Session-based authentication.
- **Railway**: Deployment platform.
- **openssl**: Used for generating encryption keys.