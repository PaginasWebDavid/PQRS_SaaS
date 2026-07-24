# FASE 1J — Corrección de aserciones temporales y cierre de integración (informe)

## 1. Resumen ejecutivo

Se corrigieron las **cuatro aserciones temporales** que fallaban (escenarios 1, 3, 4, 8 de `tests/billing-webhook-idempotency.test.ts`). Ya no comparan contra `start_del_test + 30 días` (un reloj capturado varios segundos antes del webhook), sino contra el **período persistido** leído de la base tras procesar, validando la duración con la **misma semántica de calendario del servicio** (`addDays` vía `setDate`, no ms fijos). Se conservaron todas las aserciones económicas (marcador, efecto único, estados, ledger, auditoría, no-duplicados) y se añadieron las demostraciones que el prompt pedía (PENDING no aplica marcador; replay no re-extiende; concurrencia = un solo efecto). **Solo se modificó el archivo de pruebas**; producción, schema y migraciones sin cambios. Resultado: `tsc` limpio, `lint` limpio, **95/95 pruebas puras**, y **`npm test`: 147/147, 0 fallos, 0 skip** (~115 s) contra el Supabase autorizado. Los **17 escenarios de facturación pasan**, fixtures limpios, mockdata intacto, sin llamadas reales a Mercado Pago. **Estado: CORREGIDO.**

## 2. Estado inicial de Git

Commit `0141492`; implementación de facturación (1C/1E/1G) **sin commit**; migración `20260722000100_...` **ya aplicada** al proyecto autorizado (Fase 1I). `.env.test` presente e ignorado. `package-lock.json` sin cambios.

## 3. Confirmación de causa raíz

Confirmada: **es timing, no lógica.** Los 4 fallos previos comparaban `currentPeriodEnd` contra `expectedEnd(start)` = `start + 30d`, con `start = new Date()` capturado antes del webhook. El servicio calcula `periodStart = max(currentPeriodEnd_previo, now_procesamiento)` y `periodEnd = addDays(periodStart, 30)`; para un período vencido (la suscripción se crea con `currentPeriodEnd = start ≈ ahora`), `periodStart = now_procesamiento`, que en el Supabase remoto llega 2–8 s después de `start`. En local la diferencia era sub-segundo → mismo segundo redondeado → pasaba. El código de producción es correcto. Además, el escenario 1 tenía una segunda aserción errónea (`currentPeriodStart == start`) que también asumía el reloj del test.

## 4. Aserciones anteriores

- **Helper `expectedEnd(start)`**: `round((start + 30d)/1000)` — dependía del reloj capturado antes del webhook.
- Esc. 1 (líneas 141, 142, 146): `currentPeriodEnd == expectedEnd(start)`, `currentPeriodStart == start`, `pay.periodEnd == expectedEnd(start)`.
- Esc. 3 (179), Esc. 4 (193), Esc. 8 (299): `currentPeriodEnd == expectedEnd(start)`.

## 5. Aserciones nuevas

- **Se eliminó `expectedEnd`** y se añadieron dos helpers deterministas:
  - `assertThirtyDayPeriod(periodStart, periodEnd)`: valida no-nulo y `periodEnd == addDays(periodStart, BILLING_PERIOD_DAYS)` — replica **exactamente** la semántica de calendario del servicio (importa `addDays` de `src/domains/billing/period`, sin Prisma).
  - `assertPaymentMatchesSubscriptionPeriod(pay, sub)`: `pay.periodStart == sub.currentPeriodStart` y `pay.periodEnd == sub.currentPeriodEnd`.
