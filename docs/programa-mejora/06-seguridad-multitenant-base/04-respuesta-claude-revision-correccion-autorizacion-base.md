# FASE 3B — Revisión y corrección de la base de autorización multi-tenant

## 1. Estado inicial

HEAD: `2961225 feat(billing): add durable notification outbox`. Sin staged diff. `git diff --check` solo reporta avisos históricos LF/CRLF. Los cambios pendientes pertenecen exclusivamente a esta fase (los cinco archivos migrados por Codex + los cuatro archivos nuevos de la capa de autorización + `tests/unit/authorization.test.ts`). Schema, migraciones, billing, `package*`, `.env` y `.env.test` intactos. No `BLOQUEADO`.

## 2. Verificación de afirmaciones de Codex

| # | Afirmación | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | Usuario eliminado falla cerrado | Confirmada | `requireAuthenticatedUser` → `findUserById` null → `UNAUTHENTICATED`; además el callback JWT pone `role=undefined`, `isActive=false` (`auth.ts:70-76`) |
| 2 | Usuario inactivo falla cerrado | Confirmada | `authorization-core.ts:134` `USER_INACTIVE` |
| 3 | Rol actual sale de DB | Confirmada | `authorization.ts` lee `prisma.user`; el callback JWT reescribe `token.role` desde DB en cada request (`auth.ts:52-70`) |
| 4 | Tenant actual sale de DB | Confirmada | igual que 3, `token.tenantId` desde DB (`auth.ts:71`) |
| 5 | Rol reducido invalida permisos antiguos | Confirmada | `requireTenantRole` usa el rol de DB (test 4) |
| 6 | Cambio de tenant invalida el tenant antiguo | Confirmada | `requireActiveTenantUser` usa `tenantId` de DB; `assertSameTenant` rechaza el viejo (test 5) |
| 7 | SUPER_ADMIN sin tenant | Confirmada | `requireSuperAdmin` no exige tenant (test 7) |
| 8 | SUPER_ADMIN requiere target explícito | Confirmada | `requireSuperAdminTenantTarget` exige y valida target (tests 21, 23) |
| 9 | ADMIN solo opera en su tenant | Confirmada | `requireTenantRole` + `tenantScopedWhere`/`assertSameTenant` (tests 8, 11-13) |
| 10 | CONSEJO/RESIDENTE no elevan | Confirmada | tests 9, 10 |
| 11 | Tenant suspendido/cancelado bloquea | Confirmada | `BLOCKED_TENANT_STATUSES`/`BLOCKED_SUBSCRIPTION_STATUSES` (tests 14, 15, 22) |
| 12 | Inputs cliente no conceden autorización | Confirmada | identidad se reconstruye desde `session.user.id`; `tenantId` de cliente solo es target (test 13) |
| 13 | Cross-tenant indistinguible | Confirmada | `assertSameTenant` siempre `RESOURCE_NOT_FOUND` (test 17) |
| 14 | Las dos rutas usan la capa común | Confirmada | `tenant-users/route.ts` y `users/[id]/route.ts` |
| 15 | No filtra sesión/email/stack/Prisma | Confirmada con matices | La capa no filtra; ver §13 sobre passthrough de `error.message` en PATCH/DELETE (riesgo bajo) |
| 16 | Billing no modificado | Confirmada | `git status` no toca billing/schema/migración |

## 3. Hallazgos

- **H-1 (BAJO / defensa en profundidad, corregido).** `updateManagedUser` validaba el rol **nuevo** (`MANAGEABLE_ROLES`) pero no el rol **actual del objetivo**. Si por mala configuración un SUPER_ADMIN tuviera `tenantId` igual al del ADMIN actuante, `findFirst({id, tenantId})` lo encontraría y la ruta de tenant podría desactivarlo/modificarlo. Requiere un estado anómalo (los SUPER_ADMIN normales tienen `tenantId=null`), de ahí la severidad baja.
- **H-2 (cobertura).** Faltaban dos casos obligatorios del listado (target SUPER_ADMIN inexistente → `RESOURCE_NOT_FOUND`; fallo de repositorio/DB fail-closed) y no había prueba del SUPER_ADMIN con `tenantId` accidental ni de que un claim de sesión reducido no bloquea al ADMIN real de la base.
- **No se encontró ningún defecto crítico, alto o medio funcional.** La garantía "la DB prevalece sobre el JWT" se sostiene por dos vías independientes (ver §5-§6).

