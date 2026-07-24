# FASE 1B — VERIFICACIÓN INDEPENDIENTE DEL DIAGNÓSTICO DE FACTURACIÓN

## 1. Resumen ejecutivo

El diagnóstico de Claude queda **CONFIRMADO CON CORRECCIONES**.

La facturación de Mercado Pago está implementada en código y tiene el camino feliz principal: creación de preapproval, redirección al checkout, recepción de webhook, consulta de la entidad en Mercado Pago, persistencia de Payment y actualización de la suscripción. Sin embargo, el repositorio no contiene evidencia suficiente para afirmar que esté validada en sandbox, desplegada correctamente o operativa en producción con pagos reales.

La preparación actual **REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN**.

Los bloqueantes reales son:

- Un webhook APPROVED repetido vuelve a aplicar la extensión del período aunque la fila Payment ya exista.
- Un pago PENDING o REJECTED tardío puede degradar una suscripción vigente a GRACE_PERIOD.
- Payment, Subscription, Tenant y AuditLog no se actualizan en una única transacción.
- Cron y webhook pueden pisarse porque las actualizaciones no revalidan el estado seleccionado.
- No existe un ledger de webhooks ni una idempotencia del efecto económico.
- La cancelación recibida por webhook no establece cancelledAt y bloquea inmediatamente el acceso.
- El MRR y los ingresos incluyen pagos SIMULATED aprobados.
- No hay pruebas de facturación, webhook ni Mercado Pago en la suite actual.

Correcciones al diagnóstico de Claude:

1. Payment sí tiene idempotencia de fila mediante mercadoPagoPaymentId único y upsert. La afirmación correcta es que el efecto económico completo no es idempotente.
2. Dos ejecuciones simultáneas que leen exactamente el mismo currentPeriodEnd pueden terminar con una sola extensión visible por último escritor, no necesariamente con dos extensiones. La carrera sigue siendo un defecto porque puede perder actualizaciones o producir resultados dependientes del orden.
3. x-request-id no debe asumirse como identificador estable de evento de negocio. data.id identifica normalmente la entidad notificada, no necesariamente una entrega única. El ledger necesita separar deduplicación de entregas y deduplicación del efecto económico.
4. La ausencia de una ventana HMAC es real, pero la ventana temporal por sí sola no soluciona replay ni debe reemplazar la idempotencia. Debe combinarse con un ledger y una regla de aplicación única.

## 2. Estado de Git

Commit actual:

0141492 — chore(test): isolate test database and protect Prisma execution

Al iniciar la revisión, el código no tenía cambios rastreados de facturación. El working tree contenía la carpeta no rastreada de la Fase 1B. Durante esta sesión solo se crearon los dos documentos autorizados:

- docs/programa-mejora/02-facturacion/03-prompt-codex-verificacion-facturacion.md
- docs/programa-mejora/02-facturacion/04-respuesta-codex-verificacion-facturacion.md

No se modificaron código, schema, migraciones, configuración ni variables de entorno. No se muestran secretos.

## 3. Estado real de Mercado Pago

| Área | Evidencia | Estado |
|---|---|---|
| Checkout | src/app/api/billing/checkout/route.ts, acciones createPreapproval y disableAutoRenew | Implementado en código |
| Preapproval | src/domains/billing/mercado-pago.service.ts, POST /preapproval | Implementado en código |
| Redirección | init_point o sandbox_init_point y back_url | Implementado en código |
| Consulta de preapproval | GET /preapproval/id | Implementado en código |
| Consulta de pagos | GET /v1/payments/id y GET /authorized_payments/id | Implementado en código |
| Webhook | src/app/api/billing/mercado-pago/webhook/route.ts | Implementado parcialmente |
| HMAC | HMAC-SHA256, timingSafeEqual, secreto obligatorio | Implementado, sin control de frescura |
| Actualización de monto | PUT /preapproval/id | Implementado en código |
| Cancelación de renovación | PUT /preapproval/id con status canceled | Implementado en código |
| Cron de mora | vercel.json y /api/cron/overdue-rules | Implementado en código |
| UI ADMIN | src/app/admin/licencias/page.tsx y AdminShell | Acción existente |
| Variables | .env y .env.example contienen nombres de variables MP | Configurado localmente de forma estructural |
| Producción | No hay evidencia del dashboard de Mercado Pago ni de Vercel en el repositorio | No determinable |
| Operación real | No hay IDs reales de preapproval, pagos reales, fixtures ni pruebas end-to-end | No determinable |

Variables identificadas sin revelar valores:

- MERCADO_PAGO_ACCESS_TOKEN
- MERCADO_PAGO_WEBHOOK_SECRET
- MERCADO_PAGO_TEST_PAYER_EMAIL
- NEXTAUTH_URL
- APP_URL
- CRON_SECRET

El código distingue un token cuyo prefijo es TEST- y usa MERCADO_PAGO_TEST_PAYER_EMAIL en ese caso. Para producción usa el correo del ADMIN. La presencia de nombres en .env no prueba que el token sea válido, que sea de producción, que el payer exista en Mercado Pago o que el webhook esté configurado en el panel del proveedor.

Conclusión de estado:

**IMPLEMENTADO EN CÓDIGO, CONFIGURADO LOCALMENTE, NO VALIDADO OPERATIVAMENTE.**

No existe evidencia suficiente para clasificarlo como VALIDADO EN SANDBOX u OPERATIVO EN PRODUCCIÓN.

