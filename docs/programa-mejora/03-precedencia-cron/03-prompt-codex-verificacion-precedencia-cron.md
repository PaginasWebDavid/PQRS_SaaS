# FASE 2B — VERIFICACIÓN INDEPENDIENTE DE PRECEDENCIA Y SEGURIDAD DEL CRON

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/03-prompt-codex-verificacion-precedencia-cron.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/04-respuesta-codex-verificacion-precedencia-cron.md`

4. Guarda allí el informe final completo.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, schema, migraciones, pruebas ni configuración.

---

Actúa como revisor técnico independiente especializado en facturación recurrente, Mercado Pago, máquinas de estados, jobs concurrentes, Prisma y PostgreSQL.

Claude produjo un diagnóstico de eventos fuera de orden y seguridad del cron. Debes verificarlo adversarialmente contra el código actual.

## Documentos obligatorios

Lee:

* `docs/programa-mejora/03-precedencia-cron/02-respuesta-claude-diagnostico-precedencia-cron.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/programa-mejora/02-facturacion/24-respuesta-claude-commit-idempotencia-atomicidad.md`
* `docs/TESTING.md`

La fuente de verdad es el código posterior al commit:

`feat(billing): enforce idempotent atomic webhook effects`

## Objetivo

Determinar:

1. Qué hallazgos de Claude están confirmados.
2. Qué hallazgos necesitan matices o correcciones.
3. Cuál es el diseño mínimo realmente necesario.
4. Qué debe implementarse primero.
5. Qué puede aplazarse sin comprometer producción.

## Restricciones

No debes:

* Modificar código.
* Crear migraciones.
* Aplicar migraciones.
* Ejecutar `npm test`.
* Conectarte a PostgreSQL.
* Llamar a Mercado Pago.
* Ejecutar build.
* Levantar el servidor.
* Modificar `.env` o `.env.test`.
* Mostrar secretos.
* Hacer commit o push.

Puedes:

* Ejecutar `git status`.
* Ejecutar `git log -1`.
* Ejecutar `git diff`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Ejecutar pruebas puras existentes que no importen Prisma.
* Inspeccionar estáticamente el código y las pruebas.

## Primera acción

1. Guarda este prompt.
2. Ejecuta:

   * `git status --short`
   * `git log -1 --oneline`
3. Confirma que el working tree está limpio.
4. Confirma que el commit de facturación aprobado es `HEAD`.
5. Inspecciona:

   * `src/domains/billing/mercado-pago.service.ts`
   * `src/domains/billing/billing.service.ts`
   * `src/domains/platform/tenant-admin.service.ts`
   * `src/domains/notifications/notification.service.ts`
   * `src/domains/platform/audit.service.ts`
   * `prisma/schema.prisma`
   * Las pruebas de facturación existentes.

# 1. Evaluación completa del diagnóstico

Crea una tabla con cada hallazgo de Claude:

* F2-01 a F2-10.
* Veredicto:

  * CONFIRMADO.
  * CONFIRMADO CON MATICES.
  * CONTRADICHO.
  * NO VERIFICABLE.
* Evidencia.
* Severidad correcta.
* Corrección mínima.
* ¿Bloquea producción?

No aceptes automáticamente las severidades propuestas.

# 2. Rama no-APPROVED

Reconstruye exactamente el flujo cuando llega:

* `PENDING`.
* `REJECTED`.
* `CANCELLED`.
* Un estado desconocido.

Verifica:

* Cómo se normaliza el estado.
* Si `Payment.status` retrocede.
* Si se conserva `approvedEffectAppliedAt`.
* Si `Subscription` pasa a `GRACE_PERIOD`.
* Si `Tenant` también cambia.
* Si se consulta cobertura vigente.
* Qué auditoría y resultado de ledger quedan.
* Si el flujo es atómico.

Determina si todos los estados no aprobados deben tratarse igual o si deben diferenciarse.

# 3. Precedencia del mismo Payment

Evalúa la matriz:

| Estado actual | Estado entrante |
| ------------- | --------------- |
| PENDING       | PENDING         |
| PENDING       | APPROVED        |
| PENDING       | REJECTED        |
| REJECTED      | PENDING         |
| REJECTED      | APPROVED        |
| APPROVED      | PENDING         |
| APPROVED      | REJECTED        |
| APPROVED      | APPROVED        |

Para cada combinación indica:

* Cambio permitido de la fila.
* Cambio permitido de Subscription.
* Actualización de metadata.
* Resultado del ledger.
* Justificación.

Verifica si Mercado Pago puede legítimamente emitir:

* `REJECTED → APPROVED`.
* `APPROVED → REJECTED`.
* `APPROVED → CANCELLED`.

No dependas de memoria externa ni llames al proveedor. Limita la conclusión a lo que el código, tipos y payloads soportan. Cuando no sea determinable, indícalo.

# 4. Timestamp del proveedor

Inspecciona todos los campos disponibles en los tipos y respuestas normalizadas:

* `date_created`.
* `date_approved`.
* `date_last_updated`.
* Otros timestamps existentes.
* Timestamp del webhook.
* `receivedAt`.

Determina:

* Cuál representa creación del pago.
* Cuál representa aprobación.
* Cuál representa última actualización.
* Cuál puede faltar.
* Cuál se usa hoy.
* Cuál sería útil para precedencia.
* Si el código actual descarta algún campo relevante.
* Si el formato se parsea de manera segura.

No recomiendes `providerUpdatedAt` si el payload actual no entrega un valor suficientemente estable.

Propón fallback cuando no exista timestamp confiable.

# 5. Payments distintos y períodos distintos

Distingue claramente:

* Evento viejo del mismo Payment.
* Evento de un Payment antiguo distinto.
* Evento de un Payment nuevo.
* Pago aprobado sin período.
* Pago aprobado con período vencido.
* Pago aprobado en cuarentena.
* Pago SIMULATED.
* Cortesía administrativa.

Determina si la precedencia por timestamp del Payment basta o si también debe comprobarse cobertura y período.

# 6. Definición única de cobertura vigente

Revisa críticamente la propuesta de Claude.

Define al menos tres conceptos separados:

## Cobertura de acceso

Determina si el tenant debe conservar acceso ahora.

Puede incluir:

* Mercado Pago real.
* Renovación simulada administrativa.
* Cortesía.
* Trial.

## Cobertura pagada real

Determina si existe ingreso real confirmado.

Debe considerar `provider = MERCADO_PAGO`.

## Evidencia para reactivación manual

Determina qué evidencia exige la acción manual de activar.

No mezcles estos tres conceptos en una sola función si sus políticas son diferentes.

Evalúa si conviene crear:

* `hasCurrentAccessCoverage`.
* `hasCurrentRealPaymentCoverage`.
* `hasApprovedAppliedPayment`.

Para cada función define:

* Datos requeridos.
* Estados aceptados.
* Provider.
* `periodEnd`.
* `approvedEffectAppliedAt`.
* Cuarentena.
* Trial.
* Cortesías.
* Renovaciones simuladas.

Identifica todos los callers que deben usar cada definición.

# 7. Preapproval

Verifica por separado:

* `authorized`.
* `paused`.
* `cancelled`.
* `pending`.
* Estado desconocido.

Determina si `paused` debe:

* Llevar a gracia inmediatamente.
* Mantener acceso si existe período vigente.
* Solo desactivar renovación.
* Crear una alerta.

Determina si `cancelled` pertenece realmente a esta fase o debe permanecer en la fase de política de cancelación.

Evita implementar accidentalmente decisiones comerciales aún no aprobadas.

# 8. Estados desconocidos

Verifica si Claude tiene razón al decir que el default degrada.

Propón el comportamiento mínimo:

* No modificar Payment.status.
* Actualizar solo `rawStatus`.
* No modificar Subscription.
* No modificar Tenant.
* Ledger con resultado explícito.
* Auditoría.
* Reconciliación manual.

Determina si hace falta:

* `UNKNOWN_STATUS`.
* `IGNORED_BY_PRECEDENCE`.
* `STALE_EVENT`.
* Un único resultado genérico `IGNORED`.

Busca evitar crecimiento innecesario del enum.

# 9. Cron ACTIVE/TRIAL → GRACE

Reconstruye las consultas exactas.

Confirma si existe realmente la carrera:

1. Cron hace `findMany`.
2. Webhook aprueba y extiende.
3. Cron ejecuta `updateMany`.
4. Cron pisa el nuevo estado.

Evalúa el compare-and-set mínimo:

* `id`.
* Estado esperado.
* `currentPeriodEnd` esperado.
* `graceEndsAt`.
* Tenant.
* Otros campos.

Determina si usar igualdad exacta de DateTime es seguro con Prisma/PostgreSQL.

Analiza si debe procesarse:

* Por lote.
* Por suscripción individual.
* En una transacción por suscripción.
* En una sola transacción para todo el lote.

Prioriza simplicidad y bloqueo corto.

# 10. Cron GRACE → SUSPENDED

Verifica:

* Carrera con pago.
* Carrera con cortesía.
* Carrera con reactivación.
* Carrera con cancelación.
* `graceEndsAt = null`.

Evalúa las políticas para null:

1. Ignorar y alertar.
2. Normalizar a partir de `currentPeriodEnd`.
3. Normalizar a partir de `lastWebhookAt`.
4. Suspender inmediatamente.
5. Dar un nuevo período de gracia.

Elige la opción más segura para el cliente y para el negocio.

No asumas que una fila inconsistente debe suspenderse automáticamente.

# 11. Atomicidad del cron

Determina el diseño mínimo transaccional.

Evalúa estas alternativas:

## A. Transacción por suscripción

Dentro de una transacción:

* Releer Subscription.
* Verificar estado y fecha.
* Actualizar Subscription.
* Actualizar Tenant.
* Crear AuditLog.
* Crear Notification.

## B. Claim con updateMany y segunda transacción

* Claim condicional.
* Después actualizar Tenant/audit/notificación.

## C. Transacción por lote

* Muchas suscripciones en una sola transacción.

Para cada opción analiza:

* Atomicidad.
* Duración del lock.
* Complejidad.
* Facilidad de pruebas.
* Riesgo de fallos parciales.
* Escalabilidad razonable.

Recomienda una opción proporcional al tamaño actual.

# 12. Notificaciones idempotentes

Verifica si realmente es obligatorio cambiar schema ahora.

Evalúa:

## Opción A

`Notification.dedupeKey String? @unique`

## Opción B

Consultar antes de crear.

## Opción C

Crear una tabla de transiciones de licencia.

## Opción D

Solo notificar cuando el compare-and-set devuelve éxito.

Determina:

* Qué evita dos crons concurrentes.
* Qué evita reintentos posteriores.
* Qué evita correo duplicado.
* Qué ocurre si la notificación se crea pero el correo falla.
* Qué ocurre si el proceso muere después del commit.

Propón la clave mínima correcta y su estabilidad.

No incluyas valores temporales como `now` que hagan cada clave diferente.

# 13. Email

Revisa `sendEmailSafe` y `EmailLog`.

Determina:

* Si el envío ocurre después de persistir la transición.
* Si el fallo de email revierte algo.
* Si se registra fallo.
* Si existe reintento.
* Si dos cron pueden enviar dos veces.
* Si una dedupe key de Notification basta para deduplicar email.

Propón el mínimo antes de producción. No construyas una cola.

# 14. Acciones manuales

Revisa si realmente hace falta `Subscription.version` en esta fase.

Evalúa:

* Reactivación vs cron.
* Cortesía vs cron.
* Renovación simulada vs cron.
* Suspensión manual vs pago.
* Cancelación manual vs pago.

Determina si el compare-and-set del cron evita la mayoría de conflictos sin modificar las acciones manuales.

Clasifica `version` como:

* Obligatorio.
* Recomendado.
* Opcional.
* Innecesario.

# 15. Ledger y observabilidad

Determina el cambio mínimo al ledger:

* Nuevo enum.
* `ignoredReason` en metadata.
* `providerEventAt`.
* `previousStatus`.
* `nextStatus`.

Evalúa si una migración para columnas adicionales aporta valor real o si metadata es suficiente.

No hagas una migración únicamente por comodidad de consulta.

# 16. Migración mínima

Propón la migración mínima necesaria para cerrar las subfases bloqueantes.

Determina si debe incluir:

* `Payment.providerUpdatedAt`.
* `Subscription.lastProviderEventAt`.
* `Notification.dedupeKey`.
* Nuevos enums del ledger.
* `Subscription.version`.

Clasifica cada campo:

* INCLUIR AHORA.
* APLAZAR.
* NO NECESARIO.

Explica backfill, compatibilidad y rollback.

# 17. Estrategia de pruebas corregida

Evalúa las pruebas propuestas por Claude y entrega una matriz definitiva.

Incluye:

## Puras

* Precedencia.
* Estado desconocido.
* Cobertura de acceso.
* Cobertura pagada real.
* Decisión del cron.
* Dedupe key.
* Gracia null.

## Integración

* APPROVED no retrocede.
* Rechazo antiguo no degrada.
* Pago nuevo prevalece sobre cron.
* Cortesía prevalece sobre cron.
* Reactivación prevalece sobre cron.
* Dos cron producen una transición.
* Dos cron producen una notificación.
* Tenant y Subscription coherentes.
* Email fallido no revierte.
* Estado desconocido no degrada.

Para cada prueba indica exactamente qué modelos y campos debe verificar.

# 18. Orden final de implementación

Propón como máximo cuatro subfases pequeñas.

No agrupes demasiados cambios en una sola.

Para cada subfase incluye:

* Objetivo.
* Archivos.
* Migración.
* Pruebas.
* Criterios de aceptación.
* Riesgos.
* Rollback.

Indica cuál debe ejecutarse primero.

# Hallazgos

Para cada hallazgo incluye:

* ID.
* Severidad.
* Archivo y símbolo.
* Confirmación o corrección respecto a Claude.
* Impacto.
* Corrección mínima.
* Prueba.
* ¿Bloquea producción?

# Validaciones

Ejecuta:

```text
npx tsc --noEmit
npm run lint
```

No ejecutes integración.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Evaluación de F2-01 a F2-10.
4. Rama no-APPROVED.
5. Precedencia del mismo Payment.
6. Timestamps del proveedor.
7. Payments distintos.
8. Cobertura de acceso.
9. Cobertura pagada real.
10. Reactivación manual.
11. Preapproval.
12. Estados desconocidos.
13. Cron ACTIVE/TRIAL → GRACE.
14. Cron GRACE → SUSPENDED.
15. Atomicidad del cron.
16. Notificaciones.
17. Email.
18. Acciones manuales.
19. Ledger.
20. Migración mínima.
21. Pruebas.
22. Subfases.
23. Hallazgos.
24. Riesgos aceptados.
25. Veredicto:

* DIAGNÓSTICO CONFIRMADO.
* DIAGNÓSTICO CONFIRMADO CON CORRECCIONES.
* DIAGNÓSTICO INSUFICIENTE.
* DIAGNÓSTICO INCORRECTO.

26. Preparación:

* REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.
* SEGURA CON RIESGOS.
* SEGURA PARA PRODUCCIÓN.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/03-precedencia-cron/04-respuesta-codex-verificacion-precedencia-cron.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/03-precedencia-cron/03-prompt-codex-verificacion-precedencia-cron.md`

3. No implementes nada.

4. No hagas commit.

5. No continúes con cancelación, métricas o interfaz.

6. Detente después del informe.
