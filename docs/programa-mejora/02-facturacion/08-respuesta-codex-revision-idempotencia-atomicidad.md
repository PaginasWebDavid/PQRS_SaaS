# FASE 1D — Respuesta Codex: revisión de idempotencia y atomicidad

Fecha de revisión: 2026-07-21  
Revisor: Codex, revisión técnica independiente en modo solo lectura  
Alcance: implementación actual de idempotencia, atomicidad y ledger de webhooks de Mercado Pago.

## 1. Resumen ejecutivo

La implementación corrige de forma estructural el caso de un pago nuevo `APPROVED`, el reenvío del mismo pago, la transición `PENDING -> APPROVED` y la reclamación concurrente del efecto económico. El patrón usado es un marcador nullable en `Payment.approvedEffectAppliedAt`, reclamado con `updateMany` condicionado dentro de una transacción.

La transacción del pago usa el cliente transaccional para `Payment`, marcador, `Subscription`, `Tenant`, `AuditLog` y el resultado final de `WebhookEvent`. El ledger está correctamente separado de la garantía económica y se crea por entrega de webhook.

Sin embargo, hay un riesgo crítico de despliegue: la migración deja `approvedEffectAppliedAt = NULL` en todos los pagos históricos. Si Mercado Pago reenvía un `APPROVED` histórico que ya produjo una extensión antes de esta migración, el código actual lo considera reclamable y puede extender nuevamente `Subscription.currentPeriodEnd`. La afirmación de que los pagos históricos no vuelven a extender es incorrecta.

Además, los cuatro escenarios de rollback exigidos están marcados `skip`, por lo que F1-04 no está demostrado por pruebas. El resultado es **REQUIERE CORRECCIONES**.

## 2. Estado de Git

El working tree contiene cambios sin commit:

- Modificados: `prisma/schema.prisma`, `src/domains/billing/billing.service.ts`, `src/domains/billing/mercado-pago.service.ts`, `src/domains/platform/audit.service.ts`.
- Nuevos: la migración `20260722000100_add_webhook_event_ledger_and_payment_effect`, `src/domains/billing/period.ts`, `src/domains/billing/webhook-metadata.ts`, `tests/billing-webhook-idempotency.test.ts` y `tests/unit/billing-period.test.ts`.
- Nuevos documentos de la Fase 1D: este informe y el prompt exacto de revisión.
- No hay cambios en `package-lock.json` ni archivos generados rastreados.
- `git diff --check` no reportó errores de whitespace.

No se hizo commit ni push.

## 3. Alcance del diff

El diff observado está concentrado en facturación, auditoría transaccional, schema/migración y pruebas de facturación. No se modificaron cron, precedencia definitiva de eventos, cancelación, métricas, UI, legal, autenticación, storage o soporte.

La extracción de la constante y de la matemática de períodos también modifica `billing.service.ts`, pero permanece dentro del alcance de la fuente única de períodos solicitado.

No encontré cambios fuera de alcance que bloqueen esta revisión.

## 4. Pagos históricos

### Reconstrucción

Para un pago histórico `MERCADO_PAGO` ya aprobado antes de la migración:

1. La fila existente conserva `status = APPROVED`.
2. La nueva columna se agrega nullable y queda `approvedEffectAppliedAt = NULL`.
3. Mercado Pago reenvía un webhook `payment` y `registerPayment` localiza la suscripción mediante `external_reference`.
4. `tx.payment.upsert` localiza la fila por `mercadoPagoPaymentId` y actualiza su estado/metadatos.
5. `tx.payment.updateMany` encuentra `status = APPROVED` y `approvedEffectAppliedAt = NULL`, por lo que devuelve `count = 1`.
6. El código calcula un nuevo período y actualiza `Subscription`, `Payment.periodStart/periodEnd`, `Tenant`, `AuditLog` y el ledger.

Por tanto, el período puede extenderse otra vez. La afirmación equivalente en el comentario de la migración y en la respuesta de Claude es incorrecta.

### Estrategia mínima recomendada

