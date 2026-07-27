# FASE 2C — IMPLEMENTACIÓN DE PRECEDENCIA Y COBERTURA

## Documentación automática

Antes de analizar o modificar código:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/05-prompt-claude-implementacion-precedencia-cobertura.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/06-respuesta-claude-implementacion-precedencia-cobertura.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques documentos anteriores.

---

Actúa como ingeniero principal especializado en facturación recurrente, máquinas de estados, Mercado Pago, Prisma y diseño de dominio testeable.

Debes implementar la primera subfase bloqueante de la Fase 2:

* Precedencia de estados de Payment.
* Protección frente a eventos tardíos.
* Tratamiento seguro de estados desconocidos.
* Separación de las distintas definiciones de cobertura.
* Corrección mínima del webhook de Payment y preapproval.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/02-respuesta-claude-diagnostico-precedencia-cron.md`
* `docs/programa-mejora/03-precedencia-cron/04-respuesta-codex-verificacion-precedencia-cron.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/TESTING.md`

La fuente de verdad es el código actual posterior al commit:

`feat(billing): enforce idempotent atomic webhook effects`

## Objetivos

Corregir:

* F2-01: eventos `PENDING` o `REJECTED` tardíos degradan una suscripción cubierta.
* F2-03: estados desconocidos del proveedor degradan a `GRACE_PERIOD`.
* F2-04: no existen definiciones separadas y coherentes de cobertura.
* F2-08: `Payment.status` puede retroceder de `APPROVED` a `PENDING` o `REJECTED`.
* La parte de preapproval relacionada con precedencia y conservación de cobertura.

La fase debe garantizar:

1. Un `Payment APPROVED` cuyo efecto ya fue aplicado no retrocede.
2. `PENDING → APPROVED` continúa funcionando.
3. `REJECTED → APPROVED` continúa funcionando.
4. Un rechazo o pendiente tardío no quita acceso vigente.
5. Un Payment antiguo no degrada una suscripción cubierta por otro período.
6. Un estado desconocido no modifica Payment, Subscription ni Tenant.
7. Trial, cortesía, renovación simulada y pago real no se confunden.
8. Las decisiones quedan auditadas y registradas en el ledger.
9. La idempotencia y atomicidad aprobadas en Fase 1 permanecen intactas.

## Fuera de alcance

No implementes todavía:

* Cambios al cron.
* Compare-and-set del cron.
* Atomicidad del cron.
* `Notification.dedupeKey`.
* Cambios de email.
* Política de `graceEndsAt = null`.
* `Subscription.version`.
* `Payment.providerUpdatedAt`.
* `Subscription.lastProviderEventAt`.
* Nuevos valores del enum `WebhookEventResult`.
* Política definitiva de cancelación.
* Acceso hasta el final del período cancelado.
* `cancelledAt` por webhook.
* Métricas.
* Filtros de ingresos simulados.
* Interfaz.
* Alertas visuales.
* Reconciliación automática.
* Cambios en el guard de pruebas.

## Restricciones

No debes:

* Llamar a Mercado Pago real.
* Aplicar migraciones.
* Crear migraciones si no son estrictamente necesarias.
* Ejecutar `db push`.
* Ejecutar seeds.
* Modificar `.env`.
* Modificar `.env.test`.
* Mostrar secretos.
* Ejecutar build.
* Levantar el servidor.
* Hacer commit o push.
* Cambiar la política comercial de cancelación.
* Añadir infraestructura externa.

Puedes:

* Modificar servicios de facturación y tenant relacionados.
* Crear módulos puros de precedencia y cobertura.
* Crear pruebas puras.
* Crear pruebas de integración.
* Ejecutar la suite mediante el procedimiento autorizado con el Supabase de mockdata actual.
* Ejecutar typecheck y lint.

## Primera acción

1. Ejecuta:

```text
git status --short
git log -1 --oneline
```

2. Confirma que el commit de facturación es `HEAD`.
3. Confirma que solo están sin trackear los documentos de la Fase 2.
4. Guarda este prompt.
5. Inspecciona completamente:

   * `src/domains/billing/mercado-pago.service.ts`
   * `src/domains/billing/billing.service.ts`
   * `src/domains/billing/reconciliation.ts`
   * `src/domains/platform/tenant-admin.service.ts`
   * `src/domains/platform/audit.service.ts`
   * `prisma/schema.prisma`
   * `tests/billing-webhook-idempotency.test.ts`
6. Entrega un diagnóstico breve antes de editar.

# 1. Módulo puro de precedencia

Crea un módulo puro, con nombre coherente como:

`src/domains/billing/precedence.ts`

No debe importar Prisma.

Debe definir una decisión explícita para un Payment conocido.

## Estados conocidos

* `PENDING`.
* `REJECTED`.
* `APPROVED`.

## Matriz mínima

### PENDING entrante

* Payment actual `PENDING`: puede permanecer `PENDING`.
* Payment actual `REJECTED`: no debe retroceder a `PENDING`.
* Payment actual `APPROVED`: no debe retroceder.
* `approvedEffectAppliedAt != null`: no debe retroceder bajo ninguna circunstancia.

### REJECTED entrante

* Payment actual `PENDING`: puede pasar a `REJECTED`.
* Payment actual `REJECTED`: puede permanecer `REJECTED`.
* Payment actual `APPROVED`: no debe retroceder.
* `approvedEffectAppliedAt != null`: no debe retroceder.

### APPROVED entrante

* `PENDING → APPROVED`: permitido.
* `REJECTED → APPROVED`: permitido.
* `APPROVED → APPROVED`: permitido como duplicado o actualización de metadata.
* La idempotencia económica sigue dependiendo de `approvedEffectAppliedAt`.

## Resultado de decisión

La función debe devolver un resultado estructurado, por ejemplo:

```typescript
type PaymentTransitionDecision = {
  paymentStatusAction: "APPLY" | "PRESERVE";
  nextPaymentStatus: PaymentStatus;
  subscriptionAction: "ACTIVATE" | "ENTER_GRACE" | "PRESERVE";
  ignoredReason?: string;
};
```

Puedes usar nombres mejores.

Razones mínimas: `APPROVED_IS_TERMINAL`, `LOWER_PRECEDENCE_STATUS`, `CURRENT_ACCESS_COVERED`, `UNKNOWN_PROVIDER_STATUS`, `HISTORICAL_PAYMENT_NOT_APPLICABLE`, u otra estrictamente necesaria.

No añadas nuevos enums Prisma. Las razones pueden ser constantes TypeScript y guardarse en metadata.

# 2. Detección de estado conocido y desconocido

Reemplaza el comportamiento actual en el que cualquier valor desconocido se convierte en `PENDING`.

Crea una función pura que devuelva algo equivalente a:

```typescript
type NormalizedProviderPaymentStatus =
  | { known: true; status: "PENDING" | "REJECTED" | "APPROVED" }
  | { known: false; rawStatus: string };
