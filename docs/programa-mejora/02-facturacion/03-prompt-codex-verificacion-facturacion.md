# FASE 1B — VERIFICACIÓN INDEPENDIENTE DEL DIAGNÓSTICO DE FACTURACIÓN

## Instrucciones automáticas de documentación

Antes de comenzar la revisión:

1. Crea el archivo:

`docs/programa-mejora/02-facturacion/03-prompt-codex-verificacion-facturacion.md`

2. Guarda en ese archivo el contenido completo y exacto de este prompt.

Al terminar:

3. Crea el archivo:

`docs/programa-mejora/02-facturacion/04-respuesta-codex-verificacion-facturacion.md`

4. Guarda en ese archivo tu informe final completo, exactamente como lo entregas al usuario.

Estos dos archivos son los únicos que puedes crear o modificar durante esta sesión.

No modifiques código, configuración, migraciones ni otros documentos.

---

Actúa como revisor técnico independiente especializado en facturación SaaS, Mercado Pago, Prisma, PostgreSQL, webhooks, idempotencia, concurrencia y máquinas de estados.

Otro agente produjo un diagnóstico de facturación que debes intentar refutar y corregir.

## Documentos obligatorios

Lee:

* `docs/programa-mejora/02-facturacion/02-respuesta-claude-diagnostico-facturacion.md`
* `docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md`
* Los informes relevantes de `docs/programa-mejora/01-linea-base/`

La fuente de verdad es el código actual.

## Objetivo

Determinar:

1. Qué afirmaciones del diagnóstico de Claude son correctas.
2. Qué afirmaciones están exageradas, incompletas o equivocadas.
3. Si Mercado Pago está:

   * Solamente programado.
   * Configurable.
   * Configurado localmente.
   * Configurado para producción.
   * Desplegado.
   * Probado.
   * Operativo con pagos reales.
4. Cuáles riesgos bloquean realmente el lanzamiento.
5. Cuál debe ser el alcance mínimo de implementación.

## Restricciones

No debes:

* Modificar código.
* Crear migraciones.
* Aplicar migraciones.
* Ejecutar Prisma.
* Ejecutar `npm test`.
* Ejecutar build.
* Levantar el servidor.
* Conectarte a PostgreSQL.
* Llamar a Mercado Pago.
* Simular webhooks reales.
* Mostrar secretos.
* Cambiar variables de entorno.
* Hacer commit o push.

Puedes:

* Leer archivos.
* Buscar referencias.
* Ejecutar `git status`.
* Ejecutar `git diff`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Leer los nombres de variables de entorno sin revelar sus valores.

## Primera acción

1. Ejecuta `git status`.
2. Confirma que el código está limpio.
3. Identifica el commit actual.
4. Guarda este prompt en la ruta indicada.
5. Localiza todos los archivos de facturación.
6. No modifiques ningún archivo diferente a los dos documentos autorizados.

# 1. Estado real de Mercado Pago

Distingue explícitamente entre:

### Código existente

Verifica si realmente existen:

* Checkout.
* Preapproval.
* Webhook.
* Validación HMAC.
* Consulta de pagos.
* Actualización de monto.
* Cancelación de renovación.
* Variables de entorno.
* Botones o acciones de interfaz.
* Cron relacionado.

### Configuración

Verifica únicamente por nombres y estructura, sin revelar valores:

* Variables obligatorias.
* Variables opcionales.
* Fallbacks.
* Modo de prueba.
* Modo de producción.
* URLs de callback.
* URL pública del webhook.
* Dependencia de `NEXTAUTH_URL` o `APP_URL`.

### Operación real

Busca evidencia en el repositorio de:

* IDs reales de preapproval.
* Pagos reales.
* Logs o fixtures.
* Pruebas de sandbox.
* Pruebas de producción.
* Instrucciones de despliegue.
* Webhook configurado en Mercado Pago.
* Dominio público operativo.
* Evidencia de que un pago haya recorrido todo el flujo.

No muestres datos sensibles.

Clasifica el estado como:

* NO IMPLEMENTADO.
* IMPLEMENTADO PARCIALMENTE.
* IMPLEMENTADO EN CÓDIGO, NO CONFIGURADO.
* CONFIGURADO, NO VALIDADO.
* VALIDADO EN SANDBOX.
* OPERATIVO EN PRODUCCIÓN.
* NO DETERMINABLE DESDE EL REPOSITORIO.

No concluyas que está operativo solo porque existe código.

# 2. Reextensión por replay

Verifica directamente si:

1. El `Payment` se guarda mediante `upsert`.
2. El efecto sobre `currentPeriodEnd` ocurre aunque el pago ya existiera.
3. El mismo `mercadoPagoPaymentId` repetido puede aplicar nuevamente la extensión.
4. Una ejecución simultánea puede:

   * Extender dos veces.
   * Extender una vez.
   * Perder una actualización.
5. El resultado depende del aislamiento de PostgreSQL o de Prisma.

Reconstruye un ejemplo con fechas:

* Período actual.
* Primer webhook.
* Segundo webhook.
* Resultado final real según el código.

