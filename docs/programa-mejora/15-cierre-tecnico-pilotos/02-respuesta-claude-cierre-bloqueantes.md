# FASE R1 — Informe final: cierre técnico mínimo para los primeros pilotos

## 1. Notificaciones de pago SaaS

Nuevos eventos `SAAS_PAYMENT_APPROVED`/`SAAS_PAYMENT_REJECTED` añadidos a `BillingOutboxEventType`, reutilizando **exactamente** la infraestructura durable ya construida en fases previas (`BillingNotificationOutbox`/`BillingOutboxAttempt`/`EmailLog`, con reintentos, backoff y recuperación de filas abandonadas) — no se creó ningún mecanismo nuevo de entrega.

Se conectaron los tres caminos reales donde el pago de la licencia se confirma:

- **Mercado Pago (webhook)** — `src/domains/billing/mercado-pago.service.ts`: el evento `SAAS_PAYMENT_APPROVED` se crea dentro de la misma transacción que aplica el efecto económico (`effectApplied === true`), nunca en el reintento "APPROVED repetido". El evento `SAAS_PAYMENT_REJECTED` se crea solo la primera vez que un `Payment` específico (identificado por `mercadoPagoPaymentId`, único) queda persistido como `REJECTED` — nunca para `PENDING` (resultado ambiguo, requisito explícito del prompt), y es independiente de si ese mismo webhook logró o no mover la suscripción a `GRACE_PERIOD` (puede haber cobertura vigente por otro lado).
- **Pago simulado registrado por SUPER_ADMIN** (`renewSubscriptionWithSimulatedPayment`) y **cortesía** (`grantCourtesyExtension`) — ambos en `billing.service.ts`, refactorizados para crear el `Payment` como paso explícito (antes iba anidado dentro del `update` de `Subscription`) y así poder usar `payment.createdAt` como `boundary` estable del evento de notificación.

**Idempotencia frente a reintentos de webhook**: la clave de deduplicación del outbox (`buildBillingOutboxDedupeKey`) se construye con `subscriptionId + eventType + boundary + recipientUserId + channel`. Se usa `payment.createdAt` como `boundary` — estable porque el `Payment` es idempotente por `mercadoPagoPaymentId` único (la misma fila se reutiliza en cada reintento vía `upsert`), así que un reintento del mismo webhook nunca genera una segunda fila de notificación. Verificado con dos envíos del mismo pago aprobado (test 3): sigue habiendo exactamente 2 filas de outbox (IN_APP + EMAIL), no 4.

**Destinatarios**: ADMIN activos del tenant, con `User.isActive` y `TenantMembership.isActive` — reutiliza sin cambios el filtro que ya usa `createBillingOutboxIntentsForTransition` para gracia/suspensión. Verificado que un ADMIN de otro tenant no recibe nada (test 6) y que una membresía ADMIN inactiva no genera ninguna fila (test 7, `noActiveRecipients`).

**Contenido**: `getBillingOutboxContent` (`billing-outbox-policy.ts`) nunca expone el mensaje crudo del proveedor. El mensaje de aprobación confirma solo lo que el proveedor confirmó (aprobado + fecha de cobertura si está disponible, vía un nuevo campo opcional `periodEndsAt` en el payload del outbox); el de rechazo es genérico ("revisa tu medio de pago o contacta a la administración comercial... consulta el estado actual de tu acceso"), sin IDs internos ni datos bancarios.

## 2. Workflow simple y de mantenimiento

Se agregó `Tenant.pqrsWorkflowType` (enum `SIMPLE`/`MAINTENANCE`, default `MAINTENANCE`) y **`Pqrs.workflowType`** como snapshot inmutable tomado al crear cada PQRS. Esta es la decisión central de diseño, explícitamente preferida por el propio prompt: cambiar la configuración del tenant **nunca** afecta casos ya creados, porque cada PQRS decide sus transiciones válidas con su propio `workflowType`, no con el del tenant en ese momento. Verificado explícitamente (test 12): una PQRS creada bajo `SIMPLE` conserva `SIMPLE` después de que el tenant cambia a `MAINTENANCE`; una PQRS nueva creada después ya usa `MAINTENANCE`.

