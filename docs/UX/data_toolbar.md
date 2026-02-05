# DataToolbar Standard

## Overview

The `DataToolbar` provides a consistent toolbar layout for all list pages, including search, filters, sorting, view mode toggle, and action buttons.

## Installation

```tsx
import { 
  DataToolbar, 
  FilterSelect, 
  ActiveFilters,
  type ViewMode,
  type SortOption,
  type FilterOption,
} from "@/components/ui-system";
```

---

## Toolbar Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [🔍 Search...   ] [Filter ▼] [Filter ▼] [Sort ▼]  │ 📊 ≡ │ + Add │
└─────────────────────────────────────────────────────────────────┘
     Search          Filters              Sort      Views  Primary
```

---

## Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `searchValue` | `string` | - | Current search input value |
| `onSearchChange` | `(value: string) => void` | - | Search change handler |
| `searchPlaceholder` | `string` | `"Search..."` | Search input placeholder |
| `sortValue` | `string` | - | Current sort selection |
| `onSortChange` | `(value: string) => void` | - | Sort change handler |
| `sortOptions` | `SortOption[]` | - | Available sort options |
| `sortLabel` | `string` | `"Sort by"` | Sort dropdown label |
| `viewMode` | `ViewMode` | - | Current view mode |
| `onViewModeChange` | `(mode: ViewMode) => void` | - | View mode change handler |
| `availableViews` | `ViewMode[]` | `["list", "grid"]` | Available view modes |
| `filters` | `ReactNode` | - | Custom filter controls |
| `primaryAction` | `{ label, onClick, icon?, disabled? }` | - | Primary action button |
| `secondaryActions` | `ReactNode` | - | Additional action buttons |

---

## Basic Usage

### Minimal Toolbar (Search Only)

```tsx
function TasksPage() {
  const [search, setSearch] = useState("");

  return (
    <DataToolbar
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search tasks..."
    />
  );
}
```

### Full-Featured Toolbar

```tsx
function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const [status, setStatus] = useState("all");

  const sortOptions: SortOption[] = [
    { value: "name", label: "Name" },
    { value: "updated", label: "Last Updated" },
    { value: "created", label: "Date Created" },
    { value: "dueDate", label: "Due Date" },
  ];

  return (
    <DataToolbar
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search projects..."
      
      sortValue={sort}
      onSortChange={setSort}
      sortOptions={sortOptions}
      
      viewMode={view}
      onViewModeChange={setView}
      availableViews={["list", "grid", "table"]}
      
      filters={
        <FilterSelect
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "archived", label: "Archived" },
          ]}
          placeholder="Status"
          data-testid="filter-status"
        />
      }
      
      primaryAction={{
        label: "New Project",
        onClick: () => setCreateOpen(true),
        icon: Plus,
      }}
    />
  );
}
```

---

## Components

### DataToolbar

Main toolbar component with all features.

### FilterSelect

Reusable filter dropdown with "All" option.

```tsx
<FilterSelect
  value={statusFilter}
  onValueChange={setStatusFilter}
  options={[
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ]}
  placeholder="Status"
  allLabel="All Statuses"
  data-testid="filter-status"
/>
```

### ActiveFilters

Display and manage active filter chips.

```tsx
<ActiveFilters
  filters={[
    { key: "status", label: "Status", value: "Active" },
    { key: "client", label: "Client", value: "Acme Corp" },
  ]}
  onRemove={(key) => clearFilter(key)}
  onClearAll={() => clearAllFilters()}
/>
```

---

## View Modes

Available view modes:

| Mode | Icon | Use Case |
|------|------|----------|
| `list` | ≡ | Compact list view |
| `grid` | ⊞ | Card grid layout |
| `table` | ≣ | Data table view |
| `board` | ⊞ | Kanban board |

```tsx
<DataToolbar
  viewMode={view}
  onViewModeChange={setView}
  availableViews={["list", "grid", "table"]}
/>
```

---

## Page Examples

### Tasks Page

```tsx
<DataToolbar
  searchValue={search}
  onSearchChange={setSearch}
  searchPlaceholder="Search tasks..."
  
  sortOptions={[
    { value: "dueDate", label: "Due Date" },
    { value: "priority", label: "Priority" },
    { value: "status", label: "Status" },
    { value: "title", label: "Title" },
  ]}
  sortValue={sort}
  onSortChange={setSort}
  
  filters={
    <>
      <FilterSelect
        value={statusFilter}
        onValueChange={setStatusFilter}
        options={statusOptions}
        placeholder="Status"
      />
      <FilterSelect
        value={priorityFilter}
        onValueChange={setPriorityFilter}
        options={priorityOptions}
        placeholder="Priority"
      />
    </>
  }
  
  primaryAction={{
    label: "Add Task",
    onClick: () => setCreateOpen(true),
  }}
