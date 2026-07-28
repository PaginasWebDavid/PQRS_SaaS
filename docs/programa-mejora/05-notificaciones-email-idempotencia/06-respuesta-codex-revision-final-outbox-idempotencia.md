# FASE 2R - Revision final del outbox de notificaciones y emails

1. **Resumen ejecutivo:** El codigo de produccion es solido y no encontre un defecto funcional critico o alto. Schema, migracion, atomicidad, fencing y semantica de email son coherentes. Sin embargo, cinco ventanas obligatorias no estan demostradas por pruebas reales; como el prompt prohibe aprobar cobertura declarativa, el veredicto es `REQUIERE CORRECCIONES`.
2. **Estado de Git:** HEAD `b924f64 feat(billing): make overdue cron atomic and concurrency-safe`; no hay commit nuevo, staged diff, push ni tags. `git diff --check` no reporta errores, solo avisos historicos LF/CRLF.
3. **Alcance del diff:** Solo schema, migracion nueva, cinco servicios/integraciones, tres archivos de pruebas y documentos 01 a 06. `.env`, `.env.test`, package files, runner, guard y migraciones historicas estan intactos.
4. **Verificacion de Claude:**

| Afirmacion | Estado | Evidencia y riesgo | Bloquea commit | Bloquea produccion |
| --- | --- | --- | --- | --- |
| 1. Sin defectos criticos, altos o medios | INCORRECTA | No hay defecto medio de produccion, pero si una brecha media de cobertura obligatoria R-01 | Si | Si |
| 2-4. Schema=migracion, outbox durable y creacion atomica | CONFIRMADA | SQL, schema, transaccion y rollback real | No | No |
| 5-10. IN_APP exactly-once, email honesto, claim/attempt atomicos, frontera previa al fetch, sin tx durante red, unknown sin retry | CONFIRMADA | Unique reales, CAS, transacciones cortas y seleccion de estados | No | No |
| 11. Worker tardio no sobrescribe unknown | CONFIRMADA CON MATICES | El CAS es correcto; la prueba usa updates directos, no la recuperacion real | Si, por R-01 | Si, por R-01 |
| 12-14. Camino unico, drenaje sin transiciones y sin PII | CONFIRMADA | Busqueda global, cron y payload/hash | No | No |
| 15. Pruebas cubren todas las ventanas | INCORRECTA | Faltan cinco escenarios reales obligatorios | Si | Si |
| 16. Sin llamadas reales a proveedores | CONFIRMADA | Fetch mockeado, key ficticia y cero Mercado Pago real | No | No |