El grafo de transiciones válidas de `faseActual` quedó parametrizado por plantilla en `src/domains/pqrs/pqrs-workflow.service.ts` (`VALID_NEXT_FASE_BY_WORKFLOW`):

```text
MAINTENANCE: 0→[1], 1→[2,3], 2→[4], 3→[4], 4→[5]   (sin cambios de comportamiento)
SIMPLE:      0→[1], 1→[5]                            (una fase generica de gestion, cierra directo)
```

`src/app/api/pqrs/[id]/route.ts` (endpoint `actualizarFase`) usa este grafo en vez de la constante hardcodeada anterior, y salta por completo la exigencia de elegir INSUMOS/PROVEEDOR cuando `pqrs.workflowType === "SIMPLE"`. No se construyó ningún editor de flujos: son dos grafos fijos, elegidos por tenant. `ADMIN` configura la plantilla de su propio conjunto vía `PATCH /api/tenant/pqrs-workflow` (tenant siempre derivado de la sesión, nunca del cliente), con un control mínimo agregado en `admin/configuracion`. Historial (`HistorialPqrs`) y auditoría (`AuditAction.TENANT_UPDATED` con `metadata.field: "pqrsWorkflowType"`) se conservan sin cambios.

No se tocó nada de descripción, ubicación, duplicados ni evidencias (explícitamente fuera de alcance por el prompt).

## 3. Soporte visible para ADMIN

`SupportTicketCategory` ganó 4 valores nuevos (`TECHNICAL`, `ACCESS`, `PRIVACY_SECURITY`, `BILLING`); los 4 anteriores (`TECNICO`/`FACTURACION`/`CUENTA`/`OTRO`) se conservan en el enum solo por compatibilidad con filas históricas — el código nuevo nunca los asigna. `BILLING` es exclusiva de ADMIN; RESIDENTE y CONSEJO solo ven `TECHNICAL`/`ACCESS`/`PRIVACY_SECURITY` (`allowedSupportCategoriesForRole`, `src/domains/support/support-ticket.service.ts`), validado en el servidor (`isAllowedSupportCategory`) — una categoría fuera del set permitido para el rol se rechaza con 400.

Nueva función `listSupportTicketsForTenantAdmin({tenantId})`: ADMIN ve todos los tickets de **su** tenant (propios y de sus residentes/consejo), siempre tenant-scoped desde la sesión — nunca cross-tenant (test 16). Sigue siendo **solo lectura**: responder/cerrar sigue siendo exclusivo de SUPER_ADMIN vía `respondToSupportTicket`, sin ningún cambio en esa función ni en su ruta. RESIDENTE/CONSEJO conservan exactamente su alcance anterior (solo lo propio, test 17). `listSupportTicketsForSuperAdmin` ganó un filtro `tenantId` opcional (test 18) y el panel de Super Admin ganó un campo de filtro por nombre de conjunto.

Se añadió el texto de orientación exigido ("Los problemas operativos del conjunto... deben registrarse como PQRS. Este canal es únicamente para problemas técnicos de la plataforma.") en las tres pantallas de Ayuda (admin, consejo, residente), y el ADMIN ahora ve quién de su conjunto creó cada ticket ("Por {nombre}").

## 4. Exportación y reactivación

