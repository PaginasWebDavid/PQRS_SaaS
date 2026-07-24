# FASE 1A — DIAGNÓSTICO DE INTEGRIDAD DE FACTURACIÓN

Actúa como arquitecto principal especializado en sistemas de facturación, suscripciones SaaS, webhooks, concurrencia, idempotencia, Prisma, PostgreSQL y Mercado Pago.

Trabajas sobre PQRS Services, una plataforma SaaS multi-tenant para conjuntos residenciales en Colombia.

## Objetivo de esta sesión

Construir un diagnóstico verificable y un plan técnico para corregir la integridad de facturación.

Esta sesión es exclusivamente de análisis y planificación.

No modifiques código.

## Contexto confirmado por auditorías anteriores

Se identificaron estos riesgos potenciales:

1. El webhook usa `upsert` para `Payment`, pero un webhook repetido podría volver a extender `currentPeriodEnd`.
2. Un evento rechazado o pendiente que llegue tarde podría degradar una suscripción ya activa.
3. Cron, webhook y acciones manuales podrían actualizar simultáneamente `Tenant` y `Subscription`.
4. Las actualizaciones de `Payment`, `Subscription`, `Tenant` y `AuditLog` podrían quedar parcialmente aplicadas.
5. Existe una renovación simulada que crea un pago aprobado y activa acceso sin dinero real.
6. La cancelación recibida por webhook podría no establecer `cancelledAt`.
7. La lógica para aplicar unidades y precio pendientes está duplicada.
8. El proveedor externo puede actualizarse antes de que la transacción local termine correctamente.
9. El webhook carece de un ledger persistente completo y protección explícita de replay.
10. Mercado Pago no tiene cobertura automatizada suficiente.

No asumas que todos estos hallazgos son correctos. Confirma cada uno directamente en el código.

## Documentos de referencia

Lee:

* `docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md`
* `docs/programa-mejora/01-linea-base/02-respuesta-claude-diagnostico.md`
* `docs/programa-mejora/01-linea-base/04-respuesta-codex-verificacion.md`
* `docs/programa-mejora/01-linea-base/16-respuesta-codex-aprobacion-definitiva.md`, si existe.

La fuente de verdad es el código actual.

## Restricciones obligatorias

No debes:

* Modificar archivos.
* Crear migraciones.
* Aplicar migraciones.
* Ejecutar seeds.
* Ejecutar `npm test`.
* Ejecutar comandos Prisma.
* Ejecutar build.
* Levantar el servidor.
* Conectarte a PostgreSQL.
* Llamar a Mercado Pago.
* Simular webhooks contra rutas reales.
* Modificar variables de entorno.
* Mostrar secretos.
* Crear commits.
* Hacer push.

Puedes:

* Leer código.
* Ejecutar búsquedas estáticas.
* Ejecutar `git status`.
* Ejecutar `git diff`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Analizar migraciones existentes sin aplicarlas.
* Crear diagramas y pseudocódigo únicamente en tu respuesta, no como archivos.

## Primera acción

1. Ejecuta `git status`.
2. Confirma que no existen cambios de código pendientes.
3. Identifica el commit de cierre de la Fase 0.
4. No alteres el working tree.
5. Localiza todos los archivos relacionados con:

   * Billing.
   * Mercado Pago.
   * Payments.
   * Subscription.
   * Tenant status.
   * Cron.
   * Pricing.
   * Simulated payments.
   * Audit logs.
   * Notifications.

## Análisis obligatorio

### 1. Mapa completo de facturación

Reconstruye el flujo exacto de:

* Creación de un conjunto.
* Creación de la suscripción.
* Trial.
* Checkout.
* Preapproval.
* Autorización del pagador.
* Pago aprobado.
* Pago pendiente.
* Pago rechazado.
* Webhook duplicado.
* Renovación.
* Vencimiento.
* Período de gracia.
* Suspensión.
* Reactivación.
* Cancelación.
* Desactivación de renovación automática.
* Cambio de unidades.
* Cambio de precio.
* Pago simulado.
* Cortesía o activación manual.

Para cada flujo indica:

* Endpoint.
* Servicio.
* Modelos afectados.
* Campos modificados.
* Orden de operaciones.
* Uso o ausencia de transacción.
* Integración externa involucrada.
* Notificaciones.
* Auditoría.

### 2. Máquina de estados real

Construye la máquina de estados real de:

* `TenantStatus`.
* `SubscriptionStatus`.
* Estados de `Payment`.
* Estado de preapproval de Mercado Pago.

Identifica todas las transiciones posibles y quién puede producirlas:

