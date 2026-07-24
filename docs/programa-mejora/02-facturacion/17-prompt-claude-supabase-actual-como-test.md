# FASE 1I — CONVERSIÓN TEMPORAL DEL SUPABASE ACTUAL EN ENTORNO DE PRUEBAS

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/02-facturacion/17-prompt-claude-supabase-actual-como-test.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al finalizar:

3. Crea:

`docs/programa-mejora/02-facturacion/18-respuesta-claude-supabase-actual-como-test.md`

4. Guarda allí el informe final completo.

No modifiques documentos anteriores.

---

Actúa como ingeniero principal responsable de convertir temporalmente el proyecto Supabase actual de PQRS Services en un entorno desechable de integración y validar la facturación.

## Autorización explícita del propietario

El propietario confirma expresamente que:

* El proyecto Supabase actual no contiene datos reales.
* No contiene información de producción.
* Todos sus usuarios, conjuntos, PQRS, pagos y demás registros son mockdata.
* Todo su contenido puede modificarse o eliminarse durante las pruebas.
* No importa perder los datos actuales.
* Durante esta fase, este proyecto deja de considerarse una base normal de desarrollo y se considera un entorno desechable de pruebas.
* Después de validar el sistema, el usuario volverá a agregar datos y usuarios.

Esta autorización no permite revelar secretos ni debilitar permanentemente las protecciones de pruebas.

## Preferencias

