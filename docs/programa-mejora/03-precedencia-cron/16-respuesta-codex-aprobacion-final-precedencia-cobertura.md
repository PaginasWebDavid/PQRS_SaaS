# FASE 2H - Aprobacion final de precedencia, cobertura y transaccionalidad

Fecha: 2026-07-27  
Autor: Codex (revision independiente)  
Commit base: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`  
Alcance: revision de solo lectura de la subfase de precedencia y cobertura. No se inicio el cron.

## 1. Resumen ejecutivo

Las correcciones de Fase 2G son reales y mejoran de forma importante el estado anterior:

- Preapproval y Payment no aprobado releen Subscription dentro de la transaccion.
- Las transiciones de acceso usan compare-and-set.
- La cobertura exige identidad exacta `tenantId + subscriptionId`.
- La reactivacion manual usa aislamiento Serializable y auditoria atomica.
- P2034 se transforma en un error controlado.
- Estados unknown se truncan a 255 y la metadata de preapproval es completa.
- Los seams solo se ejecutan con `NODE_ENV === "test"`.
- Pasaron 187 pruebas puras y 278 pruebas completas sin skips.

Sin embargo, la subfase no puede aprobarse:

1. En Payment APPROVED, el mismo CAS intenta aplicar el estado de acceso, el periodo economico de Subscription y los terminos pendientes. Si una suspension concurrente hace perder el CAS, Payment queda aprobado y con periodo, pero Subscription no extiende su periodo ni aplica los terminos. El marcador queda aplicado y el replay es DUPLICATE, por lo que el efecto perdido no se repara.
2. En preapproval autorizado, la cobertura de Payment se lee antes del CAS bajo READ COMMITTED. Si esa evidencia cambia sin modificar Subscription, el CAS puede activar Subscription y el helper puede negarse a activar Tenant, creando divergencia.
3. Cuando un CAS pierde, la metadata `persistedSubscriptionStatus` conserva el snapshot anterior, no el estado administrativo que realmente gano.
4. Los escenarios adversariales no detectan los defectos anteriores. #51 solo comprueba el periodo de Payment.
5. El snippet PowerShell con `""` no conserva la variable vacia en este entorno; fue necesario usar un valor compuesto solo por espacio, que el guard considera blank y que existe en el entorno del proceso.

**Veredicto: REQUIERE CORRECCIONES.**

## 2. Estado de Git

- `HEAD`: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`.
- No existe un commit nuevo.
- `git diff --check`: limpio.
- Sin cambios en:
  - `prisma/schema.prisma`.
  - `prisma/migrations/`.
  - `package.json`.
  - `package-lock.json`.
  - `.env`.
  - `.env.test`.
- No hay cambios de cron, notificaciones, email, UI, metricas ni politica definitiva de cancelacion.

Cambios rastreados:

- `src/domains/billing/mercado-pago.service.ts`.
- `src/domains/platform/tenant-admin.service.ts`.
- `tests/billing-webhook-idempotency.test.ts`.

Archivos nuevos:

- `src/domains/billing/precedence.ts`.
- `tests/unit/billing-precedence.test.ts`.
- Documentacion de `docs/programa-mejora/03-precedencia-cron/`.

## 3. Alcance del diff

El diff rastreado contiene 1750 inserciones y 216 eliminaciones. Los archivos sin rastrear no aparecen en el stat.

El alcance esta limitado a:

- Precedencia.
- Cobertura.
- Webhook de Mercado Pago.
- Reactivacion administrativa.
- Pruebas.
- Documentacion.

No se modifico implementacion durante esta revision.

## 4. Verificacion F2F-01 a F2F-07

