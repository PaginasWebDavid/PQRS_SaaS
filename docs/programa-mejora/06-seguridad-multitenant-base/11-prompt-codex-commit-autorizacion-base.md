# FASE 3F — COMMIT DE LA BASE DE AUTORIZACIÓN MULTI-TENANT

## Documentación

Antes del staging, guarda este prompt completo en:

`docs/programa-mejora/06-seguridad-multitenant-base/11-prompt-codex-commit-autorizacion-base.md`

Crea también:

`docs/programa-mejora/06-seguridad-multitenant-base/12-respuesta-codex-commit-autorizacion-base.md`

Guarda allí el informe del commit antes de ejecutarlo.

Incluye esta nota:

`El hash final se informa únicamente en la respuesta de la sesión para evitar modificar el commit que contiene este documento.`

No modifiques documentos 01–10.

---

La Fase 3E fue:

`APROBADA CON RIESGOS MENORES`

Realiza únicamente:

1. Verificación de Git.
2. Staging explícito.
3. Revisión del staged diff.
4. Revisión de secretos.
5. Commit local.
6. Verificación posterior.

## Eficiencia máxima

No ejecutes:

* pruebas;
* suite completa;
* typecheck;
* lint;
* Prisma;
* migraciones;
* build;
* servidor;
* conteos de base.

No modifiques código ni pruebas.

## 1. Estado inicial

Ejecuta:

```text
git status --short
git log -3 --oneline
git diff --check
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD sigue en:
  `2961225 feat(billing): add durable notification outbox`
* no existe staged diff;
* los cambios corresponden únicamente a esta fase;
* billing, schema, migraciones, paquetes y entorno están intactos.

Si existe un cambio inesperado, no lo incluyas. Si no puede aislarse, marca `BLOQUEADO`.

## 2. Archivos autorizados

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

La carpeta de documentación debe contener los documentos 01–12.

## 3. Archivos excluidos

No incluir:

```text
.env
.env.test
prisma/schema.prisma
prisma/migrations/
package.json
package-lock.json
```

Tampoco incluir:

* billing;
* logs;
* temporales;
* resultados de pruebas;
* archivos generados;
* documentos de otras fases;
* cambios ajenos.

## 4. Documento 12

Antes del staging, guarda en el documento 12:

1. Objetivo.
2. HEAD inicial.
3. Veredicto previo.
4. Riesgos menores aceptados.
5. Archivos autorizados.
6. Archivos excluidos.
7. Revisión de secretos.
8. Mensaje del commit.
9. Confirmación de no pruebas.
10. Confirmación de no push.
11. Confirmación de no tags.

Registra que este commit no declara todavía seguridad global completa: faltan migrar los demás módulos y realizar integración real antes de producción.

## 5. Staging explícito

Ejecuta únicamente:

```text
git add -- src/lib/authorization-core.ts
git add -- src/lib/authorization.ts
git add -- src/lib/authorization-response.ts
git add -- src/lib/tenant-access-response.ts

git add -- src/domains/organizations/tenant.service.ts
git add -- src/domains/organizations/user-management.service.ts
git add -- src/domains/organizations/user-management-error.ts
git add -- src/domains/platform/permissions.ts

git add -- src/app/api/platform/tenant-users/route.ts
git add -- "src/app/api/users/[id]/route.ts"

git add -- tests/unit/authorization.test.ts
git add -- tests/unit/user-management-error.test.ts

git add -- docs/programa-mejora/06-seguridad-multitenant-base
```

No uses:

```text
git add .
git add -A
git commit -a
```

## 6. Inspección staged

Ejecuta:

```text
git status --short
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git diff --cached
```

Confirma:

* solo están staged los archivos autorizados;
* documentos 01–12 incluidos;
* no están staged entorno, schema, migraciones, billing ni paquetes;
* no hay secretos;
* no hay emails, tokens, claves, connection strings, stacks ni datos personales innecesarios.

Si existen errores reales en `git diff --cached --check`, marca `BLOQUEADO`.

Avisos históricos LF/CRLF pueden documentarse sin modificar archivos.

## 7. Commit

Ejecuta exactamente:

```text
git commit -m "feat(auth): centralize tenant authorization"
```

No uses amend.

No hagas push.

No crees tags.

## 8. Verificación posterior

Ejecuta:

```text
git log -1 --oneline
git show --stat --oneline --summary HEAD
git show --name-status --format= HEAD
git status --short
git diff --cached --name-status
```

Confirma:

* mensaje exacto;
* únicamente archivos autorizados;
* documentos 01–12 incluidos;
* no queda staged diff;
* no queda cambio autorizado pendiente;
* no se ejecutaron pruebas;
* no se hizo push;
* no se crearon tags;
* no se inició otro módulo.

## Informe final

Entrega:

1. HEAD inicial.
2. Archivos staged.
3. Resultado del diff check.
4. Revisión de secretos.
5. Commit creado.
6. Mensaje.
7. Hash final.
8. Archivos incluidos.
9. Archivos excluidos.
10. Estado posterior.
11. No pruebas.
12. No push.
13. No tags.
14. Estado:

* `COMMIT CREADO`.
* `BLOQUEADO`.
* `NO CREADO`.

Detente después del informe.
