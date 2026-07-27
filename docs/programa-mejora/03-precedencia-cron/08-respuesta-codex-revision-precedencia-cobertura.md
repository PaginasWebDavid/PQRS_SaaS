# FASE 2D - Revisión independiente de precedencia y cobertura

Fecha de revisión: 2026-07-26
Revisor: Codex, revisión técnica independiente
Commit base: \`5e4be50 feat(billing): enforce idempotent atomic webhook effects\`
Alcance: implementación de precedencia y cobertura de Fase 2C

## 1. Resumen ejecutivo

La implementación corrige correctamente una parte importante de F2-01, F2-03, F2-04 y F2-08:

- Los estados Payment conocidos se normalizan sin convertir valores desconocidos en PENDING.
- Un Payment APPROVED no retrocede ni pierde \`paidAt\`, períodos o marcador.
- PENDING->APPROVED y REJECTED->APPROVED siguen aplicando el efecto exactamente una vez.
- Un Payment antiguo no aprobado no degrada una suscripción cubierta por otro Payment vigente.
- Se separan cobertura de acceso, cobertura de pago real y evidencia administrativa.
- Los eventos desconocidos se registran como \`IGNORED\`.
- No se modificó schema ni se creó una migración.
- Las garantías de idempotencia y rollback de Fase 1 siguen pasando.

Sin embargo, la subfase no puede aprobarse todavía. Se encontraron defectos altos:

1. Un evento no aprobado recibido durante una Grace vencida vuelve a crear un período de gracia completo. Un replay puede aplazar la suspensión.
2. \`applyTenantStatusInTx\` exige pago real también para \`TRIAL\` y no maneja \`PENDING_PAYMENT\`; algunos preapprovals cambian Subscription pero dejan Tenant en el estado anterior.
3. \`decidePreapprovalOutcome\` no protege estados terminales y \`paused\` conserva incluso un \`ACTIVE\` vencido sin cobertura.
4. Un APPROVED entrante reactiva SUSPENDED/CANCELLED sin distinguir suspensión manual. La prueba de reactivación manual no detecta esto porque el webhook ya reactiva antes de invocar la acción manual.
5. La suite de integración no cubre varios escenarios obligatorios y algunas aserciones son demasiado parciales.

Veredicto: **REQUIERE CORRECCIONES**. No debe hacerse commit ni iniciarse la Subfase 2 del cron sobre este estado.

## 2. Estado de Git

HEAD permanece en:

\`\`\`text
5e4be50 feat(billing): enforce idempotent atomic webhook effects
\`\`\`

No existe un commit nuevo.

Cambios de implementación observados:

\`\`\`text
M  src/domains/billing/mercado-pago.service.ts
M  src/domains/platform/tenant-admin.service.ts
M  tests/billing-webhook-idempotency.test.ts
?? src/domains/billing/precedence.ts
?? tests/unit/billing-precedence.test.ts
\`\`\`

La carpeta \`docs/programa-mejora/03-precedencia-cron/\` permanece sin trackear e incluye la documentación de esta fase.

Confirmaciones:

- \`prisma/schema.prisma\`: sin cambios.
- Migraciones: ninguna nueva en el diff.
- \`package-lock.json\`: sin cambios.
- \`.env\` y \`.env.test\`: ignorados y sin cambios.
- \`git diff --check\`: sin errores.
- No hay cambios de cron, Notification, email, UI, autenticación, storage, reservas, PQRS ni guard de pruebas.

## 3. Alcance del diff

| Archivo | Clasificación | Evaluación |
| --- | --- | --- |
| \`src/domains/billing/precedence.ts\` | Precedencia y tres coberturas | Dentro de alcance |
| \`src/domains/billing/mercado-pago.service.ts\` | Payment, preapproval, ledger y callers | Dentro de alcance |
| \`src/domains/platform/tenant-admin.service.ts\` | Reactivación manual | Dentro de alcance |
| \`tests/unit/billing-precedence.test.ts\` | Pruebas puras | Dentro de alcance |
| \`tests/billing-webhook-idempotency.test.ts\` | Integración y compatibilidad Fase 1 | Dentro de alcance |
| \`docs/programa-mejora/03-precedencia-cron/\` | Documentación | Dentro de alcance |

No se encontraron archivos de implementación fuera de alcance.

## 4. Normalización

\`normalizeProviderPaymentStatus\` reconoce:

| Raw normalizado | Resultado |
| --- | --- |
| approved, authorized | APPROVED |
| rejected, cancelled, canceled | REJECTED |
| pending, in_process, in_mediation | PENDING |
| cualquier otro | desconocido |

La función aplica \`trim().toLowerCase()\`, por lo que normaliza espacios y mayúsculas.

\`null\`, \`undefined\` y cadena vacía producen desconocido con \`rawStatus = ""\`.

No quedan referencias a \`mapPaymentStatus\` ni otro default antiguo que convierta unknown a PENDING dentro del flujo de Mercado Pago.

Hallazgo: el parámetro está tipado como string, pero proviene de JSON externo. Un número, objeto o array ejecutaría \`.trim()\` y lanzaría TypeError. El ledger inicial quedaría FAILED y la ruta respondería 500. Debe validarse \`typeof raw === "string"\` antes de normalizar. \`normalizePreapprovalStatus\` tiene el mismo problema.

## 5. Matriz de precedencia

| Persistido | Entrante | Payment final | paidAt | Subscription/Tenant | Ledger |
| --- | --- | --- | --- | --- | --- |
| PENDING | PENDING | PENDING | null | Preserve si hay cobertura; si no, Grace | IGNORED o PROCESSED |
| PENDING | REJECTED | REJECTED | null | Preserve si hay cobertura; si no, Grace | IGNORED o PROCESSED |
| PENDING | APPROVED | APPROVED | se fija | Claim y Active | PROCESSED |
| REJECTED | PENDING | REJECTED | null | Preserve o Grace según cobertura | IGNORED o PROCESSED |
| REJECTED | REJECTED | REJECTED | null | Preserve o Grace según cobertura | IGNORED o PROCESSED |
| REJECTED | APPROVED | APPROVED | se fija | Claim y Active | PROCESSED |
| APPROVED | PENDING | APPROVED | se conserva | Preserve | IGNORED |
| APPROVED | REJECTED | APPROVED | se conserva | Preserve | IGNORED |
| APPROVED | APPROVED | APPROVED | se conserva | Claim si falta marcador; si no, duplicate | PROCESSED o DUPLICATE |

\`rawStatus\` se refresca para estados conocidos aunque la fila se preserve. Los campos \`periodStart\`, \`periodEnd\`, marcador y cuarentena no forman parte del update de precedencia y se conservan.

La jerarquía PENDING < REJECTED < APPROVED hace que REJECTED->PENDING preserve REJECTED. El repositorio no demuestra que esa sea la política comercial de Mercado Pago, pero es una decisión fail-safe: no concede acceso ni revierte una aprobación. Se clasifica como segura pero conservadora, no como defecto bloqueante.

## 6. Protección de APPROVED

Para el mismo Payment, un APPROVED:

- no cambia a PENDING;
- no cambia a REJECTED;
- no pierde \`paidAt\`;
- no pierde \`periodStart\` o \`periodEnd\`;
- no pierde \`approvedEffectAppliedAt\`;
- no cambia la cuarentena;
- no degrada Subscription;
- no degrada Tenant.

Un evento desconocido sobre un Payment aprobado actualiza únicamente \`rawStatus\`.

Un evento no aprobado de otro Payment tampoco degrada si existe acceso o evidencia aplicada vigente.

No queda un \`upsert.update\` que escriba incondicionalmente los períodos o el marcador. El status y paidAt se calculan después de la decisión de precedencia.

La protección no cubre correctamente estados terminales de Subscription para un nuevo APPROVED: la rama APPROVED actualiza Subscription a ACTIVE y luego Tenant a ACTIVE, aunque estuvieran SUSPENDED o CANCELLED. Esto requiere corrección.

## 7. Estados desconocidos

### Payment nuevo

Comportamiento confirmado:

- no crea Payment;
- no modifica Subscription;
- no modifica Tenant;
- finaliza WebhookEvent como \`IGNORED\`;
- usa \`UNKNOWN_PROVIDER_STATUS\`;
- no vuelve a consultar Mercado Pago dentro del servicio;
- retorna un resultado controlado, sin lanzar por un string desconocido.

La prueba no cuenta llamadas de fetch, aunque el código estático muestra una consulta externa en \`processMercadoPagoWebhook\`.

### Payment existente

Conserva status, paidAt, períodos, marcador y cuarentena. Solo actualiza \`rawStatus\`, además de auditoría y ledger.

La prueba #24 no verifica paidAt, períodos, Subscription, Tenant, AuditLog ni metadata completa.

### Preapproval desconocido

No modifica Subscription ni Tenant y registra \`IGNORED\` con auditoría dentro de la transacción del ledger. No actualiza metadata técnica de Subscription, una decisión conservadora aceptable.

Los normalizadores no son seguros ante tipos JSON inesperados; ese caso todavía produce 500.

## 8. Cobertura de acceso

\`hasCurrentAccessCoverage\` funciona así:

| Subscription | Requisito | Resultado |
| --- | --- | --- |
| TRIAL | \`trialEndsAt > now\` | cobertura |
| ACTIVE | \`currentPeriodEnd > now\` | cobertura |
| GRACE_PERIOD | \`graceEndsAt != null && graceEndsAt > now\` | cobertura |
| PENDING_PAYMENT | ninguno | sin cobertura |
| SUSPENDED | ninguno | sin cobertura |
| CANCELLED | ninguno | sin cobertura |

Usa \`>\`, no \`>=\`. En el instante exacto de vencimiento no hay cobertura. Esa política es coherente y fail-safe.

Una fecha inválida compara como false y no otorga cobertura. \`graceEndsAt = null\` tampoco otorga cobertura.

La función depende solo de Subscription y no mezcla ingresos.

Problema: para una Grace vencida devuelve false y la rama no-APPROVED vuelve a ejecutar ENTER_GRACE, asignando \`graceEndsAt = now + graceDays\`. Esto renueva la gracia ante cada evento tardío. Una Subscription que ya está en Grace no debe recibir un plazo nuevo por un replay; debe conservar su frontera y dejar que el cron decida la suspensión.

## 9. Cobertura de pago real

\`hasCurrentRealPaymentCoverage\` exige:

- provider MERCADO_PAGO;
- status APPROVED;
- marcador no null;
- cuarentena false;
- \`periodEnd > now\`.

No cuenta SIMULATED, vencidos, cuarentena, sin marcador, pendientes o rechazados.

La función pura no contiene tenantId/subscriptionId. La identidad depende del caller.

\`loadCoverageRows\` filtra por tenant y subscription exactos. \`applyTenantStatusInTx\` y la reactivación filtran solo por tenant, pero el modelo tiene una Subscription única por tenant; no se encontró una fuga entre conjuntos.

No hay casts inseguros en las filas de cobertura. El cast de \`existing.status\` a \`KnownPaymentStatus\` es compatible con el enum Prisma actual.

## 10. Evidencia administrativa

\`hasCurrentAppliedAccessEvidence\` cuenta:

- pago real Mercado Pago con todos los requisitos;
- cualquier SIMULATED APPROVED con \`periodEnd > now\` y sin cuarentena.

No exige \`approvedEffectAppliedAt\` para SIMULATED, coherente con los flujos administrativos actuales.

No cuenta SIMULATED vencido, PENDING, REJECTED ni Mercado Pago en cuarentena.

El modelo no permite distinguir con fiabilidad entre renovación simulada, cortesía y otro Payment SIMULATED. La función reconoce cualquier SIMULATED aprobado y vigente. Esto debe documentarse como política administrativa amplia. No bloquea esta fase porque el prompt aceptó evidencia simulada vigente y no se usa para MRR.

## 11. Reactivación manual

La reactivación:

- busca Payments del tenant;
- usa evidencia vigente;
- rechaza Payment vencido, sin marcador real o en cuarentena;
- permite SIMULATED vigente;
- actualiza Tenant y Subscription en una transacción;
- conserva la auditoría existente.

La consulta de evidencia ocurre antes de la transacción. Existe una ventana pequeña: la evidencia puede vencer o cambiar entre la lectura y la actualización. Debe moverse dentro de la transacción para que la validación y la reactivación compartan snapshot y decisión.

La prueba #28 no prueba correctamente la reactivación manual con pago real. Después de suspender el tenant, envía un APPROVED; el propio webhook lo cambia a ACTIVE antes de invocar \`updateTenantStatusForSuperAdmin\`. La acción manual se ejecuta sobre un tenant ya activo.

No se prueban vencido, cuarentena ni SIMULATED en integración.

## 12. applyTenantStatusInTx

Callers encontrados:

- preapproval con decisión SET;
- Payment APPROVED;
- Payment no aprobado que entra a Grace.

No es usado por cortesía, renovación simulada, onboarding ni servicios externos al webhook Mercado Pago.

Comportamiento:

- ACTIVE o TRIAL: exige cobertura de pago real y escribe Tenant ACTIVE.
- GRACE_PERIOD: escribe Tenant GRACE_PERIOD.
- SUSPENDED: escribe Tenant SUSPENDED.
- CANCELLED: escribe Tenant CANCELLED.
- PENDING_PAYMENT: no tiene rama.

Problemas:

1. TRIAL legítimo no debería exigir un pago real. Si preapproval decide SET TRIAL desde PENDING_PAYMENT, Subscription pasa a TRIAL pero Tenant puede quedarse PENDING_PAYMENT.
2. PENDING_PAYMENT no se sincroniza. Un preapproval authorized/pending sin cobertura puede cambiar Subscription a PENDING_PAYMENT mientras Tenant conserva ACTIVE, TRIAL, SUSPENDED o CANCELLED.
3. El helper puede convertir Tenant a ACTIVE para un status TRIAL cuando exista pago real, mezclando estado de trial con estado activo.
4. El contrato y comentario dicen ACTIVE/TRIAL, pero la regla de pago real solo es válida para ACTIVE del flujo Mercado Pago.

Payment APPROVED recién procesado sí funciona porque el marcador y período se actualizan antes de cargar la cobertura dentro de la misma transacción.

## 13. Rama no-APPROVED

| Escenario | Payment | Subscription/Tenant | graceEndsAt | Ledger |
| --- | --- | --- | --- | --- |
| PENDING inicial sin cobertura | PENDING | Grace/Grace | nueva | PROCESSED |
| PENDING con trial vigente | PENDING | Trial/Trial preservados | sin cambio | IGNORED |
| REJECTED inicial sin cobertura | REJECTED | Grace/Grace | nueva | PROCESSED |
| REJECTED con Active vigente | REJECTED | Active/Active preservados | sin cambio | IGNORED |
| REJECTED viejo con otro Payment vigente | REJECTED | preservados | sin cambio | IGNORED |
| PENDING sobre APPROVED | APPROVED | preservados | sin cambio | IGNORED |
| REJECTED sobre APPROVED | APPROVED | preservados | sin cambio | IGNORED |
| REJECTED con SUSPENDED | REJECTED | SUSPENDED preservado | sin cambio | IGNORED |
| REJECTED con CANCELLED | REJECTED | CANCELLED preservado | sin cambio | IGNORED |
| REJECTED con Grace vigente | REJECTED | Grace preservada | sin cambio | IGNORED |
| REJECTED con Grace vencida | REJECTED | vuelve a Grace | se renueva | PROCESSED |

La última fila es un defecto alto. Lo mismo ocurre con Grace null: el evento no aprobado le asigna una nueva fecha, aunque la política de reparación de Grace null estaba fuera de alcance.

Solo debe ejecutarse ENTER_GRACE cuando la Subscription todavía no está en GRACE_PERIOD y no es terminal. Una Grace existente debe preservar su frontera, incluso vencida o null.

## 14. Payments antiguos

Las filas de evidencia se cargan por el mismo tenant y subscription.

Un Payment nuevo aprobado y vigente evita la degradación. Un SIMULATED vigente también la evita. Un Payment vencido no evita la degradación. Un Payment de otro tenant o subscription no entra en \`loadCoverageRows\`.

Para esta subfase, comprobar cobertura vigente es suficiente para impedir que un evento antiguo retire acceso. No es suficiente para reconstruir la cronología completa del proveedor, pero los timestamps quedaron aplazados deliberadamente.

La variable \`appliedAccessEvidenceElsewhere\` incluye técnicamente el Payment entrante. En un no-aprobado normal no cuenta; para un Payment aprobado terminal ya existe además \`currentPaymentIsTerminal\`. El nombre es impreciso, pero no cambia la decisión actual.

## 15. APPROVED entrante

Siguen intactos:

- claim atómico;
- cuarentena histórica;
- PENDING->APPROVED;
- REJECTED->APPROVED;
- replay APPROVED;
- concurrencia;
- rollback;
- términos pendientes;
- períodos compartidos;
- auditoría;
- ledger.

La consulta de cobertura no interfiere con el claim. El marcador se fija antes de actualizar períodos y todo permanece en la transacción.

Defecto: el APPROVED actualiza Subscription a ACTIVE sin considerar que el estado vigente sea CANCELLED o SUSPENDED. Después \`applyTenantStatusInTx\` encuentra el propio pago real y activa Tenant. Sin un campo de motivo de suspensión, la corrección mínima segura es:

- nunca auto-reactivar CANCELLED;
- preservar SUSPENDED y dejar que la reactivación manual use la evidencia recién creada;
- continuar aplicando y registrando el pago sin perder su efecto económico.

## 16. Preapproval

| Escenario | Decisión actual | Evaluación |
| --- | --- | --- |
| authorized con pago real vigente | SET ACTIVE | Correcto salvo estado terminal |
| authorized sin pago | Trial, Preserve o PENDING_PAYMENT | Parcial; puede divergir Tenant |
| authorized con SIMULATED vigente | No cuenta como real; preserva solo si Subscription ya tiene acceso | Coherente con separación |
| paused con Active vigente | Preserve | Correcto |
| paused sin cobertura | Preserve cualquier estado | Defecto si conserva Active vencido |
| pending con trial vigente | SET/PRESERVE Trial | Subscription correcta; Tenant puede divergir |
| pending con Active vigente | Preserve | Correcto |
| pending sin cobertura | SET PENDING_PAYMENT | Tenant puede quedar anterior |
| cancelled | SET CANCELLED | Política anterior, fuera de alcance |
| desconocido | IGNORE | Correcto |

\`decidePreapprovalOutcome\` no protege SUSPENDED/CANCELLED para AUTHORIZED o PENDING. Puede cambiar Subscription mientras el helper deja Tenant terminal, produciendo divergencia.

\`paused\` ignora \`accessCovered\` y conserva incluso un ACTIVE vencido. La prueba pura actual codifica expresamente ese comportamiento. Debe preservar solo cobertura válida o estados terminales; sin cobertura necesita un fallback técnico explícito que no invente acceso, por ejemplo PENDING_PAYMENT, hasta definir la política comercial.

No se rediseña aquí la política de cancelled.

## 17. Auditoría y ledger

Los eventos ignorados usan \`WebhookEventResult.IGNORED\` e \`ignoredReason\`. Las razones son constantes TypeScript.

La metadata usa solo primitivos y pasa por \`sanitizeWebhookMetadata\`; no contiene payload, firma, token, tarjeta ni objetos anidados. Los booleanos se conservan.

La auditoría y el resultado del ledger se crean dentro de la misma transacción en los flujos revisados. Un fallo de auditoría revierte las operaciones locales de esa transacción.

La metadata de eventos no aprobados conocidos es suficiente: estado previo, entrante, persistido, Subscription, cobertura y razón.

La metadata de Payment desconocido es incompleta respecto del prompt:

- no incluye \`persistedPaymentStatus\`;
- no incluye \`persistedSubscriptionStatus\`;
- no incluye cobertura de acceso, pago real o evidencia administrativa;
- no diferencia claramente estado entrante normalizado porque es unknown.

Esto no filtra secretos, pero reduce la explicación de la decisión. Debe completarse con campos primitivos antes del commit.

## 18. Calidad del módulo puro

Fortalezas:

- no crea PrismaClient ni abre conexiones;
- solo importa tipos;
- no muta inputs;
- funciones pequeñas y reutilizables;
- comparaciones temporales explícitas;
- sin valores económicos mágicos;
- razones centralizadas;
- fácil de ejecutar sin PostgreSQL.

Debilidades:

- depende de tipos Prisma en compilación; no es dependencia runtime.
- los normalizadores no validan tipos JSON inesperados;
- PaymentCoverageRow no contiene identidad y obliga al caller a filtrar correctamente;
- la jerarquía de estados es una política conservadora, no una verdad demostrada del proveedor;
- \`nonApprovedSubscriptionStatus()\` siempre devuelve Grace y aporta poca abstracción;
- \`decideSubscriptionActionForNonApproved\` no trata Grace existente como estado que debe conservar su frontera;
- \`decidePreapprovalOutcome\` no tiene guard de estados terminales.

El módulo sigue siendo puro y testeable, pero no es exhaustivo para las máquinas de estado reales.

## 19. Pruebas puras

El archivo contiene **51 bloques de test**, no solo 35. Las categorías solicitadas están agrupadas en varios tests con múltiples aserciones.

Cobertura presente:

- estados conocidos y unknown;
- matriz principal de precedencia;
- acceso para todos los estados;
- pago real;
- evidencia administrativa;
- decisión no aprobada;
- preapproval.

Ausencias o debilidades:

- mayúsculas y espacios no se prueban;
- tipos runtime inesperados no se prueban;
- fronteras exactas \`periodEnd == now\`, \`trialEndsAt == now\` y \`graceEndsAt == now\` no se prueban;
- no se prueba REJECTED para evidencia administrativa;
- no se prueban filtros tenant/subscription porque la fila pura no contiene identidad;
- no se prueba Grace vencida entrando de nuevo a Grace;
- la prueba de paused sin cobertura valida el defecto de conservar Active vencido;
- no se prueba PENDING/AUTHORIZED sobre SUSPENDED o CANCELLED;
- no se prueba PENDING_PAYMENT en sincronización del Tenant.

Las expectativas prueban resultados públicos y no duplican literalmente el algoritmo, salvo que algunos nombres/comentarios incorporan la política implementada como si ya estuviera aprobada.

## 20. Pruebas de integración

Existen 28 escenarios totales. Los nuevos son #18-#28, once escenarios.

Mapeo de los grupos solicitados:

| Grupo solicitado | Escenario real | Estado |
| --- | --- | --- |
| APPROVED->PENDING | #18 | Presente |
| APPROVED->REJECTED | #19 | Presente |
| REJECTED->APPROVED | #20 | Presente |
| Payment antiguo no degrada | #21 | Presente |
| PENDING con trial | #22 | Presente |
| REJECTED con cortesía | ninguno | Falta |
| unknown Payment nuevo | #23 | Presente |
| unknown Payment existente | #24 | Parcial |
| preapproval authorized | #25 y #26 | Presente, aserciones parciales |
| preapproval paused | #11 | Solo con cobertura; falta sin cobertura |
| preapproval pending | ninguno | Falta |
| preapproval unknown | #27 | Presente, parcial |
| reactivación manual | #28 | Engañoso/incompleto |
| coherencia Tenant/Subscription | varios | No cubre estados problemáticos |

Pruebas faltantes obligatorias:

- cortesía/SIMULATED vigente evita degradación;
- preapproval pending con cobertura y sin cobertura;
- paused sin cobertura;
- Trial desde PENDING_PAYMENT sincroniza Tenant;
- terminales SUSPENDED/CANCELLED ante preapproval y APPROVED;
- Grace vencida no renueva su plazo;
- reactivación manual con pago real sin auto-reactivación previa;
- reactivación con Payment vencido, cuarentena y SIMULATED;
- metadata/auditoría completa de ignored;
- fetch exactamente una vez para unknown;
- rollback de auditoría en eventos ignorados.

Las pruebas nuevas no verifican consistentemente Payment, Subscription, Tenant, ledger, AuditLog, períodos y marcador en cada escenario. La suite verde no compensa estos huecos.

## 21. Compatibilidad con Fase 1

Las garantías de Fase 1 siguen pasando:

- idempotencia;
- replay;
- concurrencia;
- rollback en tres puntos;
- reintento;
- cuarentena;
- reconciliación;
- missing dataId;
- ledger;
- términos pendientes;
- períodos.

El escenario #11 anterior esperaba paused->Grace, comportamiento reconocido como bug. Cambiar esa expectativa fue correcto.

Sin embargo, el nuevo #11 ya no prueba una transición SET de Subscription y Tenant. El escenario #26 verifica el resultado exitoso de authorized con pago real, pero no rollback de preapproval. La implementación sigue usando una transacción, por lo que no hay regresión de código demostrada; la cobertura debe reforzarse.

No se modificaron las aserciones de rollback económico para hacerlas menos estrictas.

## 22. Resultados de ejecución

\`\`\`text
npx tsc --noEmit
PASS

npm run lint
PASS - sin warnings ni errores

npx tsx --test tests/unit/*.test.ts
146 tests, 146 pass, 0 fail, 0 skipped

npm test
209 tests, 209 pass, 0 fail, 0 skipped
\`\`\`

La suite completa se ejecutó una sola vez mediante el runner seguro. No se aplicaron migraciones, db push, seeds ni build. No se levantó servidor.

Los webhooks de integración utilizaron mocks de \`globalThis.fetch\`; no hubo llamadas reales a Mercado Pago.

## 23. Limpieza

Conteos antes y después:

\`\`\`text
tenants=6
users=17
payments=5
pqrs=55
webhookEvents=0
mercadoPagoPayments=0
billingFixtures=0
\`\`\`

Los conteos coinciden exactamente. No quedaron fixtures ni WebhookEvent de pruebas.

\`.env\` permaneció intacto. \`.env.test\` existe, está ignorado y no fue modificado.

Los primeros intentos de la consulta agregada previa fallaron durante el parseo de PowerShell, antes de abrir conexión. La consulta read-only válida posterior confirmó la línea base antes de ejecutar la suite.

## 24. Hallazgos

### F2D-01 - Grace vencida se renueva por un evento no aprobado

- Severidad: alta.
- Archivo/símbolo: \`precedence.ts:124-146\`, rama no-APPROVED en \`mercado-pago.service.ts:846-888\`.
- Comportamiento actual: Grace vencida no tiene cobertura y entra otra vez a Grace con una fecha nueva.
- Escenario: replay REJECTED/PENDING después de vencer la gracia.
- Impacto: aplaza la suspensión y permite acceso adicional repetible.
- Evidencia: no existe guard para \`currentSubscriptionStatus === GRACE_PERIOD\`.
- Corrección mínima: preservar toda Grace existente y no renovar \`graceEndsAt\`.
- Prueba requerida: Grace vigente, vencida y null mantienen su frontera.
- ¿Bloquea el commit?: Sí.
- ¿Bloquea la Subfase 2 del cron?: Sí.
- ¿Bloquea producción?: Sí.

### F2D-02 - Preapproval puede divergir Tenant y Subscription

- Severidad: alta.
- Archivo/símbolo: \`decidePreapprovalOutcome\`, \`applyTenantStatusInTx\`.
- Comportamiento actual: SET TRIAL exige pago real para actualizar Tenant; PENDING_PAYMENT no tiene sincronización.
- Escenario: Subscription PENDING_PAYMENT con trial vigente recibe authorized/pending.
- Impacto: Subscription TRIAL y Tenant PENDING_PAYMENT, o Subscription PENDING_PAYMENT y Tenant ACTIVE/terminal.
- Evidencia: \`mercado-pago.service.ts:944-964\`.
- Corrección mínima: separar ACTIVE, TRIAL y PENDING_PAYMENT; sincronizar cada estado con su política.
- Prueba requerida: matriz preapproval con coherencia Tenant/Subscription.
- ¿Bloquea el commit?: Sí.
- ¿Bloquea la Subfase 2 del cron?: Sí.
- ¿Bloquea producción?: Sí.

### F2D-03 - Paused preserva acceso vencido y preapproval no protege terminales

- Severidad: alta.
- Archivo/símbolo: \`precedence.ts:273-298\`.
- Comportamiento actual: PAUSED siempre PRESERVE; AUTHORIZED/PENDING pueden mover SUSPENDED/CANCELLED.
- Escenario: Active vencido recibe paused o terminal recibe pending/authorized.
- Impacto: acceso inválido persistente o divergencia con Tenant.
- Evidencia: prueba pura de paused sin cobertura espera ACTIVE.
- Corrección mínima: guard de terminales y fallback sin acceso explícito.
- Prueba requerida: paused sin cobertura y preapproval sobre terminales.
- ¿Bloquea el commit?: Sí.
- ¿Bloquea la Subfase 2 del cron?: Sí.
- ¿Bloquea producción?: Sí.

### F2D-04 - APPROVED reactiva estados terminales automáticamente

- Severidad: alta.
- Archivo/símbolo: rama APPROVED en \`mercado-pago.service.ts:729-775\`.
- Comportamiento actual: actualiza Subscription y Tenant a ACTIVE sin considerar SUSPENDED/CANCELLED.
- Escenario: pago llega después de suspensión manual o cancelación.
- Impacto: revierte una decisión administrativa.
- Evidencia: la prueba #28 deja el tenant ACTIVE antes de la reactivación manual.
- Corrección mínima: CANCELLED nunca se auto-reactiva; SUSPENDED conserva estado y usa reactivación manual.
- Prueba requerida: APPROVED sobre SUSPENDED/CANCELLED.
- ¿Bloquea el commit?: Sí.
- ¿Bloquea la Subfase 2 del cron?: No técnicamente, pero debe corregirse antes de continuar.
- ¿Bloquea producción?: Sí.

### F2D-05 - Normalizadores no validan tipos runtime

- Severidad: media.
- Archivo/símbolo: \`normalizeProviderPaymentStatus\`, \`normalizePreapprovalStatus\`.
- Comportamiento actual: un valor no string ejecuta \`.trim()\`.
- Escenario: payload malformado o cambio de contrato.
- Impacto: ledger FAILED, respuesta 500 y reintentos del proveedor.
- Evidencia: funciones aceptan contractualmente string, pero JSON no tiene validación runtime.
- Corrección mínima: comprobar \`typeof value === "string"\`.
- Prueba requerida: número, objeto y array quedan unknown sin throw.
- ¿Bloquea el commit?: Sí por criterio de unknown controlado.
- ¿Bloquea la Subfase 2 del cron?: No.
- ¿Bloquea producción?: No por sí solo.

### F2D-06 - Validación de reactivación fuera de transacción

- Severidad: media.
- Archivo/símbolo: \`tenant-admin.service.ts:217-242\`.
- Comportamiento actual: consulta evidencia y después abre la transacción.
- Escenario: evidencia vence o cambia entre lectura y update.
- Impacto: reactivación con evidencia ya inválida.
- Evidencia: dos operaciones separadas.
- Corrección mínima: consultar y validar dentro de la transacción.
- Prueba requerida: evidencia cambia antes del update.
- ¿Bloquea el commit?: Sí, porque el cambio de reactivación pertenece a esta subfase.
- ¿Bloquea la Subfase 2 del cron?: No.
- ¿Bloquea producción?: No si se corrige antes del lanzamiento.

### F2D-07 - Metadata unknown incompleta

- Severidad: baja-media.
- Archivo/símbolo: rama unknown en \`mercado-pago.service.ts:593-627\`.
- Comportamiento actual: no registra estados persistidos ni indicadores de cobertura.
- Escenario: investigación de un estado nuevo del proveedor.
- Impacto: decisión menos explicable.
- Evidencia: \`ignoreMetadata\` contiene solo parte del contrato solicitado.
- Corrección mínima: completar metadata primitiva y sanitizada.
- Prueba requerida: AuditLog y WebhookEvent contienen la decisión completa.
- ¿Bloquea el commit?: Sí por criterio explícito de trazabilidad.
- ¿Bloquea la Subfase 2 del cron?: No.
- ¿Bloquea producción?: No por sí solo.

### F2D-08 - Suite de integración incompleta y reactivación engañosa

- Severidad: alta.
- Archivo/símbolo: escenarios #18-#28 de \`billing-webhook-idempotency.test.ts\`.
- Comportamiento actual: faltan grupos obligatorios y #28 no prueba el flujo manual declarado.
- Escenario: cortesía, pending/paused preapproval, terminales, Grace vencida, matrices de reactivación.
- Impacto: defectos altos permanecen verdes.
- Evidencia: 11 escenarios nuevos frente a los 14 grupos y matrices solicitados.
- Corrección mínima: agregar escenarios y aserciones completas sin reducir garantías previas.
- Prueba requerida: lista de la sección 20.
- ¿Bloquea el commit?: Sí.
- ¿Bloquea la Subfase 2 del cron?: Sí.
- ¿Bloquea producción?: Sí como ausencia de evidencia sobre flujos críticos.

## 25. Correcciones obligatorias

1. Preservar \`graceEndsAt\` para toda Subscription ya en GRACE_PERIOD; no renovar por webhook no aprobado.
2. Corregir \`applyTenantStatusInTx\` para tratar ACTIVE, TRIAL y PENDING_PAYMENT por separado.
3. Añadir guard de SUSPENDED/CANCELLED en preapproval.
4. Hacer que paused preserve únicamente cobertura vigente o terminales; definir fallback técnico para acceso vencido.
5. Impedir que un APPROVED auto-reactive CANCELLED o una suspensión manual.
6. Mover la validación de reactivación dentro de la transacción.
7. Hacer normalizadores seguros ante tipos runtime.
8. Completar metadata de unknown.
9. Agregar los escenarios de integración faltantes y fortalecer aserciones de los existentes.
10. Corregir la prueba #28 para que la acción manual sea quien realice la reactivación.

No hace falta modificar schema ni crear migraciones para estas correcciones.

## 26. Riesgos aceptados

- REJECTED->PENDING preserva REJECTED: política conservadora y fail-safe.
- \`periodEnd == now\` no cubre: frontera estricta aceptada.
- Cualquier SIMULATED aprobado y vigente cuenta como evidencia administrativa porque el modelo no distingue subtipo.
- La política definitiva de preapproval cancelled sigue fuera de alcance.
- Timestamps del proveedor continúan aplazados.
- Carreras y atomicidad del cron siguen fuera de esta subfase, pero no debe iniciarse su implementación hasta corregir los estados base señalados.
- La prueba completa contra mockdata está autorizada; producción y pruebas deberán separarse antes del lanzamiento.

## 27. Recomendación sobre commit

No crear commit todavía.

La implementación tiene una base útil y conserva Fase 1, pero contiene hallazgos altos dentro del alcance y no satisface todos los criterios de aprobación. Claude debe realizar una subfase corta de correcciones de precedencia/cobertura y pruebas; después debe repetirse esta revisión antes de iniciar el cron.

## 28. Veredicto

**REQUIERE CORRECCIONES.**

Razones determinantes:

- APPROVED se protege a nivel de Payment, pero no respeta estados terminales de Subscription.
- Grace vencida puede renovarse por replay.
- Preapproval puede dejar Tenant y Subscription incoherentes.
- paused conserva acceso vencido.
- la reactivación manual no está probada correctamente;
- faltan escenarios obligatorios;
- existen hallazgos altos abiertos dentro del alcance.

No se modificó implementación. No se hizo commit ni push. No se continúa con el cron.

