# FASE 2I — CORRECCIÓN FINAL DEL EFECTO ECONÓMICO Y ESTABILIDAD DE COBERTURA

## Documentación automática

Antes de analizar o modificar código:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/17-prompt-codex-correccion-efecto-economico-cobertura.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/18-respuesta-codex-correccion-efecto-economico-cobertura.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques documentos anteriores.

---

Actúa como ingeniero principal responsable de implementar las correcciones finales de precedencia, cobertura y transaccionalidad.

En esta fase eres **implementador**, no revisor.

Tu implementación será revisada posteriormente por Claude de forma independiente. No apruebes tu propio trabajo y no hagas commit.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/14-respuesta-claude-correcciones-transaccionales-identidad.md`
* `docs/programa-mejora/03-precedencia-cron/15-prompt-codex-aprobacion-final-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/16-respuesta-codex-aprobacion-final-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/12-respuesta-codex-revision-final-precedencia-cobertura.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

La fuente de verdad es el código y el diff actual.

## Objetivos únicos

Corregir:

1. F2H-01: el CAS de acceso de un Payment APPROVED puede impedir que Subscription reciba el período y los términos económicos.
2. F2H-02: preapproval puede activar Subscription y dejar Tenant en otro estado si cambia la evidencia de Payment.
3. F2H-03: cuando un CAS pierde, la metadata registra el snapshot anterior en vez del estado que realmente ganó.
4. F2H-04: el status externo devuelto al crear un preapproval no está acotado.
5. F2H-05: faltan pruebas capaces de detectar los defectos anteriores.
6. F2H-06: documentar y usar correctamente el procedimiento seguro de PowerShell para ejecutar la suite.

## Resultado esperado

Al finalizar:

* El efecto económico de un Payment APPROVED siempre actualiza coherentemente Payment y Subscription una sola vez.
* Una suspensión o cancelación concurrente puede impedir la activación del acceso, pero nunca impedir el período económico.
* Los términos pendientes se aplican exactamente una vez.
* Preapproval nunca deja Subscription y Tenant divergentes.
* La evidencia usada para activar permanece estable durante toda la decisión.
* Un CAS perdido informa el estado realmente persistido.
* Todo status externo queda limitado a 255 caracteres.
* Las pruebas demuestran las carreras reales.
* Fase 1 permanece intacta.
* No se modifica schema.
* No se crea migración.
* No se hace commit.

## Fuera de alcance

No implementes:

* Cron.
* Compare-and-set del cron.
* Notificaciones del cron.
* Cambios de email.
* Política definitiva de cancelación.
* Reparación de `graceEndsAt = null`.
* `Notification.dedupeKey`.
* Nuevos campos Prisma.
* Nuevos enums Prisma.
* Migraciones.
* `Subscription.version`.
* Timestamps del proveedor.
* Métricas.
* UI.
* Colas.
* Locks distribuidos.
* Infraestructura externa.

## Archivos permitidos

Puedes modificar únicamente:

* `src/domains/billing/precedence.ts`
* `src/domains/billing/mercado-pago.service.ts`
* `src/domains/platform/tenant-admin.service.ts`, solo si una corrección o prueba de compatibilidad lo exige
* `tests/unit/billing-precedence.test.ts`
* `tests/billing-webhook-idempotency.test.ts`
* Los documentos automáticos 17 y 18

No modifiques:

* `prisma/schema.prisma`
* `prisma/migrations/`
* `package.json`
* `package-lock.json`
* `.env`
* `.env.test`
* `scripts/run-tests.ts`
* El guard
* Servicios de cron, notificaciones o métricas

Si necesitas tocar otro archivo, detente y documenta la necesidad. No lo modifiques.

# Primera acción

Ejecuta:

```text
git status --short
git log -1 --oneline
git diff --check
git diff --stat
git diff --name-status
```

Confirma:

* HEAD continúa en `5e4be50`.
* No existe commit nuevo.
* Schema y migraciones están intactos.
* Package files están intactos.
* El diff corresponde solo a precedencia, cobertura, webhooks, reactivación, pruebas y documentación.
* No hay cambios del cron.

