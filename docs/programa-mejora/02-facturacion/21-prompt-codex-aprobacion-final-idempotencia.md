# FASE 1K — REVISIÓN FINAL Y APROBACIÓN DE IDEMPOTENCIA Y ATOMICIDAD

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/02-facturacion/21-prompt-codex-aprobacion-final-idempotencia.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`

4. Guarda allí tu informe final completo.

Solo puedes crear o modificar esos dos documentos.

No modifiques código, pruebas, schema, migraciones, configuración ni variables de entorno.

---

Actúa como revisor técnico final especializado en Prisma, PostgreSQL, Mercado Pago, idempotencia, atomicidad, migraciones y pruebas concurrentes.

Debes determinar si la subfase de idempotencia y atomicidad de facturación puede aprobarse y convertirse en un commit.

## Contexto operativo aceptado

El proyecto Supabase actual contiene únicamente mockdata desechable y fue autorizado expresamente por su propietario para ejecutar estas pruebas.

Esto no debe tratarse como bloqueante de esta subfase.

Antes de iniciar producción se crearán y mantendrán dos entornos separados:

* Producción.
* Desarrollo/pruebas.

La revisión debe registrar esta obligación futura, pero no rechazar la implementación actual únicamente porque las pruebas se ejecutaron en el proyecto de mockdata autorizado.

## Documentos obligatorios

Lee:

* `docs/programa-mejora/02-facturacion/04-respuesta-codex-verificacion-facturacion.md`
* `docs/programa-mejora/02-facturacion/08-respuesta-codex-revision-idempotencia-atomicidad.md`
* `docs/programa-mejora/02-facturacion/10-respuesta-claude-correcciones-historicas-rollback.md`
* Los documentos posteriores de corrección y revisión de esta misma carpeta.
* `docs/programa-mejora/02-facturacion/20-respuesta-claude-correccion-tests-timing.md`
* `docs/TESTING.md`

Si algún nombre exacto difiere, localízalo por su número dentro de:

`docs/programa-mejora/02-facturacion/`

La fuente de verdad es el código, la migración, las pruebas y el diff actual.

## Restricciones

Esta es una revisión de solo lectura.

No debes:

* Modificar código.
* Modificar pruebas.
* Modificar schema.
* Modificar migraciones.
* Modificar `.env`.
* Modificar `.env.test`.
* Mostrar secretos.
* Aplicar migraciones.
* Ejecutar `db push`.
* Ejecutar seeds.
* Llamar a Mercado Pago.
* Hacer commit.
* Hacer push.
* Instalar dependencias.
* Levantar el servidor.

Puedes:

* Ejecutar `git status`.
* Ejecutar `git diff`.
* Ejecutar `git diff --check`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Ejecutar pruebas puras.
* Ejecutar `npm test` utilizando exactamente el procedimiento seguro y autorizado documentado en la Fase 1I/1J.
* Consultar únicamente conteos seguros necesarios para comprobar limpieza, sin mostrar información personal.

No vuelvas a aplicar la migración.

## Primera acción

1. Guarda este prompt.
2. Ejecuta `git status`.
3. Identifica el commit actual.
4. Inspecciona el diff completo.
5. Confirma que `.env.test` está ignorado.
6. Confirma que no hay secretos o credenciales rastreados.
7. Confirma que `package-lock.json` no cambió accidentalmente.
8. Confirma que no hay archivos generados de Prisma rastreados.
9. Confirma que solo existen cambios relacionados con la subfase y su documentación.

# 1. Revisión del alcance

Clasifica todos los archivos modificados o nuevos como:

* Necesario para idempotencia.
* Necesario para atomicidad.
* Necesario para ledger.
* Necesario para cuarentena histórica.
* Necesario para pruebas.
* Documentación.
* Fuera de alcance.

No debe existir ningún cambio no justificado en:

* Cron.
* Métricas.
* Cancelación.
* Precedencia definitiva.
* UI.
* Autenticación.
* Storage.
* Legal.
* Soporte.
* Landing.
* Reservas.
* PQRS.

# 2. Idempotencia del efecto económico

Confirma en el código final:

* `Payment` sigue siendo único por ID externo de Mercado Pago.
* `approvedEffectAppliedAt` es la garantía persistente.
* El reclamo exige:

  * estado `APPROVED`;
  * marcador `NULL`;
  * `approvedEffectReconciliationRequired = false`.
* Un pago nuevo APPROVED aplica una vez.
* Un replay no vuelve a extender.
* `PENDING → APPROVED` funciona.
* Dos solicitudes concurrentes producen un efecto.
* Un rollback devuelve el marcador a `NULL`.
* El reintento posterior puede aplicar una vez.
* El ledger no es la única garantía económica.

Busca cualquier ruta alternativa que pueda extender el período sin pasar por la garantía.

# 3. Pagos históricos

Confirma:

* La migración marca en cuarentena los pagos históricos:

  * `provider = MERCADO_PAGO`;
  * `status = APPROVED`.
* La migración no modifica períodos.
* La migración no marca ciegamente el efecto como aplicado.
* Un replay histórico no extiende.
* El resultado del ledger es `RECONCILIATION_REQUIRED`.
* La reconciliación manual:

  * opera sobre un pago por ejecución;
  * exige motivo;
  * no modifica períodos;
  * deja auditoría;
  * no llama a Mercado Pago;
  * no ejecuta automáticamente extensiones.

Confirma también que, en la base de mockdata autorizada, la cuarentena afectó cero filas porque no existían pagos reales de Mercado Pago.

# 4. Atomicidad

Comprueba que una misma transacción incluya:

* `Payment`.
* Reclamo del marcador.
* `Subscription`.
* `Tenant`.
* `AuditLog`.
* Resultado final del `WebhookEvent`.

Confirma que ninguna función interna escape al singleton global de Prisma.

Revisa:

* `registerAuditLog`.
* Sincronización de Tenant.
* Actualización del ledger.
* Aplicación de términos pendientes.
* Actualización de `Payment.periodStart/periodEnd`.

Confirma mediante pruebas que existe rollback después de:

* Reclamo del efecto.
* Actualización de Subscription.
* Antes de AuditLog.

Confirma que el reintento posterior funciona exactamente una vez.

# 5. Fuente única del período

Confirma:

* Existe una única constante de duración mensual.
* Webhook y renovación simulada usan la función compartida.
* `periodStart` y `periodEnd` persistidos coinciden entre Payment y Subscription.
* Las pruebas usan la semántica real de `addDays`.
* No dependen del reloj capturado antes del webhook.
* No usan tolerancias amplias.
* No queda una segunda implementación económica equivalente.

# 6. Ledger

Confirma:

* Cada entrega válida puede generar su registro.
* Estados:

  * `RECEIVED`.
  * `PROCESSED`.
  * `DUPLICATE`.
  * `FAILED`.
  * `ENTITY_NOT_FOUND`.
  * `UNSUPPORTED_TOPIC`.
  * `RECONCILIATION_REQUIRED`.
* Solicitudes sin `dataId` no crean ledger.
* Solicitudes sin `dataId` no llaman al proveedor.
* Metadata y errores están sanitizados.
* No se almacenan tokens, firmas completas, datos de tarjeta o payloads sensibles.
* La falta de política de retención queda registrada como mejora futura, no como bloqueante actual.

# 7. Migración

Inspecciona estáticamente la migración final:

* Orden SQL.
* Columnas.
* Defaults.
* Nullability.
* Enum.
* Tabla `WebhookEvent`.
* Índices.
* Cuarentena histórica.
* Compatibilidad con PostgreSQL.
* Carácter aditivo.
* Ausencia de operaciones destructivas.

Confirma que la migración fue aplicada correctamente una vez al proyecto autorizado y que no debe volver a ejecutarse manualmente.

# 8. Pruebas

Lee completamente la suite de facturación.

Confirma que existen 17 escenarios ejecutables y sin `skip`.

Verifica que cubran:

1. APPROVED nuevo.
2. Replay.
3. PENDING → APPROVED.
4. Concurrencia.
5. Rollback después del reclamo.
6. Rollback después de Subscription.
7. Rollback antes de AuditLog.
8. Reintento.
9. Ledger procesado.
10. Ledger duplicado.
11. Preapproval atómico.
12. Términos pendientes.
13. Histórico en cuarentena.
14. Histórico reconciliado.
15. Pago nuevo fuera de cuarentena.
16. Falta de dataId.
17. Evidencia del CLI.

Confirma que los escenarios principales validan:

* Marcador.
* Estado de reconciliación.
* Payment.
* Subscription.
* Tenant.
* AuditLog.
* WebhookEvent.
* Períodos.
* Efecto único.
* Limpieza.

# 9. Ejecución final

Antes de ejecutar:

* Confirma que el proyecto sigue autorizado como mockdata.
* Confirma que no hay pagos reales `MERCADO_PAGO`.
* Confirma que no hay fixtures residuales.
* No muestres registros ni información personal.

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
npm test
```

