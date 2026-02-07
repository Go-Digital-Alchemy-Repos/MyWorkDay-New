# Frontend Performance & Responsiveness Checklist

## React Query Configuration

### Global Defaults (`client/src/lib/queryClient.ts`)
- **staleTime**: 60 seconds default (prevents excessive refetching)
- **gcTime**: 5 minutes (keeps unused data in cache for quick return)
- **retry**: Up to 2 retries with exponential backoff; skips 401/403/404 errors
- **refetchOnWindowFocus**: Disabled to prevent unexpected refetches

### Per-Data-Type Stale Times (`STALE_TIMES` constants)
| Constant | Duration | Use Case |
|----------|----------|----------|
| `REALTIME` | 10s | Chat messages, presence, live data |
| `FAST` | 30s | Notifications, activity feeds |
| `STANDARD` | 60s | Tasks, projects, clients (default) |
| `SLOW` | 5min | Settings, templates, rarely-changing data |
| `STATIC` | 30min | Feature flags, tenant config |

### Query Key Conventions
- Use array-based keys for hierarchical data: `["/api/projects", projectId, "tasks"]`
- Never interpolate IDs into the first segment: avoid `` [`/api/projects/${id}`] ``
- This ensures `invalidateQueries({ queryKey: ["/api/projects"] })` cascades correctly

## Optimistic Updates

### Pattern (implemented in task-detail-drawer.tsx, use-create-task.ts)
```typescript
useMutation({
  mutationFn: async (data) => { /* API call */ },
  onMutate: async (data) => {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, optimisticValue);
    return { previous };
  },
  onError: (_err, _data, context) => {
    queryClient.setQueryData(queryKey, context.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey });
  },
});
```

### Currently Optimistic
- Task status changes (updates both `/api/tasks/my` and project tasks caches)
- Comment creation (temp ID with current user info, rolls back on error)
- Task creation (optimistic add to my-tasks list)
- Client creation (optimistic add to clients list)

## List Virtualization

### VirtualizedList Component (`client/src/components/ui/virtualized-list.tsx`)
- Built on `react-virtuoso` for windowed rendering
- Supports: custom item rendering, empty states, headers/footers, load-more, follow-output
- Applied to: Notification center (replaces ScrollArea with virtualized rendering)

### When to Virtualize
- Lists with 50+ items that cause scroll jank
- Avoid virtualizing: grid layouts, lists with complex scroll behavior (chat timeline), lists with <20 items

## Error Handling

### ErrorBoundary (`client/src/components/error-boundary.tsx`)
- Wraps all three main layout areas: TenantLayout, SuperAdminLayout, ClientPortalLayout
- Catches React render errors with "Try Again" recovery
- Supports custom fallback UI via `fallback` prop

### Standardized States (in `client/src/components/layout/`)
- `ErrorState`: Error display with retry button, request ID for admins
- `LoadingState`: Skeleton variants (page, card, table, list, detail)
- `EmptyState`: Empty content with icon, title, description, and action button

## Motion & Transitions

### Available Motion Primitives (`client/src/components/ui-system/motion.tsx`)
| Component | Use Case |
|-----------|----------|
| `MotionFade` | General fade-in content |
| `MotionSlide` | Directional slide (up/down/right) |
| `MotionPage` | Page-level transition (subtle fade + slide up) |
| `MotionDrawerContent` | Drawer content slide-in |
| `MotionList` + `MotionListItem` | Staggered list animations |
| `MotionScale` | Scale-in content |
| `MotionCheck` | Checkbox bounce feedback |

### Guidelines
- Sheets/Drawers already have built-in Radix animations; don't double-animate
- Use `MotionPage` for top-level page content fade-in
- Use `MotionList` + `MotionListItem` for lists that load with stagger
- Respect `prefers-reduced-motion` via `useReducedMotion()` hook
- Keep motion durations at 150-200ms (defined in design tokens)