| ID | Estado | Evidencia | Riesgo restante | Commit | Cron | Produccion |
|---|---|---|---|---|---|---|
| F2F-01 decisiones con estado obsoleto | CORREGIDO CON MATICES | Preapproval y no-APPROVED releen Subscription dentro de tx y usan CAS. | Cobertura de Payment puede cambiar bajo READ COMMITTED sin alterar el snapshot de Subscription. | Si | Si | Si |
| F2F-02 identidad exacta | CORREGIDO | Filas, funciones y queries usan tenant+subscription; pruebas puras y #52. | No se detecto caller con identidad incompleta. | No por este ID | No por este ID | No por este ID |
| F2F-03 auditoria de reactivacion | CORREGIDO | `registerAuditLog(..., tx)` antes de confirmar; #53 demuestra rollback y reintento. | Ninguno alto dentro de este flujo. | No por este ID | No por este ID | No por este ID |
| F2F-04 evidencia cambiante en READ COMMITTED | CORREGIDO CON MATICES | Reactivacion usa Serializable y #54 produce P2034 real. | Preapproval y no-APPROVED siguen en aislamiento por defecto y dependen de filas Payment mutables. | Si | Si | Si |
| F2F-05 metadata incomplete/no acotada | CORREGIDO CON MATICES | Unknown webhook usa limite 255 y preapproval incluye la matriz completa. | Metadata de CAS perdido informa estado persistido obsoleto; creacion de preapproval guarda `preapproval.status` sin el helper acotado. | Si | Si | Si |
| F2F-06 cobertura adversarial | NO CORREGIDO | Existen 92 puras y 56 escenarios, pero #51 no valida Subscription economics y faltan carreras de evidencia en preapproval. | Los defectos altos permanecen verdes. | Si | Si | Si |
| F2F-07 procedimiento seguro | CORREGIDO CON MATICES | El guard aborta la ruta insegura y la suite pasa usando variables blank solo en el proceso. | El snippet literal con `""` no funciona en este PowerShell porque elimina la variable y permite fallback a `.env`. | No para codigo; corregir documentacion | No por si solo | Separar proyectos antes de produccion |

## 5. Inventario transaccional

| Flujo | Lecturas fuera | Lecturas dentro | Escrituras dentro | CAS | Auditoria / ledger | Aislamiento | Externo dentro | Riesgo obsoleto |
|---|---|---|---|---|---|---|---|---|
| Payment APPROVED | Fetch MP y localizacion Subscription | Payment, Subscription actual | Payment, marcador, periodo Payment, Subscription, Tenant | Payment claim + Subscription CAS | Ambos dentro | Default PostgreSQL | No | Alto: CAS combina economia y acceso |
| Payment no aprobado | Fetch MP, localizacion, graceDays | Payment, Subscription, cobertura exacta | Payment; Grace/Tenant si CAS gana | Subscription CAS al entrar Grace | Ambos dentro | Default | No | Cobertura Payment puede cambiar sin tocar Subscription |
| Payment desconocido | Fetch MP, Subscription, Payment existente y cobertura | No relectura economica | rawStatus existente, AuditLog, ledger | No, no cambia acceso | Ambos dentro | Default | No | Metadata puede ser un snapshot previo; acceso seguro |
| Preapproval conocido | Fetch MP y localizacion | Subscription y cobertura exacta | Metadata tecnica; estado/Tenant si CAS gana | Subscription CAS | Ambos dentro | Default | No | Evidencia Payment puede cambiar antes del helper |
| Preapproval desconocido | Fetch MP y localizacion | Subscription y cobertura exacta | AuditLog y ledger | No cambia acceso | Ambos dentro | Default | No | Bajo |
| Reactivacion manual | Ninguna evidencia | Subscription, Payments exactos | Subscription, Tenant, AuditLog | No; Serializable | Auditoria dentro, no ledger | Serializable | No | Conflicto P2034 controlado |

Las consultas remotas a Mercado Pago ocurren fuera de las transacciones.

## 6. CAS

`claimSubscriptionTransition` usa `updateMany` con:

- `id`.
- `tenantId`.
- `status`.
- `currentPeriodEnd`.
- `graceEndsAt`.
- `trialEndsAt`.

Los valores proceden de la fila releida en PostgreSQL. Las fechas no se reconstruyen y los nulls se pasan como null.

Confirmaciones:

- `updateMany.count === 1` es la unica fuente de exito.
- `count === 0` no actualiza Tenant.
- No existe reintento automatico.
- Se usa `CONCURRENT_SUBSCRIPTION_CHANGE`.
- Una modificacion concurrente de cualquiera de los seis campos prevalece.

Problema: el helper no distingue un CAS economico de un CAS de acceso. En APPROVED, un solo `count` gobierna:

- Status.
- `currentPeriodStart`.
- `currentPeriodEnd`.
- `graceEndsAt`.
- Terminos efectivos.
- Limpieza de terminos pendientes.

Perder el CAS de acceso tambien pierde el efecto economico de Subscription.

## 7. Payment APPROVED

Orden actual:

1. Upsert de Payment.
2. Claim de `approvedEffectAppliedAt`.
3. Relectura de Subscription.
4. Calculo de periodo y terminos.
5. Actualizacion del periodo de Payment.
6. CAS conjunto de economia + acceso de Subscription.
7. Tenant solo si CAS gana y el snapshot no era terminal.
8. AuditLog.
9. Ledger.

Garantias preservadas:

- Payment queda APPROVED.
- `paidAt` se conserva/fija.
- El marcador se reclama una vez.
- Cuarentena sigue separada.
- Replay del mismo Payment queda DUPLICATE.
- Fallo de auditoria o ledger revierte toda la transaccion.
- No hay llamada externa dentro.

Defecto ante CAS perdido:

- Payment queda APPROVED.
- Marcador queda aplicado.
- Payment recibe `periodStart/periodEnd`.
- Subscription conserva el status administrativo, correctamente.
- Tenant no cambia, correctamente.
- **Subscription no recibe `currentPeriodStart/currentPeriodEnd`.**
- **Subscription no aplica ni limpia terminos pendientes.**
- Replay queda DUPLICATE y no repara lo perdido.

Esto rompe la invariancia aprobada en Fase 1 de periodo compartido Payment/Subscription y puede dejar una licencia pagada con `currentPeriodEnd` vencido.

Atomicidad: todo sigue en una transaccion, pero el resultado atomico es semanticamente incompleto cuando el CAS retorna cero.

## 8. Payment no aprobado

Dentro de la transaccion:

- Relee Payment.
- Aplica precedencia de fila.
- Relee Subscription.
- Carga cobertura exacta.
- Decide.
- ENTER_GRACE usa CAS.
- Tenant solo cambia si CAS gana.
- AuditLog y ledger quedan dentro.

Carreras:

- Suspension/cancelacion que cambia Subscription: CAS pierde y prevalece.
- APPROVED concurrente que cambia periodo/status: CAS pierde.
- Cortesia de los servicios actuales cambia Subscription y crea Payment en una transaccion: CAS detecta status/periodo.
- Mutacion aislada de evidencia Payment sin cambio de Subscription: el CAS no la detecta.

Terminales, Grace existente, APPROVED y `paidAt` se preservan nominalmente.

## 9. Preapproval

La llamada remota ocurre fuera. Dentro:

- Relee Subscription.
- Carga cobertura exacta.
- Calcula la decision.
- IGNORE no cambia Subscription.
- PRESERVE refresca metadata via CAS, sin cambiar acceso.
- SET usa el mismo CAS para metadata y acceso.
- Tenant solo cambia si SET y CAS gana.
- AuditLog y ledger son atomicos.

Terminales se preservan salvo la politica anterior de `cancelled`, fuera de alcance.

Riesgo de cobertura:

1. Authorized observa un Payment real vigente.
2. Otra transaccion pone ese Payment en cuarentena o invalida su periodo, sin modificar Subscription.
3. El CAS de Subscription puede ganar porque su snapshot no cambio.
4. Subscription queda ACTIVE.
5. `applyTenantStatusInTx` recarga cobertura, detecta que ya no existe y retorna sin actualizar Tenant.

Resultado: Subscription ACTIVE y Tenant en su estado anterior.

CAS perdido:

- Ledger queda IGNORED.
- Tenant no cambia.
- No hay retry.
- La razon concurrente es correcta.
- `persistedSubscriptionStatus` se calcula desde `current.status`, no desde una relectura posterior, y puede ser falso.

## 10. Identidad de cobertura

`PaymentCoverageRow` contiene:

- `tenantId`.
- `subscriptionId`.
- Provider/status/periodo/marcador/cuarentena.

`CoverageIdentity` exige ambos IDs. Las funciones `isCurrentRealPaymentRow`, `isCurrentSimulatedAccessRow`, `hasCurrentRealPaymentCoverage` y `hasCurrentAppliedAccessEvidence` comparan la pareja completa.

Queries:

- `loadCoverageRows`: filtra ambos.
- `applyTenantStatusInTx`: carga ambos.
- Reactivacion manual: filtra ambos.

Una fila cruzada MP o SIMULATED no cuenta. No se confia en la unicidad de `Subscription.tenantId`.

F2F-02 queda corregido.

## 11. Reactivacion Serializable

`updateTenantStatusForSuperAdmin` usa:

```text
Prisma.TransactionIsolationLevel.Serializable
```

Compatible con Prisma 5.22 por typecheck y ejecucion.

Dentro de una confirmacion:

1. Lee Subscription exacta.
2. Lee Payments por tenant+subscription.
3. Evalua evidencia.
4. Ejecuta seam de test.
5. Actualiza Tenant.
6. Actualiza Subscription.
7. Ejecuta seam de auditoria.
8. Crea AuditLog con el cliente transaccional.

P2034:

- Solo se transforma `PrismaClientKnownRequestError` con codigo P2034.
- Otros errores se relanzan.
- No hay bucle automatico.
- El mensaje pide reintentar y no afirma exito.
- El conflicto revierte cambios parciales.

#54 usa dos transacciones reales: la segunda cambia Payment y Subscription despues de la lectura; PostgreSQL produce el conflicto que el servicio transforma. No se fabrica un objeto P2034.

## 12. Auditoria atomica

En reactivacion:

- `registerAuditLog` recibe `tx`.
- Fallo antes del AuditLog revierte Tenant y Subscription.
- No queda AuditLog parcial.
- Reintento funciona.
- Queda una auditoria exitosa.

#53 lo demuestra.

No se modifico `audit.service.ts`; su contrato ya permitia cliente transaccional.

Las auditorias del webhook permanecen dentro de sus transacciones. No se detecto otra auditoria no atomica introducida por esta subfase.

## 13. Metadata

Fortalezas:

- `MAX_PROVIDER_STATUS_LENGTH = 255`.
- Trim antes del truncado.
- Tipos no string producen etiquetas cortas.
- Objetos/arrays no se serializan.
- Unknown Payment y preapproval usan valores primitivos.
- Preapproval unknown contiene todos los campos pedidos y nulls explicitos.
- No se guardan payloads, firmas, tokens, tarjetas ni correos.

Defectos:

1. En CAS perdido, `persistedSubscriptionStatus` usa el snapshot anterior. En #49 puede registrar PENDING_PAYMENT aunque lo persistido sea SUSPENDED; en #50 puede registrar PENDING_PAYMENT aunque sea CANCELLED; en #51 puede registrar TRIAL aunque sea SUSPENDED.
2. En `createMercadoPagoSubscriptionForTenant`, `mercadoPagoStatus` y la metadata de auditoria usan `preapproval.status` directamente, sin `providerStatusLabel`. Es una respuesta externa y no comparte el limite de 255.

## 14. Seams

`runBillingStep` ejecuta hooks solo si:

```text
process.env.NODE_ENV === "test"
```

Confirmaciones:

- No existe entrada HTTP para configurarlos.
- Produccion no ejecuta el callback aunque alguien importe el setter.
- Tests resetean hooks en `finally`.
- Hook global se limpia tambien en `after`.
- No hay sleeps.
- No hay promesas pendientes deliberadas.
- Los tests del archivo son secuenciales y el hook dispara una sola vez.
- La suite corre archivos en procesos separados.

