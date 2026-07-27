# FASE 2F - Revision final de precedencia, terminales y cobertura

Fecha: 2026-07-26  
Autor: Codex (revision independiente)  
Commit base: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`  
Alcance: revision de solo lectura de Fase 2C + correcciones Fase 2E. No se inicio el cron.

## 1. Resumen ejecutivo

La correccion mejora sustancialmente la logica nominal:

- Una `Subscription` que ya esta en `GRACE_PERIOD` conserva exactamente su frontera ante pagos no aprobados.
- `paused` sin cobertura ya no conserva acceso vencido.
- `APPROVED` aplica el efecto economico sin reactivar automaticamente `SUSPENDED` o `CANCELLED`.
- Los normalizadores ya no lanzan ante valores runtime no string.
- La prueba de reactivacion manual ya demuestra que el webhook no es quien reactiva.

Sin embargo, la subfase no puede aprobarse para commit:

1. Preapproval y la rama no-APPROVED toman decisiones con una `Subscription` leida antes de abrir la transaccion. Una suspension o cancelacion concurrente puede ser sobrescrita.
2. La reactivacion y la sincronizacion `ACTIVE` consultan Payments solo por `tenantId`. El schema permite que un Payment tenga el `tenantId` de un conjunto y el `subscriptionId` de otro; esa evidencia cruzada puede contar.
3. La auditoria de reactivacion se crea despues de confirmar la transaccion. Si falla, Tenant y Subscription quedan activos sin auditoria.
4. La transaccion de reactivacion no usa bloqueo de filas ni aislamiento que garantice que la evidencia no cambie entre lectura y escritura.
5. La metadata unknown de preapproval no contiene todos los campos obligatorios y las etiquetas string no estan acotadas.
6. Las 48 pruebas no cubren varias aserciones y carreras exigidas.
7. La suite no pudo ejecutarse: el guard detecto que `TEST_DATABASE_URL` y `DATABASE_URL` resuelven al mismo destino. No se reintento ni se forzo el guard.

**Veredicto: REQUIERE CORRECCIONES.**

## 2. Estado de Git

- `HEAD`: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`.
- No existe un commit nuevo.
- `git diff --check`: limpio.
- `prisma/schema.prisma`: sin cambios.
- `package-lock.json`: sin cambios.
- No existe una migracion nueva.
- Cambios rastreados:
  - `src/domains/billing/mercado-pago.service.ts`
  - `src/domains/platform/tenant-admin.service.ts`
  - `tests/billing-webhook-idempotency.test.ts`
- Archivos nuevos relevantes:
  - `src/domains/billing/precedence.ts`
  - `tests/unit/billing-precedence.test.ts`
  - Documentacion `docs/programa-mejora/03-precedencia-cron/01...12`.

El diff rastreado contiene 1170 inserciones y 135 eliminaciones. Los archivos nuevos no aparecen en `git diff --stat` hasta ser agregados.

## 3. Alcance del diff

El diff esta limitado a precedencia, cobertura, reactivacion manual, pruebas y documentacion de esta subfase. No hay cambios de schema, migraciones, lockfile, variables de entorno, guard, UI, cron ni integraciones externas.

No se modifico codigo durante esta revision.

## 4. Verificacion F2D-01 a F2D-08

