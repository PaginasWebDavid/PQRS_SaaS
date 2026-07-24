# FASE 1C — IMPLEMENTACIÓN DE IDEMPOTENCIA Y ATOMICIDAD DE FACTURACIÓN

## Instrucciones automáticas de documentación

Antes de analizar o modificar código:

1. Crea el archivo:

`docs/programa-mejora/02-facturacion/05-prompt-claude-implementacion-idempotencia-atomicidad.md`

2. Guarda en ese archivo el contenido completo y exacto de este prompt.

Al terminar:

3. Crea el archivo:

`docs/programa-mejora/02-facturacion/06-respuesta-claude-implementacion-idempotencia-atomicidad.md`

4. Guarda en ese archivo tu informe final completo, exactamente como lo entregas al usuario.

Los archivos de documentación anteriores no deben modificarse.

---

Actúa como ingeniero principal especializado en sistemas de facturación SaaS, Prisma, PostgreSQL, Mercado Pago, transacciones e idempotencia.

Debes implementar la primera subfase bloqueante de facturación de PQRS Services.

## Documentos obligatorios

Lee antes de modificar:

* `docs/programa-mejora/02-facturacion/02-respuesta-claude-diagnostico-facturacion.md`
* `docs/programa-mejora/02-facturacion/04-respuesta-codex-verificacion-facturacion.md`
* `docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md`
* `docs/TESTING.md`

La fuente de verdad técnica es el código actual.

## Objetivo único

Corregir:

* F1-01: un pago APPROVED repetido vuelve a extender la licencia.
* F1-04: Payment, Subscription, Tenant y AuditLog no se actualizan atómicamente.
* La parte estructural de F1-08/F1-12: ausencia de ledger mínimo y trazabilidad de entregas.
* La parte necesaria de F1-07: duplicación del cálculo de período y términos efectivos.

Esta fase debe garantizar que:

1. Cada pago de Mercado Pago pueda aplicar el efecto económico APPROVED una sola vez.
2. `PENDING → APPROVED` continúe siendo una transición válida.
3. Un `APPROVED` repetido no vuelva a extender el período.
4. La fila `Payment`, el efecto económico, `Subscription`, `Tenant` y `AuditLog` se actualicen dentro de una transacción coherente.
5. Las entregas de webhook queden registradas con metadata segura.
6. Exista una única función de dominio para calcular el siguiente período y resolver términos pendientes.

## Fuera de alcance

No implementes todavía:

* Precedencia completa de eventos fuera de orden.
* Corrección definitiva de `APPROVED → REJECTED`.
* Carreras entre cron y webhook.
* Cambios en el cron de mora.
* Ventana temporal HMAC.
* Cambio de política de cancelación.
* Exclusión de pagos simulados de métricas.
* Reconciliación Mercado Pago ↔ base local.
* Cambios de interfaz.
* Cambios legales.
* Nuevos proveedores de pago.
* Colas, Redis, Kafka o microservicios.

No intentes declarar la facturación lista para producción al terminar esta fase. Todavía quedarán bloqueantes posteriores.

## Restricciones

No debes:

* Llamar a Mercado Pago real.
* Conectarte deliberadamente a producción.
* Mostrar secretos.
* Aplicar migraciones.
* Ejecutar seeds.
* Ejecutar Prisma Studio.
* Ejecutar build.
* Hacer commit.
* Hacer push.
* Modificar variables reales.
* Eliminar datos existentes.
* Crear una migración destructiva.
* Modificar los documentos de fases anteriores.

Puedes:

* Modificar schema, servicios y pruebas de facturación.
* Crear una migración SQL aditiva sin aplicarla.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Ejecutar pruebas puras.
* Ejecutar pruebas de base de datos solamente si existe una `.env.test` segura, dedicada y validada por el sistema construido en la Fase 0.
* Usar mocks locales de `fetch`.
* Ejecutar `npm test` exclusivamente si el runner seguro acepta la configuración y la base es claramente de pruebas.

Si no existe una base dedicada, no intentes crearla ni reutilices la normal. Añade las pruebas y documenta que su ejecución queda pendiente.

## Primera acción obligatoria

