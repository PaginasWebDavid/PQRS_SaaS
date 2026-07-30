# Frontend Design Foundation (Fase 0 + Landing font cleanup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Nota de esta sesión:** por decisión explícita del usuario, este plan se ejecuta INLINE, sin subagentes ni worktree (los subagentes no heredan las skills de diseño instaladas y ya se hizo toda la auditoría previa en esta misma sesión).

**Goal:** Give the whole PQRS SaaS frontend (product app + public landing) a single, real design-token system with working dark mode, and remove duplicate/dead font-loading code — the prerequisite foundation for the later consistency, motion, and polish phases already agreed with the user.

**Architecture:** Introduce one CSS custom property per existing `src/lib/design/tokens.ts` color key, defined with its *exact current value* under `:root` (so light mode is pixel-identical to today) and a hand-picked dark equivalent under `.dark`. Rewrite `tokens.ts` so every `COLORS.*` value becomes `var(--token-key)` — this requires zero changes to the 47 files that already consume `COLORS.*` via inline `style={{}}`, because the JS object keeps the exact same shape and keys, only the underlying value changes from a static hex string to a CSS variable reference the browser resolves at paint time (and therefore respects `.dark`). Wire `next-themes` (already an installed, unused dependency) so `.dark` actually gets toggled. Materialize shadcn's `src/components/ui/*` (currently 0 files despite `components.json` existing) so later phases have real components to migrate onto. Separately, delete two redundant Google Fonts loading paths that duplicate the `next/font` setup already working correctly in `src/app/layout.tsx`.

**Tech Stack:** Next.js 14.2.35 (App Router), Tailwind CSS 3.4, `next-themes` 0.4.6 (already a dependency, currently unused), shadcn/ui CLI (config already present in `components.json`), TypeScript.

**Out of scope for this plan (deferred to follow-up plans once this lands):** migrating the 47 inline-`style={{}}` files onto the newly-generated shadcn components; the landing page's Server Component conversion (blocked on first replacing its `isMobile`-driven JS responsive sizing with CSS — see "Discovery note" below); the `motion` animation-library work; retiring the unused `.pqrs-*` utility classes and the near-unused `pqrs-up`/`pqrs-fade`/`pqrs-pop` keyframes in `globals.css` (0-1 file adoption each, vs. `apl-up` at 25 files) in favor of standardizing on `apl-*`.

**Discovery note (why the landing page isn't being converted to a Server Component here):** `src/app/page.tsx` picks nearly every size, padding, and column count in the page from a `sizes` object keyed off a single `isMobile` boolean produced by a `resize` listener (`useIsMobile()`), not CSS breakpoints. Converting the page to a Server Component requires first replacing that JS-driven sizing with Tailwind `md:`/`lg:` classes or CSS `clamp()`, which is a visual/structural decision, not a mechanical extraction — it belongs with the later Landing-B visual pass, not this foundation plan. This plan only removes the landing page's *redundant font loading* (task 5), which is safe and mechanical regardless of that larger refactor.

---

### Task 1: Extend `globals.css` with real design tokens + dark mode block

**Files:**
- Modify: `src/app/globals.css:1` (remove duplicate font import)
- Modify: `src/app/globals.css:7-41` (extend `:root`, add `.dark`)

- [ ] **Step 1: Remove the duplicate Google Fonts `@import`**

`src/app/layout.tsx` already loads Manrope and JetBrains Mono correctly via `next/font/google` and applies them as `--font-sans`/`--font-mono` on `<html>`. The `@import` at the top of `globals.css` loads the *same* fonts a second time, over the network, blocking render. Delete line 1 entirely:

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
```

The file should now start directly with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: Add the new semantic CSS variables to `:root`**

These are the exact current values from `src/lib/design/tokens.ts`, so light mode renders byte-for-byte identical to today. Insert them inside the existing `:root { ... }` block (after the `--chart-5` line, before the closing `}`):

```css
    --chart-5: 240 2% 43%;

    /* ---- tokens.ts parity (Fase 0 foundation) ---- */
    --surface-sidebar: #FAFAFA;
    --surface-card-soft: #F5F5F7;
    --border-soft: rgba(0, 0, 0, 0.06);
    --input-border: #E8E8ED;
    --input-border-strong: #C7C7CC;
    --text-primary: #1D1D1F;
    --text-secondary: #6E6E73;
    --text-secondary-alt: #424245;
    --text-muted: #8E8E93;
    --navy: #122545;
    --navy-hover: #0B1A33;
    --navy-soft: #EAEEF6;
    --navy-text: #9FB1CE;
    --navy-muted: #B7C1D6;
    --navy-muted-2: #8FA1BF;
    --status-success: #1A6B3A;
    --status-success-soft: #ECF6EF;
    --status-warning: #8A5A00;
    --status-warning-soft: #FBF3DF;
    --status-danger: #B3261E;
    --status-danger-soft: #FBEAEA;
    --neutral-soft: #E8E8ED;
    --overlay: rgba(0, 0, 0, 0.35);
    --toast-bg: #1D1D1F;
