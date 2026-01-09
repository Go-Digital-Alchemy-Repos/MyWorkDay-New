# DASANA Design Guidelines

## Design Approach

**Selected Approach:** Design System + Reference Hybrid
- **Primary References:** Asana, Linear, Notion (for productivity patterns)
- **Design System Foundation:** Tailwind CSS utilities with custom component architecture
- **Brand Color:** Green (#7CB342 / HSL 86 52% 48%) - Used as primary color throughout the app
- **Logo:** DASANA "DA" symbol in brand green, used in sidebar header
- **Rationale:** DASANA is a utility-focused productivity tool requiring consistent, efficient UI patterns with clear information hierarchy. Drawing from established project management interfaces ensures intuitive UX while Tailwind provides rapid, maintainable implementation.

## Core Design Principles

1. **Information Density with Clarity** - Display maximum relevant data without overwhelming
2. **Predictable Interactions** - Familiar patterns for task management workflows
3. **Hierarchical Clarity** - Clear visual distinction between workspaces → projects → sections → tasks
4. **Spatial Efficiency** - Multi-panel layouts for parallel context viewing

---

## Typography System

### Font Families
- **Primary (UI):** Inter or SF Pro Display via CDN
- **Monospace (Data):** JetBrains Mono for task IDs, dates, metadata

### Hierarchy
- **Page Titles:** text-2xl font-semibold (workspace/project names)
- **Section Headers:** text-lg font-medium
- **Task Titles:** text-base font-medium
- **Body Text:** text-sm font-normal (descriptions, comments)
- **Metadata:** text-xs font-normal (dates, assignees, status labels)
- **Labels:** text-xs font-medium uppercase tracking-wide

---

## Layout System

### Spacing Primitives
**Core Units:** Use Tailwind units of **2, 3, 4, 6, 8, 12, 16**
- Micro spacing: p-2, gap-2 (8px) - tight elements, badges
- Standard spacing: p-4, gap-4 (16px) - card padding, list items
- Section spacing: p-6, gap-6 (24px) - panel separation
- Major spacing: p-8, py-12 (32-48px) - major sections

### Application Shell Structure

**Three-Column Layout:**
```
[Sidebar: 240px] [Main Content: flex-1] [Detail Drawer: 480px when open]
```

**Sidebar (w-60 / 240px fixed):**
- Workspace switcher at top (h-16)
- Navigation sections with nested items
- Compact list items (h-8 each, px-3)
- Collapsible sections with chevron indicators

**Main Content Area:**
- Header bar (h-16, sticky top-0) containing:
  - Breadcrumb navigation (text-sm)
  - View toggles (List/Board/Calendar)
  - Action buttons (right-aligned)
- Content region with max-w-7xl container
- Dynamic based on view type

**Detail Drawer (Slide-over):**
- Opens from right, w-[480px]
- Full-height overlay (h-screen)
- Divided into header (h-16) + scrollable content
- Stacked sections with py-6 spacing

---

## Component Library

### Navigation Components

**Sidebar Navigation:**
- Nested list structure with pl-6 indentation per level
- Icons from Heroicons (size-4 or size-5)
- Active state: semibold font weight
- Hover state: subtle background treatment

**Breadcrumbs:**
- Separated by chevron-right icons (size-3)
- Truncate middle items with ellipsis if >4 levels
- Last item non-clickable (current page)

### Task Components

**Task Card (List View):**
- min-h-[52px], px-4, py-3
- Grid layout: `grid grid-cols-[1fr_auto_auto_auto]`
  - Column 1: Title + subtask counter
  - Column 2: Assignee avatars (overlapping, -ml-2)
  - Column 3: Due date badge
  - Column 4: Priority indicator
- Hover state: elevate with shadow
- Checkbox (size-5) for completion

**Task Card (Board View):**
- w-full, rounded-lg, p-3
- Vertical stack (gap-3):
  - Title (text-sm font-medium)
  - Description preview (text-xs, line-clamp-2)
  - Metadata row: avatars + due date + priority
  - Tags row (if present)
- Draggable cursor on hover

**Section/Column (Board):**
- min-w-[280px], max-w-[320px]
- Header: section name + task count + add button
- Droppable area with min-h-[200px]
- gap-2 between task cards

### Form Components

**Input Fields:**
- Standard height: h-10 for text inputs
- Textareas: min-h-[100px] for descriptions
- Labels: text-sm font-medium mb-2
- Helper text: text-xs mt-1

**Dropdown Selectors:**
- Assignee picker: Multi-select with avatar chips
- Tag picker: Multi-select with styled tag chips
- Priority picker: Radio group with icon + label
- Status picker: Segmented control (4 states)

**Date Picker:**
- Inline calendar dropdown
- Quick presets (Today, Tomorrow, Next Week, Next Month)
- Clear button for nullable dates

### Data Display Components

**Avatars:**
- Sizes: size-6 (24px) standard, size-8 (32px) featured
- Stack overlapping: -ml-2 with border-2 for separation
- Max 3 visible, then "+N" counter

**Badges:**
- Compact: px-2 py-0.5, text-xs, rounded-full
- Priority indicators: icon + text (optional icon-only)
- Status badges: rounded-md with icon prefix
- Tag chips: rounded-full, removable (×) in edit mode

**Metadata Rows:**
- Horizontal flex layout (gap-3)
- Icon + text pairs (size-4 icons, text-xs)
- Subtle dividers (·) between items

### Modal/Drawer Components

**Task Detail Drawer:**
- Sections with clear dividers (border-b with py-6 spacing)
- Section order:
  1. Title (editable inline, text-xl)
  2. Metadata grid (2 columns: assignee, due date, priority, status)
  3. Description (markdown editor)
  4. Subtasks list
  5. Tags
  6. Comments thread
  7. Activity log

**Create Task Modal:**
- Centered modal, max-w-2xl
- Form with vertical stack (gap-4)
- Primary action (bottom-right)

### List/Table Components

**Project List View:**
- Table-like grid with fixed column widths
- Headers: sticky top-16 (below app header)
- Sortable columns with caret indicators
- Row height: h-12
- Alternating row treatment for scannability

**My Tasks View:**
- Grouped by due date buckets (Overdue, Today, Upcoming, No date)
- Collapsible groups with count badges
- Compact task rows (h-10)
- Inline quick actions on hover

### Action Components

**Buttons:**
- Primary: h-10 px-4 text-sm font-medium rounded-md
- Secondary: Same size with outline/ghost treatment
- Icon-only: size-10 (40×40) with centered icon
- Button groups: Join with rounded-l/rounded-r

**Toolbars:**
- h-12, px-4, gap-2
- Group related actions
- Use icon buttons with tooltips

---

## Board View Specifications

**Section Columns:**
- Horizontal scroll container
- Each section: w-80 shrink-0
- gap-4 between columns
- Add section: w-64 dashed outline, centered "+" button

**Drag-and-Drop:**
- Dragging card: opacity-50 on original, show ghost outline
- Drop zones: dashed border-2 treatment
- Smooth transitions: transition-all duration-200

---

## Responsive Behavior

**Desktop (≥1024px):** Full three-column layout
**Tablet (768-1023px):** Collapsible sidebar (toggle), no detail drawer (use modal instead)
**Mobile (<768px):** 
- Bottom navigation (fixed)
- Full-width views
- Detail drawer becomes full-screen modal
- Board view switches to list view

---

## Animations

**Use Sparingly:**
- Drawer slide-in/out: duration-300 ease-out
- Task card hover: transform scale-[1.01] duration-150
- Dropdown menus: fade-in duration-200
- NO auto-playing animations
- NO scroll-triggered effects

---

## Icons

**Library:** Heroicons (outline style primary, solid for active states)
**Common Icons:**
- Navigation: home, folder, users, calendar, inbox
- Actions: plus, pencil, trash, check, x
- Status: clock, check-circle, exclamation-triangle, minus-circle
- Meta: tag, chat-bubble, paperclip, ellipsis-vertical

---

## Accessibility

- Focus rings: ring-2 ring-offset-2 on all interactive elements
- Skip links for keyboard navigation
- ARIA labels on icon-only buttons
- Proper heading hierarchy (h1 → h2 → h3)
- Sufficient contrast ratios (WCAG AA minimum)
- Keyboard shortcuts visible in tooltips