## 4. Evaluación del diagnóstico de Claude

| ID | Afirmación | Veredicto | Evidencia y corrección | Confianza |
|---|---|---|---|---|
| C1 | Existe camino feliz de facturación | CONFIRMADA CON MATICES | Existen checkout, preapproval y webhook; no existe prueba end-to-end | Alta |
| C2 | Payment es idempotente por mercadoPagoPaymentId | CONFIRMADA CON MATICES | La fila usa upsert y unique; Subscription y auditoría se vuelven a procesar | Alta |
| C3 | Un APPROVED repetido extiende el período otra vez | CONFIRMADA | upsertMercadoPagoPayment actualiza Subscription después de cada llegada | Alta |
| C4 | Eventos viejos pueden degradar la suscripción | CONFIRMADA | PENDING/REJECTED siempre llevan a GRACE_PERIOD sin precedencia | Alta |
| C5 | El webhook no es atómico | CONFIRMADA | Payment, Subscription, Tenant y AuditLog usan awaits separados | Alta |
| C6 | HMAC autentica el webhook | CONFIRMADA | Secreto obligatorio, manifiesto y timingSafeEqual | Alta |
| C7 | HMAC tiene anti-replay y frescura | CONTRADICHA | Se firma ts pero no se valida antigüedad ni se registra evento | Alta |
| C8 | No existe ledger de webhooks | CONFIRMADA | No existe WebhookEvent ni WebhookLog en schema.prisma | Alta |
| C9 | El cron es idempotente en ejecuciones secuenciales | CONFIRMADA CON MATICES | Los filtros de estado evitan repetir la transición; las notificaciones y carreras no están protegidas | Alta |
| C10 | Cancelación por webhook omite cancelledAt | CONFIRMADA | updateTenantStatusFromSubscription solo actualiza status | Alta |
| C11 | La gracia está unificada | CONFIRMADA | Cron y webhook consultan getGracePeriodDays | Alta |
| C12 | Pagos SIMULATED inflan métricas | CONFIRMADA | Agregados de billing y analytics filtran status, no provider | Alta |
| C13 | createInitialSubscriptionForTenant está muerto | CONFIRMADA CON MATICES | No tiene callers estáticos, pero está exportado y no se debe eliminar sin decisión de compatibilidad | Alta |
| C14 | Una WebhookEvent única por event ID resuelve todo | CONFIRMADA CON CORRECCIONES | data.id es de entidad y x-request-id no debe asumirse como evento estable; se requieren claves separadas | Alta |
| C15 | Una ventana HMAC de pocos minutos es obligatoria por sí sola | CONFIRMADA CON MATICES | La frescura mejora seguridad, pero no reemplaza ledger/idempotencia y puede rechazar reintentos legítimos | Media |
| C16 | Todas las correcciones propuestas son obligatorias antes de producción | CONFIRMADA CON MATICES | Idempotencia de efecto, atomicidad, precedencia y cron seguro sí; versión, job y cambio de enum pueden ser posteriores | Alta |
| C17 | Mercado Pago ya está operativo | NO VERIFICABLE | No hay evidencia de pagos reales, webhook configurado ni recorrido completo | Alta |

## 5. Reextensión por replay

El comportamiento actual está en upsertMercadoPagoPayment, src/domains/billing/mercado-pago.service.ts:

1. Payment se busca por mercadoPagoPaymentId único.
2. Si no existe, se crea.
3. Si existe, se actualizan status, rawStatus y paidAt.
4. Después, sin comprobar si la fila fue creada o si ya produjo efecto, se actualiza Subscription.
5. Para APPROVED se recalculan currentPeriodStart y currentPeriodEnd.

Ejemplo secuencial:

- Estado inicial: currentPeriodEnd = 10 de enero.
- Primer webhook APPROVED el 1 de enero:
  - periodStart = 10 de enero.
  - periodEnd = 9 de febrero.
- Segundo webhook del mismo pago el 2 de enero:
  - la fila Payment ya existe;
  - la suscripción se vuelve a leer con currentPeriodEnd = 9 de febrero;
  - periodStart = 9 de febrero;
  - periodEnd = 11 de marzo aproximadamente.

Resultado: el mismo pago produce dos extensiones.

En ejecución simultánea:

- Si ambas solicitudes leen el mismo currentPeriodEnd antes de escribir, calculan el mismo siguiente período. El último escritor puede dejar una sola extensión visible.
- Si una solicitud lee después de la primera escritura, puede producir dos extensiones.
- Si los cálculos parten de valores distintos, el último escritor puede sobrescribir el período más avanzado.
- Prisma y PostgreSQL no convierten este read-modify-write en una operación económica idempotente por sí solos.

Hallazgo: F1-01, crítico, bloquea producción.

Corrección mínima: distinguir el primer efecto APPROVED de una actualización de estado ya procesada dentro de una transacción y aplicar la extensión una sola vez. No basta con el upsert de Payment.

## 6. Eventos fuera de orden

No existe precedencia de estados ni timestamp de evento persistido:

- lastWebhookAt se escribe con la hora local de procesamiento.
- No se compara contra la llegada anterior.
- date_created o date_approved se usa para paidAt, pero no para ordenar transiciones.
- Un PENDING o REJECTED tardío puede cambiar Payment APPROVED a PENDING/REJECTED y Subscription ACTIVE a GRACE_PERIOD.
- No se comprueba que un pago aprobado cubra el período actual antes de degradar.
- Un pago aprobado antiguo puede ser suficiente para que updateTenantStatusFromSubscription marque el Tenant ACTIVE, porque consulta cualquier Payment APPROVED sin filtrar periodEnd.

Distinciones relevantes:

- Cambio de estado del mismo Payment: debe permitir PENDING → APPROVED, pero no volver a producir el efecto APPROVED.
- Pagos distintos: deben relacionarse con períodos distintos y no degradar una suscripción cubierta por otro pago aprobado.
- Preapproval: autorizado significa autorización de cobro recurrente, no pago efectuado.
- Suscripción local: no debe cambiar únicamente porque el proveedor envíe un estado desconocido.

Hallazgo: F1-02, alta, bloquea producción.

## 7. Atomicidad

### Webhook de pago

La secuencia actual es:

1. Payment.upsert.
2. Subscription.update.
3. Tenant.update.
4. AuditLog.create.

No están dentro de una única transacción.

### Webhook de preapproval

La secuencia actual es:

1. Subscription.update.
2. Tenant.update.
3. AuditLog.create.

Tampoco es atómica.

### Fallos posibles

| Punto de fallo | Estado posible |
|---|---|
| Después de Payment.upsert | Payment guardado, Subscription sin activar o extender |
| Después de Subscription.update | Subscription activa/gracia, Tenant con estado anterior |
| Después de Tenant.update | Datos principales cambiados, auditoría ausente |
| Durante AuditLog.create | El efecto económico ya quedó aplicado, pero la ruta responde 500 |
| Reintento de Mercado Pago | Reprocesa la operación y puede volver a extender el período |

El reintento puede reparar divergencias de Tenant/Subscription, pero puede empeorar el período por replay. No existe una transacción común que incluya el ledger, el Payment, la Subscription, el Tenant y la auditoría.

Hallazgo: F1-04, alta, bloquea producción.

## 8. Concurrencia

### Webhook contra webhook

Existe una carrera en currentPeriodEnd por read-modify-write. La actualización no tiene versión, estado esperado ni compare-and-set.

### Webhook contra cron

El cron:

1. Lee suscripciones vencidas.
2. Ejecuta updateMany por IDs.
3. Actualiza Tenant en otra operación.
4. Envía notificaciones y correos.

El updateMany no revalida que la suscripción siga ACTIVE o TRIAL. Un pago aprobado puede activar una suscripción después del findMany y antes del updateMany; el cron puede volver a ponerla en GRACE_PERIOD.

### Cron contra cron

Dos ejecuciones simultáneas pueden seleccionar los mismos registros y enviar notificaciones duplicadas. Las transiciones finales pueden coincidir, pero el efecto de comunicación se duplica.

### Acción manual contra webhook

Las acciones manuales de Tenant usan transacciones locales, pero no comparten versión ni bloqueo con el webhook. El último escritor puede ganar con una combinación inconsistente de estado y período.

### Precio contra renovación

El PUT a Mercado Pago ocurre antes de la transacción local. Si la transacción falla y el revert también falla, el monto del proveedor puede quedar distinto al de la base.

Carreras demostrables por inspección estática:

- Webhook aprobado contra cron de mora.
- Dos webhooks con lecturas en momentos diferentes.
- Dos cron simultáneos y notificaciones duplicadas.
- PUT Mercado Pago exitoso contra fallo de persistencia local.

Hallazgo: F1-03, alta, bloquea producción.

Corrección mínima: compare-and-set en transiciones y revalidación del estado en updateMany. Una versión optimista es recomendable para cubrir carreras de período.

## 9. Ledger e idempotencia

No existe WebhookEvent, WebhookLog ni modelo equivalente.

### Identificadores actuales

- data.id se utiliza para localizar la entidad en Mercado Pago.
- mercadoPagoPaymentId identifica un pago y sí es unique.
- mercadoPagoPreapprovalId identifica un preapproval y sí es unique.
- x-request-id llega en la firma, pero no debe tratarse automáticamente como ID estable del evento de negocio.
- topic/type identifica la familia de entidad.
- action no se persiste como evento independiente.

### Por qué data.id no basta

El mismo pago puede generar estados legítimos distintos, por ejemplo PENDING y posteriormente APPROVED. Una unique sobre topic + data.id bloquearía esa transición legítima.

### Por qué x-request-id no basta

Es un identificador de solicitud de entrega, no una garantía suficiente de identidad del cambio de negocio. Un reintento puede tener otra solicitud o el mismo request ID según la política del proveedor; el repositorio no puede asumir estabilidad no documentada.

### Diseño mínimo recomendado

Separar dos objetivos:

1. Ledger de entregas:
   - provider
   - topic
   - dataId
   - requestId nullable
   - receivedAt
   - firma validada
   - resultado
   - tenantId/subscriptionId nullable
   - error seguro
   - metadata mínima sin payload sensible completo

2. Idempotencia del efecto económico:
   - Payment único por provider + payment ID ya existe.
   - El efecto APPROVED debe tener una única aplicación atómica.
   - Puede representarse con una clave de efecto única, por ejemplo provider + recurso + transición económica APPROVED, o mediante una condición transaccional que solo aplique la extensión cuando la fila no haya sido APPROVED antes.
   - Las transiciones PENDING → APPROVED deben seguir permitidas.
   - Un PENDING/REJECTED repetido no debe degradar un período cubierto.

