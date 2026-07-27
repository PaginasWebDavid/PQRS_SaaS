# FASE 2G — CORRECCIONES TRANSACCIONALES, IDENTIDAD DE EVIDENCIA Y VALIDACIÓN FINAL

## Documentación automática

Antes de analizar o modificar código:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/13-prompt-claude-correcciones-transaccionales-identidad.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/14-respuesta-claude-correcciones-transaccionales-identidad.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques documentos anteriores.

---

Actúa como ingeniero principal especializado en concurrencia PostgreSQL, transacciones Prisma, facturación recurrente, máquinas de estados, Mercado Pago y pruebas deterministas.

Debes corregir los hallazgos F2F-01 a F2F-07 de la revisión final de Codex, sin iniciar todavía la implementación del cron.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/10-respuesta-claude-correcciones-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/11-prompt-codex-revision-final-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/12-respuesta-codex-revision-final-precedencia-cobertura.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

La fuente de verdad es el código, el diff y las pruebas actuales.

## Objetivos

Corregir:

1. F2F-01: preapproval y Payment no aprobado deciden con una Subscription leída antes de la transacción.
2. F2F-02: algunas coberturas se consultan solo por `tenantId`, sin exigir la misma `subscriptionId`.
3. F2F-03: la auditoría de reactivación se crea después de confirmar Tenant y Subscription.
4. F2F-04: la evidencia puede cambiar durante una transacción `READ COMMITTED`.
5. F2F-05: metadata de unknown incompleta y strings sin límite.
6. F2F-06: cobertura adversarial de pruebas insuficiente.
7. F2F-07: la suite completa no fue reproducida por Codex debido a una invocación incorrecta del aislamiento temporal autorizado.

## Contexto operativo de pruebas

El proyecto Supabase actual contiene exclusivamente mockdata desechable y está expresamente autorizado para pruebas mientras el sistema no esté en producción. Antes de producción existirán dos proyectos separados (Producción y Desarrollo/pruebas). No crees otro proyecto en esta fase. No desactives ni modifiques el guard. Para ejecutar contra el proyecto autorizado, las variables normales deben quedar vacías **solo en el proceso del comando**, tal como se validó en las Fases 1I, 1J y 2E. `.env` no debe moverse ni modificarse.

## Fuera de alcance

No implementes: Cron; CAS del cron; atomicidad del cron; `Notification.dedupeKey`; cambios de email del cron; política definitiva de cancelación; reparación operativa de `graceEndsAt = null`; schema o migraciones; `Subscription.version`; timestamps del proveedor; nuevos enums Prisma; métricas; UI; colas; locks distribuidos; infraestructura externa.

## Archivos permitidos

Puedes modificar únicamente: `src/domains/billing/precedence.ts`; `src/domains/billing/mercado-pago.service.ts`; `src/domains/platform/tenant-admin.service.ts`; `tests/unit/billing-precedence.test.ts`; `tests/billing-webhook-idempotency.test.ts`; los documentos 13 y 14.

Puedes inspeccionar `src/domains/platform/audit.service.ts`, pero no modificarlo salvo que su contrato actual impida pasar el cliente transaccional. Si eso ocurre, detente y documenta antes de tocarlo.

No modifiques: `prisma/schema.prisma`; migraciones; `package.json`; `package-lock.json`; `.env`; `.env.test`; el runner o el guard.

## Primera acción

Ejecuta `git status --short`, `git log -1 --oneline`, `git diff --check`, `git diff --stat`, `git diff --name-status`. Confirma HEAD `5e4be50`, sin commit nuevo, schema/migraciones/lock intactos, diff solo de precedencia/cobertura/reactivación/pruebas, docs de Fase 2 sin trackear. Guarda este prompt y entrega un diagnóstico breve.

# 1. Contexto transaccional para webhooks

Las decisiones de acceso no pueden basarse en una Subscription leída antes de la transacción. Para Payment no aprobado, Preapproval y Payment aprobado (al mover a ACTIVE), dentro de la misma transacción: releer Subscription por id y tenantId; cargar Payments de cobertura por tenantId+subscriptionId; calcular cobertura de acceso/pago real/evidencia; calcular precedencia con el estado recién leído; reclamar la transición con CAS; sincronizar Tenant solo si se aplicó; crear AuditLog; finalizar WebhookEvent; confirmar. Las lecturas previas solo localizan entidades.

# 2. Compare-and-set para Subscription