No recomiendo un backfill SQL automático ciego dentro de la migración. Marcar todos los pagos aprobados como aplicados puede ocultar un pago cuyo efecto anterior falló parcialmente; dejar todos en `NULL` permite la doble extensión descrita.

La estrategia mínima y segura es un despliegue en dos pasos:

1. Pausar temporalmente el procesamiento efectivo del webhook o ponerlo en una ventana controlada.
2. Ejecutar un script de reconciliación previo a habilitar el nuevo handler. Para cada pago histórico `provider = MERCADO_PAGO` y `status = APPROVED`, buscar evidencia confiable de que el efecto anterior se aplicó, por ejemplo un `AuditLog` de webhook procesado y/o la correspondencia verificable entre el período del pago y la suscripción.
3. Marcar solo los pagos reconciliados como aplicados, usando como timestamp una fecha auditada, preferiblemente `paidAt` cuando sea válida; `updatedAt` o `createdAt` son fallbacks de operación, no evidencia económica.
4. Los casos sin evidencia deben quedar en una cola de reconciliación manual antes de aceptar replay de webhooks.
5. Habilitar el nuevo procesamiento para pagos posteriores al corte.

Si el sistema confirma que todos los pagos históricos aprobados fueron procesados correctamente por el código anterior, puede usarse un backfill explícito de esas filas. Esa premisa debe quedar registrada y revisada antes de ejecutarlo. La migración automática no debe asumirla.

## 5. Garantía concurrente

Para dos transacciones con el mismo `mercadoPagoPaymentId`:

- La restricción `@unique` sobre `Payment.mercadoPagoPaymentId` evita dos filas.
- PostgreSQL serializa la carrera de `upsert` sobre la misma clave única.
- Después del `upsert`, solo una transacción puede satisfacer `approvedEffectAppliedAt IS NULL` y obtener `count = 1`.
- La otra ve el marcador ya fijado y obtiene `count = 0`, entra en la rama `DUPLICATE` y no modifica `currentPeriodEnd`.
- Si la primera transacción hace rollback, su marcador también revierte; el segundo intento puede ganar posteriormente. Ese comportamiento es el correcto para reintento posterior a rollback.

El orden Payment -> marcador -> Subscription -> Tenant -> AuditLog -> ledger es coherente para el mismo pago. La combinación de `upsert` único y `updateMany` condicional es adecuada para la reclamación atómica.

Persisten riesgos de concurrencia fuera del objetivo de esta fase: eventos de estados distintos y fuera de orden pueden sobrescribirse, porque la precedencia definitiva quedó explícitamente fuera de alcance. También conviene validar en una base dedicada la carrera real, no solo inferirla del código.

## 6. PENDING → APPROVED

El flujo es correcto para pagos nuevos:

- `PENDING` crea la fila con marcador `NULL` y no aplica extensión.
- `APPROVED` actualiza la misma fila por su `mercadoPagoPaymentId`.
- La reclamación condicional obtiene `count = 1`.
- Se aplica `computeNextPeriod`, se actualizan suscripción, conjunto y auditoría.
- Un segundo `APPROVED` obtiene `count = 0` y no extiende de nuevo.

La prueba correspondiente existe y verifica una sola fila de `Payment` y el período, aunque no verifica explícitamente el marcador ni todos los efectos laterales.

## 7. Atomicidad real

### Pago aprobado

Dentro de `prisma.$transaction` están:

- `Payment.upsert`.
- Reclamación de `approvedEffectAppliedAt`.
- Actualización del período y términos de `Subscription`.
- Actualización de `Payment.periodStart/periodEnd`.
- Sincronización de `Tenant` mediante `applyTenantStatusInTx`.
- `registerAuditLog(..., tx)`.
- `markWebhookResult(tx, ...)`.

`registerAuditLog` acepta un cliente transaccional y no fuerza el singleton global. `applyTenantStatusInTx` usa exclusivamente el cliente `tx`, incluida la consulta del pago aprobado. No encontré un escape accidental al singleton en esa transacción.

