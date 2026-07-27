# FASE 2D — REVISIÓN INDEPENDIENTE DE PRECEDENCIA Y COBERTURA

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/03-precedencia-cron/07-prompt-codex-revision-precedencia-cobertura.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/03-precedencia-cron/08-respuesta-codex-revision-precedencia-cobertura.md`

4. Guarda allí el informe final completo.

Solo puedes crear o modificar esos dos documentos.

No modifiques código, pruebas, schema, migraciones, configuración ni variables de entorno.

---

Actúa como revisor técnico independiente especializado en máquinas de estados, facturación recurrente, Mercado Pago, Prisma, PostgreSQL y pruebas de integración.

Claude implementó la Subfase 1 de precedencia y cobertura. Debes revisar adversarialmente el diff y determinar si realmente corrige F2-01, F2-03, F2-04 y F2-08 sin romper la idempotencia y atomicidad aprobadas en la Fase 1.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/03-precedencia-cron/04-respuesta-codex-verificacion-precedencia-cron.md`
* `docs/programa-mejora/03-precedencia-cron/05-prompt-claude-implementacion-precedencia-cobertura.md`
* `docs/programa-mejora/03-precedencia-cron/06-respuesta-claude-implementacion-precedencia-cobertura.md`
* `docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`
* `docs/TESTING.md`

La fuente de verdad es el diff y el código actual.

## Restricciones

Esta es una sesión de revisión.

No debes:

* Modificar implementación.
* Modificar pruebas.
* Modificar schema.
* Crear o aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Llamar a Mercado Pago.
* Levantar el servidor.
* Ejecutar build.
* Modificar `.env` o `.env.test`.
* Mostrar credenciales.
* Hacer commit o push.
* Continuar con el cron.

Puedes:

* Ejecutar `git status`.
* Ejecutar `git diff`.
* Ejecutar `git diff --check`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Ejecutar pruebas puras.
* Ejecutar `npm test` mediante el procedimiento seguro ya autorizado para el Supabase de mockdata.
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

   * HEAD sigue siendo `5e4be50`.
   * No existe un commit nuevo.
   * No cambió `prisma/schema.prisma`.
   * No existe una migración nueva.
   * No cambió `package-lock.json`.
   * Los únicos cambios de implementación pertenecen a precedencia, cobertura y pruebas.
4. Inspecciona completamente:

   * `src/domains/billing/precedence.ts`
   * `src/domains/billing/mercado-pago.service.ts`
   * `src/domains/platform/tenant-admin.service.ts`
   * `tests/unit/billing-precedence.test.ts`
   * `tests/billing-webhook-idempotency.test.ts`
   * Cualquier helper o caller modificado.

# 1. Alcance del diff

Clasifica todos los archivos modificados o nuevos:

* Precedencia.
* Cobertura.
* Webhook Payment.
* Webhook preapproval.
* Reactivación manual.
* Pruebas.
* Documentación.
* Fuera de alcance.

Confirma que no se modificó:

* Cron.
* Notification.
* Email.
* Cancelación definitiva.
* Métricas.
* UI.
* Autenticación.
* Storage.
* Reservas.
* PQRS.
* Guard de pruebas.

# 2. Normalización de estados Payment

Revisa `normalizeProviderPaymentStatus`.

Confirma exactamente qué valores reconoce:

* `approved`.
* `authorized`.
* `rejected`.
* `cancelled`.
* `canceled`.
* `pending`.
* `in_process`.
* `in_mediation`.

Determina:

* Si normaliza espacios y mayúsculas.
* Qué ocurre con `null`, `undefined` o cadena vacía.
* Qué ocurre con un tipo inesperado.
* Si cualquier estado no reconocido queda realmente como desconocido.
* Si un estado desconocido puede entrar accidentalmente por otra función antigua.

Busca referencias restantes a:

* `mapPaymentStatus`.
* Cualquier default que transforme unknown en `PENDING`.
* Cualquier comparación directa de `rawStatus`.

# 3. Matriz de precedencia

Reconstruye desde el código la matriz completa:

| Persistido | Entrante |
| ---------- | -------- |
| PENDING    | PENDING  |
| PENDING    | REJECTED |
| PENDING    | APPROVED |
| REJECTED   | PENDING  |
| REJECTED   | REJECTED |
| REJECTED   | APPROVED |
| APPROVED   | PENDING  |
| APPROVED   | REJECTED |
| APPROVED   | APPROVED |

Para cada combinación verifica:

* Estado persistido final.
* Si cambia `paidAt`.
* Si cambia `rawStatus`.
* Si puede modificar períodos.
* Acción sobre Subscription.
* Acción sobre Tenant.
* Resultado del ledger.
* Auditoría.

Evalúa críticamente la decisión de tratar:

```text
PENDING < REJECTED < APPROVED
```

Determina si preservar `REJECTED` ante un nuevo `PENDING` es:

* Correcto y seguro.
* Seguro pero conservador.
* Una política comercial no demostrada.
* Un defecto.

No dependas de suposiciones externas sobre Mercado Pago. Evalúa si el diseño sigue siendo fail-safe cuando no conocemos el orden comercial exacto.

# 4. Protección de APPROVED

Confirma que un Payment aprobado, especialmente con `approvedEffectAppliedAt != null`:

* No cambia a PENDING.
* No cambia a REJECTED.
* No pierde `paidAt`.
* No pierde `periodStart`.
* No pierde `periodEnd`.
* No pierde el marcador.
* No cambia la cuarentena.
* No degrada Subscription.
* No degrada Tenant.

Verifica tanto:

* Mismo Payment.
* Otro Payment antiguo de la misma Subscription.
* Evento desconocido sobre Payment existente.

Busca cualquier `upsert.update` que siga escribiendo incondicionalmente campos económicos.

# 5. Estado desconocido

Revisa los dos casos:

## Payment desconocido nuevo

Confirma:

* No crea Payment.
* No modifica Subscription.
* No modifica Tenant.
* Sí crea o actualiza correctamente WebhookEvent.
* Resultado `IGNORED`.
* Metadata con `UNKNOWN_PROVIDER_STATUS`.
* No causa error 500 ni reintentos infinitos.
* La consulta externa solo ocurre una vez.

## Payment desconocido existente

Confirma:

* Preserva status.
* Preserva `paidAt`.
* Preserva períodos y marcador.
* Solo actualiza metadata permitida.
* No degrada acceso.

## Preapproval desconocido

Confirma:

* No modifica Subscription.
* No modifica Tenant.
* Puede actualizar metadata técnica del preapproval solo si es seguro.
* Ledger `IGNORED`.
* Auditoría correcta.

Busca rutas donde un unknown siga cayendo a `GRACE_PERIOD`.

# 6. Cobertura de acceso

Revisa `hasCurrentAccessCoverage`.

Confirma comportamiento exacto para:

* TRIAL vigente.
* TRIAL vencido.
* ACTIVE vigente.
* ACTIVE vencido.
* GRACE vigente.
* GRACE vencida.
* GRACE con `graceEndsAt = null`.
* PENDING_PAYMENT.
* SUSPENDED.
* CANCELLED.

Evalúa:

* Uso de `>` o `>=`.
* Comportamiento en el instante exacto de vencimiento.
* Fechas inválidas o null.
* Si la función depende únicamente de Subscription.
* Si considerar GRACE como cobertura evita renovar correctamente `graceEndsAt`.
* Si esta función se está usando en callers donde debería usarse evidencia de Payment.

La política de `graceEndsAt = null` sigue fuera del cron, pero la función no debe tratarla como cobertura válida.

# 7. Cobertura de pago real

Revisa `hasCurrentRealPaymentCoverage`.

Confirma filtros exactos:

* Mismo tenant.
* Misma subscription.
* `provider = MERCADO_PAGO`.
* `status = APPROVED`.
* Marcador no null.
* No cuarentena.
* `periodEnd > now`.

Verifica:

* Uso de comparación de enums o strings.
* Qué ocurre con `periodEnd = now`.
* Que no cuente SIMULATED.
* Que no cuente Payment histórico reconciliado sin período vigente.
* Que no cuente Payment de otra suscripción.
* Que no cuente Payment sin marcador.
* Que los callers carguen todos los campos requeridos.

Busca cualquier caller que pase filas incompletas, use casts inseguros o filtre previamente de manera incorrecta.

# 8. Evidencia administrativa aplicada

Revisa `hasCurrentAppliedAccessEvidence`.

Confirma:

* Mercado Pago válido cuenta.
* SIMULATED vigente cuenta como evidencia de acceso.
* Cortesía de importe cero puede contar.
* SIMULATED vencido no cuenta.
* Payment pendiente o rechazado no cuenta.
* Payment en cuarentena no cuenta cuando es Mercado Pago.
* No se usa esta función para MRR o ingresos.

Determina si existe una forma fiable en el modelo actual de distinguir:

* Renovación simulada.
* Cortesía.
* Otro Payment SIMULATED.

Si no existe una distinción explícita, documenta el matiz: la función reconoce cualquier SIMULATED aprobado y vigente, no necesariamente solo cortesía o renovación autorizada.

Clasifica si eso bloquea esta fase.

# 9. Reactivación manual

Revisa `updateTenantStatusForSuperAdmin`.

Confirma:

* Busca Payments del tenant y subscription correctos.
* Usa evidencia vigente, no cualquier APPROVED.
* No permite un Payment vencido.
* No permite cuarentena.
* Permite SIMULATED vigente según la política implementada.
* Mantiene la transacción Tenant/Subscription.
* La auditoría sigue siendo correcta.
* No se introdujo una consulta excesivamente amplia.

Revisa si la validación se hace dentro o fuera de la transacción y si existe una ventana de carrera relevante.

Clasifica esa carrera:

* Bloqueante ahora.
* Riesgo posterior.
* Irrelevante para esta fase.

# 10. `applyTenantStatusInTx`

Este punto requiere revisión especial.

Claude afirma que para `ACTIVE/TRIAL` ahora exige `hasCurrentRealPaymentCoverage`.

Determina exactamente:

* Qué callers usan esta función.
* Con qué estados la llaman.
* Si se usa solo desde webhooks de Mercado Pago.
* Si puede ejecutarse para:

  * Trial.
  * Cortesía.
  * SIMULATED.
  * Preapproval.
  * Payment aprobado.
* Qué Tenant status produce cuando no existe pago real.

Verifica que el cambio no rompa:

* Trial legítimo.
* Cortesía.
* Renovación simulada.
* Activación de un tenant durante onboarding.
* Preapproval autorizado sin pago.
* Payment aprobado recién procesado dentro de la misma transacción.

Si la función solo pertenece al flujo Mercado Pago, confirma esa limitación y que el nombre/contrato no induzca a reutilizarla incorrectamente.

# 11. Rama no-APPROVED

Reconstruye el flujo exacto para:

1. PENDING inicial sin cobertura.
2. PENDING inicial con trial vigente.
3. REJECTED inicial sin cobertura.
4. REJECTED con ACTIVE vigente.
5. REJECTED de Payment antiguo con otro Payment vigente.
6. PENDING sobre Payment APPROVED.
7. REJECTED sobre Payment APPROVED.
8. REJECTED con Subscription SUSPENDED.
9. REJECTED con Subscription CANCELLED.
10. REJECTED con GRACE vigente.
11. REJECTED con GRACE vencida.

Para cada uno verifica:

* Payment final.
* Subscription final.
* Tenant final.
* `graceEndsAt`.
* Ledger.
* Auditoría.
* Metadata de decisión.

Confirma que solo entra a Grace cuando se cumplen conjuntamente todas las condiciones previstas.

# 12. Riesgo de períodos antiguos

Para un Payment antiguo diferente, verifica cómo se cargan los otros Payments de evidencia.

Confirma que:

* Se filtra por misma Subscription.
* Se excluye el Payment entrante cuando corresponda.
* Un Payment nuevo aprobado y vigente evita degradación.
* Una cortesía vigente evita degradación.
* Un Payment antiguo vencido no evita degradación.
* Un Payment de otro tenant no evita degradación.