Guarda este prompt.

Antes de editar, entrega en tu informe un diagnóstico breve de F2H-01 a F2H-06 sobre el código actual.

# 1. Separar economía de acceso en Payment APPROVED

El defecto actual consiste en usar una misma escritura condicional para:

* Estado de acceso.
* Período económico.
* Precio y unidades.
* Términos pendientes.
* Limpieza de términos pendientes.

Eso debe separarse.

## 1.1 Efecto económico obligatorio

Después de reclamar correctamente `approvedEffectAppliedAt`, dentro de la misma transacción:

1. Relee la Subscription actual.
2. Calcula el período económico mediante la fuente única ya aprobada.
3. Determina los términos efectivos.
4. Actualiza `Payment.periodStart` y `Payment.periodEnd`.
5. Actualiza en Subscription únicamente los campos económicos:

   * `currentPeriodStart`;
   * `currentPeriodEnd`;
   * precio efectivo;
   * unidades efectivas;
   * limpieza de precio pendiente;
   * limpieza de unidades pendientes;
   * otros campos estrictamente económicos ya usados por la Fase 1.
6. No cambies todavía:

   * `status`;
   * `graceEndsAt`;
   * `trialEndsAt`;
   * estado de Tenant.

Payment y Subscription deben terminar con exactamente el mismo período.

## 1.2 CAS económico

La escritura económica de Subscription debe protegerse contra otra modificación económica concurrente.

Usa un CAS separado cuyo `where` compare los valores económicos exactos leídos:

* `id`;
* `tenantId`;
* `currentPeriodStart`;
* `currentPeriodEnd`;
* precio actual;
* unidades actuales;
* términos pendientes relevantes.

No incluyas `status` como condición del CAS económico.

Una suspensión administrativa que solo cambie `status` no debe impedir el período pagado.

## 1.3 Conflicto económico

Si el CAS económico devuelve `count = 0`:

* No dejes aplicado el marcador.
* No dejes actualizado Payment.
* Lanza un conflicto interno controlado para revertir toda la transacción.
* El replay debe poder volver a reclamar y aplicar correctamente.
* No marques el evento como `DUPLICATE`.
* No dejes períodos parciales.

Puedes implementar como máximo **un reintento transaccional acotado**, usando los datos de Mercado Pago ya obtenidos.

No vuelvas a llamar a Mercado Pago.

No implementes un bucle general o infinito.

Si el segundo intento también encuentra conflicto:

* aborta de forma controlada;
* deja el ledger conforme al manejo existente de fallo;
* cero cambios económicos parciales.

# 2. CAS independiente del acceso

Solo después de aplicar correctamente la economía:

1. Relee la Subscription.
2. Determina el estado administrativo actual.
3. Decide si puede pasar a `ACTIVE`.
4. Ejecuta un CAS exclusivamente de acceso.

El CAS de acceso puede comparar:

* `id`;
* `tenantId`;
* `status`;
* `graceEndsAt`;
* `trialEndsAt`;
* la frontera económica recién persistida cuando sea necesaria para detectar una modificación posterior.

Su `data` debe modificar únicamente campos de acceso:

* `status`;
* `graceEndsAt`;
* campos de acceso estrictamente necesarios.

No vuelva a escribir:

* período;
* precio;
* unidades;
* términos pendientes.

## Si el CAS de acceso gana

* Subscription pasa a ACTIVE.
* Tenant pasa a ACTIVE.
* Payment y Subscription ya comparten período.
* Ledger queda `PROCESSED`.

## Si el CAS de acceso pierde

* No reviertas el efecto económico.
* No actualices Tenant.
* Relee la Subscription después de `count = 0`.
* Conserva el estado administrativo que realmente ganó.
* Registra:

  * `accessStatePreserved = true`;
  * `ignoredAccessReason = "CONCURRENT_SUBSCRIPTION_CHANGE"`;
  * `persistedSubscriptionStatus` con el valor releído real.
