# Rediseño PQRS Services — Design System + Page Redesign

Source: Claude Design project "Rediseño PQRS Services SaaS" (`4b6b9003-415a-47b3-866a-34b111d61cd0`), 20 `.dc.html` mockups. Scope approved by user: **full redesign, sequenced across phases**, replacing the app's current "neutral scaffold" (grayscale, sharp corners, no shadows, in `src/app/globals.css`) with the branded design.

## 1. Design tokens

Extracted from the mockups, consistent across all 20 pages.

**Color**
- Navy (primary): `#122545`, hover `#0B1A33`
- Green accent (success/active license dot): `#5FD394` (large dots), `#1A6B3A` on `#ECF6EF` (status badges)
- Amber/pending: `#8A5A00` on `#FBF3DF`
- Danger: `#B3261E` on `#FBEAEA`
- Neutral text: `#1D1D1F` (primary), `#424245` (secondary), `#6E6E73` (muted), `#8E8E93` (faint)
- Surfaces: `#FFFFFF` (page/card), `#F5F5F7` (soft panel), `#FAFAFA` (sidebar), `#E8E8ED` (border/input)
- Badge pair backgrounds: info `#EAEEF6`/`#122545`, success `#ECF6EF`/`#1A6B3A`, warning `#FBF3DF`/`#8A5A00`, neutral `#E8E8ED`/`#424245`, danger `#FBEAEA`/`#B3261E`

**Typography**: Manrope (400/500/600/700/800) for UI text, JetBrains Mono (400/500) for IDs/dates/monospace bits. Headings use `font-weight:800; letter-spacing:-0.02em to -0.03em`.

**Shape & elevation**: pill buttons/badges (`border-radius:999px`), cards `14–20px` radius, inputs `11–12px` radius, soft shadows on hover only (`0 12px 28px rgba(18,37,69,.25)` for navy CTAs, `0 10–14px 32px rgba(0,0,0,.07-.1)` for neutral cards). Borders are `1–1.5px solid rgba(0,0,0,.06-.07)` or `#E8E8ED` on inputs.

**Motion**: fade/slide-up entrance (`apl-up`, 500–800ms `cubic-bezier(.2,.7,.2,1)`), staggered by section; hover lift (`translateY(-2px to -4px)`) + shadow; sheets slide up from bottom on mobile, center-fade on desktop; toasts slide up bottom-center, auto-dismiss ~2.4s.

**Layout**: sidebar 250–264px fixed (light `#FAFAFA` for admin, navy `#122545` for super-admin/consejo), mobile breakpoint ~900px triggers a drawer + sticky blurred top bar + bottom-sheet detail panels. Content max-width 640–1080px depending on page density.

## 2. Shared components to build once

These appear near-identically across most `.dc.html` files — build as reusable pieces in `src/components/` rather than duplicating per page:

- **AppShell**: sidebar (desktop) + drawer (mobile) + sticky mobile top bar, driven by nav item list + active route. Two skins: light (admin/residente-adjacent) and navy (super-admin, consejo).
- **Badge**: status/role pill, takes a semantic variant (`open`/`progress`/`closed`/`review`/`admin`/`consejo`/`residente`/`danger`).
- **Toast**: bottom-center auto-dismiss confirmation, replaces any ad hoc alerts.
- **Sheet/Modal**: bottom sheet on mobile, centered modal on desktop, used for create/detail/invite flows.
- **Stepper**: horizontal PQRS stage tracker (5 steps, done/current/pending dot states) — used in PQRS detail, Vista Residente detail, Landing hero mock.
- **Toggle**: pill switch for boolean settings (notifications, config flags).
- **FAQ accordion**: used in Ayuda and Landing.
- **StatTile / metric card**: label + big number, used in every dashboard/report page.
- **Timeline**: dotted vertical activity/history feed, used in Dashboard, Actividad, PQRS detail.

Building these first means every subsequent page phase is mostly composition, not new CSS.

## 3. Neutral scaffold removal

