# FASE 6B — Revisión final y cierre multi-conjunto

## 1. Defectos encontrados

Ninguno de severidad crítica, alta o media. La revisión adversarial de la arquitectura multi-conjunto (modelo, migración, sesión, selección, autorización, invitaciones, usuarios, onboarding y compatibilidad transversal) no encontró defecto explotable. No se modificó código, pruebas, schema ni migración.

## 2. Correcciones

No aplican. No se cambió ningún archivo.

## 3. Migración y columnas legacy

- `TenantMembership` (schema:97-120) representa rol, estado y datos por conjunto; `@@unique([userId, tenantId])`; índices por tenant/rol/estado; FKs en cascada. **CHECK SQL `role <> 'SUPER_ADMIN'`** impide una membresía SUPER_ADMIN.
- `User` conserva identidad global (email, nombre, password, imagen, teléfono, `isActive` global).
- **Backfill** (migration.sql:21-33): una membresía por usuario con `tenantId IS NOT NULL AND role <> 'SUPER_ADMIN'`, copia rol/estado/ubicación/onboarding/preferencia; `id = 'tm_'||md5(userId:tenantId)` determinista + `ON CONFLICT DO NOTHING` → **idempotente**. Las columnas NOT NULL de la membresía (`isActive`, `haCorregidoUbicacion`, `bloqueAptoEditado`, `notifyNewPqrsEmail`) provienen de columnas NOT NULL de `User`; las nullable (`bloque`, `apto`, `onboardingCompletedAt`) aceptan NULL → **sin fallo por NULL inesperado**. Migración aditiva: puede desplegarse antes del código.
- Escrituras legacy restantes a `User.role/tenantId/bloque/apto` solo ocurren al **crear un usuario nuevo** en la aceptación de invitación (comentado como compatibilidad transitoria); la autorización **no** las consulta. `User.role` se usa únicamente para detectar el SUPER_ADMIN global (identidad de plataforma), nunca como rol tenant. No hay lógica nueva que escriba solo columnas legacy y olvide la membresía.

## 4. Selección y autorización

- **Cookie** `pqrs-selected-tenant`: `HttpOnly`, `SameSite=Lax`, `Secure` en producción, `maxAge` 30 d. Firmada con HMAC-SHA256 sobre `AUTH_SECRET`/`NEXTAUTH_SECRET`, comparación `timingSafeEqual`, **vinculada al `userId`** (`verifyTenantSelection`); cookie alterada, de otro usuario o malformada → `null` (falla cerrada). No guarda rol confiable (solo `{v, userId, tenantId}`). La cookie es un **selector** entre membresías activas del propio usuario; nunca concede acceso a un tenant ajeno. POST `/api/me/tenant` mitigado ante CSRF por la cookie de sesión `Lax` de NextAuth; tenant ajeno/inexistente → 404 opaco.
- **JWT callback** (auth.ts) relee DB en cada request (`getUserMembershipContext`) usando la cookie **verificada**; SUPER_ADMIN → contexto global sin membresía; sin selección válida → `role/tenantId` null.
- **Autorización común** (authorization-core + authorization.ts): `requireAuthenticatedUser` reconstruye la identidad desde DB (`findUserById` → membresía activa resuelta por `preferredTenantId`), exigiendo `User.isActive` **y** `TenantMembership.isActive`, y toma **rol y tenant de la membresía**, nunca de `User.tenantId`/`User.role` ni de los claims. `requireActiveTenantUser`/`requireTenantRole`/`tenantScopedWhere`/`assertSameTenant` operan sobre la membresía seleccionada y validan estado de tenant/suscripción. Reglas verificadas: una membresía → auto-selección; varias → selección explícita; selección inválida/ajena/inactiva → falla cerrada; revocación y cambio de rol → efecto en el siguiente request. El middleware usa claims solo para navegación; las APIs sensibles pasan por `getTenantAccessResponse` (revalida DB) antes de usar `getTenantIdFromSession`/`session.user.role` (ya derivados de la membresía fresca).

## 5. Invitaciones y usuarios

