# FASE 2A — DIAGNÓSTICO DE PRECEDENCIA DE EVENTOS Y SEGURIDAD DEL CRON

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/01-prompt-claude-diagnostico-precedencia-cron.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/02-respuesta-claude-diagnostico-precedencia-cron.md`

4. Guarda allí tu informe final completo, exactamente como lo entregas al usuario.

Estos dos documentos son los únicos archivos que puedes crear o modificar durante esta sesión.

---

Actúa como arquitecto de sistemas especializado en facturación recurrente, webhooks fuera de orden, máquinas de estados, Prisma, PostgreSQL, concurrencia y jobs programados.

Esta sesión es exclusivamente de diagnóstico. No implementes cambios.

## Contexto

La subfase anterior dejó implementados y aprobados:

* Idempotencia del efecto económico `APPROVED`.
* Atomicidad de Payment, Subscription, Tenant y AuditLog.
* Ledger `WebhookEvent`.
* Cuarentena de pagos históricos.
* Reconciliación manual.
* Pruebas de rollback y concurrencia del mismo pago.

Commit anterior:

`feat(billing): enforce idempotent atomic webhook effects`

Ahora debes diagnosticar los riesgos todavía abiertos:

* Eventos de Mercado Pago fuera de orden.
* Degradación incorrecta de suscripciones activas.
* Carreras entre webhook y cron.
* Carreras entre dos ejecuciones del cron.
* Divergencia entre Tenant y Subscription.
* Estados desconocidos del proveedor.
* `graceEndsAt = null`.
* Duplicación de notificaciones.

## Documentos obligatorios

Lee:

* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/programa-mejora/02-facturacion/24-respuesta-claude-commit-idempotencia-atomicidad.md`
* `docs/programa-mejora/02-facturacion/04-respuesta-codex-verificacion-facturacion.md`
* `docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md`, si existe.
* `docs/TESTING.md`

La fuente de verdad es el código actual posterior al commit.

## Restricciones

No debes:

* Modificar código.
* Modificar schema.
* Crear migraciones.
* Aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Ejecutar `npm test`.
* Conectarte a PostgreSQL.
* Llamar a Mercado Pago.
* Levantar el servidor.
* Ejecutar build.
* Modificar `.env` o `.env.test`.
* Mostrar secretos.
* Hacer commit o push.
* Continuar con métricas o interfaz.

Puedes:

* Leer archivos.
* Buscar símbolos y callers.
* Ejecutar `git status`.
* Ejecutar `git log -1`.
* Ejecutar `git diff`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Ejecutar únicamente pruebas puras que no importen Prisma.

## Primera acción

1. Crea la carpeta y guarda este prompt.
2. Ejecuta:

   * `git status --short`
   * `git log -1 --oneline`
3. Confirma que el commit de idempotencia es el `HEAD`.
4. Identifica cambios pendientes ajenos y no los modifiques.
5. Localiza todos los productores de cambios de estado de:

   * `Payment`.
   * `Subscription`.
   * `Tenant`.
   * `WebhookEvent`.
6. Localiza:

   * Servicio de Mercado Pago.
   * Servicio de billing.
   * Cron de mora.
   * Acciones manuales de Super Admin.
   * Checkout y cancelación de renovación.
   * Cualquier helper de estados o períodos.

# 1. Mapa completo de productores de estado

Construye una tabla con:

* Trigger.
* Endpoint o job.
* Función.
* Estado inicial permitido.
* Estado final escrito.
* Condiciones del `where`.
* Fecha o timestamp utilizado.
* Transacción.
* Auditoría.
* Notificación.
* Riesgo de carrera.

Incluye como mínimo:

* Webhook de Payment.
* Webhook de preapproval.
* Cron ACTIVE/TRIAL → GRACE_PERIOD.
* Cron GRACE_PERIOD → SUSPENDED.
* Reactivación manual.
* Suspensión manual.
* Cancelación manual.
* Cortesía.
* Renovación simulada.
* Desactivación de auto-renovación.
* Creación inicial del tenant.

# 2. Estados y precedencia de Payment

Analiza la máquina real de `PaymentStatus`.

Determina:

* Qué estados existen.
* Qué transiciones acepta actualmente el código.
* Si `APPROVED` puede volver a:

  * `PENDING`.
  * `REJECTED`.