* Ledger continúa `PROCESSED`, porque el dinero sí fue aplicado.
* El replay continúa siendo `DUPLICATE`.

## Estados terminales

Si la Subscription releída está:

* `SUSPENDED`;
* `CANCELLED`;

no intentes activar.

Aplica el efecto económico y conserva acceso terminal.

# 3. Términos pendientes

Confirma que los términos pendientes:

* se calculan desde el snapshot económico correcto;
* se aplican una sola vez;
* se limpian en la misma escritura económica;
* no dependen del CAS de acceso;
* permanecen aplicados aunque el acceso siga SUSPENDED o CANCELLED;
* no se aplican nuevamente en replay.

## Prueba obligatoria

Payment APPROVED con:

* Subscription inicialmente no terminal;
* términos pendientes;
* suspensión administrativa concurrente antes del CAS de acceso.

Resultado:

* Payment APPROVED.
* Marcador aplicado.
* Payment y Subscription con el mismo período.
* Términos pendientes aplicados y limpiados.
* Subscription y Tenant SUSPENDED.
* Replay DUPLICATE.
* Cero nueva extensión.
* Cero segunda aplicación de términos.

# 4. Estabilidad de evidencia en preapproval

Preapproval no puede decidir ACTIVE con una evidencia que cambie durante la transacción.

## Transacción Serializable

Ejecuta la transacción local de preapproval con:

```typescript
Prisma.TransactionIsolationLevel.Serializable
```

La consulta remota a Mercado Pago permanece fuera.

Dentro de la transacción:

1. Relee Subscription.
2. Lee Payments exactos por `tenantId + subscriptionId`.
3. Calcula cobertura.
4. Calcula `decidePreapprovalOutcome`.
5. Ejecuta el CAS.
6. Sincroniza Tenant.
7. Crea AuditLog.
8. Finaliza WebhookEvent.
9. Confirma.

## Sin segunda validación silenciosa

`applyTenantStatusInTx` no debe:

* recargar evidencia y retornar silenciosamente después de que Subscription ya quedó ACTIVE;
* permitir una Subscription ACTIVE con Tenant sin actualizar.

Usa una de estas soluciones, priorizando simplicidad:

### Opción preferida

La decisión `ACTIVE` se basa en la evidencia leída dentro de la transacción Serializable y el helper recibe una confirmación explícita de cobertura ya validada.

Entonces actualiza Tenant dentro de esa misma transacción sin una segunda consulta divergente.

### Alternativa válida

Si se mantiene una segunda validación:

* la ausencia de evidencia debe lanzar;
* toda la transacción debe revertirse;
* nunca debe confirmar Subscription ACTIVE sin Tenant ACTIVE.

No aceptes un `return` silencioso.

# 5. Conflictos de serialización en preapproval

Usa el manejo de `P2034` ya implementado o crea un helper coherente.

Reglas:

* Solo transforma errores `P2034`.
* No oculta otros errores.
* No hace loops infinitos.
* Puede realizar como máximo un reintento acotado con el payload ya obtenido.
* No vuelve a llamar al proveedor.
* Cada intento relee Subscription y Payments.
* Una transacción abortada no deja:

  * Subscription modificada;
  * Tenant modificado;
  * auditoría;
  * ledger final parcial.

Si tras el reintento la evidencia ya no es válida:

* recalcula la decisión;
* no activa;
* deja Tenant y Subscription coherentes;
* registra la decisión final correcta.

# 6. Payment no aprobado y evidencia mutable

Revisa también la rama no-APPROVED.

Esta rama depende de Payments de cobertura.

Ejecuta su decisión local bajo `Serializable` o una garantía equivalente que impida confirmar `ENTER_GRACE` usando evidencia que dejó de ser válida durante la operación.

Reglas:

* Lectura de cobertura exacta dentro.
* Decisión dentro.
* CAS de acceso.
* Tenant solo si CAS gana.
* Auditoría y ledger dentro.
* Conflicto controlado y sin parciales.
* Como máximo un reintento acotado con el payload ya obtenido.
* No volver a llamar al proveedor.

