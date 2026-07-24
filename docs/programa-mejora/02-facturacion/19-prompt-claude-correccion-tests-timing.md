# FASE 1J — CORRECCIÓN DE ASERCIONES TEMPORALES Y CIERRE DE INTEGRACIÓN

## Documentación automática

Antes de trabajar:

1. Crea:

`docs/programa-mejora/02-facturacion/19-prompt-claude-correccion-tests-timing.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/02-facturacion/20-respuesta-claude-correccion-tests-timing.md`

4. Guarda allí el informe final completo.

No modifiques documentos anteriores.

---

Actúa como ingeniero de pruebas especializado en Node.js, Prisma, PostgreSQL, pruebas temporales deterministas e integración de facturación.

Debes corregir exclusivamente las cuatro aserciones temporales fallidas de la suite de facturación y reejecutar la validación completa.

## Documentos obligatorios

Lee:

* `docs/programa-mejora/02-facturacion/18-respuesta-configuracion-supabase-pruebas-integracion.md`
* `tests/billing-webhook-idempotency.test.ts`
* `docs/TESTING.md`

Si el nombre exacto del documento 18 difiere, localízalo dentro de:

`docs/programa-mejora/02-facturacion/`

La fuente de verdad es el código y la salida real de las pruebas.

## Objetivo único

Corregir las aserciones de timing de los escenarios:

1. APPROVED nuevo extiende una vez.
2. PENDING → APPROVED extiende una vez.
3. Concurrencia produce un solo efecto.
4. Reintento después de rollback.

Los fallos actuales comparan:

* `currentPeriodEnd`
* contra `start_del_test + 30 días`

pero el comportamiento real del servicio es:

* `periodStart = max(currentPeriodEnd anterior, now del procesamiento)`
* `periodEnd = periodStart + 30 días`

Por tanto, la aserción debe basarse en los datos persistidos después de procesar, no en un reloj capturado varios segundos antes.

## Restricciones

No debes:

* Modificar código de producción.
* Modificar schema.
* Modificar migraciones.
* Cambiar la lógica de `computeNextPeriod`.
* Añadir tolerancias amplias para ocultar errores.
* Eliminar aserciones.
* Añadir `skip`.
* Reducir cobertura.
* Cambiar expectativas económicas.
* Llamar a Mercado Pago real.
* Aplicar migraciones nuevamente.
* Ejecutar seeds.
* Borrar mockdata preexistente.
* Modificar `.env`.
* Mostrar credenciales.
* Hacer commit o push.

Solo puedes modificar:

* `tests/billing-webhook-idempotency.test.ts`
* Los dos documentos automáticos de esta fase.

Si detectas que otro archivo necesita cambiar, detente y documéntalo; no lo modifiques.

## Primera acción

1. Ejecuta `git status`.
2. Confirma que la implementación de facturación sigue sin commit.
3. Confirma que la migración ya está aplicada en el proyecto autorizado.
4. Guarda este prompt.
5. Lee las cuatro pruebas fallidas completas.
6. Confirma que el fallo corresponde realmente a timing y no a otra diferencia en estado, período, marcador o número de efectos.

# Corrección requerida

## Estrategia preferida

Para cada escenario, después de procesar el webhook:

1. Lee `Payment` y `Subscription` desde la base.
2. Verifica que:

   * `Payment.periodStart` no sea null.
   * `Payment.periodEnd` no sea null.
   * `Subscription.currentPeriodStart` no sea null.
   * `Subscription.currentPeriodEnd` no sea null.
3. Comprueba que:

   * `Payment.periodStart` sea igual a `Subscription.currentPeriodStart`.
   * `Payment.periodEnd` sea igual a `Subscription.currentPeriodEnd`.
   * `periodEnd - periodStart` sea exactamente la duración esperada de 30 días según la misma semántica UTC utilizada por el servicio.
4. Verifica además que el período no retrocede respecto al período anterior.
5. Conserva las aserciones existentes de:

   * marcador aplicado;
   * único efecto;
   * estado de Payment;
   * estado de Subscription;
   * estado de Tenant;
   * AuditLog;
   * WebhookEvent;
   * ausencia de duplicados.

No uses como expectativa principal:

```typescript
inicioCapturadoAntesDelWebhook + 30 días
```

## Comparación de fechas

Usa una función de prueba explícita, por ejemplo:

```typescript
function assertThirtyDayPeriod(
  periodStart: Date,
  periodEnd: Date,
): void {
  assert.equal(
    periodEnd.getTime() - periodStart.getTime(),
    30 * 24 * 60 * 60 * 1000,
  );
}
```

Antes de usar esta comparación exacta, verifica que el código productivo usa suma fija de días en milisegundos y no una operación de calendario dependiente de DST.

Si el helper productivo usa `setDate`, calendario local u otra semántica, adapta la aserción para reflejar exactamente ese comportamiento sin importar ni ejecutar Prisma.

No uses una tolerancia arbitraria de varios segundos si puedes comparar directamente `periodStart` y `periodEnd`.

## Escenario 1

Debe demostrar:

* El pago nuevo obtiene marcador.
* Se crea exactamente un período.
* El período dura 30 días.
* Payment y Subscription tienen el mismo período.
* Tenant queda ACTIVE.
* Ledger queda PROCESSED.
* Existe una única auditoría económica.

## Escenario 3