- **Esc. 1**: valida período persistido (`assertThirtyDayPeriod` + coincidencia Payment/Subscription) + no-retroceso (`currentPeriodEnd >= start`); conserva estado ACTIVE/Tenant, marcador, `reconciliationRequired=false`, ledger PROCESSED, 1 auditoría.
- **Esc. 3**: tras PENDING, asserta marcador null y período sin cambios (PENDING no aplica ni extiende); tras APPROVED valida período persistido + coincidencia + 1 fila Payment; añade un **segundo APPROVED** que no re-extiende (período igual) y queda DUPLICATE.
- **Esc. 4**: 1 fila Payment, 1 marcador, período persistido válido, y **exactamente una entrega PROCESSED** (la otra DUPLICATE o FAILED — documentado), demostrando un solo efecto bajo concurrencia.
- **Esc. 8**: valida período persistido + coincidencia + no-retroceso; conserva rollback (FAILED), reintento único (1 auditoría económica, marcador), sin DUPLICATE antes del replay; añade un **replay** que no re-extiende (período igual) y queda DUPLICATE.

Ninguna aserción usa tolerancias amplias; se comparan `periodStart`/`periodEnd` directamente.

## 6. Justificación temporal

El servicio usa `addDays` con `setDate` (aritmética de calendario), **no** suma fija de milisegundos; por eso la aserción compara contra `addDays(periodStart, 30)` y no contra `30*24*60*60*1000` ms (que diferiría ante DST). En Bogotá no hay DST, pero la comparación refleja la semántica exacta del servicio de forma robusta. El período se lee **persistido** tras procesar, eliminando toda dependencia del reloj del test.

## 7. Archivos modificados

- **`tests/billing-webhook-idempotency.test.ts`** (único archivo de código tocado).
- Documentos automáticos: `19-prompt-...md` y este `20-respuesta-...md`.
- **No** se tocó: producción, schema, migraciones, `package.json`, `package-lock.json`, `.env`, ni el guard.

## 8. Typecheck

`npx tsc --noEmit`: **0 errores**.

## 9. Lint

`npm run lint`: **0 warnings/errores**.

## 10. Pruebas puras

`npx tsx --test tests/unit/*.test.ts`: **95 tests, 95 passed, 0 failed, 0 skipped**.

## 11. Resultado de `npm test`

- **Total: 147 · Passed: 147 · Failed: 0 · Skipped: 0 · Duración ~114.9 s.**
- Vía runner seguro (`npm test`) con overrides `DATABASE_URL=`/`DIRECT_URL=` (aislamiento del guard sin tocar `.env`, procedimiento autorizado de la Fase 1I). No se re-aplicó la migración (ya estaba). No se usó `db push`.
- Prueba de aborto previa: con `ALLOW_TEST_DATABASE_MUTATION=false` el runner aborta antes de Prisma.

## 12. Resultado individual de los 17 escenarios de facturación

Todos **✓** (0 fallos en la suite):

| # | Escenario | Resultado |
|---|---|---|
| 1 | APPROVED nuevo extiende una vez | ✓ |
| 2 | Replay APPROVED no extiende | ✓ |
| 3 | PENDING → APPROVED extiende una vez (+ PENDING sin marcador, replay DUPLICATE) | ✓ |
| 4 | Concurrencia produce un solo efecto | ✓ |
| 5 | Rollback después del reclamo | ✓ |
| 6 | Rollback después de Subscription | ✓ |
| 7 | Rollback antes de AuditLog | ✓ |
| 8 | Reintento después del rollback (+ replay no re-extiende) | ✓ |
| 9 | Ledger PROCESSED | ✓ |
| 10 | Ledger DUPLICATE | ✓ |
| 11 | Preapproval atómico | ✓ |
| 12 | Pendientes aplicados y limpiados una vez | ✓ |
| 13 | Histórico en cuarentena no extiende | ✓ |
| 14 | Reconciliado no extiende | ✓ |
| 15 | Pago nuevo no queda en cuarentena | ✓ |
| 16 | Missing dataId no persiste ni llama al proveedor | ✓ |
| 17 | Evidencia CLI distingue pagos de la misma suscripción | ✓ |

## 13. Rollback

