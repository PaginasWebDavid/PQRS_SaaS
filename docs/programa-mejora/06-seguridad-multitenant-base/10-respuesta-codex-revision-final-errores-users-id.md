# FASE 3E - Revision final acotada de errores en `/api/users/[id]`

## 1. Resultado de revision

La correccion de Fase 3D es correcta y acotada. PATCH y DELETE usan `mapUserManagementError`; el mapper expone unicamente seis mensajes de dominio mediante coincidencia exacta y convierte cualquier otro valor en HTTP 500 con `"No se pudo procesar la solicitud"`.

Confirmaciones:

1. PATCH y DELETE usan el mismo mapper: confirmado por inspeccion directa.
2. `"Usuario no encontrado"` devuelve 404 en ambos handlers.
3. Inexistente, cross-tenant y SUPER_ADMIN no administrable llegan con el mismo mensaje y producen exactamente el mismo body/status.
4. La lista blanca es exacta mediante `Map.get(error.message)`, sin substring ni prefijo.
5. Prisma, conectividad, infraestructura y bugs inesperados devuelven 500 generico.
6. No se expone mensaje original, stack, SQL, constraint, host, URL ni conexion.
7. Valores que no son `Error` tambien devuelven 500 generico.
8. No se modificaron authorization core, schema, billing, entorno, paquetes ni otros modulos.
9. Las nueve pruebas ejercitan el mapper real; la prueba 9 inspecciona el wiring y la revision directa confirma un uso en PATCH y otro en DELETE.
10. No queda ningun defecto critico, alto o medio abierto.

## 2. R-1 y F-2

- **R-1/F-1: CERRADO.** Ya no existe passthrough de `error.message`. Errores internos inesperados son genericos y no filtran internals.
- **F-2: CERRADO.** DELETE ya no usa 400 fijo; `"Usuario no encontrado"` se mapea a 404 igual que PATCH.

El JSON malformado queda fuera del `try`, pero Next lo procesa como error inesperado sin exponer mensajes de dominio. Es un matiz de experiencia/semantica HTTP, no un defecto medio de esta correccion.

## 3. Pruebas

Claude reporto:

- `tests/unit/user-management-error.test.ts`: **9/9 PASS**.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS, sin warnings.

No repeti pruebas, typecheck ni lint porque el codigo, las aserciones y el informe son consistentes. No se uso Prisma, PostgreSQL, servidor ni suite completa.

## 4. Riesgos restantes

| Riesgo | Severidad | Bloquea commit | Bloquea produccion | Tratamiento |
| --- | --- | --- | --- | --- |
| Falta prueba HTTP/DB real de H-1/IDOR/mapper | BAJA / proceso | No | Si | Ejecutar integracion cuando exista DB de pruebas separada. |
| Doble lectura DB en rutas migradas | BAJA | No | No | Aceptar por seguridad; optimizar solo con medicion y rediseño posterior. |
| Middleware basado en JWT | INFORMATIVA | No | No | Mantenerlo como navegacion; la API revalidada es la frontera. |
| Modulos aun no migrados | PROCESO | No para este commit base | Si para declarar seguridad global completa | Migrar por fases PQRS, invitaciones, reportes, perfil, tenant, notificaciones, plataforma y uploads. |

Los riesgos restantes son menores, informativos o trabajo deliberadamente posterior. No invalidan la base comun ni esta correccion.

## 5. Lista exacta autorizada para commit

- `src/lib/authorization-core.ts`
- `src/lib/authorization.ts`
- `src/lib/authorization-response.ts`
- `src/lib/tenant-access-response.ts`
- `src/domains/organizations/tenant.service.ts`
- `src/domains/organizations/user-management.service.ts`
- `src/domains/organizations/user-management-error.ts`
- `src/domains/platform/permissions.ts`
- `src/app/api/platform/tenant-users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `tests/unit/authorization.test.ts`
- `tests/unit/user-management-error.test.ts`
- Documentos 01 a 10 de `docs/programa-mejora/06-seguridad-multitenant-base/`

No existe otro archivo autorizado. No incluir `.env`, `.env.test`, schema, migraciones, billing, package files, temporales, logs ni cambios ajenos.

Mensaje propuesto:

`feat(auth): centralize tenant authorization`

## 6. Veredicto

**APROBADA CON RIESGOS MENORES.**

La fase puede convertirse en commit local con la lista exacta anterior. La aprobacion del commit no declara la plataforma lista para produccion: quedan la integracion real y la migracion de modulos pendientes.

El prompt quedo guardado en el documento 09 y este informe en el documento 10. Solo se crearon/modificaron esos dos documentos. No se modifico codigo, pruebas ni documentos 01-08; no se hizo commit, push ni tags y no se inicio otro modulo.
