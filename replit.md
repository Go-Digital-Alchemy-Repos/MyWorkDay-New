# MyWorkDay - Project Management Application

## Overview
MyWorkDay is an Asana-inspired project management application designed to streamline project workflows and enhance team collaboration. It provides comprehensive tools for organizing projects, teams, and clients, featuring workspaces, tasks with subtasks, tags, comments, and activity tracking. The application aims to be a robust solution for managing diverse project needs and improving productivity.

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- Calendar view displays tasks with due dates using FullCalendar, with filtering and drag-to-reschedule
- My Tasks view with date-based grouping (overdue, today, tomorrow, upcoming)

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
- **Database Schema**: Includes entities for users, workspaces, teams, clients, projects, sections, tasks (with subtasks, tags, comments), activity logs, time tracking, tenant_settings, and tenant_integrations.
- **Production Bootstrap**: A secure one-time process for creating a super admin user in production environments.
- **Tenant Onboarding Flow**: A structured 4-step wizard for new tenants to configure their organization profile, branding, and email settings, transitioning from an inactive to an active state.
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