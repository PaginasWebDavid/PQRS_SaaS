# FASE 2T — REVISIÓN FINAL ACOTADA DEL CIERRE DE R-01

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/09-prompt-codex-revision-final-cierre-r01.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/10-respuesta-codex-revision-final-cierre-r01.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, pruebas, schema, migración ni documentos 01–08.

---

Actúa como revisor final independiente del cierre de R-01.

Claude corrigió únicamente la cobertura de pruebas identificada en tu revisión anterior. Debes determinar si R-01 quedó cerrado y si la subfase del outbox puede convertirse en commit.

Esta revisión está deliberadamente optimizada para evitar consumo innecesario de créditos y ejecuciones repetitivas.

## Política obligatoria de pruebas y créditos

No ejecutes la suite completa de 359 pruebas en esta revisión.

Motivos:

* La última suite completa verde anterior al cambio acotado fue 353/353.
* La Fase 2S solo añadió:

  * un seam exclusivo de test;
  * seis pruebas;
  * fortalecimiento de una prueba.
* Los 33 casos directamente afectados pasan 33/33.
* La base remota compartida presentó degradación severa y produjo fallos intermitentes distintos en pruebas ajenas.
* Claude ya ejecutó cuatro suites completas sin obtener información adicional.

En esta fase:

1. Revisa estáticamente el diff.
2. Ejecuta los tests específicos del outbox una sola vez, solo si necesitas reproducirlos.
3. No repitas una prueba verde.
4. No repitas un fallo ambiental.
5. No ejecutes conteos repetidos de base salvo que la prueba específica deje residuos.
6. No vuelvas a validar migraciones desde cero: schema y migración no cambiaron en 2S.
7. No ejecutes Prisma generate, typecheck o lint si el diff confirma que solo cambió un seam tipado y pruebas y los resultados de Claude son coherentes.
8. Si ejecutas typecheck/lint, hazlo una sola vez.
9. La suite completa queda como control operativo pendiente para:

   * cuando la base de pruebas esté estable;
   * o cuando se separe físicamente la base;
   * y en todo caso antes del despliegue a producción.

Un timeout intermitente ajeno al outbox no debe provocar reintentos automáticos ni bloquear el commit si la evidencia técnica confirma que es ambiental.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/05-notificaciones-email-idempotencia/06-respuesta-codex-revision-final-outbox-idempotencia.md`
* `docs/programa-mejora/05-notificaciones-email-idempotencia/07-prompt-claude-correccion-cobertura-outbox.md`
* `docs/programa-mejora/05-notificaciones-email-idempotencia/08-respuesta-claude-correccion-cobertura-outbox.md`

Inspecciona únicamente lo necesario:

* `src/domains/billing/billing-outbox.service.ts`
* `tests/billing-outbox-idempotency.test.ts`
* El diff completo de la Fase 2S
* Schema y migración solo para confirmar que no cambiaron

No repitas la revisión completa de toda la arquitectura ya aprobada en Fases 2Q y 2R.

# 1. Estado de Git

Ejecuta:

```text
git status --short
git log -2 --oneline
git diff --check
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD sigue siendo `b924f64`.
* No hay staged diff.
* En 2S solo cambiaron:

  * `src/domains/billing/billing-outbox.service.ts`
  * `tests/billing-outbox-idempotency.test.ts`
  * documentos 07–10
* Schema y migración no cambiaron en 2S.
* No existen cambios inesperados.

# 2. Verificación exacta de R-01

Revisa exclusivamente estos puntos:

## R-01.1 — Dos dispatchers IN_APP

Confirma que la prueba:

* ejecuta dos `dispatchBillingOutbox` reales;
* usa una barrera en `AFTER_OUTBOX_SELECTED`;
* ambos seleccionan la misma fila;
* solo uno gana el claim;
* existe una Notification;
* existe un Attempt;
* outbox queda COMPLETED;
* no queda PROCESSING.

## R-01.2 — Crash después de Notification

Confirma que:

* `AFTER_NOTIFICATION_CREATE` lanza dentro de la transacción real;
* Notification y AuditLog revierten;
* outbox no queda COMPLETED;
* Attempt no queda COMPLETED;
* retry posterior crea exactamente una Notification;
* no se usa setup manual como sustituto.

## R-01.3 — Crash post-marcador/pre-fetch

Confirma que el seam:

```text
AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED
```

se ejecuta:

* después del commit que persiste `providerAttemptStartedAt`;
* antes de cualquier fetch;
* solo en test.

Confirma que la prueba verifica:

* cero fetch;
* frontera durable;
* recuperación real;
* DELIVERY_UNKNOWN;
* cero retry posterior.

## R-01.4 — Fencing mediante recuperación real

Confirma que la prueba:

* no usa updates directos para sustituir recovery;
* mantiene al worker A antes de finalizar;
* ejecuta `dispatchBillingOutbox` real con lease vencido;
* recovery marca DELIVERY_UNKNOWN;
* A pierde el CAS final;
* A no marca SENT;
* hay un solo fetch.

## R-01.5 — Eliminación real del User

Confirma que:

* usa `prisma.user.delete`;
* PostgreSQL aplica `SET NULL`;
* outbox se conserva;
* no se llama proveedor;
* no se crea Notification;
* termina FAILED_FINAL;
* el lote continúa.