**Demostrado en PostgreSQL**: escenarios 5, 6, 7 (fallo inyectado en `AFTER_EFFECT_CLAIM`, `AFTER_SUBSCRIPTION_UPDATE`, `BEFORE_AUDIT_LOG`) pasan: fila Payment nueva inexistente tras rollback, Subscription/Tenant sin cambios, sin auditoría económica parcial, ledger FAILED. El escenario 8 confirma el rollback del primer intento y el reintento único.

## 14. Concurrencia

**Demostrada**: escenario 4 (dos webhooks concurrentes del mismo pago) → **un solo efecto** (1 Payment, 1 marcador, un solo período de 30 días desde el `periodStart` persistido, exactamente una entrega PROCESSED). El reclamo atómico serializa la carrera.

## 15. Idempotencia

**Demostrada**: escenario 2 (replay APPROVED no extiende → DUPLICATE), y reforzada en 3 y 8 (replay posterior no re-extiende, período sin cambios, DUPLICATE). El efecto económico se aplica exactamente una vez por pago.

## 16. Limpieza de fixtures

**0 fixtures residuales** (0 tenants `billing-webhook-%`/`phase%`/`super-admin-%`, 0 `WebhookEvent`) tras la suite. Los `after()` hooks limpiaron todo.

## 17. Estado del mockdata

**Intacto**: conteos idénticos a los previos (6 Tenant, 17 User, 5 Payment, 55 Pqrs). No se modificó ni borró mockdata preexistente.

## 18. Confirmación de ausencia de llamadas reales

`fetch` mockeado en la suite; `MERCADO_PAGO_ACCESS_TOKEN` sintético (`TEST-...`) en `.env.test`; **0 pagos MERCADO_PAGO reales** en la base (sin cambios). No se llamó a Mercado Pago real.

## 19. Estado de `.env.test`

Presente e **ignorado por Git** (no aparece en `git status`; contenido no mostrado).

> ⚠️ **Advertencia**: `.env.test` apunta al **mismo proyecto Supabase autorizado** que la configuración normal (excepción temporal de la Fase 1I). **No debe reutilizarse como configuración normal.** Antes de futuras pruebas destructivas, se recomienda **reemplazarlo por un proyecto Supabase dedicado** (o eliminarlo tras el cierre) para no depender de esta excepción.

## 20. Riesgos restantes

- La base de pruebas es el **mismo proyecto** que el normal (excepción autorizada); pendiente migrar a un proyecto dedicado.
- Motor de Prisma en Windows local con `EPERM` al **regenerar** el DLL (no afecta ejecución ni CI).
- Fuera de alcance (bloqueantes posteriores): precedencia de eventos fuera de orden, cron, cancelación, exclusión de simulados de métricas, reconciliación MP↔DB.

## 21. Recomendación sobre commit

La subfase de **idempotencia y atomicidad de facturación (1C→1J)** queda **validada en PostgreSQL real**: 147/147 tests, 17/17 escenarios, rollback y concurrencia demostrados. Recomendación: se puede preparar el **commit de esta subfase** cuando el usuario lo indique (agregando archivos explícitamente para no incluir los `docs/*` borrados ni `.env.test`). Antes del commit conviene decidir el proyecto Supabase dedicado. No se hizo commit en esta fase.

## 22. Estado

**CORREGIDO.**

Las cuatro aserciones temporales dejaron de depender del inicio del test y ahora validan el período persistido con la semántica exacta del servicio; se conservaron todas las aserciones económicas y se reforzaron según lo pedido. `tsc`, `lint` y pruebas puras pasan; `npm test` pasa **completo (147/147, 0 fallos, 0 skip)** contra el Supabase autorizado, con los 17 escenarios de facturación en verde, rollback y concurrencia demostrados, fixtures limpios, mockdata intacto y sin llamadas reales a Mercado Pago. Solo se modificó el archivo de pruebas; producción intacta; `.env` sin cambios; `.env.test` conservado e ignorado; sin commit. No se continuó con precedencia, cron, cancelación ni métricas.
