# Client Features

Feature-based organization for the MyWorkDay frontend application.

## Overview

This directory contains feature modules extracted from the components directory. Each feature groups related components, drawers, and forms that work together.

## Structure

```
features/
├── clients/           # Client management
│   ├── client-drawer.tsx
│   ├── division-drawer.tsx
│   └── index.ts
├── projects/          # Project management
│   ├── create-project-dialog.tsx
│   ├── project-activity-feed.tsx
│   ├── project-calendar.tsx
│   ├── project-detail-drawer.tsx
│   ├── project-drawer.tsx
│   ├── project-settings-sheet.tsx
│   └── index.ts
├── tasks/             # Task management
│   ├── child-task-list.tsx
│   ├── create-task-dialog.tsx
│   ├── section-column.tsx
│   ├── sortable-task-card.tsx
│   ├── subtask-detail-drawer.tsx
│   ├── subtask-list.tsx
│   ├── task-card.tsx
│   ├── task-create-drawer.tsx
│   ├── task-detail-drawer.tsx
│   ├── task-selector-with-create.tsx
│   └── index.ts
├── teams/             # Team management
│   ├── team-drawer.tsx
│   └── index.ts
├── timer/             # Time tracking
│   ├── global-active-timer.tsx
│   ├── start-timer-drawer.tsx
│   └── index.ts
└── index.ts           # Barrel export
```

## Usage

Import from feature barrels:

```tsx
// Import from specific feature
import { ClientDrawer, DivisionDrawer } from "@/features/clients";
import { TaskCard, TaskDetailDrawer } from "@/features/tasks";
import { StartTimerDrawer } from "@/features/timer";

// Or import from main barrel
import { ClientDrawer, TaskCard, StartTimerDrawer } from "@/features";
```

## Design Principles

1. **Co-location**: Related components live together
2. **Barrel Exports**: Each feature has an index.ts for clean imports
3. **Internal References**: Components within a feature use relative imports
4. **Cross-feature References**: Use `@/features/{feature}` for cross-feature imports
5. **UI Components**: Base UI components remain in `@/components/ui/`
6. **Shared Utilities**: Hooks, contexts, and lib stay in their existing locations

## What Stays in /components

- `ui/` - shadcn base components (Button, Card, etc.)
- Truly shared components used across many features
- Layout components (sidebars, navigation)
- Utility components (badges, avatars, etc.)