Determina si el sistema necesita conocer que el evento pertenece al período actual o si la comprobación de cobertura vigente es suficiente para esta fase.

# 13. APPROVED entrante

Verifica que las modificaciones no hayan alterado:

* Claim atómico.
* Cuarentena histórica.
* PENDING → APPROVED.
* REJECTED → APPROVED.
* Replay APPROVED.
* Concurrencia.
* Rollback.
* Aplicación de términos pendientes.
* Períodos.
* Tenant.
* Auditoría.
* Ledger.

Revisa especialmente si el nuevo código calcula o consulta cobertura dentro de la transacción de una forma que pueda afectar el claim.

# 14. Preapproval

Reconstruye:

* `authorized` con pago real vigente.
* `authorized` sin pago.
* `authorized` con SIMULATED vigente.
* `paused` con ACTIVE vigente.
* `paused` sin cobertura.
* `pending` con trial vigente.
* `pending` con ACTIVE vigente.
* `pending` sin cobertura.
* `cancelled`.
* Estado desconocido.

Punto crítico:

Claude afirma que `paused` “preserva el acceso siempre”.

Determina si el código:

* Preserva únicamente cuando hay cobertura.
* Preserva incluso una suscripción vencida.
* Mantiene indefinidamente ACTIVE una fila sin período vigente.
* Mantiene un estado anterior incorrecto.
* Debería usar `hasCurrentAccessCoverage`.

Si `paused` preserva sin importar cobertura, clasifica el riesgo y determina la corrección mínima.

No rediseñes la política de cancelación en esta revisión.

# 15. Auditoría y ledger

Confirma para eventos ignorados:

* Resultado `IGNORED`.
* `ignoredReason`.
* Provider status.
* Estado anterior.
* Estado entrante.
* Estado persistido.
* Subscription anterior y persistida.
* Indicadores de cobertura.

Verifica:

* Metadata sanitizada.
* Sin payload completo.
* Sin firma.
* Sin tokens.
* Sin datos de tarjeta.
* Sin objetos anidados descartados accidentalmente.
* Que los campos booleanos se conserven.
* Que la auditoría se cree dentro de la transacción cuando corresponde.
* Que un fallo de auditoría produzca el rollback esperado.

# 16. Calidad del módulo puro

Revisa `precedence.ts` por:

* Dependencias.
* Tipos.
* Mutaciones.
* Uso de Date.
* Comparaciones temporales.
* Duplicación de lógica.
* Nombres.
* Funciones demasiado acopladas a Prisma.
* Casts.
* Valores mágicos.
* Exhaustividad.

Determina si realmente puede probarse sin Prisma y reutilizarse sin comportamiento oculto.

# 17. Pruebas puras

Lee completamente `tests/unit/billing-precedence.test.ts`.

Confirma:

* Número real de casos.
* Que las 35 categorías obligatorias están cubiertas.
* Que los tests no duplican la implementación en sus expectativas.
* Que existen casos límite temporales.
* Que cubren `REJECTED → PENDING`.
* Que cubren unknown vacío/null si el tipo lo permite.
* Que cubren filtros tenant/subscription.
* Que distinguen real payment de evidencia administrativa.

Identifica pruebas ausentes o engañosas.

# 18. Pruebas de integración

Lee completamente los escenarios nuevos y modificados.

Confirma para cada escenario #18–#28:

* Preparación.
* Evento.
* Aserciones.
* Limpieza.
* Que prueba el servicio real.
* Que verifica Payment.
* Que verifica Subscription.
* Que verifica Tenant.
* Que verifica ledger.
* Que verifica AuditLog.
* Que verifica períodos y marcador cuando corresponda.

Compara la lista real con los 14 grupos solicitados en el prompt.

Claude reporta 11 escenarios nuevos, aunque el prompt solicitó más comportamientos. Determina:

* Cuáles se agruparon.
* Cuáles faltan.
* Si el escenario de cortesía vigente existe realmente.
* Si la reactivación prueba pago real, vencido, cuarentena y SIMULATED.
* Si se prueba `pending` de preapproval con cobertura.
* Si se prueba `paused` sin cobertura.
* Si se prueba coherencia Tenant/Subscription en todos los casos.

No aceptes únicamente que la suite completa esté verde.

# 19. Compatibilidad con Fase 1

Confirma que continúan pasando y siguen siendo válidas las garantías de:

* Idempotencia.
* Concurrencia.
* Rollback.
* Replay.
* Cuarentena.
* Reconciliación.
* Missing dataId.
* Ledger.
* Preapproval atómico.

Busca si se modificó una prueba antigua para hacerla pasar reduciendo una garantía.

Revisa especialmente el cambio del escenario #11.

Determina si el test anterior codificaba un bug o si se eliminó una expectativa todavía necesaria.

# 20. Ejecución final

Antes de ejecutar:

* Confirma que `.env.test` está ignorado.
* Confirma que el proyecto está autorizado como mockdata.
* Confirma que no hay pagos reales de Mercado Pago.
* Confirma que no hay fixtures residuales.
* No muestres información personal.

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
npm test
```

Usa el procedimiento seguro documentado.

No apliques migraciones.

No reintentes automáticamente si falla.

# 21. Limpieza

Después de la suite confirma:

* Cero fixtures residuales.
* Cero WebhookEvent de pruebas.
* Conteos básicos del mockdata iguales.
* Sin llamadas reales a Mercado Pago.
* `.env` intacto.
* `.env.test` ignorado.

# Hallazgos

Para cada hallazgo incluye:

* ID.
* Severidad.
* Archivo y símbolo.
* Comportamiento actual.
* Escenario.
* Impacto.
* Evidencia.
* Corrección mínima.
* Prueba requerida.
* ¿Bloquea el commit?: Sí/No.
* ¿Bloquea la Subfase 2 del cron?: Sí/No.
* ¿Bloquea producción?: Sí/No.

# Criterios para aprobar

La implementación solo puede aprobarse si:

1. APPROVED no retrocede.
2. `paidAt` no se borra.
3. PENDING → APPROVED funciona.
4. REJECTED → APPROVED funciona.
5. Unknown no degrada.
6. Payment antiguo no degrada una cobertura vigente.
7. Trial vigente se preserva.
8. Cortesía vigente se preserva.
9. Cobertura de acceso, pago real y evidencia están separadas correctamente.
10. Reactivación usa evidencia apropiada.
11. Preapproval no confunde autorización con pago.
12. `paused` no deja estados vencidos indefinidamente.
13. Ledger y auditoría explican la decisión.
14. No cambió schema.
15. No existe migración.
16. Fase 1 permanece intacta.
17. Typecheck pasa.
18. Lint pasa.
19. Pruebas puras pasan.
20. Suite completa pasa.
21. No hay `skip`.
22. No quedan fixtures.
23. No hay hallazgos críticos o altos abiertos dentro del alcance.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Normalización.
5. Matriz de precedencia.
6. Protección de APPROVED.
7. Estados desconocidos.
8. Cobertura de acceso.
9. Cobertura de pago real.
10. Evidencia administrativa.
11. Reactivación manual.
12. `applyTenantStatusInTx`.
13. Rama no-APPROVED.
14. Payments antiguos.
15. APPROVED entrante.
16. Preapproval.
17. Auditoría y ledger.
18. Calidad del módulo puro.
19. Pruebas puras.
20. Pruebas de integración.
21. Compatibilidad con Fase 1.
22. Resultados de ejecución.
23. Limpieza.
24. Hallazgos.
25. Correcciones obligatorias.
26. Riesgos aceptados.
27. Recomendación sobre commit.
28. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/03-precedencia-cron/08-respuesta-codex-revision-precedencia-cobertura.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/03-precedencia-cron/07-prompt-codex-revision-precedencia-cobertura.md`

3. No modifiques código.

4. No hagas commit.

5. No continúes con el cron.

6. Detente después del informe.
