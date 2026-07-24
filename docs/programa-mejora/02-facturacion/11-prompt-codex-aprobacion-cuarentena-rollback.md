# FASE 1F — APROBACIÓN FINAL DE CUARENTENA HISTÓRICA Y ROLLBACK

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/02-facturacion/11-prompt-codex-aprobacion-cuarentena-rollback.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al finalizar:

3. Crea:

`docs/programa-mejora/02-facturacion/12-respuesta-codex-aprobacion-cuarentena-rollback.md`

4. Guarda allí el informe final completo.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, schema, migraciones, scripts ni pruebas.

---

Actúa como revisor técnico final e independiente especializado en Prisma, PostgreSQL, idempotencia económica, migraciones seguras y pruebas de rollback.

Esta revisión es limitada. No repitas toda la auditoría de facturación.

Debes verificar únicamente las correcciones implementadas en la Fase 1E y determinar si el código está listo para pasar a la validación contra una base de pruebas dedicada.

## Documentos obligatorios

Lee:

* `docs/programa-mejora/02-facturacion/08-respuesta-codex-revision-idempotencia-atomicidad.md`
* `docs/programa-mejora/02-facturacion/09-prompt-claude-correcciones-historicas-rollback.md`
* `docs/programa-mejora/02-facturacion/10-respuesta-claude-correcciones-historicas-rollback.md`
* `docs/TESTING.md`

La fuente de verdad es el código y el diff actual.

## Objetivos de la revisión

Confirmar:

1. Los pagos históricos aprobados quedan en cuarentena.
2. Un replay histórico no puede extender una licencia.
3. Los pagos nuevos funcionan normalmente.
4. La reconciliación manual no modifica períodos.
5. Las pruebas de rollback dejaron de estar en `skip`.
6. El seam de fallos no puede ser controlado desde HTTP o variables de entorno.
7. Las pruebas verifican los efectos atómicos relevantes.
8. Las solicitudes sin `dataId` no escriben ledger.
9. La migración es aditiva y coherente.
10. El código puede pasar a validación con PostgreSQL de pruebas.

## Restricciones

No debes:

* Modificar archivos diferentes a los dos documentos permitidos.
* Aplicar migraciones.
* Ejecutar Prisma contra una base.
* Ejecutar `npm test`.
* Ejecutar pruebas que importen Prisma.
* Ejecutar build.
* Levantar servidor.
* Conectarte a PostgreSQL.
* Llamar a Mercado Pago.
* Instalar dependencias.
* Hacer commit o push.
* Mostrar secretos.

Puedes ejecutar:

```text
git status
git diff
git diff --check
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
```

No ejecutes `npx prisma generate` durante esta revisión.

## Primera acción

1. Guarda este prompt.
2. Ejecuta `git status`.
3. Inspecciona el diff completo.
4. Confirma que la migración sigue sin aplicarse.
5. Revisa:

   * `prisma/schema.prisma`
   * La migración `20260722000100_add_webhook_event_ledger_and_payment_effect`
   * `src/domains/billing/mercado-pago.service.ts`
   * `src/domains/billing/reconciliation.ts`
   * `scripts/reconcile-historical-payment-effects.ts`
   * `tests/billing-webhook-idempotency.test.ts`
   * `tests/unit/billing-reconciliation.test.ts`
   * `src/domains/platform/audit.service.ts`

# 1. Cuarentena histórica

Confirma que la migración:

* Añade `approvedEffectAppliedAt`.
* Añade `approvedEffectReconciliationRequired` con default `false`.
* Marca como `true` únicamente los pagos que ya existen y cumplen:

  * `provider = MERCADO_PAGO`.
  * `status = APPROVED`.
* No modifica períodos.
* No modifica importes.
* No modifica `paidAt`.
* No fija automáticamente `approvedEffectAppliedAt`.

Analiza el orden SQL:

1. Creación de columnas.
2. Update de históricos.
3. Creación o modificación de enums.
4. Creación del ledger e índices.

Busca errores de nombres, tipos, comillas o valores de enum.

## Escenario obligatorio

Reconstruye:

1. Existe un pago histórico `APPROVED`.
2. La migración lo marca en cuarentena.
3. Llega un replay de Mercado Pago.
4. El upsert actualiza metadata.
5. El código detecta la cuarentena.
6. No reclama el efecto.
7. No cambia el período.
8. No limpia términos pendientes.
9. No reactiva Tenant.
10. Ledger termina en `RECONCILIATION_REQUIRED`.

