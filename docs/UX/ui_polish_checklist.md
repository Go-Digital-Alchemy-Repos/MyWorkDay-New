# UI Polish Checklist

## Overview

This checklist ensures visual consistency across the application. Use it when reviewing new features or conducting polish passes.

---

## Design Tokens Reference

### Spacing Scale

| Token | Value | Use Case |
|-------|-------|----------|
| `gap-1` / `space-x-1` | 4px | Icon + text, tight groupings |
| `gap-2` / `space-x-2` | 8px | Button groups, list items |
| `gap-3` / `space-x-3` | 12px | Card content sections |
| `gap-4` / `space-x-4` | 16px | Major content blocks |
| `gap-6` | 24px | Page sections |
| `p-2` | 8px | Compact padding (badges, pills) |
| `p-4` | 16px | Standard card/panel padding |
| `p-6` | 24px | Dialog/modal content padding |

### Border Radius

| Class | Value | Use Case |
|-------|-------|----------|
| `rounded-sm` | 3px | Badges, small elements |
| `rounded-md` | 6px | Buttons, inputs, cards |
| `rounded-lg` | 9px | Large cards, dialogs |
| `rounded-xl` | 12px | Cards (default) |
| `rounded-full` | 9999px | Avatars, pills, circular buttons |

### Icon Sizes

| Class | Size | Use Case |
|-------|------|----------|
| `h-3 w-3` | 12px | Inline indicators, badges |
| `h-4 w-4` | 16px | Button icons, standard icons |
| `h-5 w-5` | 20px | Primary action icons, sidebar |
| `h-6 w-6` | 24px | Large icons, feature highlights |
| `h-8 w-8` | 32px | Empty state icons |

### Text Hierarchy

| Class | Use Case |
|-------|----------|
| `text-2xl font-semibold` | Page titles |
| `text-lg font-semibold` | Section headings |
| `text-base font-medium` | Subsection headings |
| `text-sm` | Body text, form labels |
| `text-xs` | Captions, metadata, timestamps |
| `text-muted-foreground` | Secondary/helper text |

---

## Checklist

### Spacing Consistency

- [ ] **Card padding**: All cards use `p-4` or `p-6` consistently
- [ ] **Gap between items**: List items use `gap-2` or `gap-3`
- [ ] **Button groups**: Use `gap-2` between buttons
- [ ] **Form fields**: Use `gap-4` between form groups
- [ ] **Page margins**: Content areas have consistent `p-4` or `p-6`
- [ ] **Section spacing**: Major sections separated by `mb-6` or `mb-8`

### Typography Hierarchy

- [ ] **Page titles**: Use `text-2xl font-semibold`
- [ ] **Section headings**: Use `text-lg font-semibold`
- [ ] **Card titles**: Use `text-base font-medium` or `text-lg font-semibold`
- [ ] **Labels**: Use `text-sm font-medium`
- [ ] **Body text**: Use `text-sm`
- [ ] **Metadata**: Use `text-xs text-muted-foreground`
- [ ] **No orphan styles**: Avoid inline font-size overrides

### Hover States

- [ ] **Buttons**: Use built-in `hover-elevate` (automatic)
- [ ] **Cards**: Use `hover-elevate` only when clickable
- [ ] **List items**: Use `hover-elevate` for selectable rows
- [ ] **Links**: Use `hover:underline` or `hover:text-primary`
- [ ] **No custom hover colors**: Rely on elevation utilities
- [ ] **No layout changes on hover**: Use `visibility` not `display`

### Focus States

- [ ] **All interactive elements**: Have visible focus ring
- [ ] **Form inputs**: Use `focus-visible:ring-1 focus-visible:ring-ring`
- [ ] **Buttons**: Use built-in focus styles
- [ ] **Custom controls**: Add focus-visible styles
- [ ] **Skip links**: Available for keyboard navigation

### Color Usage

- [ ] **Semantic colors only**: Use `text-foreground`, `text-muted-foreground`
- [ ] **No hardcoded colors**: Avoid `text-gray-500`, use `text-muted-foreground`
- [ ] **Status colors**: Use design system tokens for status
- [ ] **Dark mode support**: All colors have dark variants
- [ ] **Contrast ratio**: Text readable on backgrounds

### Border Radius

- [ ] **Buttons**: Use `rounded-md` (automatic via component)
- [ ] **Cards**: Use `rounded-xl` (automatic via component)
- [ ] **Inputs**: Use `rounded-md`
- [ ] **Badges**: Use `rounded-md`
- [ ] **Avatars**: Use `rounded-full`
- [ ] **Dialogs**: Use `rounded-lg`
- [ ] **Consistency**: Same radius for adjacent elements

### Card Shadows

