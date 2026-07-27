# FASE 2N — REVISIÓN FINAL DEL CRON CON CAS, ATOMICIDAD Y CONTROL DE STARVATION

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/04-cron-atomicidad/05-prompt-claude-revision-final-cron-cas-atomicidad.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/04-cron-atomicidad/06-respuesta-claude-revision-final-cron-cas-atomicidad.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, pruebas, schema, migraciones, configuración ni variables de entorno.

---

Actúa como revisor técnico independiente especializado en Prisma, PostgreSQL, procesos cron, compare-and-set, concurrencia, facturación recurrente y pruebas transaccionales.

Claude implementó inicialmente el cron y Codex realizó una revisión con corrección directa. Debes revisar adversarialmente el estado final y decidir si la subfase puede aprobarse y convertirse en commit.

No apruebes únicamente porque la suite esté verde.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/04-cron-atomicidad/01-prompt-claude-implementacion-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/02-respuesta-claude-implementacion-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/03-prompt-codex-revision-correccion-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/04-respuesta-codex-revision-correccion-cron-cas-atomicidad.md`
* `docs/programa-mejora/03-precedencia-cron/20-respuesta-claude-revision-final-economia-acceso.md`
* `docs/programa-mejora/03-precedencia-cron/22-respuesta-codex-commit-precedencia-cobertura.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

Inspecciona completamente:

* `src/domains/billing/cron-decision.ts`
* `src/domains/billing/billing.service.ts`
* `src/app/api/cron/overdue-rules/route.ts`
* La ruta super-admin que invoca `applyOverdueLicenseRules`
* El servicio de auditoría
* El helper actual de Notification/email
* `tests/unit/cron-decision.test.ts`
* `tests/billing-cron-atomicity.test.ts`

La fuente de verdad es el código, el diff y las pruebas actuales.

## Restricciones

Esta es una revisión de solo lectura.

No debes:

* Modificar implementación.
* Modificar pruebas.
* Modificar documentos anteriores.
* Modificar schema.
* Crear o aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Modificar `.env`.
* Modificar `.env.test`.
* Modificar el runner o guard.
* Enviar emails reales.
* Llamar a Mercado Pago real.
* Ejecutar build.
* Levantar servidor.
* Hacer commit.
* Hacer push.
* Crear tags.
* Iniciar la subfase de notificaciones.

Puedes:

* Ejecutar comandos Git de lectura.
* Ejecutar typecheck y lint.
* Ejecutar pruebas puras.
* Ejecutar la suite completa mediante el procedimiento seguro.
* Consultar conteos seguros antes y después.

# 1. Estado inicial

Ejecuta:

```text
git status --short
git log -2 --oneline
git diff --check
git diff --stat
git diff --name-status
```

Confirma:

* HEAD sigue siendo el commit de precedencia y cobertura.
* No existe un commit nuevo.
* El working tree contiene únicamente los cambios del cron y documentos 01–06.
* No hay staged diff.
* Schema, migraciones, package files y entorno están intactos.
* No hay cambios definitivos de Notification/email, UI o métricas.
* No se inició la subfase de deduplicación.

# 2. Verificación de hallazgos 2M-01 a 2M-07

Crea una tabla con:

* ID.
* Estado:

  * CORREGIDO.
  * CORREGIDO CON MATICES.
  * NO CORREGIDO.
  * REGRESIÓN.
* Evidencia.
* Riesgo restante.
* ¿Bloquea commit?
* ¿Bloquea la siguiente subfase?
* ¿Bloquea producción?

Incluye:

* 2M-01: inconsistencias consumían el lote accionable.
* 2M-02: una categoría podía bloquear las demás.
* 2M-03: efectos externos opacos.
* 2M-04: prueba de dos crons no representaba una carrera real.
* 2M-05: detalles y diagnósticos sin límites suficientes.
* 2M-06: comparación directa del secreto.
* 2M-07: ausencia de prueba de fallo real de AuditLog.

# 3. Matriz de decisión pura

Reconstruye la matriz completa:

| Estado          | Frontera                         | Resultado esperado |
| --------------- | -------------------------------- | ------------------ |
| ACTIVE          | vigente                          | PRESERVE           |
| ACTIVE          | vencida                          | ACTIVE_EXPIRED     |
| ACTIVE          | exactamente now                  | ACTIVE_EXPIRED     |
| ACTIVE          | null/inválida                    | INCONSISTENT       |
| TRIAL           | vigente                          | PRESERVE           |
| TRIAL           | vencida                          | TRIAL_EXPIRED      |
| TRIAL           | exactamente now                  | TRIAL_EXPIRED      |
| TRIAL           | sin trialEndsAt, período vigente | PRESERVE           |
| TRIAL           | sin trialEndsAt, período vencido | TRIAL_EXPIRED      |
| TRIAL           | sin fronteras                    | INCONSISTENT       |
| GRACE           | vigente                          | PRESERVE           |
| GRACE           | vencida                          | GRACE_EXPIRED      |
| GRACE           | exactamente now                  | GRACE_EXPIRED      |
| GRACE           | null                             | INCONSISTENT       |
| SUSPENDED       | cualquiera                       | PRESERVE           |
| CANCELLED       | cualquiera                       | PRESERVE           |
| PENDING_PAYMENT | cualquiera                       | PRESERVE           |
| desconocido     | cualquiera                       | PRESERVE           |

Confirma:

* La función no muta inputs.
* Fechas inválidas no provocan degradación.
* `<= now` se usa consistentemente.
* El fallback de TRIAL coincide con el comportamiento histórico.
* Selección y decisión no se contradicen.

# 4. Selección y prevención de starvation

Revisa las cuatro categorías accionables:

* ACTIVE vencida.
* TRIAL vencida por `trialEndsAt`.
* TRIAL vencida por fallback de `currentPeriodEnd`.
* GRACE vencida.

Confirma:

* Tienen consultas separadas.
* Tienen cupos propios.
* Las inconsistencias no consumen dichos cupos.
* Los resultados se intercalan.
* El orden es determinista.
* Existe desempate por `id`.
* Ninguna categoría puede bloquear completamente a otra.

## Distribución de cupos

Reconstruye exactamente:

* Límite global.
* Cupo por bucket.
* Tratamiento del residuo cuando 500 no divide exactamente.
* Qué ocurre si uno o más buckets están vacíos.
* Número máximo real de candidatos procesados.

Evalúa el riesgo bajo documentado:

> Si un bucket está vacío, sus cupos no se redistribuyen y la corrida puede procesar menos de 500.

Determina si:

* es una decisión aceptable;
* puede causar starvation real;
* solo reduce throughput;
* debe bloquear el commit.

## Fallos permanentes

Analiza:

1. Existen más candidatos fallidos permanentemente que el cupo de una categoría.
2. Siempre aparecen primero por orden.
3. Se ejecuta el cron repetidamente.

Determina si filas posteriores pueden quedar bloqueadas indefinidamente.

Busca si existe:

* cursor;
* rotación;
* exclusión temporal;
* orden alternante;
* alguna forma de progreso.

Clasifica el riesgo honestamente. Si existe starvation real y no solo retraso limitado, debe considerarse bloqueante.

# 5. Inconsistencias diagnósticas

Confirma que `GRACE_PERIOD` con `graceEndsAt = null`:

* se consulta aparte;
* no consume lote accionable;
* no cambia Subscription;
* no cambia Tenant;
* no crea AuditLog de suspensión;
* no crea Notification;
* no intenta email;
* informa total real;
* limita detalles a 50;
* informa truncamiento.

Confirma que la respuesta HTTP no puede contener miles de IDs.

# 6. Transacción por candidato

Revisa el flujo exacto:

1. Selección inicial.
2. Relectura por `id + tenantId`.
3. Decisión pura.
4. CAS.
5. Tenant.
6. AuditLog.
7. Commit.
8. Efectos externos.

Confirma:

* Cada candidato tiene su propia transacción.
* PRESERVE no escribe.
* INCONSISTENT no escribe.
* CAS perdido no actualiza Tenant.
* CAS perdido no audita transición.
* Un candidato fallido no revierte otros.

# 7. CAS

Revisa el `where` completo:

* `id`.
* `tenantId`.
* `status`.
* `currentPeriodEnd`.
* `trialEndsAt`.
* `graceEndsAt`.

Confirma:

* Usa fechas exactas.
* Nulls se comparan correctamente.
* No reconstruye ni redondea.
* `count === 1` es la única señal de éxito.
* `count === 0` devuelve `SKIPPED_CONCURRENT_CHANGE`.
* No existe reintento automático.

## Tres fronteras

Analiza el uso de las tres fronteras para cualquier transición.

Ejemplo:

* ACTIVE vencida.
* Otro proceso modifica solo `trialEndsAt`.

Confirma que el CAS pierde de forma conservadora.

Clasifica este comportamiento:

* correcto fail-safe;
* falso positivo aceptable;
* defecto que puede bloquear progreso.

# 8. Tenant concurrente

Busca globalmente todos los callers que modifican `Tenant.status`.

Determina si existe una operación legítima que:

* cambie Tenant;
* no cambie Subscription en la misma transacción.

Confirma que el cron no puede sobrescribir una acción administrativa real aplicada únicamente al Tenant.

Si el repositorio exige que Tenant y Subscription siempre cambien juntos, documenta la evidencia.

# 9. Pago concurrente

Lee la prueba completa.

Confirma:

* usa el servicio real de webhook;
* procesa un APPROVED real con fetch mockeado;
* actualiza período de Payment;
* actualiza período de Subscription;
* mantiene la invariancia de períodos;
* actualiza Tenant;
* ocurre después de la relectura y antes del CAS;
* el CAS pierde;
* no se crea auditoría de Grace;
* no se crea Notification;
* no se intenta email;
* replay no duplica economía.

# 10. Reactivación concurrente

Confirma:

* usa `updateTenantStatusForSuperAdmin`.
* Existe evidencia válida.
* La reactivación es Serializable.
* Actualiza Subscription y Tenant.
* Crea auditoría propia.
* El cron pierde el CAS.
* No suspende.
* No genera auditoría ni efecto externo de suspensión.

# 11. Dos crons concurrentes

Inspecciona la barrera.

Confirma que:

* son dos ejecuciones reales.
* Ambas seleccionan el mismo candidato.
* Ambas releen el mismo snapshot antes de liberarse.
* La barrera no permite deadlock.
* Se limpia aunque una operación falle.
* Exactamente un CAS gana.
* Solo una actualiza Tenant.
* Solo una crea AuditLog.
* La perdedora devuelve `SKIPPED_CONCURRENT_CHANGE`.
* No se crean efectos externos duplicados.

# 12. Atomicidad

Confirma que Subscription, Tenant y AuditLog están dentro de la misma transacción.

Revisa pruebas de:

* fallo antes de Tenant;
* fallo antes de AuditLog;
* fallo real al crear AuditLog por FK;
* reintento posterior.

Resultado obligatorio:

* rollback de Subscription;
* rollback de Tenant;
* ausencia de AuditLog parcial;
* una sola auditoría final;
* transición posterior limpia.

# 13. Efectos externos

Inspecciona el flujo posterior al commit.

Reconstruye:

* carga de destinatarios;
* creación de Notification;
* creación de EmailLog;
* llamada a Resend;
* errores capturados;
* continuidad con otros tenants.

Confirma:

* solo se ejecuta para APPLIED;
* después del commit;
* nunca para CAS perdido;
* nunca para rollback;
* nunca para PRESERVE;
* nunca para INCONSISTENT.

## Fallos externos

Confirma que un fallo de:

* lectura de destinatarios;
* Notification;
* EmailLog;
* Resend;

no cambia la clasificación de la transición aplicada.

La transición debe:

* permanecer aplicada;
* conservar Tenant/Subscription;
* conservar AuditLog;
* aparecer en `movedToGracePeriod` o `movedToSuspended`;
* registrar separadamente el fallo externo;
* permitir continuar con otros tenants.

