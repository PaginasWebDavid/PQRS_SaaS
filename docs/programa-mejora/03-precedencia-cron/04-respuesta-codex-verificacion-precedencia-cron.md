# FASE 2B - Verificación independiente de precedencia y seguridad del cron

Fecha de revisión: 2026-07-26
Revisor: Codex, revisión técnica independiente
Commit de código revisado: \`5e4be50 feat(billing): enforce idempotent atomic webhook effects\`
Alcance: precedencia de eventos, estados de Mercado Pago, cobertura, cron, concurrencia, notificaciones, email y ledger

## 1. Resumen ejecutivo

El diagnóstico de Claude es **DIAGNÓSTICO CONFIRMADO CON CORRECCIONES**.

Los defectos críticos principales siguen presentes en el código posterior al commit:

- Un evento \`PENDING\` o \`REJECTED\` tardío puede mover una suscripción vigente a \`GRACE_PERIOD\` y el tenant a \`GRACE_PERIOD\`.
- El cron selecciona filas y después actualiza por solo \`id\`, por lo que puede pisar una aprobación reciente o una acción manual.
- Los estados desconocidos del proveedor degradan en lugar de conservar el último estado conocido.
- No existe una definición única de cobertura de acceso, cobertura pagada real y evidencia para reactivación.
- Una fila en \`GRACE_PERIOD\` con \`graceEndsAt = null\` nunca llega a la consulta que suspende.
- Las transiciones del cron no son una unidad atómica entre Subscription, Tenant, auditoría y notificaciones.
- Las notificaciones y correos no tienen una clave estable de deduplicación.

La idempotencia del efecto económico aprobada en Fase 1 permanece correcta para pagos nuevos, pero no resuelve la precedencia de eventos ni las carreras del cron.

El diseño mínimo no necesita locks distribuidos, colas externas ni \`Subscription.version\` para cerrar primero los riesgos bloqueantes. Sí necesita una decisión pura de precedencia/cobertura, compare-and-set del cron, una transacción por suscripción y deduplicación estable de notificaciones. El email debe ejecutarse después del commit local.

## 2. Estado de Git

La primera verificación encontró:

\`\`\`text
HEAD 5e4be50 feat(billing): enforce idempotent atomic webhook effects
\`\`\`

El árbol de código está limpio respecto del commit. Después de guardar el documento obligatorio de esta fase, \`git status --short\` muestra únicamente:

\`\`\`text
?? docs/programa-mejora/03-precedencia-cron/
\`\`\`

Ese cambio corresponde a los dos documentos exigidos por la documentación automática. No hay cambios de implementación, schema, migraciones, pruebas ni configuración creados durante esta revisión.

El documento obligatorio \`02-facturacion/24-respuesta-claude-commit-idempotencia-atomicidad.md\` sí existe y confirma que el commit de Fase 1 fue creado con el contenido esperado.

## 3. Evaluación de F2-01 a F2-10

| ID | Veredicto | Severidad revisada | Evidencia | Corrección mínima | ¿Bloquea producción? |
| --- | --- | --- | --- | --- | --- |
| F2-01 | CONFIRMADO | Crítica | \`mercado-pago.service.ts:700-712\` actualiza Subscription y Tenant para todo no-\`APPROVED\` | No degradar si existe cobertura válida y aplicar precedencia | Sí |
| F2-02 | CONFIRMADO | Crítica | \`billing.service.ts:400-416, 429-445\` hace \`findMany\` y después \`updateMany\` solo por id | Compare-and-set con estado y fecha esperados; notificar solo si \`count = 1\` | Sí |
| F2-03 | CONFIRMADO | Alta | \`mapPreapprovalStatus:832\` y \`paymentStatusToSubscriptionStatus:842-845\` usan Grace como default | Estado desconocido no debe cambiar Subscription ni Tenant | Sí |
| F2-04 | CONFIRMADO CON MATICES | Alta | \`applyTenantStatusInTx:750-756\`, preapproval y reactivación usan filtros distintos | Separar cobertura de acceso, pago real y evidencia manual | Sí |
| F2-05 | CONFIRMADO | Alta | \`graceEndsAt: { lt: now }\` no coincide con null | Ignorar y alertar el estado inválido; no suspender ciegamente | Sí |
| F2-06 | CONFIRMADO | Media-alta | Los dos \`updateMany\` y el envío de avisos están fuera de una unidad local común | Transacción por suscripción y efectos posteriores al commit | Sí |
| F2-07 | CONFIRMADO CON MATICES | Media | \`Notification\` no tiene clave única y \`notifyTenantAdminsOfLicenseChange\` envía por cada corrida | Dedupe estable y enviar solo para una notificación creada | No para integridad económica; recomendado antes de operar |
| F2-08 | CONFIRMADO CON MATICES | Media | El \`upsert\` actualiza \`Payment.status\` sin comparar el estado anterior | Aplicar precedencia a nivel de fila y conservar metadata no económica | No para doble cobro; sí para consistencia y reportes |
| F2-09 | CONFIRMADO CON MATICES | Baja | \`WebhookEvent\` no persiste timestamp del proveedor ni razón de decisión; el cron no crea ledger | Usar \`IGNORED\` más \`ignoredReason\` en metadata; aplazar columnas | No |
| F2-10 | CONFIRMADO CON MATICES | Baja-media | Acciones manuales y webhook pueden ser last-writer-wins | Mantenerlas fuera del primer cambio; añadir CAS/version si las pruebas lo justifican | No en el diseño mínimo del cron |

La severidad de F2-06 se eleva respecto del diagnóstico original porque la divergencia entre Subscription y Tenant puede dejar una combinación de acceso incoherente después de un fallo parcial. F2-07 no rompe la garantía económica, pero sí puede producir spam y pérdida de confianza.

## 4. Rama no-APPROVED

El flujo actual de \`upsertMercadoPagoPayment\` es:

1. Normaliza \`approved\` y \`authorized\` a \`APPROVED\`.
2. Normaliza \`rejected\` y \`cancelled\` a \`REJECTED\`.
3. Todo lo demás se convierte en \`PENDING\`.
4. Actualiza o crea Payment.
5. Para cualquier resultado no aprobado, actualiza Subscription a \`GRACE_PERIOD\`, calcula \`graceEndsAt\` y sincroniza Tenant a \`GRACE_PERIOD\`.
6. Registra auditoría y finaliza el ledger como \`PROCESSED\`.

Consecuencias:

- \`PENDING\` no distingue un primer pago pendiente de un evento tardío de un pago ya aprobado.
- \`REJECTED\` no distingue un rechazo vigente de un rechazo de un período anterior.
- Un estado desconocido se comporta como \`PENDING\` y degrada.
- \`approvedEffectAppliedAt\` no se limpia, lo que preserva la protección contra doble extensión, pero no evita la degradación del acceso.
- Para un Payment que retrocede desde \`APPROVED\`, \`paidAt\` también puede volver a null porque el update escribe el valor calculado para el nuevo estado.
- El resultado del ledger es \`PROCESSED\`, no una clasificación de evento ignorado o antiguo.
- La rama sí es atómica localmente para Payment, Subscription, Tenant, auditoría y ledger, pero la política aplicada es incorrecta para eventos fuera de orden.

No todos los estados no aprobados deben tratarse igual:

- \`PENDING\`: puede dejar el acceso intacto si existe cobertura vigente; no debe degradar por sí solo un acceso ya cubierto.
- \`REJECTED\`: puede iniciar Grace solo si no hay cobertura vigente y el rechazo es aplicable al período actual.
- \`CANCELLED\`: en Payment se colapsa a \`REJECTED\`; en preapproval tiene una política distinta y no debe confundirse con el fin inmediato de acceso.
- Desconocido: debe conservar el último estado local, guardar \`rawStatus\`, registrar la decisión y requerir revisión.

## 5. Precedencia del mismo Payment

La matriz observada es:

| Estado actual | Entrante | Payment actual | Subscription/Tenant actuales | Ledger | Evaluación |
| --- | --- | --- | --- | --- | --- |
| PENDING | PENDING | Permanece PENDING; metadata se actualiza | Va a Grace | PROCESSED | Permitido por código, pero puede degradar indebidamente |
| PENDING | APPROVED | Pasa a APPROVED; reclama si no hay marcador | Extiende y pasa a Active | PROCESSED | Correcto |
| PENDING | REJECTED | Pasa a REJECTED | Va a Grace | PROCESSED | Permitido, sin cobertura ni precedencia |
| REJECTED | PENDING | Pasa a PENDING | Va a Grace | PROCESSED | Permitido por código, sin razón de negocio suficiente |
| REJECTED | APPROVED | Pasa a APPROVED; reclama si corresponde | Extiende y pasa a Active | PROCESSED | Puede ser legítimo y debe permitirse |
| APPROVED | PENDING | Retrocede; puede borrar paidAt | Va a Grace aunque el efecto quede aplicado | PROCESSED | Defecto crítico de precedencia |
| APPROVED | REJECTED | Retrocede; puede borrar paidAt | Va a Grace aunque el efecto quede aplicado | PROCESSED | Defecto crítico de precedencia |
| APPROVED | APPROVED | Permanece APPROVED | DUPLICATE si el efecto ya está aplicado; aplica si aún no lo está | DUPLICATE o PROCESSED | Económicamente idempotente |

La tabla cambia si el Payment está en cuarentena: un \`APPROVED\` puede terminar en \`RECONCILIATION_REQUIRED\` y no debe extender.

El código y sus tipos permiten que un proveedor entregue valores que se normalicen como \`REJECTED\`, \`PENDING\` o \`APPROVED\`, pero no permiten determinar desde el repositorio si Mercado Pago legítimamente emitirá cada transición en todos los casos. La conclusión segura es que el sistema debe protegerse contra ellas sin depender de que el proveedor siempre las ordene.

La regla mínima recomendada es:

- \`APPROVED\` aplicado no retrocede por un evento no aprobado.
- \`REJECTED -> APPROVED\` puede aplicar si el Payment no está en cuarentena y su efecto no fue aplicado.
- Los eventos no aprobados solo pueden iniciar Grace cuando no existe cobertura válida y el evento es aplicable al período actual.
- Metadata técnica puede actualizarse sin cambiar el efecto económico.
- Un \`APPROVED\` repetido conserva el comportamiento DUPLICATE.

## 6. Timestamps del proveedor

Los tipos actuales contienen:

- Payment: \`date_approved\` y \`date_created\`.
- Authorized payment: \`date_created\`.
- Preapproval: no contiene timestamp de creación o actualización.
- No existe \`date_last_updated\` en los tipos locales.
- \`WebhookEvent.receivedAt\` es la hora local de recepción.
- \`Subscription.lastWebhookAt\` también es la hora local de procesamiento.

Uso actual:

- \`date_approved || date_created\` se usa para \`paidAt\` del endpoint de Payment.
- \`date_created\` se usa para el Payment autorizado.
- \`parseDateOrNow\` parsea fechas inválidas, pero cae a la hora local cuando faltan o son inválidas.
- Ningún timestamp del proveedor se persiste como campo de precedencia.
- \`date_last_updated\` no se descarta porque ni siquiera forma parte del tipo o de la normalización actual; el sistema sí carece de esa información.

Interpretación:

- \`date_created\`: creación del recurso o pago.
- \`date_approved\`: momento de aprobación, cuando está presente.
- \`date_last_updated\`: no disponible en el contrato actual.
- \`receivedAt\`: recepción local, no tiempo del proveedor.

No se recomienda agregar \`providerUpdatedAt\` todavía como solución automática si el payload actual no entrega un valor estable para todos los topics. La precedencia mínima debe basarse en el estado persistente, cobertura y compare-and-set. Si posteriormente se incorpora un timestamp confiable de actualización, puede agregarse como campo nullable y backfilleable solo para eventos nuevos.

Fallback seguro: si no hay timestamp confiable, no inventar orden con \`now\`; conservar el estado vigente, no degradar por un evento ambiguo y enviar el caso a revisión.

## 7. Payments distintos y períodos

Timestamp por sí solo no basta. Deben distinguirse:

- Evento viejo del mismo Payment: afecta la fila del mismo identificador y debe respetar su estado y efecto aplicado.
- Evento de un Payment antiguo distinto: no debe degradar una suscripción cubierta por otro Payment.
- Payment nuevo: puede extender desde el período vigente y reclamar su propio efecto.
- Payment aprobado sin período útil: no debe considerarse evidencia completa de cobertura.
- Payment aprobado con período vencido: no cubre acceso actual.
- Payment en cuarentena: no extiende hasta reconciliación.
- Payment SIMULATED: sirve para política de acceso/cortesía si el producto lo permite, pero no es ingreso real de Mercado Pago.
- Cortesía administrativa: debe distinguirse de un cobro real.

La decisión debe verificar estado, tenant, subscription, provider, período, efecto aplicado y cuarentena. Para un cobro real, \`provider = MERCADO_PAGO\` es obligatorio. La cobertura actual no puede inferirse solo de que exista alguna fila \`APPROVED\`.

## 8. Cobertura de acceso

Debe existir una definición separada de \`hasCurrentAccessCoverage\`.

Datos requeridos:

- Subscription del tenant.
- \`status\`.
- \`currentPeriodEnd\`.
- \`graceEndsAt\).
- \`trialEndsAt\`.
- Tenant status y cualquier cortesía explícita.

Política mínima recomendada:

- \`TRIAL\`: cobertura si \`trialEndsAt > now\` y el trial está permitido.
- \`ACTIVE\`: cobertura si \`currentPeriodEnd > now\`.
- \`GRACE_PERIOD\`: acceso provisional si la política de negocio lo permite y \`graceEndsAt > now\`.
- \`SUSPENDED\`, \`CANCELLED\` y \`PENDING_PAYMENT\`: sin acceso operativo.
- Cortesía: cobertura si la renovación simulada/cortesía vigente está explícitamente reconocida.
- No debe exigir que el ingreso sea Mercado Pago si esta función solo decide acceso.

Los callers principales son el guard de tenant/acceso, la rama no-APPROVED, el preapproval y el cron. La función debe ser pura sobre datos cargados o acompañarse de una consulta única bien definida.

## 9. Cobertura pagada real

Debe existir una función separada, por ejemplo \`hasCurrentRealPaymentCoverage\`.

Datos requeridos:

- Payment del mismo tenant y subscription.
- \`provider = MERCADO_PAGO\`.
- \`status = APPROVED\`.
- \`periodEnd > now\`.
- \`approvedEffectAppliedAt IS NOT NULL\`.
- \`approvedEffectReconciliationRequired = false\`.
- Identidad exacta del Payment y del tenant.

No debe contar:

- SIMULATED.
- Payment en cuarentena.
- Payment aprobado sin efecto aplicado.
- Payment con período vencido.
- Payment de otro tenant o subscription.

Debe usarse para evitar degradar un cliente que sí tiene un pago real vigente, activar por webhook aprobado y validar indicadores de ingresos. No debe usarse para decidir por sí sola el acceso de un trial o una cortesía.

## 10. Reactivación manual

La reactivación manual necesita una función separada, por ejemplo \`hasApprovedAppliedPayment\` o una consulta de evidencia de reconciliación.

Debe distinguir:

- Pago real aprobado y aplicado.
- Pago histórico reconciliado manualmente.
- Cortesía aprobada por una acción administrativa.
- Trial vigente.
- Renovación simulada.

La acción manual debe exigir una evidencia explícita adecuada a la política. No debe activar solo porque existe cualquier Payment \`APPROVED\`. La reactivación debe conservar auditoría y ejecutarse en una transacción local con la Subscription y el Tenant.

## 11. Preapproval

El mapeo actual es:

- \`authorized -> ACTIVE\`, pero después busca cualquier Payment aprobado; no valida provider, período, efecto ni cuarentena.
- \`paused -> GRACE_PERIOD\` inmediatamente.
- \`cancelled/canceled -> CANCELLED\`.
- \`pending -> TRIAL\`.
- Desconocido -> \`GRACE_PERIOD\`.

Recomendación:

- \`authorized\`: confirma autorización de cobro, no ingreso; no debe activar por sí solo. Mantener acceso solo según cobertura actual o trial.
- \`paused\`: no debe quitar acceso inmediatamente si existe período vigente; puede desactivar renovaciones futuras o crear una alerta, pero esa es una decisión comercial que debe aprobarse.
- \`cancelled\`: la cancelación de la suscripción recurrente debe separarse de la finalización del acceso. La política de cancelación queda fuera de esta fase.
- \`pending\`: no debe convertir una suscripción pagada en un estado inferior si todavía hay cobertura.
- desconocido: conservar estado y registrar revisión.

No se debe implementar una política comercial nueva dentro de la corrección técnica de precedencia.

## 12. Estados desconocidos

Claude tiene razón en que el default actual degrada:

- Payment desconocido -> \`PENDING\` -> \`GRACE_PERIOD\`.
- Preapproval desconocido -> \`GRACE_PERIOD\`.

Comportamiento mínimo:

- No modificar \`Payment.status\` a un estado inferior.
- Actualizar únicamente \`rawStatus\` si es seguro.
- No modificar Subscription.
- No modificar Tenant.
- Registrar auditoría con estado previo y rawStatus.
- Usar el resultado existente \`WebhookEventResult.IGNORED\`.
- Guardar \`ignoredReason = UNKNOWN_PROVIDER_STATUS\` en metadata.
- Dejar el caso listo para reconciliación manual.

No hace falta agregar \`UNKNOWN_STATUS\`, \`STALE_EVENT\` e \`IGNORED_BY_PRECEDENCE\` como enums en esta primera corrección. El enum \`IGNORED\` y metadata estructurada son suficientes y reducen la migración.

## 13. Cron ACTIVE/TRIAL -> GRACE_PERIOD

El código actual hace:

1. Captura \`now\`.
2. Busca Subscription \`ACTIVE\` o \`TRIAL\` con \`currentPeriodEnd < now\`.
3. Actualiza todas las filas seleccionadas por \`id\`.
4. Actualiza Tenant en una operación separada.
5. Notifica todos los tenantIds seleccionados.

La carrera es real: el webhook puede aprobar y extender entre los pasos 2 y 3; el cron entonces pisa el período nuevo por id.

Compare-and-set mínimo:

\`\`\`text
where:
  id = selected.id
  status = selected.status
  currentPeriodEnd = selected.currentPeriodEnd
\`\`\`

Puede incluir \`graceEndsAt = null\` si la política lo requiere. Debe usarse \`count\`; si es cero, otro proceso ganó y no se notifica.

La igualdad exacta de DateTime es segura si se usa el valor exacto leído de PostgreSQL sin reconstruirlo ni redondearlo. No debe calcularse otra fecha equivalente en JavaScript para el WHERE.

Recomendación: procesar una suscripción por transacción corta. Dentro de la transacción se relee la fila, se ejecuta el compare-and-set, se sincroniza Tenant y se registra auditoría/notificación. No se recomienda una transacción gigante para todo el lote.

## 14. Cron GRACE_PERIOD -> SUSPENDED

El código actual busca \`GRACE_PERIOD\` con \`graceEndsAt < now\` y después actualiza por id sin revalidar.

Carreras confirmadas:

- Un pago puede pasar la subscription a Active después del \`findMany\`.
- Una cortesía o renovación simulada puede extenderla.
- Una reactivación manual puede cambiarla.
- Una cancelación manual puede cambiarla.
- El segundo \`updateMany\` puede quedar separado del primero.

Política para \`graceEndsAt = null\`:

- Es una inconsistencia, no evidencia de que la gracia terminó.
- No suspender automáticamente.
- Registrar/alertar el estado inválido.
- Reparar mediante una acción explícita o una normalización definida por negocio.
- No inventar una nueva gracia ni usar \`lastWebhookAt\` como sustituto sin una política aprobada.

Esta política favorece al cliente ante datos ambiguos y evita suspensiones injustas; el riesgo de ingresos se compensa con alerta obligatoria y reparación operativa.

## 15. Atomicidad del cron

Alternativas evaluadas:

| Opción | Atomicidad | Lock | Complejidad | Recomendación |
| --- | --- | --- | --- | --- |
| A. Transacción por suscripción | Alta | Corto | Baja-media | Elegir ahora |
| B. Claim y segunda transacción | Media | Corto | Media | No como primera opción |
| C. Transacción por lote | Alta | Largo | Media-alta | Aplazar |

La opción A es proporcional al tamaño actual:

1. Releer Subscription dentro de la transacción.
2. Verificar estado, fecha, tenant y cobertura.
3. Ejecutar compare-and-set.
4. Actualizar Tenant coherentemente.
5. Crear AuditLog.
6. Crear Notification con dedupe key.
7. Confirmar.
8. Enviar email fuera de la transacción.
9. Registrar el resultado de email en EmailLog sin revertir el cambio local.

El envío de email no debe ocurrir dentro del lock ni de la transacción.

## 16. Notificaciones

El modelo actual de Notification no tiene \`dedupeKey\` y \`createNotification\` hace un \`create\` directo. Dos crons pueden crear dos filas idénticas.

La opción mínima correcta es:

\`\`\`text
Notification.dedupeKey String? @unique
\`\`\`

La clave debe ser estable y contener el destinatario porque hay una notificación por administrador:

\`\`\`text
tenantId|userId|subscriptionId|transition|expectedBoundary
\`\`\`

Donde \`expectedBoundary\` es el \`graceEndsAt\` o un \`currentPeriodEnd\` persistido, nunca \`now\` generado en cada intento.

Para crearla:

- Usar \`upsert\` o \`createMany(..., skipDuplicates: true)\`.
- Enviar email solo si esta ejecución creó la notificación.
- Si la fila ya existe, no enviar otro correo.

La dedupe key evita dos crons concurrentes y reintentos posteriores para la misma transición. No evita por sí sola un email duplicado si se manda siempre después de consultar la notificación.

## 17. Email

\`sendEmailSafe\` se llama después de los \`updateMany\`, pero hoy también se llama en cada ejecución del cron. El fallo de email no revierte la transición y \`EmailLog\` registra el intento, lo cual es correcto.

Conclusiones:

- La transición local debe persistir antes de enviar.
- Un fallo de email no debe revertir Subscription o Tenant.
- La dedupe key de Notification por sí sola no garantiza deduplicación de email después de un crash entre commit y envío.
- Si el proceso muere después del commit y antes de Resend, el acceso queda correcto pero el email puede no enviarse.
- Sin una cola, el mínimo razonable es deduplicar por evento estable y registrar el resultado en EmailLog. Para garantías de reintento, EmailLog necesitaría una clave de evento estable o una operación de reintento posterior basada en esa clave.

No se recomienda construir una cola en esta fase. Sí se recomienda que la siguiente corrección defina explícitamente si el email es best-effort o si requiere un evento deduplicable en EmailLog.

## 18. Acciones manuales

\`Subscription.version\` no es obligatorio para cerrar los riesgos principales del cron.

Clasificación:

- Reactivación: recomendable CAS/version a futuro; hoy requiere pago vigente.
- Cortesía: recomendable evitar carrera con cron; puede quedar en la política de acciones manuales.
- Renovación simulada: igual.
- Suspensión manual: política explícita; no debe ser pisada silenciosamente por un webhook tardío.
- Cancelación manual: queda fuera de esta fase.
- Cron: CAS por estado y fecha es obligatorio ahora.

El CAS del cron evita la mayoría de carreras cron-webhook y cron-acción sin modificar de inmediato todas las APIs manuales. \`version\` queda **OPCIONAL**, condicionado a pruebas de concurrencia de las acciones manuales.

## 19. Ledger

No hace falta una migración inmediata para columnas nuevas.

Cambio mínimo:

- Reutilizar \`WebhookEventResult.IGNORED\`.
- Agregar en metadata \`ignoredReason\`, \`previousStatus\`, \`nextStatus\`, \`providerStatus\` y, cuando exista, \`providerEventAt\`.
- Mantener el payload sanitizado.

\`previousStatus\` y \`nextStatus\` ya se escriben parcialmente en auditoría/metadata. El cron no necesita crear \`WebhookEvent\`; puede usar AuditLog para observabilidad de sus propias transiciones.

Un campo \`providerEventAt\` aporta valor solo cuando el payload actual tenga un timestamp estable. No debe agregarse por comodidad si quedará siempre null.

## 20. Migración mínima

| Campo o cambio | Clasificación | Motivo |
| --- | --- | --- |
| \`Payment.providerUpdatedAt\` | APLAZAR | No existe timestamp estable en el contrato actual |
| \`Subscription.lastProviderEventAt\` | APLAZAR | Misma limitación y no es necesario para el CAS del cron |
| \`Notification.dedupeKey String? @unique\` | INCLUIR AHORA | Evita duplicados de transición en cron concurrente |
| Nuevos enums \`STALE_EVENT\` o \`IGNORED_BY_PRECEDENCE\` | APLAZAR | \`IGNORED\` más metadata cubre el mínimo |
| \`Subscription.version\` | APLAZAR | CAS por estado y fecha cubre el cron inicial |
| EmailLog event/dedupe key | INCLUIR EN LA SUBFASE DE EMAIL si se exige garantía de reintento | Notification no cubre el crash entre commit y envío |

La migración debe ser aditiva, nullable donde aplique y sin backfill inventado. El rollback debe consistir en revertir código y retirar columnas/índices aditivos solo con una migración controlada; no usar \`db push\` ni reconstrucciones destructivas manuales.

## 21. Pruebas

### Pruebas puras

| Prueba | Debe comprobar |
| --- | --- |
| Decisión de Payment | Todas las combinaciones de la matriz y que APPROVED aplicado no retroceda |
| Estado desconocido | No transición, rawStatus conservado, razón UNKNOWN |
| Cobertura de acceso | Trial, Active, Grace vigente, vencido, suspendido, cancelado, cortesía |
| Cobertura pagada real | Provider Mercado Pago, aprobado, efecto aplicado, período vigente, no cuarentena |
| Reactivación | Evidencia exacta y separación de SIMULATED/cortesía |
| Decisión del cron | Estado y fecha esperados; cobertura; gracia null |
| Dedupe key | Mismo evento produce misma clave; otro usuario o frontera produce clave distinta |
| Preapproval | authorized sin pago no activa; paused/cancelled/desconocido no degradan cobertura vigente |

### Pruebas de integración futuras

| Prueba | Modelos y campos |
| --- | --- |
| APPROVED no retrocede | Payment.status, paidAt, marker, Subscription.status y Tenant.status |
| Rechazo antiguo no degrada | Payment externo viejo, provider, periodEnd, Subscription y Tenant |
| Pago nuevo prevalece frente al cron | Payment marker, Subscription periods/status, Tenant status |
| Cron solo transiciona sin cambio | updateMany count, Subscription currentPeriodEnd y estado |
| Dos crons producen una transición | Subscription, Tenant, AuditLog y Notification.dedupeKey |
| Cortesía frente al cron | Subscription periods/status, Payment provider SIMULATED y Tenant |
| Reactivación frente al cron | estado y auditoría del Tenant/Subscription |
| Email fallido | transición persistida, EmailLog FAILED, sin rollback |
| Estado desconocido | rawStatus, estado local, ledger IGNORED y auditoría |
| graceEndsAt null | no suspensión, alerta/auditoría y reparación explícita |

## 22. Subfases

### Subfase 1 - Precedencia y cobertura

Objetivo: impedir degradaciones por eventos tardíos/desconocidos y unificar las tres definiciones de cobertura.

Archivos: \`mercado-pago.service.ts\`, nuevo módulo puro de precedencia/cobertura y callers de acceso/tenant.

Migración: ninguna inicialmente; agregar timestamps solo si el contrato real los aporta.

Pruebas: matriz de Payment, estados desconocidos, cobertura real y preapproval.

Aceptación: APPROVED aplicado no retrocede; evento desconocido no degrada; cobertura vigente no se pierde.

Riesgo: rechazar un evento legítimo por una política mal definida.

Rollback: revertir código puro y handlers; no requiere migración si se mantiene sin columnas.

### Subfase 2 - CAS y atomicidad del cron

Objetivo: eliminar carreras cron-webhook y cron-acción, tratar Grace null y mantener Tenant/Subscription coherentes.

Archivos: \`billing.service.ts\` y servicios de auditoría/notificación transaccional.

Migración: ninguna inicialmente; \`Subscription.version\` solo si las pruebas lo exigen.

Pruebas: dos cron, pago concurrente, cortesía, reactivación, Grace null y fallos parciales.

Aceptación: el cron nunca pisa un período nuevo; \`count = 0\` no genera aviso; una transición local es atómica.

Riesgo: perder una transición por una condición demasiado estricta.

Rollback: revertir el algoritmo de CAS y conservar las migraciones aditivas sin aplicar si no son necesarias.

### Subfase 3 - Notificaciones y email

Objetivo: deduplicar avisos de licencia y definir el comportamiento de email posterior al commit.

Archivos: \`notification.service.ts\`, \`billing.service.ts\`, servicio de email.

Migración: \`Notification.dedupeKey\`; EmailLog event key solo si se exige reintento deduplicado.

Pruebas: dos cron producen una Notification, un email por evento creado, fallo de email sin rollback y proceso interrumpido.

Aceptación: no hay notificaciones duplicadas; email no bloquea ni revierte la transición; los fallos quedan registrados.

Riesgo: una clave demasiado amplia podría ocultar una transición legítima.

Rollback: retirar código y el índice/columna aditivos mediante migración controlada.

### Subfase 4 - Observabilidad

Objetivo: mejorar reconstrucción de decisiones sin bloquear el flujo económico.

Archivos: metadata de webhook, reportes de auditoría y opcionalmente ledger.

Migración: opcional \`providerEventAt\` o nuevos valores de ledger cuando exista un contrato estable.

Pruebas: razones de ignorado, estados previo/posterior y sanitización.

Aceptación: cada evento ignorado puede explicarse sin secretos.

Riesgo: ampliar enums sin necesidad operativa.

Rollback: revertir código; los valores enum adicionales requerirían tratamiento especial si ya fueron persistidos.

Orden: ejecutar Subfase 1 primero, luego 2, luego 3 y finalmente 4.

## 23. Hallazgos

### F2-01

- Severidad: crítica.
- Archivo/símbolo: \`src/domains/billing/mercado-pago.service.ts\`, rama no-\`APPROVED\` de \`upsertMercadoPagoPayment\`.
- Confirmación: confirmada.
- Impacto: un rechazo o pendiente tardío puede quitar acceso a un conjunto que ya tiene cobertura.
- Corrección mínima: precedencia y cobertura antes de actualizar Subscription/Tenant.
- Prueba: APPROVED->REJECTED, APPROVED->PENDING y rechazo de Payment antiguo.
- ¿Bloquea producción?: Sí.

### F2-02

- Severidad: crítica.
- Archivo/símbolo: \`src/domains/billing/billing.service.ts\`, \`applyOverdueLicenseRules\`.
- Confirmación: confirmada.
- Impacto: el cron puede pisar un pago reciente.
- Corrección mínima: compare-and-set por id, estado y fecha, usando \`count\`.
- Prueba: webhook concurrente entre selección y actualización.
- ¿Bloquea producción?: Sí.

### F2-03

- Severidad: alta.
- Archivo/símbolo: mapeos de estados en \`mercado-pago.service.ts\`.
- Confirmación: confirmada.
- Impacto: una novedad del proveedor puede degradar masivamente.
- Corrección mínima: no degradar estados desconocidos; usar \`IGNORED\`.
- Prueba: rawStatus desconocido conserva estado local.
- ¿Bloquea producción?: Sí.

### F2-04

- Severidad: alta.
- Archivo/símbolo: \`applyTenantStatusInTx\`, preapproval y \`tenant-admin.service.ts\`.
- Confirmación: confirmada con matices.
- Impacto: activación por Payment simulado/viejo o falta de reconocimiento de cobertura vigente.
- Corrección mínima: separar funciones de cobertura.
- Prueba: provider, periodEnd, marker y cuarentena.
- ¿Bloquea producción?: Sí.

### F2-05

- Severidad: alta.
- Archivo/símbolo: segunda consulta de \`applyOverdueLicenseRules\`.
- Confirmación: confirmada.
- Impacto: Grace sin fecha no se suspende automáticamente.
- Corrección mínima: alertar y reparar; no suspender ciegamente.
- Prueba: \`graceEndsAt = null\`.
- ¿Bloquea producción?: Sí hasta definir reparación/alerta.

### F2-06

- Severidad: media-alta.
- Archivo/símbolo: transición de cron en \`billing.service.ts\`.
- Confirmación: confirmada.
- Impacto: Subscription y Tenant pueden divergir tras un fallo parcial.
- Corrección mínima: transacción por suscripción.
- Prueba: fallo entre actualizaciones y coherencia posterior.
- ¿Bloquea producción?: Sí.

### F2-07

- Severidad: media.
- Archivo/símbolo: \`notification.service.ts\` y \`notifyTenantAdminsOfLicenseChange\`.
- Confirmación: confirmada con matices.
- Impacto: duplicación de notificaciones y correos.
- Corrección mínima: dedupe key estable y email solo tras creación.
- Prueba: dos cron concurrentes.
- ¿Bloquea producción?: No para el efecto económico; recomendado antes de operación.

### F2-08

- Severidad: media.
- Archivo/símbolo: rama update del Payment.
- Confirmación: confirmada con matices.
- Impacto: estado y reportes engañosos; el marcador evita doble extensión.
- Corrección mínima: decisión pura de transición.
- Prueba: APPROVED->PENDING/REJECTED.
- ¿Bloquea producción?: No por doble extensión; sí debe corregirse antes de reportes confiables.

### F2-09

- Severidad: baja.
- Archivo/símbolo: \`WebhookEvent\` y cron.
- Confirmación: confirmada con matices.
- Impacto: observabilidad insuficiente del orden y de decisiones ignoradas.
- Corrección mínima: metadata \`ignoredReason\`; aplazar columnas.
- Prueba: ledger IGNORED y metadata sanitizada.
- ¿Bloquea producción?: No.

### F2-10

- Severidad: baja-media.
- Archivo/símbolo: acciones manuales de tenant/billing.
- Confirmación: confirmada con matices.
- Impacto: last-writer-wins en carreras poco frecuentes.
- Corrección mínima: CAS/version en una fase posterior según pruebas.
- Prueba: acción manual concurrente con cron/webhook.
- ¿Bloquea producción?: No en el primer diseño del cron.

## 24. Riesgos aceptados

- El diagnóstico se verificó contra el commit de código esperado.
- No se ejecutaron pruebas de integración ni se conectó a PostgreSQL por restricción expresa de Fase 2B.
- La base de datos de pruebas y la separación de producción siguen siendo una obligación operativa de fases previas.
- La política de cancelación y el acceso hasta fin de período interactúan con preapproval cancelado, pero quedan fuera de esta fase.
- La retención del ledger sigue siendo una mejora futura.
- El comportamiento de email tras una caída entre commit y envío debe definirse explícitamente; no se recomienda construir una cola todavía.
- La validez comercial exacta de cada transición de Mercado Pago no es determinable solo con los tipos locales y no se asumió.

## 25. Veredicto

**DIAGNÓSTICO CONFIRMADO CON CORRECCIONES.**

Claude identificó correctamente los riesgos principales. El código posterior al commit confirma F2-01 a F2-06 y F2-08; F2-07, F2-09 y F2-10 también son reales, pero sus severidades e impacto deben matizarse como se indica en las tablas.

## 26. Preparación

**REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.**

La implementación de idempotencia económica está aprobada, pero no es suficiente para producción porque aún puede degradar clientes por eventos fuera de orden y por carreras del cron. Deben ejecutarse primero las Subfases 1 y 2. La Subfase 3 es necesaria para una operación de notificaciones confiable y la Subfase 4 puede aplazarse.

No se implementó ninguna corrección. La revisión termina aquí y no continúa con cancelación, métricas ni interfaz.