Confirma que no exista una ruta alternativa que omita esta condición.

# 2. Pagos nuevos

Confirma que un pago creado después de la migración:

* Nace con `approvedEffectReconciliationRequired = false`.
* Si es `PENDING`, conserva el marcador económico en `NULL`.
* Cuando pasa a `APPROVED`, puede reclamar el efecto.
* El reclamo exige:

  * `status = APPROVED`.
  * `approvedEffectAppliedAt = null`.
  * `approvedEffectReconciliationRequired = false`.
* Un segundo `APPROVED` no vuelve a extender.
* Dos solicitudes simultáneas solo permiten un efecto.

Busca si el `upsert` podría cambiar accidentalmente el indicador de cuarentena de un pago histórico.

# 3. Pago reconciliado

Revisa la semántica de:

`mark-applied --payment-id <id> --reason "<motivo>"`

Confirma que:

* Opera sobre un único pago.
* Exige motivo.
* Solo admite pagos en cuarentena.
* No modifica `Subscription`.
* No modifica `Tenant`.
* No modifica `Payment.periodStart`.
* No modifica `Payment.periodEnd`.
* No extiende licencias.
* Fija `approvedEffectAppliedAt`.
* Limpia `approvedEffectReconciliationRequired`.
* Registra `PAYMENT_RECONCILED`.
* Usa transacción.

Reconstruye qué ocurre cuando Mercado Pago reenvía ese pago después de reconciliarlo:

* El marcador ya está establecido.
* No se reclama el efecto.
* Se clasifica como `DUPLICATE`.
* No se extiende.

# 4. Seguridad del CLI

Revisa:

`scripts/reconcile-historical-payment-effects.ts`

Confirma:

* `list` es el modo por defecto.
* `list` no modifica datos.
* `mark-applied` exige todos los argumentos.
* No existe wildcard.
* No existe opción de procesar todos.
* No existe comando de extensión.
* El ID externo se enmascara.
* No imprime URLs ni credenciales.
* No llama a Mercado Pago.
* Rechaza una operación de escritura en una base no identificada como test salvo `--confirm-production`.
* La confirmación de producción es explícita y no puede activarse por variable de entorno.
* La auditoría conserva el motivo.

Evalúa si `--confirm-production` es suficiente para una herramienta operada por una persona o si requiere además repetir el ID del pago. Clasifica esa mejora como bloqueante o recomendada.

# 5. Seam de fallos

Revisa:

`__unsafeSetBillingTestHooks`

Confirma que:

* No se acepta desde HTTP.
* No se obtiene de query params.
* No se obtiene del body.
* No se obtiene de headers.
* No se obtiene de variables de entorno.
* El valor productivo es no-op.
* Las pruebas lo restauran después de cada escenario.
* Un test no puede contaminar otro.
* Los pasos se ejecutan dentro de la transacción.
* Un `throw` hace rollback.

Evalúa si la función queda exportada desde un módulo que pudiera ser usada accidentalmente por producción. Distingue:

* Riesgo teórico de un desarrollador modificando código.
* Ruta accidental accesible en runtime.
* Bloqueante real.

# 6. Pruebas de rollback

Lee completamente los escenarios 5–8.

Confirma que ya no usan `skip`.

Para cada escenario verifica que las aserciones cubren:

* Payment.
* `approvedEffectAppliedAt`.
* Estado de cuarentena.
* Período de Payment.
* Período de Subscription.
* Estado de Subscription.
* Estado de Tenant.
* AuditLog.
* Resultado del ledger.
* Reintento posterior.

Confirma que el reintento:

* Reclama el efecto una vez.
* Extiende un solo período.
* Deja el marcador establecido.
* No crea auditoría económica duplicada.

Clasifica cualquier aserción faltante como:

* Bloqueante.
* Importante.
* Menor.

# 7. Pruebas históricas

Revisa los escenarios 13–15.

Confirma que prueban:

1. Pago histórico en cuarentena no extiende.
2. Ledger `RECONCILIATION_REQUIRED`.
3. Pago reconciliado no extiende ante replay.
4. Pago nuevo no nace en cuarentena.
5. El indicador no se limpia accidentalmente por el upsert.

# 8. Eventos sin dataId

Confirma que una petición sin `dataId`:

* Retorna sin procesar.
* No valida ni construye un manifiesto inválido.
* No crea `WebhookEvent`.
* No llama a `fetch`.
* No modifica Payment.
* No modifica Subscription.
* No modifica Tenant.
* No registra payload.
* No provoca una excepción que fuerce reintentos.

Confirma que la prueba correspondiente demuestra al menos:

* Conteo de ledger sin cambios.
* `fetch` no invocado.

# 9. AuditAction y enums

Confirma que:

* `PAYMENT_RECONCILED` existe en `schema.prisma`.
* La migración lo añade al enum PostgreSQL.
* `audit.service.ts` lo reconoce.
* El código puede compilar.
* La migración no intenta utilizar el nuevo valor dentro de una operación SQL incompatible en la misma transacción.
* El rollback documenta que eliminar valores de enum no es trivial.

Revisa también `WebhookEventResult.RECONCILIATION_REQUIRED`.

# 10. Pruebas unitarias

Antes de ejecutar, confirma que no importan Prisma.

Ejecuta:

```text
npx tsx --test tests/unit/*.test.ts
```

Confirma:

* Número real.
* Resultado.
* Cobertura de clasificación histórico/nuevo.
* Condiciones de reclamo.
* Enmascarado.
* Parseo del CLI.
* Protección de metadata.

# 11. Typecheck y lint

Ejecuta:

```text
npx tsc --noEmit
npm run lint
```

# 12. Pruebas de integración pendientes

No las ejecutes.

Evalúa estáticamente si:

* No contienen `skip`.
* Importan Prisma únicamente dentro de la suite de integración.
* Usan IDs únicos.
* Limpian ledger huérfano.
* Restauran hooks.
* Mockean `fetch`.
* Construyen firma correctamente.
* Están listas para ejecutarse con `.env.test`.

Determina si existe algún defecto que impediría ejecutarlas cuando se cree la base de pruebas.

# 13. Prisma generate

No ejecutes Prisma.

Evalúa el reporte del `EPERM`:

* El cliente generado no está rastreado.
* TypeScript compila.
* `postinstall` y build regeneran cliente.
* El bloqueo ocurrió en Windows.
* Debe verificarse en entorno limpio antes de despliegue.

Determina si esto:

* Bloquea pasar a pruebas de integración.
* Bloquea el commit.
* Bloquea producción.

# 14. Alcance

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

# Hallazgos

Para cada hallazgo:

* ID.
* Severidad.
* Archivo y símbolo.
* Comportamiento.
* Escenario.
* Impacto.
* Evidencia.
* Corrección mínima.
* Prueba requerida.
* ¿Bloquea crear la base de test?: Sí/No.
* ¿Bloquea el commit?: Sí/No.

# Criterios para aprobar

La fase puede aprobarse para pasar a validación con PostgreSQL si:

1. La cuarentena histórica es efectiva.
2. Un replay histórico no extiende.
3. La reconciliación no modifica períodos.
4. Los pagos nuevos no quedan bloqueados.
5. Los cuatro rollback tests ya no están omitidos.
6. El seam no es accesible desde HTTP.
7. Las pruebas principales tienen aserciones suficientes.
8. Missing `dataId` no crea ledger.
9. Migración y schema coinciden.
10. Typecheck, lint y pruebas puras pasan.
11. No existen hallazgos críticos o altos abiertos en el código.
12. Las únicas validaciones pendientes requieren realmente PostgreSQL o CI limpio.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance.
4. Cuarentena histórica.
5. Pagos nuevos.
6. Reconciliación.
7. Seguridad del CLI.
8. Seam de fallos.
9. Pruebas de rollback.
10. Pruebas históricas.
11. Missing dataId.
12. Enums y migración.
13. Pruebas unitarias.
14. Typecheck y lint.
15. Preparación de pruebas de integración.
16. Prisma generate.
17. Hallazgos.
18. Riesgos aceptados.
19. Recomendación:

* LISTA PARA CREAR BASE DE PRUEBAS.
* REQUIERE CORRECCIONES.

20. Recomendación sobre commit.
21. Veredicto:

* APROBADA PARA VALIDACIÓN.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe completo en:

`docs/programa-mejora/02-facturacion/12-respuesta-codex-aprobacion-cuarentena-rollback.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/02-facturacion/11-prompt-codex-aprobacion-cuarentena-rollback.md`

3. No modifiques código.

4. No hagas commit.

5. No ejecutes integración.

6. No continúes con cron, precedencia, cancelación o métricas.

7. Detente después del informe.