# 14. Resumen del cron

Reconstruye `CronRunSummary`.

Confirma presencia y semántica de:

* `movedToGracePeriod`.
* `movedToSuspended`.
* candidatos accionables examinados.
* límite o cupo.
* conteo por categoría.
* preservados.
* saltados por CAS.
* inconsistencias totales.
* detalles limitados.
* indicador de truncamiento.
* errores transaccionales por candidato.
* tenants con efectos externos intentados.
* notificaciones exitosas.
* notificaciones fallidas.
* emails intentados.
* emails exitosos/fallidos, si es observable.
* errores externos limitados.

Verifica compatibilidad con:

* ruta del cron.
* ruta super-admin.
* UI/toast existentes.

No debe incluir:

* nombres;
* correos;
* mensajes internos;
* stack;
* secretos.

# 15. Autenticación

Revisa la ruta cron.

Confirma:

* Sin `CRON_SECRET` → 401.
* Sin header → 401.
* Header incorrecto → 401.
* `Bearer undefined` → 401.
* Secreto correcto → ejecución.
* Comparación con `timingSafeEqual`.
* Validación de longitud antes de comparar.
* No se registra el secreto.
* No se devuelve el secreto.
* No se aceptan `tenantIds`, límites ni overrides desde HTTP.

Confirma que las pruebas restauran `CRON_SECRET` correctamente.

# 16. `options.tenantIds`

Confirma:

* Se recorta cada ID.
* Se eliminan duplicados.
* Máximo 1000.
* Lista vacía procesa cero.
* No proviene de input del endpoint cron.
* No modifica el barrido de producción.
* Overrides de límite solo se permiten con `NODE_ENV === "test"`.

Revisa si una lista con IDs inválidos o strings vacíos provoca comportamiento inesperado.

# 17. Neutralización de email en pruebas

Confirma:

* No se envía ningún email real.
* `RESEND_API_KEY` se restaura correctamente.
* Si no existía, se elimina al final.
* La restauración ocurre incluso con excepción.
* No existe contaminación entre tests.
* EmailLogs creados por las pruebas se limpian.
* No se depende de un comportamiento no garantizado del runner.

# 18. Seams

Confirma:

* Solo se ejecutan con `NODE_ENV === "test"`.
* No existe ruta HTTP para configurarlos.
* Se pueden dirigir por candidato.
* Se restauran en `finally`.
* Existe limpieza global.
* No usan sleeps.
* No dejan promesas pendientes.
* La barrera de dos crons se libera ante fallos.
* Una prueba no contamina la siguiente.

# 19. Conteo de pruebas

Explica con precisión:

* 204 pruebas puras.
* 26 casos en `billing-cron-atomicity.test.ts`.
* 326 pruebas totales.

Determina por qué el incremento total respecto a 283 no coincide directamente con 17 + 26, si no coincide.

No apruebes un conteo inconsistente sin explicación.

# 20. Ejecución segura

## Ruta insegura

Ejecuta:

```text
npm test
```

Debe abortar antes de Prisma.

## PowerShell autorizado

```powershell
$hadDatabaseUrl = Test-Path Env:DATABASE_URL
$hadDirectUrl = Test-Path Env:DIRECT_URL
$previousDatabaseUrl = $env:DATABASE_URL
$previousDirectUrl = $env:DIRECT_URL

try {
  $env:DATABASE_URL = " "
  $env:DIRECT_URL = " "

  npm test
}
finally {
  if ($hadDatabaseUrl) {
    $env:DATABASE_URL = $previousDatabaseUrl
  } else {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }

  if ($hadDirectUrl) {
    $env:DIRECT_URL = $previousDirectUrl
  } else {
    Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
  }
}
```

## POSIX autorizado

```bash
env DATABASE_URL= DIRECT_URL= npm test
```

No modifiques `.env`, `.env.test` ni el guard.

## Comandos

Ejecuta:

```text
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
npm test
```