Utiliza exactamente el procedimiento seguro documentado.

No reintentes automáticamente ante un fallo.

# 10. Limpieza

Después de las pruebas confirma:

* Cero fixtures residuales.
* Cero `WebhookEvent` de pruebas residuales.
* Los conteos básicos del mockdata coinciden antes y después.
* No se borraron datos preexistentes.
* No se llamó a Mercado Pago.
* `.env` sigue intacto.
* `.env.test` sigue ignorado.

# 11. Obligación antes de producción

Registra como condición de lanzamiento, pero no como bloqueo del commit actual:

* Crear un proyecto Supabase exclusivo para producción.
* Mantener otro proyecto separado para desarrollo/pruebas.
* Reemplazar o recrear `.env.test` para que apunte al entorno dedicado.
* No ejecutar suites destructivas contra producción.
* Configurar Mercado Pago y su webhook en sandbox antes de producción.
* Validar posteriormente un flujo completo en sandbox.

# 12. Alcance del commit

Si la revisión se aprueba, entrega:

## Archivos que deben incluirse

Lista exacta de archivos de código, schema, migración, scripts y pruebas que pertenecen a la subfase.

## Documentación

Determina si deben incluirse todos los documentos de:

`docs/programa-mejora/02-facturacion/`

o únicamente los informes finales.

