# FASE 2H — APROBACIÓN FINAL DE PRECEDENCIA, COBERTURA Y TRANSACCIONALIDAD

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/15-prompt-codex-aprobacion-final-precedencia-cobertura.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/16-respuesta-codex-aprobacion-final-precedencia-cobertura.md`

4. Guarda allí el informe final completo.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, pruebas, schema, migraciones, configuración ni variables de entorno.

---

Actúa como revisor técnico final especializado en Prisma, PostgreSQL, aislamiento transaccional, compare-and-set, facturación recurrente, máquinas de estados y pruebas concurrentes deterministas.

Claude afirma haber corregido F2F-01 a F2F-07. Debes revisar adversarialmente el estado completo de la Subfase de precedencia y cobertura y determinar si puede aprobarse y convertirse en commit.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/12-respuesta-codex-revision-final-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/13-prompt-claude-correcciones-transaccionales-identidad.md`
* `docs/programa-mejora/03-precedencia-cron/14-respuesta-claude-correcciones-transaccionales-identidad.md`
* `docs/programa-mejora/03-precedencia-cron/08-respuesta-codex-revision-precedencia-cobertura.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

La fuente de verdad es el código, el diff y las pruebas actuales.

## Restricciones

Esta es una revisión de solo lectura.

No debes:

* Modificar implementación.
* Modificar pruebas.
* Modificar schema.
* Crear o aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Modificar `.env`.
* Modificar `.env.test`.
* Modificar el guard.
* Mostrar secretos.
* Llamar a Mercado Pago real.
* Ejecutar build.
* Levantar el servidor.
* Hacer commit.
* Hacer push.
* Iniciar el cron.

Puedes:

* Ejecutar `git status`.
* Ejecutar `git diff`.
* Ejecutar `git diff --check`.
* Ejecutar typecheck y lint.
* Ejecutar pruebas puras.
* Ejecutar la suite completa mediante el procedimiento seguro autorizado.
* Realizar consultas de conteos seguras antes y después.

No apliques migraciones.

## Primera acción

1. Guarda este prompt.
2. Ejecuta:

```text
git status --short
git log -1 --oneline
git diff --check
git diff --stat
git diff --name-status
```

3. Confirma:

* HEAD continúa en `5e4be50`.
* No existe un commit nuevo.
* `prisma/schema.prisma` no cambió.
* No existe una migración nueva.
* `package.json` y `package-lock.json` no cambiaron.
* El diff está limitado a:

  * precedencia;
  * cobertura;
  * webhook;
  * reactivación;
  * pruebas;
  * documentación.
* No hay cambios de cron, notificaciones, email, UI, métricas o cancelación definitiva.

4. Inspecciona completamente:

* `src/domains/billing/precedence.ts`
* `src/domains/billing/mercado-pago.service.ts`
* `src/domains/platform/tenant-admin.service.ts`
* `src/domains/platform/audit.service.ts`
* `tests/unit/billing-precedence.test.ts`
* `tests/billing-webhook-idempotency.test.ts`

# 1. Verificación de F2F-01 a F2F-07

Entrega una tabla:

* ID.
* Estado:

  * CORREGIDO.
  * CORREGIDO CON MATICES.
  * NO CORREGIDO.
  * REGRESIÓN.
* Evidencia.
* Riesgo restante.
* ¿Bloquea commit?
* ¿Bloquea cron?
* ¿Bloquea producción?

Incluye:

* F2F-01: decisiones con estado obsoleto.
* F2F-02: evidencia sin identidad exacta.
* F2F-03: auditoría de reactivación no atómica.
* F2F-04: evidencia cambiante en `READ COMMITTED`.
* F2F-05: metadata unknown incompleta/no acotada.
* F2F-06: cobertura adversarial insuficiente.
* F2F-07: procedimiento seguro de ejecución.

# 2. Inventario de transacciones

Construye una tabla para:

* Payment APPROVED.
* Payment no aprobado.
* Payment desconocido.
* Preapproval conocido.
* Preapproval desconocido.
* Reactivación manual.

Para cada flujo indica:

* Lecturas fuera de la transacción.
* Lecturas dentro de la transacción.
* Escrituras dentro de la transacción.
* CAS utilizado.
* Auditoría.
* Ledger.
* Nivel de aislamiento.
* Llamadas externas.
* Riesgo de estado obsoleto.

Confirma que las consultas remotas a Mercado Pago ocurran fuera de las transacciones.

# 3. CAS de Subscription

Revisa `claimSubscriptionTransition`.

Confirma que el `where` usa valores exactos releídos de PostgreSQL:

* `id`.
* `tenantId`.
* `status`.
* `currentPeriodEnd`.
* `graceEndsAt`.
* `trialEndsAt`.

Verifica:

* Manejo correcto de valores null.
* Que no se reconstruyan fechas.
* Que `updateMany.count` sea la fuente real de éxito.
* Que `count = 0` no actualice Tenant.
* Que `count = 0` no repita automáticamente.
* Que se registre `CONCURRENT_SUBSCRIPTION_CHANGE`.
* Que una acción administrativa concurrente prevalezca.

Busca cualquier transición de Subscription dentro de estos webhooks que todavía use:

* `update` incondicional;
* un snapshot previo;
* un helper que ignore el CAS.

# 4. Payment APPROVED

Reconstruye el orden completo:

1. Upsert/actualización de Payment.
2. Reclamación del marcador.
3. Cálculo de período.
4. Actualización económica.
5. Aplicación de términos pendientes.
6. Relectura de Subscription.
7. Decisión de acceso.
8. CAS de acceso.
9. Tenant.
10. Auditoría.
11. Ledger.

Confirma que:

* El efecto económico sigue siendo idempotente.
* El CAS de acceso no permite perder el efecto económico.
* Una suspensión/cancelación concurrente prevalece.
* Si el CAS pierde:

  * Payment queda aprobado;
  * marcador queda aplicado;
  * período se extiende una vez;
  * Tenant no cambia;
  * Subscription conserva el estado administrativo actual;
  * metadata explica la decisión.
* Replay posterior queda `DUPLICATE`.
* No se aplican términos pendientes dos veces.

## Atomicidad

Determina si el efecto económico y la decisión de acceso permanecen en una única transacción.

Verifica qué ocurre si falla:

* el CAS;
* la auditoría;
* el ledger;
* la aplicación de términos pendientes.

# 5. Payment no aprobado

Confirma que dentro de la transacción:

* se relee Subscription;
* se relee Payment;
* se carga cobertura exacta;
* se decide precedencia;
* se actualiza metadata económica/no económica permitida;
* `ENTER_GRACE` usa CAS;
* Tenant solo cambia si el CAS gana;
* AuditLog y ledger están dentro.

Reconstruye carreras contra:

* suspensión manual;
* cancelación manual;
* Payment APPROVED concurrente;
* cortesía concurrente.

Confirma que:

* terminales prevalecen;
* Grace no se reinicia;
* cobertura vigente no se degrada;
* APPROVED no retrocede;
* `paidAt` no se borra.

# 6. Preapproval

Confirma que:

* la llamada remota ocurre fuera de la transacción;
* la decisión se calcula dentro con Subscription releída;
* cobertura se recarga por identidad exacta;
* `SET` usa CAS;
* `PRESERVE` no cambia acceso;
* `IGNORE` no cambia acceso;
* CAS perdido deja `IGNORED`;
* Tenant solo cambia cuando el CAS gana;
* auditoría y ledger son atómicos.

Revisa especialmente la actualización de metadata técnica del preapproval:

* Qué campos cambia.
* Si usa CAS.
* Si puede pisar una acción administrativa.
* Qué ocurre en `PRESERVE`.
* Qué ocurre en `IGNORE`.
* Qué ocurre cuando el CAS pierde.

Confirma que ninguna ruta de preapproval modifica terminales de forma automática, excepto la política anterior de `cancelled` explícitamente fuera de alcance.

# 7. Identidad exacta de cobertura

Revisa:

* `PaymentCoverageRow`.
* `CoverageIdentity`.
* `isCurrentRealPaymentRow`.
* `isCurrentSimulatedAccessRow`.
* `hasCurrentRealPaymentCoverage`.
* `hasCurrentAppliedAccessEvidence`.
* `loadCoverageRows`.
* `applyTenantStatusInTx`.
* `updateTenantStatusForSuperAdmin`.

Confirma que:

* cada fila contiene `tenantId` y `subscriptionId`;
* cada función compara ambos;
* cada consulta filtra ambos;
* una fila cruzada no cuenta;
* un SIMULATED cruzado no cuenta;
* un Mercado Pago cruzado no cuenta;
* ningún caller pase una identidad incorrecta;
* no se confíe solo en la unicidad de `Subscription.tenantId`.

# 8. Reactivación Serializable

Revisa la transacción de `updateTenantStatusForSuperAdmin`.

Confirma:

* uso real de `Prisma.TransactionIsolationLevel.Serializable`;
* compatibilidad con Prisma 5.22;
* lectura de Subscription exacta;
* lectura de Payments por identidad exacta;
* evaluación de evidencia dentro;
* actualización de Subscription;
* actualización de Tenant;
* AuditLog dentro;
* una sola confirmación.

## P2034

Confirma:

* identificación correcta del error.
* Solo se transforma P2034.
* Otros errores conservan su tipo/comportamiento.
* No existe bucle automático.
* El error controlado no afirma que la operación ocurrió.
* Un conflicto no deja cambios parciales.

## Seams

Verifica que la prueba de conflicto realmente provoque un conflicto de serialización PostgreSQL y no solo lance artificialmente P2034.

# 9. Auditoría atómica

Confirma que en reactivación:

* `registerAuditLog` recibe el cliente transaccional.
* Un fallo revierte Tenant.
* Un fallo revierte Subscription.
* No queda AuditLog parcial.
* El reintento funciona.
* Solo existe una auditoría exitosa.

Busca otras acciones modificadas en esta subfase cuya auditoría continúe fuera de la transacción.

Clasifica si alguna auditoría no atómica restante pertenece al alcance actual.

# 10. Metadata y límites

Revisa:

* `MAX_PROVIDER_STATUS_LENGTH`.
* `truncateProviderStatus`.
* `providerStatusLabel`.
* `rawStatusForStore`.
* normalizadores.
* metadata de Payment.
* metadata de preapproval.

Confirma:

* límite exacto de 255.
* trim antes del truncado.
* tipos no string producen etiquetas cortas.
* arrays no se serializan.
* objetos no se serializan.
* rawStatus y metadata usan el mismo límite.
* no se almacenan payloads, firmas, tokens, tarjetas o correos.

## Preapproval unknown

Confirma presencia explícita de:

* `ignoredReason`.
* `providerStatus`.
* `previousPaymentStatus`.
* `incomingPaymentStatus`.
* `persistedPaymentStatus`.
* `previousSubscriptionStatus`.
* `persistedSubscriptionStatus`.
* `accessCovered`.
* `realPaymentCovered`.
* `appliedAccessEvidence`.
* `paymentExists`.
* `subscriptionId`.
* `tenantId`.

Confirma uso coherente de nulls.

# 11. Seams de pruebas

Inspecciona:

* `runBillingStep`.
* `__billingTestSeam`.
* todos los nuevos pasos.

Confirma:

* solo se ejecutan bajo `NODE_ENV === "test"`;
* producción no puede activarlos mediante input externo;
* no se exporta una ruta HTTP para configurarlos;
* se resetean entre tests;
* no quedan hooks globales después de errores;
* no usan sleeps;
* no crean promesas sin resolver;
* no cambian comportamiento normal.

Busca cualquier posibilidad de que:

* una prueba contamine la siguiente;
* dos pruebas concurrentes compartan el mismo hook;
* un seam ejecute código de prueba en producción.

# 12. Pruebas puras

Lee completamente los 92 tests.

Confirma:

* identidad correcta.
* identidad cruzada.
* SIMULATED cruzado.
* Mercado Pago cruzado.
* longitud de 10.000 caracteres.
* trim y truncado.
* tipos runtime.
* Grace null.
* paused sobre CANCELLED.
* fronteras exactas.
* matriz de precedencia.

Identifica casos faltantes o expectativas que dupliquen la implementación sin validar comportamiento observable.

# 13. Pruebas de integración

Lee completamente los 56 escenarios.

Revisa especialmente #49–#56.

## #49 Preapproval vs suspensión

Confirma:

* la operación se pausa después de leer;
* la suspensión ocurre en otra transacción;
* el CAS devuelve cero;
* Subscription y Tenant siguen SUSPENDED;
* ledger IGNORED;
* razón concurrente;
* auditoría explicativa.

## #50 No-APPROVED vs cancelación

Confirma:

* CANCELLED prevalece;
* no entra a Grace;
* no reinicia fronteras;
* Payment se conserva coherentemente;
* ledger y auditoría correctos.

## #51 APPROVED vs suspensión

Confirma:

* efecto económico aplicado;
* marcador;
* período único;
* acceso SUSPENDED;
* Tenant SUSPENDED;
* metadata;
* replay DUPLICATE.

## #52 Evidencia cruzada

Confirma que se construye realmente una fila inconsistente permitida por el schema:

* tenant objetivo;
* subscription ajena.

Confirma que no permite reactivar.

## #53 Fallo de auditoría

Confirma rollback real de:

* Tenant.
* Subscription.
* AuditLog.

Confirma reintento y una sola auditoría.

## #54 Serializable

Confirma:

* dos transacciones reales;
* la evidencia cambia después de la lectura;
* PostgreSQL/Prisma produce P2034 real;
* no es un mock del error;
* cero cambios parciales;
* intento posterior evalúa el nuevo estado.

## #55 Unknown largo

Confirma truncado en:

* rawStatus.
* metadata.
* Payment.
* preapproval, si aplica.

## #56 Metadata preapproval

Confirma todos los campos y nulls.

## Escenarios reforzados

Comprueba las nuevas aserciones de:

* #30.
* #31.
* #40.
* #41.
* #42.
* #43.
* #48.

No aceptes solo el conteo de pruebas.

# 14. Compatibilidad con Fase 1

Confirma por código y ejecución:

* Claim económico.
* Idempotencia.
* Replay.
* Concurrencia.
* Rollback en tres puntos.
* Reintento.
* Cuarentena.
* Reconciliación.
* Términos pendientes.
* Períodos.
* Missing dataId.
* Ledger.
* Preapproval atómico.

Revisa si los CAS nuevos:

* cambian el resultado de escenarios anteriores;
* introducen un camino sin auditoría;
* convierten un evento económico procesado en ignored incorrectamente;
* generan dobles períodos.

# 15. Ejecución segura

El proyecto actual está autorizado como entorno de mockdata mientras no exista producción.

Esto no sustituye la obligación futura de separar proyectos.

## Verificación del guard

Primero ejecuta la ruta insegura esperada y confirma que aborta antes de Prisma.

No cambies el guard.

## Ejecución autorizada

En PowerShell, vacía las variables solo durante la ejecución:

```powershell
$hadDatabaseUrl = Test-Path Env:DATABASE_URL
$hadDirectUrl = Test-Path Env:DIRECT_URL
$previousDatabaseUrl = $env:DATABASE_URL
$previousDirectUrl = $env:DIRECT_URL

