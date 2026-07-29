# FASE 8A — Implementación segura de reservas y zonas comunes

## Estado

`IMPLEMENTADO`

Módulo construido desde cero (no existía código previo de reservas/zonas comunes en el repositorio): modelo de datos, migración aditiva, servicios transaccionales, autorización derivada de la membresía activa, prevención de doble reserva a nivel de PostgreSQL, notificaciones, auditoría, rutas API y UI mínima funcional para ADMIN, CONSEJO y RESIDENTE.

## 1. Modelo y migración

Se agregaron tres modelos nuevos a `prisma/schema.prisma`, siguiendo el equivalente pedido:

- **`CommonArea`**: `name`, `description`, `isActive`, `requiresApproval`, `minDurationMinutes`, `maxDurationMinutes`, `maxReservationsPerWeek`, `openingTime`/`closingTime` (`"HH:mm"`), `blockedWeekdays` (`Int[]`, convención `Date.getDay()`: 0=domingo..6=sábado), `rules`. `@@unique([tenantId, name])`.
- **`Reservation`**: `tenantId`, `commonAreaId`, `membershipId`, `createdByUserId`, `startAt`/`endAt`, `status` (enum `ReservationStatus`: `PENDING|APPROVED|REJECTED|CANCELLED`), `notes`, `reviewedByUserId`/`reviewedAt`, `rejectionReason`, `cancelledAt`/`cancelledByUserId`.
- **`CommonAreaBlock`**: `tenantId`, `commonAreaId`, `startAt`/`endAt`, `reason`, `createdByUserId`.

Toda reserva queda ligada a **tenant + zona + membresía del residente + identidad global que ejecutó la acción** (`createdByUserId`), nunca solo a `userId`. Zonas y reservas se persisten en PostgreSQL real; no hay estado en memoria.

**Migración** `prisma/migrations/20260729000100_add_reservations_common_areas/migration.sql`: aditiva (nuevas tablas + 7 valores de `AuditAction` vía `ADD VALUE IF NOT EXISTS`), sin tocar datos existentes. Aplicada con éxito a la base de pruebas vía `npm run test:db:deploy` (runner protegido). No se usó `prisma db push`.

**Prevención de doble reserva a nivel de base de datos** (la pieza más crítica, no representable completamente en `schema.prisma`): la migración crea la extensión `btree_gist` y un **EXCLUDE constraint** sobre `Reservation`:

```sql
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_no_overlap_excl"
EXCLUDE USING gist (
  "commonAreaId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
) WHERE ("status" IN ('PENDING', 'APPROVED'));
```

Nota técnica documentada en la migración: se usa `tsrange` (sin zona horaria), no `tstzrange`, porque las columnas `DateTime` de Prisma son `TIMESTAMP(3)` **sin tz** y siempre se leen/escriben como el instante UTC exacto; usar `tstzrange` forzaría un cast implícito según el `TimeZone` de la sesión de PostgreSQL, reintroduciendo la ambigüedad de zona horaria del servidor que esta fase evita a propósito. Una violación (SQLSTATE `23P01`) se detecta en la capa de servicio por el nombre del constraint en el mensaje del error y se traduce a `SLOT_UNAVAILABLE` (409), sin filtrar SQL/constraint al cliente.

## 2. Permisos

Matriz implementada (`src/domains/reservations/reservation-security.ts`):

| Acción | RESIDENTE | CONSEJO | ADMIN | SUPER_ADMIN |
| --- | --- | --- | --- | --- |
| Listar zonas activas / disponibilidad / calendario de bloqueos | Sí | Sí | Sí | No |
| Crear reserva | Sí (propia membresía) | No | No¹ | No |
| Ver reservas propias | Sí | — | — | — |
| Ver todas las reservas del tenant | No | Sí | Sí | No |
| Aprobar / rechazar | No | No | Sí | No |
| Cancelar propia | Sí | No | — | No |
| Cancelar cualquiera del tenant | No | No | Sí | No |
| Crear/configurar zonas | No | No | Sí | No |
| Crear bloqueos extraordinarios | No | No | Sí | No |