## 4. Correcciones realizadas

1. **H-1:** en `updateManagedUser`, tras resolver el objetivo dentro del tenant, se añadió `if (!MANAGEABLE_ROLES.includes(target.role)) throw new Error("Usuario no encontrado")`. Un SUPER_ADMIN objetivo queda **indistinguible de inexistente** (mismo mensaje/estado que cross-tenant), cerrando la ruta y sin revelar su existencia.
2. **H-2:** cuatro pruebas puras nuevas (tests 23-26) en `tests/unit/authorization.test.ts`.

No se modificó ningún otro archivo. No se tocó la capa central (`authorization-core.ts`) porque su lógica es correcta.

## 5. Fuente de verdad

La identidad autorizada se reconstruye **siempre** desde `session.user.id` (única evidencia mínima que se toma del JWT) más lecturas de DB: `requireAuthenticatedUser` obtiene `role`, `tenantId`, `isActive`, estado de tenant y de suscripción desde `prisma.user`. Ningún helper acepta una identidad construida por el cliente; `tenantId` recibido por query/body solo se usa como *target* validado (`requireSuperAdminTenantTarget`), nunca como prueba de permiso. Roles desconocidos no se castean a un rol válido: `isAuthorizationRole` rechaza cualquier valor fuera de la lista y produce `FORBIDDEN` (test 16). Si `session.user.id` falta → `UNAUTHENTICATED`; si el usuario no existe → `UNAUTHENTICATED`. Un fallo de la consulta se propaga como excepción (→ 500 en la ruta): **nunca** se reutilizan claims antiguos para conceder acceso (test 26, fail-closed).

## 6. Stale JWT

Punto principal de la revisión. Conclusión: **el stale-JWT no es explotable en las rutas API** y no genera bloqueo permanente, por dos mecanismos:

1. **Callback JWT (`auth.ts:46-81`).** Se ejecuta en cada `auth()` y **reescribe** `token.role`, `token.tenantId`, `token.tenantStatus`, `token.subscriptionStatus`, `token.isActive` desde la DB; `session()` los mapea a `session.user.*`. Por tanto `session.user.role/tenantId` están frescos en cada request. Las rutas heredadas que aún confían en `session.user.role` y `getTenantIdFromSession(session)` (p. ej. `pqrs`, `users`, `tenant`, `dashboard`, `invitations`, `notifications`) operan sobre valores ya revalidados contra DB.
2. **Rutas migradas.** `requireActiveTenantUser`/`requireTenantRole`/`requireSuperAdminTenantTarget` re-derivan la identidad desde DB, con independencia del JWT (cinturón + tirantes).

Sobre `assertSessionClaimsCurrent`: compara `session.user.role/tenantId` (fresco, del callback) contra `identity` (fresco, de `requireActiveTenantUser`). Como ambos provienen de la DB dentro del mismo request, en régimen normal **siempre coinciden**; solo podría dispararse en la ventana de carrera nanométrica en que la DB cambie entre ambas lecturas del mismo request, y en ese caso falla cerrado (`FORBIDDEN`) y el siguiente request ya es consistente. **No crea bucle permanente** (la sesión se refresca sola) **ni contradicción de políticas** (nunca concede lo que la DB niega). Es, en la práctica, defensa en profundidad redundante pero inocua; se conserva porque endurece cualquier ruta futura que llame a `getTenantAccessResponse` antes de re-derivar identidad. No hay fallback a `session.user.role`, `session.user.tenantId`, `session.user.isActive` ni a licencia antigua del JWT en ningún helper.