Riesgo menor: el estado es global al modulo, pero el uso actual esta acotado y restablecido.

## 15. Pruebas puras

Conteo: **92 tests de precedencia**.

Cubren:

- Identidad correcta y cruzada.
- MP y SIMULATED cruzados.
- String de 10.000 caracteres.
- Trim antes de truncar.
- Tipos runtime.
- Grace null.
- Paused sobre CANCELLED.
- Fronteras exactas.
- Matriz de precedencia.

Ejecucion total de unitarias: **187/187**, 0 fail, 0 skipped.

No se encontraron expectativas que oculten el defecto de APPROVED concurrente porque esa separacion transaccional no es una funcion pura.

## 16. Pruebas de integracion

Conteo: **56 escenarios**.

Revision #49-#56:

- #49: CAS pierde frente a suspension y conserva SUSPENDED. Falta verificar AuditLog y estado persistido reportado.
- #50: CANCELLED prevalece. Falta verificar Payment final y AuditLog.
- #51: demuestra Payment APPROVED, marcador, periodo Payment, acceso SUSPENDED y replay DUPLICATE. **No verifica periodo ni terminos de Subscription.**
- #52: crea una fila realmente inconsistente permitida por schema y la reactivacion la rechaza.
- #53: rollback de Tenant/Subscription/AuditLog y reintento.
- #54: conflicto Serializable real. Falta afirmar explicitamente Subscription y ausencia de AuditLog parcial, aunque el reintento prueba la nueva evidencia.
- #55: Payment y preapproval unknown largos quedan acotados.
- #56: metadata completa con nulls y `paymentExists`.

Escenarios reforzados:

- #30/#31: Grace, Tenant, Payment, ledger y auditoria mejorados.
- #40: terminal con terminos pendientes y replay.
- #41/#42: estados intactos y sin auditoria exitosa.
- #43: Tenant/Subscription activos y una auditoria.
- #48: rollback de rawStatus y ledger FAILED; aun no verifica reintento.

Huecos bloqueantes:

- Subscription economics cuando APPROVED pierde CAS.
- Terminos pendientes cuando APPROVED pierde CAS.
- Metadata real tras CAS perdido.
- Cambio concurrente de cobertura Payment durante preapproval.
- Aplicacion de identidad cruzada a un preapproval autorizado en integracion.

## 17. Compatibilidad con Fase 1

Por codigo y ejecucion siguen pasando:

- Claim economico.
- Idempotencia.
- Replay.
- Concurrencia del mismo Payment.
- Rollback en tres puntos.
- Reintento.
- Cuarentena.
- Reconciliacion.
- Terminos pendientes nominales.
- Periodos nominales.
- Missing dataId.
- Ledger.
- Preapproval atomico.

Regresion semantica nueva:

- La invariancia Payment.period == Subscription.currentPeriod se rompe especificamente cuando APPROVED gana el claim economico pero pierde el CAS combinado.
- El marcador impide que el replay repare Subscription.

## 18. Ejecucion

Resultados:

| Comando | Resultado |
|---|---|
| `npm test` con entorno normal | Aborto esperado del guard antes de Prisma |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS, 0 warnings |
| `node --import tsx --test tests/unit/*.test.ts` | 187/187 PASS |
| `npm test` mediante runner seguro | 278/278 PASS, 0 skipped |

Particularidad PowerShell:

- `$env:DATABASE_URL = ""` elimina la variable en esta version.
- Al desaparecer, `mergeEnvSources` recupera DATABASE_URL desde `.env` y el guard aborta.
- Para la ejecucion autorizada se uso `" "`: el sistema conserva la variable, gana por precedencia y `isBlank` la trata como vacia.
- Variables restauradas en `finally`.
- No se movio ni modifico `.env`.
- No se cambio el guard.

## 19. Limpieza

Conteos antes y despues:

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

- Conteos identicos.
- Cero fixtures.
- Cero WebhookEvent residuales.
- Cero usuarios de prueba residuales.
- Cero Payments Mercado Pago en el entorno consultado.
- `.env.test` existe y esta ignorado.
- `.env` y `.env.test` intactos.
- `globalThis.fetch` fue mockeado; cero llamadas reales a Mercado Pago.

