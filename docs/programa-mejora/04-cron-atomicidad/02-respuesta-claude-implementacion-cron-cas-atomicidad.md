# FASE 2L — Implementación del cron con CAS y atomicidad

Fecha: 2026-07-27
Autor: Claude (implementación)
Commit base (HEAD, sin commit nuevo): `a8a9a2ad9e688eb66b4dab6038f04817e5aa2d33 feat(billing): enforce payment precedence and access coverage`
Estado: **IMPLEMENTADO**

---

## 1. Resumen ejecutivo

Se reescribió el cron de mora (`applyOverdueLicenseRules`) para corregir **F2-02** (pisaba pagos/acciones recientes con `updateMany` por id), **F2-05** (`GRACE_PERIOD` con `graceEndsAt = null` en estado inconsistente) y **F2-06** (Subscription, Tenant y auditoría no atómicos).

Ahora cada candidato se **relee dentro de su propia transacción**, la decisión se **recalcula** con un **módulo puro** (`cron-decision.ts`), la transición se **reclama con compare-and-set** (`updateMany` condicional que compara status y las tres fronteras temporales) y, solo si el CAS gana, se sincroniza **Tenant + AuditLog dentro de la misma transacción** (atomicidad total: si falla Tenant o auditoría, revierte todo). Los efectos externos (Notification/email) ocurren **solo después del commit** y **solo para las transiciones realmente aplicadas**. `graceEndsAt = null` se **clasifica como inconsistente**: no se suspende, no se inventa fecha, no se toca el Tenant, se reporta en el resumen. Un error por candidato **no aborta el lote**. El resumen es **estructurado**.

Resultado: `tsc` y `lint` limpios; **204/204** pruebas puras; **319/319** suite completa por el runner seguro; conteos de base de pruebas idénticos antes/después (cero residuos); sin cambios de schema, migraciones, `.env`, runner ni guard; sin commit.

## 2. Estado inicial de Git y hash base

```
git status --short   -> limpio (0 líneas)
git log -2 --oneline ->
  a8a9a2a feat(billing): enforce payment precedence and access coverage   <- HEAD (mensaje aprobado)
  5e4be50 feat(billing): enforce idempotent atomic webhook effects        <- idempotencia Fase 1
git diff --check     -> limpio
git diff --stat      -> vacío
git diff --name-status -> vacío
```

Confirmado: el último commit tiene el mensaje aprobado; el anterior es la idempotencia de Fase 1; no hay staged diff; schema, migraciones, paquetes y entorno intactos. Hash base real registrado: **`a8a9a2ad9e688eb66b4dab6038f04817e5aa2d33`**. No se marcó `BLOQUEADO`.

## 3. Diagnóstico previo

El cron vivía íntegramente en `applyOverdueLicenseRules` ([billing.service.ts](../../../src/domains/billing/billing.service.ts)) y presentaba:

- **F2-02**: `findMany(status in [ACTIVE,TRIAL], currentPeriodEnd < now)` seguido de `updateMany({ where: { id: { in } } })` **sin re-verificar** estado/período/fronteras. Un webhook aprobado o una acción administrativa entre el `findMany` y el `updateMany` era **pisada** (suspendía a un cliente recién pagado / degradaba una reactivación).
- **F2-05**: la suspensión usaba `graceEndsAt < now`, que **nunca** matchea `null`; una fila en GRACE con `graceEndsAt = null` **jamás se suspendía ni se reportaba** (fuga de ingresos + estado ciego).
- **F2-06**: `subscription.updateMany`, `tenant.updateMany`, notificaciones, emails y auditoría eran **operaciones separadas sin transacción**; un fallo intermedio dejaba Tenant/Subscription divergentes; las notificaciones se enviaban a **todos los `tenantIds` seleccionados** aunque su `updateMany` no transicionara la fila; dos crons duplicaban notificaciones y la auditoría de lote.

TRIAL se creaba con `currentPeriodEnd = trialEndsAt` (tenant-admin.service.ts:160-161), así que decidir el trial por `trialEndsAt` (sección 5 del prompt) es **equivalente** al comportamiento nominal previo. La autenticación del cron (`Bearer CRON_SECRET`) era correcta.

## 4. Entradas del cron

- **HTTP cron**: `GET /api/cron/overdue-rules` ([route.ts](../../../src/app/api/cron/overdue-rules/route.ts)) → `applyOverdueLicenseRules(null)`. Auth: `Authorization: Bearer ${CRON_SECRET}`.
- **Manual super-admin**: `POST /api/platform/super-admin` (acción interna) → `applyOverdueLicenseRules(session.user.id)` ([super-admin/route.ts:175](../../../src/app/api/platform/super-admin/route.ts)).