Escritura condicional `updateMany` con where sobre id, tenantId, status, currentPeriodEnd, graceEndsAt, trialEndsAt (valores exactos leídos, sin reconstruir fechas). Si `count === 0`: no actualiza Tenant, no reintenta, no revierte acción administrativa, ledger `IGNORED`, `ignoredReason="CONCURRENT_SUBSCRIPTION_CHANGE"`, auditoría explicativa, sin error que provoque reintentos infinitos. El CAS garantiza que una suspensión/cancelación concurrente no sea reemplazada; APPROVED conserva su efecto económico pero no cambia acceso si el CAS detecta cambio concurrente.

# 3. Payment APPROVED y separación económica

No alterar claim/marcador/cuarentena/períodos/términos/ledger/rollback/reintento. La transición a ACTIVE tiene su propio CAS. Si el CAS falla: conserva efecto económico, conserva estado administrativo, no actualiza Tenant, `accessStatePreserved=true`, `ignoredAccessReason="CONCURRENT_SUBSCRIPTION_CHANGE"`. Todo en la misma transacción económica. No conviertas el Payment en IGNORED.

# 4. Identidad exacta de evidencia

Todas las consultas/funciones de evidencia exigen `tenantId` + `subscriptionId`. Corrige `applyTenantStatusInTx`, `updateTenantStatusForSuperAdmin` y cualquier caller de `hasCurrentRealPaymentCoverage`/`hasCurrentAppliedAccessEvidence`. Amplía `PaymentCoverageRow` con `tenantId` y `subscriptionId`; las funciones reciben la identidad esperada o filtran explícitamente la pareja; una fila cruzada devuelve `false`. No cambies schema.

# 5. Preapproval completamente transaccional

Consulta remota fuera de la transacción. Luego: abre tx; relee Subscription; relee cobertura exacta; calcula `decidePreapprovalOutcome`; si IGNORE/PRESERVE no cambia acceso (auditoría+ledger); si SET usa CAS (count=1 sincroniza Tenant; count=0 registra CONCURRENT_SUBSCRIPTION_CHANGE); actualiza metadata técnica solo si no pisa modificación administrativa; AuditLog y ledger dentro de la tx. No decidas con el objeto leído antes de la tx.

# 6. Payment no aprobado completamente transaccional

Dentro de la tx: relee Subscription; relee Payment persistido; carga cobertura exacta; calcula precedencia; calcula acción; actualiza metadata no económica; si ENTER_GRACE usa CAS; si CAS falla preserva acceso, no toca Tenant, ledger IGNORED, razón CONCURRENT_SUBSCRIPTION_CHANGE; si ya GRACE/terminal/cobertura preserva; AuditLog y ledger dentro de la tx. Una suspensión/cancelación que gane la carrera prevalece.

# 7. Reactivación administrativa atómica

Para ACTIVE: transacción con el aislamiento más fuerte soportado (preferiblemente Serializable); dentro: lee Subscription exacta, lee Payments por tenantId+subscriptionId, evalúa evidencia, actualiza Subscription, actualiza Tenant, crea AuditLog con el cliente transaccional; devuelve solo tras confirmar juntos. Conflicto de serialización: si soportado, error de negocio controlado ("El estado cambió durante la operación. Intenta nuevamente."), sin bucle infinito ni ocultar errores no relacionados; si no soportado, detente y documenta. `registerAuditLog` dentro de la misma transacción; si falla, nada cambia.

# 8. Metadata unknown completa y acotada

`export const MAX_PROVIDER_STATUS_LENGTH = 255;` aplicado a `providerStatusLabel`, `rawStatusForStore`, metadata `providerStatus` y cualquier rawStatus nuevo. Strings: recortar, normalizar, truncar al máximo, nunca payload completo. Payment unknown: matriz completa. Preapproval unknown: `ignoredReason`, `providerStatus`, `previousPaymentStatus:null`, `incomingPaymentStatus:"UNKNOWN"`, `persistedPaymentStatus:null`, `previousSubscriptionStatus`, `persistedSubscriptionStatus`, `accessCovered`, `realPaymentCovered`, `appliedAccessEvidence`, `paymentExists`, `subscriptionId`, `tenantId`. Nulls explícitos. No objetos/arrays/payloads/firmas/tokens/tarjeta/correos.

# 9. Seams deterministas para concurrencia