## 7. Contratos

`requireAuthenticatedUser`, `requireActiveTenantUser`, `requireTenantRole`, `requireSuperAdmin`, `requireSuperAdminTenantTarget`, `assertSameTenant`, `tenantScopedWhere`, `assertSessionClaimsCurrent`: firmas claras y tipos estrictos (`AuthorizationRole`/`TenantRole` exhaustivos vía `AUTHORIZATION_ROLES as const`; `AuthorizationErrorCode` cerrado). Errores estables (`AuthorizationError` con `code`+`status` fijos). Sin fallback ambiguo: SUPER_ADMIN no puede usar `tenantScopedWhere`/`assertSameTenant` como atajo (`FORBIDDEN`/`RESOURCE_NOT_FOUND`). Responsabilidades separadas (core puro + adaptador Prisma `authorization.ts` + adaptador HTTP `authorization-response.ts`). Ningún helper acepta identidad del cliente. La única duplicación de lectura es callback-JWT + `requireActiveTenantUser` (2 lecturas por request migrado), inherente al patrón y fuera de alcance (auth config); dentro de la capa no hay lectura duplicada (`assertSessionClaimsCurrent` no consulta DB).

## 8. SUPER_ADMIN

Puede existir activo sin tenant (test 7). `requireSuperAdmin` exige `role==="SUPER_ADMIN"` **de DB** (test 19 rechaza un claim SUPER_ADMIN viejo cuando la DB dice RESIDENTE). Para operar sobre un conjunto, `requireSuperAdminTenantTarget` exige target explícito no vacío (`TENANT_REQUIRED` si falta) y validado en DB (`RESOURCE_NOT_FOUND` si no existe; tests 21, 23); sin fallback al tenant de sesión. Si un SUPER_ADMIN tuviera `tenantId` accidental: no pasa el gate de usuario de tenant (`FORBIDDEN`) ni puede usar `tenantScopedWhere` (test 24), y ninguna ruta de tenant puede modificarlo (H-1 corregido). No se habilitó impersonación.

## 9. Tenant roles

ADMIN/CONSEJO/RESIDENTE deben: existir, estar activos, tener rol reconocido, tener `tenantId`, tenant existente con estado válido y licencia no bloqueada. `requireActiveTenantUser` rechaza SUPER_ADMIN, exige `tenantId`+`tenantStatus` (`TENANT_REQUIRED`) y bloquea por estado (`TENANT_INACTIVE`). `requireTenantRole` añade el filtro de rol permitido. CONSEJO y RESIDENTE reciben exactamente la misma política de estado/licencia que ADMIN (el filtro de rol es aparte).

## 10. Estados y licencia

Coincide con la política existente (`isTenantAccessBlocked` en `tenant.service.ts:24-31`). Bloqueados: `PENDING_PAYMENT`, `SUSPENDED`, `CANCELLED` (tenant y suscripción). Autorizados: `TRIAL`, `ACTIVE`, `GRACE_PERIOD`. Se valida estado de Tenant **y** de Subscription; si la suscripción es `null` (p. ej. trial sin subscription aún) solo decide el estado del Tenant — consistente con el helper legado. Si Tenant y Subscription se contradicen, **cualquiera** bloqueado niega (test 22: Tenant ACTIVE + Subscription SUSPENDED → `TENANT_INACTIVE`). SUPER_ADMIN conserva supervisión: `requireSuperAdminTenantTarget` no bloquea por estado del target (puede actuar sobre suspendidos/cancelados). No se reabrió lógica económica de billing.

## 11. Rutas representativas

**`/api/platform/tenant-users` (GET):** `auth()` requerido; `requireSuperAdminTenantTarget` revalida SUPER_ADMIN en DB, exige y valida el target; sin fallback; parámetro inválido/ausente → `TENANT_REQUIRED`/`RESOURCE_NOT_FOUND` sin PII. No permite enumeración relevante (un SUPER_ADMIN ya puede ver todos los tenants por diseño).

