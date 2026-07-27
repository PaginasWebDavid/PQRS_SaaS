# FASE 2M — REVISIÓN Y CORRECCIÓN DIRECTA DEL CRON CON CAS Y ATOMICIDAD

## Documentación automática

Antes de revisar o modificar código:

1. Crea:

`docs/programa-mejora/04-cron-atomicidad/03-prompt-codex-revision-correccion-cron-cas-atomicidad.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/04-cron-atomicidad/04-respuesta-codex-revision-correccion-cron-cas-atomicidad.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques los documentos 01 y 02.

---

Actúa como revisor e implementador correctivo especializado en Prisma, PostgreSQL, procesos cron, compare-and-set, concurrencia, facturación recurrente y pruebas transaccionales.

Claude implementó la seguridad del cron. En esta intervención debes:

1. Revisar adversarialmente todo el diff.
2. Reproducir y clasificar cualquier defecto.
3. Corregir directamente todos los hallazgos críticos, altos y medios que pertenezcan al alcance.
4. Añadir o fortalecer pruebas.
5. Ejecutar la validación completa.
6. No aprobar tu propio trabajo.
7. No hacer commit.

Después de esta fase, Claude realizará una revisión final de solo lectura.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/04-cron-atomicidad/01-prompt-claude-implementacion-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/02-respuesta-claude-implementacion-cron-cas-atomicidad.md`
* `docs/programa-mejora/03-precedencia-cron/20-respuesta-claude-revision-final-economia-acceso.md`
* `docs/programa-mejora/03-precedencia-cron/22-respuesta-codex-commit-precedencia-cobertura.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

Inspecciona completamente:

* `src/domains/billing/cron-decision.ts`
* `src/domains/billing/billing.service.ts`
* `tests/unit/cron-decision.test.ts`
* `tests/billing-cron-atomicity.test.ts`
* `src/app/api/cron/overdue-rules/route.ts`
* La ruta del super-admin que invoca `applyOverdueLicenseRules`
* El servicio de auditoría utilizado
* El helper actual de Notification/email utilizado por el cron

La fuente de verdad es el código y el diff actual.

## Alcance

Esta fase comprende:

* Decisión pura del cron.
* Selección y orden de candidatos.
* Límites de lote y prevención de starvation.
* Relectura transaccional.
* CAS de Subscription.
* Sincronización de Tenant.
* Auditoría atómica.
* Grace inconsistente.
* Dos ejecuciones concurrentes.
* Pago o reactivación concurrentes.
* Resumen estructurado.
* Errores por candidato.
* Efectos externos mínimos posteriores al commit.
* Autenticación existente del cron.
* Pruebas puras y de integración.

## Fuera de alcance

No implementes:

* `Notification.dedupeKey`.
* Migración para notificaciones.
* Outbox.
* Reintentos definitivos de email.
* Colas.
* Locks distribuidos.
* Nuevos campos Prisma.
* Nuevos enums Prisma.
* Migraciones.
* Política definitiva de cancelación.
* Métricas de negocio.
* UI.
* Cambios de precios.
* Timestamps del proveedor.
* Reparación automática agresiva de datos históricos.

Si encuentras que una corrección exige schema, detente antes de modificarlo y marca `BLOQUEADO`.

## Archivos permitidos

Puedes modificar únicamente:

* `src/domains/billing/cron-decision.ts`
* `src/domains/billing/billing.service.ts`
* `tests/unit/cron-decision.test.ts`
* `tests/billing-cron-atomicity.test.ts`
* `src/app/api/cron/overdue-rules/route.ts`, solo ante un defecto real de autenticación dentro del alcance
* La ruta de super-admin, solo si la compatibilidad de respuesta está rota
* Los documentos 03 y 04

No modifiques servicios de Notification o email para rediseñarlos.

Si una corrección mínima de seguridad exige otro archivo, documenta primero la necesidad y limita el cambio estrictamente.

## Restricciones

No debes:

* Modificar schema.
* Crear o aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Modificar `.env` o `.env.test`.
* Modificar el runner o guard.
* Llamar a Mercado Pago real.
* Enviar emails reales.
* Levantar servidor.
* Ejecutar build.
* Hacer commit.
* Hacer push.
* Crear tags.
* Usar `git add`.
* Iniciar la subfase definitiva de notificaciones.

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

* HEAD es el commit de precedencia y cobertura.
* El working tree contiene únicamente los cambios del cron y sus documentos.
* No hay staged diff.
* Schema, migraciones, package files y entorno están intactos.
* No hay cambios de notificaciones, email, UI o métricas.

Guarda este prompt antes de editar.

Incluye en el informe un diagnóstico inicial breve, separado de las correcciones realizadas.

# 2. Verificación de las afirmaciones de Claude

Comprueba por código, no solo por pruebas, si es cierto que:

* Cada candidato se relee dentro de su transacción.
* La decisión se recalcula dentro.
* Toda transición utiliza CAS.
* El CAS compara estado y fronteras exactas.
* Tenant solo cambia cuando el CAS gana.
* AuditLog está dentro de la misma transacción.
* Payment concurrente prevalece.
* Reactivación concurrente prevalece.
* Dos crons producen una sola transición.
* Grace null no cambia.
* Los efectos externos ocurren después del commit.
* Un error por candidato no detiene el lote.
* El resumen contiene todas las categorías necesarias.
* La ruta del cron sigue protegida.
* No existe ninguna actualización masiva antigua que pueda degradar filas sin CAS.

Crea una tabla de afirmaciones:

* Confirmada.
* Confirmada con matices.
* Incorrecta.
* No demostrada.

# 3. Decisión pura

Revisa `decideCronTransition`.

Reconstruye la matriz completa:

* ACTIVE vigente.
* ACTIVE vencida.
* ACTIVE exactamente en `now`.
* ACTIVE sin frontera.
* ACTIVE con fecha inválida.
* TRIAL vigente.
* TRIAL vencido.
* TRIAL exactamente en `now`.
* TRIAL sin `trialEndsAt`, pero con `currentPeriodEnd`.
* TRIAL sin ninguna frontera.
* GRACE vigente.
* GRACE vencida.
* GRACE exactamente en `now`.
* GRACE null.
* SUSPENDED.
* CANCELLED.
* PENDING_PAYMENT.
* Estado runtime desconocido.

Confirma:

* No muta inputs.
* No concede ni retira acceso con fechas inválidas.
* El fallback de TRIAL coincide con el comportamiento histórico real.
* `<= now` está aplicado consistentemente en selección y decisión.
* No existe una transición que la selección nunca pueda encontrar.
* No existe una selección cuyo resultado puro siempre sea PRESERVE por contradicción.

Corrige cualquier divergencia.

# 4. Selección de candidatos y starvation

Este punto es crítico.

Actualmente existe un límite de lote y se incluyen filas:

* realmente transicionables;
* `GRACE_PERIOD` con `graceEndsAt = null`, que permanecen inconsistentes indefinidamente.

Analiza si una cantidad grande de filas inconsistentes o con errores permanentes puede consumir siempre el lote y evitar que se procesen filas válidas.

Ejemplo obligatorio:

1. Existen 500 o más filas GRACE con `graceEndsAt = null`.
2. Existe una Subscription GRACE vencida que debe suspenderse.
3. Se ejecuta el cron repetidamente.

La Subscription válida no puede quedar bloqueada indefinidamente.

## Corrección esperada

Separa conceptualmente:

* Candidatos accionables.
* Inconsistencias diagnósticas.

Una solución segura puede consistir en:

* Consultar primero candidatos accionables con su propio límite.
* Consultar las inconsistencias mediante una consulta separada y un límite diagnóstico independiente.
* Contar el total de inconsistencias sin cargar todas sus filas.
* Limitar los detalles retornados.
* Informar si los detalles fueron truncados.

No permitas que las inconsistencias consuman la capacidad destinada a transiciones.

Revisa también:

* Orden determinista.
* Desempate por `id`.
* Orden por la frontera relevante.
* Starvation entre ACTIVE, TRIAL y GRACE.
* Starvation causada por candidatos que fallan permanentemente.

No implementes paginación compleja sin necesidad, pero el lote debe avanzar de forma razonablemente justa.

Añade pruebas con una cantidad superior al límite o una versión reducida configurable solo para pruebas.

# 5. Límite y orden del lote

Confirma si `CRON_BATCH_LIMIT = 500` es:

* total;
* por estado;
* por consulta.

Evalúa si un backlog grande de ACTIVE puede impedir indefinidamente que GRACE vencidas se suspendan, o viceversa.

Corrige con una política explícita, por ejemplo:

* cupos por tipo de transición;
* consultas separadas;
* combinación determinista;
* prioridad documentada.

La política debe favorecer que ninguna categoría válida quede bloqueada indefinidamente por otra categoría permanente.

No cargues toda la base.

# 6. Relectura y CAS

Revisa `processCronCandidate`.

Confirma que la fila se relee por:

* `id`;
* `tenantId`.

Revisa el CAS:

```text
id
tenantId
status
currentPeriodEnd
trialEndsAt
graceEndsAt
```

Comprueba:

* comportamiento de nulls;
* fechas exactas;
* no hay reconstrucción;
* `count = 1` como única señal de éxito;
* `count = 0` sin Tenant/AuditLog/Notification/email;
* no hay reintento automático.

Busca cualquier caller que modifique Subscription antes o después sin CAS dentro del mismo flujo.

## Fronteras no relacionadas

Determina si comparar siempre las tres fronteras causa falsos conflictos indebidos.

Ejemplo:

* ACTIVE expirada.
* Otro proceso modifica solamente `trialEndsAt`, un campo irrelevante para ACTIVE.

Decide si debe perder el CAS por seguridad o si el CAS debe comparar únicamente:

* estado;
* frontera causante;
* campos adicionales realmente relevantes.

Prioriza fail-safe, pero documenta los falsos positivos.

# 7. Tenant concurrente

La protección CAS recae sobre Subscription.

Analiza este escenario:

1. El cron relee Subscription.
2. Una operación concurrente modifica solo `Tenant.status`, sin tocar Subscription.
3. El CAS de Subscription gana.
4. El cron actualiza Tenant.

Determina:

* Si los servicios actuales siempre actualizan Tenant y Subscription juntos.
* Si existe algún caller que pueda modificar solo Tenant.
* Si el cron podría sobrescribir una acción administrativa legítima.

Si existe un camino real, corrígelo con una verificación o CAS de Tenant dentro de la misma transacción.

No inventes protección para un escenario imposible según el repositorio, pero demuéstralo mediante búsqueda de callers.

# 8. Pago concurrente

Lee completamente la prueba y el código.

Confirma que la prueba:

* usa el webhook real del servicio;
* obtiene un Payment APPROVED;
* actualiza realmente el período de Subscription;
* actualiza Tenant;
* ocurre entre lectura y CAS;
* hace perder el CAS;
* no crea auditoría de Grace;
* no crea Notification;
* no llama email;
* no duplica períodos.

Fortalece aserciones faltantes.

# 9. Reactivación concurrente

Confirma que:

* la reactivación es la acción real de super-admin;
* existe evidencia válida;
* Subscription y Tenant pasan a ACTIVE dentro de su flujo real;
* el cron pierde;
* no suspende;
* no audita suspensión;
* no crea efecto externo.

Verifica también la carrera frente a una suspensión/cancelación administrativa directa si existe como servicio real.

# 10. Dos crons concurrentes

Analiza si el test actual representa dos ejecuciones concurrentes suficientemente reales o únicamente una ejecución anidada secuencial.

Debe demostrar:

* ambos leen el mismo candidato elegible;
* solo uno obtiene CAS;
* solo uno actualiza Tenant;
* solo uno crea AuditLog;
* el perdedor devuelve `SKIPPED_CONCURRENT_CHANGE`.

No es obligatorio usar sleeps.

Usa seams, barreras o promesas controladas que se limpien siempre.

Si el test anidado ya demuestra correctamente la propiedad del CAS, documenta el matiz. Si no, corrígelo.

# 11. Atomicidad

Verifica que Subscription, Tenant y AuditLog estén dentro de la misma transacción.

Prueba fallos en:

* antes de Tenant;
* durante Tenant;
* antes de AuditLog;
* durante AuditLog.

Confirma:

* rollback de Subscription;
* rollback de Tenant;
* ausencia de AuditLog parcial;
* reintento posterior limpio;
* una sola auditoría final.

Los seams no deben reemplazar la necesidad de probar el fallo real del servicio cuando sea posible.

# 12. Grace null

Confirma:

* Se reporta sin modificar.
* No se suspende.
* No se inventa fecha.
* No consume el lote accionable.
* No crea AuditLog de suspensión.
* No crea Notification.
* No envía email.
* El resumen indica:

  * total encontrado;
  * detalles limitados;
  * si hubo truncamiento, cuando corresponda.

No devuelvas miles de IDs en una respuesta HTTP.

# 13. Efectos externos

Inspecciona `notifyTenantAdminsOfLicenseChange`.

Determina exactamente:

* Si crea Notification.
* Si crea EmailLog.
* Si llama a Resend.
* Qué ocurre si Notification falla.
* Qué ocurre si email falla.
* Qué devuelve.
* Si procesa varios tenants.
* Si una excepción corta el procesamiento de otros efectos.

Confirma las reglas:

* después del commit;
* solo para APPLIED;
* nunca para CAS perdido;
* nunca para rollback;
* nunca para PRESERVE;
* nunca para INCONSISTENT.

## Resumen de efectos

El prompt original pidió efectos externos programados o ejecutados.

El resumen debe informar, sin datos personales, como mínimo:

* transiciones aplicadas;
* tenants para los que se intentó notificación;
* notificaciones exitosas;
* notificaciones fallidas;
* emails intentados, si el helper permite conocerlo;
* errores de efectos externos.

No mezcles un fallo posterior al commit con un rollback inexistente.

Una transición ya confirmada debe seguir contándose como aplicada aunque falle su notificación.

No implementes deduplicación definitiva.

# 14. Fallos externos posteriores al commit

Prueba:

1. La transición confirma.
2. Notification falla.
3. Email falla o no está configurado.

Resultado esperado:

* Subscription y Tenant siguen en el nuevo estado.
* AuditLog existe.
* El resumen registra la transición aplicada.
* El resumen registra el fallo externo.
* El lote continúa con otros candidatos.
* No se vuelve a ejecutar la transición.
* No se informa falsamente que la transición falló.

# 15. Neutralización de emails en pruebas

Claude retiró temporalmente `RESEND_API_KEY` en el proceso del archivo.

Revisa:

* restauración garantizada en `after` o `finally`;
* ausencia de contaminación entre tests;
* ausencia de llamadas reales;
* comportamiento cuando la variable no existía inicialmente;
* creación de EmailLog FAILED esperada o no;
* limpieza de esos EmailLogs;
* que no dependa de que cada archivo se ejecute en un proceso distinto sin garantía del runner.

Prefiere una neutralización explícita y determinista.

No modifiques `.env`.

No modifiques el servicio de email salvo defecto crítico y dentro del alcance.

# 16. Resumen del cron

Revisa `CronRunSummary`.

Debe conservar compatibilidad con:

* ruta HTTP del cron;
* super-admin;
* toast/UI existentes.

Confirma que distingue:

* candidatos accionables examinados;
* transiciones a Grace;
* transiciones a Suspended;
* preservados;
* saltados por cambio concurrente;
* inconsistencias totales;
* detalles de inconsistencias limitados;
* errores por candidato;
* efectos externos exitosos/fallidos.

No incluyas:

* nombres;
* correos;
* stacks;
* mensajes internos sensibles;
* secretos.

Corrige cualquier categoría ausente.

# 17. Errores por candidato

Revisa `classifyCronError`.

Confirma:

* no expone mensajes sensibles;
* no expone stack;
* distingue errores Prisma relevantes;
* no confunde fallos externos posteriores al commit con fallos transaccionales;
* un error individual no detiene el lote.

Analiza candidatos que fallan persistentemente y su posible impacto en el batch.

Documenta el riesgo o mejora la selección para impedir starvation.

# 18. Autenticación

Revisa la ruta `GET /api/cron/overdue-rules`.

Confirma expresamente:

* Si `CRON_SECRET` no existe, responde 401.
* `Authorization: Bearer undefined` no puede aprobar.
* Credencial ausente → 401.
* Credencial incorrecta → 401.
* Credencial correcta → ejecuta.
* No registra el secreto.
* No devuelve el secreto.
* El endpoint no permite pasar `tenantIds` desde query o body, salvo que exista una autorización explícita.

Evalúa comparación timing-safe. Solo corrígela si la implementación actual representa un riesgo material y la corrección es mínima.

Añade pruebas de ruta si no existen y son necesarias.

# 19. Parámetro `options.tenantIds`

Revisa:

* Todos sus callers.
* Si puede venir de input HTTP.
* Si valida duplicados o lista vacía.
* Si una lista muy grande degrada la consulta.
* Si se usa exclusivamente para pruebas o uso interno.
* Si cambia el comportamiento de producción.

Debe ser retrocompatible y no abrir un mecanismo de procesamiento arbitrario para usuarios no autorizados.

Si solo existe para tests, considera si un seam o helper interno sería menos invasivo. No lo elimines si aporta una capacidad interna válida y segura.

# 20. Seams

Confirma:

* solo `NODE_ENV === "test"`;
* sin ruta HTTP;
* reset en `finally`;
* limpieza global;
* sin sleeps;
* sin promesas eternas;
* una prueba no contamina a la siguiente;
* los hooks pueden dirigirse a un candidato concreto;
* los tests concurrentes no comparten hooks accidentalmente.

Corrige cualquier seam que pueda quedar activo tras un fallo.

# 21. Pruebas puras

Lee las 17 pruebas nuevas.

Añade las necesarias para cualquier corrección.

Debe quedar cubierto:

* matriz completa;
* fronteras exactas;
* fechas inválidas;
* fallback TRIAL;
* Grace null;
* desconocido;
* no mutación.

No dupliques la implementación en las expectativas.

# 22. Pruebas de integración

Lee todos los escenarios del nuevo archivo.

Verifica el conteo real: el informe habla de 21 escenarios, pero el aumento total reportado parece corresponder a un número distinto de pruebas de integración. Explica la diferencia.

Añade o fortalece pruebas para:

1. Starvation por más inconsistencias que el límite.
2. Starvation entre tipos de transición.
3. Orden determinista con empate.
4. Pago concurrente.
5. Reactivación concurrente.
6. Dos crons concurrentes.
7. CAS perdido por período.
8. CAS perdido por status.
9. Fallo real de Tenant.
10. Fallo de AuditLog.
11. Notification fallida después del commit.
12. Email no configurado.
13. Grace null no consume lote accionable.
14. Resumen completo.
15. Auth sin secreto, ausente, incorrecta y válida, si no existe cobertura previa.
16. Limpieza de hooks y variables.

No añadas `skip`.

No uses sleeps.

No envíes emails reales.

# 23. Corrección directa

Después de la revisión:

* Corrige directamente todos los hallazgos críticos, altos y medios dentro del alcance.
* Añade las pruebas correspondientes.
* No te limites a emitir recomendaciones.
* Los hallazgos bajos pueden quedar documentados si no afectan commit, cron o producción.
* No hagas commit.

Si no encuentras defectos bloqueantes, fortalece únicamente las pruebas o el resumen cuando el contrato original no esté completamente demostrado.

# 24. Compatibilidad

Confirma que siguen pasando:

* Toda la suite previa de billing.
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
* Autenticación existente.

No debilites pruebas anteriores.

# 25. Ejecución segura

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

No modifiques el guard, `.env` o `.env.test`.

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

# 26. Limpieza

Antes y después confirma:

* conteos básicos;
* cero fixtures del cron;
* cero fixtures de billing;
* cero WebhookEvent residuales;
* cero usuarios de prueba;
* cero llamadas reales a Mercado Pago;
* cero emails reales;
* restauración de variables;
* hooks reseteados;
* `.env` intacto;
* `.env.test` ignorado;
* conteos de mockdata iguales.

# 27. Criterios de aceptación

El resultado solo puede considerarse corregido si:

1. La decisión pura es coherente.
2. Candidatos accionables no sufren starvation por inconsistencias.
3. Ninguna categoría válida queda bloqueada indefinidamente por el batch.
4. Cada candidato se relee dentro de la transacción.
5. Toda transición usa CAS.
6. Pago concurrente prevalece.
7. Reactivación concurrente prevalece.
8. Dos crons no duplican.
9. Tenant y AuditLog son atómicos.
10. Grace null no cambia ni consume el lote accionable.
11. Fallos externos no revierten ni ocultan una transición confirmada.
12. El resumen refleja efectos externos.
13. Errores por candidato no detienen el lote.
14. Auth es segura.
15. Seams son exclusivos de test.
16. No cambia schema.
17. No hay migración.
18. Typecheck pasa.
19. Lint pasa.
20. Pruebas puras pasan.
21. Suite completa pasa.
22. No hay skip.
23. Fixtures quedan limpios.
24. No se envían emails reales.
25. No se hace commit.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git.
3. Afirmaciones verificadas.
4. Hallazgos iniciales.
5. Correcciones implementadas.
6. Decisión pura.
7. Selección y starvation.
8. Límite y orden.
9. Transacción por candidato.
10. CAS.
11. Pago concurrente.
12. Reactivación concurrente.
13. Dos crons.
14. Atomicidad.
15. Grace null.
16. Efectos externos.
17. Fallos posteriores al commit.
18. Resumen.
19. Errores por candidato.
20. Autenticación.
21. `options.tenantIds`.
22. Seams.
23. Archivos modificados.
24. Schema y migración.
25. Pruebas puras.
26. Pruebas de integración.
27. Compatibilidad.
28. Procedimiento seguro.
29. Comandos ejecutados.
30. Resultados.
31. Limpieza.
32. Hallazgos restantes.
33. Riesgos aceptados.
34. Recomendación para la revisión final de Claude.
35. Estado:

* CORREGIDO.
* CORREGIDO CON RIESGOS.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/04-cron-atomicidad/04-respuesta-codex-revision-correccion-cron-cas-atomicidad.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/04-cron-atomicidad/03-prompt-codex-revision-correccion-cron-cas-atomicidad.md`

3. No hagas commit.

4. No hagas push.

5. No inicies la subfase de notificaciones.

6. Detente después del informe.
