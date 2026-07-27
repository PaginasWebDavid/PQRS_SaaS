# FASE 2O — COMMIT DEL CRON ATÓMICO Y SEGURO ANTE CONCURRENCIA

## Documentación automática

Antes de ejecutar operaciones de staging o commit:

1. Crea:

`docs/programa-mejora/04-cron-atomicidad/07-prompt-codex-commit-cron-cas-atomicidad.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/04-cron-atomicidad/08-respuesta-codex-commit-cron-cas-atomicidad.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques los documentos 01 a 06.

---

Actúa como responsable de empaquetar en un único commit local la subfase del cron con CAS, atomicidad y control de concurrencia.

Codex realizó las últimas correcciones de código. Posteriormente, Claude efectuó una revisión independiente de solo lectura con el veredicto:

`APROBADA CON RIESGOS MENORES`

La independencia de revisión ya está satisfecha.

Esta fase es únicamente de:

* verificación final del working tree;
* creación de documentos 07 y 08;
* staging explícito;
* inspección del staged diff;
* commit local.

No modifiques implementación ni pruebas.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/04-cron-atomicidad/04-respuesta-codex-revision-correccion-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/05-prompt-claude-revision-final-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/06-respuesta-claude-revision-final-cron-cas-atomicidad.md`
* `docs/programa-mejora/03-precedencia-cron/22-respuesta-codex-commit-precedencia-cobertura.md`

## Restricciones

No debes:

* Modificar código.
* Modificar pruebas.
* Modificar documentos 01 a 06.
* Modificar schema.
* Crear o aplicar migraciones.
* Modificar `.env`.
* Modificar `.env.test`.
* Modificar package files.
* Modificar el runner o guard.
* Ejecutar build.
* Levantar servidor.
* Ejecutar `db push`.
* Ejecutar seeds.
* Ejecutar el cron real.
* Enviar emails.
* Llamar a Mercado Pago.
* Hacer push.
* Crear tags.
* Usar `git add .`.
* Usar `git add -A`.
* Usar `git commit -a`.
* Usar amend.

No vuelvas a ejecutar toda la suite salvo que detectes que el código o las pruebas cambiaron después del informe 06.

# 1. Estado inicial

Guarda primero este prompt.

Después ejecuta:

```text
git status --short
git log -2 --oneline
git diff --check
git diff --stat
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD continúa en:

```text
a8a9a2a feat(billing): enforce payment precedence and access coverage
```

* No existe un commit nuevo.
* No hay staged diff previo.
* Los únicos cambios de implementación son:

  * `src/domains/billing/cron-decision.ts`
  * `src/domains/billing/billing.service.ts`
  * `src/app/api/cron/overdue-rules/route.ts`
* Las únicas pruebas nuevas o modificadas son:

  * `tests/unit/cron-decision.test.ts`
  * `tests/billing-cron-atomicity.test.ts`
* La documentación corresponde únicamente a:

  * `docs/programa-mejora/04-cron-atomicidad/`
* No existen cambios en schema, migraciones, package files, entorno, UI, métricas o servicios definitivos de Notification/email.

Si existe un cambio de implementación inesperado, detente y marca `BLOQUEADO`.

# 2. Riesgos aceptados

Confirma que el informe 06 aprobó como no bloqueantes:

* N-01: `errorDetails` puede contener hasta el límite del lote, sin PII.
* N-02: starvation intra-categoría solo bajo más de 125 fallos permanentes.
* N-03: cupos vacíos no redistribuidos.
* N-04: CAS conservador ante una frontera irrelevante.

No corrijas estos puntos en esta fase.

# 3. Archivos exactos autorizados

## Implementación

```text
src/domains/billing/cron-decision.ts
src/domains/billing/billing.service.ts
src/app/api/cron/overdue-rules/route.ts
```

## Pruebas

```text
tests/unit/cron-decision.test.ts
tests/billing-cron-atomicity.test.ts
```

## Documentación

Los documentos 01 a 08 de:

```text
docs/programa-mejora/04-cron-atomicidad/
```

Confirma que la carpeta contiene únicamente documentación técnica y no contiene credenciales, tokens, claves, dumps, logs ni datos personales innecesarios.

# 4. Archivos excluidos

No incluyas:

```text
.env
.env.test
prisma/schema.prisma
prisma/migrations/
package.json
package-lock.json
```

Tampoco incluyas documentos de otras fases, eliminaciones antiguas, temporales, logs, screenshots, dumps, resultados de pruebas ni cambios ajenos.

# 5. Crear el informe 08 antes del staging

Crea:

`docs/programa-mejora/04-cron-atomicidad/08-respuesta-codex-commit-cron-cas-atomicidad.md`

Incluye:

1. Objetivo del commit.
2. HEAD inicial.
3. Verificación del working tree.
4. Archivos autorizados.
5. Archivos excluidos.
6. Revisión de secretos.
7. Riesgos bajos aceptados.
8. Staging explícito planeado.
9. Mensaje exacto del commit.
10. Confirmación de no push.
11. Confirmación de no tags.
12. Esta nota:

```text
El hash final se informa únicamente en la respuesta de la sesión para evitar que el documento modifique el commit que lo contiene.
```

No incluyas un hash provisional.

# 6. Staging explícito

Ejecuta únicamente:

```text
git add -- src/domains/billing/cron-decision.ts
git add -- src/domains/billing/billing.service.ts
git add -- src/app/api/cron/overdue-rules/route.ts
git add -- tests/unit/cron-decision.test.ts
git add -- tests/billing-cron-atomicity.test.ts
git add -- docs/programa-mejora/04-cron-atomicidad
```

No uses staging global.

# 7. Revisión completa del staging

Ejecuta:

```text
git status --short
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git diff --cached
```

Confirma que están staged únicamente:

* Los tres archivos de implementación.
* Los dos archivos de pruebas.
* Los documentos 01 a 08 de `docs/programa-mejora/04-cron-atomicidad/`.

Confirma expresamente que no están staged:

* `.env`.
* `.env.test`.
* Schema.
* Migraciones.
* Package files.
* Documentos de fases anteriores.
* Archivos ajenos.

Si `git diff --cached --check` muestra únicamente warnings cosméticos históricos de Markdown, documéntalos y continúa.

Si muestra errores en TypeScript o pruebas, detente y marca `BLOQUEADO`.

# 8. Revisión de secretos

Inspecciona el staged diff y confirma que no contiene:

* contraseñas;
* claves de Supabase;
* service-role keys;
* tokens;
* connection strings completas;
* secreto real del cron;
* API keys de Resend;
* tokens de Mercado Pago;
* firmas HMAC;
* contenido de `.env.test`;
* correos personales innecesarios.

Los nombres de variables y valores ficticios de pruebas son aceptables.

# 9. Commit

Si todas las verificaciones pasan, ejecuta exactamente:

```text
git commit -m "feat(billing): make overdue cron atomic and concurrency-safe"
```

Crea exactamente un commit.

No uses amend.

No hagas push.

No crees tags.

# 10. Verificación posterior

Ejecuta:

```text
git log -1 --oneline
git show --stat --oneline --summary HEAD
git show --name-status --format= HEAD
git status --short
git diff --cached --name-status
```

Confirma:

* Mensaje exacto.
* Solo archivos autorizados.
* Documentos 01–08 incluidos.
* No queda staged diff.
* No queda cambio autorizado pendiente.
* Los cambios ajenos continúan fuera.
* No se hizo push.
* No se crearon tags.
* No se inició la subfase de notificaciones.

# Informe final de la sesión

Entrega:

1. Resumen.
2. HEAD inicial.
3. Verificación del working tree.
4. Riesgos aceptados.
5. Lista exacta staged.
6. Resultado de `git diff --cached --check`.
7. Revisión de secretos.
8. Commit creado.
9. Mensaje exacto.
10. Hash final del commit.
11. Archivos incluidos.
12. Archivos excluidos.
13. Cambios que permanecen fuera.
14. Estado posterior.
15. Confirmación de no push.
16. Confirmación de no tags.
17. Estado:

* COMMIT CREADO.
* BLOQUEADO.
* NO CREADO.

## Finalización

1. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/04-cron-atomicidad/07-prompt-codex-commit-cron-cas-atomicidad.md`

2. Confirma que el informe quedó guardado en:

`docs/programa-mejora/04-cron-atomicidad/08-respuesta-codex-commit-cron-cas-atomicidad.md`

3. No modifiques código.

4. No hagas push.

5. No crees tags.

6. No inicies la subfase de notificaciones.

7. Detente después del informe.