**`/api/users/[id]` (GET/PATCH/DELETE):** `requireTenantRole(session, "ADMIN")` revalida ADMIN en DB; el `tenantId` deriva de la identidad de servidor, no del cliente. GET usa `findFirst({id, tenantId})` → cross-tenant/ausente devuelven el mismo 404. PATCH/DELETE llaman a `updateManagedUser` con `tenantId` autorizado; el servicio re-resuelve el objetivo dentro del tenant (`findFirst({id, tenantId})`) dentro de la transacción. PATCH no permite cambiar tenant (no hay parámetro), ni elevar a SUPER_ADMIN (`MANAGEABLE_ROLES` rechaza), ni tocar campos prohibidos (solo `role`/`isActive`/`bloque`/`apto`). DELETE es desactivación con el mismo alcance de tenant y ahora tampoco puede afectar a un SUPER_ADMIN (H-1).

## 12. IDOR y elevación

- IDOR de lectura/escritura: cerrado por `findFirst({id, tenantId})` en ruta y servicio; ID de otro tenant → 404 indistinguible.
- Elevación por PATCH: bloqueada (`MANAGEABLE_ROLES` excluye SUPER_ADMIN; `String(body.role).toUpperCase()` inválido → "Rol invalido").
- Elevación por claim viejo: no aplica (identidad de DB; test 19).
- DELETE cross-tenant: rechazado (test 16 de `phase2-flows`, `/no encontrado/i`).
- Modificar/eliminar un SUPER_ADMIN vía ruta de tenant: cerrado por H-1.
- Auto-desactivación/auto-degradación del ADMIN actuante y protección de "último ADMIN activo": ya presentes en `updateManagedUser` (con `SELECT ... FOR UPDATE`).

## 13. Errores

Mapeo de `authorization-response.ts` coherente: `UNAUTHENTICATED`→401, `USER_INACTIVE`/`TENANT_REQUIRED`/`TENANT_INACTIVE`/`FORBIDDEN`→403, `RESOURCE_NOT_FOUND`→404. Body estable `{ error, code }` sin stack, causa interna, email ni datos Prisma; cross-tenant y ausente son idénticos. **Matiz (riesgo bajo, no corregido — ver §18 R-1):** en `users/[id]` PATCH/DELETE el `catch` devuelve `error.message` con estado 400/404. En el camino realista `updateManagedUser` solo lanza mensajes controlados en español (seguros), pero un error inesperado de Prisma se reflejaría textualmente al ADMIN autenticado del mismo tenant. Impacto bajo (autenticado, mismo tenant, requiere excepción no prevista); se deja como recomendación para no alterar el contrato de errores de la ruta fuera del defecto de seguridad principal.

## 14. Rendimiento

`requireActiveTenantUser` hace una sola consulta con `select` acotado (id, role, tenantId, isActive, tenant.status, subscription.status). `assertSessionClaimsCurrent` no consulta DB. No hay lecturas duplicadas dentro de la capa. La única duplicación es callback-JWT + revalidación por operación (2 lecturas por request migrado), inherente al patrón y fuera de alcance. No se introdujo caché de seguridad con claims obsoletos.

## 15. Archivos modificados (FASE 3B)

- `src/domains/organizations/user-management.service.ts` — guard defensa en profundidad (H-1).
- `tests/unit/authorization.test.ts` — tests 23-26.
- `docs/programa-mejora/06-seguridad-multitenant-base/03-prompt-...md` y `04-respuesta-...md`.

No se modificó `authorization-core.ts`, `authorization.ts`, `authorization-response.ts`, `tenant-access-response.ts`, `tenant.service.ts`, `permissions.ts` ni las dos rutas (más allá de lo que Codex ya había dejado en FASE 3A). No se tocó schema, migraciones, billing, UI, `package*`, `.env`, `.env.test`, ni la configuración de NextAuth/middleware.

## 16. Pruebas específicas