No se debe almacenar el token de acceso, firmas completas innecesarias, datos de tarjeta, contraseñas ni el payload completo si no es necesario para auditoría.

Hallazgo: F1-08 y F1-12, medios, bloquean producción por replay y falta de trazabilidad.

## 10. Firma HMAC y replay

El manifiesto actual es:

id:dataId;request-id:xRequestId;ts:ts;

Se usa HMAC-SHA256 con MERCADO_PAGO_WEBHOOK_SECRET y comparación timingSafeEqual.

Correctamente implementado:

- El secreto es obligatorio.
- Falta de firma rechaza.
- Firma inválida rechaza.
- No se muestran secretos en el mensaje.

Defectos:

- ts puede faltar o no ser numérico y aun así formar parte del manifiesto.
- No se valida si ts está en segundos o milisegundos.
- No se valida antigüedad.
- No se registra el evento antes de aplicar el efecto.
- La firma válida demuestra autenticidad del manifiesto, no unicidad de la entrega.
- Un payload firmado capturado puede reenviarse indefinidamente.

Una ventana de frescura razonable debe definirse tras confirmar la política de reintentos del proveedor. No recomiendo usar una ventana estricta como única defensa: un webhook legítimo retrasado podría perderse. La defensa principal debe ser el ledger y la idempotencia del efecto. Un evento viejo y firmado puede registrarse como recibido, marcarse como stale y no volver a aplicar un efecto ya aplicado.

La ruta devuelve 200 para topic desconocido o entidad no encontrada. Eso evita reintentos interminables, pero sin ledger no deja evidencia operativa.

## 11. Máquina de estados

| Estado actual | Evento | Comportamiento actual | Recomendación |
|---|---|---|---|
| TRIAL | Payment APPROVED | ACTIVE y extiende 30 días | ACTIVE y una sola extensión |
| ACTIVE | Payment APPROVED | ACTIVE y vuelve a extender | ACTIVE, sin repetir efecto |
| ACTIVE | Payment PENDING | GRACE_PERIOD inmediato | Mantener ACTIVE si el período está cubierto; gracia al vencer o según política contractual |
| ACTIVE | Payment REJECTED | GRACE_PERIOD inmediato | No degradar si existe cobertura aprobada vigente |
| GRACE_PERIOD | Payment APPROVED | ACTIVE y extiende | ACTIVE y una sola aplicación |
| SUSPENDED | Payment APPROVED | ACTIVE y extiende | ACTIVE solo mediante pago válido y efecto idempotente |
| CANCELLED | Payment APPROVED | Puede volver a ACTIVE | Requerir política explícita; no reactivar automáticamente una licencia cancelada |
| ACTIVE | Preapproval cancelado | Subscription y Tenant CANCELLED | Cancelar cobros futuros y conservar acceso hasta el período pagado cuando corresponda |
| ACTIVE | autoRenew desactivado | Subscription continúa ACTIVE | Correcto: detener cobros futuros sin cancelar acceso |
| Cualquier estado | Estado desconocido del proveedor | GRACE_PERIOD por default | Registrar y no degradar automáticamente; requiere reconciliación o revisión |

El estado desconocido transformado a GRACE_PERIOD es un defecto de seguridad operativa.

La transición PENDING_PAYMENT sigue existiendo en los enums y puede producirse cuando llega preapproval autorizado sin Payment APPROVED después del trial. Es un estado legado, no el estado usado por creación de nuevos conjuntos.

## 12. Cancelación

Hay tres acciones distintas:

1. Desactivar auto-renovación:
   - PUT a Mercado Pago con status canceled.
   - Subscription.autoRenew=false.
   - No cancela inmediatamente la licencia local.
   - Conceptualmente es la acción correcta para detener cobros futuros.

2. Cancelar manualmente el conjunto:
   - Super Admin cambia Tenant y Subscription a CANCELLED.
   - Se fija cancelledAt.
   - Se bloquea el acceso según los guards de licencia.

3. Cancelación recibida por webhook:
   - Subscription pasa a CANCELLED.
   - Tenant pasa a CANCELLED.
   - cancelledAt no se fija.
   - El acceso puede bloquearse inmediatamente.

La política de pagos publicada distingue detener renovaciones futuras de revertir cargos ya procesados. El código no mantiene de forma consistente el acceso hasta el final del período pagado cuando una cancelación llega por webhook. Debe definirse explícitamente si CANCELLED es cancelación inmediata o cancelación de renovación con acceso hasta currentPeriodEnd.

Hallazgo: F1-06, medio, bloquea producción si la política comercial promete acceso hasta fin del período; además afecta churn y auditoría.

## 13. Pagos simulados y métricas

PaymentProvider contiene:

- SIMULATED
- MERCADO_PAGO

renewSubscriptionWithSimulatedPayment crea un Payment:

- status APPROVED
- provider SIMULATED
- amountCents igual al precio
- paidAt igual al momento de la operación

grantCourtesyExtension crea un Payment SIMULATED APPROVED con amountCents igual a cero.

getBillingPlatformOverview agrega todos los Payment APPROVED sin filtrar provider. getPlatformAnalytics también consulta Payment APPROVED sin filtrar provider. Por tanto:

- Renovar simulado aumenta ingresos del mes.
- Renovar simulado aumenta totalRevenue.
- Puede afectar mrrTrend.
- El ARPU mostrado en la UI se deriva de ingresos mensuales divididos por licencias activas.
- Cortesías de cero no aumentan el monto, pero sí aparecen como pagos aprobados.
- Los históricos simulados ya registrados seguirán contaminando métricas hasta que se filtre o ajuste.

El botón Renovar existe en la interfaz Super Admin y llama a renewSubscription sin motivo ni confirmación específica de que no cobra dinero real. Es una herramienta administrativa válida, pero actualmente constituye un riesgo de operación y de reporte financiero.

Hallazgo: F1-05, alto para la confiabilidad de métricas; no es un defecto de autorización de cobro, pero debe corregirse antes de usar métricas para decisiones o presentar ingresos.

## 14. Cron de mora

El cron está configurado en vercel.json:

- Ruta: /api/cron/overdue-rules
- Frecuencia: 0 7 * * *

La ruta valida Authorization: Bearer CRON_SECRET.

Comportamiento:

- ACTIVE o TRIAL con currentPeriodEnd < now pasa a GRACE_PERIOD.
- GRACE_PERIOD con graceEndsAt < now pasa a SUSPENDED.
- La igualdad exacta no vence porque la comparación es estrictamente menor.
- graceEndsAt null no cumple la búsqueda y puede dejar una suscripción en gracia indefinidamente.
- Una ejecución secuencial posterior normalmente no vuelve a seleccionar el registro ya movido.
- Dos ejecuciones concurrentes pueden enviar notificaciones duplicadas.
- Subscription y Tenant se actualizan en operaciones separadas.
- El updateMany por IDs no revalida el status original.
- Un webhook aprobado intermedio puede ser pisado por el cron.
- Un fallo entre las dos escrituras puede dejar Tenant y Subscription divergentes.

Corrección mínima:

- Reemplazar el where del updateMany por una condición que incluya el estado de origen y la fecha esperada.
- Usar el count afectado para notificar/auditar solo transiciones realmente aplicadas.
- Tratar graceEndsAt null como estado inválido que debe alertarse o corregirse.
- Separar la operación de transición de las notificaciones para que una notificación fallida no deshaga ni oculte la transición.

## 15. Precio y unidades pendientes

El nuevo precio se calcula con calculatePriceForUnits y PricingRule.

Al modificar unidades de un conjunto:

- Tenant.units cambia localmente.
- pendingUnitsSnapshot, pendingPriceCents, pendingCurrency y pendingPriceEffectiveAt almacenan los términos futuros.
- Si existe preapproval, se actualiza inmediatamente el monto recurrente en Mercado Pago.
- La aplicación local de los términos pendientes ocurre en la renovación.
- La lógica de aplicar términos y extender períodos está duplicada entre billing.service.ts y mercado-pago.service.ts.
- BILLING_PERIOD_DAYS está definido en ambos servicios.
- Si Mercado Pago se actualiza y la transacción local falla, se intenta revertir el monto.
- Si el revert falla, se descarta silenciosamente con catch(() => null).
- Puede quedar divergencia MP↔DB sin alerta ni reconciliación.
- Si el PUT externo falla antes de la transacción, la DB no cambia; esa parte sí evita una actualización local sin proveedor, pero no ofrece trazabilidad de una respuesta ambigua del proveedor.

Hallazgo: F1-07, medio por duplicación; F1-09, medio por divergencia externa y revert silencioso. No requieren una nueva infraestructura, pero sí registro y reconciliación mínima.

## 16. Código muerto

createInitialSubscriptionForTenant:

- Está exportada.
- Tiene implementación completa.
- Crea una suscripción ACTIVE con un Payment SIMULATED APPROVED.
- No tiene callers estáticos en src ni en las pruebas actuales.
- La creación vigente está en tenant-admin.service.ts mediante una transacción y estado TRIAL.
- No hay evidencia de invocación dinámica.

Conclusión: es código muerto según el grafo estático actual, pero eliminarlo no debe hacerse en esta fase sin confirmar compatibilidad externa. Su contenido además conserva una semántica anterior incompatible con el trial de 15 días, por lo que mantenerlo exportado aumenta el riesgo de uso accidental.

Hallazgo: F1-11, bajo, no bloquea por sí solo.

## 17. Estrategia de pruebas

### Puras

Se pueden probar sin PostgreSQL:

- computeNextPeriod.
- Precedencia de PaymentStatus.
- Mapas de estado conocidos y desconocidos.
- Cálculo de gracia.
- Validación de manifiesto HMAC.
- Parseo de ts.
- Construcción de claves de efecto.
- Exclusión de SIMULATED en agregados si se extrae el filtro a una función pura.
- Resolución de términos pendientes.
- Datos no sensibles del ledger.

### PostgreSQL requerido

- Payment APPROVED repetido.
- PENDING → APPROVED.
- APPROVED → REJECTED tardío.
- Payment, Subscription, Tenant y AuditLog dentro de transacción.
- Unique de ledger.
- Reintento tras rollback.
- Cron y webhook concurrentes.
- Actualización de unidades y período efectivo.

### Mocks de fetch

- POST /preapproval.
- GET /preapproval.
- GET /v1/payments.
- GET /authorized_payments.
- PUT /preapproval.
- Error de proveedor, respuesta 500 y respuesta ambigua.
- Revert de precio que falla.

### Concurrencia real