1. Ejecuta `git status`.
2. Identifica el commit actual.
3. Confirma que no existen cambios de código pendientes.
4. Comprueba qué documentos de esta fase ya están sin trackear.
5. Guarda este prompt en la ruta indicada.
6. Inspecciona:

   * `prisma/schema.prisma`
   * Todas las migraciones de billing.
   * `src/domains/billing/mercado-pago.service.ts`
   * `src/domains/billing/billing.service.ts`
   * `src/domains/organizations/tenant-admin.service.ts`
   * `src/domains/platform/audit.service.ts`
   * La ruta del webhook.
   * Las pruebas actuales.
7. Entrega un diagnóstico técnico breve antes de editar.

# Principio 1 — Separar entrega de webhook y efecto económico

No trates como equivalentes:

* La entrega HTTP recibida.
* La entidad de Mercado Pago.
* El estado del Payment.
* El efecto económico que extiende una licencia.

Debes implementar dos conceptos separados:

## Ledger de entregas

Debe registrar que una solicitud de webhook fue recibida y cuál fue su resultado.

## Idempotencia del efecto

Debe impedir que el mismo Payment APPROVED extienda la licencia más de una vez.

No uses como única clave económica:

* `x-request-id`.
* `data.id`.
* La firma HMAC.
* El timestamp de recepción.
* El ID de una entrega HTTP.

El efecto económico debe relacionarse con el pago de Mercado Pago y el tipo de efecto aplicado.

# Principio 2 — Modelo de ledger

Añade un modelo aditivo, por ejemplo `WebhookEvent`, o un nombre coherente con el proyecto.

Debe almacenar como mínimo:

* `id`.
* `provider`.
* `topic`.
* `dataId`.
* `requestId` nullable.
* Una clave de entrega o hash seguro, si resulta útil.
* `rawStatus` nullable.
* `tenantId` nullable.
* `subscriptionId` nullable.
* `receivedAt`.
* `processedAt` nullable.
* `result`.
* `errorCode` o error seguro nullable.
* `metadata` JSON nullable y sanitizada.
* Relaciones e índices razonables.

No almacenes:

* Token de Mercado Pago.
* Firma completa si no es necesaria.
* Datos de tarjeta.
* Credenciales.
* Payload completo sin justificación.
* Información personal innecesaria.

El ledger debe poder registrar:

* Recibido.
* Procesado.
* Duplicado.
* Ignorado.
* Fallido.
* Entidad no encontrada.
* Topic no soportado.

No necesitas construir una interfaz para consultarlo en esta fase.

# Principio 3 — Clave única del efecto económico

Implementa una garantía persistente para que un Payment APPROVED aplique la extensión una sola vez.

Puedes elegir uno de estos diseños:

## Alternativa A — Tabla de efectos

Modelo como `PaymentEffect` con una restricción única equivalente a:

* Provider.
* ID externo del pago.
* Tipo de efecto.

Ejemplo conceptual:

`MERCADO_PAGO + paymentId + PERIOD_EXTENSION_APPROVED`

## Alternativa B — Marcador atómico en Payment

Campo como:

* `approvedEffectAppliedAt`.
* `periodExtensionAppliedAt`.
* Un identificador equivalente.

Debe reclamarse mediante una actualización condicional atómica.

## Elección

Selecciona la alternativa mínima y más robusta para el schema actual.

Debes justificarla en el informe.

La garantía debe estar respaldada por PostgreSQL mediante:

* Restricción única.
* Actualización condicional.
* `createMany(..., skipDuplicates: true)`.
* Compare-and-set equivalente.

No confíes únicamente en:

```typescript
if (!paymentExists) {
  // aplicar efecto
}
```

Ese patrón falla ante concurrencia.

# Principio 4 — Transacción del efecto económico

La aplicación local de un Payment debe usar una transacción interactiva.

Dentro de la misma transacción deben quedar coherentes:

1. `Payment`.
2. Reclamación del efecto económico.
3. `Subscription`.
4. `Tenant`.
5. `AuditLog`.
6. Estado final del registro de webhook cuando sea técnicamente razonable.

## APPROVED nuevo

Si el efecto económico no fue aplicado:

* Actualiza o crea `Payment`.
* Reclama el efecto.
* Calcula el siguiente período.
* Aplica términos pendientes.
* Actualiza `Subscription`.
* Sincroniza `Tenant`.
* Registra auditoría.
* Marca el evento como procesado.

