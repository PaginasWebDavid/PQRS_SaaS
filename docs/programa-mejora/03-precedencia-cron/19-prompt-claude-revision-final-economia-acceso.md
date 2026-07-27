# FASE 2J — REVISIÓN INDEPENDIENTE FINAL DE ECONOMÍA, ACCESO Y COBERTURA

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/19-prompt-claude-revision-final-economia-acceso.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/20-respuesta-claude-revision-final-economia-acceso.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, pruebas, schema, migraciones, configuración ni variables de entorno.

---

Actúa como revisor técnico independiente especializado en facturación recurrente, Prisma, PostgreSQL, aislamiento Serializable, compare-and-set y pruebas concurrentes.

Codex implementó las correcciones F2H-01 a F2H-06. Debes revisar adversarialmente el resultado completo.

No aceptes la implementación basándote únicamente en que las pruebas estén verdes.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/16-respuesta-codex-aprobacion-final-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/17-prompt-codex-correccion-efecto-economico-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/18-respuesta-codex-correccion-efecto-economico-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/14-respuesta-claude-correcciones-transaccionales-identidad.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

La fuente de verdad es el código, el diff y las pruebas actuales.

## Restricciones

Esta es una revisión de solo lectura. No debes: modificar implementación, pruebas, schema; crear/aplicar migraciones; `db push`; seeds; modificar `.env`/`.env.test`/guard; mostrar secretos; llamar a Mercado Pago real; ejecutar build; levantar servidor; commit; push; iniciar el cron.

Puedes: comandos Git de lectura; typecheck y lint; pruebas puras; suite completa por el procedimiento seguro autorizado; conteos seguros antes y después. No apliques migraciones.

# Primera acción

1. Guarda este prompt.
2. Ejecuta `git status --short`, `git log -1 --oneline`, `git diff --check`, `git diff --stat`, `git diff --name-status`.
3. Confirma: HEAD `5e4be50`; sin commit nuevo; `prisma/schema.prisma` sin cambios; sin migración nueva; `package.json`/`package-lock.json` sin cambios; diff limitado a precedencia/cobertura/webhooks/reactivación/pruebas/documentación; sin cambios de cron/notificaciones/email/métricas/UI/cancelación definitiva.
4. Inspecciona completamente: `precedence.ts`, `mercado-pago.service.ts`, `tenant-admin.service.ts`, `audit.service.ts`, `tests/unit/billing-precedence.test.ts`, `tests/billing-webhook-idempotency.test.ts`.

# 1. Verificación de F2H-01 a F2H-06

Tabla con ID; Estado (CORREGIDO / CORREGIDO CON MATICES / NO CORREGIDO / REGRESIÓN); Evidencia; Riesgo restante; ¿Bloquea commit?; ¿Bloquea cron?; ¿Bloquea producción?

* F2H-01: CAS de acceso perdía la economía de Subscription.
* F2H-02: preapproval podía dejar Subscription/Tenant divergentes.
* F2H-03: metadata de CAS perdido informaba un snapshot obsoleto.
* F2H-04: status de creación de preapproval sin límite.
* F2H-05: pruebas concurrentes incompletas.
* F2H-06: procedimiento PowerShell incorrecto.

# 2. Separación entre economía y acceso

Reconstruye el flujo de un Payment `APPROVED`. Distingue: Efecto económico (claim de `approvedEffectAppliedAt`, período de Payment, período de Subscription, precio efectivo, unidades efectivas, términos pendientes y su limpieza) y Estado de acceso (`Subscription.status`, `graceEndsAt`, Tenant status). Confirma que ya no se escriben en un único CAS. Demuestra que: una suspensión concurrente puede impedir `ACTIVE`; esa suspensión no impide actualizar el período económico; Payment y Subscription terminan con el mismo período; términos pendientes se aplican y limpian una sola vez; replay no vuelve a aplicar economía.

# 3. CAS económico

Confirma: campos exactos en `where` y `data`; no depende de `Subscription.status`; usa valores leídos de PostgreSQL; no reconstruye fechas; compara términos pendientes relevantes; `count===1` éxito; `count===0` revierte Payment, marcador y cualquier cambio parcial. Conflicto económico: toda la transacción se revierte; `approvedEffectAppliedAt` vuelve a null; Payment no conserva períodos parciales; Subscription conserva la modificación concurrente; el siguiente intento puede reclamar; el efecto se aplica exactamente una vez; no existe estado irrecuperable marcado como DUPLICATE. Reintento interno: máximo uno; no vuelve a llamar a Mercado Pago; relee el estado; no oculta errores distintos; no crea loops.

