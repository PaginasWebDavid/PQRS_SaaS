# Phase 0: Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's grayscale "neutral scaffold" with the PQRS Services navy/green design system (colors, fonts, radius, shadows) and restyle the existing `AppShell` (sidebar/drawer/topbar) to match, so every subsequent page-redesign phase inherits correct tokens and a correct shell for free.

**Architecture:** Token-first: update CSS custom properties in `globals.css` and Tailwind config, swap the loaded Google Fonts, extend the shadcn `Badge` component with the two extra status variants the mockups use, then restyle `AppShell` in place (same props/behavior, new markup/classes). No new pages, no route changes, no schema changes.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui (`@base-ui/react`, `class-variance-authority`), `next/font/google`.

**No test runner is configured in this repo** (`package.json` has no `test` script). Verification for this phase is: `npm run lint`, `npm run build`, and a manual visual check against the design spec (`docs/superpowers/specs/2026-07-10-design-system-redesign-design.md`) using `npm run dev`.

---

## Reference: design tokens (from spec section 1)

```
Navy primary:      #122545   (hover #0B1A33)
Green success:     #5FD394 (dots), badge pair #ECF6EF / #1A6B3A
Amber/pending:     badge pair #FBF3DF / #8A5A00
Danger:            badge pair #FBEAEA / #B3261E
Info badge pair:   #EAEEF6 / #122545
Neutral badge pair:#E8E8ED / #424245
Text:              #1D1D1F (primary) #424245 (secondary) #6E6E73 (muted) #8E8E93 (faint)
Surfaces:          #FFFFFF (page/card) #F5F5F7 (soft panel) #FAFAFA (sidebar) #E8E8ED (border/input)
Radius:             pills 999px, cards 14-20px, inputs 11-12px
Fonts:              Manrope (400/500/600/700/800) UI text, JetBrains Mono (400/500) IDs/dates
```

---

### Task 1: Replace CSS custom properties and remove the neutral scaffold

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Read the current file to confirm line ranges before editing**

Run: `sed -n '1,118p' src/app/globals.css`

Confirm it still matches this structure (three parts: `@layer base` with CSS vars, the `/* Neutral scaffold */` comment block that follows, and the transition/border overrides at the end). If line numbers have drifted, adjust the edits below by content match, not line number.

- [ ] **Step 2: Replace the `:root` token block**

Replace the existing `:root { ... }` block (the one starting with `--background: 0 0% 100%;`) with:

```css
  :root {
    --background: 0 0% 100%;
    --foreground: 240 8% 11%;
    --card: 0 0% 100%;
    --card-foreground: 240 8% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 8% 11%;
    --primary: 217 55% 18%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 20% 95%;
    --secondary-foreground: 217 55% 18%;
    --muted: 240 8% 97%;
    --muted-foreground: 240 3% 45%;
    --accent: 220 33% 94%;
    --accent-foreground: 217 55% 18%;
    --success: 152 33% 26%;
    --success-foreground: 0 0% 100%;
    --success-muted: 152 40% 94%;
    --warning: 39 100% 27%;
    --warning-foreground: 0 0% 100%;
    --warning-muted: 42 61% 92%;
    --destructive: 5 66% 41%;
    --destructive-foreground: 0 0% 100%;
    --destructive-muted: 4 71% 95%;
    --border: 240 6% 90%;
    --input: 240 6% 90%;
    --ring: 217 55% 18%;
    --radius: 1rem;
    --chart-1: 217 55% 18%;
    --chart-2: 152 33% 26%;
    --chart-3: 39 61% 45%;
    --chart-4: 220 33% 80%;
    --chart-5: 240 3% 60%;
  }
```

This maps directly to the spec's hex values (`#122545` → `217 55% 18%`, `#1A6B3A`-style green → `152 33% 26%`, `#8A5A00` → `39 100% 27%`, `#B3261E` → `5 66% 41%`). `--radius` moves from `0.125rem` (near-zero) to `1rem` so `rounded-lg`/`rounded-xl` utilities produce the mockups' card radius; pill buttons still use explicit `rounded-full`.

- [ ] **Step 3: Delete the neutral scaffold block**

Delete the entire commented section that starts with:

```css
/* Neutral scaffold: keeps all features visible while removing branding. */
```

and ends right before the final:

```css
button,
a,
input,
select,
textarea {
  transition: none !important;
}
```

That trailing block (the one forcing `transition: none !important` and hardcoded border/background colors on inputs/buttons) must also be deleted — the mockups rely on `transition` for hover/press states everywhere (buttons, cards, links).

