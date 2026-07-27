# FASE 2N — Revisión final independiente del cron con CAS, atomicidad y control de starvation

Fecha: 2026-07-27
Autor: Claude (revisión independiente, solo lectura)
Commit base (HEAD, sin commit nuevo): `a8a9a2a feat(billing): enforce payment precedence and access coverage`
**Veredicto: APROBADA CON RIESGOS MENORES**

---

## 1. Resumen ejecutivo

Revisé adversarialmente el estado final del cron de mora tras la implementación de Claude (FASE 2L) y la corrección directa de Codex (FASE 2M). Los siete hallazgos 2M-01…2M-07 están **corregidos** (uno con matices menores). La decisión pura es coherente y fail-safe; la selección usa cuatro buckets accionables con cupos propios que impiden que una categoría bloquee a otra; las inconsistencias se diagnostican aparte y no consumen cupo; cada candidato se relee y transiciona con CAS de status + tres fronteras dentro de su propia transacción; Tenant y AuditLog son atómicos con la transición; los efectos externos ocurren solo tras el commit y solo para transiciones aplicadas, y un fallo externo no revierte una transición confirmada; la autenticación es fail-closed con `timingSafeEqual`; los seams son exclusivos de test.

No hallé defectos críticos, altos ni medios dentro del alcance. Quedan **cuatro riesgos operativos bajos** (starvation intra-categoría solo bajo un modo de fallo permanente implausible; cupos de bucket vacío no redistribuidos; CAS conservador ante campo irrelevante; `errorDetails` acotado por el lote pero no por el tope de 50), todos aceptables y ya divulgados por Codex. Verificaciones ejecutadas: `tsc` PASS, `lint` PASS, **204/204** pruebas puras, **326/326** suite completa por el runner seguro, `npm test` inseguro aborta antes de Prisma, conteos de base de pruebas idénticos antes/después (cero residuos), sin cambios de schema/migraciones/`.env`/runner/paquetes. **Puede convertirse en commit.**

## 2. Estado de Git

```
git status --short:
   M src/app/api/cron/overdue-rules/route.ts
   M src/domains/billing/billing.service.ts
   ?? docs/programa-mejora/04-cron-atomicidad/
   ?? src/domains/billing/cron-decision.ts
   ?? tests/billing-cron-atomicity.test.ts
   ?? tests/unit/cron-decision.test.ts
git log -2 --oneline:
   a8a9a2a feat(billing): enforce payment precedence and access coverage   <- HEAD
   5e4be50 feat(billing): enforce idempotent atomic webhook effects
git diff --check: limpio
```

Confirmado: HEAD sigue en el commit de precedencia/cobertura; **no existe commit nuevo**; el working tree contiene únicamente los cambios del cron (route + billing.service) y los archivos no rastreados de la subfase (cron-decision, ambas pruebas, docs 01–06); no hay staged diff; schema, migraciones, package files y `.env`/`.env.test` intactos; no hay cambios definitivos de Notification/email, UI ni métricas; no se inició la subfase de deduplicación.

## 3. Alcance del diff

`git diff --stat`: `route.ts` +4/-2 (usa `isCronAuthorizationValid`); `billing.service.ts` +603/-68 (reescritura del cron: buckets, cupos, CAS, atomicidad, efectos externos observables, auth). Untracked: `cron-decision.ts` (módulo puro), `tests/unit/cron-decision.test.ts`, `tests/billing-cron-atomicity.test.ts`, docs 01–06. Ningún archivo fuera de las categorías autorizadas.

## 4. Verificación 2M-01 a 2M-07