5. **Schema:** Los cuatro enums y los modelos Outbox/Attempt son coherentes. `dedupeKey` es unico; status, intentos, lease, timestamps, payload y dispatch index son correctos. Notification y EmailLog admiten null historico y deduplican. Los provider IDs se truncan a 255 en servicio, pero siguen siendo `TEXT` en DB, riesgo bajo N-07.
6. **Migracion:** Aditiva, sin casts ni borrados; enums antes de columnas; valores nuevos de EmailLog no se usan en la misma migracion; `updatedAt` se rellena antes de `NOT NULL`; uniques, indices y FKs coinciden con Prisma.
7. **Dedupe key:** Cambia por subscription, evento, boundary, destinatario y canal; usa ISO, SHA-256, prefijo versionado y longitud menor a 255, sin PII en claro. El separador `|` es aceptable porque los inputs controlados no lo admiten.
8. **Creacion atomica:** Relectura, decision, CAS, Tenant, AuditLog, recipients y outbox ocurren en una transaccion. Un fallo en outbox revierte todo; `createMany(skipDuplicates)` evita duplicados; sin recipients confirma la transicion y registra el resumen.
9. **Destinatarios:** Se eligen ADMIN activos dentro de la transaccion y se guarda solo userId; el email se relee al despachar. Inactivo y null terminan controladamente. La FK `SetNull` fue verificada, pero la prueba no elimina realmente al User.
10. **Seleccion:** Solo PENDING y FAILED_RETRYABLE vencido; PROCESSING abandonado se recupera aparte. COMPLETED, FAILED_FINAL y DELIVERY_UNKNOWN no son reenviables. Orden determinista y `nextAttemptAt` no nulo.
11. **Claim:** CAS por id, status, attemptCount, lockedAt y nextAttemptAt; claim y Attempt se crean en una transaccion. Un conflicto revierte ambos.
12. **Intentos:** Aumentan al claim; maximo cinco; backoff 15/30/60/120/240 minutos, tope 24 horas, `now` controlado, sin sleep ni retry en la misma ejecucion.
13. **IN_APP:** Notification, AuditLog, Attempt y finalizacion quedan atomicos; el unique de Notification hace exactly-once efectivo. Falta provocar el rollback mediante `AFTER_NOTIFICATION_CREATE`.
14. **EmailLog:** `outboxId` y `dedupeKey` son unicos y se reutiliza una fila por intencion; no se guarda respuesta completa. Falta una prueba que provoque conflictos reales de EmailLog y Attempt.
15. **Frontera del proveedor:** Claim, EmailLog y marcador durable ocurren antes del fetch; la transaccion cierra antes de Resend. Caida pre-marcador es recuperable; post-marcador es unknown. No existe seam despues del marcador y antes del fetch para demostrar esa ventana.
16. **Clasificacion:** Sin key, email deshabilitado/invalido o recipient ausente -> FINAL; 400/401/403 -> FINAL; 408/425/429/5xx -> RETRYABLE; timeout, red, 2xx ilegible o sin id -> UNKNOWN; 2xx con id -> SENT. Codigos e IDs se sanitizan/truncan.
17. **DELIVERY_UNKNOWN:** No se selecciona, reencola, reintenta ni convierte automaticamente; EmailLog/Attempt conservan trazabilidad y el resumen lo cuenta. No hay otra escritura global que lo revierta.
18. **Recovery:** IN_APP y EMAIL pre-provider vuelven a PENDING; EMAIL post-provider pasa a UNKNOWN mediante CAS. La recuperacion real se prueba separadamente.
19. **Fencing:** `(status=PROCESSING, attemptCount)` impide que un worker tardio marque COMPLETED/SENT. La prueba valida el CAS, pero sustituye al recovery con updates directos.
20. **Backoff:** Formula y fronteras 1..5 verificadas; abandono pre-provider consume intento, riesgo bajo aceptado N-01.
21. **Dispatcher:** Procesamiento secuencial, error aislado, drenaje antiguo y estados terminales correctos. El limite de 100 aplica a candidatos; recovery puede examinar otras 100 filas, riesgo menor N-06.
22. **Camino unico:** Para billing solo existe `transicion -> outbox -> dispatcher`. `sendEmailSafe` queda exclusivamente en flujos no billing.
23. **Resumen:** Conserva campos de UI y agrega creacion/despacho, errores sanitizados y truncados a 50; no expone emails, nombres, payloads, stacks, respuestas ni secretos.
24. **Autenticacion:** Cron fail-closed con `timingSafeEqual`; Super Admin exige rol; no hay ruta nueva ni overrides HTTP del outbox; opciones de tiempo/lote solo funcionan con `NODE_ENV=test`.
25. **Seams:** Los ocho seams son test-only, reseteables y sin sleeps. Son seguros, pero falta uno despues de persistir `providerAttemptStartedAt` y antes del fetch.
26. **Conteo de pruebas:** `353 - 326 = 27`; 15 unitarias nuevas y 12 escenarios de integracion nuevos. `tests/billing-cron-atomicity.test.ts` solo cambia por compatibilidad, sin tests nuevos.
27. **Cobertura de 28 requisitos:** CUBIERTO: 1,2,5,9,11,12,14-25,27,28. CUBIERTO CON MATICES: 3,7,10. AUSENTE: 4 dos dispatchers IN_APP; 6 crash tras Notification; 8 crash post-marcador pre-fetch; 13 borrado real de User; 26 conflicts reales de EmailLog/Attempt.
28. **Riesgos N-01 a N-07:**

