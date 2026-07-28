# FASE 7B — Revisión y cierre de seguridad de cuenta global

## 1. Defectos encontrados

- **R-1 (ALTO, corregido):** la revocación durable de sesiones (`sessionVersion`) no se aplicaba en la capa de autorización tenant/plataforma. El callback JWT (`auth.ts`) invalida el token (`isActive=false`, `role=null`, `tenantId=null`, …) cuando `sessionVersion` del JWT ya no coincide con la de DB (tras cambiar/restablecer contraseña o desactivar la cuenta), **pero conserva `token.id`**. `requireAuthenticatedUser` en `authorization-core.ts` solo miraba `session?.user?.id` para autenticar y luego re-resolvía identidad/membresía **desde la base de datos usando ese `id`**, sin consultar `session.user.isActive`. Efecto: un JWT ya revocado por el propio mecanismo de Fase 7A podía seguir usándose contra `/api/pqrs`, `/api/dashboard`, `/api/users`, etc. — SUPER_ADMIN recuperaría su contexto global y un usuario con una sola membresía activa la autoseleccionaría, obteniendo acceso pese a la revocación. Las rutas de cuenta (`/api/me`, `/api/me/avatar`, `change-password`) sí comprobaban `session.user.isActive` de forma local, pero el resto de la aplicación (PQRS, dashboard, usuarios, billing, notificaciones, etc.) pasa por `requireAuthenticatedUser`/`requireTenantRole`/`requireSuperAdmin`, que no lo hacían. El middleware tampoco cubre `/api/*` (su `matcher` solo incluye rutas de página), por lo que no hay mitigación de borde para las APIs.

No se encontró ningún otro defecto crítico, alto o medio en migración, perfil, cambio de contraseña, recuperación/reset, concurrencia, avatar/Storage o emails; todas las afirmaciones revisadas de Codex se confirmaron por inspección directa del código.

## 2. Corrección

Se añadió el chequeo de revocación en el único punto común de autenticación (`src/lib/authorization-core.ts`, dentro de `requireAuthenticatedUser`):

```ts
if (session?.user?.isActive !== true) throw new AuthorizationError("UNAUTHENTICATED");
```

Colocado inmediatamente después de validar `session.user.id`, antes de cualquier resolución de membresía. Con esto, **todas** las rutas que usan la capa común (`requireAuthenticatedUser`, `requireActiveTenantUser`, `requireTenantRole`, `requireSuperAdmin`, `requireSuperAdminTenantTarget`) heredan la revocación, sin tocar cada ruta individualmente. Se extendió `AuthorizationSession.user` con `isActive?: boolean | null` para tipar el campo.

Archivos modificados:
- `src/lib/authorization-core.ts` (chequeo + tipo).
- `tests/unit/authorization.test.ts` (helper `session()` ahora incluye `isActive: true` por defecto — necesario para que los 28 tests existentes, que asumían sesión válida, sigan pasando — y dos pruebas nuevas de regresión).

No se tocó `auth.ts`, `account.service.ts`, `avatar.service.ts`, schema ni migración: el mecanismo de versionado ya era correcto, solo faltaba consumirlo en el punto de entrada común.

## 3. Migración y sesiones

- `sessionVersion INTEGER NOT NULL DEFAULT 0` — default seguro para cuentas existentes (arrancan en 0, coincide con el JWT emitido en el próximo login). `passwordChangedAt` es nullable. Migración puramente aditiva (columnas + valores de enum `IF NOT EXISTS`), aplicable antes del código. No hay pérdida de cuentas/contraseñas/sesiones.
- El callback JWT copia `sessionVersion` al emitir el token (`authorize`) y lo compara contra DB en cada request (`isSessionVersionCurrent`); `changeGlobalPassword`/`resetGlobalPassword` incrementan `sessionVersion` **exactamente una vez** dentro de la misma transacción que actualiza la contraseña (vía `updateMany` con CAS sobre el hash anterior, `count!==1` aborta) y además borran `Session` (compatibilidad con estrategia DB). Usuario inexistente o `isActive=false` en `getUserMembershipContext` → `invalidateToken` (antes de mi fix, este código ya marcaba el JWT como inactivo; el defecto era que **downstream nadie lo miraba** fuera de las rutas de cuenta). No hay ciclo de invalidación prematura: en el primer `jwt()` tras login, `user` trae `sessionVersion` fresco de `authorize()` y coincide con DB.
- Con el fix, una sesión revocada no puede recuperar acceso cambiando de tenant ni reutilizando claims: `requireAuthenticatedUser` corta en el primer chequeo, antes de tocar membresías.

## 4. Perfil y contraseña

- `/api/me` deriva todo de `session.user.id` + `getUserMembershipContext`; el PATCH usa `assertAllowedAccountPatchKeys` (whitelist `name/phone/bloque/apto/notifyNewPqrsEmail`) — cualquier otra clave (`userId`, `tenantId`, `membershipId`, `role`, `isActive`, `email`, `password`, `image`) es rechazada. Campo omitido no se toca (`Object.prototype.hasOwnProperty` decide inclusión en el patch); teléfono explícito `null`/`""` se limpia intencionalmente (`normalizeGlobalPhone` lo permite). Nunca se devuelve password/hash/tokens/`sessionVersion`. Cambiar de conjunto no altera `User` (bloque/apto/onboarding viven en `TenantMembership`).
- `changeGlobalPassword`: exige cuenta global activa (no tenant/licencia), password actual comparado con bcrypt, nueva password 8–128 chars y ≤72 bytes UTF-8 (sin trim), rechaza reutilizar la actual, CAS sobre `password: user.password` en la transacción, incremento de versión + purge de `Session` + auditoría atómicos, error genérico ante fallo inesperado. Una carrera entre dos cambios: el segundo `updateMany` con el hash viejo como filtro falla (`count===0`) → `CURRENT_PASSWORD_INVALID`, sin pérdida silenciosa.

