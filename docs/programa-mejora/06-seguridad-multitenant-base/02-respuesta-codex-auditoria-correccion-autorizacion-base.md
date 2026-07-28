# FASE 3A - Base de autorizacion y aislamiento multi-tenant

## 1. Estado inicial

HEAD inicial: `2961225 feat(billing): add durable notification outbox`. El working tree y el indice estaban limpios antes de guardar el documento 01. No habia cambios pendientes de fases anteriores; entorno, paquetes, schema y migraciones estaban intactos.

## 2. Diagnostico

NextAuth usa JWT. El callback consulta `User` y carga `id`, `role`, `tenantId`, actividad, estado del tenant, suscripcion, ubicacion y onboarding; la sesion expone esos campos. El middleware Edge solo puede usar claims de la cookie. Las APIs llaman `auth()`, pero la autorizacion estaba distribuida entre comparaciones directas de `session.user.role`, `getTenantIdFromSession()` y `getTenantAccessResponse()`.

El defecto central estaba en `refreshTenantAccessForUser`: solo refrescaba actividad/licencia, conservaba `role` y `tenantId` del JWT y, si el usuario habia sido eliminado, reutilizaba el valor anterior de `isActive`. Por ello una sesion antigua podia conservar privilegios o conjunto y el borrado era fail-open. Las rutas globales SUPER_ADMIN tambien confiaban directamente en el claim.

## 3. Vulnerabilidades encontradas

- **Alta:** usuario eliminado podia superar el control comun por fallback a claims antiguos.
- **Alta:** reduccion de rol o cambio de tenant no se revalidaban de forma comun antes de usar `session.user.role/tenantId`.
- **Alta:** rutas SUPER_ADMIN representativas autorizaban solo con el rol del JWT.
- **Media:** helpers duplicados y errores inconsistentes dificultaban una politica fail-closed.
- **Media:** riesgo IDOR si un modulo consulta un recurso solo por `id`; varios modulos ya usan `id + tenantId`, pero no existia un contrato reutilizable obligatorio.

## 4. Correcciones realizadas

Se creo una capa pura y testeable de autorizacion, un adaptador Prisma y un adaptador de respuestas HTTP. La identidad se reconstruye desde `userId` autenticado y la base actual. Usuario inexistente, inactivo, rol invalido, falta de tenant o licencia bloqueada fallan cerrados.

`getTenantAccessResponse()` ahora usa la capa comun y rechaza si los claims de rol o tenant no coinciden con la identidad actual. El helper historico tambien refresca rol/tenant y marca como inactivo al usuario eliminado.

Se migraron dos rutas representativas:

- `GET /api/platform/tenant-users`: SUPER_ADMIN se revalida en DB y el target tenant debe ser explicito y existir.
- `GET/PATCH/DELETE /api/users/[id]`: ADMIN se revalida en DB y toda consulta/operacion deriva `tenantId` de la identidad autorizada.

## 5. Contrato comun

- `requireAuthenticatedUser()`
- `requireActiveTenantUser()`
- `requireTenantRole(...)`
- `requireSuperAdmin()`
- `requireSuperAdminTenantTarget()`
- `assertSameTenant()`
- `tenantScopedWhere()`
- `assertSessionClaimsCurrent()`

La identidad resultante contiene `userId`, rol, `tenantId`, estado del tenant y estado de suscripcion. El cliente puede aportar un target, pero nunca evidencia de autorizacion.

## 6. Sesiones obsoletas

La base prevalece sobre JWT para las operaciones migradas. Usuario eliminado o inactivo pierde acceso; rol reducido no conserva ADMIN/SUPER_ADMIN; cambio de tenant usa la relacion actual y el tenant anterior se rechaza. Las rutas antiguas que llaman `getTenantAccessResponse()` reciben ademas un rechazo si sus claims quedaron desactualizados.

No se implemento revocacion global del JWT: la revalidacion por operacion cubre la frontera API migrada. El middleware Edge sigue usando claims para navegacion y no debe considerarse control suficiente del backend.

## 7. SUPER_ADMIN

Puede existir activo sin tenant. Para actuar sobre un conjunto usa `requireSuperAdminTenantTarget(session, targetTenantId)`: no hay fallback al tenant de sesion, el target es obligatorio y se valida en DB. No se habilito impersonacion.

## 8. Roles tenant y matriz base

| Accion base | SUPER_ADMIN | ADMIN | CONSEJO | RESIDENTE |
| --- | --- | --- | --- | --- |
| Entrar al panel global | Si | No | No | No |
| Operar dentro de tenant | Target explicito | Si, su tenant | Solo lectura | Autoservicio propio |
| Administrar usuarios | Target explicito | Su tenant | No | No |
| Leer auditoria | Global | Su tenant | Su tenant, lectura | No |
| Actuar como residente | No impersona | No impersona | No | Si |
| Acciones administrativas | Plataforma/target | Su tenant | No | No |
| Tenant suspendido/cancelado | Si, supervision | No | No | No |