Ambas entradas se conservan sin cambios de firma (el nuevo parámetro `options` tiene default).

## 5. Transiciones encontradas (y conservadas)

| Origen | Condición | Destino Subscription | Destino Tenant |
|---|---|---|---|
| ACTIVE | `currentPeriodEnd <= now` | `GRACE_PERIOD` (+ `graceEndsAt = now + graceDays`) | `GRACE_PERIOD` |
| TRIAL | `trialEndsAt <= now` (respaldo `currentPeriodEnd`) | `GRACE_PERIOD` (+ `graceEndsAt`) | `GRACE_PERIOD` |
| GRACE_PERIOD | `graceEndsAt <= now` | `SUSPENDED` | `SUSPENDED` |
| SUSPENDED / CANCELLED | — | preservar | preservar |
| PENDING_PAYMENT | — | preservar | preservar |
| GRACE_PERIOD | `graceEndsAt = null` | **INCONSISTENT** (no cambia) | no cambia |

**Nota de frontera**: la sección 5 del prompt define `<= now` (en el instante exacto se transiciona), a diferencia del `<` estricto previo. Se adoptó `<= now` de forma consistente en la decisión pura **y** en la consulta de candidatos (`lte: now`), para que selección y decisión nunca diverjan. Es un cambio de un solo instante, sin impacto de ingresos ni de acceso, y es lo que exigen los casos de prueba de frontera (`= now`).

## 6. Helper puro de decisión

Nuevo módulo **[`src/domains/billing/cron-decision.ts`](../../../src/domains/billing/cron-decision.ts)** — PURO (solo importa el **tipo** `SubscriptionStatus`, no crea PrismaClient, sin efectos):

```ts
decideCronTransition(snapshot: CronSubscriptionSnapshot, now: Date): CronTransitionDecision
```

- `CronSubscriptionSnapshot` acepta `status: SubscriptionStatus | string` y fechas `Date | null` (defensa en runtime).
- Devuelve un resultado discriminado: `{ action: "TRANSITION"; transition; nextStatus; reason }` | `{ action: "PRESERVE"; reason }` | `{ action: "INCONSISTENT"; reason }`.
- `transition`: `"ACTIVE_EXPIRED" | "TRIAL_EXPIRED" | "GRACE_EXPIRED"`.
- Fail-safe: estado desconocido → PRESERVE; fechas inválidas/ausentes → INCONSISTENT (ACTIVE/TRIAL) o INCONSISTENT (GRACE); `graceEndsAt = null` → INCONSISTENT. Nunca degrada a ciegas.
- No muta los inputs.

## 7. Selección de candidatos

La consulta inicial **solo localiza candidatos**; no es la fuente de la decisión. En [`applyOverdueLicenseRules`](../../../src/domains/billing/billing.service.ts):

```ts
where: {
  ...scope, // opcional: { tenantId: { in: options.tenantIds } }
  OR: [
    { status: "ACTIVE", currentPeriodEnd: { lte: now } },
    { status: "TRIAL", OR: [{ trialEndsAt: { lte: now } }, { trialEndsAt: null, currentPeriodEnd: { lte: now } }] },
    { status: "GRACE_PERIOD", OR: [{ graceEndsAt: { lte: now } }, { graceEndsAt: null }] },
  ],
},
select: { id: true, tenantId: true },
orderBy: { currentPeriodEnd: "asc" },
take: CRON_BATCH_LIMIT, // 500
```

- Incluye deliberadamente GRACE con `graceEndsAt = null` para poder **reportarlas** como inconsistencia.
- Límite de lote documentado (`CRON_BATCH_LIMIT = 500`); sin `updateMany` masivo, sin cargar toda la tabla, sin paginación compleja.
- `options.tenantIds` acota la corrida (producción lo omite → barrido global sin cambios; habilita aplicación por-tenant y **aísla las pruebas de integración** que corren en paralelo contra una base compartida). Ver §29.

## 8. Transacción por candidato

`processCronCandidate` procesa **cada candidato en su propia transacción** (`prisma.$transaction`):

