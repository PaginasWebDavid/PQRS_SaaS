# FASE 1K - Aprobación final de idempotencia y atomicidad

Fecha de revisión: 2026-07-24
Revisor: Codex, revisión técnica final
Alcance: facturación, webhook Mercado Pago, idempotencia, atomicidad, ledger, cuarentena histórica y pruebas concurrentes

## 1. Resumen ejecutivo

La subfase queda **APROBADA** para convertirse en commit.

La implementación final garantiza que el efecto económico de un pago \`APPROVED\` se aplique una sola vez mediante el marcador persistente \`Payment.approvedEffectAppliedAt\`, la condición de reclamación atómica y la unicidad del identificador externo de Mercado Pago. El ledger y la auditoría conservan la trazabilidad de las entregas del webhook, pero no son la única barrera contra una doble extensión.

Los pagos históricos aprobados quedan en cuarentena y requieren reconciliación manual explícita. La reconciliación no modifica períodos ni llama a Mercado Pago. Las pruebas cubren 17 escenarios de facturación, incluidos concurrencia, fallos transaccionales, reintentos, cuarentena histórica y evidencia del CLI.

No se encontraron hallazgos críticos o altos abiertos dentro de esta subfase. La suite completa, las pruebas unitarias, el typecheck y el lint pasaron.

## 2. Estado de Git

HEAD revisado:

\`\`\`text
0141492 chore(test): isolate test database and protect Prisma execution
\`\`\`

El árbol contiene cambios de implementación de la subfase y documentación de auditoría aún no confirmados. No se hizo commit ni push.

Cambios tracked observados:

\`\`\`text
M prisma/schema.prisma
M src/domains/billing/billing.service.ts
M src/domains/billing/mercado-pago.service.ts
M src/domains/platform/audit.service.ts
\`\`\`

También existen archivos nuevos relacionados con la subfase: migración, servicios auxiliares, script de reconciliación, pruebas y documentación.

\`git diff --check\` no reportó errores. \`package-lock.json\` no cambió.

## 3. Alcance del diff

| Clasificación | Archivos o área | Resultado |
| --- | --- | --- |
| Idempotencia | \`prisma/schema.prisma\`, \`mercado-pago.service.ts\` | Necesario y justificado |
| Atomicidad | \`mercado-pago.service.ts\`, \`audit.service.ts\`, \`billing.service.ts\` | Necesario y justificado |
| Ledger | \`schema.prisma\`, migración, \`mercado-pago.service.ts\` | Necesario y justificado |
| Cuarentena histórica | \`schema.prisma\`, migración, \`reconciliation.ts\`, script CLI | Necesario y justificado |
| Períodos | \`period.ts\`, \`billing.service.ts\`, pruebas | Necesario y justificado |
| Pruebas | suite de webhook y pruebas unitarias | Necesario y justificado |
| Documentación | carpeta \`docs/programa-mejora/02-facturacion/\` | Necesaria para trazabilidad |
| Fuera de alcance | UI, autenticación, PQRS, storage, legal, cron, métricas, reservas y cancelación | No se observaron cambios de esta subfase en esas áreas |

## 4. Idempotencia del efecto económico

La implementación cumple los criterios:

- \`Payment.mercadoPagoPaymentId\` permanece único.
- \`Payment.approvedEffectAppliedAt\` es el marcador persistente del efecto aplicado.
- La reclamación exige estado \`APPROVED\`, marcador nulo y \`approvedEffectReconciliationRequired = false\`.
- Un pago nuevo aprobado aplica una sola vez.
- Un replay no vuelve a extender el período.
- La transición \`PENDING -> APPROVED\` funciona.
- Dos solicitudes concurrentes producen un único efecto económico.
- Un rollback devuelve el marcador a \`NULL\` al revertir la transacción.
- El reintento posterior puede aplicar una sola vez.

La actualización de períodos no tiene una ruta alternativa dentro de este flujo que omita la reclamación persistente. El ledger se usa para trazabilidad y clasificación de entregas, no como única garantía económica.

## 5. Pagos históricos

La migración marca para reconciliación los pagos existentes con \`provider = MERCADO_PAGO\` y \`status = APPROVED\`. No extiende períodos ni marca ciegamente el efecto como aplicado.

El webhook identifica estos pagos mediante \`isHistoricalQuarantined\`, conserva sus períodos y estados, registra auditoría y finaliza el ledger como \`RECONCILIATION_REQUIRED\`. Un replay histórico no extiende la suscripción.

El script \`scripts/reconcile-historical-payment-effects.ts\` opera un pago por ejecución, exige motivo, requiere la confirmación exacta del identificador en producción, no modifica períodos y no llama a Mercado Pago. Solo deja la marca y la auditoría necesarias para indicar que la decisión fue revisada.

En la base de mockdata autorizada, la cuarentena afectó cero filas porque el conteo seguro mostró cero pagos de Mercado Pago y cero fixtures de facturación.

## 6. Atomicidad

El flujo normal mantiene en la misma transacción Prisma:

- creación o actualización de \`Payment\`;
- reclamación del marcador de efecto;
- actualización de \`Subscription\`;
- sincronización de \`Tenant\`;
- auditoría económica;
- aplicación de términos pendientes;
- persistencia de \`Payment.periodStart\` y \`Payment.periodEnd\`;
- resultado final del \`WebhookEvent\`.

\`registerAuditLog\` acepta el cliente transaccional. La sincronización de tenant y la actualización del ledger también usan el cliente de la transacción. No se encontró una función interna del flujo aprobado que escape al singleton global durante la transacción.

Las pruebas provocan fallos después del reclamo, después de actualizar la suscripción y antes de la auditoría. En los tres casos se revierte el pago, los períodos y el estado económico; el reintento posterior funciona exactamente una vez.

## 7. Períodos

Existe una única constante compartida para la duración mensual en \`src/domains/billing/period.ts\`. El webhook y la renovación simulada utilizan la función compartida.

Las pruebas verifican que \`Payment.periodStart/periodEnd\` coincidan con los períodos de \`Subscription\` y utilizan la semántica real de \`addDays\`. No dependen de un reloj capturado antes del webhook ni de tolerancias amplias. No se identificó una segunda implementación económica equivalente.

## 8. Ledger

El ledger \`WebhookEvent\` conserva los resultados relevantes:

- \`RECEIVED\`;
- \`PROCESSED\`;
- \`DUPLICATE\`;
- \`FAILED\`;
- \`ENTITY_NOT_FOUND\`;
- \`UNSUPPORTED_TOPIC\`;
- \`RECONCILIATION_REQUIRED\`.

Una solicitud sin \`dataId\` termina antes de crear ledger y antes de llamar al proveedor. La metadata y los errores se sanitizan; no se almacenan tokens, firmas completas, datos de tarjeta ni payloads sensibles en los registros revisados.

La falta de una política de retención formal del ledger queda registrada como mejora futura y no bloquea esta subfase.

## 9. Migración

La migración \`prisma/migrations/20260722000100_add_webhook_event_ledger_and_payment_effect/migration.sql\` es aditiva y compatible con PostgreSQL:

- agrega columnas anulables y un default explícito;
- aplica la cuarentena antes de crear el ledger;
- agrega el valor de auditoría de reconciliación;
- crea el enum de resultados;
- crea \`WebhookEvent\` e índices;
- no elimina datos ni ejecuta operaciones destructivas.

La tabla y las columnas existen en el proyecto autorizado, como demuestra la consulta segura de conteos y la ejecución de la suite. La migración ya fue aplicada una vez según la documentación de la Fase 1J. No se volvió a aplicar durante esta revisión y no debe ejecutarse manualmente de nuevo.

## 10. Pruebas

La suite de facturación contiene 17 escenarios ejecutables y cero \`skip\`:

1. pago \`APPROVED\` nuevo;
2. replay;
3. \`PENDING -> APPROVED\`;
4. concurrencia;
5. rollback después del reclamo;
6. rollback después de \`Subscription\`;
7. rollback antes de \`AuditLog\`;
8. reintento;
9. ledger procesado;
10. ledger duplicado;
11. preapproval atómico;
12. términos pendientes;
13. histórico en cuarentena;
14. histórico reconciliado;
15. pago nuevo fuera de cuarentena;
16. falta de \`dataId\`;
17. evidencia del CLI.

Los escenarios principales validan Payment, Subscription, Tenant, AuditLog, WebhookEvent, períodos, marcadores, estado de reconciliación y limpieza.

## 11. Resultados de ejecución

Resultados observados:

\`\`\`text
npx tsc --noEmit                 PASS

npm run lint                     PASS
No ESLint warnings or errors

npx tsx --test tests/unit/*.test.ts
95 tests, 95 pass, 0 fail, 0 skipped

npm test                         PASS
147 tests, 147 pass, 0 fail, 0 skipped
\`\`\`

La primera ejecución de \`npm test\` fue detenida por el guard de seguridad porque las variables normales apuntaban al mismo destino que el entorno de prueba. No ejecutó pruebas ni modificó datos. Después se utilizó el procedimiento seguro autorizado, con destino aislado por proceso, y la ejecución completa pasó.

No se levantó servidor, no se ejecutó build, no se aplicó migración, no se ejecutó \`db push\`, no se ejecutaron seeds y no se llamó a Mercado Pago.

## 12. Limpieza

El conteo seguro posterior fue:

\`\`\`text
tenants=6
users=17
payments=5
pqrs=55
webhookEvents=0
mercadoPagoPayments=0
billingFixtures=0
\`\`\`

La suite limpia únicamente registros asociados a sus identificadores de ejecución y a sus tenants de prueba. El conteo posterior coincide con el baseline documentado. No quedaron fixtures ni \`WebhookEvent\` de pruebas. No se borraron datos preexistentes fuera del alcance de los identificadores de prueba.

\`.env\` permaneció intacto y \`.env.test\` continúa ignorado. No hubo llamadas a Mercado Pago.

## 13. Seguridad de variables

No se mostraron valores secretos. \`.env\` y \`.env.test\` no están rastreados. Los archivos de plantilla \`.env.example\` y \`.env.test.example\` no contienen credenciales reales.

No se encontraron archivos rastreados de credenciales privadas o tokens operativos. Tampoco se encontraron artefactos generados de Prisma rastreados. \`package-lock.json\` permaneció sin cambios.

## 14. Hallazgos

### H-01 - Retención del ledger

- Severidad: baja.
- Archivo o símbolo: modelo \`WebhookEvent\` y operación de ledger.
- Comportamiento: no existe una política formal de retención o archivado.
- Impacto: crecimiento operativo de la tabla a largo plazo.
- Evidencia: la implementación persiste resultados, pero no incluye job ni política de limpieza productiva.
- Corrección: definir retención, archivado y monitoreo antes de que el volumen lo requiera.
- ¿Bloquea el commit?: No.
- ¿Bloquea producción?: No para este commit; sí debe planificarse antes de operación sostenida.

No hay otros hallazgos nuevos críticos, altos o medios dentro de esta subfase.

## 15. Riesgos aceptados

El proyecto Supabase actual contiene mockdata desechable y fue autorizado expresamente para ejecutar esta revisión. Esta excepción no bloquea la aprobación.

El riesgo aceptado es temporal: antes de producción se debe separar estrictamente el proyecto de Supabase de producción del proyecto de desarrollo y pruebas. También debe existir una configuración de Mercado Pago sandbox separada de cualquier credencial productiva.

La reconstrucción especial del enum para un rollback destructivo no forma parte de la operación normal. El rollback documentado de la migración elimina la tabla y columnas, pero deja el valor enum de auditoría como residuo inocuo para evitar una reconstrucción destructiva automática.

## 16. Condiciones antes de producción

Antes del lanzamiento deben cumplirse estas condiciones:

1. Crear un proyecto Supabase exclusivo para producción.
2. Mantener otro proyecto separado para desarrollo y pruebas.
3. Recrear o actualizar \`.env.test\` para que apunte exclusivamente al entorno de pruebas.
4. Prohibir suites destructivas contra producción mediante el guard de ejecución.
5. Configurar Mercado Pago sandbox y su webhook en un entorno aislado.
6. Validar posteriormente un flujo completo de sandbox: creación, redirección, aprobación y webhook.
7. Definir retención y monitoreo del ledger.
8. Rotar cualquier credencial que haya sido expuesta fuera del repositorio durante pruebas manuales.

## 17. Lista exacta para commit

### Implementación

\`\`\`text
prisma/schema.prisma
prisma/migrations/20260722000100_add_webhook_event_ledger_and_payment_effect/migration.sql
src/domains/billing/billing.service.ts
src/domains/billing/mercado-pago.service.ts
src/domains/billing/period.ts
src/domains/billing/reconciliation.ts
src/domains/billing/webhook-metadata.ts
src/domains/platform/audit.service.ts
scripts/reconcile-historical-payment-effects.ts
tests/billing-webhook-idempotency.test.ts
tests/unit/billing-period.test.ts
tests/unit/billing-reconciliation.test.ts
\`\`\`

### Documentación

Recomiendo incluir todos los documentos Markdown de \`docs/programa-mejora/02-facturacion/\`, porque forman la cadena auditable de decisiones, diagnósticos, correcciones y aprobaciones. Esto incluye los dos documentos numerados \`17\` y los nuevos documentos \`21\` y \`22\`. No deben incluirse \`.env\`, \`.env.test\`, logs ni archivos temporales.

## 18. Comandos \`git add\` recomendados

No se ejecutaron estos comandos:

\`\`\`text
git add prisma/schema.prisma
git add prisma/migrations/20260722000100_add_webhook_event_ledger_and_payment_effect/migration.sql
git add src/domains/billing/billing.service.ts
git add src/domains/billing/mercado-pago.service.ts
git add src/domains/billing/period.ts
git add src/domains/billing/reconciliation.ts
git add src/domains/billing/webhook-metadata.ts
git add src/domains/platform/audit.service.ts
git add scripts/reconcile-historical-payment-effects.ts
git add tests/billing-webhook-idempotency.test.ts
git add tests/unit/billing-period.test.ts
git add tests/unit/billing-reconciliation.test.ts
git add docs/programa-mejora/02-facturacion/
\`\`\`

Se recomienda revisar el staging después de estos comandos. No usar \`git add .\`.

## 19. Mensaje de commit

\`\`\`text
feat(billing): enforce idempotent atomic webhook effects
\`\`\`

## 20. Recomendación de commit

Crear el commit únicamente después de que el propietario revise el diff staged y confirme que los documentos de auditoría deben viajar juntos. El estado técnico de la subfase permite el commit: no hay fallos de typecheck, lint ni pruebas y no hay hallazgos críticos o altos abiertos.

No se recomienda mezclar en este commit cambios de precedencia, cron, cancelación, métricas, UI, autenticación, PQRS ni otros roles.

## 21. Veredicto

**APROBADA.**

La subfase de idempotencia y atomicidad cumple los criterios de aprobación definidos: efecto económico único, concurrencia controlada, rollback completo, reintento correcto, cuarentena histórica, reconciliación manual no económica, coherencia entre Payment/Subscription/Tenant, ledger y auditoría suficientes, migración aditiva, 17 escenarios ejecutables, suite completa aprobada, typecheck y lint limpios, cero \`skip\`, cero fixtures residuales y ausencia de secretos rastreados.

La revisión termina aquí. No se continúa con precedencia, cron, cancelación ni métricas.

