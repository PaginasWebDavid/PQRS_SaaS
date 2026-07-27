# FASE 2L — IMPLEMENTACIÓN DEL CRON CON CAS Y ATOMICIDAD

## Documentación automática

Antes de analizar o modificar código:

1. Crea:

`docs/programa-mejora/04-cron-atomicidad/01-prompt-claude-implementacion-cron-cas-atomicidad.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/04-cron-atomicidad/02-respuesta-claude-implementacion-cron-cas-atomicidad.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques documentos de fases anteriores.

---

Actúa como ingeniero principal especializado en PostgreSQL, Prisma, procesos cron, concurrencia, compare-and-set, facturación recurrente y pruebas transaccionales.

Debes diagnosticar e implementar en una sola intervención la siguiente subfase:

> CAS, precedencia y atomicidad de las transiciones automáticas del cron de facturación.

Esta implementación será revisada y, cuando corresponda, corregida directamente por Codex. No hagas commit.

## Contexto aprobado

La subfase anterior cerró:

* Idempotencia económica de Payment APPROVED.
* Precedencia de estados.
* Separación entre economía y acceso.
* Cobertura real y administrativa.
* Protección de estados terminales.
* Reactivación Serializable.
* CAS de Subscription en webhooks.
* Evidencia exacta por `tenantId + subscriptionId`.
* Auditoría atómica.
* Pruebas concurrentes.

El último commit debe tener el mensaje exacto:

```text
feat(billing): enforce payment precedence and access coverage
```

No asumas el hash. Debes leerlo desde Git y registrarlo en el informe.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/02-respuesta-claude-diagnostico-precedencia-cron.md`
* `docs/programa-mejora/03-precedencia-cron/04-respuesta-codex-verificacion-precedencia-cron.md`
* `docs/programa-mejora/03-precedencia-cron/16-respuesta-codex-aprobacion-final-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/20-respuesta-claude-revision-final-economia-acceso.md`
* `docs/programa-mejora/03-precedencia-cron/22-respuesta-codex-commit-precedencia-cobertura.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

Inspecciona también todos los archivos relacionados con:

* Cron de facturación.
* Vencimiento de trials.
* Vencimiento de períodos activos.
* Entrada y salida de Grace.
* Suspensión automática.
* Actualización de Tenant.
* AuditLog.
* Notification.
* Email.
* Autenticación de rutas cron.

La fuente de verdad es el código actual.

# 1. Alcance

Debes corregir principalmente:

* F2-02: el cron selecciona una fila y posteriormente la actualiza solo por `id`, pudiendo sobrescribir un pago o acción administrativa reciente.
* F2-05: una Subscription en `GRACE_PERIOD` con `graceEndsAt = null` queda en un estado inconsistente.
* F2-06: Subscription, Tenant, auditoría y demás efectos del cron no se actualizan de forma atómica.

También debes comprobar que dos ejecuciones concurrentes del cron no produzcan:

* Dos transiciones.
* Dos auditorías de transición.
* Dos actualizaciones de Tenant.
* Una suspensión después de un pago reciente.
* Una degradación después de una reactivación manual.

## Fuera de alcance

No implementes todavía:

* `Notification.dedupeKey`.
* Migración de deduplicación.
* Idempotencia definitiva de emails.
* Reintentos de email.
* Colas.
* Proveedores externos.
* Rediseño de Notification.
* Rediseño de cancelación.
* Métricas de negocio.
* UI.
* Webhooks nuevos.
* Nuevos estados Prisma.
* Nuevas columnas.
* Migraciones.
* Cambios de precios o planes.
* Reparación automática agresiva de datos históricos.

La siguiente subfase tratará específicamente notificaciones y emails.

# 2. Restricciones

No debes:

* Modificar `prisma/schema.prisma`.
* Crear o aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Modificar `.env` o `.env.test`.
* Modificar el runner o guard.
* Llamar a Mercado Pago.
* Enviar emails reales.
* Levantar servidor.
* Ejecutar build.
* Hacer commit.
* Hacer push.
* Crear tags.
* Usar locks distribuidos.
* Añadir una cola.
* Añadir `Subscription.version`.
* Añadir timestamps del proveedor.

Puedes modificar únicamente los archivos estrictamente necesarios de:

* Cron de facturación.
* Helpers puros de decisión.
* Servicios usados por el cron.
* Pruebas puras.
* Pruebas de integración.
* Documentos 01 y 02 de esta fase.

Antes de modificar un archivo fuera de estas categorías, documenta la necesidad.

# 3. Estado inicial de Git

Ejecuta:

```text
git status --short
git log -2 --oneline
git diff --check
git diff --stat
git diff --name-status
```

Confirma:

* El último commit tiene el mensaje aprobado.
* El commit anterior corresponde a la idempotencia de Fase 1.
* No queda staged diff.
* La implementación anterior está comprometida.
* Schema, migraciones, paquetes y entorno están intactos.
* Los cambios antiguos ajenos permanecen fuera del alcance.

Registra el hash real del último commit en el informe.

Si el commit esperado no es HEAD, detente y marca `BLOQUEADO`.

# 4. Diagnóstico previo obligatorio

Antes de editar, identifica:

1. Entrada o entradas del cron.
2. Servicio que selecciona candidatos.
3. Consultas actuales de candidatos.
4. Transiciones automáticas existentes.
5. Campos utilizados para decidir vencimiento.
6. Actualizaciones actuales de Subscription.
7. Actualizaciones actuales de Tenant.
8. AuditLog generado.
9. Notifications creadas.
10. Emails enviados.
11. Comportamiento ante errores parciales.
12. Comportamiento ante dos ejecuciones simultáneas.
13. Comportamiento ante un pago concurrente.
14. Comportamiento ante una reactivación manual concurrente.
15. Tratamiento actual de `graceEndsAt = null`.

Presenta un diagnóstico breve en el informe antes de describir los cambios.

# 5. Helper puro de decisión

Crea o consolida un módulo puro para decidir transiciones del cron.

No debe importar ni crear PrismaClient.

Debe recibir un snapshot mínimo de Subscription y `now`.

Debe devolver un resultado discriminado, por ejemplo:

```typescript
type CronTransitionDecision =
  | {
      action: "TRANSITION";
      transition: "TRIAL_EXPIRED" | "ACTIVE_EXPIRED" | "GRACE_EXPIRED";
      nextStatus: SubscriptionStatus;
      reason: string;
    }
  | {
      action: "PRESERVE";
      reason: string;
    }
  | {
      action: "INCONSISTENT";
      reason: string;
    };