Determina la severidad correcta.

# 3. Pagos fuera de orden

Verifica:

* Si el mismo pago puede cambiar de `APPROVED` a `REJECTED` o `PENDING`.
* Si existe precedencia de estados.
* Si se usa la fecha del evento del proveedor.
* Si `lastWebhookAt` se consulta o solo se escribe.
* Si un pago viejo puede degradar una suscripción nueva.
* Si un rechazo del cobro actual debería o no enviar a gracia.
* Si existe alguna comprobación de período cubierto por un pago aprobado.

Distingue entre:

* Cambio de estado del mismo pago.
* Pagos distintos de períodos diferentes.
* Estado de preapproval.
* Estado de suscripción local.

# 4. Atomicidad

Revisa todas las escrituras de webhook.

Confirma si:

* `Payment`.
* `Subscription`.
* `Tenant`.
* `AuditLog`.

se actualizan en una sola transacción o mediante operaciones independientes.

Para cada fallo intermedio posible, explica el estado resultante:

1. Falla después de guardar `Payment`.
2. Falla después de actualizar `Subscription`.
3. Falla después de actualizar `Tenant`.
4. Falla al escribir auditoría.
5. Mercado Pago reintenta después del fallo.

Determina si el reintento repara o empeora el estado.

# 5. Concurrencia

Revisa específicamente:

### Dos webhooks iguales

* Procesados simultáneamente.
* Procesados secuencialmente.

### Webhook y cron

* El cron selecciona la suscripción como vencida.
* Entra un pago aprobado.
* El cron ejecuta el update después.

### Webhook y acción manual

* Reactivación.
* Suspensión.
* Cancelación.
* Cortesía.
* Renovación simulada.

Busca condiciones en el `where` que revaliden:

* Estado.
* Fecha.
* Versión.
* Período.
* Identidad del evento.

Determina qué carreras son demostrables y cuáles son solo teóricas.

# 6. Ledger de webhooks

Evalúa críticamente la propuesta de crear `WebhookEvent`.

Determina:

* Qué identificador único real entrega Mercado Pago.
* Si `x-request-id` es estable en reintentos.
* Si `data.id` identifica un evento o solamente la entidad.
* Si el mismo pago puede generar varios webhooks legítimos.
* Si usar únicamente `paymentId` impediría cambios legítimos de estado.
* Si una combinación de campos sería más adecuada.
* Qué ocurre si Mercado Pago no entrega un event ID estable.
* Qué información mínima debe almacenarse.
* Qué datos no deberían almacenarse por privacidad o seguridad.

No apruebes automáticamente el diseño de Claude.

Propón la clave idempotente mínima correcta según el código y la estructura real del webhook.

# 7. Frescura HMAC y replay

Verifica:

* Cómo se forma el manifiesto.
* Qué representa `ts`.
* Si se encuentra en segundos o milisegundos.
* Si existe validación de ventana.
* Qué tolerancia sería razonable.
* Qué ocurriría con retrasos legítimos de Mercado Pago.
* Si rechazar webhooks antiguos podría perder pagos reales.
* Si el ledger basta para replay aunque no se rechace por tiempo.

Distingue:

* Firma válida.
* Evento repetido.
* Evento antiguo.
* Evento fuera de orden.

# 8. Máquina de estados

Construye una matriz con:

* Estado actual.
* Evento.
* Nuevo estado actual.
* Nuevo estado recomendado.
* Justificación.

Incluye:

* TRIAL + pago aprobado.
* ACTIVE + pago aprobado.
* ACTIVE + pago pendiente.
* ACTIVE + pago rechazado.
* GRACE + pago aprobado.
* SUSPENDED + pago aprobado.
* CANCELLED + pago aprobado.
* ACTIVE + preapproval cancelado.
* ACTIVE + autorrenovación desactivada.
* Estado desconocido del proveedor.

Verifica si un estado desconocido se transforma actualmente en `GRACE_PERIOD`.

# 9. Cancelación

Distingue claramente:

1. Cancelar cobros futuros.
2. Cancelar la suscripción en Mercado Pago.
3. Cancelar la licencia local.
4. Bloquear acceso.
5. Mantener acceso hasta el final del período pagado.
6. Registrar churn.
7. Establecer `cancelledAt`.

Determina si la política actual del código coincide con la política legal publicada.

# 10. Pagos simulados y métricas

Verifica:

* Qué valores exactos tiene `provider`.
* Qué estados se asignan.
* Qué monto se guarda.
* Cómo se calcula MRR.
* Cómo se calculan ingresos del mes.
* Cómo se calcula ARPU.
* Si los pagos simulados aparecen en historial.
* Si las cortesías aparecen como ingresos.
* Si el botón “Renovar” existe realmente en interfaz productiva.
* Si requiere confirmación.
* Si requiere motivo.

Clasifica la funcionalidad como:

* Herramienta administrativa necesaria.
* Riesgo de operación.
* Código de desarrollo expuesto.
* Deuda técnica.
* Vulnerabilidad.