## R-01.6 — Unique real de EmailLog

Confirma que:

* se provoca P2002 real por `outboxId`;
* se provoca P2002 real por `dedupeKey`;
* queda un único EmailLog;
* el camino normal concurrente sigue protegido por claim CAS.

## R-01.7 — Unique real de Attempt

Confirma que:

* se provoca el unique real `(outboxId, attemptNumber)`;
* claim y creación del Attempt están en la misma transacción;
* el conflicto revierte el claim;
* outbox sigue PENDING;
* attemptCount no aumenta;
* un intento posterior funciona.

# 3. Revisión del seam

Confirma:

* unión correcta al tipo de pasos;
* llamada colocada después del marcador;
* llamada antes del fetch;
* ejecución exclusiva con `NODE_ENV=test`;
* hook vacío en producción;
* reset en cleanup;
* sin acceso HTTP;
* sin sleeps;
* sin promesas pendientes.

Determina si introduce algún cambio productivo observable.

# 4. Pruebas específicas

Claude reporta:

* 18 pruebas de integración del outbox.
* 15 pruebas puras del outbox.
* 33/33 específicas.

Puedes ejecutar una sola vez los archivos afectados usando el procedimiento seguro oficial.

No ejecutes toda la suite.

Resultado esperado:

```text
33/33 PASS
```

Si pasan:

* no las repitas.

Si falla una prueba del outbox:

* analiza el fallo;
* no reintentes automáticamente;
* clasifica si es lógico o ambiental.

Si el fallo es por timeout de la base:

* no repitas;
* revisa si ocurrió antes de alcanzar la ventana bajo prueba;
* documenta la limitación ambiental.

# 5. Conteo

Confirma:

* línea base anterior: 353.
* seis pruebas nuevas: +6.
* total teórico actual: 359.
* integración outbox: 18.
* puras específicas outbox: 15.

No es necesario demostrar 359/359 en esta revisión debido al incidente ambiental documentado.

# 6. Incidente ambiental

Evalúa la evidencia de Claude:

* cuatro corridas;
* fallos en pruebas diferentes;
* únicamente webhook/cron;
* timeouts de transacciones interactivas;
* latencias de 6–79 segundos;
* ninguna prueba del outbox falló;
* conteos finales limpios.

Clasifica:

* defecto del outbox;
* defecto de las pruebas;
* limitación de infraestructura de pruebas.

Determina si:

* bloquea commit;
* bloquea despliegue;
* exige separar la base antes de producción;
* exige una corrida completa verde antes de producción.

La recomendación esperada, si la evidencia es consistente:

* no bloquea commit;
* sí bloquea declarar la plataforma lista para producción;
* exige suite completa verde en una base estable antes del despliegue.

No aumentes timeouts de producción para ocultar una base de pruebas lenta.

# 7. Hallazgos

Solo abre un hallazgo nuevo si existe evidencia concreta.

Para cada hallazgo:

* ID.
* Severidad.
* Archivo/prueba.
* Comportamiento.
* Impacto.
* Evidencia.
* Corrección.
* ¿Bloquea commit?
* ¿Bloquea producción?

No reabras riesgos bajos ya aceptados sin evidencia nueva.

# 8. Alcance para commit

Si apruebas, autoriza exactamente:

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

Todos los `.md` de:

```text
docs/programa-mejora/05-notificaciones-email-idempotencia/
```

Confirma que no existe otro archivo modificado perteneciente a la subfase.

No incluir:

* `.env`.
* `.env.test`.
* package files.
* migraciones históricas.
* archivos generados.
* logs.
* resultados de pruebas.
* cambios ajenos.

# 9. Mensaje del eventual commit

Si apruebas:

```text
feat(billing): add durable notification outbox
```

# 10. Criterios de aprobación

Aprueba si:

1. Las siete verificaciones de R-01 son reales.
2. El seam está correctamente ubicado.
3. El seam es test-only.
4. Las pruebas usan caminos productivos.
5. No se modificó schema/migración en 2S.
6. No se descubrió defecto funcional.
7. Los tests específicos pasan o solo presentan una limitación ambiental demostrable.
8. No hay residuos.
9. No se enviaron emails reales.
10. No se llamó Mercado Pago real.
11. No hay hallazgos críticos, altos o medios abiertos.

La suite completa verde no es requisito para este commit debido al incidente ambiental, pero queda como requisito previo al despliegue.

# Informe final

Entrega:

1. Resumen.
2. Estado de Git.
3. Alcance revisado.
4. R-01.1 a R-01.7.
5. Seam.
6. Pruebas específicas.
7. Conteo.
8. Incidente ambiental.
9. Hallazgos.
10. Riesgos aceptados.
11. ¿Bloquea commit?
12. ¿Bloquea producción?
13. Lista para commit.
14. Comandos `git add` explícitos.
15. Mensaje de commit.
16. Recomendación.
17. Veredicto:

* APROBADA.
* APROBADA CON CONDICIÓN OPERATIVA.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/10-respuesta-codex-revision-final-cierre-r01.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/09-prompt-codex-revision-final-cierre-r01.md`

3. No modifiques código.

4. No hagas commit.

5. No hagas push.

6. No crees tags.

7. No ejecutes la suite completa repetidamente.

8. No inicies otra subfase.

9. Detente después del informe.
