# DASANA - Project Management Application

## Overview
DASANA is a fully functional Asana-inspired project management application built with React, Express, and PostgreSQL. It features workspaces, teams, clients (CRM module), projects, sections, tasks with subtasks, tags, comments, and activity tracking.

## Current State
- **Status**: MVP Complete with Authentication
- **Last Updated**: January 2026
- **Authentication**: Session-based login with Passport.js (Local Strategy)

### Login Credentials (Seeded)
- **Admin**: admin@dasana.com / admin123
- **Employee**: sarah@dasana.com / password123  
- **Client**: client@example.com / password123

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query (TanStack Query v5), FullCalendar
- **Backend**: Express.js, TypeScript, Socket.IO
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend)
- **State Management**: React Query for server state
- **Real-time**: Socket.IO for live updates across connected clients

## Project Architecture

### Database Schema (shared/schema.ts)
- **users**: User accounts with email, name, avatar, role (admin/employee/client), firstName, lastName, isActive
- **workspaces**: Top-level organization unit
- **workspaceMembers**: User membership in workspaces (owner, admin, member, guest)
- **teams**: Groups within workspaces
- **teamMembers**: User membership in teams
- **clients**: CRM module - company/organization records with address, industry, status
- **clientContacts**: Contacts associated with clients (name, email, phone, title)
- **clientInvites**: Placeholder for future client portal invites
- **projects**: Projects belong to workspaces, optionally to teams and clients (via clientId)
- **projectMembers**: User roles in projects (admin, member, viewer)
- **sections**: Kanban columns within projects
- **tasks**: Main task entities with title, description, status, priority, dates
- **taskAssignees**: Many-to-many for task assignments
- **subtasks**: Checklist items within tasks
- **tags**: Colored labels for categorization
- **taskTags**: Many-to-many for task tagging
- **comments**: Discussion threads on tasks
- **activityLog**: Audit trail for changes
- **timeEntries**: Time tracking entries with duration, scope, client/project/task references
- **activeTimers**: Currently running timers (one per user, enforced by unique index)

#### User Management & Auth Tables (NEW)
- **invitations**: User onboarding with token-based invites (pending/accepted/expired/revoked status)
- **clientUserAccess**: Grants client portal users access to specific clients (viewer/collaborator level)
- **appSettings**: Encrypted global settings storage (e.g., Mailgun API config) per workspace
- **commentMentions**: Tracks @mentions in task comments for notification purposes

#### User Roles (UserRole enum)
- **admin**: Full workspace access, can manage users and global settings
- **employee**: Standard org member with normal project/task access
- **client**: Restricted to assigned clients only via clientUserAccess table