```

- [ ] **Step 3: Add a `.dark { }` block right after `:root { }` closes**

First pass at dark values (kept in the same navy/Apple-esque family, not a repaint of the brand). These are refinable during Task 6's manual verification — the point of this step is that the mechanism works end-to-end, not that every hex is final.

```css
  .dark {
    --background: 240 6% 6%;
    --foreground: 240 5% 96%;
    --card: 240 5% 11%;
    --card-foreground: 240 5% 96%;
    --popover: 240 6% 9%;
    --popover-foreground: 240 5% 96%;
    --primary: 213 55% 68%;
    --primary-foreground: 217 58% 12%;
    --secondary: 240 5% 15%;
    --secondary-foreground: 240 5% 96%;
    --muted: 240 5% 15%;
    --muted-foreground: 240 3% 65%;
    --accent: 217 30% 20%;
    --accent-foreground: 213 55% 82%;
    --success: 145 55% 45%;
    --success-foreground: 145 60% 8%;
    --success-muted: 145 30% 12%;
    --warning: 39 85% 55%;
    --warning-foreground: 39 60% 8%;
    --warning-muted: 39 40% 12%;
    --destructive: 4 70% 58%;
    --destructive-foreground: 4 60% 8%;
    --destructive-muted: 4 40% 12%;
    --border: 240 5% 18%;
    --input: 240 5% 18%;
    --ring: 213 55% 68%;

    --surface-sidebar: #111114;
    --surface-card-soft: #1C1C1F;
    --border-soft: rgba(255, 255, 255, 0.06);
    --input-border: #2E2E33;
    --input-border-strong: #48484D;
    --text-primary: #F5F5F7;
    --text-secondary: #A1A1A6;
    --text-secondary-alt: #C7C7CC;
    --text-muted: #8E8E93;
    --navy: #6C8FC7;
    --navy-hover: #85A3D6;
    --navy-soft: #16233A;
    --navy-text: #9FB1CE;
    --navy-muted: #7D93B8;
    --navy-muted-2: #64789C;
    --status-success: #34C77B;
    --status-success-soft: #0F2A1B;
    --status-warning: #E0A63A;
    --status-warning-soft: #2E2308;
    --status-danger: #E5564A;
    --status-danger-soft: #2E1210;
    --neutral-soft: #2A2A2E;
    --overlay: rgba(0, 0, 0, 0.55);
    --toast-bg: #1D1D1F;
  }
```

- [ ] **Step 4: Confirm the file still parses as valid CSS**

Run: `npx tsc --noEmit` and start the dev server briefly: `npm run dev` then request `http://localhost:3000/` — expect it to compile with no CSS errors in the terminal. Stop the dev server after confirming; do not leave it running.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add token CSS variables and dark mode block"
```

---

### Task 2: Rewrite `tokens.ts` to reference the new CSS variables

**Files:**
- Modify: `src/lib/design/tokens.ts:4-36`

- [ ] **Step 1: Replace the `COLORS` object's values with `var(...)` references**

Keep every key name identical (the 47 consuming files import these by name and must not change).

```ts
export const COLORS = {
  bg: 'hsl(var(--background))',
  bgSidebar: 'var(--surface-sidebar)',
  bgCard: 'var(--surface-card-soft)',
  border: 'hsl(var(--border))',
  borderSoft: 'var(--border-soft)',
  inputBorder: 'var(--input-border)',
  inputBorderStrong: 'var(--input-border-strong)',

  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textSecondaryAlt: 'var(--text-secondary-alt)',
  textMuted: 'var(--text-muted)',

  navy: 'var(--navy)',
  navyHover: 'var(--navy-hover)',
  navySoft: 'var(--navy-soft)',
  navyText: 'var(--navy-text)', // used on navy backgrounds (Super Admin sidebar)
  navyMuted: 'var(--navy-muted)',
  navyMuted2: 'var(--navy-muted-2)',

  success: 'var(--status-success)',
  successSoft: 'var(--status-success-soft)',
  warning: 'var(--status-warning)',
  warningSoft: 'var(--status-warning-soft)',
  danger: 'var(--status-danger)',
  dangerSoft: 'var(--status-danger-soft)',
  neutralSoft: 'var(--neutral-soft)',

  white: '#FFFFFF',
  overlay: 'var(--overlay)',
  toastBg: 'var(--toast-bg)',
} as const;
```

Note `white` stays a literal `#FFFFFF` on purpose: it is used for text/icon color *on top of* colored surfaces (e.g. white text on the navy sidebar), not as a themeable surface itself, so it must not flip in dark mode.

- [ ] **Step 2: Update the file's header comment to reflect the new rule**

Replace:

```ts
// PQRS Services — design tokens. Exact hex values used across every screen of the redesign.
// Do NOT invent new colors — every visual should pull from here.
```

with:

```ts
// PQRS Services — design tokens. Every value here is a CSS variable defined in
// src/app/globals.css (:root for light, .dark for dark mode). Do NOT hardcode
// a new hex value in this file or in consuming components — add the variable
// to globals.css first, then reference it here.
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` — expect no new errors (the exported shape/types are unchanged: still `Record<string, string>` via `as const`).

- [ ] **Step 4: Manual visual check (light mode, no regression)**

Run `npm run dev`, open `/admin/configuracion` and `/residente` in a browser. Colors must look identical to before, since every new variable's light value equals the original hex.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/tokens.ts
git commit -m "refactor(design): point tokens.ts colors at CSS variables"
```

---

### Task 3: Wire up `next-themes` so `.dark` is actually applied

**Files:**
- Create: `src/components/theme-provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the client-side theme provider wrapper**

Mirror the existing pattern in `src/components/session-provider.tsx`:

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 2: Wrap the app with it in `layout.tsx`**

Add the import:

```tsx
import { SessionProvider } from "@/components/session-provider";
import { ThemeProvider } from "@/components/theme-provider";
```

and change the body from:

```tsx
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
```

to:

```tsx
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
```

`suppressHydrationWarning` on `<body>` is `next-themes`' documented requirement.

- [ ] **Step 3: Type-check and start the app**

Run: `npx tsc --noEmit`, then `npm run dev`. Toggle your OS-level color scheme with the tab open — `<html>` should gain/lose `class="dark"` (check DevTools Elements panel) and the background should switch between the light/dark values from Task 1. There is no in-app toggle button yet (out of scope here); `system` is the only source of truth for now.

- [ ] **Step 4: Commit**

```bash
git add src/components/theme-provider.tsx src/app/layout.tsx
git commit -m "feat(design): wire up next-themes so dark mode actually applies"
```

---

### Task 4: Generate real shadcn components

**Files:**
- Create: `src/components/ui/button.tsx`, `input.tsx`, `card.tsx`, `badge.tsx`, `separator.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `tabs.tsx`, `table.tsx` (exact filenames decided by the shadcn CLI; do not hand-author these)

- [ ] **Step 1: Add the components via the official CLI**

```bash
npx shadcn@latest add button input card badge separator dialog sheet dropdown-menu tabs table
```

If the CLI prompts to overwrite `components.json` or `tailwind.config.ts`, answer **no**. If it prompts for something under `src/components/ui/` that doesn't exist yet, accept.

- [ ] **Step 2: Confirm nothing outside `src/components/ui/` and `package.json`/`package-lock.json` changed**

Run: `git status --short` — expect only new files under `src/components/ui/`, and dependency additions in `package.json`/`package-lock.json`. If `tailwind.config.ts`, `components.json`, or anything under `src/app` shows modified, stop and investigate.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit` and `npm run lint`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui package.json package-lock.json
git commit -m "feat(design): generate shadcn/ui base components"
```

---

### Task 5: Remove the landing page's redundant font loading

**Files:**
- Modify: `src/app/page.tsx` (delete `FONT_LINK` constant, the two `<link>` tags, and the inline `fontFamily` override)

- [ ] **Step 1: Delete the `FONT_LINK` constant**

```ts
const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap';
```

- [ ] **Step 2: Delete the `<link>` tags that load it**

```tsx
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href={FONT_LINK} rel="stylesheet" />
```

`layout.tsx` already applies `font-sans` (Manrope, via `next/font`) to `<html>`, and this page renders inside that layout, so it already inherits the correct font.

- [ ] **Step 3: Remove the explicit inline font override**

Find the inline style pinning the page to Manrope explicitly (`fontFamily: "'Manrope', sans-serif"`, around line 403) and delete that property from its `style={{ ... }}` object. Leave every other property untouched.

- [ ] **Step 4: Manual visual check**

Run `npm run dev`, open `http://localhost:3000/`. Typeface must look identical (still Manrope, inherited). Open Network tab, confirm no request to `fonts.googleapis.com`.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix(landing): remove duplicate Google Fonts loading, inherit next/font"
```

---

### Task 6: Final verification pass

- [ ] **Step 1: Full type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 2: Run the existing test suite once**

```bash
npm test
```

This plan touches no business logic and no Prisma schema, so this is a pure regression check. Expect the same pass count as the last known-green run; investigate any new failure before proceeding.

- [ ] **Step 3: Manual cross-role visual pass**

With `npm run dev` running, visit each of the following in both light and dark (toggle via OS setting): `/`, `/auth/login`, `/admin/dashboard`, `/admin/pqrs`, `/residente`, `/consejo/reportes`, `/(protected)/super-admin`. Confirm no unstyled flash, no illegible text, and light mode pixel-identical to before this plan.

- [ ] **Step 4: Report completion**

Summarize what changed, confirm zero business-logic files were touched (only `globals.css`, `tokens.ts`, `layout.tsx`, one new `theme-provider.tsx`, generated `src/components/ui/*`, and `page.tsx`'s font-loading lines), and hand off to the user to decide the next plan (Fase 1 consistency/a11y pass, or the landing page's responsive-sizing rework that unblocks its Server Component conversion).
