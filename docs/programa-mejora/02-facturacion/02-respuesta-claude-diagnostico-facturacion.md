FASE 1A — Diagnóstico de integridad de facturación
Sesión de solo análisis. No se modificó código; el working tree sigue limpio (solo la carpeta destino docs/programa-mejora/02-facturacion/ sin trackear). No se ejecutó Prisma, migraciones, build ni conexiones. Toda afirmación cita archivo:línea.

1. Resumen ejecutivo
La facturación es funcional en el camino feliz pero no es segura para producción por tres defectos críticos y varios altos, todos en la ruta del webhook de Mercado Pago y sus interacciones con el cron y las acciones manuales:

Reextensión de período por replay — un webhook APPROVED repetido vuelve a extender currentPeriodEnd +30 días cada vez, porque la actualización de la suscripción corre incondicionalmente después del upsert idempotente del Payment (mercado-pago.service.ts:386-412).
Degradación por eventos fuera de orden — un PENDING/REJECTED tardío (o de un período viejo) baja una suscripción ACTIVE a GRACE_PERIOD sin ninguna comparación de precedencia ni timestamp del proveedor (mercado-pago.service.ts:403-407).
Escrituras no atómicas — Payment + Subscription + Tenant + AuditLog se escriben en awaits separados sin $transaction, dejando estados parciales ante fallo (mercado-pago.service.ts:351-414).
Se suman: HMAC sin control de frescura ni anti-replay, ausencia de ledger de webhooks, cancelación por webhook que no fija cancelledAt, carreras cron↔webhook sin guardas de estado, pagos simulados que inflan el MRR, lógica de período/tarifa duplicada en 3 sitios, y cero cobertura de pruebas de facturación. La corrección es acotada (una fuente única de extensión de período + idempotencia de efecto + precedencia + transacciones + un ledger mínimo), implementable por una sola persona y sin infraestructura nueva. Veredicto: REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.