## APPROVED repetido

Si el efecto ya fue aplicado:

* Puede actualizar metadata no económica del `Payment`.
* No cambia `currentPeriodStart`.
* No cambia `currentPeriodEnd`.
* No vuelve a aplicar términos pendientes.
* No crea otro efecto.
* Registra el webhook como duplicado o efecto omitido.
* No responde con error.

## PENDING → APPROVED

Debe:

* Actualizar el estado del `Payment`.
* Reclamar el efecto una sola vez.
* Extender el período una sola vez.

## Fallo intermedio

La transacción debe hacer rollback de:

* Payment.
* Efecto.
* Subscription.
* Tenant.
* Auditoría relacionada con el efecto.

Un reintento posterior debe poder aplicar todo correctamente una sola vez.

# Principio 5 — Operaciones externas fuera de la transacción

Las llamadas HTTP a Mercado Pago no deben mantenerse abiertas dentro de una transacción PostgreSQL larga.

Orden recomendado:

1. Validar firma.
2. Registrar recepción mínima del webhook.
3. Consultar a Mercado Pago fuera de la transacción.
4. Validar y normalizar la respuesta.
5. Ejecutar una transacción corta para aplicar el estado local.
6. Marcar el ledger como procesado o fallido.

Si falla la consulta externa:

* No debe crearse un efecto económico.
* El ledger debe registrar el fallo de forma segura.
* La ruta puede devolver el código que corresponda a la política existente.
* No se deben guardar secretos ni cuerpos completos.

# Principio 6 — Fuente única del período

Extrae una función pura compartida para calcular el siguiente período.

Debe recibir de forma explícita:

* `currentPeriodEnd`.
* `now`.
* Duración del período.
* Términos pendientes necesarios.

Debe devolver sin efectos secundarios:

* `periodStart`.
* `periodEnd`.
* Precio efectivo.
* Unidades efectivas.
* Campos pendientes que deben limpiarse.

Debe existir una sola constante de duración del período.

El webhook y la renovación simulada deben consumir la misma función pura cuando corresponda.

No cambies todavía el comportamiento comercial de la renovación simulada; solo evita duplicar la lógica.

# Principio 7 — Auditoría compatible con transacciones

Revisa `registerAuditLog`.

Si actualmente siempre usa el singleton global de Prisma, adapta la implementación de manera mínima para que pueda:

* Recibir un cliente transaccional opcional.
* Mantener compatibilidad con todos los callers actuales.
* Crear la auditoría dentro de la transacción del webhook.

No hagas un refactor general del sistema de auditoría.

Metadata mínima recomendada:

* Provider.
* Topic.
* Payment ID externo.
* Resultado.
* Estado anterior.
* Estado posterior.
* Período anterior.
* Período posterior.
* Si el efecto fue aplicado o ya existía.

No guardes payloads sensibles.

# Principio 8 — Webhook de preapproval

También corrige la atomicidad local del webhook de preapproval:

* `Subscription`.
* `Tenant`.
* `AuditLog`.

Deben quedar dentro de una transacción local coherente.

No implementes todavía la precedencia definitiva de estados.

No cambies la política actual salvo que sea estrictamente necesario para usar la transacción.

# Migración

Crea una migración aditiva sin aplicarla.

Requisitos:

* Nuevas tablas o columnas nullable/default.
* Índices y constraints necesarios.
* Sin eliminar columnas.
* Sin cambiar valores históricos.
* Sin modificar Payments existentes.
* Compatible con PostgreSQL.
* Con comentarios o documentación de rollback en el informe.

No ejecutes:

```text
prisma migrate deploy
prisma db push
prisma migrate dev
```

# Pruebas obligatorias

## Pruebas puras

Crea pruebas para:

1. Cálculo de período con fecha vencida.
2. Cálculo de período con período vigente.
3. Aplicación de términos pendientes.
4. Limpieza de campos pendientes.
5. Construcción segura de metadata.
6. Clave del efecto económico.
7. No exposición de secretos.

Estas pruebas no deben importar Prisma.

## Pruebas de integración con base dedicada

Añade pruebas para:

1. Payment APPROVED nuevo extiende una vez.
2. El mismo Payment APPROVED dos veces extiende una vez.
3. Payment PENDING y luego APPROVED extiende una vez.
4. Dos intentos simultáneos del mismo APPROVED producen un solo efecto.
5. Fallo antes de actualizar Subscription produce rollback.
6. Fallo antes de actualizar Tenant produce rollback.
7. Fallo de auditoría produce rollback del efecto.
8. Reintento después de rollback aplica una vez.
9. El ledger registra procesado.
10. El ledger registra duplicado.
11. Preapproval actualiza Tenant y Subscription atómicamente.
12. Los términos pendientes se aplican y limpian una sola vez.

No llames a Mercado Pago real.

Usa:

* Fixtures locales.
* Mock de `fetch`.
* Inyección mínima del cliente HTTP si hace falta.

No introduzcas una librería pesada si Node nativo es suficiente.

## Ejecución de pruebas

Antes de `npm test`, confirma:

* Existe `.env.test`.
* `TEST_DATABASE_URL` es distinta de `DATABASE_URL`.
* El guard seguro la acepta.
* La base es dedicada a pruebas.
* No se heredará `DIRECT_URL` normal.

Si no puede verificarse, no ejecutes `npm test`.

Ejecuta siempre que sea seguro:

```text
npx tsc --noEmit
npm run lint
```

Ejecuta las pruebas puras específicas.

# Archivos permitidos

Puedes modificar o crear únicamente archivos relacionados con esta fase, como:

* `prisma/schema.prisma`
* Una nueva migración aditiva.
* `src/domains/billing/mercado-pago.service.ts`
* `src/domains/billing/billing.service.ts`
* Un nuevo módulo puro de períodos o efectos.
* `src/domains/platform/audit.service.ts`
* La ruta del webhook, solo si es necesario.
* Pruebas de facturación.
* Los dos documentos automáticos de esta fase.

Si necesitas modificar otro archivo, justifícalo antes en el informe.

# Criterios de aceptación

La fase se considera implementada si:

1. El mismo Payment APPROVED no extiende dos veces.
2. PENDING → APPROVED sigue funcionando.
3. Dos procesamientos concurrentes producen un solo efecto.
4. Existe garantía persistente de idempotencia.
5. Payment, efecto, Subscription, Tenant y AuditLog son atómicos.
6. Un fallo produce rollback completo.
7. Un reintento posterior puede procesarse correctamente.
8. El ledger registra recepción y resultado.
9. El ledger no se utiliza como única garantía económica.
10. No se usa `x-request-id` ni `data.id` como única clave del efecto.
11. Existe una sola función de cálculo de período.
12. El webhook de preapproval sincroniza localmente dentro de transacción.
13. La migración es aditiva.
14. No se llama a Mercado Pago real.
15. Typecheck y lint pasan.
16. Las pruebas puras pasan.
17. Las pruebas de integración se añaden.
18. La ejecución de integración solo ocurre con base dedicada.
19. No se toca lógica fuera del alcance.
20. No se hace commit.

# Informe final obligatorio

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git.
3. Diagnóstico previo a cambios.
4. Diseño de idempotencia elegido.
5. Diferencia entre ledger y efecto económico.
6. Schema y migración.
7. Flujo del webhook después del cambio.
8. Transacción de Payment.
9. Transacción de preapproval.
10. Fuente única del período.
11. Cambios de auditoría.
12. Archivos modificados.
13. Pruebas puras.
14. Pruebas de integración.
15. Comandos ejecutados.
16. Resultados.
17. Validaciones no realizadas.
18. Diff resumido.
19. Compatibilidad con datos existentes.
20. Rollback.
21. Riesgos restantes.
22. Elementos expresamente fuera de alcance.
23. Respuesta individual a F1-01, F1-04, F1-07, F1-08 y F1-12.
24. Estado:

* IMPLEMENTADO.
* IMPLEMENTADO CON RIESGOS.
* BLOQUEADO.

## Finalización

1. Guarda el informe completo en:

`docs/programa-mejora/02-facturacion/06-respuesta-claude-implementacion-idempotencia-atomicidad.md`

2. Confirma que el prompt fue guardado en:

`docs/programa-mejora/02-facturacion/05-prompt-claude-implementacion-idempotencia-atomicidad.md`

3. No hagas commit.

4. No continúes con cron, precedencia, cancelación ni métricas.

5. Detente después del informe.
