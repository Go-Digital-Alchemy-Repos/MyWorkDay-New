# Empty States

## Overview

Empty states provide meaningful feedback when there's no data to display, guiding users toward their next action. Replace generic "No data" text with helpful, contextual empty states.

## Installation

```tsx
import { 
  EmptyState,
  EmptyTasks,
  EmptyProjects,
  EmptyClients,
  EmptyChat,
  EmptyReports,
  EmptyTimeEntries,
  EmptySearchResults,
  EmptyFilteredResults,
} from "@/components/ui-system";
```

---

## EmptyState Component

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `LucideIcon` | - | Icon displayed in circle |
| `title` | `string` | Required | Main heading |
| `description` | `string` | - | Supporting text |
| `action` | `EmptyStateAction` | - | Primary action button |
| `secondaryAction` | `EmptyStateAction` | - | Secondary action button |
| `variant` | `EmptyStateVariant` | `"default"` | Size variant |

### EmptyStateAction

```tsx
interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: "default" | "outline" | "ghost";
}
```

---

## Variants

### Default

Full-size empty state for main content areas.

```tsx
<EmptyState
  icon={FolderOpen}
  title="No projects yet"
  description="Create your first project to start organizing your work."
  action={{
    label: "Create Project",
    onClick: () => setCreateOpen(true),
    icon: Plus,
  }}
/>
```

### Compact

Smaller version for cards, panels, or sidebars.

```tsx
<EmptyState
  variant="compact"
  icon={FileText}
  title="No notes"
  description="Add a note to get started."
  action={{
    label: "Add Note",
    onClick: handleAddNote,
  }}
/>
```

### Inline

Minimal horizontal layout for lists or rows.

```tsx
<EmptyState
  variant="inline"
  icon={Clock}
  title="No time entries for today"
  action={{
    label: "Log Time",
    onClick: handleLogTime,
  }}
/>
```

---

## Pre-built Empty States

Use these ready-made components for common scenarios:

### EmptyTasks

```tsx
<EmptyTasks onAction={() => setCreateTaskOpen(true)} />
```

Displays: "No tasks yet" with FileText icon and "Create Task" button.

### EmptyProjects

```tsx
<EmptyProjects onAction={() => navigate("/projects/new")} />
```

Displays: "No projects yet" with FolderOpen icon and "Create Project" button.

### EmptyClients

```tsx
<EmptyClients onAction={() => setAddClientOpen(true)} />
```

Displays: "No clients yet" with Users icon and "Add Client" button.

### EmptyChat

```tsx
<EmptyChat onAction={() => inputRef.current?.focus()} />
```

Displays: "No messages yet" with MessageSquare icon and "Send Message" button.

### EmptyReports

```tsx
<EmptyReports onAction={() => navigate("/reports")} />
```

Displays: "No data to display" with BarChart3 icon.

### EmptyTimeEntries

```tsx
<EmptyTimeEntries onAction={() => setLogTimeOpen(true)} />
```

Displays: "No time entries" with Clock icon and "Log Time" button.

### EmptySearchResults

```tsx
<EmptySearchResults 
  query={searchQuery} 
  onClear={() => setSearchQuery("")} 
/>
```

Displays: "No results found" with Search icon and "Clear Search" button.

### EmptyFilteredResults

```tsx
<EmptyFilteredResults onClear={() => resetFilters()} />
```

Displays: "No matching items" with Search icon and "Clear Filters" button.

---

## Usage Examples

### Task List Page

```tsx
function TasksPage() {
  const { data: tasks, isLoading } = useQuery({ queryKey: ["/api/tasks"] });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filteredTasks = useMemo(() => 
    tasks?.filter(t => t.title.toLowerCase().includes(search.toLowerCase())),
    [tasks, search]
  );

  if (isLoading) {
    return <TaskListSkeleton />;
  }

  // No tasks at all
  if (!tasks || tasks.length === 0) {
    return <EmptyTasks onAction={() => setCreateOpen(true)} />;
  }

  // No search results
  if (filteredTasks.length === 0) {
    return (
      <EmptySearchResults 
        query={search} 
        onClear={() => setSearch("")} 
      />
    );
  }

  return <TaskList tasks={filteredTasks} />;
}
```