$env:DATABASE_URL = ""
$env:DIRECT_URL = ""

npm test

if ($hadDatabaseUrl) {
  $env:DATABASE_URL = $previousDatabaseUrl
} else {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

if ($hadDirectUrl) {
  $env:DIRECT_URL = $previousDirectUrl
} else {
  Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
}
```

En shell POSIX:

```bash
env DATABASE_URL= DIRECT_URL= npm test
```

No muevas `.env`.

No modifiques `.env.test`.

No desactives comparaciones.

## Comandos

Ejecuta:

```text
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
npm test
```

El `npm test` completo debe usar el aislamiento correcto.

No reintentes automáticamente un fallo lógico.

# 16. Limpieza

Antes y después confirma:

* conteos básicos;
* cero pagos reales Mercado Pago;
* cero fixtures;
* cero WebhookEvent residuales;
* cero usuarios de prueba residuales;
* `.env` intacto;
* `.env.test` ignorado;
* cero llamadas reales al proveedor.

# 17. Alcance del commit

Si apruebas, entrega la lista exacta.

## Implementación

```text
src/domains/billing/precedence.ts
src/domains/billing/mercado-pago.service.ts
src/domains/platform/tenant-admin.service.ts
```

## Pruebas

```text
tests/unit/billing-precedence.test.ts
tests/billing-webhook-idempotency.test.ts
```

## Documentación

Todos los documentos `.md` de:

```text
docs/programa-mejora/03-precedencia-cron/
```

Confirma que la carpeta contiene únicamente documentación de esta fase y no secretos.

## Exclusiones

No incluir:

* `.env`.
* `.env.test`.
* schema.
* migraciones.
* package-lock.
* temporales.
* logs.
* cambios ajenos.

Entrega comandos `git add` explícitos, pero no los ejecutes.

# 18. Mensaje de commit

Si apruebas, utiliza como propuesta:

```text
feat(billing): enforce payment precedence and access coverage
```

# Hallazgos

Para cada hallazgo nuevo incluye:

* ID.
* Severidad.
* Archivo/símbolo.
* Comportamiento.
* Impacto.
* Evidencia.
* Corrección mínima.
* Prueba requerida.
* ¿Bloquea commit?
* ¿Bloquea cron?
* ¿Bloquea producción?

# Criterios de aprobación

La subfase solo se aprueba si:

1. F2F-01 a F2F-07 están corregidos.
2. Las decisiones se toman dentro de la transacción.
3. Todos los cambios de acceso usan CAS.
4. Acciones administrativas concurrentes prevalecen.
5. Payment APPROVED conserva su efecto económico.
6. Evidencia exige identidad exacta.
7. Reactivación es Serializable.
8. Auditoría de reactivación es atómica.
9. P2034 se maneja de forma controlada.
10. Metadata es completa y acotada.
11. Seams son seguros y exclusivos de test.
12. Pruebas adversariales demuestran las carreras.
13. Fase 1 sigue intacta.
14. No cambia schema.
15. No existe migración.
16. Typecheck pasa.
17. Lint pasa.
18. Pruebas puras pasan.
19. Suite completa pasa.
20. Cero skip.
21. Fixtures limpios.
22. No hay hallazgos críticos o altos abiertos dentro del alcance.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Verificación F2F-01 a F2F-07.
5. Inventario transaccional.
6. CAS.
7. Payment APPROVED.
8. Payment no aprobado.
9. Preapproval.
10. Identidad de cobertura.
11. Reactivación Serializable.
12. Auditoría atómica.
13. Metadata.
14. Seams.
15. Pruebas puras.
16. Pruebas de integración.
17. Compatibilidad con Fase 1.
18. Ejecución.
19. Limpieza.
20. Hallazgos.
21. Riesgos aceptados.
22. Lista exacta para commit.
23. Comandos `git add`.
24. Mensaje de commit.
25. Recomendación.
26. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/03-precedencia-cron/16-respuesta-codex-aprobacion-final-precedencia-cobertura.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/03-precedencia-cron/15-prompt-codex-aprobacion-final-precedencia-cobertura.md`

3. No modifiques código.

4. No hagas commit.

5. No inicies el cron.

6. Detente después del informe.
