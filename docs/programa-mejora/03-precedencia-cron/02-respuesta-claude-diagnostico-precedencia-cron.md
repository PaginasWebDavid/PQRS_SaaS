# FASE 2A — Diagnóstico de precedencia de eventos y seguridad del cron

*Sesión de solo diagnóstico. No se modificó código. HEAD = `5e4be50 feat(billing): enforce idempotent atomic webhook effects`. Toda afirmación cita `archivo:línea` del código posterior al commit.*

## 1. Resumen ejecutivo

La subfase de idempotencia/atomicidad protege el **efecto económico** de un pago (no doble extensión, rollback, cuarentena histórica), pero **no** protege contra **eventos fuera de orden** ni contra **carreras cron↔webhook**. Los riesgos abiertos son severos: (a) un webhook **no-APPROVED tardío** (PENDING/REJECTED) **degrada a GRACE_PERIOD una suscripción vigente y pagada** sin ninguna comprobación de cobertura ni precedencia ([mercado-pago.service.ts:700-712](src/domains/billing/mercado-pago.service.ts#L700-L712)); (b) el **cron** hace `updateMany` por id **sin re-verificar estado/período**, así que puede **suspender a un cliente que acaba de pagar** si un webhook aprueba entre el `findMany` y el `updateMany` ([billing.service.ts:400-445](src/domains/billing/billing.service.ts#L400-L445)); (c) un **estado desconocido del proveedor degrada** a GRACE_PERIOD (fail-unsafe, [mercado-pago.service.ts:832](src/domains/billing/mercado-pago.service.ts#L832)); (d) **no existe una definición única de "cobertura vigente"** — distintos sitios buscan "un pago aprobado" con filtros distintos, algunos sin `periodEnd`/`provider`/efecto; (e) `graceEndsAt = null` **nunca se suspende** (fuga de ingresos); (f) el cron **no es atómico** y **duplica notificaciones/correos** ante dos ejecuciones. `tsc` y `lint` limpios. **Veredicto: DIAGNÓSTICO COMPLETO. Preparación: REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.**

## 2. Estado de Git

- `git status --short`: **limpio** (0 líneas), sin cambios ajenos pendientes.
- `git log -1 --oneline`: `5e4be50 feat(billing): enforce idempotent atomic webhook effects` — el commit de idempotencia es HEAD (confirmado).

## 3. Mapa de productores de estado

| Trigger | Endpoint/job · función | Estado inicial | Estado final escrito | `where` de la escritura | Timestamp usado | Tx | Auditoría | Notif. | Riesgo de carrera |
|---|---|---|---|---|---|---|---|---|---|
| Webhook Payment APPROVED nuevo | webhook · `upsertMercadoPagoPayment` ([:668-698](src/domains/billing/mercado-pago.service.ts#L668-L698)) | cualquiera | Sub `ACTIVE`, Tenant `ACTIVE`, período +30 | claim `id, status APPROVED, approvedEffectAppliedAt null, reconciliationRequired false` | `now` local; `paidAt`=date_approved | **Sí** | WEBHOOK_PROCESSED | — | Bajo (idempotente) |
| Webhook Payment no-APPROVED | webhook · `upsertMercadoPagoPayment` ([:700-712](src/domains/billing/mercado-pago.service.ts#L700-L712)) | **cualquiera (incl. ACTIVE)** | Sub `GRACE_PERIOD`, Tenant `GRACE`, graceEndsAt=+grace | `where {id}` **sin condición de estado** | `now` local | Sí | WEBHOOK_PROCESSED | — | **ALTO: degrada vigente** |
| Webhook preapproval | webhook · `updateSubscriptionFromPreapproval` ([:349-406](src/domains/billing/mercado-pago.service.ts#L349-L406)) | cualquiera | `mapPreapprovalStatus` (ACTIVE/GRACE/CANCELLED/TRIAL/**default GRACE**) | `where {id}` **sin estado previo** | `now` local | Sí | WEBHOOK_PROCESSED | — | **ALTO: degrada/desconocido** |
| Cron ACTIVE/TRIAL→GRACE | `applyOverdueLicenseRules` ([:400-426](src/domains/billing/billing.service.ts#L400-L426)) | ACTIVE/TRIAL | Sub `GRACE`, Tenant `GRACE` | `updateMany where {id in […]}` **sin re-check** | `now`; `currentPeriodEnd<now` en el select | **No** | 1 fila platform | LICENSE_EXPIRING | **ALTO: pisa pago reciente** |
| Cron GRACE→SUSPENDED | idem ([:428-455](src/domains/billing/billing.service.ts#L428-L455)) | GRACE_PERIOD | Sub `SUSPENDED`, Tenant `SUSPENDED` | `updateMany where {id in […]}` **sin re-check**; select `graceEndsAt<now` | `now` | **No** | idem | LICENSE_SUSPENDED | **ALTO** |
| Reactivación manual | POST platform · `updateTenantStatusForSuperAdmin(ACTIVE)` ([tenant-admin:211-274](src/domains/platform/tenant-admin.service.ts#L211-L274)) | cualquiera | Tenant `ACTIVE`, Sub `ACTIVE`, graceEndsAt null | Tenant `where {id}`, Sub `where {tenantId}`; exige pago APPROVED `periodEnd>=now` | `now` | **Sí** | TENANT_REACTIVATED (fuera de tx) | — | Medio: last-writer-wins vs cron |
| Suspensión manual | idem `(SUSPENDED)` | cualquiera | Tenant/Sub `SUSPENDED`, cancelledAt null | idem | — | Sí | TENANT_SUSPENDED | — | Medio |
| Cancelación manual | idem `(CANCELLED)` | cualquiera | Tenant/Sub `CANCELLED`, **cancelledAt=now** | idem | `now` | Sí | TENANT_CANCELLED | — | Medio |
| Cortesía | `grantCourtesyExtension` ([billing:228-307](src/domains/billing/billing.service.ts#L228-L307)) | cualquiera | Sub `ACTIVE`+período, Tenant `ACTIVE`, pago SIMULATED 0 | `where {id}` | `now` | Sí (audit fuera) | SUBSCRIPTION_RENEWED | — | Medio vs cron |
| Renovación simulada | `renewSubscriptionWithSimulatedPayment` ([billing:138-222](src/domains/billing/billing.service.ts#L138-L222)) | cualquiera | Sub `ACTIVE`+período, Tenant `ACTIVE`, pago SIMULATED | `where {id}` | `now` | Sí (audit fuera) | SUBSCRIPTION_RENEWED | — | Medio vs cron |
| Desactivar auto-renovación | POST billing/checkout · `disableAutoRenewForTenant` ([mercado-pago:176-208](src/domains/billing/mercado-pago.service.ts#L176-L208)) | cualquiera | Sub `autoRenew=false` (no cambia status) | `where {id}` | — | **No**; PUT MP antes | AUTO_RENEW_DISABLED | — | Bajo |
| Creación inicial tenant | `createTenantWithAdmin` ([tenant-admin:115-209](src/domains/platform/tenant-admin.service.ts#L115-L209)) | (nuevo) | Tenant/Sub `TRIAL` | create | `now`, trial+15d | **Sí** | TENANT_CREATED, SUBSCRIPTION_CREATED | — | N/A |

## 4. Máquina de estados de `PaymentStatus`

- Estados ([schema:287-291](prisma/schema.prisma#L287-L291)): `PENDING`, `APPROVED`, `REJECTED`. **No hay estado terminal marcado.**
- `mapPaymentStatus` ([:835-840](src/domains/billing/mercado-pago.service.ts#L835-L840)): `approved|authorized→APPROVED`, `rejected|cancelled→REJECTED`, resto→`PENDING`.
- **Transiciones que el código acepta hoy:** el `upsert` de Payment ([:668-698](src/domains/billing/mercado-pago.service.ts#L668)) en su rama `update` fija `status` **incondicionalmente** (`{status, rawStatus, paidAt}`). Por tanto **`APPROVED` puede volver a `PENDING` o `REJECTED`** sobre la misma fila si Mercado Pago reenvía un estado distinto. No hay guarda de precedencia a nivel de fila.
- **Protección económica parcial:** aunque la fila retroceda de estado, `approvedEffectAppliedAt` **no se limpia** (el efecto económico no se revierte). Pero la **rama no-APPROVED degrada la Subscription a GRACE** igualmente (ver §6/F2-01), así que el cliente sí se ve afectado.
- **Timestamps:** `date_approved`/`date_created` se usan **solo** para `paidAt` (`parseDateOrNow`, [:455,477](src/domains/billing/mercado-pago.service.ts#L455)); **no** se usan para ordenar. `date_last_updated` **no se lee**. `lastWebhookAt` = **hora local de recepción** (`now`, [:393,709](src/domains/billing/mercado-pago.service.ts#L393)), se **escribe pero nunca se lee** para precedencia. **No hay comparación contra un evento anterior** ni `providerEventAt` persistido.

Distinciones (hoy indiferenciadas): (1) mismo Payment cambiando de estado → la fila y la suscripción se sobreescriben sin orden; (2) Payments distintos de períodos distintos → cualquiera degrada; (3) estado del preapproval → `mapPreapprovalStatus` sin precedencia; (4) estado local de la suscripción → se pisa; (5) cobertura vigente → no se consulta.

**Precedencia mínima propuesta** (función pura `decidePaymentTransition(prev, next)`): permitir `PENDING→APPROVED` y `REJECTED→APPROVED`; **rechazar** `APPROVED→PENDING`; **rechazar** `APPROVED→REJECTED` cuando `approvedEffectAppliedAt != null`; permitir siempre actualizar metadata no económica (`rawStatus`, `paidAt`). Y en la suscripción: **no degradar** si existe cobertura vigente (§3/§5).

## 5. Definición actual de cobertura

**No existe una definición única.** Los sitios que buscan "un pago aprobado" divergen:

| Sitio | Filtro | ¿periodEnd? | ¿provider? | ¿efecto? | ¿cuarentena? |
|---|---|---|---|---|---|
| `applyTenantStatusInTx` ([:752](src/domains/billing/mercado-pago.service.ts#L752)) | `tenantId, status APPROVED` | **No** | **No** | **No** | **No** |
| `updateSubscriptionFromPreapproval` ([:372](src/domains/billing/mercado-pago.service.ts#L372)) | `subscriptionId, status APPROVED` | **No** | **No** | **No** | **No** |
| `updateTenantStatusForSuperAdmin` ([:220](src/domains/platform/tenant-admin.service.ts#L220)) | `tenantId, status APPROVED, periodEnd>=now` | **Sí** | **No** | **No** | **No** |

Consecuencias: se puede **activar por un pago viejo** (sin `periodEnd`), por un **SIMULATED** (sin `provider`), o por una fila `APPROVED` **en cuarentena/sin efecto aplicado**. No hay chequeo de "período vigente" para **evitar degradar** a un cliente cubierto.

**Propuesta `hasValidPaidCoverage(subscription, now)` (definición única, pura + una consulta):** la suscripción está cubierta si `subscription.currentPeriodEnd > now` **y** existe al menos un `Payment` con `status=APPROVED`, `approvedEffectAppliedAt != null`, `approvedEffectReconciliationRequired=false`, `periodEnd >= now` (provider según política: solo `MERCADO_PAGO` si se exige dinero real, o incluir `SIMULATED` para cortesías). Usarla en: la rama no-APPROVED (no degradar si hay cobertura), el cron (no mover a GRACE si cubierto), y unificar `applyTenantStatusInTx`.

## 6. Eventos fuera de orden

| # | Escenario | Comportamiento actual | Recomendado |
|---|---|---|---|
| 1 | PENDING→APPROVED | Row PENDING (degrada Sub→GRACE), luego APPROVED reclama y extiende (Sub→ACTIVE). Funciona pero pasa por GRACE intermedio. | Igual, sin degradar en el PENDING intermedio si hay cobertura. |
| 2 | APPROVED→PENDING | `upsert` fija row `PENDING`; rama no-APPROVED **degrada Sub→GRACE, Tenant→GRACE** ([:704-712](src/domains/billing/mercado-pago.service.ts#L704-L712)); período intacto (marcador). | **Ignorar** (precedencia): APPROVED no retrocede a PENDING; no degradar. Ledger `IGNORED_BY_PRECEDENCE`. |
| 3 | APPROVED→REJECTED | Row `REJECTED`; **Sub→GRACE, Tenant→GRACE**; efecto no revertido. | **No degradar** si el efecto ya se aplicó y el período sigue vigente; registrar. |
| 4 | REJECTED→APPROVED | Row APPROVED; reclama efecto (si no aplicado) y extiende. Correcto. | Permitir (es un pago que finalmente entró). |
| 5 | Rechazo antiguo tras aprobado nuevo (Payments distintos) | El rechazo del pago viejo entra por la rama no-APPROVED y **degrada la Sub vigente** aunque el pago nuevo la cubra. | **No degradar** si `hasValidPaidCoverage`. Ledger stale. |
| 6 | Aprobado antiguo tras renovación reciente | `upsert` del pago viejo: si su marcador ya estaba aplicado → DUPLICATE (no re-extiende, ok). Si nunca se aplicó → **reclama y extiende desde `now`**, encadenando otro período. | Comparar `providerEventAt`/período; ignorar si es anterior al período vigente. |
| 7 | Preapproval `authorized` antes del Payment | `mapPreapprovalStatus`→ACTIVE, pero guarda exige pago APPROVED; si no hay → TRIAL/PENDING_PAYMENT ([:368-378](src/domains/billing/mercado-pago.service.ts#L368-L378)). Correcto. | Mantener. |
| 8 | Preapproval `paused` tras pago aprobado | →GRACE_PERIOD, **degrada la Sub pagada** ([:829](src/domains/billing/mercado-pago.service.ts#L829)). | No degradar si período vigente; interpretar "paused" como aviso, no fin de acceso. |
| 9 | Preapproval `cancelled` durante período pagado | →CANCELLED inmediato (Tenant CANCELLED, bloquea acceso); **cancelledAt no se fija** por webhook. | Distinguir "cancelar renovación" de "fin de acceso"; conservar acceso hasta `currentPeriodEnd`; fijar cancelledAt (F1-06, fuera de alcance de esta fase pero interactúa). |
| 10 | Estado desconocido | `mapPreapprovalStatus` default→GRACE; `mapPaymentStatus` default→PENDING→GRACE. **Degrada.** | **Fail-safe**: no degradar, registrar, marcar para revisión (§7). |

En todos, la auditoría es `MERCADO_PAGO_WEBHOOK_PROCESSED` con `prevStatus/nextStatus` en metadata; el ledger termina `PROCESSED` (nunca "ignorado/stale").

## 7. Estados desconocidos del proveedor

- **Preapproval desconocido** → `mapPreapprovalStatus` default `GRACE_PERIOD` ([:832](src/domains/billing/mercado-pago.service.ts#L832)) → **degrada**.
- **Payment desconocido** → `mapPaymentStatus` default `PENDING` ([:839](src/domains/billing/mercado-pago.service.ts#L839)) → `paymentStatusToSubscriptionStatus` `GRACE_PERIOD` ([:845](src/domains/billing/mercado-pago.service.ts#L845)) → **degrada**.
- `rawStatus` **sí** se conserva (en Payment y en el ledger metadata). No hay error ni alerta. El ledger queda `PROCESSED` (no marca "desconocido").

**Regla fail-safe propuesta:** un estado no reconocido **no debe transicionar** la Subscription/Tenant; se registra en el ledger con resultado `STALE_EVENT`/`IGNORED_BY_PRECEDENCE` (o `CONFLICT`), se conserva `rawStatus`, se mantiene el último estado local, y se marca para reconciliación manual (sin construir aún una UI de alertas).

## 8. Cron ACTIVE/TRIAL → GRACE_PERIOD

Flujo ([billing.service.ts:395-426](src/domains/billing/billing.service.ts#L395-L426)): `findMany(status in [ACTIVE,TRIAL], currentPeriodEnd<now)` → `updateMany(where id in […], status GRACE, graceEndsAt=now+grace)` → `updateMany(tenant id in […], GRACE)` → `notifyTenantAdminsOfLicenseChange(...)`.

- El `updateMany` **NO re-verifica** estado de origen, `currentPeriodEnd`, versión ni cobertura — solo `id in […]`.
- **Webhook aprobado entre `findMany` y `updateMany`:** el webhook pone la Sub en `ACTIVE` con período nuevo; el cron la pisa a `GRACE` por id → **suspende/degrada a un cliente que acaba de pagar**.
- **Acción manual entretanto:** igual, el cron la pisa.
- **Divergencia Tenant/Subscription:** los dos `updateMany` son operaciones separadas **sin transacción**; un fallo entre ambos deja Sub en GRACE y Tenant en el estado previo (o viceversa).
- **Emails:** se envían **después** de persistir (los `updateMany` ya ocurrieron), pero **sin idempotencia** y **para todos los `tenantIds` seleccionados** aunque el `updateMany` real no haya transicionado alguno.

## 9. Cron GRACE_PERIOD → SUSPENDED

- Condición ([:428-435](src/domains/billing/billing.service.ts#L428-L435)): `status GRACE_PERIOD AND graceEndsAt < now`.
- **`graceEndsAt = null`**: `{ lt: now }` **nunca** matchea null → una Sub en GRACE con `graceEndsAt=null` **jamás se suspende** (fuga de ingresos). Alcanzable si algún path deja GRACE sin fecha.
- Comparación **`<` estricta**: en el instante exacto (`graceEndsAt == now`) **no** suspende (a favor del cliente; aceptable).
- **Carrera con pago aprobado/cortesía/reactivación:** el `updateMany` por id **sin re-check** puede suspender una Sub que un webhook/acción acaba de mover a ACTIVE.
- **Divergencia** y **notificaciones duplicadas**: igual que §8.

**Política propuesta para `graceEndsAt=null`:** es un **estado inválido que no debería producirse**; el cron debe (a) **no** transicionarlo por la condición actual y (b) **normalizarlo/alertarlo** (registrar y, opcionalmente, fijar `graceEndsAt` = `currentPeriodEnd + grace` o suspender explícitamente con evidencia). Recomendación mínima: tratarlo como inválido → alerta/registro y corrección puntual, no suspensión ciega.

## 10. Dos ejecuciones concurrentes del cron

- Ambas `findMany` seleccionan el mismo conjunto; ambas `updateMany` → **estado final idempotente** (converge a GRACE/SUSPENDED).
- **NO idempotentes**: `notifyTenantAdminsOfLicenseChange` crea **notificaciones duplicadas** (una por corrida) y **correos duplicados** ([:494-523](src/domains/billing/billing.service.ts#L494-L523)); cada `createNotification` genera además un `NOTIFICATION_CREATED` audit; el audit `TENANT_OVERDUE_RULES_APPLIED` se duplica.

Clasificación de soluciones:
- **Obligatoria**: `updateMany` con estado+fecha esperados y usar el `count` para notificar **solo** transiciones reales.
- **Obligatoria**: idempotencia de notificación (clave única) para no duplicar avisos/correos.
- **Recomendada**: advisory lock de PostgreSQL (`pg_try_advisory_lock`) o una tabla de ejecución de cron para serializar corridas.
- **Recomendada**: transacción por suscripción (o por lote) para evitar divergencia Tenant/Sub.
- **Innecesaria por ahora**: colas externas, `version` global, procesamiento distribuido.

## 11. Compare-and-set y `version`

Para el cron y las carreras, **`updateMany` condicional basta en la mayoría de casos**:
```
updateMany({ where: { id, status: "ACTIVE", currentPeriodEnd: fechaEsperada }, data: {...} })
```
y usar `count` (0 = alguien cambió el estado; no notificar). Cubre: cron↔webhook, dos cron, cron↔acción manual.

Un campo `Subscription.version Int @default(0)` es **RECOMENDADO (no obligatorio)** como red adicional para carreras de **período** (dos escritores que recalculan período desde el mismo valor) y para acciones manuales vs webhook; el compare-and-set por `status`+`currentPeriodEnd` ya captura la mayoría. Para una app de una sola persona, **empezar con compare-and-set** y añadir `version` solo si las pruebas de concurrencia lo exigen. **No** hacen falta locks globales, colas ni infraestructura nueva.

## 12. Atomicidad del cron

Hoy el cron **no usa transacción**: `subscription.updateMany`, `tenant.updateMany`, notificaciones, emails y audit son operaciones separadas ([:409-462](src/domains/billing/billing.service.ts#L409-L462)).

**Orden mínimo seguro propuesto (por suscripción o por lote):**
1. Reclamar transición con `updateMany` condicional (compare-and-set) → obtener `count`/ids realmente transicionados.
2. En **transacción**: actualizar Subscription + Tenant coherentes.
3. En la misma tx: crear AuditLog.
4. En la misma tx: crear Notification persistida (idempotente).
5. Commit.
6. **Fuera de tx**: enviar email (`sendEmailSafe`).
7. Registrar fallo de email (EmailLog ya lo hace) **sin** revertir la transición.

El modelo actual **permite** esta separación: `registerAuditLog` y `createNotification` aceptan/pueden aceptar el cliente; `sendEmailSafe` ya está desacoplado. Falta **reordenar** (email fuera de la tx) y **envolver** el efecto local en transacción por transición.

## 13. Idempotencia de notificaciones

- Modelo `Notification` ([schema:498-517](prisma/schema.prisma#L498-L517)): `tenantId, userId, type, title, message, resourceType?, resourceId?, readAt?, createdAt`. **Sin unique key**, **sin** referencia a Subscription/período/transición.
- `createNotification` ([notification.service.ts:19-36](src/domains/notifications/notification.service.ts#L19-L36)) hace `create` directo → **se puede crear la misma notificación N veces**.
- No hay estado de envío en Notification (el envío vive en `EmailLog`, desacoplado); no hay retry ligado.
- **Clave mínima propuesta**: `tenantId + subscriptionId + transition + expectedPeriodEnd` (o `graceEndsAt`) como `dedupeKey String? @unique` en Notification, o una tabla dedicada de "avisos de licencia". Con `createMany(..., skipDuplicates:true)` o `upsert` sobre esa clave, dos crons producen **una** notificación. **Requiere migración** (columna nullable + índice único, aditiva).

## 14. Acciones manuales concurrentes

| Acción | Último escritor gana | ¿Condición de estado? | ¿Tx? | ¿Debe prevalecer? | ¿`version`? | ¿Auditoría de conflicto? |
|---|---|---|---|---|---|---|
| Reactivar | Sí (pisa) | Exige pago vigente para ACTIVE, no compara estado previo | Sí | La **acción manual** debería prevalecer sobre el cron | Recomendado | Recomendada |
| Suspender | Sí | No | Sí | Manual prevalece | Recomendado | Recomendada |
| Cancelar | Sí | No | Sí | Manual prevalece | Recomendado | Recomendada |
| Cortesía | Sí | No | Sí | Debe prevalecer sobre cron GRACE→SUSPENDED | Recomendado | Recomendada |
| Renovar simulado | Sí | No | Sí | Prevalece sobre cron | Recomendado | Recomendada |
| Cambiar unidades | — (programa pendientes) | No | Sí (local); PUT MP antes | N/A directo | — | — |
| Desactivar auto-renovación | Sí | No | **No** | N/A (no cambia status) | — | — |

Ninguna acción manual usa compare-and-set ni `version`; frente a un webhook/cron simultáneo, **el último `update` gana** y puede dejar una combinación incoherente. (No se cambia la política de cancelación en esta fase; solo se identifica.)

## 15. Ledger (`WebhookEvent`) y eventos fuera de orden

Campos actuales ([schema:302-323](prisma/schema.prisma#L302-L323)): `provider, topic, dataId, requestId, rawStatus, tenantId, subscriptionId, result, errorCode, metadata(JSON), receivedAt, processedAt`. Resultados ([:325-335](prisma/schema.prisma#L325-L335)): `RECEIVED/PROCESSED/DUPLICATE/IGNORED/FAILED/ENTITY_NOT_FOUND/UNSUPPORTED_TOPIC/RECONCILIATION_REQUIRED`.

| Capacidad | ¿Hoy? |
|---|---|
| Comparar orden de eventos | **No** (no hay `providerEventAt`; `receivedAt` es hora local) |
| Identificar Payment / preapproval | Sí (`dataId`, `subscriptionId`) |
| Timestamp del proveedor | **No** persistido |
| Timestamp de recepción | Sí (`receivedAt`) |
| Saber si se ignoró por antiguo/precedencia | **No** (no hay resultado ni `ignoredReason`) |
| Reconstruir estado anterior/posterior | Parcial (en `metadata.prevStatus/nextStatus`, no en columnas) |
| El **cron** escribe ledger | **No** (el cron no genera `WebhookEvent`) |

Campos adicionales: `providerEventAt DateTime?` (**Recomendado** — precedencia), `decision`/`ignoredReason String?` (**Recomendado**), `previousStatus/nextStatus` (**Opcional**, ya en metadata), resultados `STALE_EVENT`/`IGNORED_BY_PRECEDENCE`/`CONFLICT` (**Recomendado**).

## 16. Modelo y migraciones potenciales

| Cambio | Clasificación | Beneficio | Riesgo | Backfill | Compat. | Reversible |
|---|---|---|---|---|---|---|
| `Payment.providerUpdatedAt DateTime?` | Recomendado | Precedencia entre eventos del mismo pago | Bajo | Nullable; opcional | Aditivo | Sí (DROP COLUMN) |
| `Subscription.lastProviderEventAt DateTime?` | Recomendado | Descartar eventos anteriores al último aplicado | Bajo | Nullable | Aditivo | Sí |
| `Subscription.version Int @default(0)` | Recomendado | Concurrencia optimista de período/acciones | Bajo | Default 0 | Aditivo | Sí |
| Notification `dedupeKey String? @unique` (o tabla de avisos) | Recomendado | Notificación idempotente | Bajo-medio (unique) | Nullable | Aditivo | Sí |
| Estado de envío de email en Notification | Opcional | Retry visible | Bajo | — | Aditivo | Sí (`EmailLog` ya cubre lo esencial) |
| Ledger results `STALE_EVENT`/`IGNORED_BY_PRECEDENCE`/`CONFLICT` | Recomendado | Trazabilidad de precedencia | Bajo (ADD VALUE enum no reversible simple) | — | Aditivo | Parcial (valor enum queda huérfano) |
| Tabla `CronRun` (idempotencia/lock de cron) | Opcional | Serializar corridas | Bajo | — | Aditivo | Sí |

Ninguno es una solución sobredimensionada; todos son aditivos.

## 17. Estrategia de pruebas

**Puras** (sin Prisma): `decidePaymentTransition(prev,next)` (precedencia); comparación de `providerEventAt` (más nuevo gana); `hasValidPaidCoverage` como función pura sobre datos ya cargados; mapeo de estado desconocido → "no transicionar"; `decideCronTransition(sub, now)`; construcción de `dedupeKey` de notificación; política `graceEndsAt=null`.

**Integración PostgreSQL** (base de pruebas dedicada; hoy compartida con el proyecto autorizado): APPROVED→REJECTED no degrada; rechazo antiguo no degrada período vigente; pago nuevo aprobado prevalece sobre cron; cron transiciona **solo** si no hubo cambio (compare-and-set count=0); dos crons → **una** transición; dos crons → **una** notificación; cortesía concurrente con cron; reactivación concurrente con cron; estado desconocido no degrada; Tenant y Subscription coherentes; `graceEndsAt=null` sigue la política.

**Fallos**: fallo de auditoría → rollback; fallo de notificación persistida → rollback (o política definida); fallo de email **después** del commit → transición conservada + EmailLog FAILED; reintento del cron idempotente; proceso muere entre commit y email → recuperación (email no enviado, EmailLog sin registro; el aviso se reintenta en la siguiente corrida sin duplicar por `dedupeKey`).

## 18. Diseño mínimo recomendado

1. **Función pura de decisión de transición** (`decidePaymentTransition`, `decideCronTransition`) — **OBLIGATORIO**.
2. **Definición única `hasValidPaidCoverage`** — **OBLIGATORIO**.
3. **Precedencia mínima con `providerEventAt`/`lastProviderEventAt`** — **RECOMENDADO** (con compare-and-set puede bastar para el cron; obligatorio para el webhook no-APPROVED que hoy degrada).
4. **Compare-and-set para el cron** (`updateMany` con estado+fecha esperados + uso de `count`) — **OBLIGATORIO**.
5. **Transacción local por transición** (Subscription+Tenant+Audit+Notification) — **OBLIGATORIO**.
6. **Notificación idempotente** (`dedupeKey`) — **OBLIGATORIO** (evita duplicados).
7. **Email fuera de la transacción** — **OBLIGATORIO** (reordenar).
8. **Ledger con razón de evento ignorado** (`STALE_EVENT`/`IGNORED_BY_PRECEDENCE`) — **RECOMENDADO**.
9. `Subscription.version` — **OPCIONAL** (añadir si las pruebas de concurrencia lo exigen).
10. Advisory lock / tabla `CronRun` — **OPCIONAL**.

## 19. Subfases (máx. 4)

### Subfase 1 — Precedencia y cobertura vigente **(bloqueante)**
- **Archivos**: `mercado-pago.service.ts` (rama no-APPROVED, `updateSubscriptionFromPreapproval`, mapeos, `applyTenantStatusInTx`), nuevo módulo puro `precedence.ts`/`coverage.ts`, `billing.service.ts` (usar cobertura).
- **Schema/migración**: `Payment.providerUpdatedAt`, `Subscription.lastProviderEventAt` (aditivas, nullable).
- **Pruebas**: precedencia (2,3,5,8,10), cobertura, unknown-no-degrada.
- **Riesgos**: rechazar un evento legítimo por precedencia mal calibrada.
- **Aceptación**: APPROVED no retrocede; no se degrada cobertura vigente; estado desconocido no degrada.
- **Rollback**: revertir código + DROP COLUMN aditivas.

### Subfase 2 — Compare-and-set y atomicidad del cron **(bloqueante)**
- **Archivos**: `billing.service.ts` (`applyOverdueLicenseRules`), posible `precedence.ts`.
- **Schema**: `Subscription.version` (opcional).
- **Pruebas**: cron↔webhook, dos cron → una transición, cron gana solo si sin cambio, `graceEndsAt=null`.
- **Riesgos**: transición perdida por comparación estricta.
- **Aceptación**: el cron nunca pisa un pago; Tenant/Sub coherentes; una transición por corrida.
- **Rollback**: revertir código; `version` aditivo reversible.

### Subfase 3 — Notificaciones idempotentes y fallos de email **(bloqueante)**
- **Archivos**: `notification.service.ts`, `billing.service.ts` (`notifyTenantAdminsOfLicenseChange`).
- **Schema**: `Notification.dedupeKey String? @unique` (o tabla de avisos).
- **Pruebas**: dos cron → una notificación/correo; email falla tras commit → transición intacta.
- **Riesgos**: unique demasiado estricta que suprima avisos legítimos.
- **Aceptación**: sin duplicados; email fuera de la transacción.
- **Rollback**: DROP COLUMN/índice.

### Subfase 4 — Observabilidad y campos opcionales **(no bloqueante)**
- **Archivos**: `mercado-pago.service.ts`, `webhook-metadata.ts`.
- **Schema**: resultados de ledger `STALE_EVENT`/`IGNORED_BY_PRECEDENCE`/`CONFLICT`; `WebhookEvent.providerEventAt`.
- **Pruebas**: ledger registra ignorados/stale.
- **Riesgos**: bajos.
- **Aceptación**: eventos ignorados quedan trazables.
- **Rollback**: aditivo (valor enum queda huérfano, inocuo).

## 20. Hallazgos

**F2-01 · CRÍTICA · [mercado-pago.service.ts:700-712 `upsertMercadoPagoPayment` (rama no-APPROVED)]**
- Actual: cualquier webhook PENDING/REJECTED escribe Sub `GRACE_PERIOD` + Tenant `GRACE` sin condición de estado ni cobertura.
- Escenario: rechazo tardío / de un período anterior tras un pago aprobado vigente.
- Impacto: **degrada/bloquea a un cliente que pagó**; churn falso.
- Evidencia: [:704-712](src/domains/billing/mercado-pago.service.ts#L704-L712).
- Corrección mínima: no degradar si `hasValidPaidCoverage`; aplicar precedencia (APPROVED no retrocede).
- Prueba: APPROVED→REJECTED no degrada; rechazo antiguo no degrada.
- ¿Bloquea producción?: **Sí**.

**F2-02 · CRÍTICA · [billing.service.ts:409-416, 438-445 `applyOverdueLicenseRules`]**
- Actual: `updateMany` por id sin re-verificar estado/período/versión.
- Escenario: webhook aprueba (Sub→ACTIVE) entre `findMany` y `updateMany`; el cron la pisa a GRACE/SUSPENDED.
- Impacto: **suspende a un cliente recién pagado**; pérdida de ingresos/confianza.
- Evidencia: [:400-445](src/domains/billing/billing.service.ts#L400-L445).
- Corrección mínima: compare-and-set (`where {id, status, currentPeriodEnd}`) + usar `count`.
- Prueba: pago nuevo prevalece sobre cron; cron gana solo si sin cambio.
- ¿Bloquea producción?: **Sí**.

**F2-03 · ALTA · [mercado-pago.service.ts:832, 845 mapeos]**
- Actual: estado desconocido del proveedor → `GRACE_PERIOD` (degrada).
- Escenario: MP introduce/reenvía un estado no mapeado.
- Impacto: degradación indebida masiva ante un cambio del proveedor.
- Evidencia: [:826-846](src/domains/billing/mercado-pago.service.ts#L826-L846).
- Corrección mínima: fail-safe — no transicionar; registrar `STALE`/revisión; conservar estado local.
- Prueba: estado desconocido no degrada.
- ¿Bloquea producción?: **Sí**.

**F2-04 · ALTA · [mercado-pago.service.ts:752, :372; tenant-admin.service.ts:220]**
- Actual: "un pago aprobado" se busca con filtros distintos; algunos sin `periodEnd`/`provider`/efecto/cuarentena.
- Escenario: activar por un pago viejo, SIMULATED, o `APPROVED` sin efecto aplicado; o no reconocer cobertura vigente para evitar degradar.
- Impacto: activación indebida / degradación indebida; incoherencia económica.
- Evidencia: §5.
- Corrección mínima: `hasValidPaidCoverage` única y usarla en los tres sitios.
- Prueba: cobertura (pura + integración).
- ¿Bloquea producción?: **Sí**.

**F2-05 · ALTA · [billing.service.ts:428-435]**
- Actual: `graceEndsAt < now` nunca matchea `null` → Sub en GRACE con `graceEndsAt=null` **nunca se suspende**.
- Escenario: una fila queda en GRACE sin fecha.
- Impacto: **fuga de ingresos** (servicio activo sin pago indefinidamente).
- Evidencia: [:428-435](src/domains/billing/billing.service.ts#L428-L435).
- Corrección mínima: normalizar/alertar `null` (política §9); nunca dejar GRACE sin fecha.
- Prueba: `graceEndsAt=null` sigue la política.
- ¿Bloquea producción?: **Sí** (riesgo de ingresos).

**F2-06 · MEDIA · [billing.service.ts:408-455]**
- Actual: cron sin transacción; Sub y Tenant en `updateMany` separados; notificaciones por `tenantIds` seleccionados aunque el `updateMany` no transicione alguno.
- Escenario: fallo entre los dos `updateMany`, o notificación de una fila no transicionada.
- Impacto: divergencia Tenant/Sub; avisos incorrectos.
- Corrección mínima: transacción por transición; notificar solo lo realmente transicionado (`count`/ids).
- Prueba: Tenant/Sub coherentes; sin aviso a no-transicionados.
- ¿Bloquea producción?: **Sí** (estado parcial).

**F2-07 · MEDIA · [notification.service.ts:28-30; billing.service.ts:494-523]**
- Actual: notificaciones sin clave idempotente; dos crons duplican notificaciones + correos.
- Escenario: cron solapado / reintento.
- Impacto: spam a clientes, ruido, pérdida de confianza.
- Corrección mínima: `dedupeKey` + `skipDuplicates`/`upsert`.
- Prueba: dos crons → una notificación/correo.
- ¿Bloquea producción?: **No** (pero recomendado antes de operar).

**F2-08 · MEDIA · [mercado-pago.service.ts:668-698 (upsert update branch)]**
- Actual: la fila `Payment.status` puede retroceder `APPROVED→PENDING/REJECTED` sin guarda.
- Escenario: reenvío fuera de orden del mismo pago.
- Impacto: incoherencia de la fila (aunque el marcador económico protege el dinero); reportes engañosos.
- Corrección mínima: precedencia a nivel de fila (`decidePaymentTransition`).
- Prueba: APPROVED→PENDING ignorado.
- ¿Bloquea producción?: **No** (economía protegida por el marcador; sí conviene).

**F2-09 · BAJA · [schema WebhookEvent:302-335; billing.service.ts cron]**
- Actual: ledger sin `providerEventAt`/`decision`; el cron **no** escribe ledger.
- Impacto: no se puede reconstruir orden ni "por qué se ignoró"; el cron es opaco.
- Corrección mínima: `providerEventAt` + resultados `STALE_EVENT`/`IGNORED_BY_PRECEDENCE`; opcional registrar corridas de cron.
- ¿Bloquea producción?: **No**.

**F2-10 · BAJA · [tenant-admin.service.ts:211-274; billing.service.ts:138-307]**
- Actual: acciones manuales sin compare-and-set/`version` → last-writer-wins frente a webhook/cron.
- Impacto: divergencia rara pero posible.
- Corrección mínima: compare-and-set o `version`; auditoría de conflicto.
- ¿Bloquea producción?: **No**.

## 21. Riesgos aceptados

- La base de pruebas es hoy el **mismo proyecto** que el normal (excepción temporal autorizada); antes de producción debe separarse (condición ya registrada por Codex).
- Retención del ledger sin política (H-01 de la fase previa) — no bloquea esta fase.
- La política de cancelación (F1-06: `cancelledAt` por webhook / acceso hasta fin de período) **interactúa** con la precedencia (escenario 9) pero **queda fuera de alcance** de esta fase por instrucción.
- Añadir `version` a `Subscription` se pospone salvo que las pruebas de concurrencia lo exijan.

## 22. Veredicto

**DIAGNÓSTICO COMPLETO.** Todos los productores de estado, la máquina de `PaymentStatus`, las definiciones de cobertura, los 10 escenarios fuera de orden, ambos caminos del cron, las carreras (webhook↔cron, cron↔cron, manual↔webhook/cron), las notificaciones y el ledger fueron reconstruidos con evidencia `archivo:línea` sobre el código posterior al commit. `tsc` y `lint` limpios.

## 23. Preparación actual

**REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.** Existen defectos críticos abiertos que afectan dinero real y experiencia del cliente: degradación de suscripciones pagadas por eventos fuera de orden (F2-01), suspensión de clientes recién pagados por carrera cron↔webhook (F2-02), degradación por estado desconocido (F2-03), cobertura sin definición única (F2-04) y fuga de ingresos por `graceEndsAt=null` (F2-05). La idempotencia del efecto económico (fase previa) sigue intacta, pero no cubre estos riesgos. Se recomienda ejecutar las Subfases 1–3 (bloqueantes) antes de cobrar en producción; la Subfase 4 es de observabilidad.

*Fin del diagnóstico. No se modificó código, schema, migraciones ni configuración; no se ejecutaron `npm test`, Prisma, base de datos, Mercado Pago, build ni servidor; no se hizo commit. No se continúa con métricas, cancelación ni interfaz.*
