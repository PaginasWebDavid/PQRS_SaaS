# FASE 2J — Revisión independiente final de economía, acceso y cobertura (informe)

Fecha: 2026-07-27
Autor: Claude (revisión independiente, solo lectura)
Commit base: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`
Alcance: revisión adversarial de las correcciones F2H-01…F2H-06 (Fase 2I de Codex). No se inició el cron. No se modificó código.

## 1. Resumen ejecutivo

Las correcciones F2H son reales y cierran los dos hallazgos ALTOS abiertos:

- **Economía y acceso quedan en compare-and-set separados.** Un pago APPROVED aplica primero el efecto económico de la Subscription (período, precio, unidades, términos) con un CAS que **no compara `status`**, y luego decide el acceso con un CAS distinto que **solo** cambia estado/`graceEndsAt`. Una suspensión concurrente puede preservar SUSPENDED/CANCELLED sin impedir el período pagado. La invariancia `Payment.period === Subscription.currentPeriod` vuelve a cumplirse incluso bajo preservación de acceso.
- **El conflicto económico revierte por completo** (marcador incluido) y admite un único reintento; dos conflictos consecutivos abortan sin parciales y el ledger queda `FAILED`.
- **Preapproval y Payment no aprobado corren bajo `Serializable`** con un único reintento `P2034`; `applyTenantStatusInTx` exige `realPaymentCoverageValidated` y lanza (rollback) si falta, eliminando la divergencia Subscription/Tenant.
- **La metadata tras un CAS perdido usa el estado persistido real** (`readPersistedSubscriptionSnapshot`), no el snapshot previo.
- **Todo status externo (webhook, preapproval y creación de checkout) queda acotado a 255** vía `providerStatusLabel`.
- Las pruebas adversariales usan transacciones concurrentes reales que fuerzan los conflictos de forma determinista.

Verificado por ejecución: typecheck y lint limpios, **187/187** pruebas puras, **283/283** de la suite completa por el runner seguro, fixtures limpios y guard intacto. No hay hallazgos críticos ni altos abiertos dentro del alcance; solo observaciones menores y riesgos ya aceptados.

**Veredicto: APROBADA CON RIESGOS MENORES.**

## 2. Estado de Git

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

HEAD sigue en `5e4be50`; sin commit nuevo; `git diff --check` limpio (solo avisos LF→CRLF de Windows); `prisma/schema.prisma`, `prisma/migrations/`, `package.json`, `package-lock.json`, `.env` y `.env.test` sin cambios.

## 3. Alcance del diff

Limitado a precedencia, cobertura, webhook de Mercado Pago, reactivación administrativa, pruebas y documentación (`+2249 / −245` en los 3 archivos rastreados, más `precedence.ts`, `tests/unit/billing-precedence.test.ts` y docs sin trackear). Sin cambios de cron, notificaciones, email, métricas, UI ni política definitiva de cancelación. `audit.service.ts` no se modificó (su contrato ya acepta el cliente transaccional).

## 4. Verificación F2H-01 a F2H-06

| ID | Estado | Evidencia | Riesgo restante | Commit | Cron | Producción |
|---|---|---|---|---|---|---|
| F2H-01 CAS de acceso perdía economía | CORREGIDO | `claimSubscriptionEconomicEffect` (984-1003, sin `status`) separado de `claimSubscriptionTransition` de acceso (1017-1021); Payment y Subscription comparten período; #51 y #57. | Ninguno alto. | No | No | No |
| F2H-02 divergencia Subscription/Tenant | CORREGIDO | Preapproval Serializable (690); `applyTenantStatusInTx` ACTIVE exige `realPaymentCoverageValidated` y lanza si falta (1280-1282); #58/#59. | Observación menor OBS-1 (SSI ante mutación de evidencia sin tocar Subscription), operacionalmente inalcanzable y sin divergencia. | No | No | No |
| F2H-03 metadata con snapshot obsoleto | CORREGIDO | `readPersistedSubscriptionSnapshot`/`persistedSubscriptionMetadata` (97-119); #49/#50/#51 afirman estado persistido real. | Ninguno. | No | No | No |
| F2H-04 status de checkout sin límite | CORREGIDO | `createMercadoPagoSubscriptionForTenant` usa `providerStatusLabel` para `mercadoPagoStatus` y auditoría (373,384,397); #61. | Ninguno. | No | No | No |
| F2H-05 pruebas concurrentes incompletas | CORREGIDO | #51 reforzado; #57 (conflicto económico), #58/#59 (evidencia concurrente), #60 (cobertura concurrente), #61 (checkout). | Ninguno alto. | No | No | No |
| F2H-06 procedimiento PowerShell | CORREGIDO EN PROCEDIMIENTO | El guard aborta la ruta insegura (reproducido); la suite corre con variables blank solo en el proceso. | Separación física de proyectos sigue obligatoria antes de producción. | No | No | Separar proyectos |

## 5. Separación economía/acceso

Flujo APPROVED (efecto aplicado): (1) reclama `approvedEffectAppliedAt`; (2) `economicSnapshot` releído; (3) `computeNextPeriod`; (4) actualiza período del Payment; (5) **CAS económico** sobre `{id, tenantId, currentPeriodStart, currentPeriodEnd, unitsSnapshot, priceCents, currency, pending*}` — sin `status`; si `count=0` lanza `SubscriptionEconomicConflictError`; (6) `accessSnapshot` releído; (7) si no es terminal, **CAS de acceso** que solo escribe `status/graceEndsAt/lastWebhookAt`; Tenant solo si gana; (8) metadata desde el estado persistido real; (9) auditoría + ledger. Confirmado: una suspensión concurrente puede impedir ACTIVE pero no el período/términos; Payment y Subscription comparten período (#51 `assertPaymentMatchesSubscriptionPeriod` bajo SUSPENDED); términos se aplican y limpian una sola vez; replay DUPLICATE.

## 6. CAS económico

`claimSubscriptionEconomicEffect` (144-166): `where` con identidad, ambos períodos, `unitsSnapshot`, `priceCents`, `currency` y los cuatro campos pendientes; **no** incluye `status`; valores tal cual de PostgreSQL, fechas no reconstruidas. `data` no toca acceso. `count===1` éxito; `count===0` → excepción → toda la transacción (incluido el marcador) se revierte. `runBillingTransaction` (74-95) reintenta una sola vez ante `SubscriptionEconomicConflictError`; un segundo conflicto se relanza (attempt===1). No re-llama a Mercado Pago (el fetch está fuera). **#57** demuestra: dos conflictos → `FAILED`, Payment revertido a PENDING con marcador null y período intacto, 0 auditorías; un webhook posterior aplica exactamente una vez (ACTIVE, período compartido, un solo PROCESSED). No queda estado irrecuperable marcado como DUPLICATE.

## 7. CAS de acceso

`claimSubscriptionTransition` (123-140): `where` con `{id, tenantId, status, currentPeriodEnd, graceEndsAt, trialEndsAt}`; `data` solo `status/graceEndsAt/lastWebhookAt` (o metadata técnica de preapproval). No reescribe período/precio/unidades ni limpia términos. Si gana: `applyTenantStatusInTx` lleva Subscription y Tenant a ACTIVE coherentemente. Si pierde: la economía permanece, Tenant no cambia, se relee la fila real, la metadata usa `persistedSubscriptionStatus` real, ledger `PROCESSED`, replay `DUPLICATE`. `accessSnapshot` se lee después de la economía, por lo que su `currentPeriodEnd` coincide con el período recién escrito y el CAS de acceso no entra en autoconflicto.

## 8. Términos pendientes

Se calculan desde `economicSnapshot`, se aplican y limpian dentro del CAS económico y no dependen del acceso. **#51** (suspensión concurrente con `pendingUnitsSnapshot=77`, `pendingPriceCents=300000`) confirma: se aplican pese a la suspensión, se limpian, y el replay no los vuelve a aplicar. Riesgo comercial de aplicar términos sobre terminales: documentado y fuera de alcance.

## 9. Payment APPROVED

Conserva claim idempotente, cuarentena histórica (`RECONCILIATION_REQUIRED`), rollback, reconciliación y período único. Sobre SUSPENDED/CANCELLED (#39/#40/#51): efecto económico aplicado, período compartido, términos una vez, acceso terminal preservado, Tenant terminal preservado, replay DUPLICATE, metadata correcta. No hay auto-reactivación indirecta: `applyTenantStatusInTx` para ACTIVE exige el flag validado, que solo se pasa cuando el CAS de acceso gana sobre un estado no terminal.

## 10. Payment no aprobado

Corre bajo `Serializable` con un reintento `P2034`. Dentro: relee Subscription, cobertura exacta, decisión, CAS al entrar Grace, Tenant solo si gana, auditoría y ledger atómicos. **#60**: REJECTED observa ausencia de cobertura; una transacción concurrente crea un SIMULATED vigente y activa la Subscription; el aborto Serializable + reintento recalcula y NO entra a Grace (Subscription/Tenant ACTIVE, `graceEndsAt` null, IGNORED `CONCURRENT_SUBSCRIPTION_CHANGE`, `appliedAccessEvidence=true`, `serializationRetried=true`). Sin cambios parciales.

## 11. Preapproval

El fetch remoto ocurre fuera. Dentro de la transacción Serializable: relectura de Subscription, cobertura por identidad exacta, decisión, CAS, Tenant (solo si SET gana), AuditLog y WebhookEvent. No hay segunda validación con retorno silencioso: `applyTenantStatusInTx` para ACTIVE lanza si falta el flag → rollback. **#58/#59**: cuando la evidencia entra en cuarentena o vence concurrentemente (y la transacción concurrente toca la Subscription), el aborto Serializable + reintento reevalúa y NO activa (`realPaymentCovered=false`, `persistedSubscriptionStatus=PENDING_PAYMENT`, una sola auditoría). Subscription nunca queda ACTIVE con Tenant en otro estado.

## 12. Manejo de P2034

`isSerializationConflict` reconoce solo `PrismaClientKnownRequestError` código `P2034`; otros errores se relanzan. `runBillingTransaction` reintenta como máximo una vez (`attempt < 2`) y solo si la opción lo habilita; no hay loop. No re-llama a Mercado Pago. Cada intento relee Subscription y Payments. Una transacción abortada no deja AuditLog ni ledger finales parciales (todo está dentro de la transacción). La reactivación administrativa transforma P2034 en `SerializationConflictError` sin reintento interno (acción humana; el operador reintenta).

## 13. Metadata real

Tras `count=0`, los tres flujos releen el estado con `readPersistedSubscriptionSnapshot` y reportan `persistedSubscriptionStatus`, `currentPeriodStart/End` y `graceEndsAt` reales, con la razón concurrente correcta. **#49** afirma SUSPENDED real (antes PENDING_PAYMENT), **#50** CANCELLED real, **#51** SUSPENDED real. AuditLog y WebhookEvent coinciden.

## 14. Status acotado

`MAX_PROVIDER_STATUS_LENGTH = 255`; `truncateProviderStatus` recorta tras `trim`; `providerStatusLabel` da string acotado o el nombre del tipo (`number`/`object`/`array`) y `""` para null/undefined. Rutas verificadas: webhook de Payment (`rawStatusForStore`/`providerStatusSafe`), webhook de preapproval (`preapprovalStatusSafe`) y creación de checkout (`createMercadoPagoSubscriptionForTenant`). La búsqueda global de `preapproval.status`/`rawStatus`/`mercadoPagoStatus`/`providerStatus` no encontró ninguna persistencia directa sin el helper. **#55** y **#61** cubren string de 10.000, objeto, array y null sin serializar payload.

## 15. Helper de Tenant

`applyTenantStatusInTx` para ACTIVE ya no hace una segunda consulta: exige `ctx.realPaymentCoverageValidated === true` y **lanza** (produce rollback) si falta. No puede retornar sin actualizar Tenant tras activar Subscription. Los demás estados sincronizan nominalmente (TRIAL con ventana válida; PENDING_PAYMENT/GRACE/SUSPENDED/CANCELLED tal cual). El contrato evita el mal uso: un caller futuro que active Subscription sin pasar el flag obtiene un error, no una activación silenciosa divergente.

## 16. Identidad

`PaymentCoverageRow` incluye `tenantId` y `subscriptionId`; `CoverageIdentity` exige ambos; `isCurrentRealPaymentRow`, `isCurrentSimulatedAccessRow`, `hasCurrentRealPaymentCoverage` y `hasCurrentAppliedAccessEvidence` descartan filas cruzadas. Callers verificados: `loadCoverageRows`, rama no-APPROVED, preapproval, `applyTenantStatusInTx` (ACTIVE) y reactivación filtran ambos. **#52** confirma que un Payment cruzado (tenant objetivo + subscription ajena) no reactiva.

## 17. Seams

`runBillingStep` (206) ejecuta hooks solo si `process.env.NODE_ENV === "test"`; no hay entrada HTTP; `__billingTestSeam` reexpone el runner para la reactivación. Los tests resetean hooks en `finally` y el `after()` global también los limpia. No hay sleeps ni promesas pendientes; los tests del archivo son secuenciales y cada hook dispara una vez. Riesgo menor: el estado del hook es global al módulo, pero su uso está acotado y restablecido; en producción el callback nunca corre.

## 18. Pruebas puras

`tests/unit/billing-precedence.test.ts`: **92 casos** (total unitario 187/187). Cubren normalización runtime, límites (10.000 → 255, trim antes de truncar, tipos no-string), identidad exacta y cruzada (MP y SIMULATED), precedencia de fila, Grace null, paused sobre CANCELLED, fronteras exactas (`== now`) y evidencia REJECTED/PENDING/SIMULATED. La separación economía/acceso no es una función pura, por lo que se valida en integración; no se encontraron expectativas que oculten defectos.

## 19. Pruebas de integración

`tests/billing-webhook-idempotency.test.ts`: **61 escenarios**. Nuevos F2H (#57–#61) con transacciones concurrentes reales:
- **#57** conflicto económico: dos conflictos → FAILED, rollback del marcador, cero período parcial, reintento posterior exitoso, un solo PROCESSED, período compartido.
- **#58** cuarentena concurrente durante preapproval: aborto Serializable + reevaluación, no activa, `realPaymentCovered=false`, una sola auditoría.
- **#59** vencimiento concurrente: mismo principio.
- **#60** cobertura concurrente en no-aprobado: no entra a Grace, preserva ACTIVE, metadata real.
- **#61** checkout con status largo/objeto/array/null: etiqueta acotada, sin fuga de payload.
Reforzados: **#51** (Payment/Subscription/Tenant/marcador/período compartido/términos/ledger/auditoría/metadata/replay); **#49/#50** (estado persistido real); **#39/#40** (terminal con términos y replay). No se limitó la revisión al conteo de 283.

## 20. Compatibilidad con Fase 1

Por código y ejecución siguen verdes: claim atómico, idempotencia, replay, concurrencia del mismo Payment, rollback en tres puntos, reintento, cuarentena, reconciliación, términos pendientes, períodos, missing dataId, ledger y preapproval atómico. La regresión semántica de Fase 2G (romper `Payment.period === Subscription.currentPeriod` cuando APPROVED perdía el CAS combinado) queda **eliminada**: el efecto económico ya no depende del CAS de acceso, y #51/#57 verifican la invariancia bajo preservación de acceso.

## 21. Ejecución

| Comando | Resultado |
|---|---|
| `npm test` (entorno normal) | Aborto esperado del guard antes de Prisma (`TEST_DATABASE_URL apunta al mismo destino que DATABASE_URL`) |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS, 0 warnings |
| `node --import tsx --test tests/unit/*.test.ts` | 187/187 PASS |
| `env DATABASE_URL= DIRECT_URL= npm test` | 283/283 PASS, 0 skipped |

`.env` no se movió ni modificó; `.env.test` intacto e ignorado; guard sin cambios. Todos los `fetch` de Mercado Pago fueron mocks.

## 22. Limpieza

Conteos antes y después idénticos: `tenants=6, users=17, payments=5, webhooks=0, mpPayments=0`. Fixtures de billing tras la suite: `billingFixtures=0, billingUsers=0, billingWebhooks=0`. Cero Payments reales de Mercado Pago; cero llamadas reales; `.env`/`.env.test` intactos.

## 23. Hallazgos

### OBS-1 — BAJA — Preapproval podría activar sobre evidencia invalidada por una mutación que no toque Subscription

- Archivo/símbolo: `updateSubscriptionFromPreapproval`, cobertura + `claimSubscriptionTransition`.
- Comportamiento: bajo SSI de PostgreSQL, una única antidependencia rw (la transacción concurrente sólo escribe el `Payment` que el preapproval leyó, sin tocar la `Subscription`) puede no formar una estructura peligrosa y no abortar; el CAS de acceso no detecta cambios que solo afecten al `Payment`.
- Impacto: el preapproval podría confirmar ACTIVE (con Tenant ACTIVE, sin divergencia) usando evidencia que otra transacción invalidó en la misma ventana.
- Evidencia: #58/#59 fuerzan el aborto porque la transacción concurrente también escribe la `Subscription` (`lastWebhookAt`); una cuarentena/vencimiento que sólo toque el `Payment` no forzaría el aborto.
- Por qué es BAJA/aceptable: la cuarentena solo ocurre por migración histórica/reconciliación sobre pagos antiguos (nunca sobre la evidencia fresca de un `authorized`), y el vencimiento es temporal, no concurrente; el resultado nunca es divergente (Subscription y Tenant coherentes). El defecto ALTO de F2H-02 (divergencia) está corregido.
- Corrección futura (no bloqueante): un `SELECT ... FOR UPDATE`/bloqueo explícito de las filas Payment de cobertura, o incluir un contador/última-mutación de evidencia en el CAS de acceso.
- Prueba requerida: preapproval `authorized` con cuarentena de la evidencia sin tocar Subscription.
- ¿Bloquea commit? No. ¿Bloquea cron? No. ¿Bloquea producción? No.

### OBS-2 — INFORMATIVA — `ignoredReason` tras reintento exitoso

- En un reintento Serializable que termina en PRESERVE (p. ej. #60), la metadata reporta `ignoredReason = CONCURRENT_SUBSCRIPTION_CHANGE` (por `attempt > 0`) en lugar de la razón de negocio (`CURRENT_ACCESS_COVERED`). No es incorrecto (hubo un cambio concurrente) pero es menos preciso. Sin impacto económico ni de acceso.

No se encontraron hallazgos críticos ni altos abiertos dentro del alcance.

## 24. Riesgos aceptados

- Política definitiva de cancelación de preapproval: fuera de alcance.
- Aplicar/limpiar términos pendientes sobre una Subscription terminal: correcto técnicamente, con riesgo comercial (devolución/acceso hasta fin de período) documentado y fuera de alcance.
- `SIMULATED` vigente cuenta como evidencia administrativa, no como ingreso.
- `paused` sin cobertura usa el fallback técnico `PENDING_PAYMENT`.
- Reparación de `graceEndsAt = null`: corresponde al cron.
- Dos conflictos económicos consecutivos dejan ledger `FAILED` para reentrega posterior del proveedor.
- El proyecto Supabase de mockdata compartido está autorizado solo antes de producción; separar producción y pruebas es obligación operativa previa al lanzamiento (el guard ya lo exige).

## 25. Lista para commit

Si se aprueba (este informe aprueba con riesgos menores), el commit debe contener exactamente:

Implementación:
```
src/domains/billing/precedence.ts
src/domains/billing/mercado-pago.service.ts
src/domains/platform/tenant-admin.service.ts
```
Pruebas:
```
tests/unit/billing-precedence.test.ts
tests/billing-webhook-idempotency.test.ts
```
Documentación (todos los `.md` de la fase; contienen solo documentación y ninguna credencial):
```
docs/programa-mejora/03-precedencia-cron/*.md
```
Excluir: `.env`, `.env.test`, schema, migraciones, package files, temporales, logs y cambios ajenos.

## 26. Comandos `git add`

No ejecutar como parte de esta revisión (solo lectura). Para el commit posterior:
```
git add -- src/domains/billing/precedence.ts
git add -- src/domains/billing/mercado-pago.service.ts
git add -- src/domains/platform/tenant-admin.service.ts
git add -- tests/unit/billing-precedence.test.ts
git add -- tests/billing-webhook-idempotency.test.ts
git add -- docs/programa-mejora/03-precedencia-cron
```

## 27. Mensaje de commit

```
feat(billing): enforce payment precedence and access coverage
```

## 28. Recomendación

Aprobar la subfase y proceder al commit con la lista y el mensaje anteriores (staging explícito, nunca `git add .`). OBS-1 y OBS-2 pueden abordarse en una subfase posterior o junto con el cron; no bloquean. Tras el commit, iniciar la Subfase 2 del cron. Antes de producción: separar físicamente los proyectos Supabase de producción y pruebas.

## 29. Veredicto

**APROBADA CON RIESGOS MENORES.**

Se cumplen los 22 criterios de aprobación: F2H-01…F2H-06 corregidos; economía y acceso separados; el CAS de acceso no puede perder economía; el conflicto económico revierte por completo y aplica el efecto exactamente una vez; Payment y Subscription comparten período; términos pendientes se aplican una sola vez; preapproval usa evidencia estable bajo Serializable; Subscription y Tenant no divergen; el CAS perdido registra el estado real; todo status externo está acotado; los seams son seguros; las pruebas adversariales demuestran las carreras con transacciones reales; Fase 1 permanece intacta; sin cambios de schema ni migración; typecheck, lint, 187 puras y 283 completas pasan sin skips; fixtures limpios. Las únicas observaciones (OBS-1 baja y operacionalmente inalcanzable; OBS-2 informativa) no bloquean commit, cron ni producción.

No se modificó código, no se hizo commit y no se inició el cron. Prompt guardado en `docs/programa-mejora/03-precedencia-cron/19-prompt-claude-revision-final-economia-acceso.md`; este informe en `docs/programa-mejora/03-precedencia-cron/20-respuesta-claude-revision-final-economia-acceso.md`.