/>
```

### Projects Page

```tsx
<DataToolbar
  searchValue={search}
  onSearchChange={setSearch}
  searchPlaceholder="Search projects..."
  
  viewMode={viewMode}
  onViewModeChange={setViewMode}
  availableViews={["grid", "table"]}
  
  sortOptions={[
    { value: "name", label: "Name" },
    { value: "client", label: "Client" },
    { value: "updated", label: "Last Updated" },
  ]}
  sortValue={sort}
  onSortChange={setSort}
  
  filters={
    <>
      <FilterSelect
        value={clientFilter}
        onValueChange={setClientFilter}
        options={clientOptions}
        placeholder="Client"
      />
      <FilterSelect
        value={teamFilter}
        onValueChange={setTeamFilter}
        options={teamOptions}
        placeholder="Team"
      />
    </>
  }
  
  primaryAction={{
    label: "New Project",
    onClick: () => navigate("/projects/new"),
  }}
/>
```

### Clients Page

```tsx
<DataToolbar
  searchValue={search}
  onSearchChange={setSearch}
  searchPlaceholder="Search clients..."
  
  viewMode={viewMode}
  onViewModeChange={setViewMode}
  availableViews={["grid", "list"]}
  
  filters={
    <FilterSelect
      value={statusFilter}
      onValueChange={setStatusFilter}
      options={[
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
        { value: "prospect", label: "Prospect" },
      ]}
      placeholder="Status"
    />
  }
  
  primaryAction={{
    label: "Add Client",
    onClick: () => setCreateOpen(true),
  }}
/>
```

### Time Entries Page

```tsx
<DataToolbar
  searchValue={search}
  onSearchChange={setSearch}
  searchPlaceholder="Search entries..."
  
  sortOptions={[
    { value: "date", label: "Date" },
    { value: "duration", label: "Duration" },
    { value: "project", label: "Project" },
  ]}
  sortValue={sort}
  onSortChange={setSort}
  
  filters={
    <>
      <FilterSelect
        value={projectFilter}
        onValueChange={setProjectFilter}
        options={projectOptions}
        placeholder="Project"
      />
      <FilterSelect
        value={userFilter}
        onValueChange={setUserFilter}
        options={userOptions}
        placeholder="Team Member"
      />
    </>
  }
  
  secondaryActions={
    <Button variant="outline" onClick={exportEntries}>
      <Download className="h-4 w-4 mr-2" />
      Export
    </Button>
  }
  
  primaryAction={{
    label: "Log Time",
    onClick: () => setLogTimeOpen(true),
  }}
/>
```

### Reports Tables

```tsx
<DataToolbar
  searchValue={search}
  onSearchChange={setSearch}
  
  sortOptions={[
    { value: "name", label: "Name" },
    { value: "hours", label: "Hours" },
    { value: "tasks", label: "Tasks" },
  ]}
  sortValue={sort}
  onSortChange={setSort}
  
  filters={
    <>
      <FilterSelect
        value={dateRange}
        onValueChange={setDateRange}
        options={[
          { value: "week", label: "This Week" },
          { value: "month", label: "This Month" },
          { value: "quarter", label: "This Quarter" },
          { value: "year", label: "This Year" },
        ]}
        placeholder="Date Range"
        allLabel="All Time"
      />
    </>
  }
  
  secondaryActions={
    <Button variant="outline" onClick={downloadReport}>
      <FileDown className="h-4 w-4 mr-2" />
      Download
    </Button>
  }
/>
```

---

## Responsive Behavior

- **Desktop**: Full toolbar with all controls inline
- **Tablet**: Wraps to two rows if needed
- **Mobile**: Stacks vertically, view toggle hidden

---

## Best Practices

### DO
- Always include search for lists with 10+ items
- Use consistent filter names across pages
- Provide sorting options relevant to the data
- Include a primary action when applicable

### DON'T
- Add more than 4 filter dropdowns (use advanced filters modal)
- Hide essential filters on mobile
- Use different toolbar layouts on similar pages
- Forget to preserve filter state in URL

---

## State Management

### URL Persistence

Preserve toolbar state in URL for shareability:

```tsx
import { useSearchParams } from "wouter";

function useToolbarState() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const search = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "updated";
  const status = searchParams.get("status") || "all";
  
  const setSearch = (value: string) => {
    setSearchParams({ ...searchParams, q: value || undefined });
  };
  
  return { search, setSearch, sort, setSort, status, setStatus };
}
```

### Local State

For simpler cases:

```tsx
function SimplePage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  
  return <DataToolbar ... />;
}
```