- **Aceptación** (invitation.service): token validado **antes** de cualquier consulta de existencia de email; `FOR UPDATE` sobre la invitación + `pg_advisory_xact_lock(membership:tenant:email)` serializan; CAS `updateMany` reclama la invitación.
  - *Email nuevo*: crea `User` + `TenantMembership` + acepta, todo atómico; password/datos globales correctos.
  - *Email existente*: conserva password, nombre, avatar y otras membresías; crea **solo** la membresía nueva; membresía duplicada → `INVITATION_CONFLICT` **sin** consumir la invitación; SUPER_ADMIN objetivo → conflicto. Dos aceptaciones concurrentes → una sola membresía. `inspectInvitation` revela `existingAccount` solo a quien porta un token válido (sin oráculo de enumeración).
- **Gestión** (`updateManagedUser`): opera sobre `TenantMembership` (URL conserva `userId`, escritura resuelve `userId + tenantId`); cambiar rol afecta solo esa membresía; desactivar membresía **no** toca `User`; último ADMIN se calcula por membresías activas (con `FOR UPDATE`); auto-desactivación/degradación sobre la membresía actual; un usuario ADMIN en A y RESIDENTE en B funciona (rol por membresía). SUPER_ADMIN con target explícito sigue funcionando.
- **Onboarding**: escribe bloque/apto/onboarding en la membresía seleccionada; nombre/teléfono siguen globales en `User`; completar onboarding en A no altera B.

## 6. Compatibilidad transversal

- **Notificaciones**: `createNotification`, `createNotificationIdempotent` y `markAllNotificationsRead` exigen `TenantMembership.isActive` **y** `user.isActive` — regresión del destinatario global inactivo cerrada.
- **PQRS/dashboard/actividad/reportes**: aislamiento por el tenant de la membresía validada (`getTenantAccessResponse` + `getTenantIdFromSession`); rol fresco desde la membresía; sin mezcla de conjuntos.
- **Billing checkout**: usa `requireTenantRole("ADMIN")` → tenant de la membresía seleccionada (no toma un tenant equivocado). Mercado Pago / outbox: destinatarios administrativos por membresía activa.
- **Recuperación de contraseña**: global por cuenta (`User` por email), correcto.
- Ningún endpoint sensible concede acceso por aliases legacy de sesión (son derivados de la membresía y revalidados en DB).

## 7. Suite completa final

`npm test` (runner seguro, PostgreSQL de pruebas), una sola ejecución sobre el estado final:

```
tests 464 · pass 464 · fail 0 · skipped 0 · todo 0 · cancelled 0 · exit 0
```

Migración ya aplicada en la base de pruebas (`No pending migrations`). Cubre backfill/integración de membresías (10), atomicidad de invitaciones (14), autorización/selección (unit), destinatario global inactivo y las regresiones transversales. No se repitió la suite (quedó verde).

## 8. Riesgos

| Riesgo | Bloquea commit | Bloquea despliegue transitorio | Bloquea eliminación de columnas legacy |
| --- | --- | --- | --- |
| Columnas legacy coexistentes en `User` | No | No | Sí (retirarlas en fase destructiva posterior) |
| Divergencia legacy↔membresía durante transición (legacy ya no es fuente de autz) | No | No | Sí (validar sin lectores/escritores directos) |
| Orden migración → código (aditiva primero) | No | Sí (desplegar migración antes del código) | No |
| Middleware con claims solo de navegación (APIs revalidan DB) | No | No | No |
| Ausencia de E2E visual del selector (cubierto por unit/integración + typecheck) | No | No | No |
| Scripts/consultas externas legacy | No | No | Sí (verificar que consuman membresías) |
| Rol global de plataforma aún en `User.role` | No | No | Sí (separar SUPER_ADMIN a campo/modelo propio antes de eliminar `User.role`) |

Ninguno bloquea el commit ni el despliegue transitorio con la migración aplicada.

## 9. Resultado

`APROBADO Y COMMIT CREADO`.

La base multi-conjunto es sólida: identidad global + membresías por conjunto, autorización reconstruida desde `TenantMembership` (nunca desde claims ni columnas legacy), doble verificación `User.isActive` + `Membership.isActive`, cookie de selección firmada y vinculada al usuario, invitaciones con ambos caminos atómicos y seguros, gestión/onboarding por membresía y compatibilidad transversal aislada. Migración aditiva idempotente. Suite completa **464/464** verde. No se modificó código ni pruebas; el commit local se crea en esta misma intervención. El hash se informa en la respuesta de la sesión.
