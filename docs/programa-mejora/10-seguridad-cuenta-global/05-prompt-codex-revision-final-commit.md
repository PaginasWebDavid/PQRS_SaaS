# FASE 7C — REVISIÓN FINAL DE REVOCACIÓN Y COMMIT

Guarda este prompt en:

`docs/programa-mejora/10-seguridad-cuenta-global/05-prompt-codex-revision-final-commit.md`

Guarda el informe en:

`docs/programa-mejora/10-seguridad-cuenta-global/06-respuesta-codex-revision-final-commit.md`

## Objetivo

Revisa únicamente la corrección R-1 realizada por Claude:

* `src/lib/authorization-core.ts`
* `tests/unit/authorization.test.ts`
* documento 04 de esta fase.

La Fase 7A completa ya fue revisada adversarialmente. No vuelvas a auditar perfil, reset, avatar, Storage, emails o migración salvo que la corrección R-1 los afecte directamente.

## Regla adaptativa

* Si la corrección es correcta: aprueba y crea el commit completo de Fase 7.
* Si encuentras un defecto pequeño o medio dentro de esta corrección:

  * corrígelo directamente;
  * ejecuta únicamente las pruebas afectadas;
  * typecheck y lint una vez;
  * si todo queda verde, crea el commit en esta misma intervención.
* Detente sin commit únicamente si encuentras un defecto crítico, una corrección amplia o un problema que requiera rediseño.

## Eficiencia

* No revises rama, HEAD, historial ni staged al comenzar.
* No ejecutes suite completa.
* No ejecutes Prisma.
* No repitas las 44 pruebas de cuenta/avatar.
* No repitas typecheck o lint si no modificas código.
* No revises otros módulos.
* No generes un informe extenso.

## Verificación de R-1

Confirma exactamente:

1. `requireAuthenticatedUser` exige:

```ts
session?.user?.id
session?.user?.isActive === true
```

2. El chequeo de `isActive` ocurre antes de:

* consultar membresías;
* autoseleccionar tenant;
* reconstruir SUPER_ADMIN;
* devolver contexto autorizado.

3. Un JWT revocado por `sessionVersion`:

* conserva posiblemente `session.user.id`;
* tiene `session.user.isActive = false`;
* recibe `UNAUTHENTICATED`;
* no recupera acceso consultando nuevamente la DB por ID.

4. La corrección protege automáticamente:

* `requireAuthenticatedUser`;
* `requireActiveTenantUser`;
* `requireTenantRole`;
* `requireSuperAdmin`;
* `requireSuperAdminTenantTarget`.

5. No bloquea una sesión válida con:

```ts
isActive: true
```

6. `AuthorizationSession.user.isActive` está correctamente tipado.

7. No existe otro camino común que invoque directamente el repositorio de identidad y omita este chequeo.

## Pruebas

Confirma que las dos regresiones nuevas demuestran:

1. Una sesión revocada no puede recuperar una membresía tenant activa.
2. Una sesión revocada de SUPER_ADMIN no puede reconstruir acceso global.

Comprueba que habrían fallado antes de la corrección.

Claude ya ejecutó:

```text
authorization.test.ts + account-security.test.ts
45/45 PASS
```

No repitas esas pruebas si el código y las aserciones son coherentes.

Si modificas código o pruebas, ejecuta únicamente:

```text
node --import tsx --test tests/unit/authorization.test.ts tests/unit/account-security.test.ts
npx tsc --noEmit
npm run lint
```

Una sola vez después de la corrección.

## Riesgos

Confirma que permanecen únicamente riesgos operacionales:

* rate limiting durable;
* diferencia temporal de Resend;
* configuración del bucket público;
* avatares históricos huérfanos;
* despliegue migración antes del código;
* reautenticación de JWT anteriores.

Ninguno debe reabrir esta corrección salvo que exista un defecto concreto.

## Commit automático

Si la corrección queda aprobada:

1. Ejecuta una sola vez:

```text
git diff --name-only
```

2. Confirma que los cambios corresponden a Fase 7 y la corrección R-1.
3. Añade explícitamente:

```text
prisma/schema.prisma
prisma/migrations/20260728000200_add_global_account_security/migration.sql

src/domains/account/account-security.ts
src/domains/account/account.service.ts
src/domains/account/avatar.service.ts

src/lib/auth.ts
src/lib/authorization-core.ts
src/lib/membership-context.ts
src/lib/storage.ts
src/lib/email.ts
src/types/next-auth.d.ts
src/domains/platform/audit.service.ts

src/app/api/me/route.ts
src/app/api/me/avatar/route.ts
src/app/api/auth/change-password/route.ts
src/app/api/auth/forgot-password/route.ts
src/app/api/auth/reset-password/route.ts

src/app/cambiar-contrasena/page.tsx
src/app/auth/olvidar-contrasena/page.tsx
src/app/auth/restablecer-contrasena/page.tsx

tests/unit/account-security.test.ts
tests/unit/avatar-security.test.ts
tests/unit/authorization.test.ts
tests/account-security-integration.test.ts
tests/account-avatar-integration.test.ts

docs/programa-mejora/10-seguridad-cuenta-global/
```

4. Revisa una vez el staged diff para confirmar:

* no hay tokens reales;
* no hay contraseñas;
* no hay secretos;
* no hay `.env`;
* no hay archivos ajenos.

5. Crea:

```text
git commit -m "feat(auth): secure global account recovery and avatar"
```

No ejecutes pruebas después del commit.

## Informe final breve

Entrega:

1. Resultado de revisión de R-1.
2. Confirmación de alcance de la revocación.
3. Pruebas revisadas o ejecutadas.
4. Cambios adicionales, si hiciste alguno.
5. Commit y hash.
6. Resultado:

   * `APROBADO Y COMMIT CREADO`.
   * `CORREGIDO Y COMMIT CREADO`.
   * `BLOQUEADO`.

No inicies otra fase.
