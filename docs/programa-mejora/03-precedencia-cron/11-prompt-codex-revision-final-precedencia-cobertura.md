# FASE 2F — REVISIÓN FINAL DE PRECEDENCIA, TERMINALES Y COBERTURA

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/11-prompt-codex-revision-final-precedencia-cobertura.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/12-respuesta-codex-revision-final-precedencia-cobertura.md`

4. Guarda allí el informe final completo.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, pruebas, schema, migraciones, configuración ni variables de entorno.

---

Actúa como revisor técnico final especializado en facturación recurrente, máquinas de estados, Prisma, PostgreSQL, Mercado Pago y pruebas transaccionales.

Claude corrigió los hallazgos F2D-01 a F2D-08. Debes verificar adversarialmente el diff completo y decidir si la Subfase de precedencia y cobertura puede aprobarse y convertirse en commit.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/08-respuesta-codex-revision-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/09-prompt-claude-correcciones-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/10-respuesta-claude-correcciones-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/04-respuesta-codex-verificacion-precedencia-cron.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/TESTING.md`

La fuente de verdad es el código, el diff y las pruebas actuales.

## Restricciones

Esta es una revisión de solo lectura.

No debes:

* Modificar implementación.
* Modificar pruebas.
* Modificar schema.
* Crear o aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Modificar `.env` o `.env.test`.
* Modificar el guard.
* Mostrar secretos.
* Llamar a Mercado Pago real.
* Ejecutar build.
* Levantar el servidor.
* Hacer commit o push.
* Iniciar la subfase del cron.

Puedes:

* Ejecutar `git status`.
* Ejecutar `git diff`.
* Ejecutar `git diff --check`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Ejecutar pruebas puras.
* Ejecutar `npm test` mediante el procedimiento seguro ya autorizado.
* Consultar conteos seguros para validar limpieza.

No apliques migraciones.

## Primera acción

1. Guarda este prompt.
2. Ejecuta:

```text
git status --short
git log -1 --oneline
git diff --check
git diff --stat
git diff --name-status
```

3. Confirma:

   * HEAD continúa en `5e4be50`.
   * No existe un commit nuevo.
   * `prisma/schema.prisma` no cambió.
   * No existe una migración nueva.
   * `package-lock.json` no cambió.
   * El diff solo contiene precedencia, cobertura, reactivación, pruebas y documentación.
4. Inspecciona completamente:

   * `src/domains/billing/precedence.ts`
   * `src/domains/billing/mercado-pago.service.ts`
   * `src/domains/platform/tenant-admin.service.ts`
   * `tests/unit/billing-precedence.test.ts`
   * `tests/billing-webhook-idempotency.test.ts`

# 1. Verificación de F2D-01 a F2D-08

Crea una tabla:

* ID.
* Estado:

  * CORREGIDO.
  * CORREGIDO CON MATICES.
  * NO CORREGIDO.
  * REGRESIÓN.
* Evidencia.
* Riesgo restante.
* ¿Bloquea commit?
* ¿Bloquea cron?
* ¿Bloquea producción?

Incluye:

* F2D-01 Grace reiniciable.
* F2D-02 divergencia Tenant/Subscription.
* F2D-03 paused y terminales.
* F2D-04 auto-reactivación por APPROVED.
* F2D-05 normalizadores runtime.
* F2D-06 reactivación fuera de transacción.
* F2D-07 metadata unknown.
* F2D-08 pruebas incompletas.

# 2. Preservación de Grace

Verifica para Subscription `GRACE_PERIOD`:

* Grace vigente.
* Grace vencida.
* `graceEndsAt = null`.
* PENDING entrante.
* REJECTED entrante.
* Replays repetidos.

Confirma:

* `graceEndsAt` no cambia.
* Subscription sigue GRACE.
* Tenant sigue GRACE.
* No se crea un nuevo período.
* No se modifica `currentPeriodEnd`.
* Ledger queda `IGNORED`.
* `ignoredReason = EXISTING_GRACE_PRESERVED`.
* La auditoría refleja la preservación.

Busca cualquier otra ruta no-APPROVED que todavía pueda reasignar `graceEndsAt`.

# 3. Sincronización Tenant/Subscription

Revisa `applyTenantStatusInTx`.

Reconstruye la tabla completa:

| Subscription persistida | Tenant esperado |
| ----------------------- | --------------- |
| ACTIVE                  | ACTIVE          |
| TRIAL                   | TRIAL           |
| PENDING_PAYMENT         | PENDING_PAYMENT |
| GRACE_PERIOD            | GRACE_PERIOD    |
| SUSPENDED               | SUSPENDED       |
| CANCELLED               | CANCELLED       |

Confirma:

* ACTIVE solo se sincroniza cuando existe cobertura real válida en el flujo Mercado Pago.
* TRIAL exige trial vigente, no pago real.
* PENDING_PAYMENT siempre se sincroniza.
* GRACE se sincroniza solo ante una transición real.
* SUSPENDED y CANCELLED no son modificados por eventos protegidos.
* No existe un caller que pueda pasar un estado incoherente.
* No queda una rama sin manejar.

Analiza qué ocurre si ACTIVE no tiene cobertura real por un defecto previo: determina si dejar Tenant sin cambio es seguro y trazable.

# 4. Decisión de preapproval

Reconstruye la matriz para:

## Estados locales

* ACTIVE vigente.
* ACTIVE vencido.
* TRIAL vigente.
* TRIAL vencido.
* GRACE vigente.
* GRACE vencida.
* PENDING_PAYMENT.
* SUSPENDED.
* CANCELLED.

## Estados entrantes

* authorized.
* pending.
* paused.
* cancelled.
* desconocido.

Confirma:

* Terminales se preservan frente a authorized/pending/paused/unknown.
* authorized sin pago real no activa.
* authorized con trial disponible puede dejar TRIAL.
* pending con acceso vigente preserva.
* pending sin cobertura queda PENDING_PAYMENT.
* paused con acceso vigente preserva.
* paused sin cobertura queda PENDING_PAYMENT.
* paused no conserva ACTIVE/TRIAL/GRACE vencidos.
* unknown no modifica estados.
* cancelled conserva la política anterior y está documentado fuera de alcance.

Determina si alguna combinación deja Tenant y Subscription divergentes.

# 5. APPROVED sobre estados terminales

Verifica el flujo completo para:

* Subscription SUSPENDED.
* Subscription CANCELLED.

Confirma que el Payment:

* pasa a APPROVED;
* obtiene `paidAt`;
* reclama el efecto una vez;
* establece marcador;
* actualiza `periodStart` y `periodEnd`;
* aplica términos pendientes una vez;
* mantiene cuarentena e idempotencia;
* queda auditado;
* deja ledger PROCESSED.

Confirma que el acceso:

* continúa SUSPENDED o CANCELLED;
* no modifica Tenant;
* no modifica `graceEndsAt`;
* no ejecuta otra ruta que posteriormente active;
* no queda reactivado por preapproval;
* no queda reactivado por `applyTenantStatusInTx`.

## Punto crítico: términos pendientes

Analiza si aplicar y limpiar términos pendientes mientras la Subscription está SUSPENDED o CANCELLED es coherente con la política existente.

Clasifica:

* Correcto.
* Correcto con riesgo comercial.
* Defecto técnico.
* Decisión fuera de alcance.

No inventes una política nueva; documenta el efecto.

## Replay

Confirma que un segundo APPROVED:

* no extiende otra vez;
* no cambia el acceso terminal;
* queda DUPLICATE.

# 6. Normalizadores runtime

Verifica que ambos normalizadores acepten `unknown` y no lancen para:

* null;
* undefined;
* número;
* booleano;
* objeto;
* array;
* cadena vacía;
* mayúsculas;
* espacios.

Confirma que:

* no se ejecuta `.trim()` antes del type guard;
* los tipos inesperados se clasifican como unknown;
* `providerStatusLabel` no serializa objetos;
* labels de string están acotadas o sanitizadas;
* un valor inesperado no produce 500;
* el ledger termina IGNORED;
* no modifica estados locales.

Busca cualquier cast previo que impida que el valor runtime llegue al normalizador de forma segura.

# 7. Reactivación manual transaccional

Revisa `updateTenantStatusForSuperAdmin`.

Confirma que dentro de la misma transacción se realiza:

1. Lectura de Subscription.
2. Lectura de Payments.
3. Evaluación de evidencia.
4. Actualización de Subscription.
5. Actualización de Tenant.

Verifica:

* Sin evidencia: rollback y cero cambios.
* Pago real vigente: permite.
* Pago vencido: rechaza.
* Pago en cuarentena: rechaza.
* SIMULATED vigente: permite.
* Payment de otro tenant: no cuenta.
* Payment de otra subscription: no cuenta, si el modelo lo permite.
* La evidencia no puede cambiar entre validación y actualización dentro de la misma transacción.