2. Estado de Git
Rama master, working tree limpio salvo ?? docs/programa-mejora/02-facturacion/ (carpeta vacía destino de esta fase).
Commit de cierre de Fase 0: 0141492 ("chore(test): isolate test database and protect Prisma execution").
No hay cambios de código pendientes.
3. Archivos de facturación
Área	Archivo	Rol
Servicio MP	mercado-pago.service.ts (558)	Preapproval, webhook, upsert de pagos, sync de monto, HMAC
Servicio billing	billing.service.ts (719)	Trial, cron de mora, renovación/cortesía simulada, pricing, MRR, gracia
Tenant admin	tenant-admin.service.ts (423)	Crear tenant/suscripción, activar/suspender/cancelar manual, unidades pendientes
Webhook	webhook/route.ts (22)	Entrada pública; 200/500
Checkout	checkout/route.ts (38)	ADMIN: createPreapproval / disableAutoRenew
Cron	cron/overdue-rules/route.ts (13)	Bearer CRON_SECRET → applyOverdueLicenseRules
Dispatch SA	platform/super-admin/route.ts	renew simulado, cortesía, estado tenant
Auditoría	platform/audit.service.ts	registerAuditLog + sanitize
Schema	schema.prisma:195-283	PricingRule, Subscription, Payment, enums
4. Mapa del flujo
Flujo	Endpoint/trigger	Servicio	Modelos	Campos	Transacción	Externo	Auditoría
Crear conjunto	POST platform/super-admin	createTenantWithAdmin	Tenant, Subscription, AuditLog×2	status=TRIAL, currentPeriodEnd=+15d, trialEndsAt	Sí (tenant-admin:130-192)	— (invitación por email fuera de tx)	TENANT_CREATED, SUBSCRIPTION_CREATED
Suscripción/Trial	(idem)	idem	Subscription	status=TRIAL, periodEnd=+15d	Sí	—	—
Checkout/Preapproval	POST billing/checkout createPreapproval	createMercadoPagoSubscriptionForTenant	Subscription, AuditLog	mercadoPagoPreapprovalId, initPoint, autoRenew	No (update simple)	POST /preapproval antes del update local	MERCADO_PAGO_SUBSCRIPTION_CREATED
Autorización pagador	webhook subscription_preapproval	updateSubscriptionFromPreapproval	Subscription, Tenant, AuditLog	status, graceEndsAt, lastWebhookAt	No (3 awaits)	GET /preapproval	WEBHOOK_PROCESSED
Pago aprobado	webhook payment/subscription_authorized_payment	upsertMercadoPagoPayment	Payment, Subscription, Tenant, AuditLog	Payment(upsert), currentPeriodStart/End, graceEndsAt=null	No (4 awaits)	GET /v1/payments o /authorized_payments	WEBHOOK_PROCESSED
Pago pendiente/rechazado	idem	idem	idem	status=GRACE_PERIOD, graceEndsAt=+grace	No	idem	idem
Webhook duplicado	idem	idem	Payment(upsert idempotente) pero Subscription re-actualizada	currentPeriodEnd re-extendido	No	idem	idem
Renovación	webhook approved / renew simulado	upsert / renewSubscriptionWithSimulatedPayment	Payment, Subscription, Tenant	period +30d	webhook No / simulado Sí (billing:165-203)	—	SUBSCRIPTION_RENEWED
Vencimiento→Gracia	cron	applyOverdueLicenseRules	Subscription(updateMany), Tenant(updateMany), Notif, Email, AuditLog	status=GRACE_PERIOD, graceEndsAt	No (updateMany separados)	Resend	TENANT_OVERDUE_RULES_APPLIED
Gracia→Suspensión	cron	idem	idem	status=SUSPENDED	No	Resend	idem
Reactivación	POST platform/super-admin updateTenantStatus ACTIVE	updateTenantStatusForSuperAdmin	Tenant, Subscription	status=ACTIVE, graceEndsAt=null	Sí (tenant-admin:231-251); exige pago APPROVED con periodEnd≥now	—	TENANT_REACTIVATED
Cancelación manual	idem CANCELLED	idem	Tenant, Subscription	status=CANCELLED, cancelledAt=now	Sí	—	TENANT_CANCELLED
Cancelación por webhook	webhook preapproval cancelled	updateSubscriptionFromPreapproval→updateTenantStatusFromSubscription	Subscription, Tenant	status=CANCELLED, cancelledAt NO se fija	No	GET /preapproval	WEBHOOK_PROCESSED
Desactivar auto-renovación	POST billing/checkout disableAutoRenew	disableAutoRenewForTenant	Subscription, AuditLog	autoRenew=false	No	PUT /preapproval status=canceled antes del update	SUBSCRIPTION_AUTO_RENEW_DISABLED
Cambio unidades/precio	POST platform/super-admin updateTenant	updateTenantDetails	Tenant, Subscription, AuditLog	pendingUnitsSnapshot/pendingPriceCents/pendingPriceEffectiveAt	Sí (local) pero PUT MP antes de la tx, con revert best-effort	PUT /preapproval	TENANT_UPDATED
Pago simulado	renew/cortesía SA	renewSubscriptionWithSimulatedPayment / grantCourtesyExtension	Payment(SIMULATED APPROVED), Subscription, Tenant	period+30 / +Ndías	Sí	—	SUBSCRIPTION_RENEWED
Cortesía/activación manual	idem	grantCourtesyExtension	idem (amountCents=0)	status=ACTIVE, cancelledAt=null	Sí; exige reason	—	SUBSCRIPTION_RENEWED(courtesy)
5. Máquina de estados real
TenantStatus / SubscriptionStatus (mismo enum, schema:39-46,238-245): PENDING_PAYMENT, TRIAL, ACTIVE, GRACE_PERIOD, SUSPENDED, CANCELLED.


TRIAL ──(webhook approved)──► ACTIVE ──(cron vencido)──► GRACE_PERIOD ──(cron)──► SUSPENDED
  │                             ▲  │                          │                       │
  │(cron vencido)               │  │(pago pendiente/rechazado)│(pago approved)        │(reactivación manual*/pago)
  ▼                             │  ▼                          ▼                       ▼
GRACE_PERIOD ───────────────────┘  GRACE_PERIOD ◄────────────ACTIVE               ACTIVE
CANCELLED ◄─(cancel manual: fija cancelledAt / webhook cancel: NO fija cancelledAt)
PENDING_PAYMENT ◄─(webhook preapproval authorized sin pago aprobado y trial vencido) [legado]
* reactivación manual exige un Payment APPROVED con periodEnd≥now (tenant-admin:220-228).

Productores de transición: webhook (preapproval/payment), cron (vencer/suspender), Super Admin (activar/suspender/cancelar/renovar/cortesía/cambiar unidades), creación inicial (→TRIAL), cambio externo en MP (→estado según mapPreapprovalStatus).

Problemas de la máquina:

Transiciones no protegidas: ninguna transición valida el estado previo antes de escribir; todo es "set" directo. ACTIVE→GRACE_PERIOD puede dispararse por un evento viejo; SUSPENDED→ACTIVE por webhook exige pago aprobado (bien) pero ACTIVE→ACTIVE re-extiende período (mal).
Estados que divergen Tenant↔Subscription: updateTenantStatusFromSubscription (mercado-pago:419-437) no maneja PENDING_PAYMENT ni el caso ACTIVE-sin-pago (retorna sin tocar el tenant) → la suscripción puede quedar en un estado y el tenant en otro.
Estado heredado: PENDING_PAYMENT es default del schema para Subscription (schema:213) pero Tenant default es ACTIVE (schema:15) — defaults inconsistentes; PENDING_PAYMENT ya no se crea (createTenant usa TRIAL) pero sigue siendo alcanzable por webhook (mercado-pago:267).
PaymentStatus: PENDING→APPROVED→REJECTED sin orden forzado; un upsert puede voltear APPROVED→REJECTED sobre la misma fila. No hay REFUNDED/CANCELLED.
Preapproval MP: authorized→ACTIVE, paused→GRACE_PERIOD, cancelled→CANCELLED, pending→TRIAL, y cualquier otro→GRACE_PERIOD (default peligroso, mercado-pago:514): un status desconocido degrada.
6. Idempotencia
Dimensión	¿Idempotente?	Evidencia
Almacenamiento del evento	No existe ledger de eventos	no hay modelo WebhookEvent
Fila Payment	Sí por mercadoPagoPaymentId @unique + upsert	schema:262, mercado-pago:351-373
Efecto sobre la suscripción	No — re-extiende período	mercado-pago:386-412
Notificaciones	N/A en webhook (no notifica pago); cron sí puede duplicar	—
Auditoría	No — auditWebhook crea una fila nueva por cada llegada	mercado-pago:439-447
Extensión de período	No	idem F1-01
Escenarios:

Mismo webhook 2 veces → período +30 dos veces. Falla.
Mismo payment id, datos iguales → igual, re-extiende. Falla.
Mismo payment id, estado distinto (approved→rejected) → fila y suscripción degradan. Falla.
Reintento tras 500 → como el efecto no es idempotente, el reintento re-extiende. Falla.
Dos instancias Vercel simultáneas → dos read-modify-write sobre currentPeriodEnd; ambas leen el mismo valor y extienden; sin lock → doble extensión o pérdida. Falla.
Pago aprobado durante el cron → cron selecciona (status ACTIVE/TRIAL vencido) y updateMany por id sin re-chequear estado; el webhook activó pero el cron lo pisa a GRACE. Falla.
Pago aprobado durante reactivación manual → ambos update sin guarda; último gana, período posiblemente incoherente. Riesgo.
Preapproval antes que el pago → updateSubscriptionFromPreapproval con status ACTIVE pero sin pago aprobado → recalcula a TRIAL/PENDING (correcto, mercado-pago:262-268). OK.
Webhook viejo después de uno nuevo → sin timestamp/precedencia, el viejo pisa. Falla.
Conclusión: el efecto económico (extensión de período) puede ejecutarse más de una vez.

7. Eventos fuera de orden
El código no tiene precedencia de estados, ni usa timestamps del proveedor, ni número de versión, ni fecha de creación del evento, ni "último evento procesado" para descartar. lastWebhookAt se escribe (mercado-pago:278,406) pero nunca se lee para comparar. No hay reconciliación.