| ID | Estado | Evidencia | Riesgo restante | ¿Bloquea commit? | ¿Bloquea sig. subfase? | ¿Bloquea prod? |
|---|---|---|---|---|---|---|
| 2M-01 · inconsistencias consumían el lote accionable | **CORREGIDO** | `selectCronWork` cuenta GRACE-null aparte (`tx.subscription.count` + `findMany take: inconsistencyDetailLimit`, [billing.service.ts:757-763]) sin tocar los 4 buckets; test 22 demuestra que 3 inconsistencias no impiden suspender una GRACE vencida | Ninguno | No | No | No |
| 2M-02 · una categoría podía bloquear las demás | **CORREGIDO** | 4 buckets con cupo propio (`allocateCronBucketLimits`, 125 c/u de 500) intercalados (`interleaveCronCandidateBuckets`); test 23 (backlog ACTIVE no bloquea GRACE) | Starvation intra-categoría (N-02, bajo) | No | No | No |
| 2M-03 · efectos externos opacos | **CORREGIDO** | `CronExternalEffectsSummary` con intentos/éxitos/fallos por etapa, errores saneados y acotados a 50 ([:588-643, :956-1060]); test 18b | Ninguno | No | No | No |
| 2M-04 · prueba de dos crons no era una carrera real | **CORREGIDO** | Barrera real en `AFTER_CRON_SUBSCRIPTION_READ`: ambos crons leen antes de liberar (`readers===2`), `Promise.all` (test 8) | Ninguno | No | No | No |
| 2M-05 · detalles/diagnósticos sin límites suficientes | **CORREGIDO CON MATICES** | `inconsistentDetails` y `externalEffects.errors` acotados a 50 con flag de truncamiento; **`errorDetails` acotado solo por el lote (≤500), no por el tope de 50** (N-01) | N-01 (bajo, sin PII, ≤500) | No | No | No |
| 2M-06 · comparación directa del secreto | **CORREGIDO** | `isCronAuthorizationValid`: chequeo de longitud + `timingSafeEqual` ([:406-411]); test 26 | Ninguno | No | No | No |
| 2M-07 · faltaba prueba de fallo real de AuditLog | **CORREGIDO** | Test 14: `actorUserId` inexistente → violación FK real en `registerAuditLog` → rollback de Subscription+Tenant, sin auditoría parcial, reintento limpio | Ninguno | No | No | No |

## 5. Matriz de decisión pura

Reconstruida contra `decideCronTransition` ([cron-decision.ts:104-163]). Coincide exactamente con la matriz esperada:

| Estado | Frontera | Esperado | Código |
|---|---|---|---|
| ACTIVE | vigente | PRESERVE | `ACTIVE_CURRENT` ✓ |
| ACTIVE | vencida | ACTIVE_EXPIRED | ✓ |
| ACTIVE | = now | ACTIVE_EXPIRED | `isExpired` usa `<= now` ✓ |
| ACTIVE | null/inválida | INCONSISTENT | `ACTIVE_WITHOUT_PERIOD_END` ✓ |
| TRIAL | vigente | PRESERVE | `TRIAL_CURRENT` ✓ |
| TRIAL | vencida | TRIAL_EXPIRED | ✓ |
| TRIAL | = now | TRIAL_EXPIRED | ✓ |
| TRIAL | sin trialEndsAt, período vigente | PRESERVE | fallback a `currentPeriodEnd` ✓ |
| TRIAL | sin trialEndsAt, período vencido | TRIAL_EXPIRED | ✓ |
| TRIAL | sin fronteras | INCONSISTENT | `TRIAL_WITHOUT_BOUNDARY` ✓ |
| GRACE | vigente | PRESERVE | `GRACE_CURRENT` ✓ |
| GRACE | vencida | GRACE_EXPIRED | ✓ |
| GRACE | = now | GRACE_EXPIRED | ✓ |
| GRACE | null | INCONSISTENT | `GRACE_WITHOUT_BOUNDARY` ✓ |
| SUSPENDED | cualquiera | PRESERVE | terminal ✓ |
| CANCELLED | cualquiera | PRESERVE | terminal ✓ |
| PENDING_PAYMENT | cualquiera | PRESERVE | ✓ |
| desconocido | cualquiera | PRESERVE | `default` fail-safe ✓ |

Confirmado: la función **no muta** inputs (test puro 15); fechas inválidas (`Invalid Date`) → INCONSISTENT, nunca degradan (guardas `isValidDate`); `<= now` consistente en decisión **y** en selección (`lte: now`); el fallback de TRIAL coincide con el comportamiento histórico (`currentPeriodEnd === trialEndsAt` al crear un trial); selección y decisión no se contradicen (mismos predicados y frontera). 204/204 pruebas puras (17 específicas del cron).

## 6. Selección