| ID | Estado | Evidencia | Riesgo restante | Commit | Cron | Produccion |
|---|---|---|---|---|---|---|
| F2D-01 Grace reiniciable | CORREGIDO | `precedence.ts`, `decideSubscriptionActionForNonApproved`: `GRACE_PERIOD` retorna `EXISTING_GRACE_PRESERVED`. La rama PRESERVE no escribe Subscription ni Tenant. | Faltan aserciones completas en #30/#31, pero la implementacion nominal preserva la frontera. | No por otros hallazgos | No por otros hallazgos | No por otros hallazgos |
| F2D-02 divergencia Tenant/Subscription | NO CORREGIDO | El helper maneja todos los estados, pero preapproval decide con datos leidos antes de la transaccion (`mercado-pago.service.ts:366-408`) y escribe despues (`456-472`). Para ACTIVE revalida cobertura solo al actualizar Tenant; puede dejar Subscription ACTIVE y Tenant sin cambio. | Carrera y evidencia mal acotada. | Si | Si | Si |
| F2D-03 paused y terminales | CORREGIDO CON MATICES | La matriz pura protege terminales y `paused` sin cobertura produce PENDING_PAYMENT. | Una suspension/cancelacion concurrente puede ser sobrescrita por decisiones basadas en el snapshot previo. | Si | Si | Si |
| F2D-04 auto-reactivacion por APPROVED | CORREGIDO | La rama APPROVED relee Subscription dentro de la transaccion y preserva SUSPENDED/CANCELLED; ledger PROCESSED. | Aplicar y limpiar terminos pendientes sobre un terminal tiene riesgo comercial documentado. | No por este ID | No por este ID | No por este ID |
| F2D-05 normalizadores runtime | CORREGIDO CON MATICES | Ambos aceptan `unknown` y hacen type guard antes de `.trim()`. | `providerStatusLabel` no limita longitud de strings. | Si, por criterio explicito | Si | Si |
| F2D-06 reactivacion fuera de transaccion | NO CORREGIDO | Las lecturas se movieron dentro de `$transaction`, pero no hay lock/Serializable, se filtra solo por tenant y la auditoria ocurre despues de confirmar. | Evidencia cruzada/cambiante y reactivacion sin auditoria. | Si | Si | Si |
| F2D-07 metadata unknown | NO CORREGIDO | Payment contiene la matriz pedida. Preapproval omite `previousPaymentStatus`, `incomingPaymentStatus`, `persistedPaymentStatus` y `paymentExists`; strings sin cota. | Trazabilidad incompleta y crecimiento no acotado. | Si | Si | Si |
| F2D-08 pruebas incompletas | NO CORREGIDO | Hay 81 tests de precedencia y 48 escenarios de integracion, pero faltan carreras, identidad exacta, rollback de auditoria manual y aserciones obligatorias. La suite completa no pudo ejecutarse. | Falsa confianza ante caminos concurrentes. | Si | Si | Si |

## 5. Grace

Para pagos PENDING/REJECTED, la primera guarda de `decideSubscriptionActionForNonApproved` preserva terminales y la segunda preserva cualquier `GRACE_PERIOD`, independientemente de:

- Grace vigente.
- Grace vencida.
- `graceEndsAt = null`.
- PENDING entrante.
- REJECTED entrante.
- Replays con distintos Payments.

En la rama PRESERVE:

- `graceEndsAt` no cambia.
- Subscription sigue `GRACE_PERIOD`.
- Tenant no cambia.
- `currentPeriodEnd` no cambia.
- No se crea un nuevo periodo.
- Ledger queda `IGNORED`.
- `ignoredReason = EXISTING_GRACE_PRESERVED`.
- AuditLog recibe la misma razon.

La unica asignacion no-APPROVED de `graceEndsAt` esta en la entrada inicial a Grace (`mercado-pago.service.ts:939-948`). La guarda impide que se ejecute cuando la Subscription ya es Grace.

Deficiencia de pruebas: #29 valida Tenant, ledger y razon; #30 y #31 solo validan parcialmente Subscription/frontera. No verifican en cada variante periodos, Tenant, AuditLog, Payment y ledger.

## 6. Tenant/Subscription

Contrato nominal reconstruido:

| Subscription persistida | Tenant esperado | Implementacion nominal |
|---|---|---|
| ACTIVE | ACTIVE | Solo si encuentra pago real vigente |
| TRIAL | TRIAL | Solo si `trialEndsAt > now` |
| PENDING_PAYMENT | PENDING_PAYMENT | Escritura explicita |
| GRACE_PERIOD | GRACE_PERIOD | Escritura explicita |
| SUSPENDED | SUSPENDED | Escritura explicita |
| CANCELLED | CANCELLED | Escritura explicita |

Problemas:

1. `applyTenantStatusInTx` para ACTIVE consulta `Payment` con `where: { tenantId }`, sin `subscriptionId`.
2. El schema tiene FKs separadas para `Payment.tenantId` y `Payment.subscriptionId`; no existe una restriccion compuesta que obligue a que ambos pertenezcan a la misma pareja.
3. Preapproval calcula `realPaymentCovered` fuera de la transaccion. Si esa evidencia cambia, Subscription puede escribirse ACTIVE y el helper puede negarse a actualizar Tenant.
4. La decision de preapproval usa un estado local que puede quedar obsoleto frente a una suspension/cancelacion concurrente.