¹ **Decisión de diseño documentada**: la creación de reservas se restringió exclusivamente a RESIDENTE. El prompt especifica explícitamente para RESIDENTE "crear reservas para su propia membresía" y "no reservar para otra membresía", pero no menciona creación para ADMIN. Dado que cada `Reservation.membershipId` debe representar inequívocamente "el residente dueño", permitir que ADMIN cree en nombre de otro introduciría una ambigüedad de identidad no especificada (¿qué residente? ¿con qué membershipId?) fuera del alcance claro del prompt. Se mantiene conservador: ADMIN gestiona (aprueba/rechaza/cancela/configura), RESIDENTE reserva. SUPER_ADMIN no opera reservas (no hay política preexistente que lo requiera); el gate común (`requireActiveTenantUser`) ya lo bloquea con `FORBIDDEN`.

CONSEJO conserva su política existente: solo lectura (zonas, disponibilidad, calendario, listado de reservas del tenant); no puede crear, aprobar, rechazar, cancelar ni configurar.

## 3. Aislamiento multi-tenant

Todas las consultas y mutaciones usan `tenantId` de la **identidad autorizada del servidor** (`requireActiveTenantUser`/`requireTenantRole`, capa común de Fase 3-7), nunca del body/query del cliente. Ninguna operación resuelve un recurso solo por `where: { id }`:

- Zonas: `findFirst({ id, tenantId })` (`getCommonAreaOrThrow`).
- Reservas (lectura/cancelación de RESIDENTE): `{ id, tenantId, membershipId }`.
- Reservas (ADMIN/CONSEJO): `{ id, tenantId }`.
- Bloqueos: siempre resueltos a través de la zona ya validada `{ id, tenantId }`.

Zona/reserva/bloqueo inexistente, de otro tenant o de otra membresía no visible producen la **misma respuesta opaca** (`COMMON_AREA_NOT_FOUND` 404 / `RESERVATION_NOT_FOUND` 404), sin distinguir "no existe" de "existe pero no es tuyo" (pruebas 1, 7, 24, 25, 27, 33).

## 4. Reglas de creación

`createReservation` valida en servidor, dentro de una transacción con el lock de zona ya tomado: zona existe/activa/del tenant, membresía activa+RESIDENTE (`userId`+`tenantId` revalidados, no confía en el llamador), fecha futura, `start < end`, duración mínima/máxima, día de semana permitido, horario de apertura/cierre (sin cruzar medianoche local, por diseño — ver §8 del prompt), ausencia de bloqueo extraordinario, límite semanal, ausencia de solapamiento, longitud de notas. Estado inicial `PENDING` si `requiresApproval`, `APPROVED` si no. Nada de esto se confía al frontend (pruebas 4-12, 19).

## 5. Prevención de doble reserva

Mecanismo de dos capas, ambas activas:

1. **Autoritativa**: el EXCLUDE constraint de PostgreSQL descrito en §1 — imposible crear dos filas `PENDING`/`APPROVED` que se solapen para la misma zona, sin importar la concurrencia real entre procesos.
2. **UX**: un `count()` de solapamiento dentro de la transacción (bajo un `pg_advisory_xact_lock` por `(tenantId, commonAreaId)` que serializa toda escritura de agenda sobre esa zona) da un mensaje de error claro (`SLOT_UNAVAILABLE`) en el caso común sin carrera real.

Semántica `[startAt, endAt)` confirmada: una reserva que termina a las 10:00 permite otra que empieza a las 10:00 (prueba 16, contigüidad). `REJECTED`/`CANCELLED` no bloquean espacio (fuera del filtro `WHERE status IN ('PENDING','APPROVED')`); `PENDING` sí bloquea (pruebas 17, 18, 19). Verificado con **dos inserciones concurrentes reales** vía `Promise.allSettled` contra PostgreSQL: exactamente una gana, la otra recibe `SLOT_UNAVAILABLE`, y la base queda con exactamente una fila activa (prueba 15).

## 6. Límite semanal

Documentado explícitamente en el código (`createReservation`) y aquí:

- **Dimensión**: por **(membresía, zona)** — no por tenant completo. El campo `maxReservationsPerWeek` vive en `CommonArea`, de modo que el límite es "cupo semanal de esta zona para este residente".
- **Inicio de semana**: lunes 00:00:00 hora local de `America/Bogota`; rango `[lunes, lunes siguiente)` calculado con `getWeekRangeUtc` (`src/domains/reservations/reservation-time.ts`).
- **Estados que consumen cupo**: `PENDING` y `APPROVED` (los mismos que ocupan el horario).
- **Seguridad concurrente**: el mismo `pg_advisory_xact_lock` por `(tenantId, commonAreaId)` tomado para la creación serializa el conteo+inserción para esa zona, de modo que dos solicitudes concurrentes del mismo residente no pueden superar el límite (prueba 14, verificado también junto a la prueba de solapamiento concurrente 15).

## 7. Aprobación, rechazo y cancelación

Transiciones válidas implementadas exactamente como se pidió: `PENDING→APPROVED`, `PENDING→REJECTED`, `PENDING→CANCELLED` (vía cancelación), `APPROVED→CANCELLED`. `REJECTED→APPROVED` y `CANCELLED→APPROVED` no existen como camino de código (prueba 22).

`reviewReservation`: solo ADMIN; re-verifica **dentro** de la transacción y **después** de tomar el lock de zona que la reserva sigue `PENDING` (si otro admin ya la resolvió mientras se esperaba el lock, falla con `INVALID_TRANSITION`); al aprobar, re-confirma zona activa, ausencia de bloqueo y ausencia de solapamiento; el CAS final (`updateMany where status:'PENDING'`) es la garantía atómica de "un solo resultado válido" ante dos aprobaciones simultáneas (prueba 21). Guarda actor (`reviewedByUserId`), fecha (`reviewedAt`) y motivo de rechazo cuando aplica, más auditoría (`RESERVATION_APPROVED`/`RESERVATION_REJECTED`).

`cancelReservation`: RESIDENTE cancela únicamente la suya (scope `{id,tenantId,membershipId}` — un ID conocido de otra persona da `RESERVATION_NOT_FOUND`, prueba 24); ADMIN cancela cualquiera de su tenant, nunca de otro (prueba 25); reserva ya `CANCELLED`/`REJECTED` o ya terminada (`endAt<=now`) → `NOT_CANCELLABLE` (409, "resultado controlado", no excepción cruda); no se borra el historial (la fila queda `CANCELLED` con `cancelledAt`/`cancelledByUserId`); cancelar libera automáticamente el horario (fuera del EXCLUDE, pruebas 17/26).

## 8. Bloqueos y configuración

`createCommonAreaBlock`: solo ADMIN, tenant+zona validados, rango y motivo acotados, **rechaza** el bloqueo si se superpone con reservas `PENDING`/`APPROVED` vigentes (`BLOCK_CONFLICTS_WITH_RESERVATIONS`, prueba 37) — política elegida entre las tres del prompt: nunca se cancela una reserva en silencio; el ADMIN debe cancelarla explícitamente primero.

`updateCommonArea`: whitelist estricta (`assertAllowedKeys`) — cualquier campo fuera de la lista (incluido un intento de `tenantId` en el patch) da `INVALID_INPUT` (prueba 28). Valida coherencia (mín≤máx, apertura<cierre, límites positivos, weekdays 0-6, nombre no vacío). Cambiar configuración no altera reservas históricas (no hay relación inversa que las modifique).

## 9. Disponibilidad

`getAvailability`: valida zona+tenant, rango (`from<to`, ancho máximo `62` días → `RANGE_TOO_WIDE`, prueba 30), devuelve **únicamente** `{startAt, endAt}` de reservas ocupantes y `{startAt, endAt, reason}` de bloqueos — sin `membershipId`, `notes` ni datos del residente (prueba 29, verificado con `JSON.stringify` de la respuesta completa). Un residente puede saber que un horario está ocupado, no quién lo reservó.

## 10. Notificaciones y auditoría

Se extendió `NotificationTypes` (`notification.service.ts`) con `RESERVATION_CREATED/APPROVED/REJECTED/CANCELLED` (el campo `type` de `Notification` es `String` libre; no requirió migración). Eventos:

- **Creación pendiente**: notifica a todos los ADMIN activos del tenant (`createNotificationIdempotent`, `dedupeKey` por reserva+admin — sin duplicados por retry).
- **Aprobación/rechazo**: notifica y envía correo (`sendEmailSafe`+`renderEmailLayout`, HTML escapado con `escapeReservationHtml`) al residente dueño.
- **Cancelación por ADMIN**: notifica al residente (si el propio residente cancela, no se autonotifica).

Ambos destinatarios exigen `TenantMembership.isActive` **y** `User.isActive` (mismo patrón que cerró la regresión de Fase 6A); una membresía/cuenta inactiva no recibe nada (prueba 32), y los destinatarios de otro tenant nunca reciben la notificación (prueba 31). Todo el envío ocurre **después** del commit de la transacción principal (nunca hay transacción DB abierta durante el correo); un fallo de notificación nunca revierte la reserva ya confirmada (`.catch(() => null)` best-effort).

Auditoría (`registerAuditLog`, dentro de la misma transacción de cada mutación): `RESERVATION_CREATED/APPROVED/REJECTED/CANCELLED`, `COMMON_AREA_CREATED/UPDATED`, `COMMON_AREA_BLOCK_CREATED`. Metadata mínima (`commonAreaId`, `status`/`decision`, `fields` modificados) — nunca notas completas, teléfono, correo ni contenido privado.

## 11. Compatibilidad con UI

No existía ninguna UI ni dato mock previo de reservas en el repositorio (módulo enteramente nuevo), por lo que no había nada que "reconectar"; se construyó una UI funcional mínima reutilizando los patrones/tokens de diseño existentes, sin rediseñar el resto de la aplicación:

- **ADMIN** (`/admin/reservas`): pestañas "Reservas" (filtro por estado, aprobar/rechazar con motivo, cancelar) y "Zonas comunes" (crear zona con todos los campos de configuración, activar/desactivar). Entrada añadida a `ADMIN_NAV`.
- **CONSEJO** (`/consejo/reservas`): solo lectura — zonas y calendario de reservas filtrable por estado. Entrada añadida a `CONSEJO_NAV`.
- **RESIDENTE** (`/residente/reservas`): selector de zona con su horario/reglas, formulario de reserva (fecha/hora/duración/nota), listado de "mis reservas" con cancelación. Se agregó **una sola entrada nueva** al `bottomNav` existente de `/residente/page.tsx` (`{ key:'reservas', onClick: () => router.push('/residente/reservas') }`) sin tocar ninguna lógica de estado/tabs ya existente — la navegación de PQRS/notificaciones/perfil/ayuda queda intacta.

El middleware ya cubre `/admin/reservas` y `/consejo/reservas` mediante sus matchers existentes `/admin/:path*` y `/consejo/:path*` (confirmado por inspección de `src/middleware.ts`); no requirió cambios. El selector de conjunto (`TenantSwitcher`) no se tocó y sigue funcionando igual en todas las pantallas nuevas (heredado de `AdminShell`/`ResidentShell`).

## 12. Archivos modificados

**Nuevos:**
- `prisma/migrations/20260729000100_add_reservations_common_areas/migration.sql`
- `src/domains/reservations/reservation-time.ts`
- `src/domains/reservations/reservation-security.ts`
- `src/domains/reservations/reservation.service.ts`
- `src/app/api/reservas/route.ts`, `[id]/route.ts`, `[id]/revisar/route.ts`, `[id]/cancelar/route.ts`
- `src/app/api/reservas/zonas/route.ts`, `[id]/route.ts`, `[id]/disponibilidad/route.ts`, `[id]/bloqueos/route.ts`
- `src/app/admin/reservas/page.tsx`, `src/app/consejo/reservas/page.tsx`, `src/app/residente/reservas/page.tsx`
- `tests/unit/reservation-time.test.ts`, `tests/unit/reservation-security.test.ts`, `tests/reservation-integration.test.ts`
- Documentos 01 y 02 de esta fase.

