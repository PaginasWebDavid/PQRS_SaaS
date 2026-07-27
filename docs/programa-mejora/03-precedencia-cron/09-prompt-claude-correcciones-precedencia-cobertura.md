# FASE 2E — CORRECCIONES DE PRECEDENCIA, TERMINALES Y COBERTURA

## Documentación automática

Antes de analizar o modificar código:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/09-prompt-claude-correcciones-precedencia-cobertura.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/10-respuesta-claude-correcciones-precedencia-cobertura.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques documentos anteriores.

---

Actúa como ingeniero principal especializado en máquinas de estados, facturación recurrente, Prisma, PostgreSQL, Mercado Pago y pruebas transaccionales.

Debes corregir los hallazgos F2D-01 a F2D-08 identificados por Codex en la revisión de la Subfase 2C.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/05-prompt-claude-implementacion-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/06-respuesta-claude-implementacion-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/08-respuesta-codex-revision-precedencia-cobertura.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/TESTING.md`

La fuente de verdad es el código y el diff actual.

## Objetivos

Corregir:

1. F2D-01: una Grace vencida o inconsistente se renueva ante un webhook no aprobado.
2. F2D-02: preapproval puede dejar Tenant y Subscription divergentes.
3. F2D-03: `paused` preserva estados vencidos y preapproval puede modificar terminales.
4. F2D-04: un pago `APPROVED` reactiva automáticamente `SUSPENDED` o `CANCELLED`.
5. F2D-05: normalizadores fallan ante tipos JSON inesperados.
6. F2D-06: reactivación manual valida evidencia fuera de la transacción.
7. F2D-07: metadata de estados desconocidos es incompleta.
8. F2D-08: pruebas de integración incompletas y prueba de reactivación engañosa.

## Fuera de alcance

No implementes todavía:

* Cron.
* Compare-and-set del cron.
* Atomicidad del cron.
* Política operativa definitiva para reparar `graceEndsAt = null`.
* `Notification.dedupeKey`.
* Cambios de email.
* Política definitiva de cancelación.
* Acceso hasta fin de período después de cancelar.
* Nuevos enums Prisma.
* Nuevas columnas.
* Migraciones.
* `Subscription.version`.
* Timestamps del proveedor.
* Métricas.
* UI.
* Alertas visuales.
* Infraestructura externa.

## Restricciones

No debes:

* Modificar `prisma/schema.prisma`.
* Crear o aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Llamar a Mercado Pago real.
* Modificar `.env` o `.env.test`.
* Modificar el guard.
* Mostrar secretos.
* Ejecutar build.
* Levantar el servidor.
* Hacer commit o push.
* Reducir aserciones.
* Añadir `skip`.
* Cambiar las garantías aprobadas de la Fase 1.

Puedes modificar únicamente:

* `src/domains/billing/precedence.ts`
* `src/domains/billing/mercado-pago.service.ts`
* `src/domains/platform/tenant-admin.service.ts`
* `tests/unit/billing-precedence.test.ts`
* `tests/billing-webhook-idempotency.test.ts`
* Los documentos automáticos 09 y 10.

Si necesitas tocar otro archivo, detente y documenta la necesidad sin modificarlo.

## Primera acción

1. Ejecuta:

```text
git status --short
git log -1 --oneline
git diff --check
git diff --stat
git diff --name-status
```

2. Confirma que:

   * HEAD continúa en `5e4be50`.
   * No existe un commit nuevo.
   * Schema y migraciones no tienen cambios.
   * `package-lock.json` no cambió.
   * El diff corresponde únicamente a la Subfase 2C.
3. Guarda este prompt.
4. Lee completamente el informe 08 de Codex.
5. Verifica cada hallazgo F2D antes de editar.
6. Incluye en el informe un diagnóstico breve previo a los cambios.

# 1. Preservar toda Grace existente

Modifica la decisión de un webhook no aprobado.

Si `Subscription.status === GRACE_PERIOD`:

* Nunca debe crear un período de gracia nuevo.
* Nunca debe modificar `graceEndsAt`.
* Debe preservar la frontera existente cuando esté: vigente; vencida; en `null`.
* No debe cambiar Tenant.
* No debe interpretar `graceEndsAt = null` como autorización para dar otra gracia.
* Debe registrar el evento como `IGNORED`.
* Debe usar una razón explícita, por ejemplo: `EXISTING_GRACE_PRESERVED`.

Esto aplica a eventos: `PENDING`, `REJECTED`, otros estados conocidos no aprobados.

El cron de la siguiente subfase decidirá qué hacer con una Grace vencida o inconsistente. El webhook no debe reiniciar su plazo.

## Pruebas obligatorias

* Grace vigente conserva exactamente `graceEndsAt`.
* Grace vencida conserva exactamente `graceEndsAt`.
* Grace con `graceEndsAt = null` permanece null.
* Replays repetidos no cambian la frontera.
* Tenant y Subscription permanecen coherentes.

# 2. Sincronización explícita de Tenant

Corrige el helper actual o reemplázalo por un contrato más claro. No trates conjuntamente `ACTIVE | TRIAL`. Cada estado requiere una política separada.

## ACTIVE

Solo puede sincronizar Tenant a `ACTIVE` cuando: la decisión de Subscription realmente es `ACTIVE`; existe cobertura real válida en el flujo de Mercado Pago; Subscription no estaba `SUSPENDED` ni `CANCELLED`.

## TRIAL

Tenant debe quedar `TRIAL` cuando Subscription queda `TRIAL`. No exige pago real. Debe existir una ventana de trial válida: `trialEndsAt != null`; `trialEndsAt > now`.

## PENDING_PAYMENT

Tenant debe quedar `PENDING_PAYMENT` cuando Subscription queda `PENDING_PAYMENT`. No puede conservar accidentalmente: `ACTIVE`, `TRIAL`, `GRACE_PERIOD`, `SUSPENDED`, `CANCELLED`. No cambies un estado terminal mediante preapproval; en esos casos la decisión debe ser `PRESERVE`, no `SET PENDING_PAYMENT`.

## GRACE_PERIOD

Tenant debe quedar `GRACE_PERIOD` únicamente cuando Subscription entra realmente a Grace.

## SUSPENDED y CANCELLED

Deben conservarse frente a eventos de preapproval que no representen una acción administrativa explícita. No deben ser convertidos automáticamente por: `authorized`, `pending`, `paused`, estado desconocido.

## Pruebas obligatorias

Matriz coherente Tenant/Subscription tras cada evento. Incluye como mínimo: PENDING_PAYMENT → TRIAL con trial válido; PENDING_PAYMENT → PENDING_PAYMENT; TRIAL vigente preservado; ACTIVE vigente preservado; SUSPENDED preservado; CANCELLED preservado.

# 3. Decisión segura de preapproval

Corrige `decidePreapprovalOutcome`. Debe considerar: estado actual; cobertura vigente; pago real vigente; trial vigente; estados terminales.

## Guard de estados terminales

Si Subscription está `SUSPENDED` o `CANCELLED`, los eventos `authorized`, `pending`, `paused`, desconocido deben preservar Subscription y Tenant. La política de `cancelled` entrante permanece fuera de esta corrección y puede conservar el comportamiento anterior, siempre que quede documentado.

## Authorized

1. Estado terminal → `PRESERVE`. 2. Pago real vigente → `SET ACTIVE`. 3. Acceso vigente por trial/active/grace → `PRESERVE`. 4. Trial todavía disponible aunque el estado actual sea `PENDING_PAYMENT` → `SET TRIAL`. 5. Sin cobertura ni trial → `SET PENDING_PAYMENT`. No confundir autorización con pago confirmado.

## Pending

1. Estado terminal → `PRESERVE`. 2. Acceso vigente → `PRESERVE`. 3. Trial todavía disponible → `SET TRIAL`. 4. Sin cobertura ni trial → `SET PENDING_PAYMENT`.

## Paused

1. Estado terminal → `PRESERVE`. 2. Acceso vigente → `PRESERVE`. 3. Sin cobertura vigente → `SET PENDING_PAYMENT`. No debe conservar: `ACTIVE` vencido; `TRIAL` vencido; `GRACE_PERIOD` vencido. No implementes todavía una decisión comercial sobre renovación futura. Esta regla solo evita inventar acceso.

## Desconocido

`IGNORE`. No modificar Subscription. No modificar Tenant. Metadata segura y completa.

## Cancelled

No rediseñes su política. Documenta que continúa fuera del alcance.

# 4. APPROVED sobre SUSPENDED o CANCELLED

Corrige la rama `APPROVED`. Un pago confirmado debe conservarse económicamente, aunque el acceso esté administrativamente bloqueado.

## Reglas económicas

El Payment debe: pasar a `APPROVED`; reclamar el efecto una sola vez; conservar idempotencia; registrar `paidAt`; actualizar sus períodos; aplicar términos pendientes según la lógica aprobada; mantener el marcador; mantener auditoría y ledger.

## Reglas de acceso

Si Subscription estaba `SUSPENDED`: debe seguir `SUSPENDED`; Tenant debe seguir `SUSPENDED`; el pago puede extender el período; no debe auto-reactivar; la reactivación posterior debe ser manual.

Si Subscription estaba `CANCELLED`: debe seguir `CANCELLED`; Tenant debe seguir `CANCELLED`; el pago se registra y aplica económicamente; no debe auto-reactivar; no cambies todavía `cancelledAt` ni la política de devolución/acceso.

Para estados no terminales: el comportamiento aprobado de `APPROVED → ACTIVE` continúa.

## Auditoría

Registra metadata explícita: `paymentEffectApplied`, `accessStatePreserved`, `previousSubscriptionStatus`, `persistedSubscriptionStatus`, `ignoredAccessReason` (por ejemplo `SUSPENDED_REQUIRES_MANUAL_REACTIVATION`, `CANCELLED_ACCESS_PRESERVED`). No añadas nuevos enums Prisma.

## Ledger

El pago aprobado y aplicado puede continuar como `PROCESSED`. No lo marques `IGNORED`, porque el efecto económico sí se procesó.

# 5. Normalizadores seguros en runtime

Cambia los normalizadores para aceptar `unknown`, no confiar en que JSON respete los tipos TypeScript. Debe funcionar sin lanzar para: `null`, `undefined`, número, booleano, objeto, array, cadena vacía, cadena con espacios, mayúsculas.

Comportamiento:

```typescript
if (typeof value !== "string") {
  return estado desconocido;
}
```

No llames `.trim()` antes de validar el tipo. Aplica esto a `normalizeProviderPaymentStatus` y `normalizePreapprovalStatus`.

## Pruebas obligatorias

Cada tipo inesperado debe: clasificarse como desconocido; no lanzar; no modificar estado local; terminar en ledger `IGNORED` en integración cuando corresponda; no provocar respuesta 500.

# 6. Reactivación manual dentro de transacción

Modifica `updateTenantStatusForSuperAdmin`. La consulta y validación de evidencia debe ocurrir dentro de la misma transacción que actualiza Subscription y Tenant.

Dentro de la transacción: 1. Lee la Subscription actual. 2. Lee sus Payments. 3. Evalúa `hasCurrentAppliedAccessEvidence`. 4. Si no existe evidencia vigente: lanza el error de negocio existente; no modifica nada. 5. Si existe: actualiza Subscription; actualiza Tenant. 6. Conserva auditoría coherente.

No uses evidencia leída antes de abrir la transacción.

## Pruebas obligatorias

### Pago real

1. Prepara Subscription/Tenant `SUSPENDED`. 2. Procesa un Payment `APPROVED`. 3. Confirma que el webhook registra y aplica el pago, pero deja ambos `SUSPENDED`. 4. Invoca la reactivación manual. 5. Confirma que la acción manual, y no el webhook, los mueve a `ACTIVE`.

### Pago vencido

No permite reactivar. No cambia Tenant ni Subscription.

### Payment en cuarentena

No permite reactivar.

### SIMULATED vigente

Permite reactivar según la política administrativa actual.

### Sin evidencia

No permite reactivar.

No prepares la prueba enviando un webhook que ya deje el tenant activo.

# 7. Metadata completa de unknown

Para Payment desconocido, nuevo o existente, y preapproval desconocido, registra metadata primitiva y sanitizada: `ignoredReason`, `providerStatus`, `previousPaymentStatus`, `incomingPaymentStatus`, `persistedPaymentStatus`, `previousSubscriptionStatus`, `persistedSubscriptionStatus`, `accessCovered`, `realPaymentCovered`, `appliedAccessEvidence`, `paymentExists`, `subscriptionId`, `tenantId`.

Para un estado no normalizable: `incomingPaymentStatus` puede ser una constante segura como `"UNKNOWN"`. No serialices objetos o arrays recibidos. `providerStatus` debe ser una representación segura y acotada: cadena normalizada cuando sea string; nombre del tipo cuando no sea string (por ejemplo `"number"`, `"object"`, `"array"`); nunca el objeto completo.

Confirma que `sanitizeWebhookMetadata` conserva: strings; números; booleanos; null cuando la política actual lo permita. No guardes: payload completo; firmas; tokens; tarjeta; objetos; arrays; emails innecesarios.

# 8. Pruebas puras adicionales

Amplía `tests/unit/billing-precedence.test.ts`. Añade como mínimo:

## Normalización runtime

Payment: null, undefined, número, booleano, objeto y array. Preapproval: mismos tipos. Mayúsculas y espacios. Cadena vacía.

## Fronteras temporales

`periodEnd === now` no cubre. `trialEndsAt === now` no cubre. `graceEndsAt === now` no cubre.

## Grace

Grace vigente se preserva. Grace vencida se preserva. Grace null se preserva. Nunca se genera una nueva frontera desde un webhook no aprobado.

## Preapproval

Authorized sobre SUSPENDED. Authorized sobre CANCELLED. Pending sobre SUSPENDED. Pending sobre CANCELLED. Paused con Active vigente. Paused con Active vencido. Paused con Trial vencido. Paused con Grace vencida. Pending sin cobertura. Pending con trial disponible. Authorized sin pago y sin trial. `PENDING_PAYMENT` como resultado explícito.

## Evidencia administrativa

REJECTED no cuenta. PENDING no cuenta. SIMULATED vigente cuenta. SIMULATED vencido no cuenta.

# 9. Pruebas de integración adicionales

Amplía `tests/billing-webhook-idempotency.test.ts`. Deben quedar cubiertos explícitamente:

1. Grace vigente no renueva frontera. 2. Grace vencida no renueva frontera. 3. Grace null permanece null. 4. REJECTED con cortesía/SIMULATED vigente no degrada. 5. Preapproval pending con ACTIVE vigente. 6. Preapproval pending sin cobertura. 7. Preapproval pending con trial válido. 8. Preapproval paused sin cobertura: no conserva Active vencido; queda PENDING_PAYMENT. 9. Preapproval authorized sobre SUSPENDED. 10. Preapproval pending sobre CANCELLED. 11. Payment APPROVED sobre SUSPENDED: Payment se aplica; período se extiende; Subscription/Tenant siguen SUSPENDED. 12. Payment APPROVED sobre CANCELLED: Payment se aplica; Subscription/Tenant siguen CANCELLED. 13. Reactivación manual con pago real aplicado. 14. Reactivación con Payment vencido. 15. Reactivación con cuarentena. 16. Reactivación con SIMULATED vigente. 17. Unknown Payment nuevo con tipo no string. 18. Unknown Payment existente con tipo no string. 19. Unknown preapproval con tipo no string. 20. Metadata completa de unknown. 21. Auditoría de ignored. 22. Fetch exactamente una vez para unknown. 23. Coherencia Tenant/Subscription en toda la matriz. 24. Fallo de auditoría en un evento ignorado: rollback de cualquier metadata local modificada; ledger termina `FAILED` según el manejo existente; no hay cambios parciales.

No elimines ni debilites las pruebas existentes. No añadas `skip`.

# 10. Fortalecer aserciones existentes

Revisa escenarios #18–#28. Para cada escenario relevante verifica: `Payment.status`, `Payment.rawStatus`, `Payment.paidAt`, `Payment.periodStart`, `Payment.periodEnd`, `approvedEffectAppliedAt`, `approvedEffectReconciliationRequired`, `Subscription.status`, `Subscription.currentPeriodStart`, `Subscription.currentPeriodEnd`, `Subscription.graceEndsAt`, `Tenant.status`, `AuditLog`, `WebhookEvent.result`, `ignoredReason`, indicadores de cobertura, número de efectos, ausencia de doble extensión. No basta con verificar solo un estado.

# 11. Compatibilidad con Fase 1

Confirma que siguen pasando: Payment nuevo APPROVED; Replay; PENDING → APPROVED; REJECTED → APPROVED; Concurrencia; Rollback; Reintento; Cuarentena; Reconciliación; Términos pendientes; Missing dataId; Ledger; Atomicidad de preapproval. No cambies pruebas antiguas salvo cuando describan explícitamente un defecto corregido. Documenta cada modificación de una prueba existente.

# 12. Schema y migración

No modifiques `prisma/schema.prisma` ni migraciones existentes. No crees migración. Si descubres que alguna corrección requiere schema: detente antes de modificarlo; documenta la necesidad; marca el estado `BLOQUEADO`.

# 13. Ejecución segura

El Supabase actual está autorizado como mockdata desechable. Antes de ejecutar: confirma que `.env.test` existe y está ignorado; confirma que no hay pagos reales de Mercado Pago; confirma que no quedan fixtures residuales; usa el runner seguro; no muestres datos personales ni credenciales; no apliques migraciones.

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
npm test
```