Cuatro consultas accionables independientes bajo una transacción de lectura `RepeatableRead` ([billing.service.ts:717-780]): `ACTIVE & currentPeriodEnd<=now`; `TRIAL & trialEndsAt<=now`; `TRIAL & trialEndsAt=null & currentPeriodEnd<=now`; `GRACE_PERIOD & graceEndsAt<=now`. Cada una con cupo propio, `orderBy` por frontera asc y **desempate por `id` asc**. Los resultados se intercalan round-robin (`interleaveCronCandidateBuckets`), orden determinista. Las inconsistencias (`GRACE & graceEndsAt=null`) se cuentan y muestrean en consultas separadas que **no** consumen los cupos. Test 24 confirma el desempate por `id`; test 23 la independencia de cupos.

## 7. Distribución de cupos

- **Límite global**: `CRON_BATCH_LIMIT = 500`, repartido en `CRON_ACTIONABLE_BUCKETS = 4`.
- **Cupo por bucket**: `base = floor(500/4) = 125`, `remainder = 500%4 = 0` → **125 por bucket** (grace, active, trial, trialFallback). El residuo (cuando existe, p. ej. con límites de prueba reducidos) se reparte de a uno a los primeros buckets en el orden `[graceExpired, activeExpired, trialExpired, trialFallbackExpired]`.
- **Bucket vacío**: su cupo **no** se redistribuye; la corrida puede procesar menos de 500.
- **Máximo real procesado**: 500 (suma de cupos).

Evaluación del riesgo documentado (bucket vacío no redistribuye): es una **decisión aceptable** que **solo reduce throughput**; no causa starvation, porque cada categoría no vacía siempre recibe sus 125 por corrida y drena su backlog en corridas sucesivas. **No bloquea el commit** (ver N-03).

## 8. Starvation

**Entre categorías**: imposible bloquear completamente a otra — cada bucket tiene cupo fijo e independiente (test 23).

**Fallos permanentes intra-categoría**: si una categoría acumulara **más candidatos que su cupo (125)** que fallaran **permanentemente** y ordenaran siempre primero (frontera+id), cada corrida seleccionaría los mismos 125 y las filas posteriores no progresarían. No existe cursor, rotación ni exclusión temporal. Sin embargo:

- Un "fallo permanente" por candidato exige que la transacción (relectura → CAS → `tenant.update` por id → `registerAuditLog`) lance **en cada corrida**. En este flujo de updates simples sobre filas existentes, un fallo permanente reproducible no es un estado estable realista (los fallos plausibles son transitorios: deadlock/timeout, que se resuelven en la siguiente corrida).
- El CAS perdido y el PRESERVE no son fallos: reflejan un cambio concurrente y se re-evalúan con estado fresco en la siguiente corrida.
- El volumen requerido (>125 fallos permanentes en una sola categoría) es implausible para la escala del negocio (operador único).

Clasificación honesta: **retraso acotado en la práctica; starvation indefinida solo teórica bajo un modo de fallo permanente que no ocurre en este flujo**. Riesgo **BAJO aceptado** (N-02), no bloqueante. Si en el futuro apareciera un modo de fallo permanente por-candidato, debe reevaluarse con cursor/rotación.

## 9. Inconsistencias

`GRACE_PERIOD` con `graceEndsAt = null`: consultado aparte (count + findMany limitado); no consume lote accionable; no cambia Subscription ni Tenant; no crea AuditLog de suspensión; no crea Notification; no intenta email; informa `inconsistencies`/`inconsistentGraceWithoutBoundary` con el total real; limita `inconsistentDetails` a 50 (config) con `inconsistentDetailsTruncated`. Tests 5, 17, 22. La respuesta HTTP no puede contener miles de IDs: `inconsistentDetails ≤ 50`.

## 10. Transacción por candidato

Flujo verificado en `processCronCandidate` ([:472-564]): (1) selección; (2) relectura `findFirst({ id, tenantId })` — `SKIPPED_MISSING` si no coincide; (3) decisión pura; (4) CAS; (5) `tenant.update`; (6) `registerAuditLog(..., tx)`; (7) commit; (8) efectos externos fuera. Confirmado: cada candidato en su propia `prisma.$transaction`; PRESERVE e INCONSISTENT no escriben; CAS perdido no actualiza Tenant ni audita; un candidato fallido se captura y no revierte a otros (tests 11, 12, 14, 19).