# 4. CAS de acceso

Confirma que ocurre después de la economía; no reescribe período/precio/unidades; no limpia términos; modifica solo estado y campos de acceso. Si gana: Subscription y Tenant pasan coherentemente a ACTIVE. Si pierde: economía permanece aplicada; Tenant no cambia; Subscription conserva el estado administrativo ganador; se relee la fila real; metadata usa el estado real; ledger sigue PROCESSED; replay es DUPLICATE.

# 5. Estados terminales

Payment APPROVED sobre SUSPENDED y CANCELLED: efecto económico aplicado; Payment y Subscription comparten período; términos aplicados una sola vez; acceso terminal preservado; Tenant terminal preservado; replay DUPLICATE; metadata correcta. Revisa si alguna ruta posterior puede auto-reactivar indirectamente.

# 6. Preapproval Serializable

Llamada externa fuera de la transacción. Dentro de la transacción Serializable: relectura de Subscription; lectura de Payments por identidad exacta; cobertura; decisión; CAS; Tenant; AuditLog; WebhookEvent; commit. Confirma: la evidencia permanece estable; no hay segunda validación que retorne silenciosamente; Subscription nunca queda ACTIVE sin Tenant ACTIVE; pérdida de evidencia genera rollback/conflicto/decisión recalculada; no se confirma ACTIVE usando cobertura inválida.

# 7. Manejo de P2034

Solo se transforma P2034; otros errores se relanzan; sin loop infinito; máximo el reintento acotado declarado; no vuelve a llamar a Mercado Pago; cada intento relee Subscription y Payments; no quedan AuditLog ni ledger finales parciales de una transacción abortada; el resultado final refleja la evidencia vigente.

# 8. Payment no aprobado y evidencia concurrente

Garantía suficiente (Serializable o equivalente); cobertura exacta dentro; decisión dentro; CAS; Tenant solo si gana; auditoría y ledger atómicos. Reconstruye: REJECTED observa ausencia de cobertura; otra transacción crea un Payment real o SIMULATED vigente; el webhook continúa. Resultado: no entra a Grace; no degrada Tenant; reevalúa o pierde de forma segura; metadata informa el estado real; sin cambios parciales.

# 9. Metadata tras CAS perdido

Para preapproval, Payment APPROVED y Payment no aprobado, tras `count=0`: se relee Subscription; no se vuelve a escribir; `persistedSubscriptionStatus` usa la fila real; períodos persistidos reales; `graceEndsAt` real; razón concurrente correcta; AuditLog y WebhookEvent coinciden. Revisa escenarios que antes registraban PENDING_PAYMENT en vez de SUSPENDED/CANCELLED, o TRIAL en vez de SUSPENDED.

# 10. Status externo acotado

Payment webhook, Preapproval webhook, creación de preapproval/checkout. Confirma: `MAX_PROVIDER_STATUS_LENGTH = 255`; trim antes de truncar; string largo exactamente en el límite; objeto/array no se serializan; null/tipos inesperados no lanzan; `mercadoPagoStatus`, AuditLog y metadata usan etiqueta segura; no queda otra persistencia directa de `preapproval.status`. Busca globalmente `preapproval.status`, `rawStatus`, `mercadoPagoStatus`, `providerStatus` y clasifica rutas que no usen el helper seguro.

# 11. Helper de Tenant

`applyTenantStatusInTx` para ACTIVE: recibe garantía explícita de cobertura validada; no hace segunda consulta silenciosa; no puede retornar sin actualizar Tenant después de activar Subscription; ausencia de garantía produce error y rollback. Otros estados: sincronización nominal. Determina si el contrato evita el mal uso futuro.

# 12. Identidad exacta

Todas las coberturas exigen `tenantId` y `subscriptionId`. Revisa funciones puras, consultas de webhook, preapproval, reactivación, helper de Tenant. Payment cruzado MP o SIMULATED no cuenta.

# 13. Seams de prueba

Solo con `NODE_ENV === "test"`; sin entrada HTTP; se resetean en `finally`; se limpian en `after`; sin sleeps; sin promesas pendientes; no vuelven las pruebas dependientes del orden; no pueden ejecutarse en producción.

# 14. Pruebas puras

