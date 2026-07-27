# FASE 2C — Implementación de precedencia y cobertura (informe)

Fecha: 2026-07-26
Autor: Claude (implementación)
Commit base revisado: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`
Subfase ejecutada: **Subfase 1 — Precedencia y cobertura** (según §22 del doc 04 de Codex).

## 1. Estado inicial de Git

```
HEAD 5e4be50 feat(billing): enforce idempotent atomic webhook effects
git status --short  ->  ?? docs/programa-mejora/03-precedencia-cron/
```

HEAD es el commit de idempotencia de la Fase 1; el único cambio sin trackear al inicio era la carpeta de documentos de la Fase 2. No hay `commit`, `push` ni tags en esta fase.

## 2. Documentos leídos

- `02-respuesta-claude-diagnostico-precedencia-cron.md` (diagnóstico F2-01..F2-10).
- `04-respuesta-codex-verificacion-precedencia-cron.md` (verificación independiente de Codex; guía vinculante de Subfase 1).
- `02-facturacion/22-*` y `24-*` (aprobación y cierre de la idempotencia de Fase 1).
- `docs/TESTING.md` y el runner seguro (`scripts/run-tests.ts`, guard de aislamiento).

Además se inspeccionó el código actual de: `mercado-pago.service.ts`, `billing.service.ts`, `period.ts`, `reconciliation.ts`, `webhook-metadata.ts`, `tenant-admin.service.ts`, `audit.service.ts`, `prisma/schema.prisma` y `tests/billing-webhook-idempotency.test.ts`.

## 3. Diagnóstico breve (previo a editar)

Confirmado sobre el código post-commit:

- **F2-01 / F2-08** — rama no-APPROVED de `upsertMercadoPagoPayment` movía Subscription+Tenant a `GRACE_PERIOD` incondicionalmente, y el `upsert.update` escribía `status`/`paidAt` sin comparar el estado previo → un `PENDING`/`REJECTED` tardío degradaba acceso vigente y hacía retroceder un `APPROVED`.
- **F2-03** — `mapPreapprovalStatus` (default `GRACE_PERIOD`) y `mapPaymentStatus` (default `PENDING`) degradaban ante estados desconocidos (fail-unsafe).
- **F2-04** — tres chequeos de cobertura divergentes (`applyTenantStatusInTx`, preapproval y `tenant-admin`), todos basados en "cualquier Payment APPROVED".
- Infra de Fase 1 (claim atómico, cuarentena, fuente única de período, ledger, sanitización, seam de pruebas) intacta y correcta.
- `WebhookEventResult.IGNORED` ya existe → sin necesidad de migración.

## 4. Cambios implementados

### 4.1 Nuevo módulo puro `src/domains/billing/precedence.ts`

Sin importar el cliente Prisma (solo `import type`). Contiene:

- **`normalizeProviderPaymentStatus(raw)`** → `{ known:true, status } | { known:false, rawStatus }`. `approved`/`authorized`→APPROVED; `rejected`/`cancelled`/`canceled`→REJECTED; `pending`/`in_process`/`in_mediation`→PENDING; **cualquier otro → desconocido** (ya no se degrada a PENDING).
- **`decidePaymentRowTransition({ incoming, current })`** → precedencia de fila (F2-08). Rango monótono `PENDING(1) < REJECTED(2) < APPROVED(3)`; APPROVED con efecto aplicado es terminal. Devuelve `{ paymentStatusAction: APPLY|PRESERVE, nextPaymentStatus, reason }`.
- **`decideSubscriptionActionForNonApproved(...)`** → `ENTER_GRACE|PRESERVE` según estado terminal de suscripción, pago propio terminal, cobertura de acceso y evidencia aplicada en otros pagos.
- **`hasCurrentAccessCoverage(...)`** (cobertura de **acceso**: TRIAL/ACTIVE/GRACE vigentes; no exige Mercado Pago).
- **`hasCurrentRealPaymentCoverage(rows, now)`** (cobertura de **pago real**: MERCADO_PAGO + APPROVED + `approvedEffectAppliedAt` + no cuarentena + período vigente).
- **`hasCurrentAppliedAccessEvidence(rows, now)`** (**evidencia** aplicada: pago real O renovación simulada/cortesía SIMULATED vigente; no es ingreso real).
- **`normalizePreapprovalStatus` / `decidePreapprovalOutcome`** → `SET|PRESERVE|IGNORE` con `nextStatus` y `reason`.
- Razones como constantes TypeScript (`PRECEDENCE_REASON`), sin nuevos enums Prisma.

### 4.2 `mercado-pago.service.ts`

- **Rama no-APPROVED reescrita** (F2-01): aplica precedencia de fila al `Payment.status`/`paidAt` (nunca retrocede ni borra `paidAt`); solo entra a `GRACE_PERIOD` cuando `decideSubscriptionActionForNonApproved` = `ENTER_GRACE` (sin cobertura de acceso, sin evidencia aplicada en otro pago, pago no terminal y suscripción no CANCELLED/SUSPENDED). En caso `PRESERVE` no toca Subscription/Tenant y registra ledger `IGNORED` + auditoría con `ignoredReason`.
- **Estado desconocido (F2-03)**: no crea Payment ambiguo, no cambia status ni `paidAt`, solo refresca `rawStatus` si el pago ya existe; no toca Subscription/Tenant; ledger `IGNORED` + `ignoredReason=UNKNOWN_PROVIDER_STATUS`.
- **Precedencia de fila (F2-08)**: `upsert.update` ahora escribe el estado decidido por precedencia; para PRESERVE coincide con el previo (no-op económico) y `rawStatus` se refresca como metadata no económica.
- **`applyTenantStatusInTx(...now)`** (F2-04): para ACTIVE/TRIAL exige `hasCurrentRealPaymentCoverage` en lugar de "cualquier Payment APPROVED".
- **`updateSubscriptionFromPreapproval` reescrito**: usa `decidePreapprovalOutcome`. `authorized` solo activa con pago real vigente; `paused` **no** degrada acceso vigente (PRESERVE, política de pausa fuera de alcance); `pending` no degrada cobertura; `cancelled` conserva el comportamiento previo (fuera de alcance); desconocido → `IGNORED`. La metadata de Mercado Pago (preapproval id, init point, último status) se refresca siempre; el estado de acceso solo cambia en `SET`.
- Eliminados `mapPreapprovalStatus` y `mapPaymentStatus` (reemplazados). La rama APPROVED (idempotencia/cuarentena/atomicidad/ledger de Fase 1) se conserva sin cambios de comportamiento.

### 4.3 `tenant-admin.service.ts`

- `updateTenantStatusForSuperAdmin` (reactivación manual, F2-04): exige `hasCurrentAppliedAccessEvidence` (pago real aplicado vigente o renovación simulada/cortesía vigente; nunca cuarentena, sin efecto o período vencido) en lugar de `findFirst {status APPROVED, periodEnd>=now}`.

### 4.4 Ledger y auditoría (§12)

Metadata sanitizada (vía `sanitizeWebhookMetadata`, solo primitivos, sin secretos): `ignoredReason`, `providerStatus`, `previousPaymentStatus`, `incomingPaymentStatus`, `persistedPaymentStatus`, `previousSubscriptionStatus`, `persistedSubscriptionStatus`, `accessCovered`, `realPaymentCovered`, `appliedAccessEvidence`, `reason`. Reutiliza `WebhookEventResult.IGNORED`.

## 5. Schema y migración

**Sin cambios en `prisma/schema.prisma` y sin migraciones.** Verificado: `git diff --stat prisma/schema.prisma` vacío y `git status prisma/migrations/` vacío. No fue necesario ningún campo nuevo; `IGNORED` ya existía en `WebhookEventResult`.

## 6. Pruebas

### 6.1 Puras — `tests/unit/billing-precedence.test.ts` (51 casos)

Normalización de estados (6), precedencia de fila (8), cobertura de acceso (10), cobertura de pago real (7), evidencia aplicada (5), decisión de Subscription no-aprobado (5), normalización y decisión de preapproval (10). Todas pasan de forma aislada.

### 6.2 Integración — `tests/billing-webhook-idempotency.test.ts`

- Se **actualizó** el escenario #11: antes codificaba el bug F2-01 (`paused → GRACE`); ahora valida que `paused` **preserva** una suscripción con cobertura vigente y queda `IGNORED` con `ignoredReason=PREAPPROVAL_PAUSED_PRESERVED`.
- Se **añadieron** 11 escenarios (#18–#28): APPROVED no retrocede ante PENDING/REJECTED tardíos; REJECTED→APPROVED aplica una vez; rechazo de otro pago no degrada suscripción cubierta; PENDING con trial vigente preserva; estado desconocido en pago nuevo (no crea Payment) y sobre APPROVED existente (refresca rawStatus); preapproval authorized sin/con pago real; preapproval desconocido; reactivación manual exige evidencia.
- Sin `skip`; mock de `globalThis.fetch`; HMAC de prueba; cero llamadas reales a Mercado Pago; IDs únicos por `RUN` y limpieza en `after()` (incluye usuarios SUPER_ADMIN creados como actores).

### 6.3 Ejecución

- `npx tsc --noEmit` → sin errores.
- `npm run lint` → sin warnings ni errores.
- Pruebas puras aisladas → 51/51.
- **Suite completa** (`DATABASE_URL= DIRECT_URL= npm test`, procedimiento seguro contra el Supabase de mockdata autorizado) → **209 tests, 209 pass, 0 fail, 0 skipped** (incluye las 147 de Fase 1 intactas + las nuevas).

## 7. Criterios de aceptación

- APPROVED con efecto aplicado no retrocede: **cumplido** (#18, #19, precedencia de fila).
- `PENDING→APPROVED` y `REJECTED→APPROVED` siguen funcionando: **cumplido** (#3 previa, #20).
- Evento tardío no quita acceso vigente: **cumplido** (#18, #19, #22).
- Pago antiguo/distinto no degrada suscripción cubierta: **cumplido** (#21).
- Estado desconocido no modifica Payment/Subscription/Tenant: **cumplido** (#23, #24, #27).
- Trial/cortesía/simulado/pago real separados: **cumplido** (tres funciones de cobertura + pruebas).
- Decisiones auditadas y en ledger (`IGNORED` + `ignoredReason`): **cumplido**.
- Idempotencia/atomicidad de Fase 1 intactas: **cumplido** (147/147 previas siguen verdes).

## 8. Fuera de alcance (no tocado)

Cron y su compare-and-set (F2-02), atomicidad del cron (F2-06), `graceEndsAt=null` (F2-05), `Notification.dedupeKey`/email (F2-07), `Subscription.version` (F2-10), `providerUpdatedAt`/`lastProviderEventAt`, nuevos enums de ledger, política de cancelación y acceso hasta fin de período (preapproval `cancelled` conserva comportamiento previo; riesgo documentado), métricas/UI. No se llamó a Mercado Pago real, no se modificó `.env`/`.env.test` ni el guard, no se hizo build ni commit.

## 9. Riesgos y notas

- **Preapproval `cancelled`**: se mantiene el mapeo previo a `CANCELLED` porque la política de cancelación/acceso-hasta-fin-de-período está fuera de esta subfase (Subfase posterior).
- **`paused`**: se preserva el acceso siempre (no se implementa política comercial de pausa); desactivar renovaciones futuras es una decisión de negocio pendiente.
- **Carreras del cron** (F2-02/F2-06) siguen presentes: son el objetivo de la **Subfase 2**, no de esta.
- Cambiar la aserción del test #11 fue necesario porque describía el comportamiento defectuoso corregido en esta fase.

## 10. Estado

**IMPLEMENTADO.**

La Subfase 1 (precedencia y cobertura) queda implementada con módulo puro, tres definiciones de cobertura separadas, corrección de las ramas de Payment y preapproval del webhook, unificación de la reactivación manual, sin cambios de schema ni migración, y con 209/209 pruebas verdes (typecheck y lint limpios). No se hizo commit ni push. Próxima subfase recomendada: **Subfase 2 — CAS y atomicidad del cron** (F2-02, F2-05, F2-06).