## 11. CAS

`updateMany` con `where { id, tenantId, status, currentPeriodEnd, trialEndsAt, graceEndsAt }` y `data` sin reconstruir fechas ([:511-521]). Nulls comparados directamente por Prisma (igualdad de null). `count === 1` es la única señal de éxito; `count === 0` → `SKIPPED_CONCURRENT_CHANGE`; **sin reintento automático**. Tests 9 (período), 10 (status).

**Tres fronteras**: para cualquier transición se comparan las tres. Si otro proceso cambia solo un campo irrelevante (p. ej. `trialEndsAt` de una ACTIVE vencida), el CAS pierde de forma **conservadora** (`count = 0`) y reintenta en la siguiente corrida con snapshot fresco. Clasificación: **fail-safe correcto / falso positivo aceptable**; ningún caller actual realiza ese cambio aislado (las renovaciones/acciones cambian status+períodos juntos). Riesgo BAJO aceptado (N-04), no bloqueante.

## 12. Tenant concurrente

Busqué globalmente todos los callers de `tenant.update`/`updateMany`. Los que cambian **`Tenant.status`** son: webhook (`applyTenantStatusInTx`, mercado-pago.service.ts:1283-1294), renovación/cortesía (billing.service.ts:204,290), reactivación/suspensión/cancelación (`updateTenantStatusForSuperAdmin`, tenant-admin.service.ts:273) y el propio cron. **Todos** cambian Tenant.status **junto con** Subscription en la misma transacción. Los updates que **no** tocan Subscription (edición de nombre/ciudad/dirección/unidades en tenant.service.ts:100, tenant-admin.service.ts:376, onboarding) **no** modifican `status`. Evidencia: la guarda de tenant.service.ts:90 solo permite name/city/address; tenant-admin.service.ts:376 actualiza `data` (básicos) + términos pendientes de Subscription, sin status.

Conclusión: **no existe una operación legítima que cambie `Tenant.status` sin cambiar Subscription en la misma transacción**. Por tanto el cron —que reescribe `Tenant.status` solo tras ganar el CAS de Subscription y solo la columna `status`— **no puede sobrescribir una acción administrativa real de Tenant** (no hay ninguna Tenant-only de status), ni pisa una edición de básicos (columnas distintas). Invariante confirmado.

## 13. Pago concurrente

Test 6: usa el servicio real `processMercadoPagoWebhook` con `fetch` mockeado; procesa un APPROVED real que actualiza período de Payment y de Subscription (invariancia de períodos preservada por la lógica del webhook ya aprobada en 2J), pone Tenant ACTIVE; ocurre en `BEFORE_CRON_SUBSCRIPTION_CAS` (después de la relectura, antes del CAS); el CAS del cron pierde (`skippedConcurrentChange = 1`); no se crea auditoría de Grace; `notification`/`email` no se intentan (no hay APPLIED). Replay del webhook no duplica economía (garantía de la subfase de idempotencia, intacta). Confirmado.

## 14. Reactivación concurrente

Test 7: usa `updateTenantStatusForSuperAdmin` con evidencia válida (`createAccessEvidence`: MERCADO_PAGO/APPROVED/efecto aplicado/período vigente); la reactivación es Serializable, actualiza Subscription+Tenant y crea su propia auditoría; el cron pierde el CAS, no suspende, no genera auditoría ni efecto externo de suspensión. Confirmado.

## 15. Dos crons

Test 8: barrera real en `AFTER_CRON_SUBSCRIPTION_READ` — ambos crons (lanzados con `Promise.all`) incrementan `readers` y esperan; al llegar a 2 se libera, de modo que **ambos leyeron el mismo snapshot antes de intentar el CAS**. Sin sleeps. La barrera se libera en `finally` aunque una operación falle (`releaseBarrier()` idempotente), sin deadlock (una sola fila, bloqueo FIFO en el `updateMany`) ni promesas colgadas. Resultado: exactamente un CAS gana (`first+second movedToGracePeriod === 1`), una sola actualización de Tenant, **una sola** auditoría; la perdedora reporta `skippedConcurrentChange`. Sin efectos externos duplicados. Confirmado 2M-04.

