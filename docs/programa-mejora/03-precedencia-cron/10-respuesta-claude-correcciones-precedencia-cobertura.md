# FASE 2E — Correcciones de precedencia, terminales y cobertura (informe)

Fecha: 2026-07-26
Autor: Claude (correcciones)
Commit base: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`
Alcance: hallazgos F2D-01 a F2D-08 de la revisión de Codex (doc 08). Sin cron.

## 1. Resumen ejecutivo

Se corrigieron los 8 hallazgos de Codex sobre la Subfase 2C:

- Una Grace existente (vigente, vencida o null) ya **nunca** se reinicia por un webhook no aprobado; el webhook preserva la frontera y el cron (subfase siguiente) decidirá la suspensión.
- La sincronización Tenant↔Subscription se separó por estado (ACTIVE / TRIAL / PENDING_PAYMENT / GRACE_PERIOD / terminales); TRIAL ya no exige pago real y PENDING_PAYMENT se sincroniza.
- `decidePreapprovalOutcome` protege estados terminales (SUSPENDED/CANCELLED) y `paused` sin cobertura ya no conserva acceso vencido (fallback técnico PENDING_PAYMENT).
- Un pago `APPROVED` sobre SUSPENDED/CANCELLED aplica su efecto económico pero **no** auto-reactiva; la reactivación queda para la acción manual.
- Los normalizadores aceptan `unknown` y no lanzan ante tipos JSON inesperados.
- La reactivación manual valida la evidencia **dentro** de la transacción que actualiza Subscription y Tenant.
- La metadata de estados desconocidos es completa y sanitizada.
- Se ampliaron y fortalecieron las pruebas puras y de integración; #28 ahora demuestra que reactiva la acción manual, no el webhook.

No se modificó el schema ni se creó migración. Fase 1 permanece intacta. No se hizo commit.

**Estado: CORREGIDO.**

## 2. Estado inicial de Git

```
HEAD 5e4be50 feat(billing): enforce idempotent atomic webhook effects
git status --short:
 M src/domains/billing/mercado-pago.service.ts
 M src/domains/platform/tenant-admin.service.ts
 M tests/billing-webhook-idempotency.test.ts
