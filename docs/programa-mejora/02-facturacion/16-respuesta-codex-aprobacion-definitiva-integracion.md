# FASE 1H — Respuesta Codex: aprobación definitiva antes de pruebas de integración

Fecha de revisión: 2026-07-22  
Revisor: Codex, revisión técnica final independiente en modo solo lectura  
Alcance: verificación de las correcciones F1F-01 a F1F-04 y preparación para crear una base PostgreSQL exclusiva de pruebas.

## 1. Resumen ejecutivo

Las correcciones de la Fase 1G quedaron aplicadas correctamente dentro del alcance revisado.

- Los escenarios de rollback 5–8 ya no tienen `skip` y distinguen una fila Payment nueva inexistente de una fila revertida.
- El rollback verifica Subscription, Tenant, auditoría y ledger; el reintento verifica una única fila Payment, marcador, períodos alineados, estados `ACTIVE`, una auditoría económica, un ledger `FAILED`, uno `PROCESSED` y ningún `DUPLICATE`.
- Los pagos históricos conservan períodos y términos, permanecen en cuarentena y producen `RECONCILIATION_REQUIRED`.
- La evidencia del CLI se busca por `subscriptionId` y se filtra por external ID exacto en metadata, sin usar `tenantId` como evidencia.
- La escritura en un destino no identificado como pruebas exige `--confirm-production` y `--confirm-payment-id` coincidente.
- Importar el CLI no ejecuta `main()` ni dispara sus operaciones.
- La suite de integración contiene 17 escenarios y cero `skip`.

Las validaciones estáticas pasan con **95/95 pruebas puras**, typecheck limpio y lint limpio. La migración, Prisma y la suite de integración no se ejecutaron por las restricciones de esta fase.

**Recomendación: LISTA PARA CREAR BASE DE PRUEBAS.**  
**Veredicto: APROBADA PARA INTEGRACIÓN.**

## 2. Estado de Git

El working tree contiene cambios de las fases de facturación sin commit, además de los documentos de proceso. No se detectaron cambios en `package-lock.json` ni archivos generados rastreados.

La migración `20260722000100_add_webhook_event_ledger_and_payment_effect` no fue aplicada durante esta revisión: no se ejecutó Prisma, no se conectó PostgreSQL y no se ejecutó la suite de integración.

No se hizo commit ni push.

## 3. Rollback

Los escenarios 5–8 de `tests/billing-webhook-idempotency.test.ts` no contienen `skip`.

### Escenarios 5–7

El helper `assertRollbackOfNewPayment` captura el estado inicial de Subscription y verifica después del fallo:

- La fila Payment nueva no existe; no acepta indistintamente una fila ausente o parcialmente creada.
- `Subscription.currentPeriodStart`, `currentPeriodEnd`, `status`, `graceEndsAt`, `pendingUnitsSnapshot` y `pendingPriceCents` conservan sus valores.
- `Tenant.status` permanece `TRIAL` y coincide con Subscription.
- No queda auditoría económica parcial.
- El ledger tiene `FAILED`.
- No existe `DUPLICATE` ni `PROCESSED` para el intento fallido.

Los puntos de fallo cubiertos son después del reclamo, después de Subscription y antes de AuditLog.

### Escenario 8

Después del primer intento fallido y su rollback, el reintento verifica:

- una única fila Payment;
- `Payment.status = APPROVED`;
- marcador no nulo;
- cuarentena falsa;
- `Payment.periodStart = Subscription.currentPeriodStart`;
- `Payment.periodEnd = Subscription.currentPeriodEnd`;
- Subscription y Tenant en `ACTIVE`;
- un solo período nuevo;
- exactamente una auditoría económica;
- un ledger `FAILED` y uno `PROCESSED`;
- ningún ledger `DUPLICATE`;
- términos pendientes no limpiados más de una vez.

Las aserciones ahora cubren los efectos relevantes pedidos por la Fase 1H.

## 4. Históricos

Los escenarios 13–15 cubren la cuarentena y el replay:

- El pago histórico conserva `Payment.periodStart` y `Payment.periodEnd`.
- Subscription conserva período, estado y términos pendientes.
- Tenant no se reactiva.
- `approvedEffectAppliedAt` permanece `NULL`.
- `approvedEffectReconciliationRequired` permanece `true`.
- El ledger queda `RECONCILIATION_REQUIRED`.
- La auditoría contiene `reconciliationRequired: true` y `effectApplied: false`.
- Un pago reconciliado no extiende ante replay y queda `DUPLICATE`.
- Un pago nuevo nace con cuarentena falsa.
- El `upsert` no incluye el indicador de cuarentena en `update`, por lo que no lo limpia accidentalmente.

No observé una ruta alternativa que permita reclamar automáticamente el efecto de un histórico en cuarentena.

## 5. Evidencia del CLI

La función `findPaymentAuditEvidence`:

- consulta por `AuditLog.targetId = subscriptionId`;
- limita la acción al webhook de Mercado Pago;
- filtra en memoria por `metadata.provider = MERCADO_PAGO` y `metadata.externalId` exacto;
- no usa `tenantId` como evidencia;
- no cuenta otro pago de la misma suscripción;
- tolera metadata nula, texto, arrays o formas incompletas sin lanzar.

`summarizeAuditEvidence` devuelve solo cantidad, acciones y fecha más reciente. `runList` no imprime metadata completa, external IDs sin enmascarar, secretos, URLs ni credenciales.

El escenario 17 crea dos pagos distintos en la misma suscripción y confirma evidencia separada para cada uno y cero para un ID inexistente.

## 6. Doble confirmación

En un destino que no parece de pruebas, `mark-applied` exige simultáneamente:

- `--confirm-production`;
- `--confirm-payment-id`;
- coincidencia exacta entre `--confirm-payment-id` y `--payment-id`.

En una base de pruebas no exige repetir el ID. El parser rechaza wildcard y múltiples `--payment-id`. La confirmación no se obtiene desde variables de entorno. El CLI sigue procesando un solo pago y no existe comando de extensión automática.

## 7. Guard del entrypoint

El script usa:

```ts
const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
```

Por tanto:

- importar el módulo desde la suite no ejecuta `main()`;
- ejecutar el archivo como entrypoint directo sí ejecuta `main()`;
- `process.argv[1]` indefinido produce `false`, sin excepción;
- los helpers importados no ejecutan operaciones del CLI ni conectan por sí mismos a la base.

El cliente Prisma se importa como dependencia del módulo, pero no se consulta al importar; la suite de integración ya usa su cliente explícitamente.

No encontré un riesgo de efectos secundarios que bloquee la integración.

## 8. Rollback del enum

La migración documenta correctamente el orden de reversión:

1. eliminar `WebhookEvent`;
2. eliminar `WebhookEventResult` después de eliminar la tabla;
3. eliminar las columnas nuevas de `Payment`.

También documenta que `AuditAction.PAYMENT_RECONCILED` no puede retirarse con `ALTER TYPE ... DROP VALUE` y que debe permanecer como valor huérfano e inocuo. Si alguna vez fuera necesario retirarlo, se requeriría reconstruir el enum mediante una migración especial; no existe una reconstrucción destructiva automática.

No se ejecutó el rollback ni la migración.

## 9. Preparación de integración

La suite contiene **17 escenarios y 0 `skip`**.

Verificaciones estáticas:

- IDs únicos por ejecución mediante prefijo temporal y contador.
- Limpieza de Payment, Subscription, Tenant y AuditLog.
- Limpieza de WebhookEvent por tenant, `dataId` y `requestId`, incluidos huérfanos.
- Restauración de hooks y `fetch`.
- Firma HMAC construida con el mismo manifiesto que producción.
- `fetch` de Mercado Pago siempre mockeado.
- Sin llamadas a Mercado Pago real.
- Importación del helper del CLI sin ejecutar `main()`.
- Preparada para una `.env.test` dedicada y el runner seguro de pruebas.

No encontré un defecto estático que impida iniciar la suite después de aplicar la migración únicamente en la base de pruebas.

## 10. Typecheck, lint y pruebas puras

Ejecutados:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
```

Resultados:

- TypeScript: 0 errores.
- Lint: 0 warnings/errores.
- Pruebas puras: **95 tests, 95 passed, 0 failed, 0 skipped**.

El primer intento del runner dentro del sandbox produjo `spawn EPERM`; el reintento permitido fuera del sandbox terminó correctamente. No se modificaron archivos.

## 11. Hallazgos

No quedan hallazgos críticos o altos abiertos dentro del alcance de la Fase 1H.

### F1H-01 — Validación PostgreSQL aún pendiente

- Severidad: Operativa.
- Archivo/símbolo: suite de integración completa.
- Comportamiento: los 17 escenarios están preparados, pero aún no se ejecutan contra PostgreSQL.
- Impacto: no existe todavía evidencia de ejecución real de transacciones, enums, migración y concurrencia en la base dedicada.
- Corrección mínima: crear `.env.test`, aplicar la migración solo allí y ejecutar la suite segura.
- ¿Bloquea crear la base de pruebas?: No.
- ¿Bloquea ejecutar integración?: No; es el siguiente paso autorizado.
- ¿Bloquea el commit?: No como defecto de código, pero el commit de release debe esperar el resultado.

### F1H-02 — `prisma generate` en CI limpio pendiente

- Severidad: Baja/operativa.
- Archivo/símbolo: generación del cliente Prisma.
- Comportamiento: en Windows se reportó bloqueo EPERM del DLL; typecheck actual pasa.
- Impacto: un entorno de deploy debe confirmar generación limpia.
- Corrección mínima: verificar `prisma generate` en CI/entorno limpio.
- ¿Bloquea crear la base de pruebas?: No.
- ¿Bloquea ejecutar integración?: No si el cliente ya se genera correctamente en ese entorno.
- ¿Bloquea el commit?: No por sí solo; queda como verificación de CI.

## 12. Riesgos aceptados

- No se ejecutó la integración en esta fase por restricción expresa.
- La migración todavía debe aplicarse solo a una base dedicada.
- La reconciliación histórica continúa siendo manual.
- Precedencia de eventos fuera de orden, carreras cron/webhook, cancelación, métricas, retención del ledger y rate limiting permanecen fuera de alcance.
- El rollback del enum de auditoría no es simétrico, pero queda documentado y es inocuo.

Estos riesgos no impiden crear la base exclusiva ni ejecutar la integración solicitada.

## 13. Recomendación

# LISTA PARA CREAR BASE DE PRUEBAS

La siguiente acción autorizada es preparar una base PostgreSQL exclusiva con `.env.test`, aplicar allí la migración y ejecutar la suite de integración segura. No debe usarse la base de desarrollo ni producción.

## 14. Recomendación sobre commit

La implementación está lista para pasar a validación de integración, pero recomiendo esperar el resultado de los 17 escenarios y la confirmación de Prisma en CI antes del commit de release.

No se hizo commit.

## 15. Veredicto

# APROBADA PARA INTEGRACIÓN

Las correcciones F1F-01 a F1F-04 quedaron verificadas estáticamente. No se modificó código, schema, migración, configuración ni pruebas en esta revisión; no se ejecutó Prisma, migración, integración, PostgreSQL, build, commit o push. La revisión termina aquí.