## 16. Atomicidad

Subscription, Tenant y AuditLog en la misma `prisma.$transaction` ([:478-563]). Pruebas: fallo antes de Tenant (11), fallo antes de AuditLog (12), **fallo real de FK al crear AuditLog** (14, actor inexistente), y reintento posterior (12/14). Todos: rollback de Subscription y Tenant, sin AuditLog parcial, y el reintento limpio produce **una sola** auditoría final. Confirmado.

## 17. Efectos externos

`notifyTenantAdminsOfLicenseChange` ([:956-1060]) se invoca **después** del bucle transaccional y **solo** con `appliedGraceTenantIds`/`appliedSuspendedTenantIds`. Reconstruye: carga de destinatarios (ADMIN activos), `createNotification` por admin (`allSettled`), `sendEmailSafe`/Resend por admin (`allSettled`), errores capturados y clasificados sin PII, continuidad entre tenants. Confirmado: solo para APPLIED; después del commit; nunca para CAS perdido (15), rollback (16), PRESERVE (4) ni INCONSISTENT (5, 17).

## 18. Fallos externos

Test 18b: se desactiva el ADMIN en `AFTER_CRON_EFFECT_RECIPIENTS_READ` (fallo real: `createNotification` rechaza para ese tenant). Verificado: ambas transiciones **permanecen aplicadas** (`movedToGracePeriod = 2`, ambas GRACE, dos auditorías), el fallo de un tenant no corta al otro (`notificationSucceeded=1`, `notificationFailed=1`, `emailFailed=2` sin API key), `errorCount=3` acotado sin truncar. Un fallo de destinatarios/Notification/Resend **no** cambia la clasificación de la transición ni detiene a los demás tenants. Confirmado 2M-03.

## 19. Resumen (`CronRunSummary`)

Presentes y con semántica correcta ([:782-800]): `movedToGracePeriod`, `movedToSuspended` (compatibilidad UI/toast); `examined`/`actionableExamined` (candidatos accionables); `actionableBatchLimit` (cupo); `actionableByCategory` (conteo por bucket); `preserved`; `skippedConcurrentChange`; `inconsistencies`/`inconsistentGraceWithoutBoundary`; `inconsistentDetails` (≤50) + `inconsistentDetailsTruncated`; `errors` + `errorDetails`; `externalEffects` (intentos/éxitos/fallos de notificación y email, tenants intentados, errores ≤50 + `errorsTruncated`). **No** incluye nombres, correos, mensajes internos, stack ni secretos: `classifyCronError` devuelve solo `PRISMA_<code>`/`error.name`; los errores externos exponen `stage`, `tenantId` (id interno) y `errorCode`. Compatible con la ruta cron, la ruta super-admin y la UI (`TENANT_OVERDUE_RULES_APPLIED` con `movedToGracePeriod`/`movedToSuspended` por tenant). Matiz: `errorDetails` se acota por el lote (≤500) pero no por el tope de 50 (N-01, informativo).

## 20. Autenticación

`isCronAuthorizationValid(secret, authHeader)` ([:406-411]): sin `CRON_SECRET` → false (401); sin header → false (401); header incorrecto → false; `Bearer undefined` sin secreto → false; comparación con `timingSafeEqual` sobre `Buffer`, **precedida de chequeo de longitud** (evita el throw por longitudes distintas y el leak de contenido). El secreto se lee de `process.env` en la ruta, no de HTTP; no se registra ni se devuelve. La ruta cron llama `applyOverdueLicenseRules(null)` **sin** aceptar `tenantIds`, límites ni overrides desde HTTP. Test 26 cubre ausencia de secreto, ausencia de header, credencial incorrecta y positivos vía `isCronAuthorizationValid`, y **restaura `CRON_SECRET`** en `finally`. (El test evita ejecutar el barrido global real por la ruta: solo prueba el positivo mediante el helper puro.)

## 21. `options.tenantIds`

