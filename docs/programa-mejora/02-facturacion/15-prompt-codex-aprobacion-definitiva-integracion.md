# FASE 1H — APROBACIÓN DEFINITIVA ANTES DE PRUEBAS DE INTEGRACIÓN

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/02-facturacion/15-prompt-codex-aprobacion-definitiva-integracion.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al finalizar:

3. Crea:

`docs/programa-mejora/02-facturacion/16-respuesta-codex-aprobacion-definitiva-integracion.md`

4. Guarda allí el informe final completo.

Solo puedes crear o modificar esos dos documentos.

---

Actúa como revisor técnico final e independiente.

Esta revisión es deliberadamente corta. No repitas toda la auditoría de facturación.

Debes verificar únicamente que las correcciones F1F-01 a F1F-04 quedaron correctamente aplicadas y que el proyecto está listo para crear una base PostgreSQL exclusiva de pruebas y ejecutar la integración.

## Documentos obligatorios

Lee:

* `docs/programa-mejora/02-facturacion/12-respuesta-codex-aprobacion-cuarentena-rollback.md`
* `docs/programa-mejora/02-facturacion/13-prompt-claude-correcciones-finales-pruebas-cli.md`
* `docs/programa-mejora/02-facturacion/14-respuesta-claude-correcciones-finales-pruebas-cli.md`
* `docs/TESTING.md`

La fuente de verdad es el código y el diff actual.

## Restricciones

No debes:

* Modificar código.
* Modificar schema o migraciones.
* Ejecutar Prisma.
* Aplicar migraciones.
* Ejecutar `npm test`.
* Ejecutar pruebas que importen Prisma.
* Conectarte a PostgreSQL.
* Llamar a Mercado Pago.
* Ejecutar build.
* Hacer commit o push.

Puedes ejecutar:

```text
git status
git diff
git diff --check
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
```

## Verificación 1 — Rollback

Revisa los escenarios 5–8 de:

`tests/billing-webhook-idempotency.test.ts`

Confirma que:

* No contienen `skip`.
* Cada escenario distingue correctamente entre una fila Payment inexistente y una fila revertida.
* Después de un fallo no queda Payment parcial.
* Subscription conserva todos los campos económicos y pendientes.
* Tenant no queda reactivado ni divergente.
* No queda AuditLog económico parcial.
* El WebhookEvent termina en `FAILED`.
* No aparece `PROCESSED` ni `DUPLICATE` en el intento fallido.

Para el reintento confirma:

* Existe una sola fila Payment.
* El marcador queda establecido.
* La cuarentena queda desactivada.
* Payment y Subscription comparten períodos.
* Subscription y Tenant quedan `ACTIVE`.
* Solo se añade un período.
* Existe exactamente una auditoría económica.
* Existe un ledger `FAILED` y uno `PROCESSED`.
* No existe ledger `DUPLICATE`.

## Verificación 2 — Pagos históricos

Revisa los escenarios 13–15.

Confirma que:

* Un pago histórico en cuarentena no cambia períodos.
* No limpia términos pendientes.
* No reactiva Tenant.
* Mantiene el marcador nulo y la cuarentena activa.
* Produce `RECONCILIATION_REQUIRED`.
* La auditoría indica `effectApplied: false`.
* Un pago reconciliado no extiende en replay y produce `DUPLICATE`.
* Un pago nuevo nace con cuarentena falsa.
* El upsert no limpia accidentalmente la cuarentena histórica.

## Verificación 3 — Evidencia del CLI

Revisa:

* `findPaymentAuditEvidence`
* `auditMetadataMatchesPayment`
* `summarizeAuditEvidence`
* `runList`

Confirma que:

* La búsqueda usa `subscriptionId`.
* No usa `tenantId` como evidencia del webhook.
* Filtra por el external ID exacto del Payment.
* Una auditoría de otro pago de la misma suscripción no cuenta.
* Metadata nula o malformada no lanza excepciones.
* La salida incluye solo cantidad, acciones y fecha.
* No muestra metadata completa, IDs externos completos ni secretos.

Revisa el escenario 17 y confirma que distingue dos pagos de la misma suscripción.

## Verificación 4 — Doble confirmación