Secuencia	Comportamiento actual	Debería
PENDING tras APPROVED	Degrada a GRACE, fila approved→pending	Ignorar (approved es terminal para el período)
REJECTED tras APPROVED	Degrada a GRACE	Ignorar si ya hay approved del mismo período
APPROVED tras REJECTED	Activa/extiende (ok) pero puede duplicar	Aplicar una vez, idempotente
Cancelación tras pago aprobado	Cancela (ok)	Cancelar pero conservar acceso del período pagado
Pago aprobado tras cancelación	Reactiva/extiende	Definir política: rechazar o reactivar explícito
Preapproval cancelado con período vigente	status→CANCELLED inmediato	Cancelar renovación, mantener acceso hasta currentPeriodEnd
Pago de período anterior tras renovación posterior	Re-extiende desde el período ya avanzado	Descartar por fecha del evento
8. Atomicidad
Operación	Modelos	¿$transaction?	Fallo parcial
createTenantWithAdmin	Tenant, Subscription, AuditLog×2	Sí interactiva (tenant-admin:130)	Invitación fuera de tx (aceptable)
upsertMercadoPagoPayment	Payment, Subscription, Tenant, AuditLog	No (4 awaits)	Pago guardado sin actualizar suscripción; o suscripción actualizada sin tenant; reintento duplica efecto
updateSubscriptionFromPreapproval	Subscription, Tenant, AuditLog	No (3 awaits)	Suscripción cambiada sin tenant
renewSubscriptionWithSimulatedPayment	Subscription+Payment, Tenant	Sí (billing:165); AuditLog fuera	Auditoría puede faltar
grantCourtesyExtension	idem	Sí (billing:258)	idem
updateTenantStatusForSuperAdmin	Tenant, Subscription	Sí (tenant-admin:231); AuditLog fuera	idem
updateTenantDetails	Tenant, Subscription, AuditLog	Sí local, pero PUT MP antes de la tx	MP cambiado y DB revertida → divergencia (revert best-effort)
applyOverdueLicenseRules	Subscription(updateMany), Tenant(updateMany), Notif, Email, AuditLog	No	Suscripciones movidas sin mover tenants; notif enviadas sin persistir cambio
disableAutoRenewForTenant	Subscription, AuditLog	No; PUT MP antes	MP cancelado, DB no
9. Concurrencia
Read-modify-write sin lock ni versión en currentPeriodEnd: leído en mercado-pago:346, escrito en 409. Dos webhooks/instancias → doble extensión.
update sin condición de estado en todo el webhook y en updateTenantStatusFromSubscription.
Cron updateMany por id sin re-chequear estado (billing:404-411,433-440): un webhook que activó entre el findMany y el updateMany es pisado.
Falta de constraints que impidan dos períodos solapados o dos efectos del mismo evento.
No hay versión optimista (@version) ni SELECT ... FOR UPDATE (Prisma no lo expone sin $queryRaw).
Carreras confirmadas: webhook↔webhook, webhook↔cron, webhook↔reactivación/cancelación manual, cambio de precio↔renovación, dos renovaciones manuales. El único caso ya protegido concurrentemente es "último ADMIN activo" (fuera de billing).
10. Renovación simulada
Función	Quién	Motivo	Auditoría	¿MRR?	¿Parece real?	Riesgo accidental
renewSubscriptionWithSimulatedPayment	SUPER_ADMIN (super-admin/route:152)	No exige	SUBSCRIPTION_RENEWED	Sí — pago SIMULATED APPROVED a precio completo, contado por billing:326-333 (sin filtro de provider)	Sí en reportes	Alto — botón "Renovar" sin confirmación de "sin cobro"
grantCourtesyExtension	SUPER_ADMIN	Sí exige reason	SUBSCRIPTION_RENEWED(courtesy)	No (amountCents=0)	Parcial	Medio
createInitialSubscriptionForTenant	nadie (código muerto)	—	SUBSCRIPTION_CREATED	Sí	Sí	Bajo (no invocado)
Opciones (no eliminar aún):

(A) Marcar los pagos SIMULATED con un flag/estado distinto y excluirlos del MRR (filtrar provider: "MERCADO_PAGO" en agregados), conservando la acción.
(B) Unificar "renovar simulado" y "cortesía" en una sola acción "override administrativo" que siempre exige motivo y nunca suma a ingresos reales.
(C) Renombrar el botón y añadir confirmación explícita ("Esto NO cobra dinero real").
Eliminar createInitialSubscriptionForTenant (muerto).
11. Cron de mora
applyOverdueLicenseRules:

Selección: status in (ACTIVE,TRIAL) AND currentPeriodEnd < now → GRACE; status=GRACE_PERIOD AND graceEndsAt < now → SUSPENDED.
Fechas/timezone: usa new Date() (instante UTC) y comparaciones <; el límite exacto (==) no vence (correcto). currentPeriodEnd es DateTime absoluto → sin ambigüedad de zona.
Nulls: una fila GRACE_PERIOD con graceEndsAt = null nunca cumple graceEndsAt < now → queda atascada en gracia indefinidamente. Alcanzable si algún path deja GRACE sin graceEndsAt.
Idempotencia: correr dos veces seguidas es benigno (los filtros por estado ya no matchean lo movido).
Concurrencia: no es safe — findMany y luego updateMany por id sin re-chequear estado; un webhook intermedio se pisa (F1-03). Dos cron solapados → doble notificación (sin dedup).
Pago durante la ejecución: el pago activa la suscripción pero el updateMany la regresa a GRACE.
Atomicidad: suscripción y tenant en updateMany separados, más notif/email/audit sin transacción.
12. Precio y unidades pendientes
pendingUnitsSnapshot/pendingPriceCents/pendingCurrency/pendingPriceEffectiveAt se fijan en updateTenantDetails:330-346 y se aplican+limpian en la renovación en dos lugares distintos: billing:154-179 (simulado) y mercado-pago:376-401 (webhook) — lógica duplicada (F1-07).
Provider antes que DB: updateMercadoPagoPreapprovalAmount (PUT MP) corre antes del $transaction local (tenant-admin:318-324); si la DB falla, hay revert best-effort con .catch(()=>null) (tenant-admin:379-385) → si el revert también falla, MP cobra el monto nuevo y la DB conserva el viejo. Sin reconciliación posterior.
Si la DB cambia y MP falla: el PUT MP es el primer await; su fallo aborta antes de tocar la DB (orden correcto en ese sentido), pero deja al operador sin saber si MP quedó a medias.
13. Cancelación
Cancelación manual (tenant-admin:211-274): fija cancelledAt=now, sincroniza Tenant+Subscription en $transaction. Correcto.
Desactivar auto-renovación (mercado-pago:176-208): PUT MP status=canceled + autoRenew=false. No cambia el estado del tenant (correcto conceptualmente) pero no atómico y no fija fin de acceso.
Cancelación por webhook (mercado-pago:434-435): tenant.status=CANCELLED sin cancelledAt → churn (billing:353-355 cuenta cancelledAt) no lo registra. (F1-06)
Acceso durante período pagado: cancelar (manual o webhook) marca CANCELLED de inmediato y bloquea acceso aunque el período esté pagado — no se respeta el "hasta fin de período".
Reembolsos: no existen (enum sin REFUNDED).
"Cancelar renovación" vs "cancelar licencia": están parcialmente diferenciados: disableAutoRenew (renovación) vs updateTenantStatus CANCELLED (licencia). Pero el webhook paused→GRACE y cancelled→CANCELLED puede confundir "pausa de cobro" con "fin de licencia".
14. HMAC y replay
validateWebhookSignatureIfConfigured:

Autenticidad: HMAC-SHA256 sobre id:{dataId};request-id:{xRequestId};ts:{ts};, timingSafeEqual, secreto obligatorio (fail-closed). Correcto.
Frescura: ts entra al manifiesto pero no se valida su antigüedad (sin ventana). Un webhook capturado con firma válida se puede reenviar indefinidamente.
Replay: sin persistencia de x-request-id/event id → nada impide reprocesar. Combinado con F1-01, un replay extiende licencias.
Topics desconocidos: 200 con reason:"unsupported-topic". Sin dataId: 200 missing-data-id. Sin entidad local: return null → 200 processed:false, sin auditoría (no queda rastro). Errores (firma inválida, fetch MP): excepción → 500 genérico (MP reintenta).
Distinción: autenticidad OK, idempotencia NO, anti-replay NO — no equivalen.
15. Observabilidad
Hoy no se puede investigar con fiabilidad: por qué se extendió una licencia, qué webhook lo causó, si fue duplicado, qué payload llegó, el estado antes/después, ni si el cron compitió con un webhook. Solo existe AuditLog MERCADO_PAGO_WEBHOOK_PROCESSED escrito después del efecto y solo si se encontró la suscripción (mercado-pago:439-447); guarda {tenantId, topic, externalId, rawStatus} pero no el before/after ni un id de evento.

Mínimo necesario (proporcional a una persona): un modelo WebhookEvent (id de evento MP, request-id, topic, dataId, rawStatus, receivedAt, processedAt, result, tenantId) que sirva a la vez de ledger y de idempotency key (unique en el id de evento) — evita replay y permite investigar. Complementar con metadata {prevStatus, nextStatus, prevPeriodEnd, nextPeriodEnd} en el AuditLog existente. No hacen falta correlation IDs distribuidos, colas ni logs estructurados externos.

16. Diferencias entre documentación y código
Afirmación (NEGOCIO_ACTUAL / auditorías)	Veredicto	Evidencia
"Webhook idempotente por mercadoPagoPaymentId" (sección 10.2)	Contradicho — fila sí, efecto no	F1-01
"Un pago rechazado/pendiente manda a GRACE con días de gracia"	Confirmado (pero degrada incluso si venía ACTIVE)	F1-02
"Se exige pago APPROVED antes de activar"	Confirmado	mercado-pago:262-268,424-428
"Gracia unificada (una fuente)"	Confirmado	getGracePeriodDays usado en cron y webhook
"Reactivación exige pago vigente"	Confirmado	tenant-admin:220-228
"Cancelación por webhook fija estado"	Confirmado con defecto — no fija cancelledAt	F1-06
"Cambios de unidades se programan a la siguiente renovación"	Confirmado	pendingUnitsSnapshot
"Notificaciones de licencia se disparan"	Confirmado (por cron)	billing:412-420,441-449
"PENDING_PAYMENT heredado, ya no se crea"	Confirmado pero alcanzable por webhook	mercado-pago:267
"Renovación simulada no afecta métricas"	No verificable/parcialmente falso — el renew simulado sí suma MRR	F1-05
17. Hallazgos clasificados
F1-01 · CRÍTICA · [mercado-pago.service.ts:386-412 upsertMercadoPagoPayment]