## 20. Hallazgos

### F2H-01 - ALTA - CAS de acceso pierde efecto economico de Subscription

- Archivo/simbolo: `mercado-pago.service.ts`, rama APPROVED y `claimSubscriptionTransition`.
- Comportamiento: periodo, terminos y status se escriben en un solo CAS.
- Impacto: Payment pagado y marcado, pero Subscription sin periodo/terminos; replay DUPLICATE.
- Evidencia: Payment se actualiza antes del CAS (`874-879`); Subscription economics solo dentro del CAS (`885-908`); #51 no afirma Subscription economics.
- Correccion minima: separar la aplicacion economica de Subscription de la decision de acceso. El cambio administrativo debe impedir ACTIVE, no impedir periodo/terminos.
- Prueba requerida: suspension concurrente con pending terms; Payment y Subscription comparten periodo, terminos se aplican una vez, acceso sigue SUSPENDED, replay DUPLICATE.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2H-02 - ALTA - preapproval puede divergir Subscription/Tenant si cambia evidencia

- Archivo/simbolo: `updateSubscriptionFromPreapproval`; `applyTenantStatusInTx`.
- Comportamiento: cobertura se lee, CAS activa Subscription, helper recarga cobertura y puede retornar sin tocar Tenant.
- Impacto: Subscription ACTIVE y Tenant PENDING/SUSPENDED.
- Evidencia: cobertura `459-469`; CAS `531-538`; segunda validacion con retorno silencioso `1141-1146`.
- Correccion minima: hacer estable la evidencia durante decision+escritura o convertir la segunda validacion fallida en rollback/resultado controlado antes de confirmar ACTIVE.
- Prueba requerida: authorized con evidencia que entra en cuarentena entre lectura y CAS.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2H-03 - MEDIA - metadata concurrente informa estado persistido incorrecto

- Archivo/simbolo: metadata de preapproval, APPROVED y no-APPROVED.
- Comportamiento: CAS perdido usa `current.status`.
- Impacto: AuditLog/ledger pueden afirmar un estado distinto al que gano la carrera.
- Evidencia: `persistedSubscriptionStatus` en lineas `555`, `930`, `1098`.
- Correccion minima: releer estado despues de `count=0` solo para trazabilidad, sin reintentar ni escribir.
- Prueba requerida: #49/#50/#51 deben afirmar el estado persistido real.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI por auditoria incorrecta.

### F2H-04 - MEDIA - estado de preapproval de checkout no esta acotado

- Archivo/simbolo: `createMercadoPagoSubscriptionForTenant`.
- Comportamiento: persiste/audita `preapproval.status` directamente.
- Impacto: limite 255 no es uniforme para todas las respuestas externas.
- Evidencia: `mercado-pago.service.ts:272` y `285`.
- Correccion minima: aplicar `providerStatusLabel` antes de persistir/auditar.
- Prueba requerida: respuesta de creacion con status largo/no-string.
- Bloquea commit: SI por criterio de limite uniforme.
- Bloquea cron: No por si solo.
- Bloquea produccion: SI.

### F2H-05 - MEDIA - pruebas concurrentes incompletas

- Archivo/simbolo: `tests/billing-webhook-idempotency.test.ts`, #49-#56.
- Comportamiento: no verifican Subscription economics, metadata real ni cobertura cambiante.
- Impacto: 278 tests pasan con dos hallazgos altos.
- Correccion minima: agregar/reforzar los casos de F2H-01 a F2H-03.
- Prueba requerida: las descritas arriba.
- Bloquea commit: SI.
- Bloquea cron: SI.
- Bloquea produccion: SI.

### F2H-06 - BAJA - snippet PowerShell no conserva variables vacias

