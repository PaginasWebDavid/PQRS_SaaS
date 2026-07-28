# FASE 6A - INFORME DE IMPLEMENTACION BASE MULTI-CONJUNTO

## Estado

`IMPLEMENTADO CON MIGRACION TRANSITORIA`

La arquitectura permite una identidad global por email y multiples membresias independientes por conjunto. La autorizacion tenant ya se reconstruye desde PostgreSQL y no confia en `User.tenantId` o `User.role` para conceder acceso tenant.

## 1. Modelo implementado

Se agrego `TenantMembership` con:

- `id`, `userId`, `tenantId`, `role`, `isActive`.
- Datos por conjunto: `bloque`, `apto`, `haCorregidoUbicacion`, `bloqueAptoEditado`, `onboardingCompletedAt` y `notifyNewPqrsEmail`.
- Relaciones con `User` y `Tenant`, ambas con borrado en cascada.
- Unicidad `userId + tenantId`.
- Indices por tenant/rol y usuario/estado.
- Restriccion SQL que impide crear una membresia `SUPER_ADMIN`.

`User` conserva la identidad global: email, nombre, password, imagen, telefono y estado global de la cuenta.

## 2. Migracion y backfill

Se creo la migracion aditiva:

`prisma/migrations/20260728000100_add_tenant_memberships/migration.sql`

La migracion:

1. Crea la tabla e indices.
2. Copia a una membresia cada usuario legacy asociado a un tenant.
3. Copia rol, estado, ubicacion, onboarding y preferencia de notificacion.
4. Excluye a `SUPER_ADMIN`.
5. Conserva temporalmente las columnas legacy para permitir despliegue compatible.
6. Usa `ON CONFLICT` para que el backfill sea tolerante a membresias ya creadas.

La migracion fue aplicada correctamente mediante el runner protegido a la base PostgreSQL de pruebas. No se uso `prisma db push`.

## 3. Contexto de sesion

La sesion separa:

- identidad global: `userId`;
- seleccion: `selectedTenantId` y `selectedMembershipId`;
- rol efectivo de la membresia seleccionada;
- cantidad de membresias activas.

Cada callback JWT reconstruye el contexto desde DB. Los claims previos solo sirven como preferencia de seleccion y nunca como prueba suficiente de permisos.

Reglas implementadas:

- `SUPER_ADMIN`: contexto global sin membresia.
- Cero membresias activas: sin acceso tenant.
- Una membresia activa: seleccion automatica.
- Varias membresias: exige seleccion valida; no elige el primer tenant.
- Membresia revocada o rol cambiado: efecto en el siguiente request sensible.

## 4. Seleccion de tenant

Se agrego `POST /api/me/tenant`.

El endpoint:

- autentica al usuario;
- valida una membresia activa por `userId + tenantId`;
- no acepta rol desde el cliente;
- responde de forma opaca para tenant inexistente o ajeno;
- guarda la seleccion en cookie `HttpOnly`, firmada con HMAC y vinculada al usuario;
- devuelve solo contexto sanitizado y la ruta de destino.

La cookie alterada, malformada o perteneciente a otro usuario falla cerrada.

## 5. Autorizacion comun

Se adaptaron `requireActiveTenantUser`, `requireTenantRole`, `tenantScopedWhere` y `assertSameTenant` para trabajar con la membresia seleccionada.

El contexto autorizado contiene `userId`, `membershipId`, `tenantId` y `role`. Las APIs sensibles revalidan usuario global, membresia, tenant y suscripcion en DB. El middleware usa claims solo para navegacion.

## 6. Usuarios y membresias

Las rutas administrativas listan y modifican membresias del conjunto seleccionado, manteniendo respuestas compatibles con la UI actual.

Se garantiza:

- ADMIN solo gestiona su conjunto.
- CONSEJO y RESIDENTE quedan bloqueados.
- SUPER_ADMIN requiere target explicito.
- El rol cambia solo en la membresia seleccionada.
- Desactivar una membresia no desactiva el `User` global.
- El ultimo ADMIN se calcula entre membresias activas.
- Auto-desactivacion y auto-degradacion se evaluan sobre la membresia actual.