Actual: tras el upsert idempotente del Payment, la suscripción se actualiza incondicionalmente; para APPROVED recomputa currentPeriodEnd = addDays(currentPeriodEnd>now?currentPeriodEnd:now, 30).
Repro: reenviar el mismo webhook payment approved N veces → currentPeriodEnd +30·N.
Impacto: licencia gratis ilimitada por replay/reintento; ingresos irreales.
Evidencia: 346-347,386-412.
Fix: aplicar el efecto de período solo cuando el pago se creó por primera vez (idempotency key/ledger) y calcular período desde una fuente única.
Prueba: idempotencia de servicio (webhook approved ×2 ⇒ un solo período).
Subfase: 1B-bloqueante.
F1-02 · ALTA · [mercado-pago.service.ts:403-407 / mapPaymentStatus:517-522]

Actual: evento no-approved (viejo o de otro período) fuerza status=GRACE_PERIOD y graceEndsAt=+grace, degradando una suscripción ACTIVE; puede voltear la fila approved→rejected.
Repro: webhook rejected de un período anterior llega tras el approved actual.
Impacto: suspensión indebida de un cliente que pagó; churn falso.
Evidencia: 403-407,271-283.
Fix: precedencia de estado + comparar fecha del evento; no degradar si el período vigente está cubierto por un pago approved.
Prueba: transición fuera de orden.
Subfase: 1B-bloqueante.
F1-03 · ALTA · [mercado-pago.service.ts:346-414 / billing.service.ts:404-440]

Actual: read-modify-write y updateMany sin guarda de estado ni versión; sin transacción que abarque Payment+Subscription+Tenant.
Repro: webhook aprobado durante el cron; o dos webhooks simultáneos en dos instancias.
Impacto: doble extensión, o activación pisada a GRACE; estado Tenant≠Subscription.
Evidencia: F1-01/F1-04 + billing:395-411.
Fix: $transaction con update ... where {id, status/version esperado} (compare-and-set) y cron con updateMany que re-filtre por estado en el where.
Prueba: concurrencia (dos writers) + carrera cron↔webhook.
Subfase: 1B-bloqueante.
F1-04 · ALTA · [mercado-pago.service.ts:351-414 / :271-284]

Actual: Payment, Subscription, Tenant, AuditLog en awaits separados sin $transaction.
Repro: fallo entre subscription.update y tenant.update.
Impacto: estado parcial; reintento duplica efecto.
Fix: envolver todo el efecto en un $transaction interactivo idempotente.
Prueba: servicio con fallo inyectado a mitad.
Subfase: 1B-bloqueante.
F1-05 · ALTA · [billing.service.ts:138-222 / :326-333]

Actual: renewSubscriptionWithSimulatedPayment crea pago SIMULATED APPROVED a precio completo; los agregados de MRR no filtran provider.
Repro: usar "Renovar" en el panel → MRR sube sin dinero real.
Impacto: métricas de ingreso infladas; decisiones de negocio erróneas.
Fix: excluir provider=SIMULATED del MRR/ingresos y/o convertir en "override administrativo" con motivo.
Prueba: agregados de MRR ignoran SIMULATED.
Subfase: 1C-mejora.
F1-06 · MEDIA · [mercado-pago.service.ts:434-435]

Actual: cancelación por webhook no fija cancelledAt.
Impacto: churn subestimado; auditoría incompleta.
Fix: fijar cancelledAt al cancelar por webhook (dentro de la transacción de efecto).
Prueba: transición cancel por webhook ⇒ cancelledAt no nulo.
Subfase: 1B.
F1-07 · MEDIA · [mercado-pago:376-401 / billing:154-179 / tenant-admin:330-346]

Actual: resolución/aplicación de términos pendientes y cálculo de período duplicados; BILLING_PERIOD_DAYS definido dos veces (mercado-pago:8, billing:10).
Impacto: divergencia futura al editar un sitio y no el otro.
Fix: una función única extendPeriod()/resolveEffectiveTerms() compartida.
Prueba: unitaria de la función única.
Subfase: 1B (acompaña a F1-01).
F1-08 · MEDIA · [mercado-pago.service.ts:480-506 / webhook/route.ts]