* Webhook.
* Cron.
* Super Admin.
* Admin.
* Creación inicial.
* Renovación simulada.
* Acción manual.
* Cambio externo en Mercado Pago.

Señala:

* Transiciones inválidas.
* Transiciones no protegidas.
* Estados heredados.
* Estados alcanzables únicamente por código legado.
* Estados que pueden divergir entre `Tenant` y `Subscription`.

### 3. Idempotencia del webhook

Verifica por separado:

* Idempotencia de almacenamiento del evento.
* Idempotencia de la fila `Payment`.
* Idempotencia de los efectos sobre la suscripción.
* Idempotencia de notificaciones.
* Idempotencia de auditoría.
* Idempotencia de extensión del período.

Analiza escenarios:

1. El mismo webhook llega dos veces.
2. Llega con el mismo payment ID y datos iguales.
3. Llega con el mismo payment ID y estado diferente.
4. Mercado Pago reintenta después de una respuesta 500.
5. Dos instancias de Vercel procesan el mismo evento simultáneamente.
6. Un pago aprobado llega mientras el cron ejecuta mora.
7. Un pago aprobado llega mientras un Super Admin reactiva manualmente.
8. Un webhook de preapproval llega antes que el webhook del pago.
9. Un webhook antiguo llega después de uno reciente.

Determina si el efecto económico puede ejecutarse más de una vez.

### 4. Orden de eventos

Define qué debería ocurrir cuando llegan eventos fuera de orden:

* `PENDING` después de `APPROVED`.
* `REJECTED` después de `APPROVED`.
* `APPROVED` después de `REJECTED`.
* Cancelación después de un pago aprobado.
* Pago aprobado después de cancelación.
* Preapproval cancelado mientras existe período pagado vigente.
* Pago de un período anterior después de una renovación posterior.

Analiza si el código tiene:

* Precedencia de estados.
* Timestamps del proveedor.
* Número de versión.
* Fecha de creación del evento.
* Último evento procesado.
* Reconciliación.

No propongas aceptar ciegamente el último evento recibido.

### 5. Atomicidad

Identifica todas las operaciones que escriben en más de uno de estos modelos:

* `Payment`.
* `Subscription`.
* `Tenant`.
* `AuditLog`.
* `Notification`.
* `EmailLog`.
* `PlatformSetting`.

Para cada operación indica:

* Si usa `$transaction`.
* Si la transacción es interactiva o de batch.
* Qué ocurre si falla en cada paso.
* Qué efectos externos ya se ejecutaron antes del fallo.
* Si un reintento corrige o duplica el efecto.
* Si existe riesgo de estado parcial.

### 6. Concurrencia

Analiza carreras entre:

* Dos webhooks iguales.
* Dos webhooks diferentes.
* Webhook y cron.
* Webhook y reactivación manual.
* Webhook y cancelación manual.
* Cambio de precio y renovación.
* Cambio de unidades y cobro.
* Desactivación de renovación y webhook.
* Dos renovaciones manuales.

Busca:

* `update` sin condición de estado.
* Read-modify-write.
* Cálculos basados en valores leídos previamente.
* Falta de bloqueos.
* Falta de versión optimista.
* Falta de constraints.
* Transacciones sin aislamiento suficiente.

### 7. Renovación simulada

Localiza todas las funciones y botones capaces de:

* Crear pagos `SIMULATED`.
* Marcar pagos como `APPROVED`.
* Extender licencias sin pago externo.
* Activar conjuntos manualmente.
* Otorgar cortesías.

Determina:

* Quién puede ejecutarlos.
* Si requieren motivo.
* Si registran auditoría.
* Si afectan MRR o métricas.
* Si parecen pagos reales en reportes.
* Si pueden utilizarse accidentalmente.
* Si deberían convertirse en una acción explícita de cortesía o override administrativo.

No elimines esta función todavía. Propón opciones.

### 8. Cron de mora

Revisa completamente:

* Selección de suscripciones vencidas.
* Cambio a gracia.
* Cambio a suspendida.
* Actualización del tenant.
* Notificaciones.
* Auditoría.
* Comportamiento ante ejecuciones duplicadas.
* Comportamiento si dos cron corren simultáneamente.
* Comportamiento si entra un pago durante la ejecución.
* Comparación de fechas.
* Zona horaria.
* Límites exactos de fecha.
* Valores nulos.

Determina si es idempotente y concurrency-safe.

### 9. Cambios pendientes de precio y unidades

Revisa:

* `pendingUnitsSnapshot`.
* `pendingPriceCents`.
* Actualización en Mercado Pago.
* Aplicación en renovación.
* Limpieza de campos pendientes.
* Duplicación de lógica.
* Fallos parciales entre proveedor y base local.
* Qué ocurre si el proveedor acepta y la base falla.
* Qué ocurre si la base cambia y el proveedor falla.
* Reconciliación posterior.

### 10. Cancelación

Analiza por separado:

* Cancelación manual.
* Desactivación de autorrenovación.
* Cancelación de preapproval.
* Webhook de cancelación.
* Estado `CANCELLED`.
* `cancelledAt`.
* Acceso durante un período ya pagado.
* Reembolsos.
* Reactivación posterior.

Determina si “cancelar renovación” y “cancelar licencia” están correctamente diferenciados.

### 11. HMAC y replay

Revisa:

* Construcción del manifiesto de firma.
* Timestamp.
* Validación del timestamp.
* Ventana de frescura.
* Replay.
* Request ID.
* Event ID.
* Topics desconocidos.
* Eventos sin entidad local.
* Respuestas 200 y 500.
* Persistencia del webhook recibido.

Distingue:

* Autenticidad.
* Idempotencia.
* Protección de replay.

No las trates como equivalentes.

### 12. Observabilidad

Determina si actualmente puede investigarse:

* Por qué una licencia fue extendida.
* Qué webhook produjo el cambio.
* Si el webhook fue duplicado.
* Qué payload o metadatos seguros llegaron.
* Qué estado existía antes.
* Qué estado quedó después.
* Qué actor manual intervino.
* Si una renovación fue simulada.
* Si el cron compitió con un webhook.

Analiza si hace falta:

* `WebhookEvent`.
* Ledger de eventos.
* Idempotency key.
* Historial de transición.
* Correlation ID.
* Logs estructurados.

No diseñes una infraestructura desproporcionada para un negocio operado por una persona.

### 13. Pruebas necesarias

Diseña una estrategia de pruebas sin ejecutarla.

Clasifica:

* Pruebas unitarias puras.
* Pruebas de servicio con Prisma contra base de test.
* Pruebas de integración de webhook con HTTP simulado.
* Pruebas de concurrencia.
* Pruebas de transición de estados.
* Pruebas de fechas.
* Pruebas de idempotencia.
* Pruebas de reconciliación.

Para cada prueba indica:

* Escenario.
* Estado inicial.
* Evento.
* Estado esperado.
* Efectos que no deben duplicarse.
* Necesidad de base de datos.
* Necesidad de mocks.

### 14. Diseño de corrección

Propón una solución mínima y robusta.

Debe considerar:

* Una fuente única para extender períodos.
* Idempotencia de efectos.
* Precedencia de estados.
* Transacciones.
* Concurrencia.
* Webhooks duplicados.
* Eventos fuera de orden.
* Cron.
* Cancelación.
* Renovaciones simuladas.
* Observabilidad mínima.
* Compatibilidad con registros existentes.
* Migraciones necesarias.
* Rollback.
* Implementación por subfases.

No propongas microservicios, colas externas o infraestructura compleja salvo que sea estrictamente necesaria.

## Entregables

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Archivos de facturación.
4. Mapa del flujo.
5. Máquina de estados real.
6. Idempotencia.
7. Eventos fuera de orden.
8. Atomicidad.
9. Concurrencia.
10. Renovación simulada.
11. Cron.
12. Precio y unidades pendientes.
13. Cancelación.
14. HMAC y replay.
15. Observabilidad.
16. Diferencias entre documentación y código.
17. Hallazgos clasificados.
18. Estrategia de pruebas.
19. Diseño propuesto.
20. Migraciones potenciales.
21. Orden recomendado de implementación.
22. Criterios de aceptación.
23. Riesgos restantes.
24. Veredicto sobre preparación actual:

* SEGURA PARA PRODUCCIÓN.
* SEGURA CON RIESGOS.
* REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.
* BLOQUEADA.

## Formato de hallazgos

Para cada hallazgo incluye:

* ID.
* Severidad.
* Archivo y símbolo.
* Comportamiento actual.
* Escenario de reproducción.
* Impacto financiero u operativo.
* Evidencia.
* Solución recomendada.
* Prueba requerida.
* Subfase sugerida.

## Criterios del plan

El plan debe:

* Separar bloqueantes de mejoras.
* Evitar un refactor general.
* Mantener compatibilidad con pagos existentes.
* Ser implementable por una sola persona.
* Permitir revisión independiente por Codex.
* Evitar cambios irreversibles.
* Incluir rollback.
* No depender de servicios nuevos innecesarios.

## Finalización

Detente después del diagnóstico y plan.

No modifiques código.

No generes migraciones.

No continúes con implementación.