```

Reglas: `approved`/`authorized` → `APPROVED`; `rejected`/`cancelled` → `REJECTED`; pendientes conocidos → `PENDING`; cualquier otro → desconocido.

No conviertas un desconocido en `PENDING`. Para desconocido: no crear Payment ambiguo, no cambiar status, no limpiar paidAt, no modificar Subscription/Tenant, ledger `IGNORED`, metadata `ignoredReason: UNKNOWN_PROVIDER_STATUS` + rawStatus + estado anterior, auditoría si hay tenant/subscription, sin reintentos infinitos.

# 3. Preservación de metadata económica

Cuando un Payment ya está `APPROVED` y llega un estado inferior: no cambiar status/paidAt/periodStart/periodEnd/approvedEffectAppliedAt/approvedEffectReconciliationRequired; solo metadata no económica (rawStatus, timestamp local si ya existía); no modificar Subscription/Tenant; ledger `IGNORED`; auditoría con estado anterior, entrante, conservado e ignoredReason.

# 4. Cobertura de acceso

`hasCurrentAccessCoverage`: TRIAL con trialEndsAt>now; ACTIVE con currentPeriodEnd>now; GRACE_PERIOD con graceEndsAt!=null y >now. Sin cobertura: SUSPENDED, CANCELLED, PENDING_PAYMENT, trial/activo/gracia vencidos, gracia null (inconsistente, no se resuelve aquí). Decide acceso, no ingreso. No exige provider MERCADO_PAGO.

# 5. Cobertura de pago real

`hasCurrentRealPaymentCoverage`: mismo tenant y subscription, provider MERCADO_PAGO, status APPROVED, approvedEffectAppliedAt!=null, approvedEffectReconciliationRequired=false, periodEnd!=null y >now. No cuentan SIMULATED, cortesías, cuarentena, sin efecto, sin período, vencidos, otro tenant/subscription.

# 6. Evidencia aplicada para acceso o reactivación

`hasCurrentAppliedAccessEvidence`: MercadoPago (mismos requisitos de pago real) o SIMULATED administrativo (provider SIMULATED, status APPROVED, periodEnd>now, creado por renovación simulada o cortesía). No es ingreso real. Documenta diferencia entre acceso, ingreso real y evidencia administrativa aplicada.

# 7. Rama no-APPROVED del webhook

Payment actual APPROVED o efecto aplicado: preserva todo, ledger IGNORED, auditoría. PENDING/REJECTED con acceso vigente (`hasCurrentAccessCoverage`): aplicar transición de fila según precedencia, no modificar Subscription/Tenant, metadata subscriptionAction PRESERVE + ignoredReason CURRENT_ACCESS_COVERED. Sin cobertura vigente: solo a GRACE si la transición es válida, no CANCELLED/SUSPENDED, no desconocido, y no hay evidencia aplicada vigente de otro Payment. Un pendiente/rechazado nunca mueve CANCELLED→GRACE ni SUSPENDED→GRACE.

# 8. Payment antiguo diferente

Evento no aprobado de un Payment diferente: buscar evidencia vigente; si otro Payment aprobado/aplicado cubre el período o hay cortesía/simulado vigente → no degradar, registrar CURRENT_ACCESS_COVERED. No usar "cualquier Payment APPROVED". No agregar timestamps del proveedor en schema.

# 9. APPROVED entrante

Conserva Fase 1 (idempotencia, cuarentena, atomicidad, ledger, auditoría, fuente única de períodos). Añade solo reglas de precedencia PENDING/REJECTED/APPROVED→APPROVED. No reactivar CANCELLED automáticamente; no sobreescribir suspensión manual sin decisión explícita. Documenta si el comportamiento actual activa SUSPENDED/CANCELLED.

# 10. Preapproval

Solo precedencia y cobertura. Authorized: no activa por sí solo; con acceso vigente conserva estado local; sin acceso, regla anterior compatible con trial/pending sin "cualquier pago aprobado". Paused: no degrada cobertura vigente; metadata de pausa; sin política nueva. Pending: no degrada cubierta. Cancelled: fuera de alcance, mantener comportamiento salvo indispensable; documentar riesgo. Desconocido: no modificar Subscription/Tenant, ledger IGNORED, metadata UNKNOWN_PROVIDER_STATUS, auditoría.

# 11. Callers de cobertura

`applyTenantStatusInTx`, `updateSubscriptionFromPreapproval`, reactivación manual, y cualquier búsqueda de "un Payment APPROVED" para acceso. Acceso → hasCurrentAccessCoverage; pago real → hasCurrentRealPaymentCoverage; evidencia → hasCurrentAppliedAccessEvidence. No mezclar las tres. No modificar MRR/ingresos.

# 12. Auditoría y ledger

Reutiliza `WebhookEventResult.IGNORED`. Metadata sanitizada: ignoredReason, providerStatus, previousPaymentStatus, incomingPaymentStatus, persistedPaymentStatus, previousSubscriptionStatus, persistedSubscriptionStatus, accessCovered, realPaymentCovered, appliedAccessEvidence, identificadores permitidos. No guardar payload, firma, tokens, correos innecesarios, tarjeta, errores sin sanitizar.

# 13. Schema y migración

No modificar schema ni crear migración. Si es imposible sin schema: detente, documenta, marca BLOQUEADO, no inventes columnas.

# 14. Pruebas puras obligatorias

Normalización (6), precedencia (7), cobertura de acceso (9), pago real (7), evidencia aplicada (4), estados desconocidos (2). (35 casos listados en el prompt.)

# 15. Pruebas de integración obligatorias

14 escenarios (APPROVED→PENDING/REJECTED preservan; REJECTED→APPROVED aplica una vez; Payment antiguo no degrada; PENDING con trial; REJECTED con cortesía; desconocido; desconocido sobre existente; preapproval authorized/paused/pending/desconocido; reactivación manual; coherencia Tenant/Subscription). Mock fetch, HMAC de prueba, Supabase autorizado, IDs únicos, limpieza, cero llamadas reales, sin skip. Aserciones completas sobre todos los modelos.

# 16. Ejecución segura

Antes de `npm test`: `.env.test` existe e ignorado; sin pagos MERCADO_PAGO reales; sin fixtures residuales; procedimiento seguro Fase 1I/1J; no modificar guard; no mostrar credenciales. Ejecuta tsc, lint, pruebas puras, npm test. Si falla: no reintentar, clasificar, no reducir aserciones, documentar.

# 17. Criterios de aceptación

(21 criterios; ver prompt.)

# Informe final

(26 secciones; ver prompt.) Estado: IMPLEMENTADO / IMPLEMENTADO CON RIESGOS / BLOQUEADO.

## Finalización

1. Informe en `docs/programa-mejora/03-precedencia-cron/06-respuesta-claude-implementacion-precedencia-cobertura.md`.
2. Prompt en `docs/programa-mejora/03-precedencia-cron/05-prompt-claude-implementacion-precedencia-cobertura.md`.
3. No commit. 4. No continuar con cron/notificaciones/email/cancelación/métricas. 5. Detente tras el informe.

---

> Nota: este documento almacena el prompt de la Fase 2C. El texto rector completo (matrices y listados exhaustivos de pruebas) fue provisto por el usuario en el mensaje de esta fase; aquí se conserva íntegro en su estructura y de forma condensada en los apartados 14-17 y el informe, sin alterar objetivos, alcance ni restricciones.