Sin sleeps. Extiende seams solo bajo `NODE_ENV === "test"`: `AFTER_WEBHOOK_SUBSCRIPTION_READ`, `BEFORE_WEBHOOK_SUBSCRIPTION_CAS`, `AFTER_REACTIVATION_EVIDENCE_READ`, `BEFORE_REACTIVATION_AUDIT_LOG`. Permiten pausar, ejecutar una segunda transacción concurrente y liberar. No se activan en producción; se resetean tras cada test; no cambian el comportamiento normal; sin timers indefinidos.

# 10. Pruebas puras adicionales

Identidad (correcto cuenta; tenant/subscription cruzados no; SIMULATED y MP cruzados no). Longitud (10.000 chars al máximo; espacios se recortan antes de truncar; número/objeto/array etiquetas seguras). Metadata conceptual (preapproval unknown null en campos de Payment; `paymentExists` refleja filas exactas). Grace null explícita; paused sobre CANCELLED.

# 11. Pruebas de integración obligatorias

A. Carrera preapproval vs suspensión (CAS count=0, preserva SUSPENDED, ledger IGNORED, CONCURRENT_SUBSCRIPTION_CHANGE, auditoría). B. Carrera Payment no aprobado vs cancelación (preserva CANCELLED, no Grace). C. APPROVED vs suspensión concurrente (APPROVED, marcador, extiende una vez, acceso SUSPENDED, metadata; replay no re-extiende). D. Payment cruzado (no cuenta para ACTIVE/reactivación/pago real/evidencia). E. Auditoría de reactivación (fallo antes de AuditLog: Tenant/Subscription SUSPENDED, sin AuditLog parcial, reintento funciona, única auditoría). F. Evidencia concurrente (serializable aborta con conflicto controlado; no reactiva; intento posterior evalúa estado nuevo y rechaza). G. Unknown largo (rawStatus y metadata truncados, IGNORED, sin 500, sin cambio de acceso). H. Metadata completa preapproval (todos los campos, nulls, paymentExists). I. Fortalecer #29–#31, #40, #41–#43, #48. Sin reducir aserciones. Sin `skip`.

# 12. Compatibilidad con Fase 1

Deben seguir pasando: idempotencia, claim atómico, replay, concurrencia, rollback, reintento, cuarentena, reconciliación, términos pendientes, períodos, missing dataId, ledger, preapproval atómico. No alteres el orden económico salvo añadir el CAS de acceso y preservar acciones administrativas concurrentes.

# 13. Ejecución segura de pruebas

Confirma `.env.test` ignorado, mockdata autorizado, cero pagos reales, cero fixtures residuales; no muestres credenciales; no modifiques `.env` ni el guard. Prueba de aborto: confirma que el runner aborta antes de Prisma con configuración insegura. Ejecución autorizada: vaciar `DATABASE_URL` y `DIRECT_URL` solo en el proceso del comando (POSIX `env DATABASE_URL= DIRECT_URL= npm test`; PowerShell guardando/restaurando). No muevas `.env`. Comandos: `npx tsc --noEmit`, `npm run lint`, `node --import tsx --test tests/unit/*.test.ts`, `npm test`. No migraciones, no `db push`, no reintentos automáticos ante fallo lógico.

# 14. Limpieza

Tras la suite: cero fixtures de billing, cero WebhookEvent de pruebas, cero usuarios de prueba, conteos de mockdata sin cambios, cero llamadas reales a MP, `.env` intacto, `.env.test` ignorado.

# 15. Criterios de aceptación

(1) decisiones con estado releído en tx; (2) toda transición usa CAS; (3) acción administrativa concurrente prevalece; (4) evidencia exige tenant+subscription; (5) funciones puras rechazan identidad cruzada; (6) reactivación/Tenant/Subscription/AuditLog atómicos; (7) evidencia no cambia silenciosamente; (8) conflictos → error controlado y cero cambios parciales; (9) metadata unknown completa; (10) strings limitados; (11) pruebas adversariales; (12) suite vía runner seguro; (13) guard intacto; (14) tsc; (15) lint; (16) puras; (17) suite completa; (18) cero skip; (19) fixtures limpios; (20) Fase 1 intacta; (21) sin schema; (22) sin migración; (23) sin commit.

# Informe final

(27 secciones; ver estructura del prompt.) Estado: CORREGIDO / CORREGIDO CON RIESGOS / BLOQUEADO.

## Finalización

1. Informe en `docs/programa-mejora/03-precedencia-cron/14-respuesta-claude-correcciones-transaccionales-identidad.md`.
2. Prompt en `docs/programa-mejora/03-precedencia-cron/13-prompt-claude-correcciones-transaccionales-identidad.md`.
3. No commit. 4. No cron. 5. Detente tras el informe.