## Prueba obligatoria

1. Webhook REJECTED lee ausencia de cobertura.
2. Antes de confirmar, otra transacción crea/aplica cobertura válida o cortesía.
3. La operación debe:

   * entrar en conflicto o perder el CAS;
   * reevaluar;
   * preservar acceso;
   * no crear Grace;
   * no modificar Tenant;
   * registrar el estado real.

# 7. Estado persistido real después de CAS perdido

En todos los flujos con CAS:

* Preapproval.
* Payment APPROVED.
* Payment no aprobado.

Cuando `count = 0`:

1. Relee Subscription dentro de la transacción.
2. No escribas nuevamente.
3. Usa la fila releída para metadata y auditoría.

Debe registrarse correctamente:

* `persistedSubscriptionStatus`;
* `currentPeriodStart`;
* `currentPeriodEnd`;
* `graceEndsAt`;
* cualquier frontera necesaria para explicar la carrera.

No uses el snapshot anterior como “persistido”.

## Pruebas obligatorias

Fortalece:

* #49: metadata debe informar realmente SUSPENDED.
* #50: metadata debe informar realmente CANCELLED.
* #51: metadata debe informar realmente SUSPENDED.

# 8. Acotar status de creación de preapproval

En:

`createMercadoPagoSubscriptionForTenant`

No uses directamente:

```typescript
preapproval.status
```

para persistencia o auditoría.

Aplica:

* `providerStatusLabel`;
* el límite común de 255;
* manejo seguro de tipos no string.

Esto aplica a:

* `mercadoPagoStatus`;
* metadata de auditoría;
* cualquier raw status derivado de esa respuesta.

## Pruebas obligatorias

Respuesta de creación de preapproval con:

* string de 10.000 caracteres;
* objeto;
* array;
* null.

Confirma:

* no lanza por normalización;
* el valor persistido queda acotado;
* auditoría usa la etiqueta segura;
* no se serializa el objeto;
* no hay payload completo.

No llames a Mercado Pago real.

# 9. Revisión del helper de Tenant

Revisa `applyTenantStatusInTx`.

Debe tener un contrato inequívoco.

Para `ACTIVE`:

* no debe volver a consultar evidencia si ya se validó establemente dentro de una transacción Serializable;
* debe recibir una bandera o contexto explícito, por ejemplo:

  * `realPaymentCoverageValidated: true`;
* si la condición requerida no está presente, debe lanzar y revertir;
* nunca retornar silenciosamente dejando divergencia.

Para otros estados:

* conserva la sincronización ya aprobada.

No amplíes este helper fuera de Mercado Pago.

# 10. Seams deterministas

Puedes ampliar los seams de prueba existentes.

Seams sugeridos:

* `AFTER_APPROVED_ECONOMIC_SNAPSHOT`.
* `AFTER_APPROVED_ECONOMIC_UPDATE`.
* `BEFORE_APPROVED_ACCESS_CAS`.
* `AFTER_PREAPPROVAL_COVERAGE_READ`.
* `BEFORE_PREAPPROVAL_COMMIT`.
* `AFTER_NON_APPROVED_COVERAGE_READ`.

Requisitos:

* solo `NODE_ENV === "test"`;
* sin ruta HTTP;
* sin sleeps;
* reset en `finally`;
* cero hooks residuales;
* no cambiar producción.

# 11. Pruebas puras

Conserva las 92 pruebas existentes.

Añade únicamente las pruebas puras necesarias para:

* status de creación de preapproval largo/no-string;
* helper de truncado uniforme;
* cualquier estructura pura nueva para separar economía y acceso.

No conviertas lógica transaccional en tests puramente simulados si debe demostrarse en PostgreSQL.

# 12. Pruebas de integración obligatorias

Amplía y fortalece `tests/billing-webhook-idempotency.test.ts`.

## A. APPROVED pierde CAS de acceso