* Si existen estados terminales.
* Si se usa:

  * `date_created`.
  * `date_approved`.
  * `date_last_updated`.
  * Timestamp del webhook.
  * Hora local de recepción.
* Si alguno de esos valores se persiste.
* Si existe comparación contra un evento anterior.
* Si `lastWebhookAt` representa proveedor o recepción local.

Distingue:

1. Mismo Payment cambiando de estado.
2. Payments diferentes de períodos diferentes.
3. Estado del preapproval.
4. Estado local de la suscripción.
5. Cobertura económica vigente.

Propón una precedencia mínima que permita:

* `PENDING → APPROVED`.
* `REJECTED → APPROVED`, si Mercado Pago lo permite.
* Impedir `APPROVED → PENDING`.
* Impedir `APPROVED → REJECTED` cuando el efecto económico ya fue aplicado.
* No bloquear actualizaciones de metadata no económica.

# 3. Cobertura vigente

Determina cómo debe decidir el sistema si una suscripción está cubierta.

Revisa si actualmente basta con:

* Cualquier `Payment APPROVED`.
* `Payment.periodEnd >= now`.
* `Subscription.currentPeriodEnd >= now`.
* `approvedEffectAppliedAt != null`.
* Estado `ACTIVE`.

Identifica todos los lugares que buscan “un pago aprobado” y verifica si filtran:

* Tenant correcto.
* Subscription correcta.
* Provider correcto.
* Período vigente.
* Efecto aplicado.
* Cuarentena histórica.

Propón una definición única y mínima de:

`hasValidPaidCoverage`

Debe evitar:

* Activar por un pago viejo.
* Activar por un pago simulado cuando se exige dinero real.
* Mantener activo por una fila aprobada sin efecto aplicado.
* Degradar a un cliente cuyo período actual sigue vigente.

# 4. Eventos fuera de orden

Reconstruye paso a paso estos escenarios:

1. `PENDING → APPROVED`.
2. `APPROVED → PENDING`.
3. `APPROVED → REJECTED`.
4. `REJECTED → APPROVED`.
5. Payment antiguo rechazado después de un Payment nuevo aprobado.
6. Payment antiguo aprobado después de una renovación más reciente.
7. Preapproval `authorized` antes del Payment.
8. Preapproval `paused` después de Payment aprobado.
9. Preapproval `cancelled` durante un período pagado.
10. Estado desconocido del proveedor.

Para cada uno indica:

* Comportamiento actual.
* Estado de Payment.
* Estado de Subscription.
* Estado de Tenant.
* Cambios de período.
* Auditoría.
* Resultado del ledger.
* Comportamiento recomendado.

# 5. Estado desconocido del proveedor

Verifica exactamente qué ocurre si Mercado Pago devuelve un estado no reconocido.

Determina si:

* Se transforma en `GRACE_PERIOD`.
* Se ignora.
* Se produce error.
* Se registra en ledger.
* Se conserva `rawStatus`.
* Se alerta.

Propón una regla fail-safe:

* No degradar automáticamente.
* Registrar.
* Marcar para revisión o reconciliación.
* Mantener el último estado local conocido salvo evidencia válida.

No implementes todavía una interfaz de alertas.

# 6. Cron ACTIVE/TRIAL → GRACE_PERIOD

Reconstruye el flujo actual:

1. `findMany`.
2. Cálculo de registros vencidos.
3. `updateMany`.
4. Actualización de Tenant.
5. Notificación.
6. Email.
7. Auditoría.

Verifica:

* Si el `updateMany` vuelve a comprobar:

  * estado de origen;
  * `currentPeriodEnd`;
  * tenant;
  * versión;
  * cobertura pagada.
* Qué ocurre si entra un webhook aprobado entre `findMany` y `updateMany`.
* Qué ocurre si una acción manual activa o cancela la suscripción.
* Si puede degradarse una suscripción recién pagada.
* Si Tenant y Subscription pueden divergir.
* Si el cron usa transacción.
* Si los emails se envían antes o después de persistir el cambio.

# 7. Cron GRACE_PERIOD → SUSPENDED

Analiza:

* Condición exacta.
* Uso de `graceEndsAt`.
* Comportamiento con `graceEndsAt = null`.
* Comparación `<`, `<=` o equivalente.
* Comportamiento en el instante exacto.
* Carrera con un Payment aprobado.
* Carrera con cortesía.
* Carrera con reactivación manual.
* Divergencia Tenant/Subscription.
* Notificaciones duplicadas.