- [ ] **Standard cards**: Use `shadow-sm` (built into Card component)
- [ ] **Elevated cards**: Use `shadow-md` sparingly
- [ ] **Modals/dialogs**: Use `shadow-lg`
- [ ] **Dark mode**: Shadows adjusted or removed
- [ ] **No excessive shadows**: Keep shadows subtle

### Button Variants

- [ ] **Primary actions**: Use `variant="default"` (green/primary)
- [ ] **Secondary actions**: Use `variant="secondary"` or `variant="outline"`
- [ ] **Destructive**: Use `variant="destructive"` for delete/remove
- [ ] **Subtle actions**: Use `variant="ghost"`
- [ ] **Icon buttons**: Use `size="icon"` with proper variant
- [ ] **Consistent sizing**: Same row = same button size

### Icon Sizing

- [ ] **Button icons**: Use `h-4 w-4`
- [ ] **Sidebar icons**: Use `h-5 w-5`
- [ ] **Empty state icons**: Use `h-8 w-8`
- [ ] **Badge icons**: Use `h-3 w-3`
- [ ] **Consistent within context**: All icons in same area = same size

---

## Component Patterns

### Cards

```tsx
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-lg">Title</CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content with consistent spacing */}
  </CardContent>
  <CardFooter className="pt-4 flex justify-end gap-2">
    <Button variant="outline">Cancel</Button>
    <Button>Save</Button>
  </CardFooter>
</Card>
```

### Lists with Actions

```tsx
<div className="space-y-2">
  {items.map(item => (
    <div 
      key={item.id}
      className="flex items-center justify-between p-3 rounded-md hover-elevate"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{item.name}</span>
      </div>
      <Button size="icon" variant="ghost">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
  ))}
</div>
```

### Form Groups

```tsx
<div className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="name">Name</Label>
    <Input id="name" placeholder="Enter name" />
  </div>
  <div className="space-y-2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" placeholder="Enter email" />
  </div>
</div>
```

### Page Headers

```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-semibold">Page Title</h1>
    <p className="text-sm text-muted-foreground">Page description</p>
  </div>
  <Button>
    <Plus className="h-4 w-4 mr-2" />
    Create New
  </Button>
</div>
```

---

## Common Anti-Patterns

### DON'T

```tsx
// Hardcoded colors
<span className="text-gray-500">...</span>

// Inconsistent spacing
<div className="p-2 gap-5 space-x-3">...</div>

// Manual hover colors on buttons
<Button className="hover:bg-green-600">...</Button>

// Inconsistent icon sizes
<Button><Icon className="h-3 w-3" /></Button>
<Button><Icon className="h-5 w-5" /></Button>

// Layout changes on hover
<div className="hover:block hidden">...</div>
```

### DO

```tsx
// Semantic colors
<span className="text-muted-foreground">...</span>

// Consistent spacing
<div className="p-4 gap-4">...</div>

// Use built-in hover states
<Button>...</Button>

// Consistent icon sizes
<Button><Icon className="h-4 w-4" /></Button>
<Button><Icon className="h-4 w-4" /></Button>

// Visibility for hover states
<div className="group">
  <span className="invisible group-hover:visible">...</span>
</div>
```

---

## Review Process

1. **Visual Scan**: Check page at 100% zoom
2. **Responsive**: Test at mobile (375px), tablet (768px), desktop (1440px)
3. **Dark Mode**: Toggle and verify all elements
4. **Keyboard Navigation**: Tab through all interactive elements
5. **Focus Visibility**: Ensure focus rings are visible
6. **Loading States**: Verify skeletons match content layout
7. **Empty States**: Check empty state messaging and actions
8. **Error States**: Verify error messages are styled consistently

---

## Files to Check

When doing a polish pass, prioritize these areas:

| Priority | Area | Files |
|----------|------|-------|
| High | Main layouts | `App.tsx`, sidebars, headers |
| High | Core pages | `home.tsx`, `my-tasks.tsx`, `projects-dashboard.tsx` |
| Medium | Forms | All create/edit dialogs and drawers |
| Medium | Lists | Table views, card grids |
| Low | Settings | Settings tabs, user preferences |
| Low | Admin | Super admin pages |

---

## Automated Checks

Consider adding these to your review process:

1. **Grep for anti-patterns**:
   ```bash
   # Find hardcoded gray colors
   grep -r "text-gray-" client/src/
   
   # Find manual hover backgrounds
   grep -r "hover:bg-" client/src/
   ```

2. **Check icon consistency**:
   ```bash
   # Count icon size usage
   grep -r "h-[0-9] w-[0-9]" client/src/components/
   ```

3. **Verify spacing patterns**:
   ```bash
   # Find inconsistent padding
   grep -r "p-[0-9]" client/src/pages/
   ```

---

## Version History

| Date | Change |
|------|--------|
| 2026-02-05 | Initial checklist created |
