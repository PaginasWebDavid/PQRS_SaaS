# FASE 7C - REVISION FINAL DE REVOCACION Y COMMIT

## Resultado de R-1

`APROBADA`

La correccion en `requireAuthenticatedUser` exige, en este orden:

1. `session?.user?.id`.
2. `session?.user?.isActive === true`.
3. Solo despues consulta el repositorio de identidad y reconstruye membresia o contexto SUPER_ADMIN.

Un JWT invalidado por `sessionVersion` conserva potencialmente el id, pero `auth.ts` lo entrega con `isActive = false`. R-1 ahora lo convierte en `UNAUTHENTICATED` antes de `findUserById`, por lo que no puede recuperar acceso tenant por autoseleccion ni acceso global de SUPER_ADMIN.

La barrera cubre transitivamente `requireAuthenticatedUser`, `requireActiveTenantUser`, `requireTenantRole`, `requireSuperAdmin` y `requireSuperAdminTenantTarget`. Las sesiones validas con `isActive: true` conservan el comportamiento previo.

`AuthorizationSession.user.isActive` esta tipado como `boolean | null | undefined`. La busqueda de referencias confirma que el repositorio de identidad solo se invoca desde la implementacion comun de autorizacion; no hay otro camino comun que lo consulte directamente y omita R-1.

## Pruebas revisadas

Se revisaron por lectura las regresiones 29 y 30 de `tests/unit/authorization.test.ts`:

- sesion revocada con membresia activa no recupera acceso tenant;
- sesion revocada de SUPER_ADMIN no recupera contexto global ni target tenant.

Ambas habrian fallado antes de R-1 porque el servicio resolvia el usuario desde el repositorio solo con el id retenido. Claude ejecuto las pruebas afectadas `authorization.test.ts + account-security.test.ts`: 45/45 PASS. No se repitieron por no modificar codigo ni pruebas.

No se ejecutaron Prisma, suite completa, typecheck ni lint en esta revision, conforme al alcance acotado y dado que no se realizaron cambios de implementacion.

## Riesgos restantes

Solo permanecen riesgos operacionales previamente documentados:

- rate limiting durable;
- diferencia temporal de Resend;
- configuracion del bucket publico;
- avatares historicos huerfanos;
- despliegue de migracion antes del codigo;
- reautenticacion de JWT anteriores.

Ninguno reabre R-1.

## Decision

R-1 queda aprobada sin cambios adicionales. Se autoriza el commit completo de Fase 7 con el mensaje indicado por el prompt.