- Archivo/simbolo: procedimiento documentado, no codigo.
- Comportamiento: asignar `""` elimina la variable; el runner usa fallback `.env`.
- Impacto: el comando autorizado documentado aborta en este entorno.
- Evidencia: `Test-Path Env:DATABASE_URL` queda false despues de asignar `""`.
- Correccion minima: documentar un blank preservable (`" "`) o una invocacion Windows equivalente, sin desactivar el guard.
- Prueba requerida: guard inseguro aborta y runner autorizado pasa.
- Bloquea commit: NO si el informe conserva el comando correcto.
- Bloquea cron: NO.
- Bloquea produccion: separacion fisica sigue obligatoria.

## 21. Riesgos aceptados

- Politica de preapproval `cancelled` fuera de alcance.
- Aplicar terminos sobre terminales tiene riesgo comercial ya documentado.
- SIMULATED vigente es evidencia administrativa, no ingreso.
- `paused` sin cobertura usa PENDING_PAYMENT.
- Reparacion de `graceEndsAt = null` corresponde al cron.
- El proyecto mockdata compartido esta autorizado solo antes de produccion.

Los hallazgos F2H-01 y F2H-02 no son riesgos aceptables.

## 22. Lista exacta para commit

No se recomienda commit en el estado actual.

Despues de corregir y aprobar:

Implementacion:

```text
src/domains/billing/precedence.ts
src/domains/billing/mercado-pago.service.ts
src/domains/platform/tenant-admin.service.ts
```

Pruebas:

```text
tests/unit/billing-precedence.test.ts
tests/billing-webhook-idempotency.test.ts
```

Documentacion:

```text
docs/programa-mejora/03-precedencia-cron/*.md
```

La carpeta contiene solo documentacion de esta fase y no contiene secretos.

Excluir:

- `.env`.
- `.env.test`.
- Schema.
- Migraciones.
- Package files.
- Temporales.
- Logs.
- Cambios ajenos.

## 23. Comandos `git add`

No ejecutar hasta una aprobacion posterior:

```powershell
git add -- src/domains/billing/precedence.ts
git add -- src/domains/billing/mercado-pago.service.ts
git add -- src/domains/platform/tenant-admin.service.ts
git add -- tests/unit/billing-precedence.test.ts
git add -- tests/billing-webhook-idempotency.test.ts
git add -- docs/programa-mejora/03-precedencia-cron
```

## 24. Mensaje de commit

Propuesta posterior a aprobacion:

```text
feat(billing): enforce payment precedence and access coverage
```

## 25. Recomendacion

No hacer commit y no iniciar el cron.

Orden minimo:

1. Separar efecto economico de Subscription y CAS de acceso en APPROVED.
2. Garantizar que un cambio de evidencia no pueda dejar ACTIVE solo en Subscription.
3. Releer estado real para metadata cuando un CAS pierde.
4. Acotar el status de la respuesta de creacion de preapproval.
5. Agregar las pruebas concurrentes faltantes.
6. Ejecutar typecheck, lint, puras y suite completa una sola vez.
7. Verificar limpieza.
8. Realizar otra revision independiente.

## 26. Veredicto

**REQUIERE CORRECCIONES.**

Se corrigieron identidad exacta, auditoria atomica, reactivacion Serializable, P2034, limites de unknown y los principales CAS de acceso. Typecheck, lint, 187 pruebas puras y 278 pruebas completas pasan sin residuos.

La aprobacion se bloquea porque un APPROVED concurrente puede perder el periodo y los terminos de Subscription de forma irrecuperable, y porque preapproval puede dejar Tenant y Subscription divergentes si cambia la evidencia. Existen hallazgos altos abiertos dentro del alcance, por lo que no se cumplen los criterios 1, 2, 5, 10, 12, 13 y 22.

El prompt exacto fue guardado en:

`docs/programa-mejora/03-precedencia-cron/15-prompt-codex-aprobacion-final-precedencia-cobertura.md`

Este informe fue guardado en:

`docs/programa-mejora/03-precedencia-cron/16-respuesta-codex-aprobacion-final-precedencia-cobertura.md`

No se modifico codigo, no se hizo commit y no se inicio el cron.