Si falla: no reintentes automáticamente; clasifica el fallo; no reduzcas aserciones; no modifiques archivos fuera del alcance; documenta el resultado exacto.

# 14. Criterios de aceptación

1. Grace nunca se reinicia por un webhook no aprobado. 2. `graceEndsAt` se preserva vigente, vencido o null. 3. Tenant y Subscription quedan coherentes en preapproval. 4. TRIAL no exige pago real. 5. PENDING_PAYMENT se sincroniza. 6. SUSPENDED y CANCELLED se preservan. 7. Paused sin cobertura no conserva acceso vencido. 8. APPROVED no auto-reactiva SUSPENDED. 9. APPROVED no auto-reactiva CANCELLED. 10. El efecto económico del pago sí se conserva. 11. Reactivación valida evidencia dentro de la transacción. 12. La prueba manual demuestra que la acción manual reactiva. 13. Normalizadores no lanzan ante tipos inesperados. 14. Unknown produce `IGNORED`, no 500. 15. Metadata unknown es completa y sanitizada. 16. Pruebas faltantes quedan implementadas. 17. No hay `skip`. 18. No cambia schema. 19. No hay migración. 20. Typecheck pasa. 21. Lint pasa. 22. Pruebas puras pasan. 23. Suite completa pasa. 24. Fixtures quedan limpios. 25. No se llama a Mercado Pago real. 26. Fase 1 permanece intacta. 27. No se hace commit.