**Exportación** (`src/domains/platform/tenant-export.service.ts`, `GET /api/platform/tenants/[id]/export`, SUPER_ADMIN únicamente, target del path — nunca del body): genera un XLSX (reutilizando `exceljs`, ya dependencia del proyecto — no se agregó ninguna nueva) con tres hojas: `PQRS` (número, título, categoría, estado, bloque/apto, fechas, creador por id+nombre, nombres de evidencias sin ruta de storage), `PQRS_Historial` (transiciones de estado con nota) y `Usuarios` (nombre, email, rol, membresía activa, bloque, apto, fecha de alta). Nunca incluye password/hash/token/sessionVersion/service-role key/connection strings/AuditLog completo — verificado explícitamente (test 20) que ningún valor de contraseña aparece en el archivo generado. Sin archivos binarios (solo nombres/identificadores de evidencias). Límite defensivo (`MAX_EXPORT_PQRS_ROWS=5000`, `MAX_EXPORT_USERS_ROWS=2000`): si se supera, error controlado `EXPORT_TOO_LARGE` (409) en vez de cargar un volumen arbitrario en memoria — no se generó un dataset de 5000+ filas real para probar este límite (costo desproporcionado para 3 pilotos), documentado como riesgo residual en §9. Cada exportación queda auditada (`AuditAction.REPORT_EXPORTED`, ya existente en el enum).

**Reactivación**: `updateTenantStatusForSuperAdmin` (backend) ya soportaba `CANCELLED → ACTIVE` sin cambios (solo exige evidencia de pago/cortesía vigente, sin importar el estado previo del tenant) — el hallazgo de la fase R0 era exclusivamente que faltaba el botón. Se corrigieron las 3 ternarias de la UI del panel de Super Admin (`t.group === 'suspended' ? reactivate : suspend`) a un helper `canReactivate(group)` que también incluye `'cancelled'`. Verificado con PostgreSQL real (test 23): un tenant cancelado con evidencia de pago vigente (creada con `grantCourtesyExtension`) se reactiva, `cancelledAt` vuelve a `null`, y el conteo de `Subscription` no cambia (se actualiza la misma fila, nunca se duplica). Reactivar sin evidencia vigente sigue fallando (test 24, comportamiento preexistente).

## 5. Modelo y migración

Migración aditiva `prisma/migrations/20260731000100_add_pilot_readiness/migration.sql`, aplicada con `npm run test:db:deploy` (runner protegido, no `db push`):

- `BillingOutboxEventType` += `SAAS_PAYMENT_APPROVED`, `SAAS_PAYMENT_REJECTED`.
- Nuevo enum `PqrsWorkflowType` (`SIMPLE`, `MAINTENANCE`).
- `Tenant.pqrsWorkflowType` (default `MAINTENANCE`) y `Pqrs.workflowType` (default `MAINTENANCE`) — el default garantiza que todo conjunto y toda PQRS existente conserva el comportamiento actual sin ninguna migración de datos adicional.
- `SupportTicketCategory` += `TECHNICAL`, `ACCESS`, `PRIVACY_SECURITY`, `BILLING`.
- Bloqueante 4 no requirió cambios de schema (reutiliza modelos y `AuditAction.REPORT_EXPORTED` ya existentes).

## 6. Archivos modificados/creados

**Creados:**
- `prisma/migrations/20260731000100_add_pilot_readiness/migration.sql`
- `src/domains/pqrs/pqrs-workflow.service.ts`
- `src/domains/platform/tenant-export.service.ts`
- `src/app/api/tenant/pqrs-workflow/route.ts`
- `src/app/api/platform/tenants/[id]/export/route.ts`
- `tests/pilot-readiness-integration.test.ts`, `tests/unit/pqrs-workflow.test.ts`, `tests/unit/support-ticket-categories.test.ts`
- `docs/programa-mejora/15-cierre-tecnico-pilotos/01-prompt-claude-cierre-bloqueantes.md`, `02-respuesta-claude-cierre-bloqueantes.md`

**Modificados:**
- `prisma/schema.prisma`
- `src/domains/billing/billing-outbox-policy.ts`, `billing-outbox.service.ts`, `billing.service.ts`, `mercado-pago.service.ts`
- `src/domains/notifications/notification.service.ts` (2 constantes nuevas)
- `src/domains/support/support-ticket.service.ts`
- `src/app/api/pqrs/route.ts`, `src/app/api/pqrs/[id]/route.ts`
- `src/app/api/support-tickets/route.ts`, `src/app/api/platform/support-tickets/route.ts`, `src/app/api/tenant/route.ts`
- `src/app/admin/pqrs/page.tsx`, `src/app/admin/configuracion/page.tsx`, `src/app/admin/ayuda/page.tsx`
- `src/app/consejo/ayuda/page.tsx`, `src/app/residente/page.tsx`
- `src/app/(protected)/super-admin/page.tsx`