`normalizeCronTenantIds` ([:645-660]): recorta cada id (`trim`), rechaza no-string y strings vacíos (`TypeError`), deduplica (`Set`), y limita a `CRON_TENANT_SCOPE_LIMIT = 1000` (`RangeError`). Lista vacía → `[]` → `where { tenantId: { in: [] } }` → procesa cero (test 25). No proviene del endpoint cron ni super-admin (ambos llaman sin `options`). No modifica el barrido de producción (scope `{}` cuando `tenantIds` es `undefined`). Los overrides de límite (`batchLimit`, `inconsistencyDetailLimit`) pasan por `resolveTestOnlyLimit`, que **lanza si `NODE_ENV !== "test"`** y valida rango — solo pueden **reducir** dentro de `[4,500]`/`[1,50]`. IDs inválidos o vacíos → error controlado antes de cualquier consulta (test 25 cubre vacío, duplicados y exceso de 1000).

## 22. Email en pruebas

`billing-cron-atomicity.test.ts` retira `RESEND_API_KEY` del proceso del archivo (líneas 44-45) → `sendEmail` falla en la rama "sin API key" **antes** de cualquier `fetch` al proveedor → cero emails reales. Restauración en `after()` ([:204-205]): si existía se restaura, si no, se elimina. La restauración ocurre en `after()` (hook de cierre); ante excepción de un test, el `finally` de cada test resetea hooks/fetch y el `after()` restaura las variables. No hay contaminación entre tests (cada uno resetea en `finally`; `after` limpia globalmente). Los EmailLog creados se borran en `after()` por tenant. El aislamiento por-archivo de `node --test` (cada archivo su propio proceso) es el mismo mecanismo del que ya depende `billing-webhook-idempotency.test.ts` para `globalThis.fetch`; no es un comportamiento no garantizado nuevo.

## 23. Seams

`CronTransactionStep` (8 pasos) gatillados por `runCronStep`, que **solo** ejecuta el hook si `process.env.NODE_ENV === "test"` ([:444-448]); hooks vacíos por defecto; no hay ruta HTTP para configurarlos; se dirigen por candidato vía `context.subscriptionId`/`tenantId`. Las pruebas los restauran en `finally` y en `after()` (`resetCronHook`). Sin sleeps. La barrera del test 8 se libera en `finally` (sin promesas colgadas). Una prueba no contamina a la siguiente (reset + fixtures por `RUN`). Confirmado.

## 24. Conteo de pruebas

- **204 pruebas puras** = 187 previas + 17 de `cron-decision.test.ts`.
- **26 casos** en `billing-cron-atomicity.test.ts` (conté los `test(...)`: 1–12, 14–20, 18b, 21–26 = 26; el "13" es una aserción **inline** dentro del test 12, no un `test()` separado).
- **326 pruebas totales** = **283 (línea base previa a la subfase) + 17 (puras cron) + 26 (integración cron)**.

El incremento sobre 283 es exactamente **43 = 17 + 26**, así que **sí coincide** — no hay inconsistencia. (El intermedio 319 de la FASE 2L reflejaba 19 pruebas de integración antes de que Codex añadiera 7 en 2M para llegar a 26; 283+17+19 = 319, 283+17+26 = 326.)

## 25. Compatibilidad

Suite completa **326/326** (0 fail/skip/todo) por el runner seguro. Siguen verdes: idempotencia, precedencia, cobertura, reactivación, Serializable, período compartido, términos pendientes, webhook ledger, auditoría, pruebas del guard/seguridad de base de pruebas, autenticación. La ruta cron conserva método/respuesta/códigos; la ruta super-admin y la UI (`movedToGracePeriod`/`movedToSuspended`) siguen funcionando (ambas propiedades preservadas en el resumen).

## 26. Ejecución

- `npx tsc --noEmit`: **PASS**.
- `npm run lint`: **PASS** (0 warnings/errores).
- `node --import tsx --test tests/unit/*.test.ts`: **204/204**.
- `npm test` (inseguro): **aborta antes de Prisma** por el guard (mismo destino `TEST_DATABASE_URL == DATABASE_URL`).
- `env DATABASE_URL= DIRECT_URL= npm test` (POSIX autorizado): **326/326 PASS**, 0 fail/skip/todo. No se modificó `.env`, `.env.test` ni el guard. No se reintentó ningún fallo lógico.

## 27. Limpieza

