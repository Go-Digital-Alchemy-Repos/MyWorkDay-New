# Client - MyWorkDay Frontend

## Overview

React 18 single-page application with TypeScript, Tailwind CSS, and shadcn/ui components.

## Directory Structure

```
client/
├── src/
│   ├── main.tsx              # Application entry point
│   ├── App.tsx               # Root component with routing
│   ├── index.css             # Global styles, Tailwind config
│   ├── pages/                # Route components
│   │   ├── login.tsx         # Authentication
│   │   ├── home.tsx          # Dashboard
│   │   ├── project.tsx       # Project board/list/calendar views
│   │   ├── my-tasks.tsx      # Personal tasks view
│   │   ├── clients.tsx       # CRM client list
│   │   ├── client-detail.tsx # Individual client
│   │   ├── time-tracking.tsx # Time entries and timer
│   │   ├── settings.tsx      # Tenant settings
│   │   ├── super-admin.tsx   # Super admin dashboard
│   │   ├── tenant-onboarding.tsx # New tenant setup
│   │   ├── account.tsx       # User account settings
│   │   ├── user-profile.tsx  # Public user profile
│   │   └── not-found.tsx     # 404 page
│   ├── components/           # Reusable components
│   │   ├── ui/               # shadcn/ui primitives
│   │   ├── app-sidebar.tsx   # Main navigation
│   │   ├── task-detail-drawer.tsx # Task editing
│   │   ├── task-card.tsx     # Task display in boards
│   │   ├── sortable-task-card.tsx # Drag-and-drop task
│   │   ├── subtask-list.tsx  # Subtask management
│   │   ├── comment-thread.tsx # Task comments
│   │   ├── attachment-uploader.tsx # File uploads
│   │   ├── project-calendar.tsx # FullCalendar view
│   │   ├── client-drawer.tsx # Client editing
│   │   ├── time-entry-drawer.tsx # Time entry editing
│   │   ├── multi-select-assignees.tsx # User picker
│   │   ├── settings/         # Settings tab components
│   │   └── super-admin/      # Super admin components
│   ├── hooks/                # Custom React hooks
│   │   ├── use-toast.tsx     # Toast notifications
│   │   └── use-mobile.tsx    # Responsive detection
│   └── lib/                  # Utilities
│       ├── queryClient.ts    # TanStack Query setup
│       ├── utils.ts          # Helper functions
│       └── socket.ts         # Socket.IO client
├── index.html                # HTML template
└── vite.config.ts            # Vite configuration
```

## Routing

Uses [Wouter](https://github.com/molefrog/wouter) for client-side routing:

```tsx
import { Route, Switch } from "wouter";

<Switch>
  <Route path="/" component={Home} />
  <Route path="/project/:id" component={Project} />
  <Route component={NotFound} />
</Switch>
```

## Data Fetching

Uses TanStack Query (React Query v5):

```tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

// Fetching data
const { data, isLoading, error } = useQuery({
  queryKey: ["/api/tasks", taskId],
  // queryFn is configured globally
});

// Mutations
const mutation = useMutation({
  mutationFn: (data) => apiRequest("POST", "/api/tasks", data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  },
});
```

### Query Key Patterns

- List queries: `["/api/resource"]`
- Detail queries: `["/api/resource", id]`
- Filtered queries: `["/api/resource", { filter: value }]`

## State Management

- **Server State**: TanStack Query
- **Local State**: React useState/useReducer
- **Theme**: Context via ThemeProvider

No Redux or global state library needed.

## Component Patterns

### Drawer Components

Full-screen mobile-friendly modals:

```tsx
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";

<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent>
    {/* Content */}
  </SheetContent>
</Sheet>
```

### Form Components

Uses react-hook-form with Zod validation:

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema } from "@shared/schema";

const form = useForm({
  resolver: zodResolver(insertTaskSchema),
  defaultValues: { title: "" },
});
```

### Drag and Drop

Uses @dnd-kit for sortable interfaces:

```tsx
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={items} strategy={verticalListSortingStrategy}>
    {items.map(item => <SortableItem key={item.id} item={item} />)}
  </SortableContext>
</DndContext>
```

## Role-Based Navigation

Navigation items are filtered by role:

```tsx
const user = useUser();
const isSuperUser = user?.role === "super_user";
const isAdmin = user?.role === "admin" || isSuperUser;

// Show admin-only items
{isAdmin && <AdminMenuItem />}
```

## Real-time Updates

Socket.IO client for live updates:

```tsx
import { useSocket } from "@/lib/socket";

useEffect(() => {
  const socket = getSocket();
  socket.on("task:updated", (task) => {
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  });
  return () => socket.off("task:updated");
}, []);
```

## Styling

### Tailwind CSS

All styling via utility classes:

```tsx
<div className="flex items-center gap-2 p-4 bg-card rounded-lg">
```

### Theme Variables

CSS custom properties for theming:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  /* ... */
}

.dark {
  --background: 222 47% 11%;
  --foreground: 0 0% 100%;
}
```

### Design Guidelines

See `/design_guidelines.md` for complete design system.

## Environment Variables

Frontend env vars must be prefixed with `VITE_`:

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

## Building

```bash
npm run build     # Production build
npm run dev       # Development server
```

Output goes to `dist/` directory.
