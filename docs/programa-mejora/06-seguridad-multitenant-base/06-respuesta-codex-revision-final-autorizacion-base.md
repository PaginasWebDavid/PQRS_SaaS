# FASE 3C - Revision final de la base de autorizacion multi-tenant

## 1. Resumen

La base comun es correcta y H-1 esta cerrado: la identidad minima es `session.user.id`, la DB decide rol/tenant/actividad/licencia, los helpers fallan cerrados y las rutas representativas revalidan en servidor. Sin embargo, R-1 es un defecto real: PATCH y DELETE de `/api/users/[id]` reflejan cualquier `error.message`, incluida una excepcion inesperada de Prisma o conectividad. DELETE ademas devuelve 400 para "Usuario no encontrado", no el 404 requerido. El commit debe esperar una correccion acotada del adaptador de errores de esa ruta.

## 2. Git

- HEAD: `2961225 feat(billing): add durable notification outbox`.
- Sin staged diff ni commits posteriores.
- Solo existen cambios de esta fase.
- Billing, schema, migraciones, paquetes, `.env` y `.env.test` estan intactos.
- `git diff --check`: sin errores; solo avisos LF/CRLF.

## 3. Verificaciones criticas

| # | Verificacion | Estado |
| --- | --- | --- |
| 1 | `session.user.id` es identidad minima | CONFIRMADA |
| 2 | Rol, tenant, actividad y licencia salen de DB | CONFIRMADA |
| 3 | Usuario eliminado falla cerrado | CONFIRMADA |
| 4 | Fallo de DB no reutiliza claims | CONFIRMADA |
| 5 | Rol reducido pierde permisos | CONFIRMADA |
| 6 | Cambio de tenant invalida el anterior | CONFIRMADA |
| 7 | Rol desconocido falla cerrado | CONFIRMADA |
| 8 | SUPER_ADMIN funciona sin tenant | CONFIRMADA |
| 9 | SUPER_ADMIN exige target explicito | CONFIRMADA |
| 10 | ADMIN opera solo en su tenant | CONFIRMADA |
| 11 | CONSEJO/RESIDENTE no elevan permisos | CONFIRMADA |
| 12 | Tenant/suscripcion bloqueados niegan acceso | CONFIRMADA |
| 13 | Inputs cliente no conceden permisos | CONFIRMADA |
| 14 | Cross-tenant e inexistente son indistinguibles | CONFIRMADA EN CORE; falta integracion de ruta |
| 15 | Middleware no es la unica frontera | CONFIRMADA |
| 16 | Rutas representativas revalidan en servidor | CONFIRMADA |

## 4. H-1

`updateManagedUser` resuelve el objetivo mediante `findFirst({ id: targetUserId, tenantId })` dentro de la transaccion y valida el rol actual con `MANAGEABLE_ROLES`. SUPER_ADMIN queda excluido aunque tenga accidentalmente el mismo `tenantId`; modificarlo o desactivarlo lanza exactamente "Usuario no encontrado", igual que un ID ausente/cross-tenant. ADMIN, CONSEJO y RESIDENTE siguen siendo gestionables bajo la politica existente. Auto-desactivacion, auto-degradacion y ultimo ADMIN activo conservan sus protecciones.

**H-1: CERRADO.**

## 5. Rutas representativas

### `/api/users/[id]`

- GET/PATCH/DELETE revalidan ADMIN actual en DB.
- El tenant proviene de la identidad autorizada.
- GET usa `id + tenantId`; cross-tenant y ausente devuelven el mismo 404.
- PATCH no acepta tenant y `MANAGEABLE_ROLES` impide elevar a SUPER_ADMIN.
- PATCH/DELETE vuelven a resolver objetivo por `id + tenantId`.
- H-1 impide afectar SUPER_ADMIN.
- Auto-desactivacion y ultimo ADMIN siguen protegidos.
- **Defecto:** DELETE devuelve 400, no 404, para "Usuario no encontrado".
- **Defecto:** PATCH/DELETE reflejan errores internos inesperados mediante `error.message`.

### `/api/platform/tenant-users`

SUPER_ADMIN actual se valida en DB. El target es obligatorio, explicito y existente; no hay fallback al tenant de sesion. Un claim SUPER_ADMIN antiguo falla. La respuesta del gate no expone PII ni detalles internos; el endpoint solo entrega usuarios a un SUPER_ADMIN vigente.

## 6. Stale JWT

**CONFIRMADA CON MATICES.** El callback JWT refresca claims desde DB en cada `auth()` y las rutas migradas consultan DB nuevamente. `assertSessionClaimsCurrent` es una defensa adicional: normalmente compara dos lecturas frescas; si ocurre un cambio entre ellas, falla cerrado y el siguiente request se normaliza, por lo que no crea bloqueo permanente. Un error de DB se propaga y no reutiliza claims.

El middleware Edge sigue usando JWT y solo controla navegacion. Los modulos no migrados dependen del refresco del callback y deben adoptar el contrato comun en fases separadas.