No se tocó autenticación, membresías, reservas, pagos de residentes, cuenta global ni ningún otro módulo fuera de los cuatro bloqueantes.

## 7. Pruebas focalizadas

- **7 pruebas puras**: `tests/unit/pqrs-workflow.test.ts` (3, valida el grafo de transiciones por plantilla), `tests/unit/support-ticket-categories.test.ts` (4, valida las categorías permitidas por rol).
- **24 pruebas de integración con PostgreSQL real** (`tests/pilot-readiness-integration.test.ts`): las 24 pruebas cubren los "caminos obligatorios" de los 4 bloqueantes (pago aprobado/rechazado/duplicado/simulado/cortesía/cross-tenant/membresía inactiva/ambiguo; configuración y snapshot inmutable de workflow; visibilidad de soporte por rol incluyendo cross-tenant y filtro de Super Admin; exportación con contenido correcto y sin secretos; reactivación con y sin evidencia). Todas verdes en la primera corrida.

**Nota de alcance sobre autenticación**: las validaciones de autorización de las nuevas rutas (`ADMIN`-only, tenant siempre derivado de la sesión, nunca del cliente) siguen el mismo patrón ya auditado y probado extensivamente en las fases 06-10 (`requireTenantRole`/`session.user.role`/`getTenantIdFromSession`). No existe en este repositorio ningún precedente de pruebas que mockeen `auth()` de NextAuth para invocar un route handler directamente, y crear esa infraestructura estaba fuera del alcance de esta fase ("no reaudites autenticación"). Por eso las pruebas de integración validan la lógica de negocio real (los servicios) en vez de las rutas HTTP completas — la capa de autorización que las envuelve es idéntica, línea por línea, a la de cualquier otro endpoint ya cubierto en fases anteriores.

## 8. Suite completa

Ejecutada una sola vez con el runner protegido (`npm test`):

```
tests 672 · pass 672 · fail 0 · cancelled 0 · skipped 0 · todo 0 · exit 0
```

(638 pruebas preexistentes + 34 nuevas de esta fase, todas verdes; no hubo que repetir la suite).

## 9. Riesgos restantes

- **Límite de exportación no probado con datos reales**: `MAX_EXPORT_PQRS_ROWS`/`MAX_EXPORT_USERS_ROWS` son comparaciones simples ya verificadas por lectura de código, pero no se generó un tenant con miles de filas reales para confirmar el comportamiento en ese límite exacto — bajo riesgo para 3 pilotos (ningún conjunto real se acerca a ese volumen todavía).
- **`SAAS_PAYMENT_REJECTED` no siempre coincide con la entrada real a periodo de gracia**: el aviso de rechazo se dispara independientemente de si ese webhook específico logró mover la suscripción a `GRACE_PERIOD` (puede haber cobertura vigente por otro lado); esto es intencional (el ADMIN debe saber que un pago fue rechazado aunque su acceso no se vea afectado todavía), pero vale la pena confirmarlo con el primer caso real.
- **Filtro de soporte por tenant en Super Admin es solo client-side** (sobre la lista ya cargada, sin round-trip al nuevo parámetro `tenantId` de la API) — suficiente para el volumen de 3 pilotos, pero no aprovecha aún el filtro de servidor ya construido y probado.
- **Sin editor de flujo más allá de SIMPLE/MAINTENANCE**: si algún piloto necesita una variante intermedia, requiere una decisión de producto explícita antes de tocar código — correctamente pospuesto por el propio prompt.

## 10. Estado final

`IMPLEMENTADO`

No se hizo commit. No se inició otro módulo.