* No utilizar Docker.
* No crear otro proyecto Supabase.
* Utilizar temporalmente el Supabase actual.
* No utilizar Mercado Pago real.
* No hacer commit hasta completar la validación.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/02-facturacion/14-respuesta-claude-correcciones-finales-pruebas-cli.md`
* `docs/programa-mejora/02-facturacion/16-respuesta-codex-aprobacion-definitiva-integracion.md`
* `docs/TESTING.md`
* `.env.test.example`
* `package.json`
* `scripts/run-tests.ts`
* `scripts/run-test-prisma.ts`
* `src/lib/testing/test-database-safety.ts`
* Todas las pruebas de aislamiento de base.
* `tests/billing-webhook-idempotency.test.ts`

La fuente de verdad es el repositorio actual.

# Objetivos

1. Inspeccionar el Supabase actual.
2. Confirmar que contiene únicamente datos mock y que no tiene señales de producción.
3. Adoptarlo temporalmente como entorno de pruebas desechable.
4. Configurar `.env.test` de manera segura.
5. Mantener las protecciones por defecto para futuras ejecuciones.
6. Aplicar las migraciones pendientes exclusivamente en esta base autorizada.
7. Ejecutar los 17 escenarios de integración.
8. Diagnosticar cualquier fallo sin modificar código.
9. Mantener la base disponible para las siguientes fases.

# Regla de seguridad

La autorización para utilizar el proyecto actual es excepcional y temporal.

No debes:

* Eliminar las validaciones generales del guard.
* Permitir por defecto que cualquier base normal sea usada para tests.
* Cambiar el comportamiento seguro para otros proyectos.
* Ocultar que `TEST_DATABASE_URL` y la URL normal pertenecen al mismo proyecto.
* Mostrar credenciales.
* Copiar secretos en documentación.
* Llamar a Mercado Pago.
* Hacer commit.

Si el guard actual no permite esta operación mediante configuración explícita, no lo desactives silenciosamente.

Debes determinar si existe una forma segura de declarar esta base concreta como desechable mediante las opciones que ya soporta el guard.

# 1. Inspección inicial

Ejecuta:

```text
git status
git log -1 --oneline
git check-ignore .env.test
```

Confirma:

* Commit actual.
* Cambios sin commit.
* Migración pendiente.
* Existencia de `.env.test`.
* Que `.env.test` está ignorado.
* Qué variables relevantes existen, únicamente por nombre.
* Que no se modificó `package-lock.json`.

Guarda este prompt antes de continuar.

# 2. Inspección de la base actual

Puedes conectarte al Supabase actual.

Antes de realizar cualquier mutación, inspecciona en modo lectura:

* Cantidad de Tenant.
* Cantidad de User.
* Cantidad de Subscription.
* Cantidad de Payment.
* Cantidad de PQRS o modelos equivalentes.
* Cantidad de AuditLog.
* Cantidad de archivos o referencias de Storage, si pueden consultarse sin alterar nada.
* Migraciones aplicadas.
* Tablas existentes.
* Extensiones PostgreSQL relevantes.

Busca señales de que pudiera existir información real:

* Correos que no tengan aspecto de prueba.
* Nombres o documentos personales.
* Pagos de Mercado Pago con provider real.
* IDs reales de preapproval.
* Datos masivos o actividad reciente no explicada por fixtures.
* Archivos de usuarios.
* Tenants con nombres que parezcan clientes reales.

No muestres ningún dato personal encontrado.

Informa solo:

* Conteos.
* Si existen o no señales de producción.
* Tipos generales de registros.
* IDs parcialmente enmascarados cuando sea indispensable.

## Decisión

Si encuentras evidencia razonable de datos reales:

* No ejecutes mutaciones.
* Detente.
* Estado: `BLOQUEADO POR POSIBLES DATOS REALES`.

Si no encuentras evidencia de datos reales:

* Registra que la autorización del propietario coincide con la inspección.
* Continúa.

# 3. Inventario previo

Antes de modificar la base, crea un inventario agregado en el informe:

* Conteos por tabla principal.
* Migraciones existentes.
* Fecha aproximada del registro más reciente.
* Cantidad de pagos por provider y status.
* Cantidad de webhooks, si la tabla ya existe.
* Cantidad de usuarios.

No hagas un respaldo completo, porque el propietario confirmó que los datos son desechables.

No exportes datos personales.

# 4. Estrategia para el guard

Inspecciona exactamente el comportamiento de:

* `canonicalizeDatabaseUrl`
* `looksLikeTestDatabase`
* Comparación entre URLs normales y URLs de test.
* `TEST_DATABASE_ALLOW_ANY_NAME`
* Cualquier allowlist o confirmación explícita existente.
* Prioridad proceso/CI → `.env.test` → `.env`.
* Comportamiento de `TEST_DIRECT_URL`.

## Resultado preferido

Utiliza una configuración temporal explícita que:

* Autorice esta base concreta.
* Exija `ALLOW_TEST_DATABASE_MUTATION=true`.
* Permita que el nombre normal de la base sea usado únicamente durante esta sesión.
* No cambie los defaults seguros.
* No permita otras bases.
* No deje una excepción abierta después de la fase.

## No debilitar código

Primero intenta realizarlo sin modificar el guard, mediante las opciones explícitas que ya soporte.

Por ejemplo, únicamente si el código real lo permite:

```text
TEST_DATABASE_ALLOW_ANY_NAME=true
ALLOW_TEST_DATABASE_MUTATION=true
```

No asumas que estas variables son suficientes: compruébalo en el código.

## Conflicto con las URLs normales

Si el guard rechaza el destino porque `TEST_DATABASE_URL` coincide con `DATABASE_URL` o `DIRECT_URL`, adopta el siguiente procedimiento temporal:

1. Confirma que `.env` está ignorado por Git.
2. Confirma que existe y registra únicamente su hash o fecha, nunca su contenido.
3. Crea una copia local temporal e ignorada:

   * `.env.development-temporary-backup`
4. Confirma que la copia también está ignorada antes de crearla.
5. No muestres ni documentes sus valores.
6. Durante la ejecución de pruebas, evita que el loader cargue las URLs normales:

   * mediante aislamiento del proceso, o
   * renombrando temporalmente `.env`, solo si el loader realmente lo requiere.
7. `.env.test` será la única fuente de conexión durante las pruebas.
8. Al finalizar, restaura `.env` exactamente.
9. Verifica mediante hash que fue restaurado sin cambios.
10. Elimina de forma segura la copia temporal.

No dejes `.env` ausente al terminar.

No modifiques `.env` internamente.

## Si aun así el guard lo impide

No elimines la comparación permanentemente.

Detente y documenta el cambio mínimo necesario para permitir una excepción de un solo proyecto, con huella canónica explícita y caducidad. No realices ese cambio en esta fase.

Estado:

`BLOQUEADO POR GUARD DE AISLAMIENTO`

# 5. Creación de `.env.test`

Configura `.env.test` usando la base actual autorizada, pero con variables exclusivamente de pruebas.

Debe contener lo que realmente exija el repositorio, incluyendo:

```text
TEST_DATABASE_URL=<conexion pooler del Supabase autorizado>
TEST_DIRECT_URL=<conexion directa del Supabase autorizado>
ALLOW_TEST_DATABASE_MUTATION=true
NODE_ENV=test
```

Utiliza `TEST_DATABASE_ALLOW_ANY_NAME=true` únicamente si el guard lo soporta y es necesario debido al nombre normal `postgres`.

Añade valores sintéticos para:

* `MERCADO_PAGO_ACCESS_TOKEN`.
* `MERCADO_PAGO_WEBHOOK_SECRET`.
* `MERCADO_PAGO_TEST_PAYER_EMAIL`.
* `NEXTAUTH_SECRET`.
* `CRON_SECRET`.
* `APP_URL`.
* `NEXTAUTH_URL`.

No reutilices credenciales reales de Mercado Pago, Resend u otros proveedores.

Las únicas credenciales reales permitidas en `.env.test` son las necesarias para conectarse al Supabase desechable autorizado.

No muestres valores.

# 6. Prueba de aborto

Antes de realizar una mutación, demuestra que el runner aborta cuando:

* Falta `ALLOW_TEST_DATABASE_MUTATION`, o
* Falta `TEST_DATABASE_URL`, o
* La confirmación explícita no está presente.

Hazlo en un proceso hijo aislado.

No modifiques permanentemente `.env.test`.

Confirma que Prisma no llegó a ejecutarse.

# 7. Confirmación destructiva previa

Antes de aplicar migraciones o ejecutar pruebas, registra en el informe:

* Proyecto actual identificado.
* Datos clasificados como mock.
* Autorización explícita del propietario.
* Resultado del guard.
* Que cualquier dato existente puede ser borrado.
* Que `.env` fue aislado temporalmente si fue necesario.
* Que no se utilizarán proveedores externos reales.

No solicites una nueva confirmación al usuario. La autorización está incluida en este prompt.

# 8. Generación del cliente Prisma

Ejecuta:

```text
npx prisma generate
```

Si reaparece `EPERM`:

* No borres `node_modules`.
* No reinstales dependencias.
* No mates procesos no relacionados.
* Reintenta una sola vez si puedes cerrar un proceso claramente vinculado al proyecto.
* Registra el resultado exacto.

# 9. Aplicación de migraciones

Utiliza exclusivamente:

```text
npm run test:db:deploy
```

No ejecutes directamente:

```text
npx prisma migrate deploy
npx prisma migrate dev
npx prisma db push
```

Antes de ejecutar verifica:

* `.env.test` es la única fuente activa.
* El guard aprobó.
* `DATABASE_URL` fue reemplazada por `TEST_DATABASE_URL`.
* `DIRECT_URL` fue reemplazada por `TEST_DIRECT_URL`.
* Se está usando el Supabase autorizado.
* No hay conexiones externas normales heredadas.

Después registra:

* Código de salida.
* Migraciones aplicadas.
* Estado de `_prisma_migrations`.
* Presencia de:

  * `Payment.approvedEffectAppliedAt`
  * `Payment.approvedEffectReconciliationRequired`
  * `WebhookEvent`
  * `RECONCILIATION_REQUIRED`
  * `PAYMENT_RECONCILED`

# 10. Tratamiento del mockdata existente

No borres manualmente toda la base antes de las pruebas salvo que el runner o las migraciones lo requieran.

Las pruebas deben crear y limpiar sus propios fixtures.

Si una migración falla debido a inconsistencias del mockdata:

* No modifiques código.
* No ocultes el problema.
* Identifica la tabla y restricción.
* Como los datos son desechables, puedes eliminar únicamente los registros que bloqueen objetivamente la migración, pero solo después de:

  * documentar el conteo;
  * documentar la tabla;
  * confirmar que son mock;
  * utilizar una operación mínima;
  * no modificar schema manualmente.

No ejecutes un `DROP SCHEMA` ni borres todas las tablas.

# 11. Ejecución de la suite

Ejecuta únicamente:

```text
npm test
```

No ejecutes directamente archivos de pruebas.

Registra:

* Total.
* Passed.
* Failed.
* Skipped.
* Duración.
* Archivos.

Confirma los 17 escenarios:

1. APPROVED nuevo extiende una vez.
2. Replay APPROVED no extiende.
3. PENDING → APPROVED extiende una vez.
4. Concurrencia produce un efecto.
5. Rollback después del reclamo.
6. Rollback después de Subscription.
7. Rollback antes de AuditLog.
8. Reintento después del rollback.
9. Ledger `PROCESSED`.
10. Ledger `DUPLICATE`.
11. Preapproval atómico.
12. Pendientes aplicados y limpiados una vez.
13. Histórico en cuarentena no extiende.
14. Reconciliado no extiende.
15. Pago nuevo no queda en cuarentena.
16. Missing `dataId` no persiste ni llama al proveedor.
17. Evidencia CLI distingue pagos de la misma suscripción.

Confirma que `fetch` estuvo mockeado y no se llamó a Mercado Pago.

# 12. Manejo de fallos

Si una prueba falla:

* No modifiques código.
* No modifiques pruebas.
* No reduzcas aserciones.
* No añadas `skip`.
* No realices más de un reintento sin evidencia de fallo transitorio.

Clasifica cada fallo:

* Configuración.
* Guard.
* Supabase.
* Pooler.
* Conexión directa.
* Migración.
* Prisma.
* Transacción.
* Concurrencia.
* Fixtures.
* Lógica.
* Aserción.

Entrega evidencia segura y recomendación.

# 13. Limpieza

Después de la suite:

* Confirma que los fixtures de prueba fueron eliminados.
* Informa conteos agregados restantes.
* No borres el proyecto.
* No elimines el mockdata anterior salvo que ya haya sido afectado por la propia ejecución autorizada.
* Restaura `.env` si fue aislado.
* Verifica su hash.
* Elimina la copia temporal.
* Conserva `.env.test` ignorado para próximas fases.

# 14. Validaciones finales

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
```