Decision de identificador: se conserva `userId` en las URLs para minimizar ruptura, pero toda escritura resuelve inequívocamente la membresia por `userId + tenantId`. La auditoria registra el `membershipId` afectado.

## 7. Invitaciones

El flujo conserva token hasheado, expiracion, cancelacion, CAS, locks, reenvio seguro y uso unico.

- Email nuevo: crea `User`, crea `TenantMembership` y acepta la invitacion en una transaccion.
- Email existente: conserva password, nombre y datos globales; crea solo la membresia nueva.
- Membresia existente: devuelve error controlado, no cambia rol y no consume incorrectamente la invitacion.
- Duplicados pendientes: se evaluan por tenant y email normalizado.
- Dos aceptaciones concurrentes producen una sola membresia.
- Rol y tenant provienen exclusivamente de la invitacion.

La pantalla de aceptacion detecta una cuenta existente y no solicita ni reemplaza su contrasena.

## 8. Onboarding

El onboarding guarda en la membresia seleccionada los datos dependientes del conjunto. Nombre y telefono permanecen globales en `User`; configuraciones administrativas del conjunto permanecen en `Tenant`.

Completar onboarding en un conjunto no modifica la membresia del mismo usuario en otro conjunto.

## 9. Selector visual

Se agregaron:

- `/seleccionar-conjunto` para la seleccion obligatoria inicial.
- `TenantSwitcher` en la navegacion autenticada de ADMIN, CONSEJO y RESIDENTE.

El selector muestra solo membresias activas, nombre del conjunto y rol, identifica la seleccion actual y refresca la sesion antes de navegar. No se muestra cuando existe una sola membresia.

## 10. Compatibilidad con modulos existentes

Se ajustaron referencias incompatibles en:

- login, dashboard y middleware;
- perfil y onboarding;
- usuarios e invitaciones;
- PQRS y actividad;
- reportes;
- notificaciones;
- recipients administrativos de billing y Mercado Pago;
- vistas globales de conjuntos para SUPER_ADMIN.

Los aliases legacy de sesion se conservan para minimizar ruptura de UI, pero se derivan de la membresia seleccionada. No conceden acceso por si solos.

Durante la suite completa se detecto y corrigio una regresion transversal: una cuenta global inactiva con membresia activa aun podia recibir efectos del outbox. La seleccion de destinatarios y el servicio de notificaciones ahora exigen simultaneamente `User.isActive` y `TenantMembership.isActive`.

## 11. Archivos modificados

### Prisma

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migrations/20260728000100_add_tenant_memberships/migration.sql`

### Autenticacion y autorizacion

- `src/lib/auth.ts`
- `src/lib/authorization-core.ts`
- `src/lib/authorization.ts`
- `src/lib/membership-context.ts`
- `src/lib/tenant-selection.ts`
- `src/types/next-auth.d.ts`
- `src/middleware.ts`

### API y dominio

- `src/app/api/me/route.ts`
- `src/app/api/me/tenant/route.ts`
- `src/app/api/onboarding/route.ts`
- `src/app/api/users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/api/auth/change-password/route.ts`
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/actividad/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/pqrs/route.ts`
- `src/app/api/pqrs/[id]/route.ts`
- `src/app/api/reportes/route.ts`
- `src/app/api/reportes/excel/route.ts`
- `src/app/api/reportes/pdf/route.ts`
- `src/app/api/billing/checkout/route.ts`
- `src/domains/organizations/invitation.service.ts`
- `src/domains/organizations/tenant.service.ts`
- `src/domains/organizations/user-management.service.ts`
- `src/domains/platform/tenant-admin.service.ts`
- `src/domains/notifications/notification.service.ts`
- `src/domains/billing/billing-outbox.service.ts`
- `src/domains/billing/mercado-pago.service.ts`

### UI

- `src/app/auth/login/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/invitacion/page.tsx`
- `src/app/seleccionar-conjunto/page.tsx`
- `src/components/TenantSwitcher.tsx`
- `src/components/shell/AdminShell.tsx`
- `src/components/shell/ResidentShell.tsx`