# 11. Cron de mora

Verifica:

* Si dos ejecuciones seguidas son idempotentes.
* Si dos ejecuciones simultáneas duplican notificaciones.
* Si un webhook puede ser pisado.
* Si se revalida el estado en el `updateMany`.
* Qué ocurre con `graceEndsAt=null`.
* Si el límite exacto de fecha está bien definido.
* Si Tenant y Subscription pueden divergir.

Propón el cambio mínimo, no una reescritura completa.

# 12. Precio y unidades pendientes

Confirma:

* Dónde se calcula el nuevo precio.
* Cuándo se envía a Mercado Pago.
* Cuándo se persiste localmente.
* Qué campos quedan pendientes.
* Cuándo se limpian.
* Qué lógica está duplicada.
* Si el revert actual puede fallar silenciosamente.
* Qué mecanismo mínimo de alerta o reconciliación sería suficiente para una empresa manejada por una persona.

# 13. Código muerto

Verifica si `createInitialSubscriptionForTenant`:

* No tiene callers.
* Está exportado.
* Podría ser invocado dinámicamente.
* Está cubierto por tests.
* Puede eliminarse sin afectar compatibilidad.

No recomiendes eliminarlo sin evidencia.

# 14. Pruebas propuestas

Evalúa la estrategia de Claude.

Determina:

* Qué pruebas pueden ser puras.
* Qué pruebas necesitan PostgreSQL.
* Qué pruebas necesitan mocks de `fetch`.
* Qué pruebas requieren concurrencia real.
* Si se puede probar el webhook sin Mercado Pago real.
* Si hace falta una librería de mocks o puede hacerse con Node nativo.
* Si las pruebas actuales están estructuradas para inyectar dependencias.
* Qué refactor mínimo permitiría probar sin sobrearquitectura.

Prioriza las pruebas necesarias para cerrar los bloqueantes.

# 15. Diseño mínimo recomendado

Propón un diseño final, pero mantenlo proporcional.

Evalúa si realmente se necesitan todos estos elementos:

* `WebhookEvent`.
* `lastProviderEventAt`.
* Campo `version`.
* Transacción interactiva.
* Compare-and-set.
* Timestamp de proveedor.
* Función única de extensión.
* Cambio del enum de Payment.
* Job de reconciliación.

Clasifica cada uno como:

* OBLIGATORIO ANTES DE PRODUCCIÓN.
* RECOMENDADO.
* OPCIONAL.
* INNECESARIO POR AHORA.

Evita:

* Microservicios.
* Colas.
* Kafka.
* Redis.
* Infraestructura externa nueva.
* Event sourcing completo.

# 16. Implementación por subfases

Propón lotes pequeños.

Como máximo:

### Subfase 1

Idempotencia y atomicidad.

### Subfase 2

Orden de eventos y concurrencia con cron.

### Subfase 3

Cancelación, pagos simulados y métricas.

### Subfase 4

Reconciliación y observabilidad adicional.

Para cada subfase incluye:

* Archivos.
* Migración.
* Pruebas.
* Riesgos.
* Criterios de aceptación.
* Rollback.

# Evaluación del diagnóstico de Claude

Crea una tabla con todas las afirmaciones principales:

* ID.
* Afirmación.
* Veredicto:

  * CONFIRMADA.
  * CONFIRMADA CON MATICES.
  * CONTRADICHA.
  * NO VERIFICABLE.
* Evidencia.
* Corrección necesaria.
* Confianza.

# Formato de hallazgos

Para cada hallazgo:

* ID.
* Severidad.
* Archivo y símbolo.
* Comportamiento.
* Escenario.
* Impacto.
* Evidencia.
* Corrección mínima.
* Prueba.
* ¿Bloquea producción?: Sí/No.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Estado real de Mercado Pago.
4. Evaluación del diagnóstico de Claude.
5. Reextensión por replay.
6. Eventos fuera de orden.
7. Atomicidad.
8. Concurrencia.
9. Ledger e idempotencia.
10. Firma y replay.
11. Máquina de estados.
12. Cancelación.
13. Pagos simulados.
14. Cron.
15. Precio y unidades.
16. Código muerto.
17. Estrategia de pruebas.
18. Diseño mínimo.
19. Subfases.
20. Hallazgos.
21. Riesgos aceptados.
22. Veredicto:

* DIAGNÓSTICO CONFIRMADO.
* DIAGNÓSTICO CONFIRMADO CON CORRECCIONES.
* DIAGNÓSTICO INSUFICIENTE.
* DIAGNÓSTICO INCORRECTO.

23. Preparación actual:

* SEGURA PARA PRODUCCIÓN.
* SEGURA CON RIESGOS.
* REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.
* NO IMPLEMENTADA OPERATIVAMENTE.

## Finalización

1. Guarda el informe completo en:

`docs/programa-mejora/02-facturacion/04-respuesta-codex-verificacion-facturacion.md`

2. Confirma en la respuesta final que ambos archivos `.md` fueron creados.

3. No implementes ninguna corrección.

4. Detente después del diagnóstico.
