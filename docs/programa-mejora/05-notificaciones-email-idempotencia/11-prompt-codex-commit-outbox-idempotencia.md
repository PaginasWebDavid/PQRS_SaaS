# FASE 2U — COMMIT DEL OUTBOX DURABLE DE NOTIFICACIONES Y EMAILS

## Documentación automática

Antes de ejecutar staging o commit:

1. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/11-prompt-codex-commit-outbox-idempotencia.md`

2. Guarda allí el contenido completo y exacto de este prompt.

3. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/12-respuesta-codex-commit-outbox-idempotencia.md`

4. Antes del commit, guarda en el documento 12 el informe previsto de ejecución e incluye esta nota:

```text
El hash final se informa únicamente en la respuesta de la sesión para evitar modificar el commit que contiene este documento.
```

No modifiques los documentos 01 a 10.

---

Actúa como responsable de empaquetar en un único commit local la subfase del outbox durable de notificaciones y emails.

La revisión final de Codex emitió:

```text
APROBADA CON CONDICIÓN OPERATIVA
```

La condición operativa:

* no bloquea este commit;
* sí bloquea declarar producción lista;
* exige antes del despliegue:

  * base de pruebas físicamente separada;
  * `.env.test` apuntando exclusivamente a esa base;
  * suite completa verde `359/359`;
  * aplicación controlada de la migración;
  * comprobación de limpieza.

Esta fase es exclusivamente de:

* verificación de Git;
* creación de documentos 11 y 12;
* staging explícito;
* inspección del staged diff;
* revisión de secretos;
* commit local.

## Política de optimización

No ejecutes:

* suite completa;
* pruebas específicas;
* typecheck;
* lint;
* Prisma validate;
* Prisma generate;
* migraciones;
* conteos de base.

La implementación ya fue revisada. No hubo cambios posteriores a la aprobación final.

Solo ejecuta verificaciones de Git y del contenido que será comprometido.

## Restricciones

No debes:

* Modificar código.
* Modificar pruebas.
* Modificar schema.
* Modificar migración.
* Modificar documentos 01 a 10.
* Modificar `.env`.
* Modificar `.env.test`.
* Modificar package files.
* Modificar runner o guard.
* Ejecutar `db push`.
* Ejecutar migraciones.
* Ejecutar seeds.
* Ejecutar build.
* Levantar servidor.
* Ejecutar cron.
* Enviar emails.
* Llamar a Mercado Pago.
* Usar `git add .`.
* Usar `git add -A`.
* Usar `git commit -a`.
* Usar amend.
* Hacer push.
* Crear tags.
* Iniciar otra subfase.

# 1. Estado inicial

Guarda primero este prompt.

Después ejecuta:

```text
git status --short
git log -3 --oneline
git diff --check
git diff --stat
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD sigue siendo:

```text
b924f64 feat(billing): make overdue cron atomic and concurrency-safe
```

* No existe commit nuevo.
* No existe staged diff.
* Los cambios pendientes pertenecen únicamente al outbox y sus documentos.
* No hay cambios inesperados.

Si existe un cambio inesperado fuera del alcance autorizado:

* no lo reviertas;
* no lo incluyas;
* si no puede aislarse con staging explícito, marca `BLOQUEADO`.

# 2. Condición operativa

Registra en el documento 12:

```text
Este commit no declara el sistema listo para producción. Antes del despliegue se requiere una base de pruebas físicamente separada, una suite completa verde 359/359 en infraestructura estable y la aplicación controlada de la migración.
```

No intentes resolver esa condición en esta fase.

# 3. Archivos exactos autorizados

## Schema y migración

```text
prisma/schema.prisma
prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql
```

## Implementación

```text
src/domains/billing/billing.service.ts
src/domains/billing/billing-outbox-policy.ts
src/domains/billing/billing-outbox.service.ts
src/domains/notifications/notification.service.ts
src/lib/email.ts
```

## Pruebas

```text
tests/unit/billing-outbox-policy.test.ts
tests/billing-outbox-idempotency.test.ts
tests/billing-cron-atomicity.test.ts
```

## Documentación

Todos los documentos 01 a 12 de:

```text
docs/programa-mejora/05-notificaciones-email-idempotencia/
```

Antes del staging, confirma que la carpeta contiene únicamente:

* prompts;
* informes;
* diagnósticos;
* revisiones técnicas;
* documentación del commit.

# 4. Archivos excluidos

No incluyas:

```text
.env
.env.test
package.json
package-lock.json
```

Tampoco incluyas:

* migraciones históricas;
* documentos de otras fases;
* archivos generados;
* logs;
* dumps;
* screenshots;
* resultados de pruebas;
* temporales;
* cambios ajenos;
* archivos de configuración local.

# 5. Crear el documento 12

Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/12-respuesta-codex-commit-outbox-idempotencia.md`

