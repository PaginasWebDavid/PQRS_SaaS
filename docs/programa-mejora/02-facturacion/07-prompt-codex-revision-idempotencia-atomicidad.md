# FASE 1D — REVISIÓN INDEPENDIENTE DE IDEMPOTENCIA Y ATOMICIDAD

## Instrucciones automáticas de documentación

Antes de comenzar:

1. Crea:

`docs/programa-mejora/02-facturacion/07-prompt-codex-revision-idempotencia-atomicidad.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/02-facturacion/08-respuesta-codex-revision-idempotencia-atomicidad.md`

4. Guarda allí el informe final completo.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, schema, migraciones, configuración ni pruebas.

---

Actúa como revisor técnico independiente especializado en PostgreSQL, Prisma, concurrencia, migraciones compatibles, idempotencia económica y webhooks.

Claude implementó la primera subfase de integridad de facturación. Debes revisar adversarialmente el código y determinar si realmente corrige F1-01 y F1-04 sin introducir nuevos defectos.

## Documentos obligatorios

Lee:

* `docs/programa-mejora/02-facturacion/04-respuesta-codex-verificacion-facturacion.md`
* `docs/programa-mejora/02-facturacion/05-prompt-claude-implementacion-idempotencia-atomicidad.md`
* `docs/programa-mejora/02-facturacion/06-respuesta-claude-implementacion-idempotencia-atomicidad.md`
* `docs/TESTING.md`

La fuente de verdad es el código y el diff actual.

## Restricciones

Esta sesión es de solo lectura.

No debes:

* Modificar código.
* Corregir migraciones.
* Aplicar migraciones.
* Ejecutar Prisma contra una base.
* Ejecutar `npm test`.
* Ejecutar build.
* Levantar el servidor.
* Conectarte a PostgreSQL.
* Llamar a Mercado Pago.
* Instalar dependencias.
* Hacer commit o push.
* Mostrar secretos.

Puedes:

* Ejecutar `git status`.
* Ejecutar `git diff`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Ejecutar exclusivamente pruebas puras que no importen Prisma.
* Inspeccionar schema y SQL estáticamente.

## Primera acción

1. Guarda este prompt.
2. Ejecuta `git status`.
3. Inspecciona el diff completo.
4. Confirma que los cambios se limitan al alcance autorizado.
5. Revisa completamente:

   * `prisma/schema.prisma`
   * La nueva migración SQL.
   * `src/domains/billing/mercado-pago.service.ts`
   * `src/domains/billing/billing.service.ts`
   * `src/domains/billing/period.ts`
   * `src/domains/billing/webhook-metadata.ts`
   * `src/domains/platform/audit.service.ts`
   * `tests/unit/billing-period.test.ts`
   * `tests/billing-webhook-idempotency.test.ts`

# 1. Riesgo crítico de pagos históricos

Revisa específicamente esta sospecha:

La migración añade:

`Payment.approvedEffectAppliedAt DateTime?`

Todos los pagos existentes quedan inicialmente con `NULL`.

El código parece reclamar el efecto mediante:

* Payment con estado `APPROVED`.
* `approvedEffectAppliedAt: null`.
* `updateMany` condicional.

Determina qué ocurre si, después de desplegar la migración, Mercado Pago reenvía un webhook `APPROVED` correspondiente a un pago histórico que ya extendió una licencia antes de esta migración.

Reconstruye paso a paso:

1. Estado de la fila histórica.
2. Estado del marcador.
3. Upsert.
4. Update condicional.
5. Resultado sobre `currentPeriodEnd`.

Determina si la afirmación de Claude:

“Los pagos históricos no vuelven a extender”

es correcta o incorrecta.

Evalúa opciones de despliegue:

* Backfill de todos los pagos históricos `MERCADO_PAGO + APPROVED`.
* Backfill con `paidAt`.
* Backfill con `updatedAt`.
* Backfill condicionado a `periodStart/periodEnd`.
* Script previo de reconciliación.
* Migración SQL automática.
* Despliegue en dos pasos.
* Bloqueo temporal del webhook.

Analiza el riesgo contrario: marcar como aplicado un pago histórico cuyo efecto pudo haber fallado parcialmente.

Propón la estrategia más segura y mínima para datos existentes.

# 2. Garantía concurrente del marcador

Verifica si el patrón real garantiza una sola aplicación:

1. Dos transacciones procesan simultáneamente el mismo Payment.
2. Ambas ejecutan `upsert`.
3. Ambas intentan reclamar `approvedEffectAppliedAt`.
4. Una debe obtener `count = 1`.
5. La otra debe obtener `count = 0`.

Analiza:

* Restricción única de `mercadoPagoPaymentId`.
* Bloqueos de fila.
* Orden de operaciones.
* Aislamiento por defecto de PostgreSQL.
* Prisma `updateMany`.
* Posibles deadlocks.
* Posibles errores de unique durante upsert concurrente.
* Qué ocurre si una transacción hace rollback después de reclamar.
* Si el segundo intento puede reclamar después del rollback.
* Si un `APPROVED` repetido puede modificar metadata sin aplicar el efecto.