Conteos de la base de **pruebas** antes y después (idénticos): `tenants:6, users:17, subscriptions:6, payments:5, webhooks:0, auditLogs:164, notifications:42, emailLogs:26, pricingRules:7`. `cronResidue:0`, `webhookResidue:0`. Cero fixtures cron/billing, cero WebhookEvent residuales, cero usuarios de prueba, cero emails reales, cero llamadas reales a Mercado Pago. Variables (`RESEND_API_KEY`, `MERCADO_PAGO_*`, `CRON_SECRET`) restauradas por los tests; hooks reseteados; `.env` intacto; `.env.test` ignorado. `git diff --check` limpio (solo aviso informativo de fin de línea CRLF de Windows). El único `t.skip` del repo está en `super-admin-phase-a.test.ts` (archivo preexistente, **fuera** del alcance del commit); los archivos del cron no tienen `skip`.

## 28. Hallazgos

**N-01 · INFORMATIVO/BAJO · [billing.service.ts `applyOverdueLicenseRules` — `summary.errorDetails.push`]**
- Comportamiento: `errorDetails` no se acota al tope de 50 como `inconsistentDetails` y `externalEffects.errors`; crece hasta el límite del lote (≤500).
- Impacto: respuesta HTTP de hasta 500 objetos `{subscriptionId, tenantId, errorCode}` (unos KB), solo al cron autenticado o al super-admin; **sin PII**; **no** son "miles". Inconsistencia de estilo con los otros detalles acotados.
- Evidencia: [:908-915] vs. el tope aplicado en [:898-906, :621-625].
- Corrección mínima: acotar `errorDetails` con el mismo patrón (tope + flag `errorsTruncated`).
- Prueba requerida: un lote con >tope errores → detalles truncados con flag.
- ¿Bloquea commit? **No**. ¿Bloquea notificaciones? **No**. ¿Bloquea producción? **No**.

**N-02 · BAJO (aceptado) · [selección por buckets con cupo fijo, sin cursor/rotación]**
- Comportamiento: si una categoría tuviera >125 candidatos con **fallo permanente** que ordenan siempre primero, las filas posteriores de esa categoría no progresarían.
- Impacto: starvation solo bajo un modo de fallo permanente por-candidato, implausible en este flujo de updates simples; en la práctica, retraso acotado (los fallos reales son transitorios).
- Evidencia: `allocateCronBucketLimits`, `orderBy [frontera, id]`, ausencia de cursor.
- Corrección mínima (si algún día aparece un fallo permanente): cursor/rotación o exclusión temporal por reintentos.
- Prueba requerida: simular >cupo fallos permanentes y verificar progreso de filas posteriores.
- ¿Bloquea commit? **No**. ¿Bloquea notificaciones? **No**. ¿Bloquea producción? **No**.

**N-03 · BAJO (aceptado) · [cupos de bucket vacío no redistribuidos]**
- Comportamiento: un bucket vacío no cede su cupo; una corrida puede procesar <500 aunque otra categoría tenga backlog.
- Impacto: solo reduce throughput; cada categoría no vacía drena su backlog a 125/corrida. Sin starvation.
- Corrección mínima: redistribuir cupo sobrante entre buckets no vacíos (opcional).
- ¿Bloquea commit? **No**. ¿Bloquea producción? **No**.

**N-04 · BAJO (aceptado) · [CAS de tres fronteras — conflicto conservador]**
- Comportamiento: un cambio concurrente de un campo irrelevante para la decisión (p. ej. `trialEndsAt` de una ACTIVE) hace perder el CAS.
- Impacto: retraso de una corrida, fail-safe, auto-recuperable; ningún caller actual realiza ese cambio aislado.
- Corrección mínima: comparar solo la frontera que originó la transición (no recomendado: reduce la red de seguridad).
- ¿Bloquea commit? **No**. ¿Bloquea producción? **No**.

No hay hallazgos críticos, altos ni medios abiertos dentro del alcance.

## 29. Riesgos aceptados

