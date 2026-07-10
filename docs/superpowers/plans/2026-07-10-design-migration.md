# Migración al diseño final (nextjs_export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live design system (`src/components/design-export`, `src/lib/design-export`) and every page's markup with the final design shipped in `nextjs_export/`, while preserving 100% of the existing data-fetching/mutation logic — no backend, Prisma, or API changes.

**Architecture:** `nextjs_export/` is a static Next.js mockup export (only `next`/`react`/`react-dom` deps, no data fetching) of the same component system already partially live under `src/components/design-export`. Per file, the "winner" content is decided by comparing both versions: keep whichever side already has the real logic (fetch calls, mutations, computed values) and layer in whatever *additional UI* the other side has that the first lacks. The shell components (`AdminShell`, `SuperAdminShell`, `ResidentShell`, `Sheet`, `Toast`, `Logo`) and `tokens.ts`/`adminNav.ts` move to their final home: `src/components/shell/` and `src/lib/design/`.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, NextAuth, Prisma. No new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-07-10-design-migration-design.md`

---

## Ground truth gathered before writing this plan

Diffing `nextjs_export/*` against the live `src/components/design-export/*` and `src/lib/design-export/*` showed the **shell layer is already the same design**, byte-for-byte except:
- import paths (`@/lib/design-export/tokens` vs `@/lib/tokens`, `@/components/design-export/X` vs `@/components/X`)
- `/auth/login` (live, correct per user decision) vs `/login` (export)
- `AdminShell` in the live tree already fetches `/api/me` to show real tenant/user name — the export version does not. **Keep the live logic**, just relocate the file.

So Task 1 is a **relocation + import-path fix**, not a content rewrite.

For **pages**, the delta varies by file — confirmed via direct diff/read:
- `admin/dashboard`: export adds an "Actividad reciente" timeline block and a 4th quick-link card ("Crear PQRS"). No activity-log endpoint exists yet (`src/app/api` has no `/api/activity`) — the `admin/actividad` page has its own data source, see Task 9.
- `admin/pqrs`: export's UI implies a 5-stage stepper (`Radicada → Recibida → En revisión → En proceso → Terminada`), a `priority` field, and multi-entry `internalNotes`/`history` lists. **None of these exist in `prisma/schema.prisma`'s `Pqrs` model** — it only has `estado` (`EN_ESPERA | EN_PROGRESO | TERMINADO`), `faseActual` (admin-only phase number, different concept), `notaPrimerContacto`, `accionTomada`, `evidenciaCierre` (single fields, not lists). This is flagged explicitly in Task 10 — do not invent fake multi-entry data.
- `admin/usuarios`: export has an inline "Invitar usuario" sheet with fake data. The live app already has a **real, separate** invitation flow at `/admin/invitaciones` (`/api/invitations`). Keep linking to that page rather than reintroducing a fake inline invite sheet.
- Every live page's exact endpoint(s) (grabbed via grep across `src/app/**/page.tsx`):
  - `admin/dashboard` → `/api/dashboard?year=`, `/api/me`
  - `admin/pqrs` → `/api/pqrs`, `/api/pqrs/:id` (PATCH)
  - `admin/usuarios` → `/api/users`, `/api/users/:id` (PATCH)
  - `admin/reportes` → `/api/reportes?year=`
  - `admin/licencias` → `/api/me`
  - `admin/invitaciones` → `/api/invitations`, `/api/invitations/:id/:action`
  - `admin/configuracion` → `/api/me`, `/api/tenant` (PATCH)
  - `admin/cuenta` → `/api/me`, `/api/notifications`
  - `admin/actividad`, `admin/ayuda` → no fetch calls (static/local state already)
  - `residente` → `/api/pqrs`, `/api/notifications`, `/api/me`, `/api/pqrs/:id` (PATCH)
  - `consejo` → `/api/pqrs`, `/api/me`
  - `(protected)/super-admin` → `/api/platform/super-admin` (GET/POST/PATCH)
  - `onboarding/admin`, `onboarding/residente` → `/api/me`, `/api/onboarding`
  - `invitacion` → `/api/invitations/accept`
  - `auth/login` → `/api/me`, NextAuth `signIn`
  - `auth/olvidar-contrasena` → `/api/auth/forgot-password`
  - `auth/restablecer-contrasena` → `/api/auth/reset-password`
  - `auth/registro` → `/api/auth/register`

---

## File structure

**Create:**
- `src/components/shell/AdminShell.tsx`, `SuperAdminShell.tsx`, `ResidentShell.tsx`, `Sheet.tsx`, `Toast.tsx`, `Logo.tsx`
- `src/lib/design/tokens.ts`, `src/lib/design/adminNav.ts`

**Modify:** every file under `src/app/{admin,auth,onboarding}/**/page.tsx`, `src/app/{residente,consejo,invitacion,recuperar-contrasena,registro}/**/page.tsx`, `src/app/(protected)/super-admin/page.tsx`, `src/app/globals.css`, `public/logo.svg` (if it differs).

**Delete (final task):** `src/components/design-export/`, `src/lib/design-export/`, `nextjs_export/`.

---

### Task 1: Install the design system at its final location

**Files:**
- Create: `src/components/shell/AdminShell.tsx` (copy `src/components/design-export/AdminShell.tsx` verbatim — it already has the real `/api/me` wiring — only change the two imports)
- Create: `src/components/shell/SuperAdminShell.tsx`, `src/components/shell/ResidentShell.tsx`, `src/components/shell/Sheet.tsx`, `src/components/shell/Toast.tsx`, `src/components/shell/Logo.tsx` (copy verbatim from `src/components/design-export/*`, only fixing the `@/lib/design-export/tokens` import to `@/lib/design/tokens`, and for `AdminShell.tsx`/`SuperAdminShell.tsx`/`ResidentShell.tsx` fixing the `./Logo` / `./Sheet` relative imports — those stay relative, no change needed since siblings move together)
- Create: `src/lib/design/tokens.ts` (copy `src/lib/design-export/tokens.ts` verbatim, no import changes needed — it has none)
- Create: `src/lib/design/adminNav.ts` (copy `src/lib/design-export/adminNav.ts`, fixing `import type { NavItem } from '@/components/design-export/AdminShell'` to `'@/components/shell/AdminShell'`)

- [ ] **Step 1: Copy the 6 components and 2 lib files to their new home**

```bash
mkdir -p src/components/shell src/lib/design
cp src/components/design-export/AdminShell.tsx src/components/shell/AdminShell.tsx
cp src/components/design-export/SuperAdminShell.tsx src/components/shell/SuperAdminShell.tsx
cp src/components/design-export/ResidentShell.tsx src/components/shell/ResidentShell.tsx
cp src/components/design-export/Sheet.tsx src/components/shell/Sheet.tsx
cp src/components/design-export/Toast.tsx src/components/shell/Toast.tsx
cp src/components/design-export/Logo.tsx src/components/shell/Logo.tsx
cp src/lib/design-export/tokens.ts src/lib/design/tokens.ts
cp src/lib/design-export/adminNav.ts src/lib/design/adminNav.ts
```

- [ ] **Step 2: Fix imports in the 8 new files**

In `src/components/shell/AdminShell.tsx`, `SuperAdminShell.tsx`, `ResidentShell.tsx`, `Sheet.tsx`, `Toast.tsx`: replace `from '@/lib/design-export/tokens'` with `from '@/lib/design/tokens'`.

In `src/lib/design/adminNav.ts`: replace `from '@/components/design-export/AdminShell'` with `from '@/components/shell/AdminShell'`.

`Logo.tsx` has no `@/lib/design-export` import — leave as-is.

- [ ] **Step 3: Diff `public/logo.svg` against `nextjs_export/public/logo.svg`, replace if different**

```bash
diff public/logo.svg nextjs_export/public/logo.svg
```

If they differ, `cp nextjs_export/public/logo.svg public/logo.svg`.

- [ ] **Step 4: Merge `globals.css`**

Read `src/app/globals.css` and `nextjs_export/app/globals.css`. The export's file has the Google Fonts `@import` (Manrope + JetBrains Mono), the `apl-*` keyframes/animation classes, and base resets (`::selection`, `a`, `input:focus`). Add any of these rules that are missing from the live `src/app/globals.css` — do not remove existing Tailwind `@tailwind` directives or other rules already there. Read the live file first before editing to confirm nothing is duplicated.

- [ ] **Step 5: Verify the new files compile in isolation (nothing imports them yet, so this only checks syntax)**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/components/shell` or `src/lib/design`.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell src/lib/design public/logo.svg src/app/globals.css
git commit -m "feat: install final design system at src/components/shell and src/lib/design"
```

---

### Task 2: Migrate `auth/login`

**Files:**
- Read: `src/app/auth/login/page.tsx` (live, 470 lines — has real `signIn` call + `/api/me` post-login redirect logic), `nextjs_export/app/login/page.tsx` (93 lines, visual reference)
- Modify: `src/app/auth/login/page.tsx`

- [ ] **Step 1: Read both files fully.**

- [ ] **Step 2: Rewrite `src/app/auth/login/page.tsx` using `nextjs_export/app/login/page.tsx`'s JSX/markup as the visual base**, but:
  - Keep the real `signIn(...)` call and the post-login `/api/me` fetch + role-based redirect logic from the live file — do not replace with a fake `onSubmit`.
  - Keep the route at `/auth/login` (do not rename the file/folder).
  - Update imports to `@/components/shell/*` and `@/lib/design/*` where the new page uses shell components/tokens (check `nextjs_export/app/login/page.tsx`'s imports first — it may inline its own styles rather than use `AdminShell`, in which case just import `COLORS`/`RADIUS` from `@/lib/design/tokens` and `LogoMark`/`BrandLockup` from `@/components/shell/Logo` as needed).

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```
Expected: no errors. Manually confirm the `/auth/login` route still appears in the build output.

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/login/page.tsx
git commit -m "feat: apply final design to /auth/login"
```

---

### Task 3: Migrate `auth/olvidar-contrasena` (using the export's `recuperar-contrasena` design)

**Files:**
- Read: `src/app/auth/olvidar-contrasena/page.tsx` (live, 75 lines, real `/api/auth/forgot-password` call, but built with an inline one-off `Logo` component, not the shared shell system), `nextjs_export/app/recuperar-contrasena/page.tsx` (79 lines)
- Modify: `src/app/auth/olvidar-contrasena/page.tsx`
- Leave untouched: `src/app/recuperar-contrasena/page.tsx` (5-line alias that `redirect()`s to `/auth/olvidar-contrasena` — still correct, no change needed)

- [ ] **Step 1: Read both files fully.**

- [ ] **Step 2: Rewrite `src/app/auth/olvidar-contrasena/page.tsx`** using `nextjs_export/app/recuperar-contrasena/page.tsx` as the visual base, keeping the real `fetch('/api/auth/forgot-password', ...)` call and its success/error state handling from the live file. Replace the page's local inline `Logo` function with `LogoMark`/`BrandLockup` imported from `@/components/shell/Logo`, and inline colors with `COLORS`/`RADIUS` from `@/lib/design/tokens`.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/olvidar-contrasena/page.tsx
git commit -m "feat: apply final design to /auth/olvidar-contrasena"
```

---

### Task 4: Migrate `invitacion`

**Files:**
- Read: `src/app/invitacion/page.tsx` (live, 71 lines, real `/api/invitations/accept` GET+POST), `nextjs_export/app/invitacion/page.tsx` (60 lines)
- Modify: `src/app/invitacion/page.tsx`

- [ ] **Step 1: Read both files fully.** (Live is longer than the export here — likely already has more real-data wiring. Confirm which JSX blocks in the export are missing from live and only port those; do not regress functionality.)

- [ ] **Step 2: Merge**: keep every `fetch('/api/invitations/accept...')` call from the live file; adopt the export's visual layout/spacing for anything cosmetic. Update imports to `@/components/shell/Logo` and `@/lib/design/tokens`.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/invitacion/page.tsx
git commit -m "feat: apply final design to /invitacion"
```

---

### Task 5: Migrate `onboarding/admin`

**Files:**
- Read: `src/app/onboarding/admin/page.tsx` (live, 42 lines; fetches `/api/me`, posts to `/api/onboarding` with `{name, tenantName, city, inviteEmail, inviteRole}`), `nextjs_export/app/onboarding/admin/page.tsx` (102 lines)
- Modify: `src/app/onboarding/admin/page.tsx`

- [ ] **Step 1: Read both files fully.**

- [ ] **Step 2: Rewrite using the export's JSX as the base**, keeping the live file's `useEffect` that loads `/api/me` (redirecting to `/admin/dashboard` if `onboardingCompletedAt` is set) and the `POST /api/onboarding` submit handler with the exact same body shape (`name`, `tenantName`, `city`, `inviteEmail`, `inviteRole`). Update imports to `@/components/shell/Logo` and `@/lib/design/tokens`.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/admin/page.tsx
git commit -m "feat: apply final design to /onboarding/admin"
```

---

### Task 6: Migrate `onboarding/residente`

**Files:**
- Read: `src/app/onboarding/residente/page.tsx` (live, 26 lines; fetches `/api/me`, posts `/api/onboarding` with `{name, phone}`), `nextjs_export/app/onboarding/residente/page.tsx` (70 lines)
- Modify: `src/app/onboarding/residente/page.tsx`

- [ ] **Step 1: Read both files fully.**

- [ ] **Step 2: Rewrite using the export's JSX as the base**, keeping the live `/api/me` load (redirect to `/residente` if already onboarded, prefill `name`/`phone`/computed `location` string from `bloque`/`apto`) and the `POST /api/onboarding` submit with `{name, phone}`. Update imports to `@/components/shell/Logo` and `@/lib/design/tokens`.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/residente/page.tsx
git commit -m "feat: apply final design to /onboarding/residente"
```

---

### Task 7: Migrate `onboarding/consejo`

**Files:**
- Read: `src/app/onboarding/consejo/page.tsx` (live, 51 lines), `nextjs_export/app/onboarding/consejo/page.tsx` (50 lines — nearly identical size, likely just import-path differences)
- Modify: `src/app/onboarding/consejo/page.tsx`

- [ ] **Step 1: Diff the two files directly**

```bash
diff src/app/onboarding/consejo/page.tsx nextjs_export/app/onboarding/consejo/page.tsx
```

- [ ] **Step 2: If the diff is purely import paths (`@/lib/design-export/tokens` → `@/lib/design/tokens`, `@/components/design-export/Logo` → `@/components/shell/Logo`) and a stray BOM/blank line, apply only those import fixes — keep the live file's logic untouched.** If the diff reveals additional JSX in the export version, port those additions the same way as prior tasks (keep live logic, adopt new visual elements).

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/consejo/page.tsx
git commit -m "feat: apply final design to /onboarding/consejo"
```

---

### Task 8: Migrate `admin/dashboard`

**Files:**
- Modify: `src/app/admin/dashboard/page.tsx`
- Reference: `nextjs_export/app/admin/dashboard/page.tsx`

- [ ] **Step 1: Add the "Actividad reciente" section and the 4th quick-link card from the export to the live page**, inserting them into the existing right-column `<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>` block (currently holding the "Licencia" card and the 2-card grid) — expand that grid to include "Crear PQRS" as a 3rd/4th link like the export shows.

  For the "Actividad reciente" timeline: **there is no activity-log API endpoint today** (`src/app/api` has no `/api/activity` route; `admin/actividad/page.tsx` has no fetch call either — confirm this hasn't changed by grep before writing code: `grep -rn "fetch(" src/app/admin/actividad/page.tsx`). Since building a real activity feed is a new backend feature, **do not fabricate fake activity entries**. Instead: omit the "Actividad reciente" block from this task and open it as a flagged follow-up (note it in the task's commit message body), OR — if the user is available synchronously — ask whether to (a) skip it for now or (b) scope a minimal `/api/activity` endpoint as a separate task. Default to (a) skip for this pass.

  Keep every existing `fetch` call (`/api/dashboard?year=`, `/api/me`) and the existing `metrics`/`rows` computation as-is; only change the JSX layout to match the export's visual structure (imports, cards, columns).

- [ ] **Step 2: Update imports** from `@/components/design-export/AdminShell` → `@/components/shell/AdminShell`, `@/lib/design-export/adminNav` → `@/lib/design/adminNav`, `@/lib/design-export/tokens` → `@/lib/design/tokens`.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/dashboard/page.tsx
git commit -m "feat: apply final design to /admin/dashboard"
```

---

### Task 9: Migrate `admin/actividad`

**Files:**
- Read: `src/app/admin/actividad/page.tsx` (live, 47 lines), `nextjs_export/app/admin/actividad/page.tsx` (45 lines — nearly identical size)
- Modify: `src/app/admin/actividad/page.tsx`

- [ ] **Step 1: Diff the two files directly**

```bash
diff src/app/admin/actividad/page.tsx nextjs_export/app/admin/actividad/page.tsx
```

- [ ] **Step 2: Apply the import-path fixes** (`design-export` → `shell`/`design`). If the diff shows more than import paths, port additive JSX from the export the same way as previous tasks, preserving any real logic already in the live file (check for `fetch(` calls first — if none exist, this page is static/local-state only on both sides, so a straight adopt of the export's JSX with fixed imports is safe).

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/actividad/page.tsx
git commit -m "feat: apply final design to /admin/actividad"
```

---

### Task 10: Migrate `admin/pqrs`

**Files:**
- Modify: `src/app/admin/pqrs/page.tsx` (live version already shown in full above: real `/api/pqrs` GET, `/api/pqrs/:id` PATCH for `advance()`, `/api/pqrs` POST for `submitCreate()`)
- Reference: `nextjs_export/app/admin/pqrs/page.tsx`

- [ ] **Step 1: Keep every real data call from the live file** (`load()` via `GET /api/pqrs`, `advance(id, current)` via `PATCH /api/pqrs/:id`, `submitCreate()` via `POST /api/pqrs`) and the real `Pqrs` type (`estado: 'EN_ESPERA'|'EN_PROGRESO'|'TERMINADO'`, `faseActual`, etc. — matches `prisma/schema.prisma`'s `Pqrs` model, do not change field names).

- [ ] **Step 2: Adopt the export's visual layout** (list + detail 2-column grid, search, filter tabs, create sheet) but **do not implement the export's 5-stage stepper, `priority` field, or multi-entry `internalNotes`/`history` lists** — none of these exist in the Prisma schema (`prisma/schema.prisma:223` `model Pqrs`, confirmed fields: `estado`, `faseActual`, `notaPrimerContacto`, `accionTomada`, `evidenciaCierre` — no `priority`, no notes/history tables). Replace those export-only sections with the equivalent real data:
  - Instead of the 5-stage stepper, keep the live 3-badge status system (`EN_ESPERA`/`EN_PROGRESO`/`TERMINADO` → "Abierta"/"En proceso"/"Terminada"), but you may restyle it using the export's stepper *visual* compressed to 3 positions if desired.
  - Instead of a fake `history` list, show the real single-value fields that exist: `notaPrimerContacto` (if set) and `accionTomada`/`evidenciaCierre` (if `estado === 'TERMINADO'`) as one or two static entries, not a growing list.
  - Omit the `priority` badge entirely — there is no backing field. If the user wants PQRS priority as a feature, that is a schema change to scope separately; do not invent client-side-only fake priority.
  - Keep the "Agregar nota interna" button removed unless a real endpoint exists for a *list* of internal notes (it doesn't — `notaPrimerContacto` is a single field already settable elsewhere). Do not add a fake button that doesn't persist anything.

- [ ] **Step 3: Update imports** to `@/components/shell/{AdminShell,Sheet,Toast}` and `@/lib/design/{adminNav,tokens}`.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Manually test in the running dev server** (start with `npm run dev`, login as an ADMIN user, visit `/admin/pqrs`): confirm the list loads real PQRS from the database, filters work, "Avanzar estado" actually calls the PATCH endpoint and changes state, "+ Crear PQRS" actually creates a row.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/pqrs/page.tsx
git commit -m "feat: apply final design to /admin/pqrs (kept real schema fields, dropped mockup-only priority/stepper/notes-list)"
```

---

### Task 11: Migrate `admin/usuarios`

**Files:**
- Modify: `src/app/admin/usuarios/page.tsx` (live version already shown in full above: real `/api/users` GET, `/api/users/:id` PATCH)
- Reference: `nextjs_export/app/admin/usuarios/page.tsx`

- [ ] **Step 1: Keep every real data call from the live file** (`load()` via `GET /api/users`, `save(patch)` via `PATCH /api/users/:id` for role/isActive changes) and the real `User`/`Role` types (`Role = 'ADMIN'|'ASISTENTE'|'CONSEJO'|'RESIDENTE'`, matches actual system roles — the export's mockup uses a different, smaller role set `'admin'|'consejo'|'residente'` which is wrong, do not adopt it).

- [ ] **Step 2: Adopt the export's visual layout** (search bar, filter tabs, list rows, edit sheet) but keep the "+ Invitar usuario" button as a `<Link href="/admin/invitaciones">` (as it already is live) — **do not** reintroduce the export's fake inline "Invitar usuario" sheet with local-only state; the real invitation flow already lives at `/admin/invitaciones` (`/api/invitations`), covered in Task 12.

- [ ] **Step 3: Update imports** to `@/components/shell/{AdminShell,Sheet,Toast}` and `@/lib/design/{adminNav,tokens}`.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/usuarios/page.tsx
git commit -m "feat: apply final design to /admin/usuarios (kept real roles, linked to real invitations flow)"
```

---

### Task 12: Migrate `admin/invitaciones`

**Files:**
- Read: `src/app/admin/invitaciones/page.tsx` (live, 91 lines — already longer than the export's 81, likely already ahead in real-data terms), `nextjs_export/app/admin/invitaciones/page.tsx`
- Modify: `src/app/admin/invitaciones/page.tsx`

- [ ] **Step 1: Read both files fully.**

- [ ] **Step 2: Keep every real call from the live file** (`GET /api/invitations`, `POST /api/invitations` to create, `POST /api/invitations/:id/:action` for cancel/resend). Port only cosmetic/layout differences from the export.

- [ ] **Step 3: Update imports** to `@/components/shell/{AdminShell,Sheet,Toast}` and `@/lib/design/{adminNav,tokens}`.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/invitaciones/page.tsx
git commit -m "feat: apply final design to /admin/invitaciones"
```

---

### Task 13: Migrate `admin/reportes`

**Files:**
- Read: `src/app/admin/reportes/page.tsx` (live, 29 lines; fetches `/api/reportes?year=`, has an Excel export link/button — check for a `/api/reportes/excel` link), `nextjs_export/app/admin/reportes/page.tsx` (81 lines)
- Modify: `src/app/admin/reportes/page.tsx`

- [ ] **Step 1: Read both files fully.**

- [ ] **Step 2: Rewrite using the export's JSX as the base**, keeping the live `useEffect` that fetches `/api/reportes?year=${new Date().getFullYear()}` and any existing link/button to `/api/reportes/excel` for the Excel download (grep to confirm: `grep -n "excel" src/app/admin/reportes/page.tsx`). If the export adds chart/graph visuals not backed by `/api/reportes`'s response shape, check the response fields the live page already destructures and only chart what's real — flag any visual in the export that needs a field `/api/reportes/route.ts` doesn't return yet, rather than hardcoding numbers.

- [ ] **Step 3: Update imports** to `@/components/shell/{AdminShell,Toast}` and `@/lib/design/{adminNav,tokens}`.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/reportes/page.tsx
git commit -m "feat: apply final design to /admin/reportes"
```

---

### Task 14: Migrate `admin/licencias`

**Files:**
- Read: `src/app/admin/licencias/page.tsx` (live, 26 lines; fetches `/api/me` for `licenseSummary`/tenant/subscription data), `nextjs_export/app/admin/licencias/page.tsx` (86 lines)
- Modify: `src/app/admin/licencias/page.tsx`

- [ ] **Step 1: Read both files fully.**

- [ ] **Step 2: Rewrite using the export's JSX as the base**, keeping the live `useEffect(() => { fetch('/api/me')... }, [])` and whatever license/subscription fields it already reads from the response. Check `src/app/api/me/route.ts` for the exact response shape before assuming any field exists; if the export shows a field (e.g., payment history, invoice list) that `/api/me` doesn't return, flag it rather than fabricating rows.

- [ ] **Step 3: Update imports** to `@/components/shell/{AdminShell,Toast}` and `@/lib/design/{adminNav,tokens}`.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/licencias/page.tsx
git commit -m "feat: apply final design to /admin/licencias"
```

---

### Task 15: Migrate `admin/configuracion`

**Files:**
- Modify: `src/app/admin/configuracion/page.tsx` (live, 22 lines; fetches `/api/me` to prefill, `PATCH /api/tenant` with `{name, city, address}` to save)
- Reference: `nextjs_export/app/admin/configuracion/page.tsx` (61 lines)

- [ ] **Step 1: Keep the live `useEffect` prefill from `/api/me`** (`tenant.name`, `tenant.city`, `tenant.address`, `user.email`) **and the `saveTenant()` `PATCH /api/tenant` call** exactly as-is.

- [ ] **Step 2: Adopt the export's visual layout** for the form (more fields/sections may appear in the export — only wire the ones matching real `/api/tenant` PATCH-accepted fields; check `src/app/api/tenant/route.ts` for what it accepts before adding new form fields that don't persist).

- [ ] **Step 3: Update imports** to `@/components/shell/{AdminShell,Toast}` and `@/lib/design/{adminNav,tokens}`.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/configuracion/page.tsx
git commit -m "feat: apply final design to /admin/configuracion"
```

---

### Task 16: Migrate `admin/cuenta`

**Files:**
- Modify: `src/app/admin/cuenta/page.tsx` (live, 28 lines; `load()` via `Promise.all([/api/me, /api/notifications])`, `save()` via `PATCH /api/me`, `read()`/`readAll()` via `PATCH /api/notifications`)
- Reference: `nextjs_export/app/admin/cuenta/page.tsx` (65 lines)

- [ ] **Step 1: Keep every real call from the live file** (`/api/me` GET+PATCH for profile, `/api/notifications` GET+PATCH for the notifications tab) exactly as-is, including the notification click-through to `/admin/pqrs?id=...`.

- [ ] **Step 2: Adopt the export's visual layout** (tabs for "Perfil"/"Notificaciones" already exist live per the earlier grep — confirm the export has the same two tabs or more, and only add tabs/sections that map to data already fetched).

- [ ] **Step 3: Update imports** to `@/components/shell/{AdminShell,Toast}` and `@/lib/design/{adminNav,tokens}`.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/cuenta/page.tsx
git commit -m "feat: apply final design to /admin/cuenta"
```

---

### Task 17: Migrate `admin/ayuda`

**Files:**
- Read: `src/app/admin/ayuda/page.tsx` (live, 56 lines), `nextjs_export/app/admin/ayuda/page.tsx` (54 lines — nearly identical size, static content only, no `fetch` calls on either side per earlier grep)
- Modify: `src/app/admin/ayuda/page.tsx`

- [ ] **Step 1: Diff the two files directly**

```bash
diff src/app/admin/ayuda/page.tsx nextjs_export/app/admin/ayuda/page.tsx
```

- [ ] **Step 2: Since this page is static (FAQ/help content, no real data), apply the export's JSX directly**, only fixing imports (`@/components/design-export/AdminShell` → `@/components/shell/AdminShell`, `@/lib/design-export/{adminNav,tokens}` → `@/lib/design/{adminNav,tokens}`). If the live file's help copy/content differs meaningfully from the export's (e.g. different FAQ questions), keep the live content text but use the export's structural/visual wrapper.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/ayuda/page.tsx
git commit -m "feat: apply final design to /admin/ayuda"
```

---

### Task 18: Migrate `residente`

**Files:**
- Modify: `src/app/residente/page.tsx` (live, 88 lines; real calls: `GET /api/pqrs`, `GET /api/notifications`, `GET /api/me`, `GET /api/pqrs/:id`, `POST /api/pqrs` to create, `PATCH /api/pqrs/:id` to edit, `PATCH /api/notifications` to mark read, `PATCH /api/me` to save profile)
- Reference: `nextjs_export/app/residente/page.tsx` (242 lines — much richer UI: tabs, photo upload preview, category picker)

- [ ] **Step 1: Keep every real call listed above from the live file exactly as-is** — this page already has the most real-world wiring of any page in the app (photo upload via `fotos` array in the create-PQRS POST body). Do not regress any of it.

- [ ] **Step 2: Adopt the export's richer tabbed layout (Inicio/Historial/Notificaciones/Perfil or similar) and visual polish**, mapping each tab to the data the live file already fetches (`rows` from `/api/pqrs`, `notifications`, `me`). If the export's tab structure references a field the live fetch doesn't provide, keep the live field name (do not rename `descripcion`/`asunto`/`fotos` etc. — these must match the `POST /api/pqrs` body shape used elsewhere, e.g. `src/app/admin/pqrs/page.tsx`'s `submitCreate`).

- [ ] **Step 3: Update imports** to `@/components/shell/{ResidentShell,Sheet,Toast}` and `@/lib/design/tokens` (residente pages don't use `adminNav`).

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Manually test in the dev server**: login as RESIDENTE, confirm PQRS list loads, create-PQRS with a photo works, notifications tab marks read, profile save persists.

- [ ] **Step 6: Commit**

```bash
git add src/app/residente/page.tsx
git commit -m "feat: apply final design to /residente"
```

---

### Task 19: Migrate `consejo`

**Files:**
- Modify: `src/app/consejo/page.tsx` (live, 29 lines; `GET /api/pqrs`, `GET /api/me`)
- Reference: `nextjs_export/app/consejo/page.tsx` (128 lines — much richer, read-only oversight view)

- [ ] **Step 1: Keep the live `useEffect`** that loads `/api/pqrs` into `rows` and `/api/me` into `me`, exactly as-is. CONSEJO is read-only per `docs/TARGET_ARCHITECTURE.md` ("Consulta información") — do not add any mutation calls even if the export's mockup implies action buttons; render those as disabled/hidden, or omit them.

- [ ] **Step 2: Adopt the export's richer visual layout** (more stats/breakdowns) using only the `rows`/`me` data already fetched — compute any extra summary numbers (counts by estado, etc.) client-side from `rows`, the same way `admin/dashboard` already does with `useMemo`.

- [ ] **Step 3: Update imports** to `@/lib/design/tokens` (check whether `consejo` uses any shell component or is a bespoke layout — read the live file's current imports first to confirm).

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/consejo/page.tsx
git commit -m "feat: apply final design to /consejo"
```

---

### Task 20: Migrate `(protected)/super-admin`

**Files:**
- Modify: `src/app/(protected)/super-admin/page.tsx` (live, 433 lines, `GET/POST/PATCH /api/platform/super-admin`)
- Reference: `nextjs_export/app/super-admin/page.tsx` (433 lines — identical size, likely this page is already the export's design applied live, per the earlier head-comparison showing byte-identical `NAV_DEFS`/types)

- [ ] **Step 1: Diff the two files directly**

```bash
diff "src/app/(protected)/super-admin/page.tsx" nextjs_export/app/super-admin/page.tsx
```

- [ ] **Step 2: If the diff is empty or near-empty (just import paths), this page needs no content changes — only fix imports** from `@/components/design-export/*` (if any are used — check, since the earlier head read showed it importing `@/components/design-export/SuperAdminShell`, `@/components/design-export/Sheet`, `@/components/design-export/Toast`, `@/lib/design-export/tokens`) to `@/components/shell/*` / `@/lib/design/tokens`. If the diff shows real additive UI, port it the same way as prior tasks, keeping the three real `/api/platform/super-admin` calls untouched.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/super-admin/page.tsx"
git commit -m "feat: apply final design to /super-admin"
```

---

### Task 21: Manually adapt `auth/registro` (no export design exists)

**Files:**
- Modify: `src/app/auth/registro/page.tsx` (real `POST /api/auth/register` with `{email, password, name, bloque, apto}`)

- [ ] **Step 1: Read the current file.**

- [ ] **Step 2: Restyle only** — replace any inline colors/fonts with `COLORS`/`RADIUS`/`FONTS` from `@/lib/design/tokens`, and swap any local logo markup for `LogoMark`/`BrandLockup` from `@/components/shell/Logo`. Do not change the form fields, validation, or the `POST /api/auth/register` call/body shape.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/registro/page.tsx
git commit -m "style: apply design tokens to /auth/registro (no export reference available)"
```

---

### Task 22: Manually adapt `auth/restablecer-contrasena` (no export design exists)

**Files:**
- Modify: `src/app/auth/restablecer-contrasena/page.tsx` (real `POST /api/auth/reset-password` with `{token, password}`)

- [ ] **Step 1: Read the current file.**

- [ ] **Step 2: Restyle only**, same pattern as Task 21 — tokens + shell Logo, no logic changes.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/restablecer-contrasena/page.tsx
git commit -m "style: apply design tokens to /auth/restablecer-contrasena (no export reference available)"
```

---

### Task 23: Manually adapt `auth/error` (no export design exists)

**Files:**
- Modify: `src/app/auth/error/page.tsx`

- [ ] **Step 1: Read the current file.**

- [ ] **Step 2: Restyle only** using `@/lib/design/tokens` and `@/components/shell/Logo` — this page has no data fetching (it reads the `error` query param only), so this is a pure visual pass.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/error/page.tsx
git commit -m "style: apply design tokens to /auth/error (no export reference available)"
```

---

### Task 24: Manually adapt `registro/residente` (no export design exists)

**Files:**
- Modify: `src/app/registro/residente/page.tsx`

- [ ] **Step 1: Read the current file** (confirm whether it's a real form or an alias/redirect — check with `head -5 src/app/registro/residente/page.tsx` first, since several other top-level routes turned out to be 5-line redirect stubs during the earlier cleanup).

- [ ] **Step 2: If it's a real form, restyle only** using `@/lib/design/tokens` and `@/components/shell/Logo`, no logic changes. **If it's just a redirect stub, skip this task entirely** (nothing to restyle) and note that in the commit message instead, or drop the task.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit && npx next build
```

- [ ] **Step 4: Commit** (only if a change was made)

```bash
git add src/app/registro/residente/page.tsx
git commit -m "style: apply design tokens to /registro/residente (no export reference available)"
```

---

### Task 25: Final cleanup

**Files:**
- Delete: `src/components/design-export/`, `src/lib/design-export/`, `nextjs_export/`

- [ ] **Step 1: Confirm nothing still imports the old paths**

```bash
grep -rln "design-export" src/ || echo "clean"
```
Expected: `clean` (Tasks 1–24 should have removed every reference by now).

- [ ] **Step 2: Delete the old design system and the staging export folder**

```bash
rm -rf src/components/design-export src/lib/design-export nextjs_export
```

- [ ] **Step 3: Full verification**

```bash
npx tsc --noEmit
npx next build
```
Expected: clean build, same route list as before (compare against the route list from the "Rutas duplicadas" cleanup done earlier this session if needed).

- [ ] **Step 4: Manual browser walkthrough** (use the `run` skill or `npm run dev` directly): login → `/admin/dashboard` → `/admin/pqrs` (create + advance a PQRS) → `/admin/reportes` → logout → login as RESIDENTE → `/residente` (create a PQRS) → login as SUPER_ADMIN → `/super-admin`. Confirm every screen matches the `nextjs_export` visual reference and shows real data, not mock text.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old design-export system and nextjs_export staging folder"
```

---

## Self-review notes

- **Spec coverage:** all 19 pages with a ZIP equivalent (Tasks 2–20) + 4 manually-adapted pages (Tasks 21–24) + base install (Task 1) + cleanup (Task 25) = every section of the spec has a task.
- **Flagged gaps (intentional, not placeholders):** `admin/dashboard`'s activity feed (no backing endpoint) and `admin/pqrs`'s priority/multi-entry-notes/5-stage-stepper (no backing schema) are explicitly called out as *not* to be faked, with a concrete default action (skip / render only real fields) rather than left ambiguous.
- **Type consistency:** `Pqrs`, `User`/`Role`, `DashboardData` types are anchored to the live files' existing shapes throughout (Tasks 8, 10, 11), never to the export's invented mockup shapes.