Si existe un ACTIVE defectuoso sin cobertura real, un evento con acceso vigente puede PRESERVE y dejar el defecto previo. Es fail-safe respecto a no retirar acceso por un webhook ambiguo, pero debe quedar auditado y repararse por un proceso posterior. No autoriza crear una nueva divergencia.

## 7. Preapproval

Matriz nominal. `R` = pago real vigente; `T` = trial vigente; `C` = acceso vigente.

| Estado local | authorized | pending | paused | cancelled | unknown |
|---|---|---|---|---|---|
| ACTIVE vigente | ACTIVE si R; si no PRESERVE por C | PRESERVE | PRESERVE | SET CANCELLED | IGNORE |
| ACTIVE vencido | ACTIVE si R; TRIAL si T; si no PENDING | TRIAL si T; si no PENDING | PENDING | SET CANCELLED | IGNORE |
| TRIAL vigente | PRESERVE | PRESERVE | PRESERVE | SET CANCELLED | IGNORE |
| TRIAL vencido | ACTIVE si R; TRIAL si T; si no PENDING | TRIAL si T; si no PENDING | PENDING | SET CANCELLED | IGNORE |
| GRACE vigente | PRESERVE | PRESERVE | PRESERVE | SET CANCELLED | IGNORE |
| GRACE vencida | ACTIVE si R; TRIAL si T; si no PENDING | TRIAL si T; si no PENDING | PENDING | SET CANCELLED | IGNORE |
| PENDING_PAYMENT | ACTIVE si R; TRIAL si T; si no PENDING | TRIAL si T; si no PENDING | PENDING | SET CANCELLED | IGNORE |
| SUSPENDED | PRESERVE | PRESERVE | PRESERVE | SET CANCELLED por politica previa | IGNORE |
| CANCELLED | PRESERVE | PRESERVE | PRESERVE | SET CANCELLED | IGNORE |

La politica nominal satisface authorized/pending/paused/unknown. `cancelled` conserva deliberadamente el comportamiento anterior y sigue fuera de alcance.

La matriz no es atomicamente segura: el estado y coberturas se leen antes de la transaccion. Una accion administrativa concurrente puede invalidar la decision antes de escribir.

## 8. Terminales

### Preapproval

El guard puro preserva SUSPENDED/CANCELLED ante authorized, pending y paused. Unknown ignora. Cancelled entrante mantiene la politica previa.

### Payment no aprobado

La funcion pura preserva SUSPENDED/CANCELLED. No obstante, `upsertMercadoPagoPayment` usa `subscription.status` capturado antes de la transaccion. Una suspension concurrente ocurrida despues de esa lectura puede ser reemplazada por GRACE.

### Payment aprobado

La rama relee la Subscription dentro de la transaccion (`findUniqueOrThrow`) antes de decidir `accessIsTerminal`; por ello la proteccion es mas fuerte y no llama al helper cuando el estado actual es terminal.

## 9. APPROVED economico

Sobre SUSPENDED/CANCELLED, la primera aplicacion:

- Persiste Payment APPROVED.
- Conserva/fija `paidAt`.
- Reclama `approvedEffectAppliedAt` una sola vez.
- Mantiene la cuarentena.
- Calcula un unico periodo.
- Actualiza `periodStart` y `periodEnd`.
- Aplica terminos pendientes y los limpia.
- Mantiene Subscription y Tenant terminales.
- Conserva `graceEndsAt`.
- Crea AuditLog con `accessStatePreserved`.
- Deja ledger `PROCESSED`.

Replay:

- El claim obtiene `count = 0`.
- No vuelve a extender.
- No limpia terminos otra vez.
- No toca acceso.
- Ledger `DUPLICATE`.

### Terminos pendientes sobre terminales

Clasificacion: **correcto con riesgo comercial**.

Es coherente tecnicamente con la politica indicada en Fase 2E: el pago se reconoce economicamente y aplica los terminos que estaban pendientes. El riesgo es que una Subscription CANCELLED consuma y limpie un cambio futuro de precio/unidades sin recuperar acceso. La politica de devolucion, cancelacion y acceso hasta fin de periodo sigue fuera de alcance; no se inventa una politica nueva en esta revision.