# Informe final

Entrega: 1. Resumen ejecutivo. 2. Estado inicial de Git. 3. Confirmación de F2D-01 a F2D-08. 4. Grace y preservación de frontera. 5. Sincronización Tenant/Subscription. 6. Decisión de preapproval. 7. Estados terminales. 8. APPROVED económico con acceso preservado. 9. Normalización runtime. 10. Reactivación transaccional. 11. Metadata unknown. 12. Archivos modificados. 13. Schema y migración. 14. Pruebas puras. 15. Pruebas de integración. 16. Cambios en pruebas existentes. 17. Comandos ejecutados. 18. Resultados. 19. Limpieza. 20. Compatibilidad con Fase 1. 21. Riesgos restantes. 22. Elementos fuera de alcance. 23. Respuesta individual a F2D-01…F2D-08. 24. Recomendación sobre commit. 25. Estado: CORREGIDO / CORREGIDO CON RIESGOS / BLOQUEADO.

## Finalización

1. Guarda el informe en `docs/programa-mejora/03-precedencia-cron/10-respuesta-claude-correcciones-precedencia-cobertura.md`.
2. Confirma que el prompt quedó guardado en `docs/programa-mejora/03-precedencia-cron/09-prompt-claude-correcciones-precedencia-cobertura.md`.
3. No hagas commit. 4. No continúes con el cron. 5. Detente después del informe.