No incluyas:

* `.env`.
* `.env.test`.
* Credenciales.
* Archivos temporales.
* Logs.
* Resultados generados.
* Archivos borrados ajenos a esta fase.

## Comandos recomendados

Entrega comandos de `git add` con rutas explícitas.

No uses:

```text
git add .
```

No ejecutes los comandos.

Propón un mensaje de commit profesional y específico.

# Hallazgos

Para cada hallazgo nuevo incluye:

* ID.
* Severidad.
* Archivo/símbolo.
* Comportamiento.
* Impacto.
* Evidencia.
* Corrección.
* ¿Bloquea el commit?: Sí/No.
* ¿Bloquea producción?: Sí/No.

No reabras como defecto actual algo ya demostrado únicamente por una preferencia arquitectónica.

# Criterios de aprobación

La subfase se aprueba si:

1. El efecto APPROVED es idempotente.
2. La concurrencia produce un efecto.
3. El rollback es completo.
4. El reintento funciona.
5. Los pagos históricos quedan en cuarentena.
6. La reconciliación no modifica períodos.
7. Payment, Subscription y Tenant quedan coherentes.
8. Ledger y auditoría son suficientes.
9. La migración es aditiva.
10. Los 17 escenarios pasan.
11. La suite completa pasa.
12. Typecheck pasa.
13. Lint pasa.
14. No existen `skip`.
15. No quedan fixtures.
16. No se muestran ni rastrean secretos.
17. No hay cambios fuera de alcance.
18. No hay hallazgos críticos o altos abiertos dentro de esta subfase.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Idempotencia.
5. Pagos históricos.
6. Atomicidad.
7. Períodos.
8. Ledger.
9. Migración.
10. Pruebas.
11. Resultados de ejecución.
12. Limpieza.
13. Seguridad de variables.
14. Hallazgos.
15. Riesgos aceptados.
16. Condiciones antes de producción.
17. Lista exacta para commit.
18. Comandos `git add` recomendados.
19. Mensaje de commit.
20. Recomendación de commit.
21. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe completo en:

`docs/programa-mejora/02-facturacion/22-respuesta-codex-aprobacion-final-idempotencia.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/02-facturacion/21-prompt-codex-aprobacion-final-idempotencia.md`

3. No modifiques código.

4. No hagas commit.

5. No continúes con precedencia, cron, cancelación o métricas.

6. Detente después del informe.