### Pruebas

- `tests/unit/authorization.test.ts`
- `tests/unit/tenant-selection.test.ts`
- `tests/unit/user-invitation-security.test.ts`
- `tests/tenant-membership-integration.test.ts`
- `tests/user-invitation-atomicity.test.ts`
- `tests/phase1-infrastructure.test.ts`
- `tests/phase2-flows.test.ts`
- `tests/billing-cron-atomicity.test.ts`
- `tests/billing-outbox-idempotency.test.ts`
- `tests/billing-webhook-idempotency.test.ts`

### Documentacion

- `docs/programa-mejora/09-membresias-multiconjunto/01-prompt-codex-implementacion-base.md`
- `docs/programa-mejora/09-membresias-multiconjunto/02-respuesta-codex-implementacion-base.md`

## 12. Pruebas focalizadas

- Prisma generate: correcto.
- Migracion en PostgreSQL de pruebas: correcta.
- Autorizacion, seleccion e invitaciones: 50/50.
- Integracion de membresias PostgreSQL: 10/10.
- Atomicidad de invitaciones PostgreSQL: 14/14.
- Regresiones de destinatario global inactivo: 2/2 despues de la correccion.
- `npx prisma validate`: correcto.
- `npx tsc --noEmit`: correcto.
- `npm run lint`: correcto, sin warnings.
- `git diff --check`: sin errores; solo avisos de conversion LF/CRLF de Git en Windows.

## 13. Suite completa

Se ejecuto una sola vez, conforme a la instruccion:

- Total: 464.
- Pasaron inicialmente: 462.
- Fallaron: 2.

Ambos fallos revelaron el mismo defecto real de destinatarios con cuenta global inactiva. Se corrigio la implementacion y se reejecutaron exclusivamente esas dos regresiones: 2/2 correctas.

No se repitio automaticamente la suite completa, siguiendo la instruccion expresa de no reintentarla. No quedan fallos conocidos en los caminos modificados.

## 14. Riesgos restantes

1. Las columnas legacy pueden divergir de las membresias mientras coexistan. Ya no se usan como fuente de autorizacion tenant, pero deben eliminarse en una fase posterior.
2. El middleware puede conservar brevemente claims de navegacion hasta refrescar sesion; las APIs sensibles revalidan DB y permanecen protegidas.
3. No se ejecuto un E2E visual con navegador para el selector; la logica de endpoint, firma y navegacion fue cubierta por pruebas unitarias/integracion y typecheck.
4. La migracion debe desplegarse antes del codigo de aplicacion en cada entorno.
5. Antes de eliminar compatibilidad legacy debe verificarse que scripts operativos y consultas externas ya consuman membresias.

Estos riesgos no bloquean la implementacion base ni el despliegue transitorio con la migracion aplicada.

## 15. Columnas legacy pendientes de eliminar

Pendientes en `User` por compatibilidad transitoria:

- `tenantId` y su relacion/index tenant.
- `role` como mezcla actual de rol global y tenant. Antes de eliminarlo debe separarse formalmente el rol de plataforma `SUPER_ADMIN`.
- `bloque`.
- `apto`.
- `haCorregidoUbicacion`.
- `bloqueAptoEditado`.
- `onboardingCompletedAt`.
- `notifyNewPqrsEmail`.

`User.isActive` no debe eliminarse: representa el estado global de la cuenta, distinto de `TenantMembership.isActive`.

Podran retirarse en una migracion destructiva posterior cuando:

1. la migracion aditiva y el backfill esten desplegados en todos los entornos;
2. se valide que no hay usuarios tenant sin membresia;
3. no existan lectores/escritores directos de esos campos;
4. el rol global de plataforma tenga un campo o modelo propio;
5. exista respaldo y plan de rollback.

## 16. Cierre

- No se hizo commit.
- No se hizo push.
- No se crearon tags.
- No se inicio otra fase.

Estado final: `IMPLEMENTADO CON MIGRACION TRANSITORIA`.