# Command Palette

## Overview

The Command Palette provides quick access to navigation, search, and actions via a global keyboard shortcut (Cmd/Ctrl+K). It follows the familiar pattern from tools like VS Code, Slack, and Notion.

## Keyboard Shortcut

| Platform | Shortcut |
|----------|----------|
| macOS | `⌘ + K` |
| Windows/Linux | `Ctrl + K` |

---

## Installation

The CommandPalette is already integrated at the app root level in `App.tsx`.

```tsx
import { CommandPalette } from "@/components/command-palette";

// In your app layout
<CommandPalette
  onNewTask={() => setLocation("/my-tasks")}
  onNewProject={() => setLocation("/projects")}
  onStartTimer={() => setLocation("/my-time")}
/>
```

---

## Props

| Prop | Type | Description |
|------|------|-------------|
| `onNewTask` | `() => void` | Handler for "Create Task" action |
| `onNewProject` | `() => void` | Handler for "Create Project" action |
| `onNewClient` | `() => void` | Handler for "Add Client" action |
| `onStartTimer` | `() => void` | Handler for "Start Timer" action |

---

## Capabilities

### Quick Actions

When action handlers are provided, the palette shows quick actions:

- **Create Task** - Navigates to task creation
- **Create Project** - Navigates to project creation
- **Add Client** - Opens client creation
- **Start Timer** - Navigates to time tracking

### Navigation

Direct navigation to all main pages:

| Command | Destination | Keywords |
|---------|-------------|----------|
| Home | `/` | dashboard |
| My Tasks | `/my-tasks` | todo, assigned |
| Projects | `/projects` | - |
| Clients | `/clients` | accounts, customers |
| Time Tracking | `/time-tracking` | timer, hours |
| My Time | `/my-time` | timesheet |
| Calendar | `/calendar` | schedule, dates |
| My Calendar | `/my-calendar` | - |
| Chat | `/chat` | messages, slack |
| Reports | `/reports` | analytics, metrics |
| Templates | `/templates` | project templates |
| Settings | `/settings` | preferences, config |
| Profile | `/profile` | account |

### Search

When typing in the search field, the palette searches:

- **Projects** - By name, navigates to project detail
- **Clients** - By name, navigates to client detail

Search results appear below navigation items and show the item type.

---

## Architecture

```
client/src/components/command-palette/
├── index.ts              # Barrel export
└── CommandPalette.tsx    # Main component
```

### Key Implementation Details

1. **Global Keyboard Listener**: Registered on mount, cleaned up on unmount
2. **Lazy Search**: Projects and clients only fetched when palette is open AND user types
3. **Uses shadcn/ui Command**: Built on `cmdk` library via shadcn components
4. **Keywords Support**: Navigation items have keyword arrays for fuzzy matching

---

## Usage Flow

1. User presses `Cmd/Ctrl + K`
2. Command dialog opens with search input focused
3. User can:
   - Type to filter navigation items
   - Type to search projects/clients
   - Use arrow keys to navigate
   - Press Enter to select
   - Press Escape to close
4. Selection triggers navigation or action
5. Dialog closes automatically

---

## Customization

### Adding Navigation Items

Edit the `navigationItems` array in `CommandPalette.tsx`:

```tsx
const navigationItems: NavigationItem[] = [
  // Existing items...
  {
    id: "new-feature",
    label: "New Feature",
    path: "/new-feature",
    icon: Star,
    keywords: ["keyword1", "keyword2"],
  },
];
```

### Adding Quick Actions

Pass additional handlers:

```tsx
<CommandPalette
  onNewTask={handleNewTask}
  onNewProject={handleNewProject}
  onNewClient={handleNewClient}
  onStartTimer={handleStartTimer}
/>
```

### Adding Search Types

Extend the `searchableItems` array to include more entity types:

```tsx
const searchableItems: SearchableItem[] = [
  ...projectItems,
  ...clientItems,
  // Add new types
  ...(tasks?.map((t) => ({
    id: `task-${t.id}`,
    type: "task" as const,
    label: t.title,
    path: `/my-tasks?task=${t.id}`,
    subtitle: "Task",
  })) || []),
];
```

---

## Accessibility

- **Focus Management**: Search input auto-focused on open
- **Keyboard Navigation**: Full arrow key support
- **Screen Reader**: ARIA labels via cmdk library
- **Escape to Close**: Standard dialog behavior

---

## Best Practices

### DO
- Keep quick actions relevant and frequently used
- Use descriptive keywords for navigation items
- Limit search results to prevent overwhelming users
- Clear search on close for fresh start

### DON'T
- Add too many quick actions (keep it under 5)
- Search for entities the user can't access
- Block the main thread with expensive searches
- Forget to handle loading states

---

## Future Enhancements

- [ ] Recent items section
- [ ] Task search
- [ ] Chat message search
- [ ] User @mention search
- [ ] Keyboard shortcut hints
- [ ] Fuzzy matching improvements
