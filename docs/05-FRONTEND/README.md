# Frontend

**Status:** Current  
**Last Updated:** January 2026

This section covers the React frontend architecture, components, and patterns.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [COMPONENT_LIBRARY.md](./COMPONENT_LIBRARY.md) | shadcn/ui components |
| [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) | React Query patterns |
| [ROUTING.md](./ROUTING.md) | Wouter routing setup |
| [FORMS.md](./FORMS.md) | Form handling patterns |
| [REAL_TIME_CLIENT.md](./REAL_TIME_CLIENT.md) | Socket.IO client |
| [THEME_SYSTEM.md](./THEME_SYSTEM.md) | Dark mode and theming |
| [UI_PATTERNS.md](./UI_PATTERNS.md) | Common UI patterns |

---

## Project Structure

```
client/src/
├── components/           # Reusable components
│   ├── ui/               # shadcn/ui primitives
│   ├── settings/         # Settings tab components
│   ├── super-admin/      # Super admin components
│   └── common/           # Shared components
├── pages/                # Page components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities
│   ├── auth.tsx          # Auth context
│   ├── queryClient.ts    # TanStack Query setup
│   └── utils.ts          # Helper functions
└── App.tsx               # Root component
```

---

## Key Components

### Pages

| Page | Path | Description |
|------|------|-------------|
| `home.tsx` | `/` | Dashboard |
| `project.tsx` | `/project/:id` | Project board |
| `my-tasks.tsx` | `/my-tasks` | Personal tasks |
| `time-tracking.tsx` | `/time-tracking` | Time tracker |
| `clients.tsx` | `/clients` | Client list |
| `settings.tsx` | `/settings` | Settings tabs |
| `super-admin.tsx` | `/super-admin` | Tenant management |

### Core Components

| Component | Purpose |
|-----------|---------|
| `app-sidebar.tsx` | Main navigation sidebar |
| `tenant-sidebar.tsx` | Tenant-mode sidebar |
| `super-sidebar.tsx` | Super admin sidebar |
| `global-active-timer.tsx` | Persistent timer display |
| `tenant-context-gate.tsx` | Tenant validation wrapper |

### Drawer Components

| Component | Purpose |
|-----------|---------|
| `task-detail-drawer.tsx` | Task editing |
| `project-detail-drawer.tsx` | Project details |
| `client-drawer.tsx` | Client editing |
| `time-entry-drawer.tsx` | Time entry editing |
| `tenant-drawer.tsx` | Tenant management |

---

## State Management

### TanStack Query

All server state is managed with TanStack Query:

```typescript
// Fetching data
const { data, isLoading } = useQuery({
  queryKey: ['/api/projects'],
});

// Mutations
const mutation = useMutation({
  mutationFn: (data) => apiRequest('/api/projects', 'POST', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
  },
});
```

### Query Key Patterns

```typescript
// List endpoints
queryKey: ['/api/projects']

// Single resource with ID
queryKey: ['/api/projects', projectId]

// Nested resources
queryKey: ['/api/projects', projectId, 'tasks']
```

---

## Common Patterns

### Form Handling

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const form = useForm({
  resolver: zodResolver(insertProjectSchema),
  defaultValues: { name: '', description: '' },
});
```

### Protected Routes

```typescript
<Route path="/settings">
  {user?.role === 'admin' ? <Settings /> : <NotFound />}
</Route>
```

### Drawer Pattern

```typescript
const [drawerOpen, setDrawerOpen] = useState(false);
const [selectedId, setSelectedId] = useState<string | null>(null);

<Button onClick={() => { setSelectedId(id); setDrawerOpen(true); }}>
  Edit
</Button>

<DetailDrawer
  open={drawerOpen}
  onOpenChange={setDrawerOpen}
  itemId={selectedId}
/>
```

---

## Styling

### Tailwind CSS

All styling uses Tailwind CSS utility classes:

```tsx
<div className="flex items-center gap-2 p-4 bg-card rounded-lg border">
  <span className="text-sm text-muted-foreground">Label</span>
</div>
```

### Dark Mode

Components automatically adapt using CSS variables:

```tsx
<div className="bg-background text-foreground">
  {/* Automatically switches for dark mode */}
</div>
```

---

## Related Sections

- [02-ARCHITECTURE](../02-ARCHITECTURE/) - System design
- [04-API](../04-API/) - Backend endpoints
- [11-DEVELOPMENT](../11-DEVELOPMENT/) - Coding standards
