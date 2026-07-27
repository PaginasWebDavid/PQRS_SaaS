# FASE 2K — COMMIT DE PRECEDENCIA, COBERTURA Y TRANSACCIONALIDAD

## Documentación automática

Antes de realizar cualquier operación Git:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/21-prompt-codex-commit-precedencia-cobertura.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/22-respuesta-codex-commit-precedencia-cobertura.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques documentos anteriores.

---

Actúa como responsable de empaquetar en un commit la Subfase aprobada de precedencia, cobertura y transaccionalidad de facturación.

Claude realizó la revisión independiente final y emitió:

`APROBADA CON RIESGOS MENORES`

No debes modificar implementación ni pruebas. Esta fase es únicamente de verificación, staging explícito y commit.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/18-respuesta-codex-correccion-efecto-economico-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/19-prompt-claude-revision-final-economia-acceso.md`
* `docs/programa-mejora/03-precedencia-cron/20-respuesta-claude-revision-final-economia-acceso.md`
* `docs/programa-mejora/02-facturacion/24-respuesta-claude-commit-idempotencia-atomicidad.md`

## Restricciones

No debes:

* Modificar código.
* Modificar pruebas.
* Modificar documentos anteriores.
* Modificar schema.
* Crear o aplicar migraciones.
* Modificar `.env`.
* Modificar `.env.test`.
* Modificar package files.
* Ejecutar build.
* Ejecutar servidor.
* Ejecutar `db push`.
* Ejecutar seeds.
* Hacer push.
* Crear tags.
* Iniciar el cron.
* Usar `git add .`.
* Usar `git add -A`.

Solo debes:

* Verificar el estado.
* Crear los documentos 21 y 22.
* Añadir al staging los archivos explícitamente aprobados.
* Revisar el staged diff.
* Crear un único commit.

# 1. Verificación inicial

Ejecuta:

```text
git status --short
git log -1 --oneline
git diff --check
git diff --stat
git diff --name-status
```

Confirma:

* HEAD continúa en:

```text
5e4be50 feat(billing): enforce idempotent atomic webhook effects
```

* No existe un commit posterior.
* `prisma/schema.prisma` no cambió.
* No existe migración nueva.
* `package.json` y `package-lock.json` no cambiaron.
* `.env` y `.env.test` no cambiaron.
* Los cambios de implementación se limitan a:

  * precedencia;
  * cobertura;
  * webhook de Mercado Pago;
  * reactivación;
  * pruebas.
* No existen cambios del cron, notificaciones, email, métricas, UI o cancelación definitiva.

Si aparece un cambio inesperado de implementación, detente y marca el estado como `BLOQUEADO`.

# 2. Archivos exactos permitidos

## Implementación

```text
src/domains/billing/precedence.ts
src/domains/billing/mercado-pago.service.ts
src/domains/platform/tenant-admin.service.ts
```

## Pruebas

```text
tests/unit/billing-precedence.test.ts
tests/billing-webhook-idempotency.test.ts
```

## Documentación

Todos los archivos `.md` de:

```text
docs/programa-mejora/03-precedencia-cron/
```

Esto incluye los documentos 01 a 22.

Antes del staging, confirma que esa carpeta contiene únicamente:

* prompts;
* respuestas;
* diagnósticos;
* revisiones;
* informes técnicos.

Confirma que no contiene:

* credenciales;
* URLs completas con contraseña;
* tokens;
* firmas;
* secretos;
* dumps;
* logs de entorno;
* datos personales innecesarios.

# 3. Exclusiones obligatorias

No incluyas:

```text
.env
.env.test
prisma/schema.prisma
prisma/migrations/
package.json
package-lock.json
```

Tampoco incluyas:

* archivos temporales;
* logs;
* screenshots;
* dumps;
* artefactos de pruebas;
* cambios ajenos;
* eliminaciones antiguas de documentación fuera de esta carpeta;
* carpetas no relacionadas que permanezcan sin trackear.

Las eliminaciones antiguas o cambios ajenos del working tree deben permanecer fuera del commit.

# 4. Staging explícito

Ejecuta únicamente:

```text
git add -- src/domains/billing/precedence.ts
git add -- src/domains/billing/mercado-pago.service.ts
git add -- src/domains/platform/tenant-admin.service.ts
git add -- tests/unit/billing-precedence.test.ts
git add -- tests/billing-webhook-idempotency.test.ts
git add -- docs/programa-mejora/03-precedencia-cron
```

No uses ningún comando de staging global.

# 5. Revisión del staging

Ejecuta:

```text
git status --short
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git diff --cached
```

Verifica que el staged diff contenga exclusivamente:

* Los tres archivos de implementación.
* Los dos archivos de pruebas.
* Los documentos de `03-precedencia-cron`.

Confirma expresamente que no están staged:

* `.env`.
* `.env.test`.
* Schema.
* Migraciones.
* Package files.
* Cambios del cron.
* Cambios ajenos.
* Eliminaciones fuera de la carpeta autorizada.

## Warnings de Markdown

Si `git diff --cached --check` muestra únicamente:

* trailing whitespace en Markdown;
* ausencia de salto de línea final en Markdown;
* advertencias cosméticas de documentación;

no modifiques documentos históricos solo para corregirlas.

Documenta los warnings.

Si muestra errores de whitespace en TypeScript o pruebas, detente y marca `BLOQUEADO`. No modifiques código en esta fase.

# 6. Verificación de secretos

Inspecciona el staged diff y confirma que no contiene:

* contraseñas;
* connection strings completas;
* service-role keys;
* access tokens;
* firmas HMAC reales;
* datos de tarjetas;
* correos personales innecesarios;
* contenido de `.env.test`.

Las URLs sanitizadas o nombres de variables sin valores secretos son aceptables.

# 7. Commit

Si todas las verificaciones pasan, crea exactamente un commit con:

```text
feat(billing): enforce payment precedence and access coverage
```

Ejecuta:

```text
git commit -m "feat(billing): enforce payment precedence and access coverage"
```

No uses amend.

No hagas push.

No crees tags.

# 8. Verificación posterior

Después del commit ejecuta:

```text
git log -1 --oneline
git show --stat --oneline --summary HEAD
git show --name-status --format= HEAD
git status --short
```

Confirma:

* El mensaje es exacto.
* El commit contiene solo los archivos autorizados.
* Los cambios ajenos siguen fuera del commit.
* No existe staged diff restante.
* No se hizo push.
* No se crearon tags.

No es necesario publicar el hash dentro del documento versionado si eso provoca que el propio informe quede desactualizado antes del commit. Puedes mostrar el hash únicamente en la respuesta final de la sesión.

# 9. Informe final

Entrega:

1. Resumen.
2. HEAD inicial.
3. Verificación del working tree.
4. Archivos autorizados.
5. Archivos excluidos.
6. Revisión de documentación.
7. Revisión de secretos.
8. Comandos de staging ejecutados.
9. Resultado de `git diff --cached --check`.
10. Lista exacta staged.
11. Commit creado.
12. Mensaje del commit.
13. Hash del commit en la respuesta de la sesión.
14. Lista exacta incluida en el commit.
15. Cambios que permanecen fuera.
16. Estado posterior.
17. Confirmación de no push.
18. Confirmación de no tags.
19. Estado:

* COMMIT CREADO.
* BLOQUEADO.
* NO CREADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/03-precedencia-cron/22-respuesta-codex-commit-precedencia-cobertura.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/03-precedencia-cron/21-prompt-codex-commit-precedencia-cobertura.md`

3. Asegúrate de que ambos estén incluidos en el staging antes del commit.

4. No modifiques implementación.

5. No hagas push.

6. No inicies el cron.

7. Detente después del informe.
