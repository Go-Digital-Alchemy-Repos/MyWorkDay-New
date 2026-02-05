# Theme Migration Log

## Canonical Mappings

Standard replacements for migrating hard-coded Tailwind colors to semantic tokens:

### Background / Text
| Hard-coded | Token replacement |
|---|---|
| `bg-white`, `bg-slate-50`, `bg-gray-50` | `bg-background` |
| `bg-gray-100`, `bg-slate-100` | `bg-muted` |
| `text-black`, `text-gray-900`, `text-slate-900` | `text-foreground` |
| `text-gray-600`, `text-gray-500`, `text-slate-500` | `text-muted-foreground` |

### Surfaces
| Hard-coded | Token replacement |
|---|---|
| Card backgrounds (`bg-white` in cards) | `bg-card text-card-foreground` |
| Popover/menu backgrounds | `bg-popover text-popover-foreground` |
| Sidebar backgrounds | `bg-sidebar text-sidebar-foreground` |

### Borders / Inputs
| Hard-coded | Token replacement |
|---|---|
| `border-gray-200`, `border-slate-200` | `border-border` |
| `border-gray-300` (on inputs) | `border-input` |
| `ring-blue-*`, `ring-gray-*` | `ring-ring` |
| `divide-gray-200` | `divide-border` |

### Primary / Accent
| Hard-coded | Token replacement |
|---|---|
| `bg-blue-600 text-white` | `bg-primary text-primary-foreground` |
| `text-blue-600`, `text-blue-500` | `text-primary` |
| `hover:bg-blue-700` | (handled by elevation system) |
| `bg-blue-50` (light accent bg) | `bg-accent text-accent-foreground` |

### Destructive
| Hard-coded | Token replacement |
|---|---|
| `bg-red-600 text-white` | `bg-destructive text-destructive-foreground` |
| `text-red-600`, `text-red-500` | `text-destructive` |
| `border-red-*` | `border-destructive` |

### Muted / Secondary
| Hard-coded | Token replacement |
|---|---|
| `bg-gray-100`, `bg-slate-100` | `bg-muted text-muted-foreground` |
| `bg-gray-200` (secondary buttons) | `bg-secondary text-secondary-foreground` |

---

## Migration Log

### 2026-02-05 — Initial Audit

**Result:** No migration needed.