Falta una prueba especifica que combine estado terminal, terminos pendientes y replay.

## 10. Normalizacion runtime

Ambos normalizadores aceptan:

- null.
- undefined.
- numero.
- booleano.
- objeto.
- array.
- cadena vacia.
- mayusculas.
- espacios.

No ejecutan `.trim()` antes del type guard. Tipos inesperados producen unknown y las ramas de integracion terminan `IGNORED`.

No existe un cast previo que fuerce una operacion string en runtime: aunque las interfaces describen `status?: string`, el valor JSON llega directamente al normalizador.

Problema restante:

- `providerStatusLabel("x".repeat(N))` devuelve los N caracteres.
- `sanitizeWebhookMetadata` filtra tipos y claves sensibles, pero no limita longitud.
- `rawStatusForStore` tampoco limita strings.

Por tanto la afirmacion "etiqueta acotada" no es cierta para strings.

## 11. Reactivacion

Flujo actual dentro de `$transaction`:

1. Lee la Subscription por `tenantId`, pero solo selecciona `id`.
2. Si se solicita ACTIVE, lee Payments por `tenantId`.
3. Evalua evidencia.
4. Actualiza Tenant.
5. Actualiza Subscription.

Casos nominales:

- Sin evidencia: lanza y hace rollback.
- Pago real vigente: permite.
- Pago vencido: rechaza.
- Pago en cuarentena: rechaza.
- SIMULATED vigente: permite.

Defectos:

- La consulta no filtra `subscriptionId`.
- No bloquea Subscription/Payment ni usa aislamiento Serializable/Repeatable Read.
- En PostgreSQL `READ COMMITTED`, cada sentencia puede observar una version distinta. Estar dentro de una transaccion no demuestra que la evidencia no pueda cambiar.
- No hay prueba con Payment del mismo tenant pero otra subscription.

## 12. Auditoria de reactivacion

La auditoria esta en una segunda operacion:

1. `$transaction` confirma Tenant y Subscription.
2. Fuera de ella se llama `registerAuditLog`.

Si AuditLog falla:

- La reactivacion ya quedo confirmada.
- La llamada puede devolver error al usuario.
- Un reintento puede producir una auditoria distinta o duplicada.
- No existe registro atomico de quien reactivo.

Severidad: **ALTA** por trazabilidad de una accion administrativa de acceso. Bloquea esta subfase, commit y produccion.

No se acepta la afirmacion de que la reactivacion completa sea transaccional mientras la auditoria critica este separada.

## 13. Metadata unknown

### Payment nuevo/existente

Incluye:

- `ignoredReason`.
- `providerStatus`.
- `previousPaymentStatus`.
- `incomingPaymentStatus`.
- `persistedPaymentStatus`.
- `previousSubscriptionStatus`.
- `persistedSubscriptionStatus`.
- `accessCovered`.
- `realPaymentCovered`.
- `appliedAccessEvidence`.
- `paymentExists`.
- `subscriptionId`.
- `tenantId`.

Los valores son primitivos y pasan por `sanitizeWebhookMetadata`.

### Preapproval

Incluye estados y coberturas de Subscription, pero faltan los campos obligatorios:

- `previousPaymentStatus`.
- `incomingPaymentStatus`.
- `persistedPaymentStatus`.
- `paymentExists`.

La representacion de ausencia tampoco es uniforme: null/undefined produce `providerStatus: ""`, mientras `rawStatus` queda null. Los strings no estan limitados.

No se persisten payloads completos, firmas, tokens, tarjeta, objetos, arrays ni correos.

## 14. Rama no-APPROVED

Resultado nominal:

| Escenario | Payment final | Subscription/Tenant | Periodos / Grace | Ledger | Razon |
|---|---|---|---|---|---|
| 1. PENDING inicial sin cobertura | PENDING | GRACE/GRACE | Periodos iguales; nueva Grace inicial | PROCESSED | APPLIES |
| 2. PENDING con trial | PENDING | TRIAL/TRIAL | Sin cambios | IGNORED | CURRENT_ACCESS_COVERED |
| 3. REJECTED inicial sin cobertura | REJECTED | GRACE/GRACE | Periodos iguales; nueva Grace inicial | PROCESSED | APPLIES |
| 4. REJECTED con ACTIVE vigente | REJECTED | ACTIVE/ACTIVE | Sin cambios | IGNORED | CURRENT_ACCESS_COVERED |
| 5. REJECTED con SIMULATED vigente | REJECTED | Estado existente preservado | Sin cambios | IGNORED | CURRENT_ACCESS_COVERED |
| 6. REJECTED antiguo con pago real vigente | REJECTED | Estado existente preservado | Sin cambios | IGNORED | CURRENT_ACCESS_COVERED |
| 7. PENDING sobre APPROVED | APPROVED | Estado existente preservado | `paidAt`, periodos y marcador intactos | IGNORED | APPROVED_IS_TERMINAL |
| 8. REJECTED sobre APPROVED | APPROVED | Estado existente preservado | `paidAt`, periodos y marcador intactos | IGNORED | APPROVED_IS_TERMINAL |
| 9. REJECTED con Grace vigente | REJECTED | GRACE/GRACE | Grace exacta preservada | IGNORED | EXISTING_GRACE_PRESERVED |
| 10. REJECTED con Grace vencida | REJECTED | GRACE/GRACE | Grace vencida exacta | IGNORED | EXISTING_GRACE_PRESERVED |
| 11. REJECTED con Grace null | REJECTED | GRACE/GRACE | null preservado | IGNORED | EXISTING_GRACE_PRESERVED |
| 12. REJECTED con SUSPENDED | REJECTED | SUSPENDED/SUSPENDED | Sin cambios | IGNORED | TERMINAL_SUBSCRIPTION_STATUS |
| 13. REJECTED con CANCELLED | REJECTED | CANCELLED/CANCELLED | Sin cambios | IGNORED | TERMINAL_SUBSCRIPTION_STATUS |

Cada camino crea AuditLog. Ningun evento nominal no aprobado borra `paidAt`, retrocede APPROVED, reinicia Grace o reactiva terminales.

Riesgo alto: los escenarios 1, 3, 12 y 13 pueden cambiar si una accion administrativa concurrente ocurre entre la lectura externa y la transaccion.

## 15. Coberturas

La separacion conceptual es correcta:

- `hasCurrentAccessCoverage`: acceso operativo por estado y frontera.
- `hasCurrentRealPaymentCoverage`: ingreso real Mercado Pago, aprobado, aplicado, no cuarentena y vigente.
- `hasCurrentAppliedAccessEvidence`: pago real o SIMULATED aprobado vigente.

Callers:

- `loadCoverageRows` filtra correctamente `tenantId + subscriptionId`.
- Preapproval usa `loadCoverageRows`.
- Rama no-APPROVED usa `loadCoverageRows`.
- `applyTenantStatusInTx` filtra solo `tenantId`.
- `updateTenantStatusForSuperAdmin` filtra solo `tenantId`.

Aunque `Subscription.tenantId` es unico, el modelo Payment conserva dos FKs independientes y permite una pareja inconsistente. Los dos ultimos callers no cumplen identidad exacta.

La politica SIMULATED sigue siendo "cualquier SIMULATED APPROVED vigente y no marcado para reconciliacion". Es evidencia administrativa, no ingreso real. Riesgo aceptado previamente: el modelo no distingue cortesia, renovacion manual u otro subtipo.

## 16. Pruebas puras

Conteo estatico de `tests/unit/billing-precedence.test.ts`: **81 tests**.

Cubren:

- Normalizadores runtime.
- Mayusculas y espacios.
- Fronteras exactas.
- Grace vigente/vencida.
- Terminales principales.
- paused sin cobertura.
- PENDING_PAYMENT.
- Evidencia REJECTED/PENDING/SIMULATED.
- Precedencia de Payment.

Faltantes o incompletos:

- No existe un caso explicitamente denominado Grace null en la funcion de decision.
- Paused sobre CANCELLED no tiene caso puro.
- No prueba longitud maxima de strings.
- No prueba identidad tenant+subscription, porque las funciones puras no reciben identidad.
- No prueba carreras ni atomicidad.

No se encontraron `skip` ni `todo`.

Resultado de ejecucion: el comando no inicio los tests por `spawn EPERM` del sandbox. Se observaron 4 archivos fallidos, 0 tests ejecutados. No se reintento.