Actual: HMAC sin validación de frescura de ts ni registro de event id → replay posible; eventos sin entidad y desconocidos sin rastro persistente.
Impacto: replay reproduce el efecto económico (con F1-01).
Fix: validar ventana de ts (p. ej. ±5 min) y persistir WebhookEvent con unique en el id de evento (idempotency).
Prueba: integración de webhook (replay rechazado; ts viejo rechazado).
Subfase: 1B-bloqueante (junto con el ledger).
F1-09 · MEDIA · [tenant-admin.service.ts:318-385]

Actual: PUT MP antes de la transacción local; revert best-effort silencioso.
Impacto: divergencia monto MP↔DB sin reconciliación.
Fix: registrar el intento; reconciliación o alerta cuando el revert falla.
Prueba: servicio con fallo de DB tras PUT MP.
Subfase: 1C.
F1-10 · BAJA · [billing.service.ts:424-428]

Actual: GRACE_PERIOD con graceEndsAt=null nunca se suspende.
Fix: tratar null como vencido o exigir graceEndsAt no nulo al entrar en gracia.
Prueba: fecha/null.
Subfase: 1C.
F1-11 · BAJA · [billing.service.ts:78-136]

Actual: createInitialSubscriptionForTenant es código muerto que crea SIMULATED APPROVED.
Fix: eliminar.
Subfase: 1C.
F1-12 · MEDIA · [mercado-pago.service.ts:439-447] (observabilidad)

Actual: sin ledger de webhooks; auditoría solo tras éxito y con subscripción hallada.
Fix: WebhookEvent como ledger + idempotency; metadata before/after en AuditLog.
Subfase: 1B (habilitador de F1-01/F1-08).
18. Estrategia de pruebas
#	Tipo	Escenario	Estado inicial	Evento	Estado esperado	No duplicar	DB	Mocks
T1	Servicio (DB test)	Replay approved	TRIAL, sin pagos	payment approved ×2 (mismo id)	ACTIVE, período +30 una vez	período, Payment	Sí	fetch MP
T2	Servicio	Fuera de orden	ACTIVE período vigente	rejected viejo	sigue ACTIVE	degradación	Sí	fetch MP
T3	Servicio	Approved tras rejected	GRACE	approved	ACTIVE +30	doble período	Sí	fetch MP
T4	Concurrencia	Dos writers	ACTIVE	approved ×2 en paralelo	un solo período	extensión	Sí	fetch MP
T5	Concurrencia	cron↔webhook	ACTIVE vencido	approved + cron	ACTIVE (no GRACE)	pisado	Sí	—
T6	Transición	cancel webhook	ACTIVE	preapproval cancelled	CANCELLED + cancelledAt	—	Sí	fetch MP
T7	Fechas	gracia límite	GRACE graceEndsAt=hoy	cron	no suspende en el límite exacto	—	Sí	—
T8	Fechas/null	gracia sin fecha	GRACE graceEndsAt=null	cron	suspende (tras fix)	—	Sí	—
T9	Idempotencia	ledger	—	mismo event id ×2	procesado una vez	efecto	Sí	—
T10	Integración webhook (HTTP)	firma/ts	—	POST firma válida/ inválida/ ts viejo	200/401/rechazo	—	No (ruta)	HMAC real
T11	Reconciliación	MP↔DB	tarifa nueva	DB falla tras PUT MP	montos coinciden o alerta	—	Sí	fetch MP
T12	Unitaria pura	extendPeriod/resolveTerms/precedencia	—	varias entradas	salidas correctas	—	No	—
T13	Unitaria	MRR excluye SIMULATED	pagos mixtos	agregado	solo MERCADO_PAGO	—	Sí	—
Puras (T12) hoy ejecutables; el resto requiere la base de pruebas ya blindada en Fase 0 (npm test) y mocks de fetch a Mercado Pago (no llamar a MP real).