```

Adapta nombres a los enums reales.

No inventes nuevas políticas si el código actual ya define una transición comercial. Conserva el comportamiento nominal existente, salvo cuando sea inseguro.

## Reglas mínimas

### Estados terminales

* `SUSPENDED` → preservar.
* `CANCELLED` → preservar.

### ACTIVE

Si `currentPeriodEnd > now`:

* preservar.

Si `currentPeriodEnd <= now`:

* aplicar la transición actual del negocio hacia Grace o el estado actualmente definido.

No recalcules una nueva Grace si ya existe una frontera válida derivada de una transición anterior.

### TRIAL

Si `trialEndsAt > now`:

* preservar.

Si `trialEndsAt <= now`:

* aplicar la transición comercial existente.

### GRACE_PERIOD

Si `graceEndsAt > now`:

* preservar.

Si `graceEndsAt <= now`:

* transición a `SUSPENDED`, conforme a la política existente.

Si `graceEndsAt = null`:

* clasificar `INCONSISTENT`.
* No suspender automáticamente.
* No inventar una fecha.
* No reiniciar Grace.
* No modificar Tenant.
* No enviar notificación ni email de suspensión.
* Incluir el caso en el resumen del cron.

### PENDING_PAYMENT

Conserva la política existente. No inventes una suspensión nueva sin evidencia de que el código actual la contempla.

# 6. Selección de candidatos

La consulta inicial solo sirve para localizar posibles candidatos.

No debe considerarse fuente definitiva de la decisión.

Puede seleccionar por:

* estado;
* fronteras temporales;
* límites de lote.

Pero cada candidato debe ser releído dentro de su propia transacción antes de cambiarse.

Evita una consulta global seguida de `updateMany` masivo sin validación individual.

No cargues todos los registros de la base sin límite.

Conserva o introduce un límite de lote razonable y documentado.

No añadas paginación compleja si no es necesaria.

# 7. Transacción por Subscription

Procesa cada candidato en una transacción independiente.

Dentro de la transacción:

1. Relee Subscription por:

   * `id`;
   * `tenantId`.
2. Relee Tenant cuando sea necesario.
3. Calcula nuevamente la decisión usando `now`.
4. Si la decisión es `PRESERVE`:

   * no escribe;
   * no crea AuditLog de transición;
   * no crea Notification;
   * no envía email.
5. Si es `INCONSISTENT`:

   * no cambia Subscription;
   * no cambia Tenant;
   * no crea notificación de suspensión;
   * devuelve el resultado al resumen.
6. Si es `TRANSITION`:

   * reclama la transición con CAS;
   * si gana, sincroniza Tenant;
   * crea AuditLog dentro de la misma transacción;
   * confirma.
7. Los efectos externos solo pueden ocurrir después del commit.

# 8. CAS del cron

La transición debe realizarse con `updateMany`.

El `where` debe comparar el snapshot exacto relevante:

* `id`.
* `tenantId`.
* `status`.
* La frontera temporal que originó la transición:

  * `trialEndsAt`;
  * `currentPeriodEnd`;
  * o `graceEndsAt`.
* Cualquier campo adicional necesario para detectar que un pago, webhook o acción administrativa cambió la fila.

No reconstruyas fechas.

No redondees fechas.

No compares solo por `id`.

## Si `count === 1`

El cron ganó la transición:

* actualiza Tenant;
* crea AuditLog;
* devuelve `APPLIED`.

## Si `count === 0`

Otro proceso modificó la Subscription:

* no actualiza Tenant;
* no crea AuditLog de transición;
* no crea Notification;
* no envía email;
* no reintenta automáticamente;
* devuelve `SKIPPED_CONCURRENT_CHANGE`.

El proceso que cambió la fila debe prevalecer.

# 9. Pago concurrente

Prueba y garantiza este escenario:

1. El cron selecciona una Subscription ACTIVE vencida.
2. Antes del CAS, entra un Payment APPROVED.
3. El Payment actualiza período y acceso correctamente.
4. El cron continúa.

Resultado obligatorio:

* CAS del cron pierde.
* Subscription permanece ACTIVE.
* El nuevo período permanece.
* Tenant permanece ACTIVE.
* No se crea auditoría de suspensión/Grace.
* No se crea efecto externo del cron.
* El pago prevalece.

No dupliques la lógica del webhook dentro del cron.

# 10. Reactivación administrativa concurrente

Escenario obligatorio:

1. El cron selecciona una Grace vencida.
2. Antes del CAS, un SUPER_ADMIN reactiva Subscription y Tenant.
3. El cron continúa.

Resultado:

* CAS pierde.
* Subscription permanece ACTIVE.
* Tenant permanece ACTIVE.
* No se suspende.
* No se audita una suspensión.
* No se envía efecto de suspensión.

# 11. Dos cron concurrentes

Ejecuta dos procesamientos simultáneos sobre la misma Subscription elegible.

Resultado:

* Solo uno obtiene `count = 1`.
* Solo uno cambia Subscription.
* Solo uno cambia Tenant.
* Solo uno crea AuditLog.
* El segundo devuelve `SKIPPED_CONCURRENT_CHANGE`.
* No hay doble transición.

No necesitas lock distribuido.

El CAS de PostgreSQL debe ser la protección.

# 12. Atomicidad

Para una transición aplicada, deben confirmarse juntos:

* Subscription.
* Tenant.
* AuditLog.

Si falla Tenant:

* Subscription revierte.

Si falla AuditLog:

* Subscription revierte.
* Tenant revierte.

No debe quedar:

* Subscription suspendida con Tenant activo.
* Tenant suspendido con Subscription activa.
* Transición sin auditoría.
* Auditoría de una transición que no ocurrió.

Usa el cliente transaccional existente para AuditLog.

# 13. Notification y email

Esta fase no implementa su deduplicación definitiva.

Debes inspeccionar el comportamiento actual y aplicar estas reglas mínimas:

* Ningún email se envía dentro de la transacción.
* Ningún email se envía si el CAS pierde.
* Ningún email se envía si la transacción revierte.
* Ningún email se envía para `PRESERVE`.
* Ningún email se envía para `INCONSISTENT`.

Si actualmente el cron crea Notification:

* no permitas que se cree antes de ganar el CAS;
* documenta si queda dentro o después de la transacción;
* evita ampliar su diseño;
* no añadas `dedupeKey` todavía.

Si mover Notification de forma segura requiere schema o rediseño, mantenla fuera de esta fase y documenta exactamente el riesgo restante.

No envíes emails reales en pruebas.

# 14. Resumen del cron

La función principal debe devolver o registrar de forma estructurada conteos como:

* candidatos examinados;
* transiciones aplicadas;
* preservados;
* saltados por cambio concurrente;
* inconsistencias `graceEndsAt = null`;
* errores;
* efectos externos programados o ejecutados.

No incluyas datos personales.

No expongas secretos.

No conviertas una inconsistencia individual en fallo total del lote.

# 15. Manejo de errores por candidato

Un error procesando una Subscription no debe revertir las transiciones ya confirmadas de otras.

Procesa cada candidato independientemente.

Registra en el resumen:

* subscriptionId;
* tenantId;
* clasificación del error;
* sin stack completo en respuestas públicas;
* sin datos sensibles.

El cron puede finalizar con estado parcial y conteo de errores.

No ocultes un error global de configuración o autenticación.

# 16. Autenticación del cron

Inspecciona la ruta y confirma:

* secreto o mecanismo actual;
* comparación segura;
* respuesta ante credencial ausente;
* respuesta ante credencial incorrecta.

No rediseñes autenticación salvo que exista un defecto crítico evidente.

No muestres el secreto.

Las pruebas deben usar valores falsos y controlados.

# 17. Seams de concurrencia

Reutiliza el patrón seguro ya aprobado.

Puedes añadir pasos como:

* `AFTER_CRON_CANDIDATE_SELECTED`.
* `AFTER_CRON_SUBSCRIPTION_READ`.
* `BEFORE_CRON_SUBSCRIPTION_CAS`.
* `BEFORE_CRON_TENANT_UPDATE`.
* `BEFORE_CRON_AUDIT_LOG`.

Requisitos:

* solo bajo `NODE_ENV === "test"`;
* sin entrada HTTP;
* reset en `finally`;
* limpieza global en `after`;
* sin sleeps;
* sin promesas eternas;
* no ejecutables en producción.

# 18. Pruebas puras

Crea pruebas para la decisión del cron.

Incluye como mínimo:

1. ACTIVE vigente → PRESERVE.
2. ACTIVE vencida → transición comercial existente.
3. ACTIVE con `currentPeriodEnd = now`.
4. TRIAL vigente.
5. TRIAL vencido.
6. TRIAL con `trialEndsAt = now`.
7. GRACE vigente.
8. GRACE vencida.
9. GRACE con `graceEndsAt = now`.
10. GRACE con `graceEndsAt = null` → INCONSISTENT.
11. SUSPENDED → PRESERVE.
12. CANCELLED → PRESERVE.
13. PENDING_PAYMENT conforme a política actual.
14. Fechas inválidas o ausentes.
15. La función no muta inputs.

No importes PrismaClient.

# 19. Pruebas de integración

Agrega pruebas reales contra PostgreSQL para:

## Transiciones nominales

1. ACTIVE vencida entra a Grace una sola vez.
2. GRACE vencida pasa a SUSPENDED una sola vez.
3. Trial vencido sigue la política actual.
4. Estado vigente no cambia.
5. `graceEndsAt = null` se reporta como inconsistencia y no cambia.

## Carreras

6. Payment APPROVED gana frente al cron.
7. Reactivación manual gana frente al cron.
8. Dos crons concurrentes: una transición y una auditoría.
9. Cambio de período concurrente hace perder el CAS.
10. Cambio de status concurrente hace perder el CAS.

## Atomicidad

11. Fallo antes de actualizar Tenant revierte Subscription.
12. Fallo antes de AuditLog revierte Subscription y Tenant.
13. Reintento posterior funciona.
14. No queda auditoría parcial.

## Efectos externos

15. CAS perdido no crea Notification ni email.
16. Rollback no crea Notification ni email.
17. INCONSISTENT no crea Notification ni email.
18. Una transición aplicada genera como máximo el comportamiento externo actual una vez durante esa ejecución.

## Lote

19. Un candidato falla y otro candidato válido sí se procesa.
20. El resumen refleja aplicados, preservados, concurrentes, inconsistentes y errores.

No añadas `skip`.

No uses sleeps.

No envíes emails reales.

# 20. Compatibilidad

Confirma que continúan pasando:

* Toda la suite anterior de billing.
* Idempotencia de Payment.
* Precedencia.
* Cobertura.
* Reactivación.
* Serializable.
* Período compartido.
* Términos pendientes.
* Webhook ledger.
* Auditoría.
* Tests de autenticación existentes.

No modifiques pruebas anteriores para reducir garantías.

# 21. Schema y migración

No modifiques schema.

No crees migración.

Si la implementación segura requiere schema:

1. Detente.
2. Documenta la necesidad.
3. Marca `BLOQUEADO`.
4. No inventes una solución incompleta.

# 22. Ejecución segura

## Ruta insegura

Ejecuta primero:

```text
npm test
```

Debe abortar antes de Prisma con el entorno normal.

## PowerShell autorizado

En este entorno usa espacios para conservar las variables en el proceso:

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

No modifiques `.env`.

No modifiques `.env.test`.

No desactives el guard.

## Comandos

Ejecuta:

```text
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
npm test
```

El último comando debe usar el procedimiento autorizado correspondiente al shell.

No reintentes automáticamente un fallo lógico.

# 23. Limpieza

Antes y después confirma:

* conteos básicos;
* cero fixtures del cron;
* cero fixtures de billing;
* cero WebhookEvent residuales;
* cero usuarios de prueba residuales;
* cero emails reales;
* cero llamadas a Mercado Pago;
* `.env` intacto;
* `.env.test` ignorado;
* conteos de mockdata sin cambios.

# 24. Criterios de aceptación

La implementación se considera completa únicamente si:

1. Cada candidato se relee dentro de una transacción.
2. La decisión se recalcula dentro.
3. Toda transición usa CAS.
4. El CAS compara status y frontera exacta.
5. Payment concurrente prevalece.
6. Reactivación concurrente prevalece.
7. Dos crons no duplican transición.
8. Tenant solo cambia si el CAS gana.
9. AuditLog es atómico.
10. Fallo de Tenant o auditoría revierte todo.
11. Grace null no se suspende ni reinicia.
12. CAS perdido no produce efectos externos.
13. Un candidato fallido no bloquea todo el lote.
14. El resumen es estructurado.
15. No cambia schema.
16. No existe migración.
17. Typecheck pasa.
18. Lint pasa.
19. Pruebas puras pasan.
20. Suite completa pasa.
21. No hay `skip`.
22. Fixtures limpios.
23. No se envían emails reales.
24. No se hace commit.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git y hash base.
3. Diagnóstico previo.
4. Entradas del cron.
5. Transiciones encontradas.
6. Helper puro de decisión.
7. Selección de candidatos.
8. Transacción por candidato.
9. CAS.
10. Pago concurrente.
11. Reactivación concurrente.
12. Dos cron concurrentes.
13. Atomicidad.
14. Grace null.
15. Notification y email.
16. Resumen del lote.
17. Manejo de errores.
18. Autenticación.
19. Seams.
20. Archivos modificados.
21. Schema y migración.
22. Pruebas puras.
23. Pruebas de integración.
24. Compatibilidad.
25. Procedimiento seguro.
26. Comandos ejecutados.
27. Resultados.
28. Limpieza.
29. Riesgos restantes.
30. Recomendación.
31. Estado:

* IMPLEMENTADO.
* IMPLEMENTADO CON RIESGOS.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/04-cron-atomicidad/02-respuesta-claude-implementacion-cron-cas-atomicidad.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/04-cron-atomicidad/01-prompt-claude-implementacion-cron-cas-atomicidad.md`

3. No hagas commit.

4. No hagas push.

5. No inicies la subfase de notificaciones.

6. Detente después del informe.
