# FASE 2G — Correcciones transaccionales, identidad de evidencia y validación final (informe)

Fecha: 2026-07-27
Autor: Claude (correcciones)
Commit base: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`
Alcance: hallazgos F2F-01 a F2F-07 de la revisión final de Codex (doc 12). Sin cron.

## 1. Resumen ejecutivo

Se corrigieron los 7 hallazgos de la revisión final:

- Todas las decisiones de acceso (preapproval, Payment no aprobado y la transición a ACTIVE de un Payment aprobado) se calculan sobre una Subscription **releída dentro de la transacción**, y toda transición usa **compare-and-set (CAS)**. Una suspensión/cancelación administrativa concurrente prevalece.
- Toda la evidencia de cobertura exige la pareja exacta **tenantId + subscriptionId**, tanto en las consultas como en las funciones puras (una fila cruzada devuelve `false`).
- La reactivación administrativa es una única transacción **Serializable** que valida evidencia, actualiza Subscription/Tenant y crea el AuditLog juntos; un conflicto de serialización produce un error de negocio controlado.
- La metadata de estados desconocidos es completa (Payment y preapproval) y todas las etiquetas de estado del proveedor están **acotadas a 255 caracteres**.
- Se añadieron pruebas adversariales deterministas (carreras webhook↔administración, evidencia cruzada, fallo de auditoría, conflicto serializable, unknown largo) y se reforzaron las aserciones señaladas.
- La suite completa se ejecutó por el runner seguro (el bloqueo de F2F-07 fue una invocación sin vaciar las variables; la ejecución autorizada las vacía solo en el proceso).

Sin cambios de schema ni migración. Fase 1 intacta. Sin commit.

**Estado: CORREGIDO.**

## 2. Estado inicial de Git

```
HEAD 5e4be50 feat(billing): enforce idempotent atomic webhook effects
git status --short:
 M src/domains/billing/mercado-pago.service.ts
 M src/domains/platform/tenant-admin.service.ts
 M tests/billing-webhook-idempotency.test.ts