**Modificados:**
- `prisma/schema.prisma` (nuevos modelos/enum + relaciones en `Tenant`/`User`/`TenantMembership` + 7 valores de `AuditAction`).
- `src/domains/notifications/notification.service.ts` (4 claves nuevas en `NotificationTypes`, sin cambio de esquema).
- `src/lib/design/adminNav.ts`, `src/lib/design/consejoNav.ts` (una entrada de navegación cada uno).
- `src/app/residente/page.tsx` (import de `useRouter` + una entrada en `bottomNav`; ninguna otra línea tocada).

No se modificó autenticación, membresías, PQRS, invitaciones, billing, ni ningún archivo fuera de esta lista.

## 13. Pruebas focalizadas

- **Puras** (`tests/unit/reservation-time.test.ts` + `reservation-security.test.ts`): **24/24 PASS** — conversión de zona horaria (offset fijo UTC-5 de Bogotá, ida y vuelta), cálculo de semana ISO, parseo `HH:mm`, roles, normalizadores (nombre, duración, horario, weekdays, límite semanal, notas, motivos), whitelist estricta, mapeo de errores sin fuga de detalles, escape HTML.
- **PostgreSQL real** (`tests/reservation-integration.test.ts`): **37/37 PASS** — los 36 escenarios pedidos más una prueba adicional de bloqueo-vs-reserva-activa (§8). Incluye las dos pruebas de concurrencia real contra la base (dos creaciones solapadas → una gana; dos aprobaciones simultáneas → un solo resultado válido) y aislamiento multi-tenant/multi-membresía verificado con datos reales, no mockeados.

Nota sobre el ítem 33 del prompt ("error inesperado genérico"): la prueba de integración 33 demuestra que un ID de reserva inexistente produce `RESERVATION_NOT_FOUND` controlado (no una excepción cruda); el caso de un error *verdaderamente* inesperado (p. ej. un fallo de Prisma no relacionado con reglas de negocio) cayendo al genérico `{status:500}` está cubierto por la prueba pura 14 de `mapReservationError` — no se intentó inyectar un fallo real de infraestructura en PostgreSQL de pruebas para ese caso específico, siguiendo la misma práctica de fases anteriores.

## 14. Suite completa

Ejecutada **una sola vez**, con el runner protegido (`npm test`), sobre el estado final (migración ya aplicada, pruebas focalizadas verdes):

```
tests 571 · pass 571 · fail 0 · cancelled 0 · skipped 0 · todo 0 · exit 0
```

No hubo fallos; no se repitió la suite.

## 15. Riesgos restantes

| Riesgo | Severidad | Nota |
| --- | --- | --- |
| Zona horaria centralizada como constante (`America/Bogota`), no columna por tenant | Bajo | Documentado como decisión deliberada (ver §1 de la migración); si el producto se expande a otro país, agregar `Tenant.timezone` es un cambio aditivo simple que este módulo ya está preparado para consumir (toda la lógica pasa `timeZone` como parámetro). |
| ADMIN no puede crear reservas en nombre de un residente | Bajo / decisión de producto | Documentado en §2. Si el negocio lo requiere, es una extensión aditiva futura (requeriría que el ADMIN seleccione explícitamente la membresía objetivo). |
| Bloqueos con reservas activas se rechazan en vez de ofrecer cancelación asistida | Bajo / decisión de producto | Evita cancelar reservas en silencio (requisito explícito del prompt); un flujo de "cancelar y bloquear" en un solo paso quedaría para una iteración de UX futura si se desea. |
| UI construida desde cero con estilo funcional, no pulida a nivel visual de las pantallas más maduras (PQRS, facturación) | Informativo | El prompt permitía "no rediseñar" precisamente porque no existía nada previo que preservar; se priorizó completitud funcional y seguridad sobre pulido visual. |
| Sin prueba de fallo de infraestructura real (Prisma/red) para el camino 500 genérico | Bajo | Cubierto a nivel de mapeo puro (prueba 14); coherente con el resto del proyecto, que no simula fallos de conectividad reales en pruebas de integración. |

Ninguno de estos riesgos bloquea el cierre de esta fase.

## 16. Cierre

No se hizo commit, push ni tags. No se modificó lógica de cuenta global, invitaciones, PQRS ni billing. No se usó `prisma db push`. No se inició otro módulo.

Estado final: `IMPLEMENTADO`.