## 17. Pruebas de integracion

Conteo estatico: **48 escenarios**.

Fortalezas:

- #24 refuerza preservacion de Payment unknown existente.
- #28 ya demuestra webhook terminal + reactivacion manual posterior.
- #29-#31 cubren las tres variantes de Grace.
- #32 cubre SIMULATED.
- #33-#38 cubren pending/paused y parte de terminales.
- #39/#40 cubren APPROVED economico terminal.
- #41-#43 cubren evidencia manual nominal.
- #44-#47 cubren unknown no string y fetch unico.
- #48 inyecta fallo antes de AuditLog en unknown y comprueba rollback de `rawStatus`.

Deficiencias:

1. #29-#31 no verifican en todas las variantes Payment, periodos, Tenant, AuditLog, ledger y razones.
2. #40 no verifica periodo, `paidAt`, ledger, replay ni terminos pendientes.
3. #41/#42 no verifican simultaneamente Subscription y Tenant intactos.
4. #43 solo verifica Tenant; no verifica Subscription ni AuditLog.
5. No existe prueba de Payment cruzado: tenant correcto + subscription ajena.
6. No existe carrera entre webhook y suspension/cancelacion administrativa.
7. No existe carrera entre validacion de evidencia y cuarentena/expiracion/eliminacion.
8. No existe fallo de AuditLog de reactivacion manual.
9. #48 no verifica Tenant/Subscription, ausencia de AuditLog parcial ni reintento posterior.
10. No existe APPROVED terminal con terminos pendientes + replay.
11. La metadata unknown completa se prueba para Payment, no para preapproval.

La suite completa no se ejecuto: el guard aborto antes de abrir la base porque `TEST_DATABASE_URL` coincide canonicamente con `DATABASE_URL`.

## 18. Compatibilidad con Fase 1

Por inspeccion estatica permanecen:

- Claim atomico mediante `updateMany`.
- Marcador `approvedEffectAppliedAt`.
- Cuarentena y reconciliacion.
- Rollback dentro de la transaccion del webhook.
- Replay/DUPLICATE.
- Terminos pendientes.
- Periodo calculado por una fuente unica.
- Missing dataId.
- Ledger.
- Preapproval con cambios locales + auditoria + ledger en una transaccion.

No se introdujeron llamadas externas dentro de la transaccion.

Riesgos:

- Las decisiones de preapproval/no-APPROVED se calculan antes de la transaccion.
- No se pudo confirmar dinamicamente la suite de Fase 1 en esta revision.

## 19. Resultados

| Comando | Resultado |
|---|---|
| `git diff --check` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS, 0 warnings/errors |
| `node --import tsx --test tests/unit/*.test.ts` | FALLO AMBIENTAL: `spawn EPERM`; 0 tests iniciados |
| `DATABASE_URL= DIRECT_URL= npm test` equivalente PowerShell | BLOQUEADO POR GUARD: TEST_DATABASE_URL coincide con DATABASE_URL |

No se reintento ningun comando fallido.

No se puede validar independientemente la afirmacion previa de 176/176 puras y 259/259 completas sobre el estado actual.

## 20. Limpieza

Antes y despues:

```text
tenants=6
users=17
payments=5
pqrs=55
webhooks=0
mpPayments=0
billingFixtures.tenants=0
billingFixtures.users=0
billingFixtures.payments=0
billingFixtures.webhooks=0
```

Confirmaciones:

- Conteos sin cambios.
- Cero fixtures de billing.
- Cero WebhookEvent residuales.
- Cero usuarios de prueba residuales.
- Cero Payments Mercado Pago en la base consultada.
- No hubo llamadas a Mercado Pago.
- `.env.test` existe y esta ignorado.
- `.env` y `.env.test` no fueron modificados.

## 21. Hallazgos

### F2F-01 - ALTA - decisiones con estado obsoleto

