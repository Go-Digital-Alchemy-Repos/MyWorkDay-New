# Theme Tokens System

## Overview

MyWorkDay uses a CSS-variable-based theming system that supports:
- **Light / Dark mode** — toggled via `.dark` class on `<html>`
- **Accent color presets** — toggled via `.accent-{name}` class on `<html>`

All color tokens are defined as space-separated HSL values (e.g. `86 52% 46.3%`) and consumed through Tailwind utilities via `hsl(var(--token))` mappings in `tailwind.config.ts`.

## Token Reference

### Base Tokens (set per light/dark mode)
| Token | Purpose |
|---|---|
| `--background` / `--foreground` | Page background and default text |
| `--card` / `--card-foreground` / `--card-border` | Card surfaces |
| `--popover` / `--popover-foreground` / `--popover-border` | Dropdown/popover surfaces |
| `--muted` / `--muted-foreground` | Muted backgrounds and secondary text |
| `--secondary` / `--secondary-foreground` | Secondary button/badge surfaces |
| `--destructive` / `--destructive-foreground` | Error/danger surfaces |
| `--border` | Default border color |
| `--input` | Input field border |
| `--sidebar` / `--sidebar-foreground` / `--sidebar-border` | Sidebar chrome |
| `--sidebar-accent` / `--sidebar-accent-foreground` | Sidebar hover/active background |

### Accent Tokens (set per accent preset)
| Token | Purpose |
|---|---|
| `--primary` / `--primary-foreground` | Primary buttons, links, active indicators |
| `--accent` / `--accent-foreground` | Subtle accent backgrounds (e.g. selected row) |
| `--ring` | Focus ring color |
| `--sidebar-primary` / `--sidebar-primary-foreground` | Sidebar active item color |
| `--sidebar-ring` | Sidebar focus ring |

### Derived Tokens (auto-computed)
Border variants (`--primary-border`, `--accent-border`, etc.) are automatically computed using `hsl(from ...)` relative color syntax. They adjust lightness relative to their base token.

## Available Accent Presets

| Preset | Class | Primary HSL | Default |
|---|---|---|---|
| Green | `accent-green` (or none) | `86 52% 46.3%` | Yes |
| Blue | `accent-blue` | `221 83% 53%` | |
| Indigo | `accent-indigo` | `243 75% 59%` | |
| Teal | `accent-teal` | `173 80% 32%` | |
| Orange | `accent-orange` | `20 91% 48%` | |
| Slate | `accent-slate` | `215 25% 27%` | |

Green is the default. When no accent class is applied, the app uses the green preset.

## How Accent Classes Work

Accent classes are applied to the `<html>` element alongside the mode class:

```html
<!-- Light mode, green accent (default) -->
<html class="light">

<!-- Dark mode, blue accent -->
<html class="dark accent-blue">

<!-- Light mode, teal accent -->
<html class="light accent-teal">
```

The ThemeProvider manages both classes via React state persisted in localStorage:
- `dasana-theme` — stores `"light"` or `"dark"`
- `dasana-accent` — stores the accent name (e.g. `"blue"`, `"green"`)

## Using Tokens in Components

Use standard Tailwind utilities — they already reference the CSS variables:

```tsx
<button className="bg-primary text-primary-foreground">
  Primary Action
</button>

<div className="bg-accent text-accent-foreground rounded-md p-2">
  Selected item
</div>

<input className="border-input ring-ring focus:ring-2" />
```

## How to Add a New Accent Preset

1. Open `client/src/index.css`
2. Add a new `.accent-{name}` block after the existing presets:

```css
.accent-rose {
  --primary: 350 89% 60%;
  --primary-foreground: 210 40% 98%;
  --accent: 350 30% 94%;
  --accent-foreground: 350 47% 11%;
  --ring: 350 89% 65%;
  --sidebar-primary: 350 89% 60%;
  --sidebar-primary-foreground: 210 40% 98%;
  --sidebar-ring: 350 89% 60%;
}
.dark.accent-rose {
  --accent: 350 30% 15%;
  --accent-foreground: 210 40% 98%;
}
```

3. Add the name to the `AccentColor` type and `ACCENT_OPTIONS` array in `client/src/lib/theme-provider.tsx`:

```ts
type AccentColor = "green" | "blue" | "indigo" | "teal" | "orange" | "slate" | "rose";
const ACCENT_OPTIONS: AccentColor[] = ["green", "blue", "indigo", "teal", "orange", "slate", "rose"];
```

4. No Tailwind config changes needed — the presets override the same CSS variables.

## Programmatic Access

```tsx
import { useTheme } from "@/lib/theme-provider";

function MyComponent() {
  const { theme, toggleTheme, accent, setAccent, accentOptions } = useTheme();
  
  return (
    <div>
      <p>Current theme: {theme}</p>
      <p>Current accent: {accent}</p>
      <button onClick={toggleTheme}>Toggle dark mode</button>
      <button onClick={() => setAccent("blue")}>Use blue accent</button>
    </div>
  );
}
```

## File Locations

| File | Purpose |
|---|---|
| `client/src/index.css` | CSS variable definitions (base + accent presets) |
| `tailwind.config.ts` | Tailwind ↔ CSS variable mappings |
| `client/src/lib/theme-provider.tsx` | React context for theme + accent state |
| `client/src/components/theme-toggle.tsx` | Dark/light toggle button |