Partiendo de una Subscription no terminal:

1. Payment APPROVED reclama el efecto.
2. Se calculan períodos y términos pendientes.
3. Antes del CAS de acceso, otra transacción suspende Subscription/Tenant.
4. La operación continúa.

Verifica:

* Payment APPROVED.
* `approvedEffectAppliedAt != null`.
* `periodStart` y `periodEnd`.
* Subscription con el mismo `currentPeriodStart/currentPeriodEnd`.
* Términos pendientes aplicados y limpiados.
* Subscription SUSPENDED.
* Tenant SUSPENDED.
* Ledger PROCESSED.
* Metadata con estado persistido SUSPENDED.
* Replay DUPLICATE.
* Replay no cambia período ni términos.

## B. Conflicto económico

1. Payment APPROVED lee snapshot económico.
2. Otra transacción cambia el período o términos económicos.
3. CAS económico pierde.

Verifica:

* primera transacción revierte;
* marcador sigue null;
* Payment no queda con período parcial;
* Subscription conserva la modificación concurrente;
* intento posterior recalcula y aplica una sola vez.

## C. Preapproval authorized y evidencia en cuarentena

1. Preapproval lee Payment real vigente.
2. Otra transacción pone el Payment en cuarentena antes de confirmar.
3. La transacción Serializable entra en conflicto o reevalúa.

Verifica:

* nunca queda Subscription ACTIVE con Tenant no ACTIVE;
* después del conflicto, el estado final se calcula con la evidencia nueva;
* no activa;
* auditoría y ledger reflejan la decisión final;
* cero cambios parciales.

## D. Preapproval authorized y Payment vencido concurrentemente

Mismo principio:

* evidencia válida al inicio;
* período deja de ser vigente;
* no se confirma ACTIVE con evidencia inválida.

## E. Payment no aprobado vs cobertura concurrente

1. REJECTED observa ausencia de cobertura.
2. Otra transacción aplica Payment real o SIMULATED vigente.
3. El webhook continúa.

Resultado:

* no entra a Grace;
* cobertura prevalece;
* Tenant no se degrada;
* metadata usa el estado real.

## F. Metadata tras CAS perdido

Fortalece #49, #50 y #51 para verificar:

* `persistedSubscriptionStatus`;
* período real persistido;
* `graceEndsAt`;
* razón concurrente;
* AuditLog;
* WebhookEvent.

## G. Creación de preapproval con status externo largo

Mockea la respuesta externa y verifica:

* valor persistido máximo 255;
* metadata máxima 255;
* objeto/array no se serializan;
* sin 500.

## H. Compatibilidad con términos pendientes

Añade la combinación:

* estado terminal;
* términos pendientes;
* Payment APPROVED;
* replay.

Confirma una sola aplicación.

# 13. Fortalecer escenarios existentes

Revisa:

* #49.
* #50.
* #51.
* #54.
* #55.
* #56.

Añade las aserciones señaladas por Codex.

No basta verificar únicamente Payment.

Cada escenario económico relevante debe verificar:

* Payment.
* Subscription.
* Tenant.
* período.
* términos.
* marcador.
* ledger.
* AuditLog.
* metadata.
* replay cuando aplique.

No reduzcas aserciones existentes.

No añadas `skip`.

# 14. Compatibilidad con Fase 1

Deben seguir pasando:

* Payment APPROVED nuevo.
* Idempotencia.
* Replay.
* Concurrencia del mismo Payment.
* Rollback en tres puntos.
* Reintento.
* Cuarentena.
* Reconciliación.
* Términos pendientes.
* Período compartido Payment/Subscription.
* Missing dataId.
* Ledger.
* Preapproval atómico.

La invariancia obligatoria es:

```text
Payment.periodStart  == Subscription.currentPeriodStart
Payment.periodEnd    == Subscription.currentPeriodEnd
```

después de cualquier efecto aprobado aplicado, incluso cuando el acceso permanezca terminal.

# 15. Schema y migración

No modifiques:

* `prisma/schema.prisma`.
* Migraciones existentes.

No crees migración.

Si descubres que la corrección no puede hacerse sin schema:

1. Detente.
2. Documenta exactamente por qué.
3. Marca `BLOQUEADO`.
4. No inventes campos.

# 16. Ejecución segura

El proyecto actual contiene mockdata autorizado.

No modifiques el guard ni las variables persistentes.

## Ruta insegura

Ejecuta primero `npm test` con el entorno normal.

Debe abortar antes de Prisma.

## PowerShell autorizado

En este entorno, una cadena vacía elimina la variable y permite que el runner recupere `.env`.

Usa un valor compuesto únicamente por espacio, que permanece en el entorno y que el guard clasifica como blank:

```powershell
$hadDatabaseUrl = Test-Path Env:DATABASE_URL
$hadDirectUrl = Test-Path Env:DIRECT_URL
$previousDatabaseUrl = $env:DATABASE_URL
$previousDirectUrl = $env:DIRECT_URL

try {
  $env:DATABASE_URL = " "
  $env:DIRECT_URL = " "

  npm test
}
finally {
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
}
```

## POSIX autorizado

```bash
env DATABASE_URL= DIRECT_URL= npm test
```

No muevas `.env`.

No modifiques `.env.test`.

No desactives comparaciones del guard.

## Comandos

Ejecuta:

```text
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
npm test
```

El último comando debe usar el procedimiento autorizado según el shell actual.

No reintentes automáticamente un fallo lógico de pruebas.

# 17. Limpieza

Antes y después confirma:

* conteos básicos;
* cero Payments reales Mercado Pago;
* cero fixtures;
* cero WebhookEvent residuales;
* cero usuarios de prueba;
* `.env` intacto;
* `.env.test` ignorado;
* cero llamadas reales al proveedor.

# 18. Criterios de aceptación

La fase se considera corregida únicamente si:

1. La economía de Subscription está separada del acceso.
2. El CAS de acceso no puede impedir períodos o términos.
3. Payment y Subscription comparten siempre el período aprobado.
4. Un conflicto económico revierte el marcador y permite reintento.
5. Una suspensión concurrente preserva acceso pero no pierde economía.
6. Preapproval usa evidencia estable.
7. Subscription y Tenant nunca divergen.
8. No existe retorno silencioso al activar Tenant.
9. CAS perdido registra el estado real.
10. Status externo de checkout queda acotado.
11. Pruebas concurrentes detectan los defectos anteriores.
12. Fase 1 permanece intacta.
13. No cambia schema.
14. No existe migración.
15. Typecheck pasa.
16. Lint pasa.
17. Pruebas puras pasan.
18. Suite completa pasa.
19. Cero `skip`.
20. Fixtures limpios.
21. No se llama al proveedor real.
22. No se hace commit.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git.
3. Diagnóstico F2H-01 a F2H-06.
4. Separación economía/acceso.
5. CAS económico.
6. CAS de acceso.
7. Términos pendientes.
8. Payment APPROVED.
9. Payment no aprobado.
10. Preapproval Serializable.
11. Manejo P2034.
12. Estado persistido tras CAS.
13. Helper de Tenant.
14. Status externo acotado.
15. Seams.
16. Archivos modificados.
17. Schema y migración.
18. Pruebas puras.
19. Pruebas de integración.
20. Escenarios fortalecidos.
21. Procedimiento seguro.
22. Comandos ejecutados.
23. Resultados.
24. Limpieza.
25. Compatibilidad con Fase 1.
26. Riesgos restantes.
27. Respuesta individual F2H-01…F2H-06.
28. Recomendación sobre commit.
29. Estado:

* CORREGIDO.
* CORREGIDO CON RIESGOS.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/03-precedencia-cron/18-respuesta-codex-correccion-efecto-economico-cobertura.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/03-precedencia-cron/17-prompt-codex-correccion-efecto-economico-cobertura.md`

3. No hagas commit.

4. No inicies el cron.

5. Detente después del informe.