## Auditoría

Determina si la auditoría de reactivación está:

* dentro de la misma transacción;
* fuera de la transacción;
* o en una segunda operación.

Si está fuera:

* analiza el fallo de auditoría después de reactivar;
* clasifica severidad;
* determina si bloquea esta subfase.

No aceptes la afirmación “reactivación transaccional” si la auditoría crítica sigue separada.

# 8. Metadata unknown

Verifica para:

* Payment nuevo desconocido.
* Payment existente desconocido.
* Preapproval desconocido.
* Tipo no string.

Confirma presencia de:

* `ignoredReason`.
* `providerStatus`.
* `previousPaymentStatus`.
* `incomingPaymentStatus`.
* `persistedPaymentStatus`.
* `previousSubscriptionStatus`.
* `persistedSubscriptionStatus`.
* `accessCovered`.
* `realPaymentCovered`.
* `appliedAccessEvidence`.
* `paymentExists`.
* `subscriptionId`.
* `tenantId`.

Confirma:

* solo primitivos;
* sanitización;
* sin payload;
* sin firma;
* sin token;
* sin datos de tarjeta;
* sin objeto o array completo;
* sin correos innecesarios.

Determina si null y campos ausentes se representan de manera consistente.

# 9. Rama no-APPROVED

Reconstruye:

1. PENDING inicial sin cobertura.
2. PENDING con trial.
3. REJECTED inicial sin cobertura.
4. REJECTED con ACTIVE vigente.
5. REJECTED con SIMULATED vigente.
6. REJECTED antiguo con Payment real vigente.
7. PENDING sobre APPROVED.
8. REJECTED sobre APPROVED.
9. REJECTED con GRACE vigente.
10. REJECTED con GRACE vencida.
11. REJECTED con GRACE null.
12. REJECTED con SUSPENDED.
13. REJECTED con CANCELLED.

Para cada escenario indica:

* Payment final.
* Subscription final.
* Tenant final.
* Períodos.
* `graceEndsAt`.
* Ledger.
* Auditoría.
* Razón.

Confirma que ningún evento no aprobado:

* reactiva terminales;
* reinicia Grace;
* borra `paidAt`;
* retrocede APPROVED;
* degrada cobertura vigente.

# 10. Coberturas

Revisa de nuevo:

* `hasCurrentAccessCoverage`.
* `hasCurrentRealPaymentCoverage`.
* `hasCurrentAppliedAccessEvidence`.

Confirma separación conceptual y callers.

Punto crítico:

La función de pago real no contiene identidad y depende del caller. Verifica todos los callers:

* filtran tenant correcto;
* filtran subscription correcta;
* no mezclan Payments de otra entidad;
* cargan campos completos;
* no usan resultados precargados incorrectos.

Para SIMULATED, confirma que la política sigue siendo “cualquier SIMULATED aprobado y vigente” y que está documentada como riesgo aceptado, no como ingreso real.

# 11. Pruebas puras

Lee completamente `tests/unit/billing-precedence.test.ts`.

Confirma:

* Número real de tests.
* Cobertura de normalización runtime.
* Mayúsculas y espacios.
* Fronteras exactas.
* Grace vigente/vencida/null.
* Preapproval terminales.
* paused sin cobertura.
* PENDING_PAYMENT.
* Evidencia REJECTED/PENDING/SIMULATED.
* Matriz de precedencia.
* No existen expectativas que vuelvan a codificar un bug.

Identifica cualquier categoría solicitada que siga faltando.

# 12. Pruebas de integración

Lee completamente los 48 escenarios.

Revisa con detalle los escenarios #24, #28 y #29–#48.

Para cada grupo confirma:

* Setup correcto.
* Servicio real.
* Mock de fetch.
* Firma HMAC.
* Estado inicial.
* Evento.
* Aserciones.
* Limpieza.

Verifica especialmente:

* Tres variantes de Grace.
* SIMULATED vigente.
* pending con/sin cobertura y con trial.
* paused sin cobertura.
* terminales de preapproval.
* APPROVED económico sobre terminales.
* reactivación manual real.
* vencido/cuarentena/SIMULATED.
* unknown no-string.
* fetch exactamente una vez.
* metadata.
* rollback de auditoría en ignored.

