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
- **Multi-Tenancy**: Supports multi-tenancy with configurable enforcement levels (`off|soft|strict`).
- **Expanded Super Admin Dashboard**: Features tenant management, global reports, system settings, and system status.
- **System Settings Table**: Stores platform-wide defaults for branding and configuration.
- **White Label Branding**: Tenants can customize app appearance (app names, logos, favicons, colors, login messages).
- **Per-Tenant Integrations**: Tenants can configure their own Mailgun (email) and S3 (storage) integrations with encrypted secrets. Features include:
  - Secret masking in API responses (shows last 4 chars: `••••XXXX`)
  - Debug logging behind `MAILGUN_DEBUG=true` env flag
  - Real Mailgun domain validation via API on test
  - Send Test Email functionality with actual email delivery via Mailgun API
- **Authentication**: Session-based authentication using Passport.js with support for:
  - Email/password login with rate limiting
  - Google OAuth login (optional, configurable via environment variables)
  - Account linking: verified Google emails auto-link to existing accounts
  - First user bootstrap: first Google login creates Super Admin when no users exist
- **Rate Limiting**: IP and email-based brute-force protection for auth endpoints (login, bootstrap, invite accept). Configurable via env vars.
- **Email Observability**: Outbox logging for all emails with status tracking (queued/sent/failed), resend capability for failed invites/password resets, and admin visibility.
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
- **Tenant User Management (Super Admin)**: TenantUserDrawer component for managing individual tenant users with tabbed views:
  - Overview tab: User details, role, account status, activity timestamps
  - Invitation tab: View invitation status, regenerate invite links, resend invitation emails
  - Security tab: Reset user password with `mustChangePasswordOnNextLogin` flag enforcement
- **User Provisioning (Super Admin)**: Unified workflow for creating/updating tenant users with immediate access:
  - POST `/api/v1/super/tenants/:tenantId/users/provision` with two methods: SET_PASSWORD (immediate access) and RESET_LINK (send password reset URL)
  - ProvisionUserDrawer: 4-step wizard (User Info → Access Method → Review → Success)
  - Handles user creation, update, activation, password setting, and optional email notifications
  - Diagnostic logging via `SUPER_USER_PROVISION_DEBUG` environment flag
- **User Impersonation (Super Admin)**: Allows super admins to view the app as a tenant user:
  - POST `/api/v1/super/tenants/:tenantId/users/:userId/impersonate-login` to start
  - POST `/api/v1/super/impersonation/exit` to return to super admin view
  - GET `/api/v1/super/impersonation/status` to check current state
  - Stores impersonation context in session with audit logging
- **Password Security**: Users table includes `mustChangePasswordOnNextLogin` boolean field for forced password changes on next login
- **SaaS Agreement System**: Manages tenant SaaS agreements with an active/archived lifecycle, versioning, and user acceptance tracking, enforced by middleware. Supports global default agreements (tenantId = null) that apply to all tenants without specific overrides. Tenant-specific agreements take precedence over global defaults.
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
- **Time Tracking Reliability**: Timer hardening for cross-session/tab reliability:
  - GlobalActiveTimer component in header with persistent timer display
  - BroadcastChannel cross-tab sync with localStorage fallback
  - Periodic refetch (30s running, 60s paused) for convergence
  - Recovery toast on app boot when timer exists
  - Optimistic mutations with rollback on failure
  - 409 TIMER_ALREADY_RUNNING error handling prevents duplicate timers
  - Unique index on userId enforces single active timer per user
  - Server is source of truth; localStorage not used for timer state
- **Hierarchical S3 Storage**: 3-tier storage configuration with automatic fallback:
  - Resolution order: tenant-specific S3 (priority) → system-level S3 (fallback) → env vars (legacy)
  - System-level integrations stored in `tenant_integrations` table with NULL tenantId
  - Centralized storage provider resolver in `server/storage/getStorageProvider.ts`
  - Storage status API endpoints show active configuration source
  - All credentials encrypted using APP_ENCRYPTION_KEY

## External Dependencies
- **PostgreSQL**: Primary database.
- **Socket.IO**: Real-time communication.
- **FullCalendar**: Calendar view for tasks.
- **Passport.js**: Session-based authentication.
- **Railway**: Deployment platform.

## Security Configuration

### Encryption for Secrets Storage
The application uses AES-256-GCM encryption for storing sensitive integration secrets (API keys, credentials) in the database.

**Required Environment Variable:**
- `APP_ENCRYPTION_KEY`: A 32-byte base64-encoded key used for encrypting/decrypting secrets

**Generate Key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Features:**
- Secrets are encrypted before database storage
- API responses mask secrets (show last 4 chars: `••••XXXX`)
- Encryption status visible in Super Admin System Health
- Warning banner shown in Integrations UI when key not configured

### Required Environment Variables for Production
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Session signing secret |
| `APP_ENCRYPTION_KEY` | Yes | 32-byte base64 key for secrets encryption |
| `NODE_ENV` | Recommended | Set to `production` for secure cookies |
| `TRUST_PROXY` | Recommended | Set to `true` for Railway/reverse proxy setups |
| `GOOGLE_CLIENT_ID` | Optional | For Google OAuth login |
| `GOOGLE_CLIENT_SECRET` | Optional | For Google OAuth login |