`node --import tsx --test tests/unit/authorization.test.ts` → **26/26 PASS**, sin skip/fail/todo. Cubren los 22 casos obligatorios (1-22 mapeados) más: target SUPER_ADMIN inexistente (23), SUPER_ADMIN con `tenantId` accidental (24), DB prevalece sin bloqueo espurio del ADMIN real (25) y fail-closed ante fallo de repositorio (26). Pruebas puras con repositorio inyectado; no se usó PostgreSQL real (el comportamiento de decisión/aislamiento es determinista con inyección). Las garantías dependientes de Prisma (H-1, IDOR de escritura) están cubiertas por el patrón de integración existente (`phase2-flows.test.ts` test 16) que **no** se ejecutó aquí para respetar la política de eficiencia y evitar la base remota.

## 17. Typecheck / lint

- `npx tsc --noEmit` → PASS (una ejecución).
- `npm run lint` → PASS, cero warnings/errores (una ejecución).
- Suite completa: **no** ejecutada (política de eficiencia; la base remota compartida sigue sin separarse).

## 18. Riesgos restantes

- **R-1 (bajo):** passthrough de `error.message` en `users/[id]` PATCH/DELETE ante excepciones inesperadas de Prisma (§13). Recomendación: whitelist de mensajes seguros o genérico. No corregido para no alterar el contrato de errores fuera del defecto de seguridad principal.
- **R-2 (bajo):** doble lectura de DB por request migrado (callback JWT + revalidación). Aceptable; optimizable solo tocando la config de auth (fuera de alcance).
- **R-3 (informativo):** el middleware sigue usando claims del JWT (limitación Edge); solo protege navegación, no sustituye la revalidación de API.
- **R-4 (proceso):** H-1 e IDOR de escritura se validaron por inspección + patrón de integración existente, no por una nueva prueba de integración (evitar base remota degradada). Recomendable una prueba de integración dedicada cuando la base de pruebas esté separada.
- La base de pruebas debe separarse antes de una validación completa de producción.

## 19. Módulos pendientes

Siguen confiando en `session.user.role`/`getTenantIdFromSession()` (seguros hoy por el refresco del callback JWT, pero deben migrar al contrato común con re-derivación de identidad y `id + authorizedTenantId`): PQRS (`/api/pqrs`, `[id]`, evidencia, fotos), uploads/avatar, invitaciones (list/create/resend/cancel/bulk), usuarios collection (`/api/users`), dashboard/actividad/reportes/exportaciones, perfil/cambio de password, tenant/configuración, soporte, notificaciones y el resto de rutas SUPER_ADMIN de plataforma. Billing solo durante su auditoría específica, sin reabrir la lógica cerrada.

## 20. Recomendación para Codex

Revisión final de solo lectura sobre: (a) el guard de H-1 en `user-management.service.ts` (que un SUPER_ADMIN objetivo quede indistinguible de inexistente); (b) los tests 23-26; (c) validar la conclusión de §6 (el refresco del callback JWT hace que `assertSessionClaimsCurrent` sea defensa en profundidad inocua, sin bucle ni contradicción). Si se desea, añadir una prueba de integración para H-1/IDOR de escritura cuando la base de pruebas esté separada, y evaluar R-1. No cambiar schema ni producción salvo que una prueba revele un defecto real. La migración del resto de módulos (§19) es trabajo deliberadamente pendiente, no un fallo de esta base.

## 21. Estado

**CORREGIDO CON RIESGOS.**

La base de autorización es sólida: la DB prevalece sobre el JWT por dos vías (refresco del callback + revalidación por operación), SUPER_ADMIN es explícito, los inputs del cliente no conceden acceso, el aislamiento tenant-scoped y los errores indistinguibles funcionan, y se cerró la única brecha encontrada (H-1, defensa en profundidad). Los riesgos restantes son bajos/informativos o de proceso (R-1..R-4) y la migración pendiente de otros módulos (§19), no fallos conocidos de la base. Prompt guardado en el documento 03. No se hizo commit, push ni tags; no se auditaron otros módulos.