## 5. Recuperación y concurrencia

- Solicitud: mismo `PUBLIC_RESPONSE` para cuenta activa/inexistente/inactiva/input inválido (confirmado leyendo `forgot-password/route.ts` — los tres caminos devuelven idéntico JSON/status). Token crudo de 32 bytes hex, solo SHA-256 en `VerificationToken.token`, expiración 30 min, `deleteMany` previo invalida tokens anteriores del mismo email antes de crear el nuevo. Cuenta inactiva no genera token (`!user?.isActive → delivery: null`). Origen solo desde `APP_URL`/`NEXTAUTH_URL` vía `getConfiguredApplicationOrigin` (HTTPS obligatorio salvo localhost fuera de producción); nunca se usa `Host`/`Origin` del request.
- Consumo: hash validado por formato estricto (`^[a-f0-9]{64}$`), token/expiración revalidados dentro de la transacción, `claimed.count!==1` aborta sin tocar password (el `deleteMany` con `expires:{gt:now}` actúa como CAS de consumo único), password+`sessionVersion`+`passwordChangedAt`+borrado del token+auditoría en el mismo commit, reset no toca `TenantMembership` ni reactiva `isActive`. Un token histórico en texto plano no matchea ningún SHA-256 real → deja de funcionar (efecto intencional documentado).

## 6. Avatar y Storage

- Owner deriva de `session.user.id` (independiente del tenant/membresía seleccionada). `replaceGlobalUserAvatar`/`removeGlobalUserAvatar` usan CAS sobre `image` (`updateMany` con `image: current.image` en el `where`); si el commit falla, se limpia el archivo recién subido (`cleanupOwnedAvatar`, best-effort); el avatar anterior solo se borra **después** de un commit exitoso, y únicamente si `getOwnedGlobalAvatarPathFromUrl` puede derivar un path perteneciente al propio usuario (una URL externa/histórica no matchea y se desvincula sin intentar borrar nada). `validateAvatarInput` exige MIME en whitelist, firma binaria (`matchesDeclaredType`) y tamaño ≤2 MiB antes de subir. No hay transacción DB abierta durante la llamada a Storage (upload ocurre antes del `$transaction`). Dos reemplazos concurrentes: el CAS hace que uno gane y el otro reciba `PROFILE_CONFLICT` (409) sin sobrescribir en DB; en el peor caso el perdedor deja un objeto huérfano en Storage (nunca borra el avatar vigente de otro request, porque solo limpia el archivo que él mismo subió o el que reemplazó tras su propio commit exitoso).

## 7. Enumeración y riesgos operacionales

- El envío síncrono a Resend solo ocurre para cuenta activa existente; para inexistente/inactiva se retorna de inmediato. Esto crea una diferencia de tiempo medible, pero **no es enumeración práctica de alta precisión**: requiere medición de latencia de red repetida, es ruidosa (jitter de red/Resend) y no confirma nada por sí sola sin herramientas especializadas — coherente con la clasificación de Codex como riesgo bajo/operacional, mitigable con cola/outbox o WAF antes de escala, no un defecto medio a corregir en esta fase.

## 8. Pruebas revisadas

Confirmé por lectura que las 44 pruebas focalizadas (unit account-security 15, avatar-security 17 puras/Storage, integración PostgreSQL 12 password/reset) cubren whitelist de perfil, PATCH parcial, password actual, límites de caracteres/bytes, CAS de cambio, respuesta anti-enumeración, token hasheado, expiración, invalidación de token anterior, consumo único, concurrencia, rollback, cuenta inactiva, avatar propio, MIME/firma/extensión/tamaño, compensación, ownership de path y eliminación segura. No repetí la suite completa (508/508 ya verde sobre el estado final según Fase 7A) ni las 44 focalizadas de integración/avatar (requieren el runner protegido; sin cambios en su código fuente). Sí ejecuté las pruebas puras afectadas por mi corrección: **45/45** (`authorization.test.ts` + `account-security.test.ts`), incluyendo dos pruebas nuevas (29, 30) que reproducen exactamente R-1 con repositorio inyectado — sin ellas, ambas fallaban antes del fix.

`npx tsc --noEmit`: PASS. `npm run lint`: PASS, 0 warnings. No se ejecutó Prisma (schema/migración sin cambios) ni la suite completa (política de eficiencia; el cambio es aditivo y ya validado en las pruebas puras afectadas).

## 9. Resultado

`CORREGIDO; REQUIERE REVISIÓN FINAL`.

Se encontró y corrigió R-1 (ALTO): la revocación de sesión por `sessionVersion` no llegaba a la capa de autorización tenant/plataforma, permitiendo que un JWT ya invalidado por cambio/reset de contraseña o desactivación siguiera concediendo acceso a APIs tenant y de plataforma. La corrección es mínima y centralizada (un chequeo en `requireAuthenticatedUser`), con dos pruebas de regresión. Como se modificó código y pruebas, **no se hizo commit** por regla de esta fase; el hallazgo y el diff quedan listos para la revisión final corta de Codex.