Propón una política mínima para `graceEndsAt = null`:

* Estado inválido que no debe producirse.
* Normalización.
* Suspensión inmediata.
* Alerta y no transición.
* Otra opción justificada.

# 8. Dos ejecuciones concurrentes del cron

Analiza:

* Dos invocaciones al mismo tiempo.
* Ambas seleccionan las mismas suscripciones.
* Ambas ejecutan la transición.
* Ambas crean AuditLog.
* Ambas crean notificaciones.
* Ambas envían email.

Determina qué efectos son idempotentes y cuáles se duplican.

Evalúa soluciones mínimas:

* Compare-and-set.
* `updateMany` con estado y fechas esperadas.
* Uso del `count`.
* Clave idempotente de notificación.
* Tabla de ejecución de cron.
* Advisory lock.
* Campo `version`.
* Transacción por suscripción.
* Procesamiento por lotes.

Clasifica cada opción:

* Obligatoria.
* Recomendada.
* Innecesaria por ahora.

# 9. Compare-and-set y versión

Evalúa si basta con:

```text
updateMany({
  where: {
    id,
    status: estadoEsperado,
    currentPeriodEnd: fechaEsperada
  },
  data: ...
})
```

o si hace falta un campo:

```text
version Int @default(0)
```

Analiza:

* Webhook vs cron.
* Dos cron.
* Webhook vs acción manual.
* Cortesía vs pago.
* Cancelación vs pago.
* Cambios de precio pendientes.

Propón el diseño mínimo proporcional para una aplicación operada por una persona.

No propongas locks globales, colas ni infraestructura nueva salvo evidencia estricta.

# 10. Atomicidad del cron

Determina qué partes deberían estar en transacción:

* Subscription.
* Tenant.
* AuditLog.
* Notificación persistida.

Determina qué partes deberían quedar fuera:

* Envío de email.
* Llamadas externas.

Propón el orden mínimo seguro:

1. Reclamar transición.
2. Actualizar estado local.
3. Crear auditoría.
4. Crear notificación persistida.
5. Commit.
6. Enviar email.
7. Registrar fallo de envío sin revertir la transición.

Verifica si el modelo actual permite esa separación.

# 11. Idempotencia de notificaciones

Busca el modelo o servicio de notificaciones.

Verifica:

* Si existe unique key.
* Si se puede crear la misma notificación dos veces.
* Si se registra el tipo de transición.
* Si el email puede enviarse varias veces.
* Si hay estado de envío.
* Si hay retry.
* Si existe una referencia a Subscription, Tenant o período.

Propón una clave mínima conceptual, por ejemplo:

`tenantId + subscriptionId + transition + expectedPeriodEnd`

Evalúa si requiere migración.

# 12. Acciones manuales contra webhook y cron

Analiza carreras con:

* Reactivar.
* Suspender.
* Cancelar.
* Conceder cortesía.
* Renovar simulado.
* Cambiar unidades.
* Desactivar auto-renovación.

Para cada acción responde:

* Qué último escritor gana.
* Si existe condición de estado.
* Si existe transacción.
* Si debería prevalecer la acción manual o el pago.
* Si requiere `version`.
* Si debe quedar auditoría de conflicto.

No cambies todavía la política de cancelación; solo identifica interacciones.

# 13. Ledger y eventos fuera de orden

Evalúa si `WebhookEvent` actual contiene suficiente información para:

* Comparar orden.
* Identificar Payment.
* Identificar preapproval.
* Conocer timestamp del proveedor.
* Conocer timestamp de recepción.
* Saber si una transición fue ignorada por ser antigua.
* Saber si fue ignorada por precedencia.
* Reconstruir estado anterior y posterior.

Determina qué campos adicionales serían necesarios, si alguno:

* `providerEventAt`.
* `providerUpdatedAt`.
* `decision`.
* `previousStatus`.
* `nextStatus`.
* `ignoredReason`.
* Metadata actual.

Clasifica cada campo como:

* Obligatorio.
* Recomendado.
* Innecesario.

# 14. Modelo y migraciones posibles

Evalúa la necesidad de añadir:

* `Payment.providerUpdatedAt`.
* `Subscription.version`.
* `Subscription.lastProviderEventAt`.
* Clave idempotente de notificación.
* Estado de envío de email.
* Campo de transición aplicada.
* Nuevos resultados de ledger:

  * `STALE_EVENT`.
  * `IGNORED_BY_PRECEDENCE`.
  * `CONFLICT`.
  * Otro.

No diseñes una solución sobredimensionada.

Para cada cambio indica:

* Beneficio.
* Riesgo.
* Backfill.
* Compatibilidad.
* Reversibilidad.

# 15. Estrategia de pruebas

Diseña pruebas para:

## Puras

* Precedencia de estados.
* Comparación de timestamps.
* Cobertura vigente.
* Estado desconocido.
* Decisión de transición.
* Construcción de clave de notificación.
* `graceEndsAt = null`.

## Integración PostgreSQL

* `APPROVED → REJECTED` no degrada.
* Rechazo antiguo no degrada período vigente.
* Pago nuevo aprobado prevalece sobre cron.
* Cron gana únicamente si no hubo cambio.
* Dos cron producen una transición.
* Dos cron producen una notificación.
* Cortesía concurrente con cron.
* Reactivación concurrente con cron.
* Estado desconocido no degrada.
* Tenant y Subscription quedan coherentes.
* `graceEndsAt = null` sigue la política elegida.

## Fallos

* Auditoría falla.
* Notificación persistida falla.
* Email falla después del commit.
* Reintento del cron.
* Proceso muere después del commit y antes del email.

No ejecutes estas pruebas en esta fase.

# 16. Diseño mínimo recomendado

Entrega un diseño proporcional con:

1. Función pura de decisión de transición.
2. Definición única de cobertura vigente.
3. Timestamp o precedencia mínima.
4. Compare-and-set para cron.
5. Transacción local por transición.
6. Notificación idempotente.
7. Email fuera de la transacción.
8. Ledger con razón de evento ignorado.

Clasifica cada componente:

* OBLIGATORIO ANTES DE PRODUCCIÓN.
* RECOMENDADO.
* OPCIONAL.
* INNECESARIO.

# 17. Orden de implementación

Propón un máximo de cuatro subfases:

### Subfase 1

Precedencia y cobertura vigente.

### Subfase 2

Compare-and-set y atomicidad del cron.

### Subfase 3

Notificaciones idempotentes y manejo de fallos de email.

### Subfase 4

Observabilidad y campos opcionales.

Para cada una incluye:

* Archivos.
* Schema/migración.
* Pruebas.
* Riesgos.
* Criterios de aceptación.
* Rollback.

# Hallazgos

Para cada hallazgo incluye:

* ID.
* Severidad.
* Archivo y símbolo.
* Comportamiento actual.
* Escenario.
* Impacto.
* Evidencia.
* Corrección mínima.
* Prueba requerida.
* ¿Bloquea producción?: Sí/No.

# Validaciones permitidas

Ejecuta:

```text
npx tsc --noEmit
npm run lint
```

Puedes ejecutar pruebas puras existentes si verificas previamente que no importan Prisma.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Mapa de productores de estado.
4. Máquina de estados de Payment.
5. Definición actual de cobertura.
6. Eventos fuera de orden.
7. Estados desconocidos.
8. Cron ACTIVE/TRIAL → GRACE.
9. Cron GRACE → SUSPENDED.
10. Dos cron concurrentes.
11. Compare-and-set/version.
12. Atomicidad del cron.
13. Notificaciones.
14. Acciones manuales concurrentes.
15. Ledger.
16. Migraciones potenciales.
17. Estrategia de pruebas.
18. Diseño mínimo.
19. Subfases.
20. Hallazgos.
21. Riesgos aceptados.
22. Veredicto:

* DIAGNÓSTICO COMPLETO.
* DIAGNÓSTICO COMPLETO CON INCERTIDUMBRES.
* DIAGNÓSTICO INSUFICIENTE.

23. Preparación actual:

* SEGURA PARA PRODUCCIÓN.
* REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.
* NO DETERMINABLE.

## Finalización

1. Guarda el informe completo en:

`docs/programa-mejora/03-precedencia-cron/02-respuesta-claude-diagnostico-precedencia-cron.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/03-precedencia-cron/01-prompt-claude-diagnostico-precedencia-cron.md`

3. No implementes cambios.

4. No hagas commit.

5. No continúes con métricas, cancelación o interfaz.

6. Detente después del diagnóstico.