- Archivo/simbolo: `mercado-pago.service.ts`, `updateSubscriptionFromPreapproval` y rama no-APPROVED de `upsertMercadoPagoPayment`.
- Comportamiento: leen Subscription antes de abrir la transaccion y deciden con ese estado.
- Impacto: una suspension/cancelacion concurrente puede ser reemplazada por ACTIVE, TRIAL, PENDING_PAYMENT o GRACE.
- Evidencia: lecturas en `366-408`; transaccion en `456`; rama no-APPROVED usa el objeto capturado en `905-948`.
- Correccion minima: releer Subscription y coberturas dentro de la transaccion y calcular la decision sobre esa fila actual; usar guard/CAS o bloqueo apropiado.
- Prueba requerida: carrera controlada entre webhook y suspension/cancelacion.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2F-02 - ALTA - evidencia sin identidad tenant+subscription

- Archivo/simbolo: `applyTenantStatusInTx`; `updateTenantStatusForSuperAdmin`.
- Comportamiento: ambas consultas usan solo `where: { tenantId }`.
- Impacto: un Payment con tenant objetivo y subscription ajena puede activar o reactivar.
- Evidencia: schema con FKs independientes; consultas en `mercado-pago.service.ts:1014-1024` y `tenant-admin.service.ts:229-239`.
- Correccion minima: filtrar `tenantId + subscriptionId` y pasar el id exacto al helper.
- Prueba requerida: Payment deliberadamente cruzado no cuenta.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2F-03 - ALTA - auditoria de reactivacion no atomica

- Archivo/simbolo: `tenant-admin.service.ts`, `updateTenantStatusForSuperAdmin`.
- Comportamiento: la transaccion confirma en `217-263`; AuditLog se crea en `272-283`.
- Impacto: acceso reactivado sin auditoria si la segunda operacion falla.
- Correccion minima: crear AuditLog dentro de la misma transaccion y devolver el Tenant despues.
- Prueba requerida: fallo de AuditLog revierte Tenant y Subscription; reintento limpio.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2F-04 - MEDIA - la evidencia puede cambiar dentro de READ COMMITTED

- Archivo/simbolo: `tenant-admin.service.ts`, transaccion de reactivacion.
- Comportamiento: no hay `FOR UPDATE`, CAS ni isolation level explicito.
- Impacto: otra transaccion puede modificar/borrar/cuarentenar evidencia entre lectura y escritura.
- Correccion minima: bloqueo de filas relevantes, CAS verificable o nivel Serializable con manejo controlado de conflicto.
- Prueba requerida: carrera entre reactivacion y cambio de evidencia.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2F-05 - MEDIA - metadata unknown incompleta y no acotada

- Archivo/simbolo: `precedence.ts`, `providerStatusLabel`; `updateSubscriptionFromPreapproval`.
- Comportamiento: strings sin limite; preapproval omite cuatro campos requeridos.
- Impacto: trazabilidad desigual y metadata/rawStatus potencialmente muy grandes.
- Correccion minima: limite de longitud comun y matriz completa con nulls explicitos.
- Prueba requerida: string largo; metadata completa de preapproval string/no-string.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2F-06 - MEDIA - cobertura de pruebas insuficiente

- Archivo/simbolo: `tests/billing-webhook-idempotency.test.ts`, #29-#48.
- Comportamiento: faltan carreras, identidad cruzada, auditoria manual atomica y varias aserciones economicas.
- Impacto: los defectos anteriores pueden quedar verdes.
- Correccion minima: agregar los casos listados en la seccion 17 sin reducir aserciones.
- Prueba requerida: los mismos casos.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2F-07 - ALTA QA - destino de pruebas no aislado

- Archivo/simbolo: `.env.test` / runner seguro, sin modificar.
- Comportamiento: el guard detecta que TEST_DATABASE_URL coincide con DATABASE_URL.
- Impacto: la suite completa no puede ejecutarse de forma autorizada.
- Evidencia: aborto explicito del guard antes de la suite.
- Correccion minima: configurar una base de pruebas realmente distinta o una conexion normal de comparacion que no enmascare el destino, siguiendo `docs/TESTING.md`; no desactivar el guard.
- Prueba requerida: una unica suite completa segura, seguida por conteos limpios.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI como evidencia de release.

## 22. Riesgos aceptados

- `cancelled` de preapproval conserva la politica anterior, fuera de alcance.
- Aplicar terminos pendientes sobre un terminal es una decision comercial pendiente, no una duplicacion tecnica.
- SIMULATED vigente cuenta como evidencia administrativa, no como ingreso.
- La jerarquia PENDING < REJECTED < APPROVED es una politica conservadora local.
- La reparacion de `graceEndsAt = null` corresponde al cron futuro; el webhook solo preserva.