?? docs/programa-mejora/03-precedencia-cron/
?? src/domains/billing/precedence.ts
?? tests/unit/billing-precedence.test.ts
```

Confirmado: HEAD sigue en `5e4be50`, sin commit nuevo; `prisma/schema.prisma`, migraciones, `package.json` y `package-lock.json` sin cambios; el diff pertenece solo a precedencia, cobertura, reactivación y pruebas; la carpeta de docs de Fase 2 sin trackear. `git diff --check` sin errores (solo avisos LF→CRLF de Windows).

## 3. Confirmación de F2F-01 a F2F-07

Los siete se reprodujeron sobre el código previo y quedaron corregidos (detalle en §25).

## 4. Diseño transaccional

Se introdujo un contrato único para los tres flujos de webhook:

1. La consulta remota a Mercado Pago ocurre **fuera** de la transacción (solo localiza entidades).
2. Dentro de la transacción: releer Subscription por `id`; cargar Payments de cobertura por `tenantId+subscriptionId`; calcular cobertura de acceso / pago real / evidencia; calcular la decisión sobre el estado recién leído; reclamar la transición con CAS; sincronizar Tenant solo si el CAS ganó; crear AuditLog; finalizar el WebhookEvent; confirmar.
3. Seams deterministas (`AFTER_WEBHOOK_SUBSCRIPTION_READ`, `BEFORE_WEBHOOK_SUBSCRIPTION_CAS`) permiten inyectar una transacción concurrente entre la lectura y el CAS, sin sleeps.

## 5. CAS de Subscription

`claimSubscriptionTransition(tx, snapshot, data)` ejecuta un `updateMany` cuyo `where` incluye `id, tenantId, status, currentPeriodEnd, graceEndsAt, trialEndsAt` con los valores **exactos** leídos de PostgreSQL (sin reconstruir fechas). Si `count === 1` gana; si `count === 0` hubo un cambio concurrente y: no se toca Tenant, no se reintenta, no se revierte la acción administrativa, el ledger queda `IGNORED` con `ignoredReason="CONCURRENT_SUBSCRIPTION_CHANGE"` y se audita el intento. Una suspensión o cancelación concurrente nunca es reemplazada.

## 6. Payment APPROVED y separación económica

El orden económico de Fase 1 se conserva (claim atómico del marcador, cuarentena, período único, términos pendientes, ledger PROCESSED/DUPLICATE, rollback, reintento). La transición de **acceso** a ACTIVE ahora tiene su propio CAS: el marcador y el período del Payment se aplican siempre (registro económico); si el CAS de la Subscription pierde por un cambio concurrente, se conserva el efecto económico, no se toca el Tenant, y se registra `accessStatePreserved=true` + `ignoredAccessReason="CONCURRENT_SUBSCRIPTION_CHANGE"`. El ledger sigue `PROCESSED` (el dinero se procesó); el Payment nunca se marca `IGNORED`.

## 7. Preapproval

`updateSubscriptionFromPreapproval` reestructurado: una sola transacción relee Subscription, recarga cobertura exacta, calcula `decidePreapprovalOutcome` sobre la fila actual, y —salvo `IGNORE`— refresca la metadata técnica de Mercado Pago vía CAS para no pisar una modificación administrativa. `SET` con CAS ganado sincroniza Tenant (PROCESSED); `PRESERVE` y `IGNORE` no cambian acceso (IGNORED con su razón); CAS perdido → IGNORED `CONCURRENT_SUBSCRIPTION_CHANGE`. El fetch remoto permanece fuera de la transacción.

## 8. Payment no aprobado

La rama no-APPROVED relee la Subscription dentro de la transacción y decide sobre esa fila. `ENTER_GRACE` solo degrada vía CAS; si pierde la carrera (suspensión/cancelación/pago concurrente) preserva el acceso, no toca Tenant y registra `IGNORED CONCURRENT_SUBSCRIPTION_CHANGE`. Grace existente, terminal o cobertura vigente preservan según la lógica aprobada.

## 9. Identidad de evidencia

`PaymentCoverageRow` incorpora `tenantId` y `subscriptionId`; `isCurrentRealPaymentRow`, `isCurrentSimulatedAccessRow`, `hasCurrentRealPaymentCoverage` y `hasCurrentAppliedAccessEvidence` reciben una `CoverageIdentity` y descartan cualquier fila que no coincida en **ambos** campos. `loadCoverageRows`, `applyTenantStatusInTx` y `updateTenantStatusForSuperAdmin` consultan por `tenantId+subscriptionId`. No se confía en la unicidad de `Subscription.tenantId`.

## 10. Reactivación serializable

`updateTenantStatusForSuperAdmin` usa `prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })`. Dentro: lee la Subscription exacta, lee Payments por `tenantId+subscriptionId`, evalúa evidencia, actualiza Subscription y Tenant, y crea el AuditLog con el cliente transaccional. Un conflicto de serialización (Prisma `P2034`) se traduce a `SerializationConflictError` ("El estado cambió durante la operación. Intenta nuevamente."); no hay bucle de reintentos ni se ocultan otros errores. Prisma 5.22 soporta `Serializable` (verificado por tipos y ejecución).

## 11. Auditoría atómica

`registerAuditLog` se ejecuta **dentro** de la transacción de reactivación. Si falla, Tenant y Subscription se revierten: no queda acceso reactivado sin registro de quién lo hizo (probado con inyección de fallo + reintento).

## 12. Metadata y límites

`MAX_PROVIDER_STATUS_LENGTH = 255` con `truncateProviderStatus`; aplicado a `providerStatusLabel`, `rawStatusForStore`, el `rawStatus` de los normalizadores y la metadata `providerStatus`. La metadata de preapproval unknown incluye ahora `previousPaymentStatus:null`, `incomingPaymentStatus:"UNKNOWN"`, `persistedPaymentStatus:null` y `paymentExists` (refleja filas reales), además de los campos de Subscription/cobertura/identidad. `sanitizeWebhookMetadata` conserva string/number/boolean/null y descarta objetos, arrays y claves sensibles.

## 13. Seams de concurrencia

Se añadieron los pasos `AFTER_WEBHOOK_SUBSCRIPTION_READ`, `BEFORE_WEBHOOK_SUBSCRIPTION_CAS`, `AFTER_REACTIVATION_EVIDENCE_READ`, `BEFORE_REACTIVATION_AUDIT_LOG`. `runBillingStep` solo ejecuta el hook bajo `NODE_ENV === "test"`; en producción nunca corre. Se expone `__billingTestSeam` para que la reactivación (en `tenant-admin`) reutilice los mismos hooks. Los tests inyectan la transacción concurrente dentro del hook (determinista, sin sleeps) y resetean los hooks en `finally`.

## 14. Archivos modificados

- `src/domains/billing/precedence.ts` — MAX length/truncate, `providerStatusLabel` acotado, `PaymentCoverageRow` + `CoverageIdentity`, coberturas con identidad exacta, normalizadores truncados.
- `src/domains/billing/mercado-pago.service.ts` — seams nuevos + gate NODE_ENV + `__billingTestSeam`; `claimSubscriptionTransition`; preapproval, no-APPROVED y APPROVED transaccionales con CAS; `applyTenantStatusInTx` con identidad; `rawStatusForStore` truncado; metadata preapproval completa.
- `src/domains/platform/tenant-admin.service.ts` — reactivación Serializable, evidencia por identidad exacta dentro de la tx, AuditLog dentro de la tx, seams, `SerializationConflictError` (P2034).
- `tests/unit/billing-precedence.test.ts` — identidad en `row()`/coberturas; +11 casos (identidad cruzada, longitud, grace null, paused sobre CANCELLED).
- `tests/billing-webhook-idempotency.test.ts` — #30/#31/#40/#41/#42/#43 reforzados; +8 escenarios (#49–#56: carreras CAS, cruzado, fallo de auditoría, conflicto serializable, unknown largo, metadata preapproval).

## 15. Schema y migración

Sin cambios en `prisma/schema.prisma` ni migraciones (verificado con `git status prisma/`). Todas las razones son constantes TypeScript en metadata; se reutiliza `WebhookEventResult.IGNORED`. No fue necesario `BLOQUEADO`. No se modificó `audit.service.ts`: su contrato ya acepta el cliente transaccional (`registerAuditLog(input, tx)`).

## 16. Pruebas puras

`tests/unit/billing-precedence.test.ts`: 92 casos (81 previos + 11 nuevos). Nuevos: identidad exacta (pareja correcta cuenta; tenant/subscription cruzados no; SIMULATED/MP cruzados no); longitud (10.000 chars → exactamente el máximo; espacios recortados antes de truncar; normalizadores truncan; número/objeto/array → etiquetas cortas); grace null explícito; paused sobre CANCELLED.

## 17. Pruebas de integración

`tests/billing-webhook-idempotency.test.ts`: 56 escenarios. Nuevos #49–#56: (A) carrera preapproval SET vs suspensión → CAS pierde, SUSPENDED prevalece, IGNORED CONCURRENT; (B) carrera no-APPROVED vs cancelación → CANCELLED, sin Grace; (C) APPROVED vs suspensión concurrente → efecto económico preservado, acceso SUSPENDED, replay DUPLICATE; (D) Payment cruzado no cuenta para reactivación; (E) fallo de AuditLog de reactivación → rollback total, reintento limpio; (F) conflicto serializable ante evidencia concurrente + reintento rechaza; (G) unknown largo truncado, IGNORED sin 500; (H) metadata completa de preapproval unknown.

## 18. Cambios en escenarios anteriores

- **Puras**: `row()` y todas las llamadas de cobertura ahora pasan identidad (cambio de firma F2F-02); ningún caso perdió aserciones.
- **Integración**: #30/#31 (Grace) añaden Payment/Tenant/AuditLog/ledger/razón; #40 añade paidAt/períodos/marcador/términos pendientes/ledger/replay; #41/#42 añaden Subscription intacta y ausencia de auditoría de reactivación; #43 añade Subscription ACTIVE + una auditoría. No se debilitó ninguna aserción existente; no se añadió `skip`.

## 19. Procedimiento del guard

El guard **no** se modificó ni desactivó. Se confirmó que aborta antes de Prisma con la configuración normal: `[test-guard] Configuracion de pruebas insegura: TEST_DATABASE_URL apunta al mismo destino que DATABASE_URL (...). Usa una base de datos de pruebas distinta.` — exactamente el bloqueo que observó Codex (F2F-07). La ejecución autorizada vacía `DATABASE_URL` y `DIRECT_URL` **solo en el proceso del comando** (`env DATABASE_URL= DIRECT_URL= npm test`): el merge del runner ve DATABASE_URL en blanco, omite la comparación de mismo destino y fuerza el destino de pruebas desde `TEST_DATABASE_URL`. `.env` no se movió ni modificó; `.env.test` permanece ignorado.

## 20. Comandos ejecutados

```
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
npm test                         (prueba de aborto: guard detiene, esperado)
env DATABASE_URL= DIRECT_URL= npm test   (ejecución autorizada)
```

## 21. Resultados

- `npx tsc --noEmit`: sin errores.
- `npm run lint`: sin warnings ni errores.
- Pruebas puras: **187/187** (92 precedencia + 95 period/reconciliation).
- Suite completa: **278/278**, 0 fail, 0 skipped (incluye todas las carreras CAS y el conflicto serializable contra PostgreSQL real).
- Sin llamadas reales a Mercado Pago (mock de `globalThis.fetch`).

## 22. Limpieza

Sonda de solo lectura tras la suite: `{ we: 0, pay: 0, ten: 0, usr: 0 }` fixtures de billing residuales. El `after()` limpia por prefijo `RUN`, tenantIds y usuarios SUPER_ADMIN. `.env` intacto; `.env.test` ignorado y sin cambios.

## 23. Compatibilidad con Fase 1

Siguen pasando: idempotencia, claim atómico, replay, concurrencia (dos APPROVED), rollback (3 puntos), reintento, cuarentena, reconciliación, términos pendientes, períodos, missing dataId, ledger y preapproval atómico. El orden económico no se alteró salvo por el añadido del CAS de acceso y la preservación de acciones administrativas concurrentes.

## 24. Riesgos restantes

- Carreras y atomicidad del **cron** (Subfase 2) siguen pendientes; esta fase no las aborda.
- Aplicar y limpiar términos pendientes sobre una Subscription terminal es correcto técnicamente pero conlleva un riesgo comercial (devolución/acceso hasta fin de período) que sigue **fuera de alcance**.
- `paused` sin cobertura usa el fallback técnico `PENDING_PAYMENT`; la política comercial de pausa sigue sin definir.
- La política de `cancelled` entrante de preapproval conserva el comportamiento previo (fuera de alcance).
- La reparación operativa de `graceEndsAt = null` corresponde al cron.
- Antes de producción deben separarse los proyectos Supabase de producción y pruebas (obligación operativa; el guard ya lo exige).

## 25. Respuesta individual a F2F-01…F2F-07

- **F2F-01** (decisiones con estado obsoleto): CORREGIDO — preapproval y no-APPROVED releen dentro de la tx y usan CAS; pruebas #49, #50.
- **F2F-02** (evidencia sin identidad): CORREGIDO — `PaymentCoverageRow`+`CoverageIdentity`, todas las consultas por tenant+subscription; pruebas puras de identidad y #52.
- **F2F-03** (auditoría de reactivación no atómica): CORREGIDO — AuditLog dentro de la transacción Serializable; prueba #53.
- **F2F-04** (evidencia cambiante en READ COMMITTED): CORREGIDO — reactivación Serializable con conflicto controlado (P2034→SerializationConflictError); prueba #54.
- **F2F-05** (metadata unknown incompleta/no acotada): CORREGIDO — `MAX_PROVIDER_STATUS_LENGTH`, truncado, metadata preapproval completa; pruebas de longitud y #55/#56.
- **F2F-06** (cobertura de pruebas insuficiente): CORREGIDO — +11 puras y +8 integración adversariales; refuerzo de #30/#31/#40/#41–#43.
- **F2F-07** (destino de pruebas no aislado en la ejecución de Codex): RESUELTO en procedimiento — el guard aborta con la invocación normal (reproducido) y la suite corre por el runner seguro vaciando las variables solo en el proceso; guard intacto. La separación física de proyectos queda como obligación operativa previa a producción.

## 26. Recomendación sobre commit

No se hace commit en esta fase (según el prompt). Se recomienda una nueva revisión independiente de Codex sobre este estado; si aprueba, empaquetar la subfase (precedencia + cobertura + transaccionalidad) en el commit propuesto `feat(billing): enforce payment precedence and access coverage` con los archivos listados por Codex (doc 12, §23) y solo entonces iniciar la Subfase 2 del cron.

## 27. Estado

**CORREGIDO.**

Los siete hallazgos F2F quedaron resueltos dentro del alcance permitido: decisiones y coberturas releídas y reclamadas con CAS dentro de las transacciones, identidad exacta de evidencia, reactivación serializable con auditoría atómica y conflicto controlado, metadata unknown completa y acotada, y pruebas adversariales deterministas. tsc y lint limpios, 187 pruebas puras y 278 de la suite completa en verde por el runner seguro, fixtures limpios, schema/migraciones intactos y Fase 1 preservada. No se hizo commit ni se inició el cron.
