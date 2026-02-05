# DetailDrawer Pattern

## Overview

The DetailDrawer pattern provides a consistent slide-over panel experience for viewing and editing entity details across the application. This pattern replaces traditional modals with a more spacious, accessible interface that maintains context with the main view.

## Core Principles

1. **Slide from Right**: All detail drawers slide in from the right side
2. **Preserve Context**: The main view remains visible and partially interactive
3. **Tab-Based Organization**: Complex content organized into logical tabs
4. **Unsaved Changes Protection**: Prompt users before discarding edits
5. **Consistent Layout**: Standard header, scrollable content, sticky footer

---

## Component Location

```tsx
import { DetailDrawer, type DetailDrawerTab } from "@/components/ui-system";
```

---

## Standard Structure

### Basic Usage

```tsx
<DetailDrawer
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Task Details"
  description="View and edit task information"
  size="lg"
>
  {/* Content */}
</DetailDrawer>
```

### With Tabs

```tsx
const tabs: DetailDrawerTab[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <Info className="h-4 w-4" />,
    content: <OverviewPanel />,
  },
  {
    id: "comments",
    label: "Comments",
    icon: <MessageSquare className="h-4 w-4" />,
    badge: comments.length,
    content: <CommentsPanel />,
  },
  {
    id: "activity",
    label: "Activity",
    icon: <Activity className="h-4 w-4" />,
    content: <ActivityPanel />,
  },
];

<DetailDrawer
  open={isOpen}
  onOpenChange={setIsOpen}
  title={task.title}
  subtitle={<StatusBadge status={task.status} />}
  tabs={tabs}
  defaultTab="overview"
  onTabChange={(tab) => console.log("Tab changed:", tab)}
  headerActions={
    <Button variant="outline" size="sm">
      <Pencil className="h-4 w-4 mr-1" />
      Edit
    </Button>
  }
  size="wide"
/>
```

### With Unsaved Changes Protection

```tsx
<DetailDrawer
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Edit Client"
  hasUnsavedChanges={form.formState.isDirty}
  onConfirmClose={() => form.reset()}
  footer={
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button onClick={handleSave} disabled={!form.formState.isDirty}>
        Save Changes
      </Button>
    </div>
  }
>
  <ClientForm form={form} />
</DetailDrawer>
```

### With Back Navigation

```tsx
<DetailDrawer
  open={isOpen}
  onOpenChange={setIsOpen}
  title={subtask.title}
  onBack={() => openParentTask()}
  backLabel="Back to Task"
>
  <SubtaskDetails subtask={subtask} />
</DetailDrawer>
```

---

## Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | required | Controls drawer visibility |
| `onOpenChange` | `(open: boolean) => void` | required | Handler for open state changes |
| `title` | `string` | required | Drawer title |
| `description` | `string` | - | Optional subtitle text |
| `subtitle` | `ReactNode` | - | Custom element beside title (e.g., badge) |
| `headerActions` | `ReactNode` | - | Buttons in header right side |
| `children` | `ReactNode` | - | Content (used when no tabs) |
| `tabs` | `DetailDrawerTab[]` | - | Tab configuration |
| `defaultTab` | `string` | first tab | Initial active tab |
| `onTabChange` | `(tabId: string) => void` | - | Tab change handler |
| `footer` | `ReactNode` | - | Sticky footer content |
| `side` | `"left" \| "right"` | `"right"` | Slide direction |
| `size` | `"sm" \| "md" \| "lg" \| "xl" \| "2xl" \| "wide" \| "full"` | `"lg"` | Drawer width |
| `hasUnsavedChanges` | `boolean` | `false` | Enable discard confirmation |
| `onConfirmClose` | `() => void` | - | Called when discarding changes |
| `onBack` | `() => void` | - | Shows back button when set |
| `backLabel` | `string` | `"Back"` | Custom back button label |

---

## Size Reference

| Size | Width | Use Case |
|------|-------|----------|
| `sm` | 384px | Simple forms, confirmations |
| `md` | 448px | Standard forms |
| `lg` | 512px | Detail views with moderate content |
| `xl` | 576px | Rich detail views |
| `2xl` | 672px | Complex multi-section content |
| `wide` | 80vw (min 600px) | Data-heavy views with charts |
| `full` | 90vw | Full document/spreadsheet views |

---

## Entity-Specific Implementations

### TaskDetailDrawer
**Location**: `client/src/features/tasks/task-detail-drawer.tsx`
**Size**: `lg` to `xl`
**Tabs**: Details, Subtasks, Comments, Activity, Attachments

### SubtaskDetailDrawer
**Location**: `client/src/features/tasks/subtask-detail-drawer.tsx`
**Size**: `lg`
**Features**: Back button to parent task

### ClientDrawer
**Location**: `client/src/features/clients/client-drawer.tsx`
**Size**: `xl`
**Features**: Create/Edit modes, form validation

### ProjectDetailDrawer
**Location**: `client/src/features/projects/project-detail-drawer.tsx`
**Size**: `wide`
**Tabs**: Overview, Tasks, Insights, Forecast, Settings

---

## Animation

All drawers use consistent slide animation:
- **Entry**: Slide in from right (300ms ease-out)
- **Exit**: Slide out to right (200ms ease-in)
- **Overlay**: Fade in/out with semi-transparent background

---

## Accessibility

- Focus trapped within drawer when open
- Escape key closes drawer (with unsaved changes check)
- Body scroll locked when open
- Proper ARIA roles and labels
- Tab navigation within content

---

## Best Practices

### DO
- Use tabs for content organization when there are 3+ sections
- Include loading skeletons for async content
- Show unsaved changes indicator in header
- Use descriptive titles that identify the entity
- Include relevant actions in header

### DON'T
- Nest drawers more than 2 levels deep
- Use drawers for simple confirmations (use AlertDialog)
- Put critical actions only in footer (also in header)
- Open drawer without loading state for async data

---

## Migration Guide

When converting existing modals to DetailDrawer:

1. Replace `Dialog`/`DialogContent` with `DetailDrawer`
2. Move `DialogHeader` content to `title` and `description` props
3. Move `DialogFooter` content to `footer` prop
4. Wrap form content in the drawer's children or tab content
5. Add `hasUnsavedChanges` for forms with dirty state tracking
6. Consider adding tabs if content is lengthy

### Before (Modal)
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit Client</DialogTitle>
    </DialogHeader>
    <ClientForm />
    <DialogFooter>
      <Button>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### After (DetailDrawer)
```tsx
<DetailDrawer
  open={open}
  onOpenChange={onOpenChange}
  title="Edit Client"
  footer={<Button>Save</Button>}
>
  <ClientForm />
</DetailDrawer>
```