## 23. Lista exacta para commit

No se recomienda crear el commit todavia.

Cuando los bloqueos esten corregidos y validados, el commit de esta subfase deberia contener exactamente:

Implementacion:

- `src/domains/billing/precedence.ts`
- `src/domains/billing/mercado-pago.service.ts`
- `src/domains/platform/tenant-admin.service.ts`

Pruebas:

- `tests/unit/billing-precedence.test.ts`
- `tests/billing-webhook-idempotency.test.ts`

Documentacion:

- `docs/programa-mejora/03-precedencia-cron/01-prompt-claude-diagnostico-precedencia-cron.md`
- `docs/programa-mejora/03-precedencia-cron/02-respuesta-claude-diagnostico-precedencia-cron.md`
- `docs/programa-mejora/03-precedencia-cron/03-prompt-codex-verificacion-precedencia-cron.md`
- `docs/programa-mejora/03-precedencia-cron/04-respuesta-codex-verificacion-precedencia-cron.md`
- `docs/programa-mejora/03-precedencia-cron/05-prompt-claude-implementacion-precedencia-cobertura.md`
- `docs/programa-mejora/03-precedencia-cron/06-respuesta-claude-implementacion-precedencia-cobertura.md`
- `docs/programa-mejora/03-precedencia-cron/07-prompt-codex-revision-precedencia-cobertura.md`
- `docs/programa-mejora/03-precedencia-cron/08-respuesta-codex-revision-precedencia-cobertura.md`
- `docs/programa-mejora/03-precedencia-cron/09-prompt-claude-correcciones-precedencia-cobertura.md`
- `docs/programa-mejora/03-precedencia-cron/10-respuesta-claude-correcciones-precedencia-cobertura.md`
- `docs/programa-mejora/03-precedencia-cron/11-prompt-codex-revision-final-precedencia-cobertura.md`
- `docs/programa-mejora/03-precedencia-cron/12-respuesta-codex-revision-final-precedencia-cobertura.md`

Excluir:

- `.env`
- `.env.test`
- schema/migraciones
- logs
- temporales
- cambios ajenos

## 24. Comandos `git add`

No ejecutar hasta corregir y aprobar:

```powershell
git add -- src/domains/billing/precedence.ts
git add -- src/domains/billing/mercado-pago.service.ts
git add -- src/domains/platform/tenant-admin.service.ts
git add -- tests/unit/billing-precedence.test.ts
git add -- tests/billing-webhook-idempotency.test.ts
git add -- docs/programa-mejora/03-precedencia-cron
```

## 25. Mensaje de commit

Propuesta posterior a la aprobacion:

```text
feat(billing): enforce payment precedence and access coverage
```

## 26. Recomendacion

No crear commit y no iniciar el cron.

Orden minimo recomendado:

1. Mover decisiones y relecturas de Subscription/coberturas al interior de las transacciones.
2. Acotar toda evidencia por `tenantId + subscriptionId`.
3. Hacer atomica la auditoria de reactivacion.
4. Definir bloqueo/CAS/isolation para evidencia concurrente.
5. Completar y acotar metadata unknown.
6. Agregar las pruebas adversariales faltantes.
7. Configurar un destino de pruebas realmente separado.
8. Ejecutar una sola validacion completa segura y comprobar limpieza.
9. Someter el nuevo estado a revision independiente.

## 27. Veredicto

**REQUIERE CORRECCIONES.**

La logica nominal de Grace, paused, normalizacion y APPROVED terminal mejoro y varias pruebas nuevas son valiosas. No obstante, permanecen hallazgos altos de concurrencia, identidad de evidencia y atomicidad de auditoria, ademas de un bloqueo real para ejecutar la suite segura. No se cumplen los criterios 1, 3, 4, 10, 11, 13, 20 y 23 de aprobacion.

El prompt completo y exacto fue guardado en:

`docs/programa-mejora/03-precedencia-cron/11-prompt-codex-revision-final-precedencia-cobertura.md`

Este informe fue guardado en:

`docs/programa-mejora/03-precedencia-cron/12-respuesta-codex-revision-final-precedencia-cobertura.md`

No se modifico codigo, no se hizo commit y no se inicio el cron.