# 15. Archivos permitidos

Solo puedes crear o modificar:

* `.env.test`, ignorado.
* Copia temporal ignorada de `.env`, si es estrictamente necesaria.
* Los documentos 17 y 18.
* Datos mock dentro del Supabase autorizado.

No modifiques:

* Código.
* Schema.
* Migraciones.
* Tests.
* `package.json`.
* `package-lock.json`.
* Contenido de `.env`.
* Configuración de Supabase.

Si el guard requiere un cambio de código, detente y repórtalo.

# Criterios de aceptación

1. La inspección no encuentra señales de producción.
2. La autorización del propietario queda documentada.
3. `.env.test` está ignorado.
4. La excepción es temporal y explícita.
5. No se debilita permanentemente el guard.
6. La prueba de aborto funciona.
7. Migraciones se aplican al Supabase autorizado.
8. Los 17 escenarios se ejecutan.
9. Cero `skip`.
10. Todos pasan.
11. Rollback y concurrencia se demuestran.
12. No se llama a Mercado Pago.
13. Fixtures quedan limpios.
14. `.env` queda restaurado sin cambios.
15. Typecheck, lint y pruebas puras pasan.
16. No se modifica código.
17. No se hace commit.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial.
3. Autorización del propietario.
4. Inspección de datos.
5. Inventario previo.
6. Estrategia temporal del guard.
7. Configuración de `.env.test`.
8. Aislamiento/restauración de `.env`.
9. Prueba de aborto.
10. Prisma generate.
11. Migraciones.
12. Tratamiento del mockdata.
13. Resultado de `npm test`.
14. Resultado de los 17 escenarios.
15. Rollback y concurrencia.
16. Limpieza.
17. Typecheck, lint y pruebas puras.
18. Fallos encontrados.
19. Confirmación de que no había datos reales.
20. Estado final de archivos.
21. Riesgos restantes.
22. Recomendación sobre commit.
23. Estado:

* INTEGRACIÓN APROBADA.
* INTEGRACIÓN APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* BLOQUEADO POR GUARD DE AISLAMIENTO.
* BLOQUEADO POR POSIBLES DATOS REALES.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/02-facturacion/18-respuesta-claude-supabase-actual-como-test.md`

2. Confirma que el prompt se guardó en:

`docs/programa-mejora/02-facturacion/17-prompt-claude-supabase-actual-como-test.md`

3. No hagas commit.

4. No continúes con cron, precedencia, cancelación o métricas.

5. Detente después del informe.
