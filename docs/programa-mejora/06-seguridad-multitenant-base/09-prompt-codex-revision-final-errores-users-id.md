# FASE 3E — REVISIÓN FINAL ACOTADA Y AUTORIZACIÓN DE COMMIT

Guarda este prompt en:

`docs/programa-mejora/06-seguridad-multitenant-base/09-prompt-codex-revision-final-errores-users-id.md`

Guarda la respuesta en:

`docs/programa-mejora/06-seguridad-multitenant-base/10-respuesta-codex-revision-final-errores-users-id.md`

Solo lectura. No modifiques código, pruebas ni documentos 01–08. No hagas commit.

## Eficiencia máxima

* Revisa solo el diff de Fase 3D.
* No ejecutes suite completa.
* No uses Prisma ni PostgreSQL.
* No repitas typecheck/lint.
* Ejecuta `tests/unit/user-management-error.test.ts` solo si ves una inconsistencia.
* Si el código está correcto, aprueba sin más ejecuciones.

## Revisa únicamente

```text
src/domains/organizations/user-management-error.ts
src/app/api/users/[id]/route.ts
tests/unit/user-management-error.test.ts
docs/programa-mejora/06-seguridad-multitenant-base/08-respuesta-claude-correccion-errores-users-id.md
```

## Confirma

1. PATCH y DELETE usan el mismo mapper.
2. `"Usuario no encontrado"` devuelve 404.
3. Inexistente, cross-tenant y SUPER_ADMIN no administrable son indistinguibles.
4. Errores de dominio conocidos usan lista blanca exacta.
5. Error Prisma o conectividad devuelve 500 genérico.
6. No se expone `error.message`, stack, SQL, constraint, host, URL o conexión.
7. Valores que no son `Error` tampoco filtran datos.
8. No se modificó autorización core, schema, billing, entorno ni otros módulos.
9. Las 9 pruebas prueban realmente el mapper y el wiring.
10. No queda ningún defecto crítico, alto o medio abierto.

## Riesgos

Clasifica los riesgos restantes:

* falta de prueba HTTP/DB real;
* doble lectura DB;
* middleware JWT;
* módulos todavía no migrados.

Determina si bloquean:

* commit;
* producción.

## Alcance del commit

Si apruebas, lista todos los archivos de la fase:

```text
src/lib/authorization-core.ts
src/lib/authorization.ts
src/lib/authorization-response.ts
src/lib/tenant-access-response.ts
src/domains/organizations/tenant.service.ts
src/domains/organizations/user-management.service.ts
src/domains/organizations/user-management-error.ts
src/domains/platform/permissions.ts
src/app/api/platform/tenant-users/route.ts
src/app/api/users/[id]/route.ts
tests/unit/authorization.test.ts
tests/unit/user-management-error.test.ts
docs/programa-mejora/06-seguridad-multitenant-base/
```

Confirma si existe otro archivo autorizado.

No incluir entorno, schema, migraciones, billing, paquetes ni cambios ajenos.

Mensaje propuesto:

```text
feat(auth): centralize tenant authorization
```

## Informe breve

Entrega:

1. Resultado de revisión.
2. R-1/F-2.
3. Pruebas.
4. Riesgos restantes.
5. Lista exacta para commit.
6. Veredicto:

   * APROBADA.
   * APROBADA CON RIESGOS MENORES.
   * REQUIERE CORRECCIONES.

No modifiques código. No hagas commit, push ni tags. Detente después del informe.