Debe probarse contra PostgreSQL dedicado:

- Dos webhooks APPROVED iguales.
- Dos cron simultáneos.
- Webhook APPROVED contra cron de mora.
- PUT de precio contra fallo de persistencia local.

No se necesita llamar a Mercado Pago real para las pruebas de dominio. El servicio debería permitir inyectar un cliente fetch o un adaptador pequeño. No hace falta introducir React Query, colas ni una librería pesada. Node nativo y mocks controlados son suficientes.

La cobertura actual de tests no incluye Mercado Pago, webhook, HMAC, cron ni agregados de facturación. Los tests super-admin cubren renovación simulada, no la integración real.

## 18. Diseño mínimo recomendado

| Elemento | Clasificación | Motivo |
|---|---|---|
| WebhookEvent o ledger equivalente | OBLIGATORIO ANTES DE PRODUCCIÓN | Trazabilidad y registro de eventos recibidos |
| Clave única de efecto APPROVED | OBLIGATORIO ANTES DE PRODUCCIÓN | Evita extender dos veces el mismo pago |
| Transacción interactiva | OBLIGATORIO ANTES DE PRODUCCIÓN | Payment, Subscription, Tenant, ledger y auditoría coherentes |
| Función única de extensión | OBLIGATORIO ANTES DE PRODUCCIÓN | Elimina la duplicación económica |
| Compare-and-set del cron | OBLIGATORIO ANTES DE PRODUCCIÓN | Evita pisar un webhook |
| Precedencia de estados | OBLIGATORIO ANTES DE PRODUCCIÓN | Evita degradación por eventos tardíos |
| cancelledAt por webhook | OBLIGATORIO ANTES DE PRODUCCIÓN | Consistencia legal, churn y auditoría |
| lastProviderEventAt | RECOMENDADO | Útil si el proveedor entrega timestamp confiable |
| providerEventAt en Payment | RECOMENDADO | Ayuda a ordenar eventos |
| Campo version | RECOMENDADO | Refuerza carreras de período y acciones manuales |
| Timestamp del proveedor | RECOMENDADO | No debe ser la única defensa |
| Frescura HMAC | RECOMENDADO | Reduce replay temporal, con tolerancia documentada |
| Exclusión de SIMULATED en métricas | OBLIGATORIO ANTES DE PRESENTAR MÉTRICAS | Evita reportar ingresos falsos |
| Función de reconciliación MP↔DB | RECOMENDADO | Importante para una operación administrada por una persona |
| Job de reconciliación automático | OPCIONAL por ahora | Puede comenzar con revisión manual registrada |
| Cambio del enum Payment | INNECESARIO POR AHORA | Los enums actuales bastan para cerrar los bloqueantes |
| Colas, Redis, Kafka, microservicios | INNECESARIO POR AHORA | No son proporcionales al producto actual |
| Event sourcing completo | INNECESARIO POR AHORA | El ledger mínimo es suficiente |

## 19. Subfases propuestas

### Subfase 1 — Idempotencia y atomicidad

Archivos:

- prisma/schema.prisma
- nueva migración aditiva
- src/domains/billing/mercado-pago.service.ts
- src/domains/platform/audit.service.ts, solo si se necesita adaptar la transacción
- tests de billing y webhook

Migración:

- Ledger WebhookEvent o tabla equivalente.
- Clave única de efecto económico.
- Campos opcionales de timestamp/version si se adoptan.

Pruebas:

- APPROVED repetido.
- PENDING → APPROVED.
- rollback después de Payment.
- rollback después de Subscription.
- reintento después de fallo.
- auditoría dentro de la transacción.

Riesgo:

- Migración incompleta o clave incorrecta puede bloquear pagos legítimos.
- Se debe diferenciar data.id de una transición económica.

Aceptación:

- El mismo pago aprobado extiende una sola vez.
- El reintento tras rollback aplica la transacción completa una sola vez.
- No quedan Tenant y Subscription divergentes por fallo intermedio.

Rollback:

- Migración aditiva reversible.
- Mantener columnas existentes.
- No borrar Payment ni Subscription históricos.

### Subfase 2 — Orden de eventos y concurrencia con cron

Archivos:

- src/domains/billing/mercado-pago.service.ts
- src/domains/billing/billing.service.ts
- tests de concurrencia

Migración:

- version y timestamps solo si el compare-and-set requiere persistencia adicional.

Pruebas:

- Evento viejo no degrada período cubierto.
- Cron no pisa webhook.
- Dos cron no duplican notificaciones.
- Estado desconocido no degrada automáticamente.

Riesgo:

- Rechazar eventos legítimos por una comparación temporal incorrecta.
- Debe conservarse la posibilidad PENDING → APPROVED.

Aceptación:

- La transición solo se aplica si el estado y período siguen siendo los esperados.
- Un pago aprobado vigente no vuelve a gracia por un evento tardío.

Rollback:

- Desactivar la nueva precedencia mediante feature flag o revert de la lógica, conservando datos aditivos.

### Subfase 3 — Cancelación, pagos simulados y métricas

Archivos:

- src/domains/billing/mercado-pago.service.ts
- src/domains/billing/billing.service.ts
- src/domains/platform/analytics.service.ts
- src/app/(protected)/super-admin/page.tsx
- pruebas de métricas y cancelación

Migración:

- No necesariamente requerida.

Pruebas:

- cancelación por webhook fija cancelledAt;
- auto-renew false no cancela acceso;
- pago simulado no aparece en ingresos;
- cortesía no aparece como ingreso;
- Renovar exige confirmación/motivo según política.

Riesgo:

- Corregir históricos sin aclarar que los reportes anteriores incluían simulados.

Aceptación:

- Ingresos reales filtran provider MERCADO_PAGO.
- La política de cancelación se refleja igual en manual y webhook.

Rollback:

- Revertir filtros de presentación sin borrar históricos.
- Mantener provider en cada Payment.

### Subfase 4 — Reconciliación y observabilidad

Archivos:

- servicio de reconciliación;
- ledger;
- pantalla o reporte de integración si se decide;
- pruebas de fetch y respuestas ambiguas.

Migración:

- Índices del ledger si hacen falta.

Pruebas:

- MP tiene monto distinto a DB.
- PUT exitoso con fallo local.
- Revert fallido.
- preapproval existente sin correspondencia local.
- pagos recibidos sin webhook procesado.

Riesgo:

- Operador puede interpretar una alerta como pago no confirmado.

Aceptación:

- Cada divergencia queda registrada con acción recomendada.
- No se modifica una suscripción automáticamente sin evidencia suficiente.

Rollback:

- Ejecutar reconciliación en modo lectura.
- No borrar eventos ni pagos.

## 20. Hallazgos

### F1-01 — Crítico — Efecto de pago no idempotente

Archivo y símbolo: src/domains/billing/mercado-pago.service.ts, upsertMercadoPagoPayment.

Comportamiento: Payment upsert es idempotente, pero Subscription siempre se actualiza.

Escenario: el mismo webhook APPROVED llega dos veces.

Impacto: período gratuito extendido, datos de licencia e ingresos incorrectos.

Evidencia: cálculo de periodStart/periodEnd antes de Subscription.update, posterior al upsert.

Corrección mínima: registrar/aplicar una única transición APPROVED dentro de una transacción.

Prueba: mismo payment ID dos veces, un solo aumento.

¿Bloquea producción?: Sí.

### F1-02 — Alta — Degradación por eventos fuera de orden

Archivo y símbolo: mercado-pago.service.ts, mapPaymentStatus y upsertMercadoPagoPayment.

Comportamiento: cualquier REJECTED/PENDING fuerza GRACE_PERIOD y puede cambiar la fila Payment.

Escenario: rechazo tardío de un cobro anterior después de un pago aprobado.

Impacto: suspensión indebida de un conjunto que pagó.

Corrección mínima: precedencia/efecto por período y no degradar una cobertura aprobada vigente.

Prueba: rejected viejo después de approved vigente.

¿Bloquea producción?: Sí.

### F1-03 — Alta — Carreras webhook/cron y read-modify-write

Archivo y símbolo: mercado-pago.service.ts y billing.service.ts, update/updateMany.

Comportamiento: no hay versión ni estado esperado en las escrituras.

Escenario: cron selecciona vencido, webhook paga y cron escribe después.

Impacto: Tenant y Subscription pueden divergir; estados se pisan y notificaciones se duplican.

Corrección mínima: compare-and-set y revalidación de estado en updateMany.

Prueba: concurrencia PostgreSQL.

¿Bloquea producción?: Sí.

### F1-04 — Alta — Webhook no atómico

Archivo y símbolo: upsertMercadoPagoPayment y updateSubscriptionFromPreapproval.

Comportamiento: escrituras separadas.

Escenario: excepción después de una escritura.

Impacto: estado parcial y reintentos con efectos repetidos.

Corrección mínima: transacción interactiva con ledger y auditoría.

Prueba: fallos inyectados en cada punto.

¿Bloquea producción?: Sí.

### F1-05 — Alta para métricas — Pagos simulados incluidos en ingresos

Archivo y símbolo: billing.service.ts getBillingPlatformOverview y analytics.service.ts getPlatformAnalytics.

Comportamiento: agregan status APPROVED sin filtrar provider.

Escenario: Super Admin pulsa Renovar.

Impacto: MRR, ingresos, ARPU y tendencias inflados.

Corrección mínima: filtrar provider MERCADO_PAGO y etiquetar claramente overrides.

Prueba: mezcla de pagos reales/simulados.

¿Bloquea producción?: Sí para presentar métricas financieras; No para crear el checkout.

### F1-06 — Media — Cancelación por webhook incompleta

Archivo y símbolo: updateTenantStatusFromSubscription.

Comportamiento: CANCELLED no fija cancelledAt.

Escenario: Mercado Pago cancela el preapproval.

Impacto: churn, auditoría y cumplimiento de política inconsistentes.

Corrección mínima: fijar cancelledAt según la política y distinguir cancelación de renovación.

Prueba: preapproval cancelled.

¿Bloquea producción?: Sí si la política promete acceso hasta el fin del período; en todo caso debe corregirse antes de lanzamiento comercial.

### F1-07 — Media — Lógica económica duplicada

Archivo y símbolo: billing.service.ts y mercado-pago.service.ts.

Comportamiento: período de 30 días y términos pendientes se resuelven en más de un lugar.

Escenario: una regla cambia en un camino y no en otro.

Impacto: divergencia futura de períodos/precios.

Corrección mínima: una función compartida para términos y extensión.

Prueba: misma entrada en renovación simulada y webhook.