Conteo real. Verifica normalización; límites; identidad; precedencia; Grace; estados terminales; helpers puros nuevos de economía/acceso. Identifica pruebas ausentes o engañosas.

# 15. Pruebas de integración

Lee todos los escenarios. Identifica los añadidos por Codex para F2H. APPROVED y suspensión concurrente (Payment, Subscription, Tenant, marcador, períodos compartidos, términos, ledger, auditoría, metadata, replay). Conflicto económico (tx real concurrente; CAS económico pierde; rollback del marcador; cero período parcial; intento posterior exitoso). Preapproval y cuarentena concurrente (dos tx reales; evidencia cambia tras lectura; sin divergencia; decisión final usa evidencia actual). Preapproval y vencimiento concurrente. No aprobado y cobertura concurrente (no entra a Grace). Metadata real tras CAS. Checkout con status largo/no-string. No aceptes solo el conteo de 283 pruebas.

# 16. Compatibilidad con Fase 1

Por código y ejecución: claim atómico; idempotencia; replay; concurrencia; rollback en tres puntos; reintento; cuarentena; reconciliación; términos pendientes; períodos; missing dataId; ledger; preapproval atómico. Invariancia: `Payment.periodStart === Subscription.currentPeriodStart` y `Payment.periodEnd === Subscription.currentPeriodEnd` tras cada efecto aprobado aplicado.

# 17. Ejecución segura

Ruta insegura: `npm test` debe abortar antes de Prisma. PowerShell autorizado: usar espacios (" "), guardando/restaurando `DATABASE_URL`/`DIRECT_URL`. POSIX autorizado: `env DATABASE_URL= DIRECT_URL= npm test`. No muevas `.env`; no modifiques `.env.test`; no desactives el guard. Comandos: `npx tsc --noEmit`, `npm run lint`, `node --import tsx --test tests/unit/*.test.ts`, `npm test` (procedimiento autorizado). No reintentes automáticamente un fallo lógico.

# 18. Limpieza

Antes y después: conteos básicos; cero Payments reales Mercado Pago; cero fixtures; cero WebhookEvent residuales; cero usuarios de prueba; `.env` intacto; `.env.test` ignorado; cero llamadas reales a Mercado Pago.

# 19. Alcance del eventual commit

Implementación: `precedence.ts`, `mercado-pago.service.ts`, `tenant-admin.service.ts`. Pruebas: `tests/unit/billing-precedence.test.ts`, `tests/billing-webhook-idempotency.test.ts`. Documentación: todos los `.md` de `docs/programa-mejora/03-precedencia-cron/`. Exclusiones: `.env`, `.env.test`, schema, migraciones, package files, temporales, logs, cambios ajenos. Entrega comandos `git add` explícitos, pero no los ejecutes.

# 20. Mensaje de commit

`feat(billing): enforce payment precedence and access coverage`

# Hallazgos

Para cada hallazgo nuevo: ID; Severidad; Archivo y símbolo; Comportamiento; Impacto; Evidencia; Corrección mínima; Prueba requerida; ¿Bloquea commit?; ¿Bloquea cron?; ¿Bloquea producción?

# Criterios de aprobación

(1) F2H-01..F2H-06 corregidos; (2) economía y acceso separados; (3) el CAS de acceso no puede perder economía; (4) el conflicto económico revierte completamente; (5) Payment y Subscription comparten período; (6) términos pendientes una vez; (7) preapproval evidencia estable; (8) Subscription y Tenant nunca divergen; (9) CAS perdido registra estado real; (10) todo status externo acotado; (11) seams seguros; (12) pruebas adversariales demuestran las carreras; (13) Fase 1 intacta; (14) sin schema; (15) sin migración; (16) tsc; (17) lint; (18) puras; (19) suite completa; (20) sin skip; (21) fixtures limpios; (22) sin hallazgos críticos/altos abiertos.

# Informe final

Secciones 1–29 (ver estructura del prompt). Veredicto: APROBADA / APROBADA CON RIESGOS MENORES / REQUIERE CORRECCIONES / RECHAZADA.

## Finalización

1. Informe en `docs/programa-mejora/03-precedencia-cron/20-respuesta-claude-revision-final-economia-acceso.md`.
2. Prompt en `docs/programa-mejora/03-precedencia-cron/19-prompt-claude-revision-final-economia-acceso.md`.
3. No modifiques código. 4. No commit. 5. No cron. 6. Detente tras el informe.