`src/app/globals.css` currently forces grayscale/no-radius/no-shadow site-wide (a deliberate "keeps all features visible while removing branding" scaffold). This is removed in Phase 0: replace the CSS variable palette (`--primary`, `--radius`, `--background`, etc.) with the navy/green tokens above, delete the `[class*="bg-green"]` etc. stripping rules, and delete the forced `border-radius:0.125rem` and `box-shadow:none` overrides.

## 4. Page inventory → route mapping → phase

| # | Mockup | Existing route | Status | Phase |
|---|--------|----------------|--------|-------|
| 1 | Login.dc.html | `src/app/auth/login` | redesign existing | 1 |
| 2 | Recuperar Contrasena.dc.html | `src/app/auth/olvidar-contrasena` + `restablecer-contrasena` | redesign existing (2 routes ← 1 mockup's multi-step flow) | 1 |
| 3 | Invitacion Crear Cuenta.dc.html | `src/app/auth/registro` (closest) | redesign / may need new invite-token route | 1 |
| 4 | Dashboard Admin.dc.html | `(protected)/dashboard` | redesign existing | 2 |
| 5 | Modulo PQRS.dc.html | `(protected)/pqrs` | redesign existing (master-detail + create sheet) | 2 |
| 6 | Modulo Usuarios.dc.html | `(protected)/usuarios` | redesign existing | 2 |
| 7 | Modulo Reportes.dc.html | `(protected)/reportes` | redesign existing | 2 |
| 8 | Modulo Licencias y Pagos.dc.html | none (`api/billing/mercado-pago` exists) | new page + wire to existing billing API | 3 |
| 9 | Mi Cuenta.dc.html | `(protected)/cambiar-contrasena` (partial) | redesign + extend (profile tab, notif toggles) | 3 |
| 10 | Configuracion Conjunto.dc.html | none | new page | 3 |
| 11 | Actividad.dc.html | `(protected)/historial` (closest) | redesign existing as Actividad | 3 |
| 12 | Invitaciones.dc.html | none | new page | 3 |
| 13 | Ayuda.dc.html | none | new page (static content ok) | 3 |
| 14 | Vista Consejo.dc.html | none (Role includes read-only board role?) | new route + role gating | 4 |
| 15 | Vista Residente.dc.html | none (residents currently use subset of protected routes) | new route + role gating | 4 |
| 16 | Onboarding Consejo.dc.html | none | new route, gated to first-login | 4 |
| 17 | Onboarding Residente.dc.html | none | new route, gated to first-login | 4 |
| 18 | Dashboard Super Admin.dc.html | `(protected)/super-admin` | redesign existing | 5 |
| 19 | Onboarding Admin.dc.html | none | new route, gated to first-login | 5 (with super-admin, since it's the tenant-creation flow) |
| 20 | Landing.dc.html | `src/app/page.tsx` (root) | redesign existing marketing root | 6 |

Phase 0 (design system + shared components) precedes all of the above and has no user-visible route changes beyond global look.

## 5. Explicit non-goals for this spec

- No change to auth/session logic, Prisma schema, or API routes — this is a visual/UX layer redesign plus a small number of new pages that consume existing or lightly-extended APIs (invitations, config, activity log). Any new backend needs (e.g., an `Invitation` model if one doesn't exist) will be identified per-phase and flagged before implementation, not assumed here.
- Mock data in the `.dc.html` files (e.g. "Ana Ruiz", "Parque Residencial Calle 100") is illustrative only — real pages use live session/tenant data.
- The `.dc.html` "demo mode" shortcuts (role switcher on Login, expired-link toggles) are prototyping aids, not shipped.

## 6. Open items to confirm before implementation

- Does a `Vista Consejo` / read-only board-member role already exist in the `Role` enum, or does it need adding?
- Is there an existing invitation-token mechanism, or does Phase 3 need a new `Invitation` model + email send?
- Confirm "Actividad" should replace/rename the current `historial` route vs. being additive.

These will be resolved at the top of whichever phase's implementation plan first touches them, not blocking Phase 0.