1. Relee `Subscription` por `id` (y valida `tenantId`); si desapareció o el tenant no coincide → `SKIPPED_MISSING`.
2. Recalcula `decideCronTransition(sub, now)`.
3. `PRESERVE` → no escribe, sin auditoría, sin notificación, sin email.
4. `INCONSISTENT` → no cambia Subscription/Tenant, sin notificación de suspensión, devuelve al resumen.
5. `TRANSITION` → CAS; si gana, sincroniza Tenant + AuditLog en la **misma** transacción; commit.
6. Efectos externos **solo después del commit**.

## 9. CAS

La transición se reclama con `updateMany` condicional que compara el snapshot exacto recién leído:

```ts
where: { id, tenantId, status, currentPeriodEnd, trialEndsAt, graceEndsAt }
```

- Compara **status y las tres fronteras temporales** (no reconstruye ni redondea fechas; no compara solo por id). Cualquier pago, webhook o acción administrativa que haya cambiado la fila hace `count = 0`.
- `count === 1` → el cron ganó: actualiza Tenant, crea AuditLog, `APPLIED`.
- `count === 0` → otro proceso modificó la fila: **no** toca Tenant, **no** crea AuditLog/Notification/email, **no** reintenta, `SKIPPED_CONCURRENT_CHANGE`. El proceso que cambió la fila prevalece.

## 10. Pago concurrente

Test 6 (integración): con la Subscription ACTIVE vencida, en el seam `BEFORE_CRON_SUBSCRIPTION_CAS` se dispara un **Payment APPROVED real por el webhook** (fetch mockeado). El pago pone la Subscription en ACTIVE con período nuevo; el CAS del cron (snapshot viejo) pierde (`count = 0`). Resultado verificado: Subscription ACTIVE, nuevo período presente, Tenant ACTIVE, sin auditoría de gracia, `skippedConcurrentChange = 1`. No se duplica la lógica del webhook dentro del cron.

## 11. Reactivación concurrente

Test 7 (integración): con GRACE vencida y evidencia de acceso válida, en `BEFORE_CRON_SUBSCRIPTION_CAS` se ejecuta `updateTenantStatusForSuperAdmin(actor, tenant, "ACTIVE")`. El CAS del cron pierde. Resultado: Subscription ACTIVE, Tenant ACTIVE, sin suspensión, sin auditoría de suspensión, `skippedConcurrentChange = 1`.

## 12. Dos cron concurrentes

Test 8 (integración): en `BEFORE_CRON_SUBSCRIPTION_CAS` del cron-1 se corre un **segundo cron completo** (sin seams) que gana la transición y la audita; el cron-1 continúa y su CAS pierde (`count = 0`). Resultado: **una** transición, **una** auditoría; el segundo devuelve `movedToGracePeriod = 1`, el primero `skippedConcurrentChange = 1`. El CAS de PostgreSQL es la única protección (sin lock distribuido).

## 13. Atomicidad

Subscription + Tenant + AuditLog se confirman **juntos** en la misma transacción. Verificado con seams que lanzan:

- Test 11: fallo en `BEFORE_CRON_TENANT_UPDATE` → Subscription revierte (sigue ACTIVE), Tenant nunca cambia, sin auditoría; `errors = 1`.
- Test 12: fallo en `BEFORE_CRON_AUDIT_LOG` → Subscription y Tenant revierten (siguen GRACE_PERIOD), sin auditoría parcial; luego el **reintento** (test 13) aplica la transición y crea exactamente una auditoría.

Nunca queda Subscription suspendida con Tenant activo (ni viceversa), ni transición sin auditoría, ni auditoría de una transición no confirmada. `registerAuditLog(..., tx)` usa el cliente transaccional existente.

## 14. Grace null

`graceEndsAt = null` → `decideCronTransition` devuelve `INCONSISTENT` (`GRACE_PERIOD_WITHOUT_BOUNDARY`). El cron **no suspende, no inventa fecha, no reinicia Grace, no toca Tenant, no notifica**; lo cuenta en `inconsistentGraceWithoutBoundary` y en `inconsistentDetails` (subscriptionId, tenantId, reason). Verificado en tests 5 y 17.

## 15. Notification y email

Esta fase **no** implementa la deduplicación definitiva (es la siguiente subfase). Reglas mínimas aplicadas y verificadas:

- Ningún email dentro de la transacción (se disparan tras el commit).
- Ningún email si el CAS pierde (tests 15), si la transacción revierte (test 16) o para PRESERVE/INCONSISTENT (tests 5, 17).
- Las notificaciones se crean **solo para las transiciones realmente aplicadas** (acotadas a `appliedGraceTenantIds` / `appliedSuspendedTenantIds`), **después** del commit, mediante `notifyTenantAdminsOfLicenseChange` (comportamiento externo existente, sin ampliar diseño, sin `dedupeKey`).
- **Ubicación documentada**: Notification queda **fuera** de la transacción del cron (después del commit). Riesgo restante: dos corridas separadas del cron sobre transiciones distintas aún podrían generar avisos repetidos; la deduplicación con `dedupeKey` (que requiere migración) queda para la subfase de notificaciones (ver §29).

## 16. Resumen del lote

`applyOverdueLicenseRules` devuelve `CronRunSummary` estructurado:

```ts
{ movedToGracePeriod, movedToSuspended,   // compat. con UI super-admin + toast
  examined, preserved, skippedConcurrentChange,
  inconsistentGraceWithoutBoundary, errors,
  errorDetails: [{ subscriptionId, tenantId, errorCode }],
  inconsistentDetails: [{ subscriptionId, tenantId, reason }] }
```

Sin datos personales ni secretos. Una inconsistencia individual no vuelve fallido el lote. Verificado en test 20 (las seis categorías en una sola corrida).

## 17. Manejo de errores

Cada candidato se procesa de forma independiente en su transacción; un error se **captura** (no relanza), se clasifica con `classifyCronError` (solo `PRISMA_<code>` / `error.name`, **sin stack, mensaje ni datos sensibles**) y se registra en `errorDetails` (subscriptionId, tenantId, errorCode). Las transiciones ya confirmadas de otros candidatos **no** se revierten. Verificado en test 19 (A falla y revierte; B se procesa). El cron puede terminar con estado parcial y conteo de errores; un error global de configuración/auth no se oculta (solo se capturan errores por-candidato).

## 18. Autenticación

`GET /api/cron/overdue-rules` compara `Authorization` con `Bearer ${CRON_SECRET}`; si falta el secreto o no coincide, responde `401`. Se inspeccionó y **no se rediseñó** (no hay defecto crítico evidente). El secreto no se expone. No requirió cambios en esta fase.

## 19. Seams

Nuevos seams de concurrencia **solo para pruebas**, mismo patrón seguro aprobado (`__unsafeSetCronTestHooks` / `runCronStep`, gatillados por `NODE_ENV === "test"`, sin entrada HTTP, sin sleeps, sin promesas eternas, reset en `finally` y en `after()`):

`AFTER_CRON_CANDIDATE_SELECTED`, `AFTER_CRON_SUBSCRIPTION_READ`, `BEFORE_CRON_SUBSCRIPTION_CAS`, `BEFORE_CRON_TENANT_UPDATE`, `BEFORE_CRON_AUDIT_LOG`. El `context` (`subscriptionId`/`tenantId`/`candidateIds`) permite dirigir el hook a un solo candidato. Nunca ejecutables en producción.

## 20. Archivos modificados

- **Nuevo** [`src/domains/billing/cron-decision.ts`](../../../src/domains/billing/cron-decision.ts) — módulo puro de decisión.
- **Modificado** [`src/domains/billing/billing.service.ts`](../../../src/domains/billing/billing.service.ts) — reescritura de `applyOverdueLicenseRules` (CAS + atomicidad + resumen), `processCronCandidate`, `CronRunSummary`, seams del cron, `classifyCronError`, `CRON_BATCH_LIMIT`, parámetro `options.tenantIds`, import de `Prisma` y `cron-decision`.
- **Nuevo** [`tests/unit/cron-decision.test.ts`](../../../tests/unit/cron-decision.test.ts) — 17 pruebas puras.
- **Nuevo** [`tests/billing-cron-atomicity.test.ts`](../../../tests/billing-cron-atomicity.test.ts) — 21 pruebas de integración.
- **Nuevos** docs 01 y 02 de esta fase.

Ningún archivo fuera de las categorías permitidas. La UI del super-admin **no** se modificó: la auditoría por-transición conserva el action `TENANT_OVERDUE_RULES_APPLIED` con metadata `movedToGracePeriod`/`movedToSuspended` por-tenant, compatible con el renderer existente ([super-admin/page.tsx:283-286](../../../src/app/(protected)/super-admin/page.tsx)); el toast lee el `CronRunSummary` (retrocompatible).

## 21. Schema y migración

**Sin cambios.** `prisma/schema.prisma` y `prisma/migrations/` intactos; no hubo migración, `db push`, seed, build ni servidor. No se añadió `Subscription.version`, ni columnas, ni timestamps del proveedor, ni `Notification.dedupeKey`. No fue necesario `BLOQUEADO`.

