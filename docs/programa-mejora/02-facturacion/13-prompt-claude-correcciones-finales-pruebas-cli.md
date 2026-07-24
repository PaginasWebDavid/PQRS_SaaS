+# FASE 1G — CORRECCIONES FINALES DE PRUEBAS Y CLI DE RECONCILIACIÓN

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/02-facturacion/13-prompt-claude-correcciones-finales-pruebas-cli.md`

2. Guarda en ese archivo el contenido completo y exacto de este prompt.

Al finalizar:

3. Crea:

`docs/programa-mejora/02-facturacion/14-respuesta-claude-correcciones-finales-pruebas-cli.md`

4. Guarda allí el informe final completo.

No modifiques documentos anteriores.

---

Actúa como ingeniero principal especializado en Prisma, PostgreSQL, pruebas de atomicidad y herramientas administrativas seguras.

Debes corregir únicamente los hallazgos F1F-01 a F1F-04 señalados por Codex.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/02-facturacion/10-respuesta-claude-correcciones-historicas-rollback.md`
* `docs/programa-mejora/02-facturacion/12-respuesta-codex-aprobacion-cuarentena-rollback.md`
* `docs/TESTING.md`

La fuente de verdad es el código y el diff actual.

## Objetivos

Corregir:

* F1F-01: aserciones incompletas en pruebas de rollback e históricas.
* F1F-02: evidencia de auditoría incorrecta en el modo `list` del CLI.
* F1F-03: reforzar la confirmación de escrituras en producción.
* F1F-04: documentar correctamente el rollback no simétrico del enum PostgreSQL.

No cambies el diseño de idempotencia, cuarentena o transacciones salvo que sea estrictamente necesario para estas correcciones.

## Restricciones

No debes:

* Aplicar migraciones.
* Conectarte a producción.
* Ejecutar `npm test`.
* Ejecutar pruebas que importen Prisma.
* Ejecutar build.
* Levantar servidor.
* Llamar a Mercado Pago.
* Ejecutar el CLI contra una base.
* Modificar variables reales.
* Hacer commit o push.
* Continuar con cron, precedencia, cancelación o métricas.

Puedes:

* Modificar pruebas.
* Modificar el CLI y el módulo de reconciliación.
* Añadir helpers puros o funciones internas testables.
* Ajustar comentarios de migración y documentación.
* Ejecutar typecheck, lint y pruebas puras.

## Primera acción

1. Ejecuta `git status`.
2. Guarda este prompt.
3. Confirma que la migración sigue sin aplicarse.
4. Revisa:

   * `tests/billing-webhook-idempotency.test.ts`
   * `scripts/reconcile-historical-payment-effects.ts`
   * `src/domains/billing/reconciliation.ts`
   * `src/domains/billing/mercado-pago.service.ts`
   * `src/domains/platform/audit.service.ts`
   * La migración actual.
5. Confirma directamente los cuatro hallazgos antes de editar.

# 1. Completar las aserciones de rollback

Revisa la función compartida `assertRollback` y los escenarios 5–8.

En cada escenario de rollback debe verificarse explícitamente, según el estado inicial esperado:

## Payment

* Si la fila no existía antes de la transacción fallida:

  * La fila no debe existir después del rollback.
* Si la fila sí existía:

  * Debe conservar su estado anterior.
  * `approvedEffectAppliedAt` debe permanecer `NULL`.
  * `approvedEffectReconciliationRequired` debe conservar el valor anterior.
  * `periodStart` debe conservar el valor anterior.
  * `periodEnd` debe conservar el valor anterior.
  * `status` debe conservar el estado anterior.
  * `paidAt` no debe quedar parcialmente modificado si formaba parte del cambio transaccional.

No uses una aserción ambigua que acepte indistintamente fila inexistente o fila parcialmente creada. Cada escenario debe declarar qué se esperaba antes del fallo.

## Subscription

Verifica:

* `currentPeriodStart`.
* `currentPeriodEnd`.
* `status`.
* `graceEndsAt`.
* Términos pendientes.
* Campos pendientes que no debían limpiarse.

## Tenant

Verifica:

* `status`.
* Que no haya reactivación parcial.
* Que no diverja de Subscription.

## AuditLog

Verifica:

* No existe auditoría económica parcial para la entrega fallida.
* No existe más de una auditoría tras el reintento exitoso.

## WebhookEvent

Verifica:

* La entrega fallida termina en `FAILED`.
* El reintento crea o finaliza su propia entrega como `PROCESSED`.
* No se clasifica erróneamente como `DUPLICATE`.
* Los resultados corresponden a cada request ID.

## Reintento del escenario 8

Después del reintento exitoso verifica:

* Existe una única fila Payment.
* `Payment.status = APPROVED`.
* `approvedEffectAppliedAt` no es nulo.
* `approvedEffectReconciliationRequired = false`.
* `Payment.periodStart` coincide con `Subscription.currentPeriodStart`.
* `Payment.periodEnd` coincide con `Subscription.currentPeriodEnd`.
* Subscription queda `ACTIVE`.
* Tenant queda `ACTIVE`.
* Se añadió exactamente un período.
* Existe exactamente una auditoría económica exitosa.
* Existe una entrega `FAILED` y una `PROCESSED`.
* No existe una entrega `DUPLICATE` para este escenario.
* No se limpiaron términos pendientes más de una vez.

# 2. Completar las pruebas históricas

Amplía el escenario de pago histórico en cuarentena para verificar:

* `Payment.periodStart` sin cambios.
* `Payment.periodEnd` sin cambios.
* `Subscription.currentPeriodStart` sin cambios.
* `Subscription.currentPeriodEnd` sin cambios.
* `Subscription.status` sin cambios.
* `Tenant.status` sin cambios.
* Los términos pendientes no se limpian.
* `approvedEffectAppliedAt` permanece nulo.
* `approvedEffectReconciliationRequired` permanece verdadero.
* Ledger `RECONCILIATION_REQUIRED`.
* Auditoría indica reconciliación requerida y no efecto aplicado.

En el escenario de pago reconciliado verifica además:

* El replay queda `DUPLICATE`.
* No cambia Payment ni Subscription.
* No crea una segunda auditoría económica.
* No reactiva Tenant.

En el escenario de pago nuevo verifica:

* Nace con cuarentena falsa.
* El upsert posterior no altera ese indicador accidentalmente.

No debe quedar ningún `skip`.

# 3. Corregir evidencia de auditoría del CLI

Actualmente el CLI busca:

`AuditLog.targetId = tenantId`

pero el webhook registra:

`AuditLog.targetId = subscriptionId`

La evidencia debe corresponder al pago específico, no solo al conjunto.

## Diseño mínimo

Implementa una función interna testable, por ejemplo:

`findPaymentAuditEvidence(client, payment)`

Debe:

1. Utilizar el `subscriptionId` del pago.
2. Consultar únicamente acciones de facturación relevantes.
3. Confirmar que la metadata de auditoría corresponde al ID externo del pago.
4. No considerar como evidencia una auditoría de otro pago de la misma suscripción.
5. Retornar:

   * Cantidad de evidencias.
   * Tipos de evidencia.
   * Fecha más reciente.
   * Sin payload ni secretos.

La auditoría creada por el webhook contiene metadata del payment ID externo. Utiliza esa metadata como parte de la comparación.

Si Prisma no permite filtrar la estructura JSON de forma portable:

* Consulta las auditorías candidatas por `targetId = subscriptionId` y acción.
* Filtra en memoria mediante un helper puro y estricto.
* No uses `tenantId` como sustituto.

## Salida de `list`

Debe mostrar de forma segura:

* `auditEvidenceCount`.
* `latestAuditAt`, si existe.
* Tipos de acciones encontradas.

No debe mostrar metadata completa.

## Pruebas

Añade pruebas para:

1. Auditoría del mismo payment ID cuenta como evidencia.
2. Auditoría de otro payment ID en la misma suscripción no cuenta.
3. Auditoría con `targetId = tenantId` no se cuenta como evidencia del webhook si el contrato exige subscription.
4. Metadata ausente no cuenta.
5. Metadata malformada no lanza excepción.
6. No se filtran IDs externos completos ni secretos en la salida.

Cuando exista base dedicada, añade o prepara un escenario de integración que cree dos pagos en la misma suscripción y confirme que el CLI distingue su evidencia.

# 4. Doble confirmación en producción

Refuerza `mark-applied` para destinos que no parecen de pruebas.

Además de:

`--confirm-production`

debe exigir:

`--confirm-payment-id <id>`

El valor debe coincidir exactamente con `--payment-id`.

Ejemplo permitido:

```text
mark-applied \
  --payment-id pay_123 \
  --reason "Validado contra evidencia operativa" \
  --confirm-production \
  --confirm-payment-id pay_123
```

Debe rechazarse si:

* Falta `--confirm-production`.
* Falta `--confirm-payment-id`.
* El ID repetido no coincide.
* Se intenta usar una variable de entorno como confirmación.
* Se usa wildcard.
* Se envían varios IDs.

En una base identificada claramente como test, no es obligatorio repetir el ID.

Añade pruebas puras de parseo y validación.

# 5. Rollback del enum PostgreSQL

Actualiza los comentarios de rollback de la migración y el informe técnico asociado.

Debe quedar explícito que:

* La tabla `WebhookEvent` puede eliminarse.
* Las dos columnas nuevas de `Payment` pueden eliminarse.
* El tipo `WebhookEventResult` puede eliminarse cuando la tabla ya no exista.
* El valor `AuditAction.PAYMENT_RECONCILED` no puede eliminarse directamente de forma segura con un simple `ALTER TYPE`.
* En un rollback normal se deja ese valor huérfano e inocuo.
* Retirarlo exigiría reconstruir el enum en una migración especial.
* No se debe ejecutar una reconstrucción destructiva automáticamente.

No construyas esa migración destructiva.

# 6. Protección de datos del CLI

Aprovecha la corrección para confirmar:

* El ID externo sigue enmascarado.
* No se imprimen metadata completas.
* No se imprimen URLs.
* No se imprimen credenciales.
* No se imprimen firmas.
* No se imprimen motivos de auditoría de otros pagos.
* Los errores no incluyen `DATABASE_URL`.

Añade pruebas puras cuando sea posible.

# 7. Pruebas puras

Añade o amplía pruebas para:

* Matching de auditoría por `subscriptionId` y payment ID.
* Rechazo de auditoría de otro pago.
* Metadata nula o malformada.
* Confirmación doble de producción.
* Confirmación con ID diferente.
* Modo test sin segunda confirmación.
* Enmascarado de salida.
* Rollback assertions helpers, si pueden extraerse como lógica pura.

No importes Prisma en pruebas unitarias puras.

# 8. Pruebas de integración

Las pruebas deben quedar compilando y sin `skip`.

No las ejecutes todavía.

Añade el escenario de evidencia de auditoría del CLI si puede integrarse sin ejecutar el proceso CLI completo. Es preferible probar una función de servicio usada por el CLI.

# 9. Validaciones permitidas

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
```

No ejecutes:

```text
npm test
npx prisma migrate dev
npx prisma migrate deploy
npx prisma db push
npm run build
```

No conectes ninguna base.

# Criterios de aceptación

1. Rollback tests verifican todos los modelos y campos económicos.
2. Cada escenario distingue claramente fila inexistente de fila revertida.
3. Reintento comprueba exactamente un efecto.
4. Pruebas históricas verifican términos, Tenant, Payment y Subscription.
5. Evidencia del CLI usa `subscriptionId`.
6. Evidencia corresponde al payment ID exacto.
7. Auditoría de otro pago no cuenta.
8. Producción exige doble confirmación.
9. ID repetido debe coincidir.
10. Datos sensibles no se muestran.
11. Rollback del enum queda documentado con precisión.
12. No quedan `skip`.
13. Typecheck, lint y pruebas puras pasan.
14. No se ejecutan migraciones ni integración.
15. No se hace commit.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial.
3. Confirmación de hallazgos.
4. Aserciones de rollback.
5. Reintento.
6. Pruebas históricas.
7. Evidencia de auditoría.
8. Cambios del CLI.
9. Doble confirmación.
10. Protección de datos.
11. Rollback del enum.
12. Archivos modificados.
13. Pruebas puras.
14. Pruebas de integración preparadas.
15. Comandos ejecutados.
16. Resultados.
17. Validaciones pendientes.
18. Diff resumido.
19. Riesgos restantes.
20. Respuesta F1F-01…F1F-04.
21. Estado:

* CORREGIDO.
* CORREGIDO CON VALIDACIÓN PENDIENTE.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/02-facturacion/14-respuesta-claude-correcciones-finales-pruebas-cli.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/02-facturacion/13-prompt-claude-correcciones-finales-pruebas-cli.md`

3. No hagas commit.

4. No crees todavía la base de pruebas.

5. No continúes con cron, precedencia, cancelación o métricas.

6. Detente después del informe.
