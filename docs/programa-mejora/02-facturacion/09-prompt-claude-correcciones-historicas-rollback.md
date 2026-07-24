# FASE 1E — CORRECCIÓN DEL DESPLIEGUE HISTÓRICO Y PRUEBAS DE ROLLBACK

## Documentación automática

Antes de trabajar:

1. Crea:

`docs/programa-mejora/02-facturacion/09-prompt-claude-correcciones-historicas-rollback.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/02-facturacion/10-respuesta-claude-correcciones-historicas-rollback.md`

4. Guarda allí el informe final completo.

No modifiques documentos anteriores.

---

Actúa como ingeniero principal especializado en Prisma, PostgreSQL, migraciones seguras, idempotencia económica y pruebas de atomicidad.

Debes corregir los hallazgos F1D-01 a F1D-05 encontrados por Codex.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/02-facturacion/06-respuesta-claude-implementacion-idempotencia-atomicidad.md`
* `docs/programa-mejora/02-facturacion/08-respuesta-codex-revision-idempotencia-atomicidad.md`
* `docs/TESTING.md`

La fuente de verdad es el código y el diff actual.

## Objetivos

Corregir:

1. Riesgo de replay de pagos históricos.
2. Pruebas de rollback actualmente marcadas `skip`.
3. Aserciones incompletas de integración.
4. Escritura no autenticada de eventos sin `dataId`.
5. Verificación limpia de generación del cliente Prisma.

No continúes todavía con precedencia, cron, cancelación ni métricas.

## Restricciones

No debes:

* Conectarte a producción.
* Aplicar migraciones.
* Ejecutar seeds.
* Ejecutar Prisma Studio.
* Llamar a Mercado Pago.
* Ejecutar build.
* Hacer commit o push.
* Mostrar secretos.
* Modificar variables reales.
* Utilizar pagos simulados como sustituto de pruebas.
* Ejecutar integración sin una `.env.test` dedicada y aprobada por el guard.

Puedes:

* Modificar schema y la migración aún no aplicada.
* Modificar servicios y pruebas de facturación.
* Añadir un seam de fallo exclusivamente controlable desde tests.
* Crear tooling de reconciliación seguro.
* Ejecutar `npx prisma generate`, ya que no conecta a la base.
* Ejecutar typecheck, lint y pruebas puras.
* Ejecutar integración solamente si existe una base dedicada segura.

## Primera acción

1. Ejecuta `git status`.
2. Confirma que la migración no fue aplicada.
3. Confirma que no hay commit de la implementación 1C.
4. Guarda este prompt.
5. Revisa completamente los archivos modificados en 1C.
6. Verifica directamente cada hallazgo F1D antes de editar.

# 1. Pagos históricos: política obligatoria de cuarentena

No realices un backfill ciego que asuma que todos los pagos históricos aprobaron correctamente su efecto.

La solución debe garantizar que:

* Ningún pago `MERCADO_PAGO + APPROVED` existente antes de esta migración pueda extender automáticamente la licencia después del despliegue.
* Los pagos creados después de la migración funcionen normalmente.
* Los pagos históricos puedan distinguirse de los nuevos.
* Los casos históricos queden visibles para reconciliación manual.
* No se borren ni modifiquen períodos históricos.
* No se aplique una extensión automática durante la migración.

## Diseño recomendado

Añade a `Payment`, además de `approvedEffectAppliedAt`, un indicador explícito equivalente a:

```text
approvedEffectReconciliationRequired Boolean @default(false)
```

Puedes usar un nombre mejor si mantiene esta semántica.

La migración debe:

1. Crear las columnas nuevas.
2. Marcar como `reconciliationRequired = true` todos los pagos que ya existían y cumplen:

   * `provider = MERCADO_PAGO`
   * `status = APPROVED`
3. No establecer automáticamente `approvedEffectAppliedAt`.
4. No extender suscripciones.
5. No modificar `periodStart`, `periodEnd`, `paidAt` ni importes.

Los pagos nuevos deben crearse con:

```text
approvedEffectReconciliationRequired = false
```

## Handler

Cuando llegue un `APPROVED` para un pago histórico marcado:

* No debe reclamar el efecto económico.
* No debe cambiar `currentPeriodEnd`.
* No debe limpiar términos pendientes.
* No debe reactivar automáticamente.
* Debe actualizar únicamente metadata no económica cuando sea seguro.
* Debe marcar el ledger con un resultado explícito, por ejemplo:

  * `RECONCILIATION_REQUIRED`.
* Debe registrar una auditoría segura.
* Debe responder sin producir reintentos económicos infinitos.

No confundas este caso con `DUPLICATE`, porque todavía no se ha afirmado que el efecto esté reconciliado.

## Reconciliación manual mínima

Añade una herramienta administrativa por CLI, no una interfaz.

Ruta recomendada:

`scripts/reconcile-historical-payment-effects.ts`

Debe soportar como mínimo:

### Modo de lectura

```text
list
```

Debe mostrar, sin secretos:

* ID local del Payment.
* ID externo parcialmente enmascarado.
* Tenant.
* Estado.
* paidAt.
* periodStart.
* periodEnd.
* Si requiere reconciliación.
* Evidencia de auditoría disponible.

### Marcar como ya aplicado

```text
mark-applied --payment-id <id> --reason "<motivo>"
```

Debe:

* Exigir `payment-id`.
* Exigir motivo no vacío.
* Funcionar dentro de una transacción.
* Establecer `approvedEffectAppliedAt` usando `paidAt` cuando exista o la hora actual.
* Limpiar `approvedEffectReconciliationRequired`.
* No modificar el período.
* Registrar AuditLog con actor de sistema y motivo.
* No mostrar credenciales.

No añadas un comando automático para extender períodos históricos.

Un caso donde el pago sí ocurrió pero el efecto no fue aplicado debe resolverse mediante revisión y acción administrativa posterior, no mediante replay automático.

## Protección del script

El script debe:

* Reutilizar las protecciones de entorno existentes cuando corresponda.
* Rechazar producción salvo una confirmación operativa explícita y documentada.
* Tener modo lectura como opción por defecto.
* No ejecutar cambios sin el subcomando `mark-applied`.
* No procesar todos los pagos mediante un wildcard.
* Operar sobre un único `payment-id` por ejecución.
* No llamar a Mercado Pago.

No ejecutes el script contra ninguna base en esta sesión.

# 2. Garantía de pagos nuevos

Asegura que el reclamo económico exija:

```text
approvedEffectAppliedAt = null
approvedEffectReconciliationRequired = false
status = APPROVED
```

Un pago histórico en cuarentena nunca debe obtener `count = 1`.

Un pago nuevo:

* `PENDING → APPROVED`: debe reclamar una vez.
* `APPROVED` repetido: no debe reclamar de nuevo.
* Dos `APPROVED` concurrentes: solo uno debe aplicar.

# 3. Seam de fallos para pruebas

Implementa un seam mínimo, explícito y no accesible desde las rutas productivas.

Puede ser una dependencia opcional interna equivalente a:

```typescript
onTestStep?: (step: BillingTransactionStep) => void | Promise<void>
```

Pasos mínimos:

* `AFTER_PAYMENT_UPSERT`
* `AFTER_EFFECT_CLAIM`
* `AFTER_SUBSCRIPTION_UPDATE`
* `AFTER_TENANT_UPDATE`
* `BEFORE_AUDIT_LOG`
* `BEFORE_WEBHOOK_RESULT`

Requisitos:

* El flujo productivo usa siempre una implementación vacía.
* Las rutas HTTP no aceptan este parámetro desde el request.
* No se controla mediante variables de entorno.
* No se exporta como API pública general.
* Solo las pruebas pueden inyectarlo mediante una función interna explícita.
* No debe cambiar la lógica normal.

# 4. Activar las pruebas de rollback

Elimina los `skip` de los cuatro escenarios:

1. Fallo después del reclamo y antes de actualizar Subscription.
2. Fallo después de actualizar Subscription y antes de Tenant.
3. Fallo al crear AuditLog.
4. Reintento posterior al rollback.

Cada prueba debe verificar:

* El marcador vuelve a `NULL`.
* El estado de Payment no queda parcialmente actualizado cuando corresponda.
* El período de Subscription no cambia.
* Tenant no queda divergente.
* No existe AuditLog económico parcial.
* El ledger termina en `FAILED` o el resultado documentado.
* El reintento posterior aplica el efecto una sola vez.
* Después del reintento existe un único período nuevo.
* Después del reintento el marcador queda establecido.

Las pruebas no deben depender del orden de ejecución.

# 5. Ampliar aserciones de integración

En los escenarios principales verifica explícitamente:

* `Payment.approvedEffectAppliedAt`.
* `approvedEffectReconciliationRequired`.
* `Payment.periodStart`.
* `Payment.periodEnd`.
* `Subscription.currentPeriodStart`.
* `Subscription.currentPeriodEnd`.
* `Subscription.status`.
* `Tenant.status`.
* Cantidad y metadata segura de `AuditLog`.
* Resultado final de `WebhookEvent`.
* Ausencia de doble limpieza de campos pendientes.
* Ausencia de efectos duplicados.

Añade escenarios para:

1. Pago histórico marcado como reconciliación requerida no extiende.
2. Pago histórico reconciliado manualmente no extiende ante replay.
3. Pago nuevo no queda marcado para reconciliación.
4. Evento `APPROVED` histórico queda registrado como `RECONCILIATION_REQUIRED`.

## Limpieza

La limpieza de pruebas debe eliminar:

* Ledger asociado por tenant.
* Ledger con tenant nulo asociado por `dataId` o request ID.
* AuditLog.
* Payments.
* Subscription.
* Tenant.
* PricingRule creada.

# 6. Eventos sin dataId

No guardes una fila económica de `WebhookEvent` para una petición sin `dataId` que no puede autenticarse correctamente.

Comportamiento recomendado:

* Validar estructura mínima.
* Retornar `processed: false` con razón segura.
* No crear ledger.
* No aplicar ningún efecto.
* No imprimir payload.
* No devolver secretos.

Añade una prueba pura o de ruta que confirme:

* Una petición sin `dataId` no crea `WebhookEvent`.
* No llama a Mercado Pago.
* No cambia Payment, Subscription o Tenant.

No implementes rate limiting en esta fase.

# 7. Resultado del ledger

Añade, si es necesario:

```text
RECONCILIATION_REQUIRED
```

al enum del ledger.

Confirma que:

* `DUPLICATE` significa que el efecto ya fue aplicado.
* `RECONCILIATION_REQUIRED` significa que el pago es histórico y no está clasificado.
* `FAILED` significa fallo técnico.
* `IGNORED` queda para eventos estructuralmente válidos pero no procesables.
* Solicitudes sin `dataId` no se persisten.

# 8. Migración actualizada

Como la migración no fue aplicada, modifica la migración existente en vez de crear una segunda migración correctiva.

Debe:

* Añadir el marcador.
* Añadir el indicador de reconciliación.
* Crear enum y tabla de ledger.
* Marcar pagos históricos aprobados de Mercado Pago para reconciliación.
* No modificar el período.
* No asumir que el efecto fue aplicado.
* Ser aditiva.
* Ser compatible con PostgreSQL.
* Tener comentarios claros.

Incluye en el informe el SQL exacto de la parte de cuarentena.

No ejecutes la migración.

# 9. Verificación del cliente Prisma

Ejecuta:

```text
npx prisma generate
```

No conecta a la base.

Si Windows produce nuevamente `EPERM`:

1. No borres manualmente archivos de dependencias.
2. No reinstales paquetes.
3. No uses comandos destructivos.
4. Registra el error exacto sin revelar rutas sensibles.
5. Confirma si el cliente se generó o no.
6. Clasifica el riesgo para CI.

Comprueba que:

* `package-lock.json` no cambió.
* No aparecieron archivos generados rastreados.
* Una instalación limpia podrá ejecutar `postinstall`.

# 10. Pruebas puras

Añade pruebas puras para:

* Clasificación pago histórico/nuevo.
* Condiciones necesarias para reclamar efecto.
* Construcción de metadata de reconciliación.
* Enmascarado del ID externo.
* Validación del comando CLI sin conectarse.
* Solicitud sin dataId no persistible.

No deben importar Prisma cuando sea posible.

# 11. Pruebas de integración

Añade y deja ejecutables todas las pruebas.

Antes de ejecutarlas verifica:

* Existe `.env.test`.
* Es una base dedicada.
* El guard seguro la acepta.
* `DATABASE_URL` y `DIRECT_URL` normales no se heredan.

Si no existe, no ejecutes `npm test`. No reutilices la base normal.

Las pruebas deben quedar compilando y sin `skip`.

# 12. Validaciones

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
```