- [ ] **Step 4: Verify the full resulting file**

Run: `cat src/app/globals.css`

Expected: file now contains only `@tailwind` directives, the `@layer base` block with the new `:root` tokens, the `* { @apply border-border; }` rule, `html { background: #ffffff; }`, and `body { @apply bg-background text-foreground; }`. No `!important` overrides, no `[class*=...]` selectors remain.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: replace neutral scaffold with PQRS Services design tokens"
```

---

### Task 2: Extend Tailwind config with the new radius scale note and font families

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add `fontFamily` to `theme.extend`**

In `tailwind.config.ts`, inside `theme: { extend: { ... } }`, add a `fontFamily` key alongside the existing `colors` and `borderRadius` keys:

```ts
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
```

Place it after the `borderRadius` block, before the closing `},` of `extend`. The `--font-sans` and `--font-mono` CSS variables are wired up in Task 3.

- [ ] **Step 2: Verify the file parses**

Run: `npx tsc --noEmit -p tsconfig.json`

Expected: no new type errors introduced (the file is plain TypeScript config; this just confirms syntax validity — pre-existing unrelated errors, if any, are not in scope).

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: add Manrope/JetBrains Mono font family tokens to Tailwind config"
```

---

### Task 3: Swap loaded fonts from Inter to Manrope + JetBrains Mono

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Read current file**

Run: `cat src/app/layout.tsx`

- [ ] **Step 2: Replace the font import and declarations**

Replace:

```ts
import { Inter } from "next/font/google";
```
```ts
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
```

with:

```ts
import { Manrope, JetBrains_Mono } from "next/font/google";
```
```ts
const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700", "800"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });
```

- [ ] **Step 3: Update the `<html>` className**

Replace:

```tsx
    <html lang="es" className={cn("font-sans", inter.variable)}>
```

with:

```tsx
    <html lang="es" className={cn("font-sans", manrope.variable, jetbrainsMono.variable)}>
```

- [ ] **Step 4: Run the dev server and visually confirm the font changed**

Run: `npm run dev`

Open `http://localhost:3000/auth/login` in a browser. Expected: body text renders in Manrope (rounder, heavier-weight geometric sans), not Inter. Stop the dev server after checking (`Ctrl+C`).

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: swap Inter for Manrope + JetBrains Mono fonts"
```

---

### Task 4: Add `success` and `warning` variants to the shadcn Badge

**Files:**
- Modify: `src/components/ui/badge.tsx`

The mockups use five badge colors (info/navy, success/green, warning/amber, neutral/gray, destructive/red). The existing component has `default` (primary/navy — maps to info), `secondary` (neutral), `destructive` (red), `outline`, `ghost`, `link`. It's missing `success` and `warning`.

- [ ] **Step 1: Add the two variants to `badgeVariants`**

In `src/components/ui/badge.tsx`, inside the `variants.variant` object of the `cva(...)` call, add two entries after `secondary`:

```ts
        success:
          "bg-success/10 text-success focus-visible:ring-success/20 [a]:hover:bg-success/20",
        warning:
          "bg-warning/10 text-warning focus-visible:ring-warning/20 [a]:hover:bg-warning/20",
```

- [ ] **Step 2: Add matching Tailwind color tokens**

In `tailwind.config.ts`, inside `theme.extend.colors`, add two entries after `destructive` (which follows the same `DEFAULT`/`foreground` pattern):

```ts
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
```

- [ ] **Step 3: Verify Tailwind picks up the new utility classes**

Run: `npm run build`

Expected: build succeeds (no "Cannot apply unknown utility class" errors referencing `bg-success` or `bg-warning`). If it fails on an unrelated pre-existing error, note it but confirm the failure is not about `success`/`warning` classes.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/badge.tsx tailwind.config.ts
git commit -m "feat: add success/warning badge variants matching design system status colors"
```

---

### Task 5: Restyle `AppShell` sidebar, drawer, and topbar

**Files:**
- Modify: `src/components/app-shell.tsx`

Keep the component's props (`AppShellProps`), the `navByRole` data, and all behavior (route matching, mobile drawer open/close, sign-out) unchanged — only replace the JSX class names and add the logo mark, matching `Sidebar` styling described in spec section 2 (light `#FAFAFA` sidebar, active item pill background `bg-accent text-primary`, avatar circle with initials, sticky blurred mobile topbar).

- [ ] **Step 1: Add an initials helper above the component**

Add this function above `export function AppShell`:

```tsx
function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "U";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
```

- [ ] **Step 2: Replace the `nav` JSX block**

Replace the entire `const nav = ( ... );` block with:

```tsx
  const initials = getInitials(user.name, user.email);

  const nav = (
    <nav className="flex h-full flex-col bg-[#FAFAFA] p-4">
      <div className="flex items-center gap-2 px-2 pb-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
          P
        </span>
        <span className="text-sm font-extrabold tracking-tight">
          PQRS <span className="font-medium text-muted-foreground">Services</span>
        </span>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/pqrs" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors",
                isActive ? "bg-accent text-primary" : "text-[#424245] hover:bg-black/[0.04]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto space-y-1 border-t border-black/[0.06] pt-3">
        <Link
          href="/cambiar-contrasena"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[#424245] transition-colors hover:bg-black/[0.04]"
        >
          <Lock className="h-4 w-4 shrink-0" />
          Cambiar clave
        </Link>
        <div className="flex items-center gap-2.5 px-2 pt-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-primary">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-extrabold leading-tight">{user.name || user.email || "Usuario"}</p>
            <p className="truncate text-[11px] font-medium text-muted-foreground">{roleLabel[user.role]}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="text-[11.5px] font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
```

Note: this drops the standalone `LogOut` icon usage in favor of a text "Salir" link matching the mockups — remove `LogOut` from the `lucide-react` import list if no longer referenced elsewhere in the file (check with the next step).

- [ ] **Step 3: Check for now-unused imports**

Run: `grep -n "LogOut" src/components/app-shell.tsx`

Expected: no remaining references. If none, remove `LogOut` from the `lucide-react` import line at the top of the file.

- [ ] **Step 4: Replace the outer layout JSX (topbar + grid + mobile drawer)**

Replace the `return ( ... );` block at the bottom of the component with:

```tsx
  return (
    <div className="min-h-screen bg-white text-[#1D1D1F]">
      <header className="sticky top-0 z-40 flex h-13 items-center gap-3 border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-xl backdrop-saturate-150 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#F5F5F7]"
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{roleLabel[user.role]}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-primary">
          {getInitials(user.name, user.email)}
        </span>
      </header>

      <div className="grid min-h-screen md:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden border-r border-black/[0.06] md:block">{nav}</aside>
        <main className="mx-auto w-full max-w-[1080px] px-5 py-6 md:px-10 md:py-10">{children}</main>
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-[190] bg-black/35 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)}>
          <div
            className="h-full w-[290px] max-w-[84vw] bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-end p-3">
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F5F7]"
                aria-label="Cerrar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[calc(100%-3.5rem)] px-1">{nav}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
```

This keeps the same `sidebarOpen` state and `setSidebarOpen` calls already defined earlier in the component — no new state needed.

- [ ] **Step 5: Run lint**

Run: `npm run lint`

Expected: no errors in `src/components/app-shell.tsx` (warnings pre-existing elsewhere in the repo are out of scope).

- [ ] **Step 6: Run build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 7: Manual visual check**

Run: `npm run dev`, log in (or navigate to any `(protected)` route if a session already exists), and confirm:
- Desktop: light-gray sidebar (`#FAFAFA`) on the left, active nav item has a pale-navy pill background, avatar circle with initials + "Salir" text at the bottom.
- Resize below `768px` (Tailwind `md` breakpoint): sidebar disappears, a blurred sticky topbar with a hamburger + avatar appears, tapping the hamburger opens a white drawer sliding from the left with the same nav list.

Stop the dev server after checking (`Ctrl+C`).

- [ ] **Step 8: Commit**

```bash
git add src/components/app-shell.tsx
git commit -m "feat: restyle AppShell sidebar/drawer/topbar to PQRS Services design system"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec §1 (tokens) and §3 (scaffold removal). Task 3 covers the Manrope/JetBrains Mono typography requirement. Tasks 4–5 cover spec §2's "Badge" and "AppShell" shared-component items — the remaining §2 components (Toast [already satisfied by existing `sonner` integration — no task needed], Sheet/Modal, Stepper, Toggle, FAQ accordion, StatTile, Timeline) are deferred to the phases that first consume them (Phase 2 onward), per the spec's phase table, and are intentionally out of scope here.
- **Placeholder scan:** no TBD/TODO markers; every step has literal code.
- **Type consistency:** `AppShellProps`, `navByRole`, `roleLabel`, `Role` type are all read from the current file and left untouched — only JSX/className bodies change, so no signature drift.