No aceptes únicamente la explicación del informe.

# 3. Transición PENDING → APPROVED

Confirma que:

* Un Payment creado inicialmente como `PENDING` conserva el marcador en `NULL`.
* Al llegar `APPROVED`, el upsert cambia el estado.
* El update condicional reclama el efecto.
* El período se extiende una sola vez.
* Un segundo `APPROVED` no lo vuelve a extender.

Busca algún orden de operaciones que impida el reclamo o produzca una extensión duplicada.

# 4. Atomicidad real

Confirma que estén dentro de la misma transacción:

* Payment.
* Marcador del efecto.
* Subscription.
* Tenant.
* AuditLog.
* Resultado final del WebhookEvent.

Busca cualquier función llamada desde la transacción que use accidentalmente el singleton global `prisma` en vez del cliente transaccional.

Revisa especialmente:

* `registerAuditLog`.
* Funciones para sincronizar Tenant.
* Funciones para calcular o aplicar términos.
* Consultas de Payment.
* Actualizaciones del ledger.

Para cada punto de fallo, determina el resultado:

1. Falla después del upsert.
2. Falla después de reclamar el marcador.
3. Falla después de actualizar Subscription.
4. Falla después de actualizar Tenant.
5. Falla al crear AuditLog.
6. Falla al actualizar WebhookEvent.
7. La transacción completa hace rollback.
8. Mercado Pago reintenta.

Determina si el reintento aplica exactamente una vez.

# 5. Ledger fuera y dentro de la transacción

Reconstruye el ciclo completo:

1. Firma.
2. Creación `RECEIVED`.
3. Consulta externa.
4. Transacción.
5. Cambio a `PROCESSED` o `DUPLICATE`.
6. Manejo de error.
7. Cambio a `FAILED`.

Evalúa:

* Si un fallo antes de crear el ledger deja el evento sin rastro.
* Si un fallo al consultar Mercado Pago deja correctamente `FAILED`.
* Si un rollback deja el ledger en `RECEIVED`.
* Si el catch puede actualizarlo a `FAILED`.
* Si un error al actualizar el ledger oculta el error original.
* Si una función de marcado usa el cliente correcto.
* Si varios webhooks iguales crean varias filas de ledger, como se diseñó.
* Si existe crecimiento ilimitado razonable o índices innecesarios.
* Si `requestId`, metadata y errores están sanitizados.

Confirma que el ledger no se utilice como única garantía del efecto económico.

# 6. Eventos sin dataId o topic soportado

El informe afirma que:

* Falta de `dataId` crea ledger `IGNORED`.
* Topic no soportado crea ledger `UNSUPPORTED_TOPIC`.
* Entidad no encontrada crea ledger `ENTITY_NOT_FOUND`.

Verifica que esto sea realmente posible con el schema:

* ¿Cómo se crea un WebhookEvent si `dataId` es obligatorio pero falta?
* ¿Se usa string vacío, placeholder o campo nullable?
* ¿Ese comportamiento es seguro y consultable?
* ¿Firma y manifest pueden validarse sin dataId?
* ¿Los topics desconocidos se registran antes de salir?

Clasifica cualquier inconsistencia.

# 7. Transacción del preapproval

Verifica:

* Qué lectura ocurre fuera de la transacción.
* Qué datos pueden quedar obsoletos antes de escribir.
* Que Subscription, Tenant y AuditLog utilicen el mismo cliente.
* Que WebhookEvent se actualice en la misma transacción.
* Qué ocurre si la suscripción desaparece o cambia entre lectura y escritura.
* Si la atomicidad local fue corregida aunque la precedencia siga fuera de alcance.

Distingue un defecto de atomicidad de un defecto de concurrencia posterior.

# 8. Fuente única del período

Comprueba que:

* Solo existe una constante `BILLING_PERIOD_DAYS`.
* El webhook y la renovación simulada utilizan `computeNextPeriod`.
* No queda otra lógica manual equivalente.
* El cálculo conserva el comportamiento anterior.
* Fechas vigentes encadenan desde `currentPeriodEnd`.
* Fechas vencidas comienzan desde `now`.
* Los términos pendientes se aplican y limpian una sola vez.
* El valor de moneda tiene fallback correcto.
* No existe mutación accidental de objetos de entrada.

# 9. Compatibilidad de la migración

Revisa la migración SQL:

* Orden de creación del enum.
* Orden de creación de tabla.
* Tipo y nombre de columnas.
* Defaults.
* Nullability.
* Índices.
* Comillas y nombres Prisma/PostgreSQL.
* Compatibilidad con el schema actual.
* Reversibilidad.
* Riesgo de bloqueo en una tabla Payment existente.
* Necesidad de backfill.
* Necesidad de índice sobre `approvedEffectAppliedAt`.
* Posibles relaciones ausentes.
* Riesgo de que `WebhookEvent.provider` permita valores inconsistentes.