### Resultado de fallos

Un fallo después del upsert, del marcador, de Subscription, de Tenant, del AuditLog o del resultado final del ledger debe provocar rollback de toda la transacción. El webhook creado antes de la transacción permanece en `RECEIVED`; el `catch` intenta marcarlo `FAILED` fuera de la transacción y conserva el error original si ese marcado también falla. Un reintento posterior puede volver a reclamar el marcador porque el rollback lo dejó en `NULL`.

La propiedad es correcta por inspección estática, pero no está demostrada por los escenarios de inyección exigidos, que están omitidos.

## 8. Ledger

El ciclo implementado es:

1. Derivar `dataId`, topic y `requestId`.
2. Validar firma para eventos con `dataId`.
3. Crear `WebhookEvent` con `RECEIVED` fuera de la transacción económica.
4. Consultar Mercado Pago fuera de la transacción.
5. Aplicar cambios locales en una transacción corta.
6. Marcar `PROCESSED` o `DUPLICATE` dentro de esa transacción.
7. Ante error, intentar marcar `FAILED` fuera de la transacción.

Esto mantiene separadas trazabilidad e idempotencia económica. Varias entregas iguales crean varias filas, como corresponde al diseño de ledger por entrega; el ledger no se usa como única garantía del efecto.

Un fallo antes de crear `RECEIVED` puede dejar el evento sin rastro. Un fallo de la consulta externa deja normalmente `FAILED`. Un rollback local deja inicialmente `RECEIVED` y el `catch` intenta convertirlo a `FAILED`; si el proceso muere entre ambos pasos puede quedar `RECEIVED` para recuperación operativa.

El schema tiene índices razonables para proveedor/topic, `dataId`, tenant y fecha, pero no tiene política de retención. El crecimiento indefinido debe resolverse en una fase operativa posterior.

`metadata` se sanitiza para conservar primitivos y excluir secretos. `safeErrorCode` limita el mensaje a 120 caracteres, pero no aplica una redacción estructurada al contenido del error; conviene revisar que las respuestas del proveedor nunca incluyan datos sensibles antes de almacenarlas.

## 9. Casos sin dataId y topic desconocido

La columna `WebhookEvent.dataId` es obligatoria. El código resuelve la ausencia usando `dataId = ""` y crea un evento `IGNORED` directamente, por lo que el caso sí es representable y consultable.

El topic desconocido con `dataId` presente se registra como `RECEIVED`, pasa la validación de firma y termina como `UNSUPPORTED_TOPIC`.

Hay una inconsistencia de seguridad operativa: el camino sin `dataId` crea el ledger antes de validar la firma, porque no existe un manifiesto verificable. Una petición no autenticada con `dataId` ausente puede insertar filas `IGNORED`. No aplica efecto económico, pero permite ruido o crecimiento malicioso del ledger. Debe limitarse, rate-limitarse o registrarse fuera del ledger económico con una política explícita.

## 10. Preapproval

La consulta de `Subscription` y la comprobación preliminar de un pago aprobado ocurren fuera de la transacción. Después, `Subscription`, `Tenant`, `AuditLog` y `WebhookEvent` se actualizan con el mismo `tx`.

Esto conserva atomicidad local, pero deja una ventana de datos obsoletos: la suscripción puede cambiar o desaparecer después de la lectura, y `prevStatus`, `graceEndsAt` o el resultado preliminar pueden no representar el estado más reciente. Si la fila desaparece, el update transaccional falla y el ledger queda marcado `FAILED`; no hay escritura parcial.

La ventana es un riesgo de concurrencia/precedencia, no un escape de atomicidad. La precedencia definitiva está fuera de esta fase.

## 11. Fuente única del período

`src/domains/billing/period.ts` concentra `BILLING_PERIOD_DAYS = 30`, `addDays`, `resolveEffectiveTerms` y `computeNextPeriod`. El webhook y la renovación simulada llaman a `computeNextPeriod`.

La lógica mantiene el comportamiento esperado:

- período vigente: encadena desde `currentPeriodEnd`;
- período vencido: inicia en `now`;
- términos pendientes completos: se aplican y se limpian en la actualización transaccional;
- moneda pendiente ausente: usa `fallbackCurrency`;
- las fechas de entrada no se mutan.

La creación inicial, las cortesías y otros cálculos de días siguen usando `addDays`, pero no duplican la constante de período mensual. Las pruebas puras cubren los casos principales.

## 12. Migración

La migración es aditiva y el orden estático es válido: primero agrega la columna nullable, luego crea el enum y finalmente la tabla e índices.

Observaciones:

- `Payment.approvedEffectAppliedAt` es nullable, pero requiere reconciliación histórica obligatoria.
- `WebhookEvent.dataId` es `TEXT NOT NULL`; la ausencia se representa como cadena vacía.
- `WebhookEvent.updatedAt` es `NOT NULL` sin default SQL. Prisma `@updatedAt` suele proporcionar el valor desde el cliente, pero inserts SQL directos necesitarían suministrarlo.
- No hay relaciones FK desde el ledger a tenant o subscription, decisión coherente con un ledger desacoplado, pero exige validación en consultas y no garantiza integridad referencial.
- `provider` y `topic` son `TEXT`, no enums; dan flexibilidad, pero permiten valores inconsistentes.
- Los índices cubren las consultas previstas. No es necesario un índice independiente sobre `approvedEffectAppliedAt` para el reclamo por `Payment.id`; sí puede ser útil para un backfill/reconciliación masivo.
- Agregar una columna nullable a `Payment` es de bajo riesgo de bloqueo comparado con un backfill, pero aun así requiere una ventana y observabilidad.
- El rollback está documentado como SQL manual; no se debe aplicar a ciegas después de insertar datos.

No ejecuté la migración.

## 13. Cliente Prisma

El cliente generado no está rastreado por Git. `package.json` ejecuta `prisma generate` tanto en `postinstall` como antes del build, por lo que una instalación limpia debe regenerarlo desde el schema.

Claude reportó `EPERM` durante `prisma generate`; no lo repetí porque la Fase 1D prohíbe ejecutar Prisma. El typecheck actual pasa, lo que demuestra que el cliente instalado contiene los tipos requeridos en este entorno, pero no sustituye una verificación limpia en CI o en un entorno sin bloqueo de DLL.

No encontré cambio accidental en `package-lock.json` ni archivos generados modificados.

## 14. Pruebas de integración

`tests/billing-webhook-idempotency.test.ts` importa `prisma` y el servicio real `processMercadoPagoWebhook`. Mockea `globalThis.fetch`, construye la firma HMAC con el mismo manifiesto usado por producción y genera IDs únicos por ejecución.

Los 12 escenarios están escritos, pero solo 8 son ejecutables: 1–4 y 9–12. Los escenarios 5–8 están explícitamente marcados `skip` por falta de un seam de inyección de fallos.

Las pruebas limpian los tenants, pagos, suscripciones, auditorías, ledger asociado por tenant y la regla de precio. No dependen de IDs fijos y la prueba concurrente usa `Promise.allSettled` sobre el mismo pago.

Limitaciones:

- No verifican explícitamente `approvedEffectAppliedAt` en los casos 1–4.
- No verifican de forma completa Tenant, AuditLog y todos los estados del ledger en cada caso.
- La limpieza por `tenantId` no elimina un `WebhookEvent` que haya quedado con `tenantId = NULL` después de un rollback o un fallo temprano.
- No hay prueba de replay histórico después de una migración con marcador null.
- No hay prueba de race con estados fuera de orden, coherente con el alcance declarado.

No se ejecutaron por la restricción expresa de no conectar a PostgreSQL ni ejecutar pruebas que importen Prisma.

## 15. Pruebas de rollback

Los cuatro escenarios exigidos están omitidos:

- fallo antes de Subscription;
- fallo antes de Tenant;
- fallo de auditoría;
- reintento después de rollback.

