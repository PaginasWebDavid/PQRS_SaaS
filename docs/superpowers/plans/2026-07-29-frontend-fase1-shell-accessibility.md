# Fase 1a — Shell Navigation Accessibility Implementation Plan

> Ejecutado inline en esta sesión, sin subagentes/worktree, por decisión explícita del usuario. Basado en 3 auditorías de solo lectura (Explore agents) sobre `AdminShell.tsx`, `ResidentShell.tsx`, `SuperAdminShell.tsx`, `Sheet.tsx`, `admin/pqrs/page.tsx`, `residente/page.tsx`, `super-admin/page.tsx`, `consejo/page.tsx`.

**Goal:** Fix the single most pervasive, highest-leverage accessibility gap found across every shell: navigation and drawer/sheet controls that are `<div onClick>` (or real buttons missing `aria-label`/`aria-current`) instead of properly labeled, keyboard-operable controls. Zero visual change, zero business logic change — purely semantic/attribute additions plus swapping `div` for `button` where the element is already visually identical to a button.

**Scope for this plan (Fase 1a):** only the 3 shells + the shared `Sheet.tsx` component. Deferred to later Fase 1 plans: radius/hex token consolidation (dozens of occurrences per file, needs its own pass), `window.prompt`/`window.confirm` replacement in `admin/pqrs`/`residente` pages, table semantics in `super-admin/page.tsx`, duplicated badge-helper consolidation.

**Why `Sheet.tsx` first:** its exported `CloseButton` is imported by 8 app files (`super-admin/page.tsx`, `admin/invitaciones/page.tsx`, `admin/pqrs/page.tsx`, `admin/reportes/page.tsx`, `admin/usuarios/page.tsx`, `consejo/reportes/page.tsx`, `residente/page.tsx`, plus its own use inside `Sheet.tsx`). Fixing it once fixes all 8 call sites simultaneously.

---

### Task 1: Fix `CloseButton` in `src/components/shell/Sheet.tsx`

**Files:** Modify `src/components/shell/Sheet.tsx:95-108`

- [ ] Replace the `<div onClick>` with a real button, keeping the exact same visual style object:

```tsx
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar"
      style={{
        width: 30, height: 30, borderRadius: RADIUS.pill, background: COLORS.bgCard,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted,
        cursor: 'pointer', fontSize: 13, flexShrink: 0, border: 'none', font: 'inherit',
      }}
    >
      ✕
    </button>
  );
}
```

- [ ] Run `npx tsc --noEmit` and `npm run lint` — both must be clean.
- [ ] Manual check: `npm run dev`, open any sheet that uses `CloseButton` (e.g. `/admin/pqrs`, click "Nueva PQRS"), confirm it still renders identically and the close button is now reachable via Tab and activatable via Enter/Space.
- [ ] Commit: `git add src/components/shell/Sheet.tsx && git commit -m "fix(a11y): make the shared sheet CloseButton a real, labeled button"`

---

### Task 2: Fix `AdminShell.tsx` drawer controls + active-nav semantics

**Files:** Modify `src/components/shell/AdminShell.tsx:74-88` (NavLinks), `:124` (drawer close), `:141` (hamburger)

- [ ] In `NavLinks`, add `aria-current` to the active link (line ~79-84):

```tsx
        <Link
          key={n.key}
          href={n.href}
          onClick={onNavigate}
          aria-current={n.key === activeKey ? 'page' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
            fontSize: 13.5, fontWeight: n.key === activeKey ? 700 : 600,
            background: n.key === activeKey ? COLORS.navySoft : 'transparent',
            color: n.key === activeKey ? COLORS.navy : COLORS.textSecondaryAlt,
          }}
        >
```

- [ ] Replace the drawer-close `<div>` (line 124) with a button:

```tsx
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú" style={{ width: 30, height: 30, borderRadius: 999, background: COLORS.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, cursor: 'pointer', fontSize: 13, border: 'none', font: 'inherit' }}>✕</button>
```

- [ ] Replace the hamburger `<div>` (line 141) with a button:

```tsx
              <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú" style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, cursor: 'pointer', border: 'none', font: 'inherit' }}>☰</button>
```