¿Bloquea producción?: Sí como acompañamiento de F1-01; reduce riesgo de regresión.

### F1-08 — Media — Replay HMAC sin ledger

Archivo y símbolo: validateWebhookSignatureIfConfigured y webhook route.

Comportamiento: firma válida se procesa indefinidamente; ts no tiene ventana; no hay evento persistido.

Escenario: reenvío de una solicitud firmada.

Impacto: combinado con F1-01, extensión repetida; falta de trazabilidad.

Corrección mínima: ledger y clave de efecto; frescura con tolerancia documentada.

Prueba: firma válida repetida, ts inválido/viejo, evento legítimo tardío.

¿Bloquea producción?: Sí por el efecto económico combinado.

### F1-09 — Media — Divergencia Mercado Pago/base

Archivo y símbolo: updateTenantDetails.

Comportamiento: PUT externo antes de transacción local; revert silencioso.

Escenario: DB falla y el revert también falla.

Impacto: proveedor cobra un monto distinto del registrado.

Corrección mínima: registrar resultado y crear alerta/reconciliación manual.

Prueba: fetch exitoso, DB fallida, revert fallido.

¿Bloquea producción?: No si se limita cambio de unidades hasta cerrar reconciliación; Sí si se permite operar sin alertas.

### F1-10 — Baja — GRACE_PERIOD sin graceEndsAt

Archivo y símbolo: applyOverdueLicenseRules.

Comportamiento: graceEndsAt null nunca entra en la consulta de suspensión.

Escenario: fila inconsistente en gracia.

Impacto: licencia suspendible queda en gracia indefinida.

Corrección mínima: constraint de entrada o alerta/normalización de null.

Prueba: gracia sin fecha.

¿Bloquea producción?: No, pero debe corregirse.

### F1-11 — Baja — Código muerto con semántica antigua

Archivo y símbolo: createInitialSubscriptionForTenant.

Comportamiento: exportada, sin callers estáticos; crea ACTIVE y pago simulado.

Escenario: llamada accidental desde código futuro.

Impacto: omite trial y crea ingresos simulados.

Corrección mínima: eliminar o marcar privada después de confirmar compatibilidad.

Prueba: búsqueda de callers y compilación.

¿Bloquea producción?: No por sí solo.

### F1-12 — Media — Auditoría incompleta de webhooks

Archivo y símbolo: auditWebhook.

Comportamiento: solo registra después de encontrar entidad y aplicar efecto.

Escenario: topic desconocido, entidad inexistente o fallo intermedio.

Impacto: no se puede reconstruir qué recibió el sistema.

Corrección mínima: ledger de recepción con resultado y metadata segura.

Prueba: evento desconocido, entidad ausente, error de proveedor y éxito.

¿Bloquea producción?: Sí junto con F1-01/F1-08.

## 21. Riesgos aceptados

Pueden aceptarse después de cerrar los bloqueantes:

- Mercado Pago puede perder o retrasar una notificación; se necesita reconciliación eventual.
- Alias DNS y configuración externa no se verifican desde el repositorio.
- Una operación manual de cortesía seguirá siendo una excepción administrativa.
- Un desarrollador con control de infraestructura puede modificar variables o código.
- Residuos de pruebas pueden quedar en la base de test tras una terminación abrupta.
- Un job de reconciliación automático puede esperar a una fase posterior si existe revisión manual y trazabilidad.
- Cambiar PaymentStatus para agregar REFUNDED/CANCELLED no es necesario para el primer lanzamiento.

No se acepta antes de producción:

- Extensión repetida del período.
- Degradación por evento tardío.
- Estado parcial entre Payment, Subscription y Tenant.
- Cron que pisa pagos.
- Métricas presentadas como ingresos reales cuando incluyen pagos simulados.
- Webhooks sin trazabilidad económica.

## 22. Veredicto

**DIAGNÓSTICO CONFIRMADO CON CORRECCIONES.**

El diagnóstico de Claude identifica correctamente los riesgos centrales del código actual. Sus principales ajustes necesarios son:

- No llamar idempotente al webhook completo solo porque Payment tiene upsert.
- No usar únicamente data.id o x-request-id como clave universal de evento.
- No tratar una ventana HMAC como sustituto de ledger e idempotencia.
- No clasificar toda la deuda de observabilidad y reconciliación como bloqueante de igual severidad que replay y atomicidad.

## 23. Preparación actual

**REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN.**

Mercado Pago está implementado en código y configurado localmente por nombres de variables, pero no hay evidencia en el repositorio para clasificarlo como validado en sandbox, desplegado en producción u operativo con pagos reales.

Validaciones ejecutadas durante esta revisión:

- npx tsc --noEmit: correcto.
- npm run lint: correcto.
- git status, git diff, inspección del commit y búsqueda estática: correctos según el alcance.
- No se ejecutó Prisma.
- No se ejecutó npm test.
- No se ejecutó build.
- No se levantó el servidor.
- No se conectó PostgreSQL.
- No se llamó a Mercado Pago.
- No se modificaron variables.
- No se hicieron commits ni push.

El alcance mínimo antes de cobrar dinero real es cerrar F1-01, F1-02, F1-03, F1-04, F1-06, F1-07 y F1-08 con pruebas de base de datos y mocks de fetch. F1-05 debe cerrarse antes de presentar métricas financieras. F1-09 debe tener alerta o reconciliación antes de permitir cambios de unidades con cobro recurrente.