La ausencia no es meramente documental: impide probar que el marcador y el período regresan juntos cuando ocurre un fallo después de reclamar el efecto. Para una fase cuyo criterio explícito es F1-04, esto bloquea la aprobación.

## 16. Pruebas puras

Las pruebas no importan Prisma. Se ejecutó:

```text
npx tsx --test tests/unit/billing-period.test.ts
npx tsx --test tests/unit/*.test.ts
```

Resultado final del conjunto: **70 tests, 70 passed, 0 failed, 0 skipped**.

La prueba específica nueva de facturación contiene 8 casos y pasó completa. Cubre matemática de períodos, términos pendientes, fallback de moneda, construcción de metadata, formato de clave de efecto y exclusión de secretos. No prueba la transacción ni la concurrencia real.

El primer intento dentro del sandbox produjo `spawn EPERM`; el reintento permitido fuera del sandbox ejecutó las pruebas correctamente. No se modificaron archivos.

## 17. Typecheck y lint

Ejecutados y exitosos:

```text
npx tsc --noEmit
npm run lint
```

Lint terminó con `No ESLint warnings or errors`. No se ejecutaron build, Prisma, `npm test`, servidor, PostgreSQL ni Mercado Pago.

## 18. Hallazgos

### F1D-01 — Doble extensión posible en replay de pagos históricos

- Severidad: Crítica.
- Archivo/símbolo: migración SQL; `processMercadoPagoWebhook`; `upsertMercadoPagoPayment`.
- Comportamiento actual: todos los pagos existentes reciben marcador `NULL`; un `APPROVED` histórico reenviado satisface el reclamo condicional.
- Escenario: un pago aprobado antes del despliegue ya extendió la licencia y Mercado Pago vuelve a notificarlo después del despliegue.
- Impacto: extensión económica duplicada, fechas de licencia incorrectas y posible pérdida de control de ingresos.
- Evidencia: migración, líneas de columna nullable y comentarios de “no vuelve a extender”; código que filtra `status = APPROVED` y `approvedEffectAppliedAt = NULL`.
- Corrección mínima: reconciliación/backfill obligatorio y controlado antes de habilitar el nuevo handler; no backfill ciego.
- Prueba requerida: replay de pago histórico aplicado y no aplicado, con verificación exacta de `currentPeriodEnd`.
- ¿Bloquea el commit?: Sí.
- ¿Bloquea la siguiente subfase?: Sí, hasta definir y ejecutar el plan de datos históricos.

### F1D-02 — Rollback económico no probado

- Severidad: Alta.
- Archivo/símbolo: `tests/billing-webhook-idempotency.test.ts`, escenarios 5–8.
- Comportamiento actual: cuatro pruebas están `skip` por falta de seam de fallo.
- Impacto: no se demuestra F1-04 ni que el reintento pueda reclamar el efecto después de rollback.
- Evidencia: cuatro llamadas `test(..., { skip: ... })`.
- Corrección mínima: seam de inyección solo para tests o pruebas con mocks/constraints controlados que fallen en cada punto exigido.
- Prueba requerida: los cuatro escenarios deben ejecutarse y verificar marcador, Payment, Subscription, Tenant, AuditLog y ledger.
- ¿Bloquea el commit?: Sí.
- ¿Bloquea la siguiente subfase?: Sí.

### F1D-03 — Evento sin dataId evade validación de firma

- Severidad: Media.
- Archivo/símbolo: `processMercadoPagoWebhook`.
- Comportamiento actual: crea `WebhookEvent` `IGNORED` con `dataId = ""` antes de validar firma.
- Impacto: una petición sin dataId no aplica dinero, pero puede insertar ruido y consumir el ledger sin autenticación.
- Evidencia: rama `if (!dataId)` previa a `validateWebhookSignatureIfConfigured`.
- Corrección mínima: rate limit y/o canal separado para solicitudes inválidas; definir política explícita de no persistencia o persistencia acotada de inválidos.
- Prueba requerida: volumen de eventos sin dataId y rechazo/limitación sin crecimiento ilimitado.
- ¿Bloquea el commit?: No para la garantía económica; debe corregirse antes de exponer el endpoint públicamente.
- ¿Bloquea la siguiente subfase?: No, si se registra como riesgo operativo aceptado.

