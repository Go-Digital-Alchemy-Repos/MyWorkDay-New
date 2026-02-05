# MyWorkDay Design System

## Overview
This design system provides foundational UI components and tokens to ensure visual consistency across the application.

**Related Documentation:**
- [DetailDrawer Pattern](./detail_drawer_pattern.md) - Standard slide-over panel implementation
- [Motion Guidelines](./motion_guidelines.md) - Animation and micro-interaction standards
- [Loading Patterns](./loading_patterns.md) - Skeleton loading and loading states
- [DataToolbar Standard](./data_toolbar.md) - List page toolbar with search, filters, and actions

## Installation
All components are available from `@/components/ui-system`:

```tsx
import { 
  PageHeader, 
  SectionHeader, 
  MetricCard, 
  EmptyState,
  LoadingSkeleton,
  DetailDrawer,
  DataToolbar,
  AvatarWithStatus,
  PageTitle, 
  SectionTitle, 
  BodyText, 
  MutedText, 
  LabelText,
  spacing,
  radius,
  shadows
} from "@/components/ui-system";
```

---

## Design Tokens

### Spacing Scale
| Token | Value | Use Case |
|-------|-------|----------|
| `xs` | 4px | Tight spacing, icon gaps |
| `sm` | 8px | Between related elements |
| `md` | 16px | Standard component padding |
| `lg` | 24px | Section spacing |
| `xl` | 32px | Major section breaks |
| `2xl` | 48px | Page-level spacing |

### Border Radius
| Token | Value | Use Case |
|-------|-------|----------|
| `sm` | 6px | Buttons, badges |
| `md` | 8px | Inputs, small cards |
| `lg` | 16px | Cards, modals |
| `xl` | 20px | Large cards, drawers |
| `full` | 9999px | Pills, avatars |

**Standard Card Radius**: 16-20px (`rounded-xl`)

### Shadows
| Token | Use Case |
|-------|----------|
| `sm` | Subtle elevation |
| `card` | Default card shadow |
| `elevated` | Hover states, floating elements |
| `modal` | Modals, popovers |

---

## Typography Components

### PageTitle
Main page headings. Uses `h1` by default.

```tsx
<PageTitle>Dashboard</PageTitle>
<PageTitle as="h2">Custom heading level</PageTitle>
```

**Styles**: `text-2xl font-semibold tracking-tight`

### SectionTitle
Section headings within a page.

```tsx
<SectionTitle>Recent Activity</SectionTitle>
```

**Styles**: `text-lg font-semibold tracking-tight`

### BodyText
Standard body copy.

```tsx
<BodyText>This is regular paragraph text.</BodyText>
```

**Styles**: `text-sm leading-relaxed`

### MutedText
Secondary, de-emphasized text.

```tsx
<MutedText>Last updated 5 minutes ago</MutedText>
```

**Styles**: `text-sm text-muted-foreground`

### LabelText
Small uppercase labels.

```tsx
<LabelText>Status</LabelText>
```

**Styles**: `text-xs font-medium uppercase tracking-wide text-muted-foreground`

---

## Layout Components

### PageHeader
Standard page header with title, optional description, and actions.

```tsx
<PageHeader 
  title="Projects"
  description="Manage your active projects"
  actions={<Button>New Project</Button>}
/>
```

**Props**:
- `title` (required): Page title
- `description`: Subtitle text
- `actions`: Action buttons/elements

### SectionHeader
Section divider with title and optional actions.

```tsx
<SectionHeader 
  title="Team Members"
  description="Active team members"
  actions={<Button size="sm">Add Member</Button>}
/>
```

### DataToolbar
Toolbar with search, filters, and action buttons.

```tsx
<DataToolbar
  searchValue={search}
  onSearchChange={setSearch}
  searchPlaceholder="Search projects..."
  filters={<Select>...</Select>}
  actions={<Button>Export</Button>}
/>
```

---

## Display Components

### MetricCard
Dashboard metric display with optional trend indicator.

```tsx
<MetricCard
  title="Active Projects"
  value={24}
  description="5 due this week"
  icon={Briefcase}
  trend={{ value: 12, label: "from last month", isPositive: true }}
/>
```

### EmptyState
Empty state placeholder with optional action.

```tsx
<EmptyState
  icon={FileText}
  title="No projects yet"
  description="Create your first project to get started."
  action={{
    label: "Create Project",
    onClick: () => setCreateOpen(true),
    icon: Plus
  }}
/>
```

### LoadingSkeleton
Loading placeholder for different content types.

```tsx
<LoadingSkeleton variant="card" count={6} />
<LoadingSkeleton variant="list" count={5} />
<LoadingSkeleton variant="table" count={10} />
<LoadingSkeleton variant="metric" count={4} />
<LoadingSkeleton variant="detail" />
```

### AvatarWithStatus
Avatar with online/offline status indicator.

```tsx
<AvatarWithStatus
  src={user.avatarUrl}
  name="John Doe"
  size="md"
  status="online"
/>
```

**Sizes**: `xs`, `sm`, `md`, `lg`, `xl`
**Statuses**: `online`, `offline`, `idle`, `busy`

### DetailDrawer
Slide-out drawer for detail views and forms.

```tsx
<DetailDrawer
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Project Details"
  description="View and edit project information"
  size="lg"
  footer={<Button>Save Changes</Button>}
>
  {/* Content */}
</DetailDrawer>
```

**Sizes**: `sm` (384px), `md` (448px), `lg` (512px), `xl` (576px)

---

## Spacing Guidelines

### Vertical Spacing
- **Between major sections**: 24px (`space-y-6`)
- **Within sections**: 16px (`space-y-4`)
- **Between related items**: 8px (`space-y-2`)

### Card Padding
- **Standard cards**: 20px (`p-5`)
- **Compact cards**: 16px (`p-4`)

### Page Margins
- **Desktop**: 24px (`p-6`)
- **Mobile**: 16px (`p-4`)

---

## Color Usage

### Text Hierarchy
1. **Primary text**: Default foreground
2. **Secondary text**: `text-muted-foreground`
3. **Tertiary text**: `text-muted-foreground/70`

### Backgrounds
- **Page**: `bg-background`
- **Cards**: `bg-card`
- **Elevated surfaces**: `bg-muted/30`
- **Interactive hover**: Use `hover-elevate` class

### Status Colors
- **Success**: `text-green-600 dark:text-green-400`
- **Warning**: `text-yellow-600 dark:text-yellow-400`
- **Error**: `text-red-600 dark:text-red-400`
- **Info**: `text-blue-600 dark:text-blue-400`

---

## Migration Notes

### Adopting Components
When migrating existing pages:

1. Replace raw `<h1>` with `<PageTitle>`
2. Replace manual section headers with `<SectionHeader>`
3. Replace custom metric cards with `<MetricCard>`
4. Replace loading states with `<LoadingSkeleton>`
5. Ensure cards use `rounded-xl` for consistent radius

### Preserving Existing Functionality
- All components accept `className` for customization
- All components accept `data-testid` for testing
- Components are additive - no existing pages need immediate changes