### Frontend Structure (client/src/)
- **pages/**: Route components (home.tsx, my-tasks.tsx, project.tsx, clients.tsx, client-detail.tsx, time-tracking.tsx)
- **components/**: Reusable UI components
  - app-sidebar.tsx: Navigation sidebar with workspace, projects, teams, clients, time tracking
  - task-card.tsx: Task display for list/board views
  - task-detail-drawer.tsx: Right panel for task editing
  - section-column.tsx: Board view columns
  - subtask-list.tsx: Subtask management
  - comment-thread.tsx: Task comments
  - create-task-dialog.tsx: Task creation form
  - Badge components: priority-badge, status-badge, due-date-badge, tag-badge
  - avatar-group.tsx: Assignee display
  - project-calendar.tsx: FullCalendar integration with filtering and drag-to-reschedule
  - project-settings-sheet.tsx: Project settings including client assignment/unassignment

### Backend Structure (server/)
- **routes.ts**: API endpoints with real-time event emissions
- **storage.ts**: DatabaseStorage class with full CRUD operations
- **seed.ts**: Demo data seeding script
- **db.ts**: Database connection
- **realtime/**: Socket.IO infrastructure
  - socket.ts: Socket.IO server initialization and room management
  - events.ts: Centralized event emitters (ALL socket emissions go through this module)

### Real-time Architecture (shared/events/, client/src/lib/realtime/)
- **shared/events/index.ts**: Type-safe event contracts shared between server and client
- **client/src/lib/realtime/**: Client-side Socket.IO utilities
  - socket.ts: Socket singleton with automatic reconnection
  - hooks.ts: React hooks (useProjectSocket, useSocketEvent) for subscribing to events
  - index.ts: Barrel exports

### Real-time Event Flow
1. Client joins project/client/workspace rooms via room:join events
2. Server emits events after successful DB operations (never before commit)
3. Client hooks invalidate React Query cache to trigger refetch
4. Events: project:*, section:*, task:*, subtask:*, attachment:*, client:*, project:clientAssigned, timer:*, timeEntry:*

## API Endpoints

### Workspaces
- GET /api/workspaces/current - Get current workspace

### Projects
- GET /api/projects - List projects
- GET /api/projects/:id - Get project
- GET /api/projects/unassigned - List projects not assigned to any client (supports ?search= param)
- POST /api/projects - Create project
- PATCH /api/projects/:id - Update project
- PATCH /api/projects/:projectId/client - Assign/unassign client to project (body: {clientId: string | null})

### Sections
- GET /api/projects/:projectId/sections - List sections with tasks
- POST /api/sections - Create section
- PATCH /api/sections/:id - Update section
- DELETE /api/sections/:id - Delete section

### Tasks
- GET /api/tasks/my - Get tasks assigned to current user
- GET /api/projects/:projectId/tasks - List project tasks
- GET /api/projects/:projectId/calendar-events - Get tasks for calendar view (supports start/end date range, includeSubtasks toggle)
- GET /api/tasks/:id - Get task with relations
- POST /api/tasks - Create task
- PATCH /api/tasks/:id - Update task
- DELETE /api/tasks/:id - Delete task
- POST /api/tasks/:id/move - Move task between sections

### Subtasks
- GET /api/tasks/:taskId/subtasks - List subtasks
- POST /api/tasks/:taskId/subtasks - Create subtask
- PATCH /api/subtasks/:id - Update subtask
- DELETE /api/subtasks/:id - Delete subtask

### Tags
- GET /api/workspaces/:workspaceId/tags - List tags
- POST /api/workspaces/:workspaceId/tags - Create tag
- POST /api/tasks/:taskId/tags - Add tag to task
- DELETE /api/tasks/:taskId/tags/:tagId - Remove tag

### Comments
- GET /api/tasks/:taskId/comments - List comments
- POST /api/tasks/:taskId/comments - Create comment
- PATCH /api/comments/:id - Update comment
- DELETE /api/comments/:id - Delete comment

### Clients (CRM Module)
- GET /api/clients - List clients in workspace
- GET /api/clients/:id - Get client with contacts and projects
- POST /api/clients - Create client
- PATCH /api/clients/:id - Update client
- DELETE /api/clients/:id - Delete client

### Client Contacts
- GET /api/clients/:clientId/contacts - List contacts
- POST /api/clients/:clientId/contacts - Create contact
- PATCH /api/clients/:clientId/contacts/:contactId - Update contact
- DELETE /api/clients/:clientId/contacts/:contactId - Delete contact

### Client Invites (Placeholder)
- GET /api/clients/:clientId/invites - List invites
- POST /api/clients/:clientId/invites - Create invite
- DELETE /api/clients/:clientId/invites/:inviteId - Delete invite

### Client Projects
- GET /api/clients/:clientId/projects - List projects linked to client
- POST /api/clients/:clientId/projects - Create a new project linked to client

### Time Tracking (Timer)
- GET /api/timer/current - Get current user's active timer (or null)
- POST /api/timer/start - Start a new timer (body: {clientId?, projectId?, taskId?, description?})
- POST /api/timer/pause - Pause the active timer
- POST /api/timer/resume - Resume a paused timer
- POST /api/timer/stop - Stop timer and optionally save entry (body: {discard?, scope?, description?})
- PATCH /api/timer/current - Update active timer (body: {clientId?, projectId?, taskId?, description?})

### Time Entries
- GET /api/time-entries - List time entries (supports ?startDate, ?endDate, ?clientId, ?projectId filters)
- POST /api/time-entries - Create manual time entry
- PATCH /api/time-entries/:id - Update time entry
- DELETE /api/time-entries/:id - Delete time entry
- GET /api/time-entries/summary - Get time summary for reporting (supports date and groupBy filters)

## Design Guidelines
Following design_guidelines.md with:
- Inter font for UI, JetBrains Mono for monospace
- 3-column layout: 256px sidebar, flexible main content, 480px detail drawer
- Dark mode support via ThemeProvider
- Consistent spacing and color tokens

## Running the Project
- `npm run dev` - Start development server (frontend + backend on port 5000)
- `npm run db:push` - Push database schema changes
- `npx tsx server/seed.ts` - Seed demo data

## User Preferences
- Professional, clean Asana-like design
- Board view as primary view with list view and calendar view options
- Calendar view displays tasks with due dates using FullCalendar, with filtering and drag-to-reschedule
- My Tasks view with date-based grouping (overdue, today, tomorrow, upcoming)