El último comando debe usar el aislamiento correspondiente.

No reintentes automáticamente un fallo lógico.

# 21. Limpieza

Antes y después confirma:

* Conteos básicos iguales.
* Cero fixtures cron.
* Cero fixtures billing.
* Cero WebhookEvent residuales.
* Cero usuarios de prueba.
* Cero emails reales.
* Cero llamadas reales a Mercado Pago.
* Variables restauradas.
* Hooks reseteados.
* `.env` intacto.
* `.env.test` ignorado.

# 22. Compatibilidad

Confirma que continúan pasando:

* Idempotencia.
* Precedencia.
* Cobertura.
* Reactivación.
* Serializable.
* Período compartido.
* Términos pendientes.
* Webhook ledger.
* Auditoría.
* Guard.
* Autenticación.
* UI super-admin y respuesta del cron.

# 23. Alcance del eventual commit

Si apruebas, entrega la lista exacta de archivos.

Debe incluir únicamente:

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

Todos los `.md` de:

```text
docs/programa-mejora/04-cron-atomicidad/
```

Confirma que no contienen secretos.

No incluir:

* `.env`.
* `.env.test`.
* schema.
* migraciones.
* package files.
* logs.
* temporales.
* cambios ajenos.

Entrega comandos `git add` explícitos, pero no los ejecutes.

# 24. Mensaje del eventual commit

Si apruebas, propone:

```text
feat(billing): make overdue cron atomic and concurrency-safe
```

# Hallazgos

Para cada hallazgo nuevo incluye:

* ID.
* Severidad.
* Archivo/símbolo.
* Comportamiento.
* Impacto.
* Evidencia.
* Corrección mínima.
* Prueba requerida.
* ¿Bloquea commit?
* ¿Bloquea notificaciones?
* ¿Bloquea producción?

# Criterios de aprobación

La subfase solo puede aprobarse si:

1. Los hallazgos 2M-01 a 2M-07 están corregidos.
2. Decisión pura coherente.
3. Sin starvation por inconsistencias.
4. Sin starvation bloqueante entre categorías.
5. Cada candidato se relee dentro de la transacción.
6. Toda transición usa CAS.
7. Payment concurrente prevalece.
8. Reactivación concurrente prevalece.
9. Dos crons no duplican.
10. Tenant y AuditLog son atómicos.
11. Grace null no cambia.
12. Efectos externos solo después del commit.
13. Fallos externos no revierten transiciones.
14. Resumen completo y seguro.
15. Autenticación fail-closed.
16. Seams exclusivos de test.
17. No cambia schema.
18. No existe migración.
19. Typecheck pasa.
20. Lint pasa.
21. Pruebas puras pasan.
22. Suite completa pasa.
23. No existen `skip`.
24. Fixtures quedan limpios.
25. No se envían emails reales.
26. No hay hallazgos críticos, altos o medios abiertos dentro del alcance.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Verificación 2M-01 a 2M-07.
5. Matriz pura.
6. Selección.
7. Distribución de cupos.
8. Starvation.
9. Inconsistencias.
10. Transacción por candidato.
11. CAS.
12. Tenant concurrente.
13. Pago concurrente.
14. Reactivación concurrente.
15. Dos crons.
16. Atomicidad.
17. Efectos externos.
18. Fallos externos.
19. Resumen.
20. Autenticación.
21. `options.tenantIds`.
22. Email en pruebas.
23. Seams.
24. Conteo de pruebas.
25. Compatibilidad.
26. Ejecución.
27. Limpieza.
28. Hallazgos.
29. Riesgos aceptados.
30. Lista para commit.
31. Comandos `git add`.
32. Mensaje de commit.
33. Recomendación.
34. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/04-cron-atomicidad/06-respuesta-claude-revision-final-cron-cas-atomicidad.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/04-cron-atomicidad/05-prompt-claude-revision-final-cron-cas-atomicidad.md`

3. No modifiques código.

4. No hagas commit.

5. No hagas push.

6. No inicies la subfase de notificaciones.

7. Detente después del informe.
