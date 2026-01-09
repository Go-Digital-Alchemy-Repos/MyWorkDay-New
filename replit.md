# DASANA - Project Management Application

## Overview
DASANA is a fully functional Asana-inspired project management application built with React, Express, and PostgreSQL. It features workspaces, teams, projects, sections, tasks with subtasks, tags, comments, and activity tracking.

## Current State
- **Status**: MVP Complete
- **Last Updated**: January 2026
- **Demo Mode**: Using hardcoded demo user ID (demo-user-id) and workspace ID (demo-workspace-id)

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, React Query (TanStack Query v5)
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter (frontend)
- **State Management**: React Query for server state

## Project Architecture

### Database Schema (shared/schema.ts)
- **users**: User accounts with email, name, avatar
- **workspaces**: Top-level organization unit
- **workspaceMembers**: User membership in workspaces (owner, admin, member, guest)
- **teams**: Groups within workspaces
- **teamMembers**: User membership in teams
- **projects**: Projects belong to workspaces, optionally to teams
- **projectMembers**: User roles in projects (admin, member, viewer)
- **sections**: Kanban columns within projects
- **tasks**: Main task entities with title, description, status, priority, dates
- **taskAssignees**: Many-to-many for task assignments
- **subtasks**: Checklist items within tasks
- **tags**: Colored labels for categorization
- **taskTags**: Many-to-many for task tagging
- **comments**: Discussion threads on tasks
- **activityLog**: Audit trail for changes

### Frontend Structure (client/src/)
- **pages/**: Route components (home.tsx, my-tasks.tsx, project.tsx)
- **components/**: Reusable UI components
  - app-sidebar.tsx: Navigation sidebar with workspace, projects, teams
  - task-card.tsx: Task display for list/board views
  - task-detail-drawer.tsx: Right panel for task editing
  - section-column.tsx: Board view columns
  - subtask-list.tsx: Subtask management
  - comment-thread.tsx: Task comments
  - create-task-dialog.tsx: Task creation form
  - Badge components: priority-badge, status-badge, due-date-badge, tag-badge
  - avatar-group.tsx: Assignee display

### Backend Structure (server/)
- **routes.ts**: API endpoints
- **storage.ts**: DatabaseStorage class with full CRUD operations
- **seed.ts**: Demo data seeding script
- **db.ts**: Database connection

## API Endpoints

### Workspaces
- GET /api/workspaces/current - Get current workspace

### Projects
- GET /api/projects - List projects
- GET /api/projects/:id - Get project
- POST /api/projects - Create project
- PATCH /api/projects/:id - Update project

### Sections
- GET /api/projects/:projectId/sections - List sections with tasks
- POST /api/sections - Create section
- PATCH /api/sections/:id - Update section
- DELETE /api/sections/:id - Delete section

### Tasks
- GET /api/tasks/my - Get tasks assigned to current user
- GET /api/projects/:projectId/tasks - List project tasks
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
- Board view as primary view with list view option
- My Tasks view with date-based grouping (overdue, today, tomorrow, upcoming)
