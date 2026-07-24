# FASE 1L — COMMIT DE IDEMPOTENCIA Y ATOMICIDAD DE FACTURACIÓN

## Documentación automática

Antes de ejecutar acciones de Git:

1. Crea:

`docs/programa-mejora/02-facturacion/23-prompt-claude-commit-idempotencia-atomicidad.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Antes de crear el commit:

3. Crea:

`docs/programa-mejora/02-facturacion/24-respuesta-claude-commit-idempotencia-atomicidad.md`

4. Guarda allí el informe final que entregarás al usuario.

El informe no debe incluir el hash dinámico del commit. Puede indicar que el commit se creó correctamente y que fue verificado con `git log -1`.

Incluye ambos documentos en el commit.

---

Actúa como responsable de integración Git.

La subfase de idempotencia y atomicidad de facturación fue aprobada formalmente por Codex y debe convertirse en un commit aislado.

## Documento obligatorio

Lee:

`docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`

La lista de archivos aprobados de ese informe es vinculante.

## Objetivo único

Crear un commit que contenga exclusivamente:

* Implementación de idempotencia.
* Atomicidad del webhook.
* Ledger.
* Cuarentena y reconciliación histórica.
* Fuente única de períodos.
* Pruebas relacionadas.
* Documentación de la Fase 1 de facturación.

## Restricciones

No debes:

* Modificar código.
* Corregir archivos.
* Ejecutar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Ejecutar pruebas nuevamente.
* Modificar `.env`.
* Modificar `.env.test`.
* Mostrar secretos.
* Incluir `.env.test` en Git.
* Incluir archivos temporales.
* Incluir logs.
* Incluir cambios ajenos a facturación.
* Incluir eliminaciones antiguas de documentación fuera de esta fase.
* Usar `git add .`.
* Usar `git add -A`.
* Hacer push.
* Crear tags.
* Reescribir commits anteriores.

Solo debes revisar, documentar, añadir rutas explícitas y crear el commit aprobado.

## Primera acción

1. Guarda este prompt en el documento 23.
2. Ejecuta:

```text
git status --short
git diff --check
git diff --stat
git diff --name-status
```

3. Identifica cualquier cambio fuera del alcance.
4. Confirma que:

   * `.env` no está staged.
   * `.env.test` no está staged.
   * `package-lock.json` no cambió.
   * No hay secretos rastreados.
   * No hay archivos generados de Prisma rastreados.
   * No existen cambios no relacionados dentro del staging area.

Si detectas un archivo dudoso, no lo incluyas y documéntalo.

# Archivos de implementación autorizados

Añade únicamente estas rutas:

```text
prisma/schema.prisma
prisma/migrations/20260722000100_add_webhook_event_ledger_and_payment_effect/migration.sql
src/domains/billing/billing.service.ts
src/domains/billing/mercado-pago.service.ts
src/domains/billing/period.ts
src/domains/billing/reconciliation.ts
src/domains/billing/webhook-metadata.ts
src/domains/platform/audit.service.ts
scripts/reconcile-historical-payment-effects.ts
tests/billing-webhook-idempotency.test.ts
tests/unit/billing-period.test.ts
tests/unit/billing-reconciliation.test.ts
```

Añádelas mediante rutas explícitas.

# Documentación autorizada

Incluye:

```text
docs/programa-mejora/02-facturacion/
```

Antes de añadirla:

1. Lista todos los archivos que contiene.
2. Confirma que son documentos `.md` pertenecientes a las fases de facturación.
3. Confirma que no contiene credenciales, `.env`, dumps, logs o archivos binarios.
4. Crea el documento 24 con el informe final previsto.
5. Añade la carpeta mediante su ruta explícita.

No añadas otras carpetas de `docs`.

# Staging

Ejecuta comandos equivalentes a:

```text
git add prisma/schema.prisma
git add prisma/migrations/20260722000100_add_webhook_event_ledger_and_payment_effect/migration.sql
git add src/domains/billing/billing.service.ts
git add src/domains/billing/mercado-pago.service.ts
git add src/domains/billing/period.ts
git add src/domains/billing/reconciliation.ts
git add src/domains/billing/webhook-metadata.ts
git add src/domains/platform/audit.service.ts
git add scripts/reconcile-historical-payment-effects.ts
git add tests/billing-webhook-idempotency.test.ts
git add tests/unit/billing-period.test.ts
git add tests/unit/billing-reconciliation.test.ts
git add docs/programa-mejora/02-facturacion/
```

No copies estos comandos ciegamente si alguna ruta no existe. Verifica cada ruta primero.

# Revisión obligatoria del staging

Antes del commit ejecuta:

```text
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git status --short
```

Después inspecciona el diff staged completo o por secciones:

```text
git diff --cached
```

Confirma:

1. Todos los archivos staged pertenecen al alcance.
2. No hay `.env` ni `.env.test`.
3. No hay credenciales.
4. No hay URLs con contraseñas.
5. No hay tokens.
6. No hay datos personales provenientes de la base.
7. No hay archivos borrados ajenos.
8. No hay cambios de cron, métricas, cancelación, UI o autenticación.
9. Los documentos 23 y 24 están incluidos.
10. El staging coincide con la aprobación de Codex.

Si algo no coincide:

* Retíralo únicamente del staging con `git restore --staged <ruta>`.
* No borres el archivo.
* No uses comandos globales.
* No crees el commit hasta que el staging sea exacto.

# Commit

Usa exactamente este mensaje:

```text
feat(billing): enforce idempotent atomic webhook effects
```

Ejecuta el commit.

No uses `--amend`.

No hagas push.

# Verificación posterior

Después del commit ejecuta:

```text
git log -1 --oneline
git show --stat --oneline --summary HEAD
git status --short
```

Confirma:

* El commit fue creado.
* El mensaje es correcto.
* Los archivos del commit coinciden con el alcance.
* `.env.test` no fue incluida.
* No se hizo push.
* No quedaron cambios de esta subfase sin commit.
* Cualquier cambio ajeno restante sigue sin staging y se documenta.

No pegues el hash del commit dentro del documento 24 para evitar que el propio documento altere el hash.

# Informe final

El documento 24 y la respuesta final deben incluir exactamente:

1. Estado inicial de Git.
2. Archivos de implementación incluidos.
3. Documentación incluida.
4. Validación de ausencia de secretos.
5. Resultado de `git diff --cached --check`.
6. Mensaje del commit.
7. Confirmación de commit creado.
8. Verificación del contenido mediante `git show`.
9. Estado posterior de Git.
10. Archivos o cambios no incluidos.
11. Confirmación de que `.env` y `.env.test` no se incluyeron.
12. Confirmación de que no se hizo push.
13. Próxima fase recomendada:

    * precedencia de eventos fuera de orden y seguridad del cron.
14. Estado:

    * COMMIT CREADO.
    * BLOQUEADO.

## Finalización

1. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/02-facturacion/23-prompt-claude-commit-idempotencia-atomicidad.md`

2. Confirma que el informe quedó guardado en:

`docs/programa-mejora/02-facturacion/24-respuesta-claude-commit-idempotencia-atomicidad.md`

3. Crea el commit únicamente después de incluir ambos documentos.

4. No modifiques nada después del commit.

5. No hagas push.

6. Detente después del informe.