| ID | Riesgo | Severidad | Aceptable | Bloquea commit | Bloquea produccion |
| --- | --- | --- | --- | --- | --- |
| N-01 | Abandono pre-provider consume intento | Baja | Si | No | No |
| N-02 | `lockedAt` usa now de corrida | Baja | Si | No | No |
| N-03 | Separador `|` | Informativa | Si | No | No |
| N-04 | 5xx retryable | Informativa | Si | No | No |
| N-05 | `externalEffects.emailFailed` aproximado | Informativa | Si | No | No |
| N-06 | Recovery 100 + seleccion 100 por corrida | Baja | Si | No | No |
| N-07 | Provider IDs acotados en servicio, no por DB | Baja | Si | No | No |

29. **Compatibilidad:** Payment idempotente, precedencia, cobertura, reactivacion, cuarentena, cron CAS/atomicidad/starvation, auth, invitaciones, permisos, Super Admin, UI y guard siguen verdes.
30. **Ejecucion:** `npm test` inseguro aborto antes de Prisma; validate/generate, typecheck y lint pasaron; puras `219/219`; suite protegida `353/353`, sin fail/skip/todo. No se ejecuto build ni servidor.
31. **Limpieza:** Antes y despues: 6 tenants, 17 users, 6 subscriptions, 5 payments, 0 webhooks, 164 audits, 42 notifications, 26 EmailLogs, 7 pricing rules, 0 outbox, 0 attempts, 0 PROCESSING/UNKNOWN/fixtures. Cero emails/Mercado Pago reales; variables restauradas; cero schemas temporales.
32. **Hallazgos:** R-01, MEDIA, pruebas de outbox: cinco ventanas obligatorias no se provocan realmente. Impacto: las garantias correctas por inspeccion carecen de regresion determinista. Correccion minima: agregar cinco pruebas reales y el seam post-marcador/pre-fetch; deben demostrar CAS, rollback, FKs y uniques. Bloquea commit y produccion. R-02/N-06 y R-03/N-07 son bajos y no bloquean.
33. **Riesgos aceptados:** N-01 a N-07; migracion aun debe aplicarse en produccion; DELIVERY_UNKNOWN requiere conciliacion manual; base de pruebas debe separarse antes de produccion.
34. **Lista para commit:** No autorizada mientras R-01 siga abierto. Tras corregir y aprobar: `prisma/schema.prisma`, migracion nueva, `billing.service.ts`, `billing-outbox-policy.ts`, `billing-outbox.service.ts`, `notification.service.ts`, `email.ts`, las tres pruebas y documentos 01 a 06.
35. **Comandos `git add`:** No ejecutar ahora. Alcance futuro explicito:
```text
git add -- prisma/schema.prisma prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql
git add -- src/domains/billing/billing.service.ts src/domains/billing/billing-outbox-policy.ts src/domains/billing/billing-outbox.service.ts src/domains/notifications/notification.service.ts src/lib/email.ts
git add -- tests/unit/billing-outbox-policy.test.ts tests/billing-outbox-idempotency.test.ts tests/billing-cron-atomicity.test.ts
git add -- docs/programa-mejora/05-notificaciones-email-idempotencia
```
36. **Mensaje futuro:** `feat(billing): add durable notification outbox`.
37. **Recomendacion:** Abrir una correccion acotada solo a seams/pruebas, ejecutar nuevamente 353+ casos y repetir esta revision. No cambiar schema ni produccion salvo que una prueba revele un defecto real.
38. **Veredicto:** `REQUIERE CORRECCIONES`.

Prompt guardado exactamente en `05-prompt-codex-revision-final-outbox-idempotencia.md` con SHA-256 `4FE54457647F71ADE908D3FF9EB401C817B02A35EA8784CBDF534BF185FB7A7C`. Informe guardado en este documento 06. No modifique codigo, pruebas, schema, migracion, configuracion ni documentos 01 a 04; no hice commit, push ni tags; no inicie otra subfase.