Confirma que, en un destino que no parece de pruebas, `mark-applied` exige simultáneamente:

* `--confirm-production`
* `--confirm-payment-id`
* Coincidencia exacta entre `--confirm-payment-id` y `--payment-id`

Confirma también que:

* En base de pruebas no se exige la segunda confirmación.
* Se rechazan wildcards.
* Se rechazan múltiples IDs.
* No se obtiene confirmación desde variables de entorno.
* El CLI sigue procesando un solo pago por ejecución.
* No existe comando de extensión automática.

## Verificación 5 — Guard del entrypoint

Revisa el guard:

`import.meta.url === pathToFileURL(process.argv[1]).href`

Confirma que:

* Importar el módulo desde las pruebas no ejecuta `main()`.
* Ejecutar el script directamente sí ejecuta `main()`.
* No produce error si `process.argv[1]` no está disponible en un contexto de importación o test.
* No provoca efectos secundarios de conexión al importar helpers.

Si existe riesgo con `process.argv[1]` indefinido, clasifícalo y determina si bloquea.

## Verificación 6 — Rollback del enum

Confirma que la migración documenta correctamente:

* Eliminación de `WebhookEvent`.
* Eliminación de las columnas de Payment.
* Eliminación de `WebhookEventResult` después de eliminar la tabla.
* Permanencia inocua de `AuditAction.PAYMENT_RECONCILED`.
* Necesidad de una migración especial para reconstruir el enum si alguna vez se quisiera retirar.
* Ausencia de una reconstrucción destructiva automática.

## Verificación 7 — Preparación de integración

Revisa estáticamente la suite completa.

Confirma:

* 17 escenarios.
* Cero `skip`.
* IDs únicos.
* Limpieza de Payment, Subscription, Tenant, AuditLog y WebhookEvent.
* Limpieza de eventos huérfanos por `dataId` y `requestId`.
* Restauración de hooks y `fetch`.
* Firma HMAC coherente con producción.
* No llama a Mercado Pago real.
* Está preparada para ejecutarse con una `.env.test` dedicada.

Determina si existe algún defecto que impediría iniciar la suite después de aplicar la migración en la base de pruebas.

## Verificación 8 — Validaciones estáticas

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
```

Confirma el número real de pruebas y su resultado.

## Alcance

Confirma que no se modificaron:

* Cron.
* Precedencia completa.
* Cancelación.
* Métricas.
* UI.
* Legal.
* Autenticación.
* Storage.
* Soporte.

## Hallazgos

Para cada hallazgo incluye:

* ID.
* Severidad.
* Archivo y símbolo.
* Comportamiento.
* Impacto.
* Corrección mínima.
* ¿Bloquea crear la base de pruebas?: Sí/No.
* ¿Bloquea ejecutar integración?: Sí/No.
* ¿Bloquea el commit?: Sí/No.

## Criterios de aprobación

Puede aprobarse si:

1. Las aserciones de rollback son completas.
2. Los históricos quedan protegidos.
3. La evidencia del CLI corresponde al pago exacto.
4. La confirmación de producción exige dos señales.
5. Importar el CLI no ejecuta `main`.
6. No existen `skip`.
7. La suite está preparada para PostgreSQL.
8. Typecheck, lint y pruebas puras pasan.
9. No existen hallazgos críticos o altos abiertos dentro del alcance.

## Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Rollback.
4. Históricos.
5. Evidencia del CLI.
6. Doble confirmación.
7. Guard del entrypoint.
8. Rollback del enum.
9. Preparación de integración.
10. Typecheck, lint y pruebas puras.
11. Hallazgos.
12. Riesgos aceptados.
13. Recomendación:

* LISTA PARA CREAR BASE DE PRUEBAS.
* REQUIERE CORRECCIONES.

14. Recomendación sobre commit.
15. Veredicto:

* APROBADA PARA INTEGRACIÓN.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/02-facturacion/16-respuesta-codex-aprobacion-definitiva-integracion.md`

2. Confirma que el prompt fue guardado en:

`docs/programa-mejora/02-facturacion/15-prompt-codex-aprobacion-definitiva-integracion.md`

3. No modifiques código.

4. No ejecutes integración.

5. No hagas commit.

6. Detente después del informe.