## 22. Pruebas puras

[`tests/unit/cron-decision.test.ts`](../../../tests/unit/cron-decision.test.ts) — 17 casos: ACTIVE vigente/vencida/`=now`; TRIAL vigente/vencido/`=now`/respaldo; GRACE vigente/vencida/`=now`/`null`→INCONSISTENT; SUSPENDED; CANCELLED; PENDING_PAYMENT; desconocido→PRESERVE; fechas inválidas/ausentes→INCONSISTENT; no-mutación. No importan Prisma.

Total puras del repo: **204/204 PASS** (187 previas + 17 nuevas), 0 fail/skip/todo.

## 23. Pruebas de integración

[`tests/billing-cron-atomicity.test.ts`](../../../tests/billing-cron-atomicity.test.ts) — 21 escenarios reales contra PostgreSQL:

- **Nominales** (1-5): ACTIVE→Grace una vez; GRACE→SUSPENDED una vez; TRIAL→Grace; vigente no cambia; `graceEndsAt=null` inconsistente.
- **Carreras** (6-10): pago APPROVED gana; reactivación gana; dos crons → una transición/auditoría; cambio de período pierde CAS; cambio de status pierde CAS.
- **Atomicidad** (11-13): fallo antes de Tenant revierte Subscription; fallo antes de AuditLog revierte ambos; reintento funciona; sin auditoría parcial.
- **Efectos externos** (15-18): CAS perdido no crea Notification/email; rollback no crea Notification/email; INCONSISTENT no crea Notification/email; una transición notifica una sola vez y no envía email real.
- **Lote** (19-20): un candidato falla y otro se procesa; el resumen refleja aplicados/preservados/concurrentes/inconsistentes/errores.
- (21): `getGracePeriodDays` positivo.

Sin `skip`, sin sleeps, sin emails reales, fetch de Mercado Pago mockeado.

## 24. Compatibilidad

Suite completa **319/319 PASS** (283 previas + 17 puras del cron + 19 integración del cron; el conteo del runner reporta 319 tests totales), 0 fail/skip/todo. Siguen verdes: idempotencia de Payment, precedencia, cobertura, reactivación Serializable, período compartido, términos pendientes, webhook ledger, auditoría, autenticación y las pruebas del guard/seguridad de base de pruebas. No se modificó ninguna prueba anterior para reducir garantías.

## 25. Procedimiento seguro

- Ruta insegura: `npm test` **abortó antes de Prisma** con el guard (`TEST_DATABASE_URL apunta al mismo destino que DATABASE_URL`), como se espera con el entorno normal.
- Ruta autorizada (POSIX): `env DATABASE_URL= DIRECT_URL= npm test` — el runner fuerza `DATABASE_URL` al destino de pruebas y planta la marca. No se movió `.env`, no se modificó `.env.test`, no se desactivó el guard.

## 26. Comandos ejecutados

```
git status --short / git log -2 --oneline / git diff --check / --stat / --name-status
npx tsc --noEmit                         -> PASS
npm run lint                             -> PASS (0 warnings/errors)
node --import tsx --test tests/unit/*.test.ts   -> 204/204 PASS
npm test                                 -> abortado por el guard (esperado)
env DATABASE_URL= DIRECT_URL= npm test   -> 319/319 PASS
(conteos de base de pruebas antes/después con script diagnóstico de solo lectura, ya eliminado)
```

No hubo build, servidor, cron real, migración, seed, proveedor real, commit ni push. No se reintentó automáticamente ningún fallo lógico (el único fallo — assert de email en test 18 — se corrigió deliberadamente, ver §29).

## 27. Resultados

- Typecheck: **PASS**. Lint: **PASS**. Puras: **204/204**. Suite completa: **319/319**.
- Primera corrida de la suite: 318/319; único fallo por una aserción de email (el correo transaccional está habilitado por defecto y había `RESEND_API_KEY` en el entorno de pruebas, y un mock de fetch residual lo hacía "enviar"). Se neutralizó el envío de forma segura y determinista (ver §29). Segunda corrida: **319/319**.

## 28. Limpieza

Conteos de la base de **pruebas** antes y después de la suite (idénticos):

```
{ tenants: 6, users: 17, subscriptions: 6, payments: 5, webhooks: 0,
  auditLogs: 164, notifications: 42, emailLogs: 26, pricingRules: 7,
  cronResidue: 0, webhookResidue: 0 }
```