- N-02/N-03/N-04 (arriba): operativos, bajos, ya divulgados por Codex (doc 04 §32-33).
- Efectos externos posteriores al commit **sin outbox ni idempotencia propia** (dedupeKey): reservado explícitamente para la **siguiente subfase** (notificaciones). Dos corridas separadas aún podrían repetir un aviso; mitigado (solo se notifican transiciones realmente aplicadas, tras el commit).
- Base de pruebas = mismo proyecto que la normal (excepción temporal ya registrada); debe separarse antes de producción.
- Índices especializados de selección no añadidos (schema prohibido en esta fase).

## 30. Lista para commit

Sin secretos en ningún archivo (verificado). Incluir únicamente:

**Implementación**
```
src/domains/billing/cron-decision.ts
src/domains/billing/billing.service.ts
src/app/api/cron/overdue-rules/route.ts
```
**Pruebas**
```
tests/unit/cron-decision.test.ts
tests/billing-cron-atomicity.test.ts
```
**Documentación**
```
docs/programa-mejora/04-cron-atomicidad/01-prompt-claude-implementacion-cron-cas-atomicidad.md
docs/programa-mejora/04-cron-atomicidad/02-respuesta-claude-implementacion-cron-cas-atomicidad.md
docs/programa-mejora/04-cron-atomicidad/03-prompt-codex-revision-correccion-cron-cas-atomicidad.md
docs/programa-mejora/04-cron-atomicidad/04-respuesta-codex-revision-correccion-cron-cas-atomicidad.md
docs/programa-mejora/04-cron-atomicidad/05-prompt-claude-revision-final-cron-cas-atomicidad.md
docs/programa-mejora/04-cron-atomicidad/06-respuesta-claude-revision-final-cron-cas-atomicidad.md
```
No incluir: `.env`, `.env.test`, schema, migraciones, package files, logs, temporales ni cambios ajenos.

## 31. Comandos `git add` (NO ejecutados)

```bash
git add src/domains/billing/cron-decision.ts
git add src/domains/billing/billing.service.ts
git add src/app/api/cron/overdue-rules/route.ts
git add tests/unit/cron-decision.test.ts
git add tests/billing-cron-atomicity.test.ts
git add docs/programa-mejora/04-cron-atomicidad/01-prompt-claude-implementacion-cron-cas-atomicidad.md
git add docs/programa-mejora/04-cron-atomicidad/02-respuesta-claude-implementacion-cron-cas-atomicidad.md
git add docs/programa-mejora/04-cron-atomicidad/03-prompt-codex-revision-correccion-cron-cas-atomicidad.md
git add docs/programa-mejora/04-cron-atomicidad/04-respuesta-codex-revision-correccion-cron-cas-atomicidad.md
git add docs/programa-mejora/04-cron-atomicidad/05-prompt-claude-revision-final-cron-cas-atomicidad.md
git add docs/programa-mejora/04-cron-atomicidad/06-respuesta-claude-revision-final-cron-cas-atomicidad.md
```
(Staging explícito; nunca `git add .`.)

## 32. Mensaje de commit propuesto

```text
feat(billing): make overdue cron atomic and concurrency-safe
```

## 33. Recomendación

**Aprobar** la subfase y convertirla en commit con la lista y el mensaje anteriores. La implementación es sólida: decisión pura fail-safe, selección por buckets sin starvation entre categorías, CAS de status + tres fronteras, atomicidad Subscription+Tenant+AuditLog (probada con fallo real de FK), efectos externos observables y no reversores, autenticación fail-closed con `timingSafeEqual`, y opciones de alcance/límite validadas y restringidas a test. Los cuatro riesgos bajos son operativos, aceptados y no bloqueantes; N-01 (acotar `errorDetails`) puede atenderse como pulido menor en la subfase de notificaciones o en un follow-up. Después del commit, iniciar por separado la subfase de idempotencia/outbox de notificaciones y emails.

## 34. Veredicto

**APROBADA CON RIESGOS MENORES.**

- Los 26 criterios de aprobación se cumplen; los 2M-01…2M-07 están corregidos; no hay hallazgos críticos/altos/medios abiertos dentro del alcance.
- No modifiqué código, pruebas, schema, migraciones ni configuración. No hice commit ni push. No inicié la subfase de notificaciones.
- Prompt guardado en [`05-prompt-claude-revision-final-cron-cas-atomicidad.md`](05-prompt-claude-revision-final-cron-cas-atomicidad.md).