Incluye:

1. Objetivo.
2. HEAD inicial.
3. Verificación del working tree.
4. Veredicto previo.
5. Condición operativa.
6. Archivos autorizados.
7. Archivos excluidos.
8. Revisión de secretos.
9. Staging explícito planeado.
10. Mensaje exacto.
11. Confirmación de no push.
12. Confirmación de no tags.
13. Nota sobre el hash final.

No incluyas un hash provisional.

# 6. Staging explícito

Ejecuta únicamente:

```text
git add -- prisma/schema.prisma
git add -- prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql

git add -- src/domains/billing/billing.service.ts
git add -- src/domains/billing/billing-outbox-policy.ts
git add -- src/domains/billing/billing-outbox.service.ts
git add -- src/domains/notifications/notification.service.ts
git add -- src/lib/email.ts

git add -- tests/unit/billing-outbox-policy.test.ts
git add -- tests/billing-outbox-idempotency.test.ts
git add -- tests/billing-cron-atomicity.test.ts

git add -- docs/programa-mejora/05-notificaciones-email-idempotencia
```

No uses staging global.

# 7. Inspección completa del staging

Ejecuta:

```text
git status --short
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git diff --cached
```

Confirma que el staged diff contiene exclusivamente:

* schema autorizado;
* una migración nueva;
* cinco archivos de implementación;
* tres archivos de pruebas;
* documentos 01 a 12.

Confirma expresamente que no están staged:

* `.env`;
* `.env.test`;
* package files;
* migraciones históricas;
* archivos generados;
* documentos de fases anteriores;
* archivos ajenos.

## Diff check

Si `git diff --cached --check` muestra únicamente avisos cosméticos históricos de Markdown o LF/CRLF:

* documéntalos;
* continúa;
* no modifiques documentos históricos.

Si muestra errores reales de whitespace en TypeScript, schema, SQL o pruebas:

* no modifiques archivos;
* marca `BLOQUEADO`.

# 8. Revisión de secretos

Inspecciona el staged diff y confirma que no contiene:

* contraseñas;
* claves reales de Supabase;
* service-role keys;
* JWT secrets;
* tokens;
* connection strings;
* `CRON_SECRET` real;
* API key real de Resend;
* token real de Mercado Pago;
* firmas HMAC;
* contenido real de `.env.test`;
* emails personales;
* payloads reales del proveedor.

Son aceptables:

* nombres de variables;
* claves ficticias claramente marcadas para pruebas;
* dominios `example.test`;
* IDs generados en fixtures.

# 9. Commit

Si todas las verificaciones pasan, ejecuta exactamente:

```text
git commit -m "feat(billing): add durable notification outbox"
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

* El mensaje es exacto.
* Solo contiene archivos autorizados.
* La migración nueva está incluida.
* Los documentos 01 a 12 están incluidos.
* No existe staged diff.
* No queda ningún cambio autorizado pendiente.
* Los cambios ajenos permanecen fuera.
* No se hizo push.
* No se crearon tags.
* No se inició otra subfase.

# Informe final de sesión

Entrega:

1. Resumen.
2. HEAD inicial.
3. Veredicto previo.
4. Condición operativa.
5. Verificación del working tree.
6. Lista exacta staged.
7. Resultado de `git diff --cached --check`.
8. Revisión de secretos.
9. Commit creado.
10. Mensaje exacto.
11. Hash final.
12. Archivos incluidos.
13. Archivos excluidos.
14. Cambios que permanecen fuera.
15. Estado posterior.
16. Confirmación de no pruebas repetidas.
17. Confirmación de no push.
18. Confirmación de no tags.
19. Estado:

* `COMMIT CREADO`.
* `BLOQUEADO`.
* `NO CREADO`.

## Finalización

1. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/11-prompt-codex-commit-outbox-idempotencia.md`

2. Confirma que el informe quedó guardado en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/12-respuesta-codex-commit-outbox-idempotencia.md`

3. No modifiques implementación ni pruebas.

4. No ejecutes pruebas.

5. No hagas push.

6. No crees tags.

7. No inicies otra subfase.

8. Detente después del informe.