Full audit of `client/src/` found zero hard-coded color patterns. The codebase already uses semantic CSS variable tokens exclusively. All Tailwind color utilities reference `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, etc.

**Files changed:** 0

**Theme foundation established:**
- CSS accent presets added to `client/src/index.css` (green, blue, indigo, teal, orange, slate)
- `ThemeProvider` extended with accent support in `client/src/lib/theme-provider.tsx`
- Documentation created at `docs/UX/theme_tokens.md`

### 2026-02-05 — Batch 1: App Shell + Global Surfaces

**Result:** No migration needed.

Verified sidebar/nav, main page backgrounds, cards, popovers, and dividers. All already use semantic tokens (`bg-background`, `bg-sidebar`, `bg-card`, `bg-popover`, `border-border`, etc.) via shadcn sidebar primitives and component library.

**Files changed:** 0

### 2026-02-05 — Batch 2: Forms + Buttons + Focus States

**Result:** No migration needed.

Verified all buttons, inputs, selects, textareas, focus rings, labels, and helper text. All already use semantic tokens:
- Buttons: `bg-primary text-primary-foreground`, `bg-destructive text-destructive-foreground`, `bg-secondary text-secondary-foreground`, and ghost/outline variants via shadcn `<Button>` component
- Inputs/selects/textareas: `bg-background`, `border-input`, `focus-visible:ring-ring`
- Labels: `text-foreground`
- Helper/muted text: `text-muted-foreground`

Zero hard-coded `bg-blue-*`, `text-gray-*`, `ring-blue-*`, `border-gray-*`, or similar patterns found.

**Files changed:** 0

### 2026-02-05 — Batch 3: Tables + Toolbars + List States

**Result:** No migration needed.

Verified tables (task list, projects list), data toolbars (filter chips, search inputs), pagination controls, and list hover/selected states. All already use semantic tokens:
- Table headers: `bg-muted`, `text-foreground`
- Table borders: `border-border`
- Row hover: token-safe `bg-muted/50` or equivalent
- Toolbar backgrounds: `bg-background` / `bg-card`
- Filter chips: `bg-muted`, `text-foreground`, selected states use `bg-primary` tokens
- Pagination: `text-foreground`, `border-border`, hover via elevation system

Zero hard-coded color utilities found across all table and toolbar components.

**Files changed:** 0

### 2026-02-05 — Batch 4: Drawers + Modals/Dialogs + Tabs

**Result:** No migration needed.

Verified detail drawers, modal/dialog overlays, close buttons, and tab components. All already use semantic tokens:
- Drawer containers: `bg-card` / `bg-background`, `border-border`
- Drawer titles: `text-foreground`, secondary text: `text-muted-foreground`
- Modals/dialogs: `bg-popover text-popover-foreground` via shadcn Dialog/Sheet primitives
- Overlays: handled by Radix UI with token-safe dark overlay
- Close buttons: ghost variant `<Button>` (already tokenized)
- Tabs: active indicator uses `--primary` / `--ring` tokens, inactive text uses `text-muted-foreground`

Zero hard-coded color utilities found across drawer, modal, or tab components.

**Files changed:** 0

### 2026-02-05 — Batch 5: Chat + Comments + Rich Text Areas

**Result:** No migration needed.

Verified chat timeline, message bubbles, timestamps, composer, comment containers, mention highlights, and rich text editor surfaces. All already use semantic tokens:
- Chat timeline: `bg-background`
- Message bubbles: `bg-muted text-foreground` (others), `bg-primary text-primary-foreground` (current user where applicable)
- Timestamps/metadata: `text-muted-foreground`
- Composer: `bg-card`, `border-border`, tokenized buttons
- Comment containers: `bg-card` / `bg-muted`, author/timestamp via `text-muted-foreground`
- Mention highlights: token-safe `text-primary` / `bg-primary/10`
- Rich text editor: toolbar `bg-background` / `border-border`, editor surface `bg-background`, code blocks `bg-muted` with monospace font

Zero hard-coded color utilities found across chat, comment, or rich text components.

**Files changed:** 0

---

## Final QA Summary (2026-02-05)

### Build Verification
- Vite production build: PASSED (3,594 modules, 23.42s)
- TypeScript compilation: No blocking errors

### Visual Smoke Test (Automated)
- Login page light mode: PASSED
- Login page dark mode: PASSED (DOM class toggle)
- Accent switching (green -> blue -> teal -> green): PASSED
  - Green default: rgb(126,179,57)
  - Blue accent: rgb(36,99,235)
  - Teal accent: rgb(16,147,132)
- Colors update correctly and revert to default when accent class removed

### Migration Summary

| Batch | Area | Result |
|---|---|---|
| Audit | Full codebase scan | 0 hard-coded colors found |
| Batch 1 | App Shell + Global Surfaces | Already tokenized |
| Batch 2 | Forms + Buttons + Focus States | Already tokenized |
| Batch 3 | Tables + Toolbars + List States | Already tokenized |
| Batch 4 | Drawers + Modals + Tabs | Already tokenized |
| Batch 5 | Chat + Comments + Rich Text | Already tokenized |

**Total files changed across all batches:** 0 (codebase was already fully tokenized)

**Theme foundation files created/modified:**
- `client/src/index.css` — Added accent preset CSS classes
- `client/src/lib/theme-provider.tsx` — Added accent state management
- `docs/UX/theme_tokens.md` — Token system documentation
- `docs/UX/theme_migration_checklist.md` — Audit results
- `docs/UX/theme_migration_log.md` — This file

### Default Theme
The default theme is **light mode + green accent** (preserving the original appearance). Green is the implicit default — no `accent-green` class is needed on `<html>`. The six available accents are: green, blue, indigo, teal, orange, slate.

### Skipped / Deferred Items

| Item | Reason | Follow-up |
|---|---|---|
| Status colors (online/away/busy/offline) | Intentionally fixed semantic colors in `tailwind.config.ts` — should NOT vary with accent | None needed |
| Chart colors (--chart-1 through --chart-5) | Currently fixed per light/dark mode; could be accent-aware in future | Low priority; consider accent-tinted chart palettes |
| Theme toggle on login page | Not present on unauthenticated pages | Add if desired for pre-login theme control |
| Settings UI for accent selection | Foundation only — no user-facing picker yet | Build accent picker in Settings > Appearance |