19. Diseño propuesto (mínimo y robusto)
Fuente única de extensión de período. Una función pura computeNextPeriod(currentPeriodEnd, now, days) y una applyApprovedPayment(tx, subscription, payment) que sea el único lugar que mueve currentPeriodStart/End. Elimina la duplicación (F1-07).
Idempotencia de efecto vía ledger. Nuevo modelo WebhookEvent con @unique en el id de evento de MP (o x-request-id+dataId). Al recibir un webhook: create del evento dentro de la transacción; si viola el unique → ya procesado, salir sin efecto. Esto cubre F1-01, F1-08 y F1-12 con una sola pieza.
Precedencia de estado. Guardar en la suscripción/pago la fecha del evento del proveedor; descartar eventos cuya fecha sea anterior a lastWebhookAt/al último evento aplicado. No degradar ACTIVE si el período vigente está cubierto por un APPROVED.
Transacción única por efecto de webhook: Payment + Subscription + Tenant + WebhookEvent + AuditLog dentro de $transaction interactivo. Reintento tras fallo = re-ejecuta la tx completa idempotente.
Compare-and-set / cron seguro. update ... where {id, status: <esperado>} en las transiciones; cron con updateMany where {id in [...], status: <origen>} (re-filtro de estado). Evita pisar activaciones (F1-03).
Cancelación coherente. Fijar cancelledAt también por webhook; distinguir "pausar cobro" (autoRenew/paused) de "fin de licencia" (CANCELLED), y respetar acceso hasta currentPeriodEnd cuando aplique.
Pagos simulados. Excluir provider=SIMULATED del MRR/ingresos; convertir "Renovar" en "override administrativo" con motivo; eliminar createInitialSubscriptionForTenant.
HMAC + frescura. Validar ventana de ts; combinar con el ledger para anti-replay.
Observabilidad mínima. El WebhookEvent es el ledger; añadir {prevStatus,nextStatus,prevPeriodEnd,nextPeriodEnd} al AuditLog. Nada de colas/microservicios.
20. Migraciones potenciales
WebhookEvent (nuevo): id, provider, eventId @unique, requestId?, topic, dataId, rawStatus?, tenantId?, subscriptionId?, receivedAt, processedAt?, result, metadata Json?. Índices por tenantId, receivedAt. Aditiva, reversible.
Subscription (opcional): lastProviderEventAt DateTime? y/o version Int @default(0) para compare-and-set optimista. Aditiva.
Payment (opcional): providerEventAt DateTime? para precedencia. Aditiva.
Ninguna migración destructiva; todos los campos nuevos son nullable/@default, compatibles con filas existentes. Rollback = DROP/ALTER ... DROP COLUMN (sin pérdida de datos de negocio).
21. Orden recomendado de implementación
1B-bloqueante (antes de producción): (1) WebhookEvent + idempotencia de efecto → cierra F1-01, F1-08, F1-12; (2) transacción única F1-04; (3) fuente única de período F1-07; (4) precedencia/fuera-de-orden F1-02; (5) compare-and-set + cron seguro F1-03; (6) cancelledAt por webhook F1-06. Cada uno con su prueba (T1–T9).
1C-mejora (post-bloqueantes): F1-05 (MRR/override), F1-09 (reconciliación MP), F1-10 (null gracia), F1-11 (borrar muerto), T10–T13.
Cada subfase es un cambio pequeño, revisable por Codex, con migración aditiva y rollback claro.
22. Criterios de aceptación
Un webhook approved repetido no extiende el período más de una vez (T1, T9).
Un evento fuera de orden no degrada una suscripción con período vigente pagado (T2, T3).
Payment+Subscription+Tenant+Audit se aplican atómicamente; un fallo no deja estado parcial (T4).
Cron y webhook no se pisan (compare-and-set / re-filtro de estado) (T5).
Cancelación por webhook fija cancelledAt (T6).
Existe una única función de extensión de período (revisión + T12).
HMAC valida frescura y el ledger rechaza replays (T10).
El MRR excluye pagos SIMULATED (T13).
npx tsc --noEmit, npm run lint y la suite (con base de pruebas) en verde.
Migraciones aditivas y reversibles; pagos existentes intactos.
23. Riesgos restantes
Mercado Pago como fuente última: ante divergencia MP↔DB persiste la necesidad de una reconciliación manual ocasional (aceptable para una persona; mitigado por el ledger).
Alias/latencia de webhooks: un evento perdido por MP no se auto-recupera sin un job de reconciliación (fuera de alcance bloqueante).
Sin versión optimista real de PostgreSQL salvo que se añada version; el compare-and-set por status cubre la mayoría de carreras, no todas.
Pagos SIMULATED históricos ya contados en MRR requerirán un ajuste puntual al filtrar.
24. Veredicto
REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.

La base es sólida (idempotencia de fila, HMAC fail-closed, reactivación con pago vigente, gracia unificada, trial correcto), pero los defectos F1-01 a F1-04 y F1-08 permiten extender licencias por replay, degradar clientes que pagaron y dejar estados parciales — inaceptable para cobrar dinero real. Las correcciones son acotadas, aditivas y ordenables en una subfase bloqueante (1B) más una de mejoras (1C), implementables por una sola persona y revisables por Codex.

Me detengo aquí: diagnóstico y plan entregados, sin modificar código ni generar migraciones.