Debe demostrar:

* PENDING no aplica el marcador ni extiende.
* APPROVED posterior aplica el marcador.
* Se crea exactamente un período.
* El segundo APPROVED no vuelve a extender.
* Payment y Subscription coinciden.

## Escenario 4

Debe demostrar:

* Dos solicitudes concurrentes producen una sola aplicación.
* Solo existe un Payment.
* Solo existe un marcador aplicado.
* Solo existe un período nuevo.
* Una entrega queda PROCESSED y la otra DUPLICATE, o el resultado equivalente documentado.
* El período dura exactamente 30 días desde el `periodStart` persistido.

## Escenario 8

Debe demostrar:

* El primer intento falla y hace rollback.
* El marcador queda null después del fallo.
* El período no cambia después del fallo.
* El ledger fallido queda correctamente registrado.
* El reintento aplica una sola vez.
* Payment y Subscription quedan con el mismo período.
* El período dura 30 días.
* Un replay posterior no vuelve a extender.

# Revisión adicional de las pruebas

Sin ampliar el alcance, revisa si otros tests usan la misma suposición:

```typescript
start_del_test + 30 días
```

Si existe exactamente el mismo defecto dentro del mismo archivo, corrígelo de la misma manera.

No refactorices toda la suite.

# Ejecución segura

La base utilizada en esta sesión es el proyecto Supabase actual, autorizado explícitamente como mockdata desechable.

Esta autorización es excepcional y se limita a:

* ejecutar la suite existente;
* crear fixtures de prueba;
* limpiar exclusivamente esos fixtures;
* no tocar el mockdata preexistente.

Antes de ejecutar:

1. Confirma que `.env.test` existe y está ignorado.
2. Confirma que el proyecto sigue sin pagos reales `MERCADO_PAGO`.
3. Confirma que no existen fixtures residuales de la ejecución anterior.
4. Confirma que el runner seguro aborta si falta la habilitación explícita.
5. No muestres URLs, hosts completos, contraseñas ni project refs completos.

Usa exactamente el procedimiento autorizado y documentado en la Fase 1I.

No modifiques el guard para facilitar la ejecución.

# Comandos

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
npm test
```

No vuelvas a ejecutar la migración salvo que el runner oficial lo haga de forma idempotente como parte de su procedimiento documentado. No uses `db push`.

# Análisis de resultados

Si `npm test` falla:

1. No reintentes automáticamente.
2. Clasifica cada fallo como:

   * aserción;
   * lógica;
   * migración;
   * base;
   * concurrencia;
   * limpieza;
   * configuración.
3. No reduzcas la prueba para hacerla pasar.
4. No cambies producción sin autorización.
5. Documenta el fallo exacto de forma segura.

Si pasa:

* Confirma total de pruebas.
* Confirma cero fallos.
* Confirma cero `skip`.
* Confirma los 17 escenarios.
* Confirma limpieza de fixtures.
* Confirma que el mockdata anterior conserva los mismos conteos básicos.
* Confirma que no hubo llamadas a Mercado Pago real.

# Tratamiento de `.env.test`

No borres `.env.test` durante la ejecución, porque es necesaria para reproducir las pruebas.

Al finalizar:

* Confirma que está ignorada por Git.
* Añade una advertencia visible en el informe de que apunta al mismo proyecto autorizado y no debe reutilizarse como configuración normal.
* Recomienda eliminarla o reemplazarla por un proyecto dedicado después del cierre y antes de realizar pruebas destructivas futuras.
* No muestres su contenido.

# Criterios de aceptación

1. Solo se modifican las aserciones de pruebas.
2. No cambia producción.
3. Los cuatro escenarios dejan de depender del inicio del test.
4. Se compara el período persistido.
5. Payment y Subscription coinciden.
6. La duración del período se valida correctamente.
7. No se eliminan aserciones económicas.
8. No se añaden tolerancias que oculten errores.
9. No existen `skip`.
10. Typecheck pasa.
11. Lint pasa.
12. Pruebas puras pasan.
13. `npm test` pasa completo.
14. Los 17 escenarios de facturación pasan.
15. Rollback y concurrencia siguen demostrados.
16. No quedan fixtures residuales.
17. No se modifica mockdata preexistente.
18. No se llama a Mercado Pago real.
19. `.env.test` permanece ignorada.
20. No se hace commit.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git.
3. Confirmación de causa raíz.
4. Aserciones anteriores.
5. Aserciones nuevas.
6. Justificación temporal.
7. Archivos modificados.
8. Resultado de typecheck.
9. Resultado de lint.
10. Resultado de pruebas puras.
11. Resultado de `npm test`.
12. Resultado individual de los 17 escenarios.
13. Rollback.
14. Concurrencia.
15. Idempotencia.
16. Limpieza de fixtures.
17. Estado del mockdata.
18. Confirmación de ausencia de llamadas reales.
19. Estado de `.env.test`.
20. Riesgos restantes.
21. Recomendación sobre commit.
22. Estado:

* CORREGIDO.
* CORREGIDO CON RIESGOS.
* REQUIERE CORRECCIONES.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/02-facturacion/20-respuesta-claude-correccion-tests-timing.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/02-facturacion/19-prompt-claude-correccion-tests-timing.md`

3. No hagas commit.

4. No continúes con precedencia, cron, cancelación o métricas.

5. Detente después del informe.