?? docs/programa-mejora/03-precedencia-cron/
?? src/domains/billing/precedence.ts
?? tests/unit/billing-precedence.test.ts
```

Confirmado: HEAD sigue en `5e4be50`, sin commit nuevo; `prisma/schema.prisma` y migraciones sin cambios; `package-lock.json` sin cambios; el diff corresponde únicamente a la Subfase 2C + esta corrección. `git diff --check`: solo avisos LF→CRLF (Windows), sin errores.

## 3. Confirmación de F2D-01 a F2D-08

Los ocho hallazgos se reprodujeron y confirmaron sobre el código previo antes de editar (rama no-APPROVED sin guard de GRACE; `applyTenantStatusInTx` con ACTIVE|TRIAL juntos y sin PENDING_PAYMENT; `decidePreapprovalOutcome` sin guard terminal y `paused` siempre PRESERVE; rama APPROVED que activaba sin mirar terminal; normalizadores con `.trim()` sobre tipo no validado; validación de evidencia fuera de la transacción; metadata unknown parcial; suite de integración con huecos y #28 engañoso). Todos están ahora corregidos.

## 4. Grace y preservación de frontera (F2D-01)

`decideSubscriptionActionForNonApproved` incorpora un guard: si `currentSubscriptionStatus === "GRACE_PERIOD"` devuelve `PRESERVE` con razón `EXISTING_GRACE_PRESERVED`, **antes** de evaluar cobertura. El servicio, en la rama no-APPROVED, solo ejecuta `ENTER_GRACE` (que asigna `graceEndsAt`) cuando la suscripción no es terminal y **no** está ya en GRACE. Resultado: una Grace vigente, vencida o `null` conserva su `graceEndsAt` exacto ante cualquier evento no aprobado y replays repetidos. El evento queda `IGNORED` con `ignoredReason=EXISTING_GRACE_PRESERVED`.

Pruebas: puras (`GRACE vigente/vencida/null`, PENDING/REJECTED) e integración #29 (vigente), #30 (vencida + 3 replays), #31 (null permanece null).

## 5. Sincronización Tenant/Subscription (F2D-02)

`applyTenantStatusInTx(tx, tenantId, status, { now, trialEndsAt })` trata cada estado por separado:

- **ACTIVE**: exige `hasCurrentRealPaymentCoverage`; si no hay, no toca el Tenant.
- **TRIAL**: no exige pago real; exige ventana de trial válida (`trialEndsAt > now`) → Tenant `TRIAL`.
- **PENDING_PAYMENT / GRACE_PERIOD / SUSPENDED / CANCELLED**: se escriben explícitamente.

Así se elimina la divergencia: un preapproval que decide `SET TRIAL` desde PENDING_PAYMENT deja Tenant `TRIAL`; un `SET PENDING_PAYMENT` deja Tenant `PENDING_PAYMENT` (no conserva ACTIVE/terminal). El guard de terminales vive en las decisiones (preapproval/APPROVED), que solo llaman al helper con el estado a persistir.

Pruebas de integración: #34 (pending sin cobertura → PENDING_PAYMENT coherente), #35 (pending con trial → TRIAL en ambos), #33 (ACTIVE preservado), #37/#38 (terminales preservados).

## 6. Decisión de preapproval (F2D-03)

`decidePreapprovalOutcome` reescrito con orden explícito:

- Desconocido → `IGNORE`.
- `cancelled` entrante → `SET CANCELLED` (política previa, fuera de alcance, documentado).
- Guard terminal: si `SUSPENDED`/`CANCELLED`, `authorized`/`pending`/`paused` → `PRESERVE` (`TERMINAL_SUBSCRIPTION_STATUS`).
- `authorized`: pago real→`SET ACTIVE`; acceso vigente→`PRESERVE`; trial disponible→`SET TRIAL`; nada→`SET PENDING_PAYMENT`.
- `pending`: acceso/pago vigente→`PRESERVE`; trial disponible→`SET TRIAL`; nada→`SET PENDING_PAYMENT`.
- `paused`: acceso/pago vigente→`PRESERVE`; sin cobertura→`SET PENDING_PAYMENT` (no conserva ACTIVE/TRIAL/GRACE vencidos; no inventa acceso).

## 7. Estados terminales (F2D-03/F2D-04)

- Preapproval: guard terminal (sección 6).
- APPROVED: la rama económica detecta `current.status ∈ {SUSPENDED, CANCELLED}` y **preserva** el acceso (no llama a `applyTenantStatusInTx`), conservando `graceEndsAt`. Nunca auto-reactiva.

Pruebas: puras (authorized/pending/paused sobre SUSPENDED/CANCELLED), integración #37, #38, #39, #40.

## 8. APPROVED económico con acceso preservado (F2D-04)

En la primera aplicación del efecto, el pago **siempre**: pasa a APPROVED, reclama el efecto una vez (marcador atómico), registra `paidAt`, extiende `periodStart/periodEnd`, aplica términos pendientes y mantiene cuarentena/idempotencia. Si la suscripción era terminal, `persistedSubStatus = current.status` (SUSPENDED/CANCELLED), no se toca el Tenant y el ledger sigue `PROCESSED` (el efecto económico sí se procesó). Auditoría con `paymentEffectApplied`, `accessStatePreserved`, `previousSubscriptionStatus`, `persistedSubscriptionStatus`, `ignoredAccessReason` (`SUSPENDED_REQUIRES_MANUAL_REACTIVATION` / `CANCELLED_ACCESS_PRESERVED`).

Pruebas de integración #39 (SUSPENDED) y #40 (CANCELLED) verifican efecto aplicado + acceso preservado + metadata.

## 9. Normalización runtime (F2D-05)

`normalizeProviderPaymentStatus` y `normalizePreapprovalStatus` aceptan `unknown` y validan `typeof value !== "string"` **antes** de `.trim()`: `null`, `undefined`, número, booleano, objeto, array y cadena vacía → estado desconocido sin lanzar. Se añadió `providerStatusLabel(value)`: string recortada; `"array"`/`"number"`/`"boolean"`/`"object"` para no-strings; `""` para null/undefined. Se usa para metadata `providerStatus` y para el `rawStatus` seguro persistido.

Pruebas: puras (todos los tipos, mayúsculas/espacios, vacío) e integración #44 (número, pago nuevo), #45 (objeto, pago existente), #46 (array, preapproval), #47 (fetch exactamente una vez). Ninguna produce 500/FAILED; todas terminan `IGNORED`.

## 10. Reactivación transaccional (F2D-06)

`updateTenantStatusForSuperAdmin`: la lectura de Payments y `hasCurrentAppliedAccessEvidence` ocurren **dentro** de la misma `$transaction` que actualiza Subscription y Tenant, compartiendo snapshot. Si no hay evidencia vigente, lanza el error de negocio y no modifica nada. Pruebas de integración #28 (pago real: el webhook no reactiva, la acción manual sí), #41 (vencido), #42 (cuarentena), #43 (SIMULATED vigente).

## 11. Metadata unknown (F2D-07)

Payment desconocido (nuevo/existente) y preapproval desconocido registran metadata primitiva y sanitizada: `ignoredReason`, `providerStatus` (acotado), `previousPaymentStatus`, `incomingPaymentStatus` (`"UNKNOWN"`), `persistedPaymentStatus`, `previousSubscriptionStatus`, `persistedSubscriptionStatus`, `accessCovered`, `realPaymentCovered`, `appliedAccessEvidence`, `paymentExists`, `subscriptionId`, `tenantId`. Nunca se serializan objetos/arrays ni el payload; `sanitizeWebhookMetadata` conserva strings/números/booleanos/null. Verificado en #24 (aserciones de metadata) y #44/#46.

## 12. Archivos modificados

- `src/domains/billing/precedence.ts` — normalizadores `unknown`, `providerStatusLabel`, `EXISTING_GRACE_PRESERVED`, `ACCESS_PRESERVED_REASON`, guard de GRACE en decisión no-aprobada, `decidePreapprovalOutcome` con guard terminal y paused sin cobertura.
- `src/domains/billing/mercado-pago.service.ts` — rama unknown (metadata completa + `rawStatus` seguro + seam `BEFORE_AUDIT_LOG`), precedencia de fila con `rawStatus` seguro, APPROVED sobre terminales, `applyTenantStatusInTx` por estado, preapproval con etiquetas seguras y metadata completa.
- `src/domains/platform/tenant-admin.service.ts` — validación de evidencia dentro de la transacción.
- `tests/unit/billing-precedence.test.ts` — +30 casos (81 en total).
- `tests/billing-webhook-idempotency.test.ts` — #24/#28 reforzados/reescritos, +20 escenarios (#29–#48).

## 13. Schema y migración

Sin cambios en `prisma/schema.prisma` y sin migraciones (verificado con `git status prisma/`). Todas las razones nuevas son constantes TypeScript en metadata; se reutiliza `WebhookEventResult.IGNORED`. No fue necesario `BLOQUEADO`.

## 14. Pruebas puras

`tests/unit/billing-precedence.test.ts`: 81 casos (51 previos + 30 nuevos): normalización runtime (tipos no-string, mayúsculas/espacios, vacío, `providerStatusLabel`), fronteras temporales exactas (`== now` no cubre), preservación de Grace, matriz de preapproval (terminales, paused vigente/vencido, pending sin cobertura/con trial, PENDING_PAYMENT explícito), evidencia administrativa (REJECTED/PENDING no cuentan, SIMULATED vigente sí / vencido no).

## 15. Pruebas de integración

`tests/billing-webhook-idempotency.test.ts`: 48 escenarios. Nuevos #29–#48 cubren: Grace vigente/vencida/null sin renovar frontera; REJECTED con SIMULATED vigente; preapproval pending (ACTIVE/sin cobertura/trial), paused sin cobertura, authorized sobre SUSPENDED, pending sobre CANCELLED; APPROVED sobre SUSPENDED/CANCELLED; reactivación manual (pago real, vencido, cuarentena, SIMULATED); unknown no-string (payment nuevo/existente, preapproval); fetch exactamente una vez; rollback de auditoría en evento ignorado (`FAILED`). #24 y #28 reforzados.

## 16. Cambios en pruebas existentes

- **Puras**: se corrigió el caso "authorized … trial vigente" (entrada `accessCovered:true` contradictoria con `PENDING_PAYMENT` → ahora `accessCovered:false`, mismo resultado `SET TRIAL`); se corrigió "paused sin cobertura" (antes esperaba conservar `ACTIVE` vencido — comportamiento defectuoso F2D-03 — ahora espera `SET PENDING_PAYMENT`).
- **Integración**: #24 ampliado (paidAt/períodos/marcador/Subscription/Tenant/metadata); #28 reescrito para demostrar que la acción manual reactiva (el webhook ya no auto-reactiva). No se debilitó ninguna aserción; no se añadió `skip`.

## 17. Comandos ejecutados

```
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
DATABASE_URL= DIRECT_URL= npm test   (runner seguro; el guard fuerza el destino de pruebas)
```

## 18. Resultados

- `npx tsc --noEmit`: sin errores.
- `npm run lint`: sin warnings ni errores.
- Pruebas puras: **176/176** (81 precedencia + 95 period/reconciliation).
- Suite completa: **259/259**, 0 fail, 0 skipped.
- No hubo llamadas reales a Mercado Pago (mock de `globalThis.fetch`).

## 19. Limpieza

Sonda de solo lectura tras la suite (sin exponer credenciales): `{ leftover_webhookEvents: 0, leftover_payments: 0, leftover_tenants: 0, leftover_users: 0 }`. El `after()` limpia por prefijo único `RUN`, tenantIds y usuarios SUPER_ADMIN creados como actores. `.env`/`.env.test` intactos e ignorados.

## 20. Compatibilidad con Fase 1

Siguen pasando: Payment nuevo APPROVED, replay, PENDING→APPROVED, REJECTED→APPROVED, concurrencia, rollback (3 puntos), reintento, cuarentena histórica, reconciliación, términos pendientes, missing dataId, ledger, atomicidad de preapproval. No se debilitaron las aserciones de rollback económico. El marcador atómico y la fuente única de período permanecen intactos.

## 21. Riesgos restantes

- Carreras y atomicidad del cron (F2-02/F2-05/F2-06) siguen pendientes (Subfase 2); esta corrección no las aborda.
- Política operativa definitiva para `graceEndsAt = null` sigue pendiente (el webhook solo la preserva; el cron decidirá).
- `paused` sin cobertura usa el fallback técnico `PENDING_PAYMENT`; la política comercial de pausa/renovación futura sigue sin definir.
- Jerarquía `PENDING < REJECTED < APPROVED`: política conservadora fail-safe, no verdad demostrada del proveedor.
- Cualquier `SIMULATED` aprobado vigente cuenta como evidencia administrativa (el modelo no distingue subtipo).

## 22. Elementos fuera de alcance (no tocados)

Cron y su CAS/atomicidad; `Notification.dedupeKey`/email; política definitiva de cancelación y acceso hasta fin de período (`cancelledAt` por webhook sin cambios); nuevos enums/columnas/migraciones; `Subscription.version`; timestamps del proveedor; métricas; UI/alertas; infraestructura externa. No se llamó a Mercado Pago real; no se modificó `.env`/`.env.test` ni el guard; no se hizo build ni commit.

## 23. Respuesta individual a F2D-01…F2D-08

- **F2D-01** (Grace se renueva): CORREGIDO — guard `EXISTING_GRACE_PRESERVED`; frontera preservada vigente/vencida/null; pruebas #29–#31.
- **F2D-02** (Tenant/Subscription divergen): CORREGIDO — `applyTenantStatusInTx` por estado (TRIAL sin pago real, PENDING_PAYMENT sincronizado); pruebas #33–#35.
- **F2D-03** (paused/ terminales): CORREGIDO — guard terminal + paused sin cobertura → PENDING_PAYMENT; pruebas puras + #36–#38.
- **F2D-04** (APPROVED auto-reactiva): CORREGIDO — efecto económico aplicado, acceso terminal preservado; pruebas #39/#40 y #28.
- **F2D-05** (normalizadores): CORREGIDO — aceptan `unknown`, no lanzan; pruebas puras + #44–#47.
- **F2D-06** (evidencia fuera de tx): CORREGIDO — validación dentro de la transacción; pruebas #28, #41–#43.
- **F2D-07** (metadata unknown): CORREGIDO — metadata completa/sanitizada; pruebas #24, #44, #46.
- **F2D-08** (pruebas incompletas / #28 engañoso): CORREGIDO — +20 escenarios, #28 reescrito, #24 reforzado, sin `skip`.

## 24. Recomendación sobre commit

No se hace commit en esta fase (según el prompt). Se recomienda una nueva revisión independiente de Codex sobre este estado; si aprueba, empaquetar la Subfase 2C+2E en un commit y solo entonces iniciar la Subfase 2 del cron.

## 25. Estado

**CORREGIDO.**

Los ocho hallazgos F2D quedaron resueltos dentro del alcance permitido, sin cambios de schema ni migración, con typecheck y lint limpios, 176 pruebas puras y 259 de la suite completa en verde, fixtures limpios y Fase 1 intacta. No se hizo commit ni se inició el cron.