### F1D-04 — Pruebas de integración con aserciones incompletas

- Severidad: Media.
- Archivo/símbolo: `tests/billing-webhook-idempotency.test.ts`.
- Comportamiento actual: los casos principales verifican sobre todo período/status y algunos ledger, pero no validan siempre el marcador, Tenant, auditoría y todos los efectos atómicos.
- Impacto: una regresión en un efecto lateral podría pasar aunque el período siga correcto.
- Corrección mínima: añadir aserciones explícitas por escenario y limpiar también eventos huérfanos.
- Prueba requerida: matriz de efectos esperados por escenario.
- ¿Bloquea el commit?: No por sí solo, pero junto con F1D-02 impide una aprobación completa.
- ¿Bloquea la siguiente subfase?: Sí para declarar F1-04 validada.

### F1D-05 — Generación Prisma no verificada en entorno limpio

- Severidad: Baja/Media.
- Archivo/símbolo: `package.json` scripts `postinstall`/`build`.
- Comportamiento actual: se reportó un `EPERM` durante `prisma generate`; el cliente no está rastreado.
- Impacto: CI o deploy podrían fallar si el bloqueo de archivos se repite, aunque el typecheck actual pase.
- Corrección mínima: regenerar en CI limpio y verificar migración/schema antes del commit.
- Prueba requerida: instalación limpia, `prisma generate` y validación en pipeline.
- ¿Bloquea el commit?: No como defecto de código demostrado; sí requiere confirmación operativa antes de desplegar.
- ¿Bloquea la siguiente subfase?: No.

## 19. Correcciones obligatorias

1. Definir y ejecutar un plan de reconciliación de pagos históricos antes de habilitar replay con el nuevo marcador.
2. Implementar el seam de fallo mínimo aislado a tests o un mecanismo equivalente para hacer ejecutables los escenarios 5–8.
3. Completar las aserciones de integración sobre marcador, Payment, Subscription, Tenant, AuditLog y ledger.
4. Decidir una política de retención/rate limit para eventos inválidos sin `dataId` antes de producción.
5. Verificar `prisma generate` en una instalación limpia antes de publicar la migración.

No se hicieron estas correcciones porque la Fase 1D exige revisión de solo lectura.

## 20. Riesgos aceptados

Estos riesgos no son bloqueantes de la garantía de idempotencia nueva, pero deben quedar registrados:

- precedencia de eventos fuera de orden;
- lecturas preliminares fuera de la transacción del preapproval;
- ausencia de retención del ledger;
- campos `provider/topic` libres y ledger sin FKs;
- posibilidad de `RECEIVED` huérfano si el proceso muere entre la creación del ledger y el catch;
- errorCode truncado pero no estructuralmente redactado.

No deben confundirse con la doble extensión histórica, que sí es bloqueante.

## 21. Recomendación sobre commit

**No recomiendo hacer commit de la Fase 1C como implementación aprobada todavía.** El código de pagos nuevos tiene una base transaccional sólida, pero el despliegue sin reconciliación histórica puede producir una extensión duplicada, y las pruebas de rollback requeridas están omitidas.

Se puede conservar el diff en una rama de trabajo para corregirlo. Antes del commit de release deben existir el plan/backfill histórico revisado, las pruebas 5–8 ejecutables y las aserciones ampliadas.

## 22. Veredicto

# REQUIERE CORRECCIONES

La Fase 1D no aprueba F1-01/F1-04 para producción en su estado actual. La idempotencia de pagos nuevos y la reclamación concurrente son plausibles y están bien estructuradas, pero el riesgo histórico es crítico y la atomicidad ante rollback no está validada por las pruebas exigidas.

La revisión termina aquí. No se modificó código, schema, migración, configuración ni pruebas; no se ejecutaron cron, precedencia, Prisma, base de datos, Mercado Pago, build, commit o push.