Roles tenant permitidos: ADMIN, CONSEJO y RESIDENTE. Estados permitidos por la politica existente: TRIAL, ACTIVE y GRACE_PERIOD. PENDING_PAYMENT, SUSPENDED y CANCELLED bloquean por tenant o suscripcion.

## 9. Aislamiento

`tenantScopedWhere(identity, resourceId)` genera `{ id, tenantId }` desde la identidad del servidor. `assertSameTenant()` devuelve siempre `RESOURCE_NOT_FOUND` para recurso ausente o cross-tenant, sin revelar su existencia. SUPER_ADMIN no puede usar estos helpers como fallback ambiguo y debe validar un target explicito.

La ruta representativa de usuarios conserva consultas `findFirst({ id, tenantId })`; PATCH/DELETE pasan el tenant autorizado al servicio, que vuelve a resolver el objetivo dentro de ese tenant.

## 10. Errores

Se centralizaron `UNAUTHENTICATED`, `USER_INACTIVE`, `TENANT_REQUIRED`, `TENANT_INACTIVE`, `FORBIDDEN` y `RESOURCE_NOT_FOUND`, con estados 401/403/404 y mensajes publicos sin stack, email, sesion, Prisma ni datos del recurso cross-tenant.

## 11. Archivos modificados

- `src/lib/authorization-core.ts`
- `src/lib/authorization.ts`
- `src/lib/authorization-response.ts`
- `src/lib/tenant-access-response.ts`
- `src/domains/organizations/tenant.service.ts`
- `src/domains/platform/permissions.ts`
- `src/app/api/platform/tenant-users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `tests/unit/authorization.test.ts`
- Documentos 01 y 02 de esta fase.

No se modificaron auth config, middleware, schema, migraciones, billing, UI, paquetes ni entorno.

## 12. Pruebas especificas

`node --import tsx --test tests/unit/authorization.test.ts`: **22/22 PASS**, sin skip/fail/todo. Cubren los 20 casos obligatorios y adicionalmente target explicito SUPER_ADMIN y bloqueo por suscripcion suspendida. El primer intento no inicio pruebas por `spawn EPERM` del sandbox; la unica ejecucion efectiva paso fuera de esa restriccion. No se uso PostgreSQL porque las decisiones, stale claims y filtros tenant-scoped se demostraron deterministicamente con repositorio inyectado.

## 13. Typecheck y lint

- `npx tsc --noEmit`: PASS, una ejecucion.
- `npm run lint`: PASS, cero warnings/errores, una ejecucion.

## 14. Suite completa

No se ejecuto. La fase exige eficiencia y la base remota sigue sin estar fisicamente separada; las pruebas especificas son puras y quedaron verdes.

## 15. Riesgos restantes

- El middleware usa JWT por limitacion Edge; solo protege navegacion, no sustituye revalidacion API.
- Rutas no migradas que no usan `getTenantAccessResponse()` pueden seguir confiando directamente en claims.
- Los servicios internos no reciben automaticamente identidad; cada modulo debe adoptar el contrato al revisar sus fronteras.
- La base de pruebas debe separarse antes de una validacion completa de produccion.

## 16. Modulos a migrar despues

- PQRS, evidencias, fotos y uploads.
- Invitaciones y usuarios collection.
- Dashboard, actividad, reportes y exportaciones.
- Perfil, avatar y cambio de password.
- Tenant/configuracion y soporte.
- Notificaciones.
- Rutas restantes de plataforma SUPER_ADMIN.
- Billing checkout solo durante su auditoria especifica, sin reabrir la logica cerrada.
- Onboarding y cualquier server action futura.

## 17. Recomendacion para Claude

Revisar cada modulo por separado y sustituir checks directos de `session.user.role`/`getTenantIdFromSession()` por el contrato comun. En cada recurso usar `id + authorizedTenantId`, probar IDOR y mantener errores indistinguibles para ausente/cross-tenant. No ampliar middleware como sustituto de seguridad backend.

## 18. Estado

**IMPLEMENTADO CON RIESGOS.**

La infraestructura comun, stale-session handling, SUPER_ADMIN explicito, errores y patron tenant-scoped quedaron implementados y probados. Los riesgos son la migracion deliberadamente pendiente de los demas modulos, no un fallo conocido en la nueva base. No se hizo commit, push ni tags y no se inicio otra subfase.
