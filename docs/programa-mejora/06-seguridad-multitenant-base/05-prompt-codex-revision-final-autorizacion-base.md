# FASE 3C — REVISIÓN FINAL DE LA BASE DE AUTORIZACIÓN MULTI-TENANT

## Documentación

Guarda este prompt en:

`docs/programa-mejora/06-seguridad-multitenant-base/05-prompt-codex-revision-final-autorizacion-base.md`

Guarda el informe final en:

`docs/programa-mejora/06-seguridad-multitenant-base/06-respuesta-codex-revision-final-autorizacion-base.md`

Solo puedes modificar esos dos documentos.

No modifiques código, pruebas, configuración ni documentos 01–04.

---

Revisa en modo solo lectura la base común de autorización implementada por Codex y corregida por Claude.

Objetivo:

* decidir si puede hacerse commit;
* verificar el cierre de H-1;
* confirmar que no quedan defectos críticos, altos o medios;
* evitar repeticiones innecesarias.

## Política de eficiencia

* No ejecutes suite completa.
* No uses PostgreSQL remoto.
* No ejecutes Prisma.
* No repitas typecheck o lint salvo inconsistencia concreta.
* Ejecuta `tests/unit/authorization.test.ts` como máximo una vez.
* No repitas una prueba verde.
* No releas billing ni fases cerradas.
* Si encuentras un error real dentro del alcance, emite `REQUIERE CORRECCIONES`; no modifiques código.

## Archivos obligatorios

Lee:

* `02-respuesta-codex-auditoria-correccion-autorizacion-base.md`
* `03-prompt-claude-revision-correccion-autorizacion-base.md`
* `04-respuesta-claude-revision-correccion-autorizacion-base.md`

Inspecciona:

```text
src/lib/authorization-core.ts
src/lib/authorization.ts
src/lib/authorization-response.ts
src/lib/tenant-access-response.ts
src/domains/organizations/tenant.service.ts
src/domains/organizations/user-management.service.ts
src/domains/platform/permissions.ts
src/app/api/platform/tenant-users/route.ts
src/app/api/users/[id]/route.ts
tests/unit/authorization.test.ts
```

Consulta `auth.ts` únicamente para verificar el refresco JWT descrito por Claude.

## 1. Git

Ejecuta:

```text
git status --short
git log -2 --oneline
git diff --check
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD `2961225 feat(billing): add durable notification outbox`;
* sin staged diff;
* solo cambios de esta fase;
* billing, schema, migraciones, paquetes y entorno intactos.

## 2. Verificaciones críticas

Confirma:

1. La autorización usa `session.user.id` como identidad mínima.
2. Rol, tenant, actividad y licencia salen de DB.
3. Usuario eliminado falla cerrado.
4. Fallo de DB nunca reutiliza claims antiguos.
5. Rol reducido pierde permisos.
6. Cambio de tenant invalida el anterior.
7. Rol desconocido falla cerrado.
8. SUPER_ADMIN puede existir sin tenant.
9. SUPER_ADMIN necesita target explícito.
10. ADMIN solo opera en su tenant.
11. CONSEJO y RESIDENTE no elevan permisos.
12. Tenant o suscripción bloqueada niegan acceso.
13. Inputs del cliente no conceden permisos.
14. Recursos cross-tenant son indistinguibles de inexistentes.
15. Middleware no se usa como única seguridad.
16. Las rutas representativas revalidan en servidor.

## 3. H-1

Revisa el cambio en:

`src/domains/organizations/user-management.service.ts`

Confirma que:

* el objetivo se resuelve usando `id + tenantId`;
* el rol actual del objetivo se valida;
* un SUPER_ADMIN no puede modificarse ni desactivarse desde una ruta tenant;
* se responde igual que para un usuario inexistente;
* no se revela que el objetivo es SUPER_ADMIN;
* ADMIN, CONSEJO y RESIDENTE siguen siendo administrables según la política existente.

## 4. `/api/users/[id]`

Confirma para GET, PATCH y DELETE:

* ADMIN se revalida contra DB;
* tenant sale de la identidad autorizada;
* otro tenant recibe 404 indistinguible;
* PATCH no permite cambiar tenant;
* PATCH no permite elevar a SUPER_ADMIN;
* DELETE no puede afectar otro tenant;
* DELETE/PATCH no pueden afectar un SUPER_ADMIN;
* auto-desactivación y último ADMIN siguen protegidos.

## 5. `/api/platform/tenant-users`

Confirma:

* SUPER_ADMIN actual validado en DB;
* target obligatorio;
* target existente;
* sin fallback al tenant de sesión;
* SUPER_ADMIN con claim antiguo falla;
* no se exponen datos sensibles.

## 6. Stale JWT

Evalúa la conclusión de Claude:

* callback JWT refresca claims desde DB;
* rutas migradas vuelven a consultar DB;
* `assertSessionClaimsCurrent` es defensa adicional;
* no genera un bloqueo permanente;
* una carrera entre las dos lecturas falla cerrada;
* no hay fallback a claims antiguos.

Clasifica:

* CONFIRMADA;
* CONFIRMADA CON MATICES;
* INCORRECTA.

## 7. Pruebas

Revisa las 26 pruebas y confirma que ejecutan la lógica real.

Atención especial:

* usuario eliminado;
* fallo del repositorio;
* rol reducido;
* cambio de tenant;
* SUPER_ADMIN sin tenant;
* target inexistente;
* SUPER_ADMIN con tenant accidental;
* ADMIN real no bloqueado por un claim reducido;
* recurso cross-tenant;
* tenant y suscripción suspendidos.

Puedes ejecutar una sola vez:

```text
node --import tsx --test tests/unit/authorization.test.ts
```

Resultado esperado:

```text
26/26 PASS
```

No repitas si pasa.

## 8. Riesgos R-1 a R-4

Clasifica:

| ID | Severidad real | Bloquea commit | Bloquea producción | Acción |
| -- | -------------: | -------------: | -----------------: | ------ |

* R-1: passthrough de `error.message` en PATCH/DELETE.
* R-2: doble lectura DB.
* R-3: middleware basado en JWT.
* R-4: falta de integración real para H-1/IDOR.

Determina si R-1 debe corregirse antes del commit. Solo debe bloquear si puede filtrar información sensible o internals de Prisma de forma realista.

## 9. Módulos pendientes

Confirma que la base común puede comprometerse aunque aún falte migrar:

* PQRS.
* Usuarios collection.
* Invitaciones.
* Dashboard/reportes.
* Perfil.
* Tenant/configuración.
* Notificaciones.
* Plataforma SUPER_ADMIN restante.
* Uploads.

Estos módulos serán fases separadas y no deben bloquear este commit salvo que la base común sea incorrecta.

## 10. Alcance eventual del commit

Si apruebas, lista exactamente todos los archivos modificados o creados de esta fase.

Debe incluir como mínimo:

```text
src/lib/authorization-core.ts
src/lib/authorization.ts
src/lib/authorization-response.ts
src/lib/tenant-access-response.ts
src/domains/organizations/tenant.service.ts
src/domains/organizations/user-management.service.ts
src/domains/platform/permissions.ts
src/app/api/platform/tenant-users/route.ts
src/app/api/users/[id]/route.ts
tests/unit/authorization.test.ts
docs/programa-mejora/06-seguridad-multitenant-base/
```

Confirma si existe algún otro archivo autorizado.

No incluir:

* `.env`;
* `.env.test`;
* schema;
* migraciones;
* billing;
* package files;
* temporales;
* logs;
* archivos ajenos.

## 11. Mensaje de commit

Si apruebas:

```text
feat(auth): centralize tenant authorization
```

## Informe final

Entrega:

1. Resumen.
2. Git.
3. Verificaciones críticas.
4. H-1.
5. Rutas representativas.
6. Stale JWT.
7. Pruebas.
8. Riesgos R-1–R-4.
9. Hallazgos nuevos.
10. Módulos pendientes.
11. ¿Bloquea commit?
12. ¿Bloquea producción?
13. Lista exacta para commit.
14. Comandos `git add` explícitos.
15. Mensaje.
16. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

* Guarda el informe en el documento 06.
* No modifiques código.
* No hagas commit.
* No hagas push.
* No crees tags.
* No ejecutes suite completa.
* No inicies otro módulo.
* Detente después del informe.