## 7. Pruebas

`node --import tsx --test tests/unit/authorization.test.ts`: **26/26 PASS**, una ejecucion, sin skip/fail/todo. Las pruebas llaman la logica real del core mediante repositorio inyectado y cubren eliminacion, fallo DB, rol reducido, cambio de tenant, SUPER_ADMIN sin tenant, targets, tenant accidental, claim reducido, cross-tenant y estados bloqueados.

No demuestran la transaccion Prisma real de H-1 ni el status HTTP de DELETE; R-4 permanece como riesgo de proceso. No se uso PostgreSQL remoto, Prisma, suite completa, typecheck ni lint. Los resultados verdes de Claude para typecheck/lint son coherentes con el diff.

## 8. Riesgos R-1 a R-4

| ID | Severidad real | Bloquea commit | Bloquea produccion | Accion |
| --- | --- | --- | --- | --- |
| R-1 | MEDIA | Si | Si | No reflejar errores desconocidos. Usar whitelist/errores de dominio; inesperados deben producir mensaje generico y 500. Mapear "Usuario no encontrado" a 404 tambien en DELETE. |
| R-2 | BAJA | No | No | Aceptar dos lecturas DB por seguridad; optimizar solo con rediseño posterior medido. |
| R-3 | INFORMATIVA | No | No | Mantener middleware como UX; APIs siguen siendo la frontera real. |
| R-4 | BAJA/PROCESO | No | Si | Agregar integracion H-1/IDOR cuando exista DB de pruebas separada, antes de produccion. |

R-1 puede filtrar de forma realista mensajes de Prisma, rutas internas, nombres de constraints o datos de conectividad cuando la transaccion falla fuera de los errores controlados. Que el actor sea un ADMIN autenticado reduce impacto, pero no hace aceptable el passthrough en la base de seguridad.

## 9. Hallazgos nuevos

- **F-1 / R-1, MEDIA:** exposicion de `error.message` inesperado en PATCH/DELETE.
- **F-2, BAJA:** DELETE responde 400 para inexistente/cross-tenant/SUPER_ADMIN; la existencia sigue siendo indistinguible, pero incumple el contrato 404 requerido.

No encontre otro defecto critico, alto o medio. H-1 no se reabre.

## 10. Modulos pendientes

PQRS, usuarios collection, invitaciones, dashboard/reportes, perfil, tenant/configuracion, notificaciones, plataforma SUPER_ADMIN restante y uploads pueden migrarse despues. No bloquean el futuro commit de esta base una vez corregido R-1.

## 11. Bloqueos

- **Bloquea commit:** Si, solo por R-1/F-1 y el mapeo asociado de DELETE.
- **Bloquea produccion:** Si, por R-1 y por la prueba de integracion H-1/IDOR pendiente en infraestructura separada.

## 12. Lista exacta futura para commit

- `src/lib/authorization-core.ts`
- `src/lib/authorization.ts`
- `src/lib/authorization-response.ts`
- `src/lib/tenant-access-response.ts`
- `src/domains/organizations/tenant.service.ts`
- `src/domains/organizations/user-management.service.ts`
- `src/domains/platform/permissions.ts`
- `src/app/api/platform/tenant-users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `tests/unit/authorization.test.ts`
- Documentos 01 a 06 de `docs/programa-mejora/06-seguridad-multitenant-base/`

No incluir entorno, schema, migraciones, billing, paquetes, temporales, logs ni archivos ajenos.

## 13. Comandos `git add` futuros

No ejecutar hasta corregir y revisar R-1:

```text
git add -- src/lib/authorization-core.ts src/lib/authorization.ts src/lib/authorization-response.ts src/lib/tenant-access-response.ts
git add -- src/domains/organizations/tenant.service.ts src/domains/organizations/user-management.service.ts src/domains/platform/permissions.ts
git add -- src/app/api/platform/tenant-users/route.ts
git add -- "src/app/api/users/[id]/route.ts"
git add -- tests/unit/authorization.test.ts
git add -- docs/programa-mejora/06-seguridad-multitenant-base
```

## 14. Mensaje futuro

`feat(auth): centralize tenant authorization`

## 15. Recomendacion

Realizar una correccion minima solo en el manejo de errores PATCH/DELETE: clasificar mensajes de dominio conocidos, responder 404 para "Usuario no encontrado" y usar respuesta generica 500 para errores inesperados. Agregar pruebas ligeras del mapeo sin servidor ni DB; despues repetir esta revision acotada. No modificar el core ni ampliar modulos.

## 16. Veredicto

**REQUIERE CORRECCIONES.**

El prompt fue guardado exactamente en el documento 05. Este informe quedo guardado en el documento 06. Solo se crearon/modificaron esos dos documentos; no se modifico codigo, pruebas, configuracion ni documentos 01-04. No se hizo commit, push ni tags y no se inicio otro modulo.