Cero fixtures del cron (`billing-cron-*`), cero de billing/webhook (`billing-webhook-*`), cero WebhookEvent residuales, cero usuarios de prueba residuales. Cero emails reales (envío deshabilitado en el proceso del archivo). Cero llamadas reales a Mercado Pago (fetch mockeado). `.env` intacto; `.env.test` ignorado y sin cambios; conteos de mockdata sin cambios. `git diff --check` limpio (solo el aviso informativo de fin de línea LF→CRLF de Windows).

## 29. Riesgos restantes

1. **Notificaciones sin deduplicación definitiva** (fuera de alcance por instrucción): dos corridas separadas del cron aún podrían repetir un aviso de licencia. Mitigado parcialmente (solo se notifican transiciones realmente aplicadas, después del commit). La `dedupeKey` requiere migración → **siguiente subfase**.
2. **Frontera `<= now`**: alineada con la sección 5 (antes `<` estricto). Cambio de un solo instante, sin impacto de ingresos/acceso; documentado.
3. **Parámetro `options.tenantIds`**: añadido en `applyOverdueLicenseRules` para aislar las pruebas de integración (que corren en paralelo contra una base compartida) y habilitar una futura aplicación por-tenant. **Producción no lo usa** (ambas rutas llaman sin él → barrido global idéntico). Es un parámetro con default, retrocompatible; se documenta aquí su necesidad (aislamiento de pruebas) por transparencia.
4. **Neutralización de email en pruebas**: en `tests/billing-cron-atomicity.test.ts` se retira `RESEND_API_KEY` del proceso del archivo (restaurado en `after()`), lo que hace fallar el envío **antes** de cualquier fetch al proveedor (rama sin API key → EmailLog FAILED). Es process-local (cada archivo de prueba corre en su propio proceso, como confirma el patrón de `globalThis.fetch` del archivo de webhooks), no toca `.env` ni el flag de plataforma compartido. Garantiza cero emails reales.
5. **Base de pruebas = mismo proyecto** (excepción temporal ya registrada por Codex): debe separarse antes de producción.
6. La cancelación definitiva, la reparación agresiva de datos históricos y la observabilidad del ledger del cron siguen fuera de alcance.

## 30. Recomendación

**Aprobar** las correcciones F2-02/05/06. El cron ya nunca pisa un pago ni una acción administrativa (CAS por status + fronteras), es atómico (Subscription+Tenant+AuditLog), no suspende ni reinicia `graceEndsAt = null`, no produce efectos externos en CAS perdido/rollback/inconsistente, y un candidato fallido no bloquea el lote. Tras la revisión de Codex, el siguiente paso natural es la **subfase de notificaciones y emails** (deduplicación con `dedupeKey`, que sí requiere migración). No se hizo commit; cuando corresponda, con staging explícito de los archivos aprobados (nunca `git add .`).

## 31. Estado

**IMPLEMENTADO.**

- Prompt exacto guardado en: [`docs/programa-mejora/04-cron-atomicidad/01-prompt-claude-implementacion-cron-cas-atomicidad.md`](01-prompt-claude-implementacion-cron-cas-atomicidad.md).
- No se hizo commit ni push. No se inició la subfase de notificaciones.

---

### Anexo: criterios de aceptación (24/24)

1. Cada candidato se relee dentro de una transacción ✓
2. La decisión se recalcula dentro ✓
3. Toda transición usa CAS ✓
4. El CAS compara status y frontera exacta ✓ (status + las tres fronteras)
5. Payment concurrente prevalece ✓ (test 6)
6. Reactivación concurrente prevalece ✓ (test 7)
7. Dos crons no duplican transición ✓ (test 8)
8. Tenant solo cambia si el CAS gana ✓
9. AuditLog es atómico ✓
10. Fallo de Tenant o auditoría revierte todo ✓ (tests 11, 12)
11. Grace null no se suspende ni reinicia ✓ (tests 5, 17)
12. CAS perdido no produce efectos externos ✓ (test 15)
13. Un candidato fallido no bloquea todo el lote ✓ (test 19)
14. El resumen es estructurado ✓ (test 20)
15. No cambia schema ✓
16. No existe migración ✓
17. Typecheck pasa ✓
18. Lint pasa ✓
19. Pruebas puras pasan ✓ (204/204)
20. Suite completa pasa ✓ (319/319)
21. No hay `skip` ✓
22. Fixtures limpios ✓
23. No se envían emails reales ✓
24. No se hace commit ✓