- [ ] Run `npx tsc --noEmit` and `npm run lint`.
- [ ] Manual check: open `/admin/dashboard` on a narrow viewport (or resize devtools < 900px), confirm hamburger/close still look identical and are now Tab-reachable; confirm the active sidebar link is visually unchanged.
- [ ] Commit: `git add src/components/shell/AdminShell.tsx && git commit -m "fix(a11y): AdminShell drawer controls and active-nav semantics"`

---

### Task 3: Fix `ResidentShell.tsx` nav rows

**Files:** Modify `src/components/shell/ResidentShell.tsx:98-104` (desktop sidebar), `:140-143` (bottom nav)

- [ ] Desktop sidebar nav (line 98-104) — replace `<div onClick>` with `<button>`:

```tsx
            {visibleBottomNav.map((n) => (
              <button key={n.key} type="button" onClick={n.onClick} aria-current={n.key === activeKey ? 'page' : undefined} style={{
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, textAlign: 'left',
                fontWeight: n.key === activeKey ? 700 : 600,
                background: n.key === activeKey ? COLORS.navySoft : 'transparent',
                color: n.key === activeKey ? COLORS.navy : COLORS.textSecondaryAlt,
                border: 'none', font: 'inherit', width: '100%',
              }}>{n.label}</button>
            ))}
```

- [ ] Bottom mobile nav (line 140-143) — replace `<div onClick>` with `<button>`:

```tsx
            {visibleBottomNav.map((n) => (
              <button key={n.key} type="button" onClick={n.onClick} aria-current={n.key === activeKey ? 'page' : undefined} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 0', cursor: 'pointer', border: 'none', background: 'none', font: 'inherit' }}>
                <span style={{ fontSize: 18, color: n.key === activeKey ? COLORS.navy : COLORS.textMuted }}>{n.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: n.key === activeKey ? COLORS.navy : COLORS.textMuted }}>{n.label}</span>
              </button>
            ))}
```

- [ ] Run `npx tsc --noEmit` and `npm run lint`.
- [ ] Manual check: open `/residente`, confirm both desktop sidebar and mobile bottom nav look identical and are Tab-reachable.
- [ ] Commit: `git add src/components/shell/ResidentShell.tsx && git commit -m "fix(a11y): ResidentShell nav rows are real buttons with aria-current"`

---

### Task 4: Fix `SuperAdminShell.tsx` labels

**Files:** Modify `src/components/shell/SuperAdminShell.tsx:52-65` (NavLinks), `:112` (drawer close), `:129` (hamburger)

Unlike the other two shells, these are already real `<button>` elements — only `aria-label`/`aria-current` are missing.

- [ ] Add `aria-current` to the nav button (line ~52-65):

```tsx
          <button
            key={n.key}
            type="button"
            onClick={() => { n.onClick?.(); onNavigate?.(); }}
            aria-current={n.key === activeKey ? 'page' : undefined}
            style={{
              padding: '7px 10px', borderRadius: 9, fontSize: 13.25, cursor: 'pointer',
              fontWeight: n.key === activeKey ? 700 : 600,
              background: n.key === activeKey ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: n.key === activeKey ? '#FFFFFF' : '#B7C1D6',
              border: 'none', font: 'inherit', textAlign: 'left', width: '100%',
            }}
          >
```

- [ ] Add `aria-label="Cerrar menú"` to the drawer-close button (line 112) and `aria-label="Abrir menú"` to the hamburger button (line 129) — only the attribute addition, no other change.
- [ ] Run `npx tsc --noEmit` and `npm run lint`.
- [ ] Manual check: open `/super-admin` (or `/(protected)/super-admin`), confirm no visual change.
- [ ] Commit: `git add src/components/shell/SuperAdminShell.tsx && git commit -m "fix(a11y): SuperAdminShell nav and drawer control labels"`

---

### Task 5: Final verification

- [ ] `npx tsc --noEmit` and `npm run lint` clean across the whole plan.
- [ ] Do **not** re-run the full `npm test` suite for this plan: it touches zero business logic and zero files outside `src/components/shell/`, and Codex is concurrently mid-edit on unrelated commercial-layer code in the same working tree, which made the last full run noisy (an unrelated pre-existing failure in `commercial.service.ts`). tsc + lint + the per-task manual browser checks are the right-sized verification here.
- [ ] Report: confirm all 4 shells' interactive nav/drawer controls are now real, labeled, keyboard-operable elements with zero visual regression, and list what's still deferred (radius/hex consolidation, prompt/confirm replacement, table semantics, badge-helper consolidation) for the next Fase 1 plan.