### Projects Dashboard

```tsx
function ProjectsDashboard() {
  const { data: projects } = useQuery({ queryKey: ["/api/projects"] });
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return projects;
    return projects?.filter(p => p.status === statusFilter);
  }, [projects, statusFilter]);

  if (!projects?.length) {
    return <EmptyProjects onAction={() => navigate("/projects/new")} />;
  }

  if (!filtered?.length) {
    return (
      <EmptyFilteredResults 
        onClear={() => setStatusFilter("all")} 
      />
    );
  }

  return <ProjectGrid projects={filtered} />;
}
```

### Chat Channel

```tsx
function ChatMessages({ channelId }) {
  const { data: messages } = useQuery({ 
    queryKey: ["/api/chat/messages", channelId] 
  });
  const inputRef = useRef<HTMLInputElement>(null);

  if (!messages?.length) {
    return (
      <EmptyChat 
        onAction={() => inputRef.current?.focus()} 
      />
    );
  }

  return <MessageList messages={messages} />;
}
```

### Client Detail - Notes Tab

```tsx
function ClientNotes({ clientId }) {
  const { data: notes } = useQuery({ 
    queryKey: ["/api/clients", clientId, "notes"] 
  });

  if (!notes?.length) {
    return (
      <EmptyState
        variant="compact"
        icon={FileText}
        title="No notes yet"
        description="Add notes to keep track of important client information."
        action={{
          label: "Add Note",
          onClick: () => setAddNoteOpen(true),
          icon: Plus,
        }}
      />
    );
  }

  return <NotesList notes={notes} />;
}
```

### Sidebar Widget

```tsx
function RecentActivityWidget() {
  const { data: activity } = useQuery({ queryKey: ["/api/activity/recent"] });

  if (!activity?.length) {
    return (
      <EmptyState
        variant="inline"
        icon={Clock}
        title="No recent activity"
      />
    );
  }

  return <ActivityList items={activity} />;
}
```

---

## With Secondary Actions

```tsx
<EmptyState
  icon={FileText}
  title="No documents"
  description="Upload documents or create new ones to get started."
  action={{
    label: "Upload Document",
    onClick: handleUpload,
    icon: Upload,
  }}
  secondaryAction={{
    label: "Create New",
    onClick: handleCreate,
    variant: "outline",
  }}
/>
```

---

## Custom Icons and Colors

```tsx
// Using custom icon styling via wrapper
<EmptyState
  icon={Inbox}
  title="Inbox Zero!"
  description="You've processed all your tasks. Great job!"
/>

// Custom action variants
<EmptyState
  icon={AlertCircle}
  title="Connection lost"
  description="Unable to load data. Check your connection and try again."
  action={{
    label: "Retry",
    onClick: refetch,
    variant: "outline",
  }}
/>
```

---

## Best Practices

### DO
- Use friendly, encouraging language
- Provide a clear action to resolve the empty state
- Match the icon to the content type
- Use compact variant in confined spaces
- Handle both "no data" and "no results" states

### DON'T
- Use negative language ("Nothing here", "Empty")
- Leave users without guidance
- Use the same generic message everywhere
- Forget to handle filtered/search empty states differently

---

## Content Guidelines

| State Type | Tone | Example |
|------------|------|---------|
| First use | Encouraging | "Create your first project to get started" |
| No results | Helpful | "No items match your search. Try different keywords." |
| Filtered | Actionable | "No matching items. Clear filters to see all." |
| Error | Supportive | "Unable to load. Check your connection and retry." |

---

## Application Coverage

| Feature | Empty State | Status |
|---------|-------------|--------|
| Tasks list | `EmptyTasks` | ✅ Ready |
| Projects list | `EmptyProjects` | ✅ Ready |
| Clients list | `EmptyClients` | ✅ Ready |
| Chat messages | `EmptyChat` | ✅ Ready |
| Reports tables | `EmptyReports` | ✅ Ready |
| Time entries | `EmptyTimeEntries` | ✅ Ready |
| Search results | `EmptySearchResults` | ✅ Ready |
| Filtered results | `EmptyFilteredResults` | ✅ Ready |
