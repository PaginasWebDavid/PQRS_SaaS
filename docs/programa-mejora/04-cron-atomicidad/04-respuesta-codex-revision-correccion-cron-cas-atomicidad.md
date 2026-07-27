# FASE 2M - Respuesta Codex: revision y correccion del cron con CAS y atomicidad

## 1. Resumen ejecutivo
La implementacion base de Claude tenia una buena decision pura, transaccion por candidato y CAS, pero conservaba riesgos reales de starvation, pruebas de concurrencia insuficientes y efectos externos opacos. Corregi esos puntos sin cambiar schema, migraciones ni contratos principales. El resultado final pasa typecheck, lint, 204 pruebas puras y la suite completa de 326 pruebas.

## 2. Estado inicial de Git
HEAD inicial: `a8a9a2a feat(billing): enforce payment precedence and access coverage`; anterior: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`. No habia cambios staged. Ya existian cambios sin commit en `billing.service.ts` y archivos no rastreados de esta subfase (`cron-decision.ts`, sus pruebas y documentos 01/02). No reverti ni sobrescribi trabajo ajeno.

## 3. Afirmaciones verificadas
Se confirmaron: decision recalculada dentro de la transaccion; CAS para toda transicion; comparacion de estado y las tres fronteras; Tenant y AuditLog en la misma transaccion; pago y reactivacion concurrentes prevalecen; estados terminales se preservan; un error por candidato no aborta el lote; no existen actualizaciones masivas antiguas. Quedaron confirmadas despues de corregir: concurrencia real entre dos crons, ausencia de starvation por GRACE inconsistente o por otra categoria, resumen de efectos externos y autenticacion con comparacion segura.

## 4. Hallazgos iniciales
`2M-01 ALTO`: GRACE sin `graceEndsAt` consumia el mismo lote de 500 y podia bloquear candidatos validos. `2M-02 ALTO`: un backlog de una categoria podia bloquear las demas. `2M-03 MEDIO`: fallos de notificacion, email o lectura de destinatarios no quedaban reflejados y podian ocultar transiciones confirmadas. `2M-04 MEDIO`: la prueba de dos crons era secuencial, no una carrera sobre el mismo snapshot. `2M-05 MEDIO`: diagnosticos y detalles de error no estaban suficientemente acotados. `2M-06 BAJO`: comparacion directa del secreto del cron. `2M-07 MEDIO`: faltaba probar un fallo real de AuditLog.

## 5. Correcciones implementadas
Separe cuatro buckets accionables con cupos propios; saque las inconsistencias del lote accionable; agregue orden y limites deterministas; amplie el resumen; aisle los efectos externos posteriores al commit; agregue comparacion timing-safe para el secreto; y fortaleci las pruebas de carrera, rollback, starvation, limites, auth y fallos externos.

## 6. Decision pura
`decideCronTransition` sigue siendo puro y fail-safe. Cubre ACTIVE, TRIAL, GRACE_PERIOD, PENDING_PAYMENT, SUSPENDED, CANCELLED, estado desconocido, fechas invalidas, frontera exacta `<= now`, fallback de TRIAL y no mutacion del snapshot.

## 7. Seleccion y starvation
ACTIVE vencida, TRIAL vencida, TRIAL con fallback y GRACE vencida se seleccionan por consultas independientes. GRACE sin frontera se cuenta y diagnostica aparte, por lo que ya no consume cupo ni impide una suspension valida.

## 8. Limite y orden
El limite productivo total sigue en 500, repartido entre cuatro categorias. Cada bucket ordena por frontera ascendente y luego por `id`; los buckets se intercalan. Los detalles de inconsistencias y fallos externos se truncan a 50.

## 9. Transaccion por candidato
Cada candidato se relee por `id` y `tenantId`, se reevalua y se procesa en su propia transaccion. Un fallo revierte solo ese candidato y el bucle continua con los restantes.

## 10. CAS
El `updateMany` condicional compara `id`, `tenantId`, `status`, `currentPeriodEnd`, `trialEndsAt` y `graceEndsAt`. Si cualquier actor concurrente cambia el snapshot, el cron obtiene `count = 0`, no modifica Tenant ni crea auditoria.

## 11. Pago concurrente
La prueba fuerza un pago APPROVED despues de la lectura y antes del CAS. El pago deja la suscripcion ACTIVE con periodo renovado; el cron pierde el CAS y no crea efectos externos.

## 12. Reactivacion concurrente
La prueba fuerza una reactivacion administrativa en la misma ventana. La reactivacion prevalece, el cron no sobrescribe el nuevo periodo y no emite auditoria ni notificaciones de mora.

## 13. Dos crons
La prueba usa una barrera real: ambos crons leen el mismo snapshot antes de liberarse. Exactamente uno gana el CAS; existe una sola transicion de Tenant y un solo AuditLog.

## 14. Atomicidad
Subscription, Tenant y AuditLog se escriben dentro de la misma transaccion. Se probaron fallos inyectados antes de Tenant, antes de AuditLog y un fallo real de FK al crear AuditLog; todos revierten el candidato y permiten un reintento limpio.

## 15. Grace null
Una GRACE con `graceEndsAt = null` permanece intacta, no altera Tenant, no genera efectos externos y aparece como inconsistencia. Tres inconsistencias con detalle limitado no bloquearon una GRACE vencida valida.

## 16. Efectos externos
Notificaciones y emails ocurren solo despues del commit y solo para transiciones `APPLIED`. Se contabilizan intentos, exitos, fallos, tenants intentados y errores sanitizados, sin direcciones de correo, mensajes privados ni stacks.

## 17. Fallos posteriores al commit
Un fallo de destinatarios, Notification o Resend no revierte una transicion confirmada ni detiene otros tenants. La prueba provoca fallos reales controlados, comprueba persistencia economica y verifica que el resumen los reporte.

## 18. Resumen
Se preservaron `movedToGracePeriod` y `movedToSuspended` para compatibilidad. Se agregaron candidatos examinados, cupo, conteo por categoria, preservados, CAS perdidos, inconsistencias, truncamiento, errores por candidato y metricas de efectos externos.

## 19. Errores por candidato
Los errores se clasifican sin filtrar datos sensibles. Un candidato fallido incrementa `errors`, conserva un detalle acotado y no bloquea una transicion valida posterior.

## 20. Autenticacion
La ruta sigue siendo fail-closed si falta `CRON_SECRET`, falta el header o la credencial es incorrecta. La comparacion valida la longitud y usa `timingSafeEqual`; `Bearer undefined` es rechazado.

## 21. `options.tenantIds`
El alcance opcional se valida, recorta, deduplica y limita a 1000 IDs. Una lista vacia procesa cero tenants. Los overrides de limites solo se aceptan con `NODE_ENV=test` y ninguna ruta HTTP expone estas opciones.

## 22. Seams
Los hooks de concurrencia se ejecutan exclusivamente con `NODE_ENV=test`, no tienen entrada HTTP y quedan vacios por defecto. Las pruebas los restauran en `finally` y `after`.

## 23. Archivos modificados
Corregidos por Codex: `src/domains/billing/billing.service.ts`, `src/app/api/cron/overdue-rules/route.ts` y `tests/billing-cron-atomicity.test.ts`. Creados por requerimiento: documentos 03 y 04. Revisados sin editar: `src/domains/billing/cron-decision.ts`, `tests/unit/cron-decision.test.ts` y documentos 01/02.

## 24. Schema y migracion
No se modifico `prisma/schema.prisma`, no se creo ni ejecuto migracion, no se uso `db push`, no se ejecutaron seeds y no se tocaron `.env` ni `.env.test`.

## 25. Pruebas puras
`node --import tsx --test tests/unit/*.test.ts`: 204 aprobadas, 0 fallidas, 0 omitidas y 0 TODO. La matriz especifica del cron contiene 17 casos.

## 26. Pruebas de integracion
`tests/billing-cron-atomicity.test.ts` contiene 26 casos: transiciones, terminales, carreras, dos crons, rollback, AuditLog real, ausencia de efectos externos indebidos, fallos externos, continuidad, starvation, orden, limites, alcance y autenticacion.

## 27. Compatibilidad
Las dos propiedades consumidas por la UI de super-admin permanecen. La ruta cron conserva metodo, respuesta y codigos. No fue necesario modificar la ruta super-admin ni servicios de notificaciones/email.

## 28. Procedimiento seguro
El `npm test` inseguro aborto antes de Prisma. La suite segura se ejecuto con `DATABASE_URL` y `DIRECT_URL` temporalmente en blanco, usando el runner y guard oficiales; las variables se restauraron en `finally`.

## 29. Comandos ejecutados
`npx tsc --noEmit`; `npm run lint`; `node --import tsx --test tests/unit/*.test.ts`; `npm test` inseguro; `npm test` aislado; consultas de conteo de solo lectura con el guard oficial; `git diff --check`; busqueda de `skip`.

## 30. Resultados
Typecheck: PASS. Lint: PASS, 0 warnings. Pruebas puras: 204/204. Suite completa: 326/326, 0 fallidas, 0 omitidas, 0 TODO. `git diff --check`: limpio. No hubo reintento por fallo logico.

## 31. Limpieza
Los conteos antes y despues fueron identicos: tenants 6, users 17, subscriptions 6, payments 5, webhooks 0, auditLogs 164, notifications 42, emailLogs 26 y pricingRules 7. Fixtures cron/billing, usuarios cron/billing y webhooks cron/billing quedaron en 0. No hubo llamadas reales a Mercado Pago ni emails reales.

## 32. Hallazgos restantes
No quedan hallazgos criticos, altos o medios dentro del alcance autorizado. Quedan riesgos operativos bajos: sin redistribucion de cupos vacios se puede procesar menos de 500; 125 fallos permanentes en una misma categoria podrian retrasar filas posteriores; y no se agregaron indices especializados porque schema estaba prohibido.

## 33. Riesgos aceptados
Los efectos externos posteriores al commit aun no tienen outbox ni idempotencia propia, expresamente reservados para la siguiente subfase. Comparar las tres fronteras puede producir un conflicto conservador por un campo irrelevante, pero es fail-safe y se recupera en la siguiente corrida.

## 34. Recomendacion para la revision final de Claude
Claude debe revisar de forma independiente la distribucion de cupos, la semantica `<= now`, el CAS de las tres fronteras, la carrera con barrera y las metricas de efectos externos. Recomiendo aprobar esta subfase si reproduce 326/326 y acepta los riesgos bajos; despues puede iniciar, por separado, la subfase de idempotencia/outbox de notificaciones.

## 35. Estado
**CORREGIDO CON RIESGOS.** No hice commit, push, tag, build, servidor, cambios de schema ni inicio de la subfase de notificaciones.