Confirma que el test de auditoría fallida realmente inyecta el fallo antes del AuditLog y verifica:

* rollback de `rawStatus` u otra metadata local;
* Subscription/Tenant intactos;
* ledger FAILED;
* sin AuditLog parcial;
* reintento posible, si corresponde.

# 13. Compatibilidad con Fase 1

Confirma mediante código y pruebas que siguen intactos:

* Idempotencia.
* Claim atómico.
* Concurrencia.
* Rollback.
* Reintento.
* Replay.
* Cuarentena.
* Reconciliación.
* Términos pendientes.
* Períodos.
* Missing dataId.
* Ledger.
* Preapproval atómico.

Busca:

* cambios en seams de fallo;
* cambios en orden transaccional;
* consultas externas dentro de transacción;
* regresiones en DUPLICATE;
* regresiones en Payment histórico.

# 14. Ejecución final

Antes de ejecutar:

* Confirma que `.env.test` está ignorado.
* Confirma autorización del proyecto de mockdata.
* Confirma cero pagos reales Mercado Pago.
* Confirma cero fixtures residuales.
* No muestres datos personales.

Ejecuta:

```text
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
DATABASE_URL= DIRECT_URL= npm test
```

Usa el runner seguro.

No apliques migraciones.

No reintentes automáticamente si falla.

# 15. Limpieza

Después de ejecutar confirma:

* Cero fixtures de billing.
* Cero WebhookEvent residuales.
* Cero usuarios de prueba residuales.
* Conteos del mockdata sin cambios.
* Sin llamadas reales a Mercado Pago.
* `.env` intacto.
* `.env.test` ignorado.

# 16. Alcance del eventual commit

Si la revisión aprueba, entrega la lista exacta de archivos que deben incluirse en el commit:

* implementación;
* pruebas;
* documentación de `03-precedencia-cron`.

No incluyas:

* `.env`.
* `.env.test`.
* archivos temporales;
* logs;
* cambios de schema;
* migraciones;
* cambios ajenos.

Entrega comandos `git add` explícitos, pero no los ejecutes.

Propón un mensaje de commit profesional.

# Hallazgos

Para cada hallazgo nuevo incluye:

* ID.
* Severidad.
* Archivo y símbolo.
* Comportamiento.
* Impacto.
* Evidencia.
* Corrección mínima.
* Prueba requerida.
* ¿Bloquea commit?
* ¿Bloquea cron?
* ¿Bloquea producción?

# Criterios para aprobar

La implementación se aprueba únicamente si:

1. Los ocho F2D están corregidos.
2. Grace nunca se reinicia.
3. Tenant y Subscription permanecen coherentes.
4. Terminales están protegidos.
5. APPROVED aplica dinero sin auto-reactivar.
6. Replay no duplica.
7. Normalizadores no lanzan.
8. Unknown no degrada.
9. Reactivación valida evidencia dentro de transacción.
10. Auditoría de reactivación tiene una política aceptable.
11. Metadata es completa y segura.
12. Coberturas siguen separadas.
13. Pruebas obligatorias están presentes.
14. Fase 1 sigue intacta.
15. No cambia schema.
16. No existe migración.
17. Typecheck pasa.
18. Lint pasa.
19. Pruebas puras pasan.
20. Suite completa pasa.
21. No hay skip.
22. No quedan fixtures.
23. No hay hallazgos críticos o altos abiertos dentro del alcance.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Verificación F2D-01 a F2D-08.
5. Grace.
6. Tenant/Subscription.
7. Preapproval.
8. Terminales.
9. APPROVED económico.
10. Normalización runtime.
11. Reactivación.
12. Auditoría de reactivación.
13. Metadata unknown.
14. Rama no-APPROVED.
15. Coberturas.
16. Pruebas puras.
17. Pruebas de integración.
18. Compatibilidad con Fase 1.
19. Resultados.
20. Limpieza.
21. Hallazgos.
22. Riesgos aceptados.
23. Lista exacta para commit.
24. Comandos `git add`.
25. Mensaje de commit.
26. Recomendación.
27. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/03-precedencia-cron/12-respuesta-codex-revision-final-precedencia-cobertura.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/03-precedencia-cron/11-prompt-codex-revision-final-precedencia-cobertura.md`

3. No modifiques código.

4. No hagas commit.

5. No continúes con el cron.

6. Detente después del informe.