También:

```text
npx prisma generate
```

No ejecutes integración si no existe base segura.

# Criterios de aceptación

1. Todos los pagos históricos aprobados quedan en cuarentena.
2. Ningún replay histórico extiende automáticamente.
3. No existe backfill ciego como aplicado.
4. Existe reconciliación manual de un Payment por ejecución.
5. La reconciliación exige motivo.
6. La reconciliación no modifica períodos.
7. Pagos nuevos reclaman el efecto normalmente.
8. Las cuatro pruebas de rollback ya no están en `skip`.
9. Las pruebas verifican rollback completo.
10. Las aserciones principales cubren todos los modelos.
11. Solicitudes sin `dataId` no escriben ledger.
12. Existe resultado `RECONCILIATION_REQUIRED`.
13. La migración sigue siendo aditiva.
14. Prisma generate se verifica o documenta de forma exacta.
15. Typecheck, lint y pruebas puras pasan.
16. No se aplica migración.
17. No se llama a Mercado Pago.
18. No se hace commit.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git.
3. Confirmación de hallazgos.
4. Diseño de cuarentena histórica.
5. Migración actualizada.
6. Handler para pagos históricos.
7. CLI de reconciliación.
8. Garantía de pagos nuevos.
9. Seam de fallos.
10. Pruebas de rollback.
11. Aserciones ampliadas.
12. Eventos sin dataId.
13. Ledger y estados.
14. Cliente Prisma.
15. Archivos modificados.
16. Pruebas puras.
17. Pruebas de integración.
18. Comandos ejecutados.
19. Resultados.
20. Validaciones pendientes.
21. Compatibilidad.
22. Rollback.
23. Riesgos restantes.
24. Respuesta a F1D-01…F1D-05.
25. Estado:

* CORREGIDO.
* CORREGIDO CON VALIDACIÓN PENDIENTE.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/02-facturacion/10-respuesta-claude-correcciones-historicas-rollback.md`

2. Confirma que el prompt se guardó en:

`docs/programa-mejora/02-facturacion/09-prompt-claude-correcciones-historicas-rollback.md`

3. No hagas commit.

4. No continúes con cron, precedencia, cancelación o métricas.

5. Detente después del informe.