No ejecutes la migración.

# 10. Generación del cliente Prisma

Claude informó un error transitorio `EPERM` durante `prisma generate`, pero afirma que los tipos quedaron actualizados.

Verifica:

* Si el repositorio rastrea el cliente generado.
* Si el código compila únicamente por archivos parcialmente generados.
* Si una instalación limpia podría generar correctamente.
* Si el `package-lock` cambió accidentalmente.
* Si existen archivos generados modificados o inconsistentes.
* Si el error debe considerarse bloqueante antes del commit.

No vuelvas a ejecutar Prisma.

# 11. Pruebas de integración

Lee completamente:

`tests/billing-webhook-idempotency.test.ts`

Confirma:

* Que realmente prueba el servicio modificado.
* Que el mock de fetch coincide con las respuestas esperadas.
* Que la firma HMAC es coherente con producción.
* Que las aserciones verifican períodos, marcador, Tenant, AuditLog y ledger.
* Que las pruebas limpian sus datos.
* Que no dependen del orden de ejecución.
* Que usan identificadores únicos.
* Que pueden correr concurrentemente.
* Que no contienen skips injustificados.

Clasifica cada escenario:

* Implementado y ejecutable.
* Implementado pero incompleto.
* Marcado `skip`.
* Ausente.

Claude afirma que existen 12 escenarios, pero que cuatro escenarios de rollback están en `skip`.

Determina si una subfase que exige atomicidad puede aprobarse sin ejecutar ni implementar completamente esas pruebas.

# 12. Seam de inyección de fallos

Evalúa si realmente hace falta dejar para otra subfase el mecanismo mínimo que permita probar rollback.

La fase solicitó expresamente:

* Fallo antes de actualizar Subscription.
* Fallo antes de actualizar Tenant.
* Fallo de auditoría.
* Reintento después de rollback.

Determina si:

* Debió implementarse en esta fase.
* Puede añadirse sin contaminar producción.
* Puede probarse mediante mocks de Prisma.
* Puede probarse provocando un constraint real.
* Debe considerarse bloqueante para aprobar F1-04.

No implementes nada; solo evalúa.

# 13. Pruebas puras

Antes de ejecutar, confirma que no importan Prisma.

Ejecuta, si es seguro:

```text
npx tsx --test tests/unit/billing-period.test.ts
npx tsx --test tests/unit/*.test.ts
```

Confirma:

* Número de pruebas.
* Resultado.
* Cobertura real.
* Si metadata y protección de secretos tienen aserciones suficientes.

# 14. Validaciones generales

Ejecuta:

```text
npx tsc --noEmit
npm run lint
```

No ejecutes otras pruebas.

# 15. Alcance del diff

Confirma que no se modificó:

* Cron.
* Precedencia definitiva.
* Cancelación.
* Métricas.
* UI.
* Legal.
* Autenticación.
* Storage.
* Soporte.
* Schema no relacionado con billing.

Clasifica cualquier cambio fuera de alcance.

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
* ¿Bloquea el commit?: Sí/No.
* ¿Bloquea la siguiente subfase?: Sí/No.

# Criterios para aprobar

La implementación puede aprobarse únicamente si:

1. Pagos nuevos APPROVED aplican el efecto una vez.
2. Pagos repetidos no lo reaplican.
3. PENDING → APPROVED funciona.
4. Concurrencia reclama un solo efecto.
5. Rollback revierte marcador y efecto.
6. Reintento después de rollback funciona.
7. La migración trata correctamente los pagos históricos o existe un plan de despliegue seguro y obligatorio.
8. No existen escapes del cliente transaccional.
9. Ledger y efecto están correctamente separados.
10. La migración es válida y aditiva.
11. Typecheck, lint y pruebas puras pasan.
12. Las pruebas de integración son suficientes para validar después contra una base dedicada.
13. No hay hallazgos críticos o altos abiertos dentro del alcance.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Pagos históricos.
5. Garantía concurrente.
6. PENDING → APPROVED.
7. Atomicidad real.
8. Ledger.
9. Casos sin dataId y topic desconocido.
10. Preapproval.
11. Fuente única del período.
12. Migración.
13. Cliente Prisma.
14. Pruebas de integración.
15. Pruebas de rollback.
16. Pruebas puras.
17. Typecheck y lint.
18. Hallazgos.
19. Correcciones obligatorias.
20. Riesgos aceptados.
21. Recomendación sobre commit.
22. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe completo en:

`docs/programa-mejora/02-facturacion/08-respuesta-codex-revision-idempotencia-atomicidad.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/02-facturacion/07-prompt-codex-revision-idempotencia-atomicidad.md`

3. No modifiques código.

4. No hagas commit.

5. No continúes con cron o precedencia.

6. Detente después del informe.
