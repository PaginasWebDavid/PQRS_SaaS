# FASE 1I — CONFIGURACIÓN DE SUPABASE DE PRUEBAS Y EJECUCIÓN DE INTEGRACIÓN

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/02-facturacion/17-prompt-claude-supabase-pruebas-e-integracion.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al finalizar:

3. Crea:

`docs/programa-mejora/02-facturacion/18-respuesta-claude-supabase-pruebas-e-integracion.md`

4. Guarda allí el informe final completo.

No modifiques documentos anteriores.

---

Actúa como ingeniero principal responsable de configurar un entorno Supabase de pruebas completamente aislado y validar la integración de facturación.

La implementación fue aprobada estáticamente para pasar a integración.

## Preferencia obligatoria del proyecto

El usuario no utiliza Docker y no quiere introducir Docker en este proyecto.

No propongas, instales ni utilices Docker.

El entorno de pruebas debe ser un proyecto Supabase independiente.

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
* `tests/billing-webhook-idempotency.test.ts`

La fuente de verdad es el repositorio actual.

## Objetivos

1. Inspeccionar de forma segura la configuración actual de Supabase.
2. Determinar si ya existe un proyecto Supabase independiente para pruebas.
3. Configurar `.env.test` exclusivamente con ese proyecto separado.
4. Validar el aislamiento mediante el guard de la Fase 0.
5. Aplicar las migraciones únicamente al proyecto Supabase de pruebas.
6. Ejecutar la suite mediante el runner oficial.
7. Confirmar los 17 escenarios de integración.
8. No modificar código si una prueba falla.
9. No afectar el Supabase actual de desarrollo o producción.

# Regla crítica

Está prohibido usar como entorno de integración:

* El proyecto Supabase actual de producción.
* El proyecto Supabase actual de desarrollo habitual.
* La misma referencia de proyecto Supabase.
* La misma base PostgreSQL.
* `DATABASE_URL` normal.
* `DIRECT_URL` normal.
* Una rama o schema dentro del mismo proyecto normal, salvo que el repositorio ya use oficialmente Supabase Branching y se demuestre que la rama tiene base y credenciales físicamente aisladas.

La opción preferida es otro proyecto Supabase con otra referencia de proyecto.

# Permiso de inspección del Supabase actual

Puedes inspeccionar el Supabase actual para comprender su estructura y configuración.

La inspección del proyecto actual debe ser estrictamente de solo lectura.

Puedes consultar:

* Referencia o identidad del proyecto.
* Host y tipo de conexión.
* Migraciones registradas.
* Tablas y columnas.
* Cantidad aproximada de datos.
* Configuración necesaria para reproducir el esquema.
* Estado de las migraciones.
* Extensiones PostgreSQL utilizadas.
* Diferencias entre pooler y conexión directa.

No puedes en el proyecto actual:

* Ejecutar `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE` o `DROP`.
* Aplicar migraciones.
* Ejecutar seeds.
* Crear tablas.
* Alterar columnas.
* Crear usuarios.
* Cambiar configuración.
* Ejecutar pruebas.
* Crear fixtures.
* Limpiar datos.
* Ejecutar el CLI de reconciliación.
* Cambiar estados de Payment, Subscription o Tenant.

No muestres URLs completas, usuarios, contraseñas, tokens ni secretos.

# 1. Inspección inicial

Ejecuta:

```text
git status
git log -1 --oneline
```

Confirma:

* La implementación de facturación sigue sin commit.
* La migración todavía no se ha aplicado.
* `.env.test` existe o no existe.
* Las variables de Supabase disponibles, solo por nombre.
* La referencia segura y parcialmente enmascarada del proyecto actual.
* Si existe evidencia de un segundo proyecto destinado a test, QA o staging.

No copies valores desde `.env` a `.env.test`.

Guarda este prompt antes de continuar.

# 2. Determinar si existe un Supabase de pruebas

Busca de forma segura evidencia de:

* `TEST_DATABASE_URL`.
* `TEST_DIRECT_URL`.
* Otro project ref de Supabase.
* Variables de staging o QA.
* Archivos locales ignorados.
* Configuración de Vercel para preview o test, si está disponible desde el repositorio.
* Documentación interna.

## Si existe un proyecto separado

Confirma:

* Tiene otra referencia de proyecto.
* No contiene datos reales.
* No es utilizado por desarrollo habitual.
* Puede recibir migraciones y fixtures destructibles.
* Sus credenciales son exclusivamente de test.

Continúa con la configuración.

## Si no existe un proyecto separado

No utilices el proyecto actual.

Detente antes de aplicar migraciones y entrega pasos manuales exactos para que el usuario cree uno desde el panel de Supabase.

Los pasos deben incluir:

1. Crear un proyecto nuevo.
2. Usar una organización apropiada.
3. Nombre recomendado:

   * `pqrs-services-test`
4. Elegir región cercana a Colombia o igual a producción.
5. Generar una contraseña exclusiva.
6. No copiar datos reales.
7. Obtener:

   * Connection string del pooler.
   * Connection string directa.
8. Guardarlas únicamente en `.env.test`.
9. No compartirlas en el chat ni en documentación.
10. Confirmar que el project ref sea diferente.

En ese caso, el estado final será:

`BLOQUEADO HASTA CREAR SUPABASE DE PRUEBAS`

No intentes crear automáticamente el proyecto cloud.

# 3. Inspección de solo lectura del Supabase actual

Si las credenciales actuales permiten acceso, realiza únicamente consultas de lectura para entender:

* Migraciones registradas.
* Tablas existentes.
* Extensiones utilizadas.
* Esquema esperado.
* Si existen pagos históricos de Mercado Pago.
* Si existen filas `Payment` reales.
* Si existe ya alguno de los campos nuevos, lo cual indicaría una migración aplicada previamente.

No muestres:

* Correos.
* Nombres de residentes.
* Identificaciones.
* Contenido de PQRS.
* Tokens.
* URLs.
* IDs completos de pagos.
* Payloads.
* Datos personales.

En el informe presenta solo conteos y conclusiones agregadas.

Si no puedes garantizar que la operación sea de solo lectura, no la ejecutes.

# 4. Creación de `.env.test`

Antes de crear el archivo, confirma:

```text
git check-ignore .env.test
```

Si `.env.test` no está ignorado, detente.

Crea `.env.test` exclusivamente con valores del proyecto Supabase separado.

Debe contener, según el código real:

```text
TEST_DATABASE_URL=<pooler exclusivo del proyecto de pruebas>
TEST_DIRECT_URL=<conexion directa exclusiva del proyecto de pruebas>
ALLOW_TEST_DATABASE_MUTATION=true
TEST_DATABASE_ALLOW_ANY_NAME=false
ALLOW_TEST_DIRECT_URL_FALLBACK=false
NODE_ENV=test
```

Añade valores ficticios y exclusivos de pruebas para:

* `MERCADO_PAGO_ACCESS_TOKEN`.
* `MERCADO_PAGO_WEBHOOK_SECRET`.
* `MERCADO_PAGO_TEST_PAYER_EMAIL`.
* `NEXTAUTH_SECRET`.
* `CRON_SECRET`.
* `APP_URL`.
* `NEXTAUTH_URL`.

Usa valores sintéticos. No copies secretos normales.

No muestres los valores en el informe.

# 5. Validación canónica del aislamiento

Antes de aplicar migraciones, usa el guard de la Fase 0 para confirmar:

* `TEST_DATABASE_URL` es PostgreSQL válida.
* `TEST_DIRECT_URL` es PostgreSQL válida.
* Pooler y conexión directa pertenecen al mismo proyecto de pruebas.
* El project ref de pruebas es distinto del project ref normal.
* Ninguna coincide canónicamente con `DATABASE_URL`.
* Ninguna coincide canónicamente con `DIRECT_URL`.
* `ALLOW_TEST_DATABASE_MUTATION=true`.
* El destino está identificado como test mediante nombre o allowlist explícita segura.

No uses `TEST_DATABASE_ALLOW_ANY_NAME=true` salvo que el nombre del proyecto no pueda reconocerse como test y exista una allowlist exacta.

Informa solamente:

* Tipo de conexión.
* Host parcialmente oculto.
* Nombre de base.
* Project ref parcialmente oculto.
* Resultado del guard.
* Confirmación de que los proyectos son diferentes.

## Prueba de aborto

Ejecuta primero un escenario garantizado para abortar antes de Prisma, omitiendo temporalmente una variable obligatoria en el proceso hijo.

No modifiques `.env.test` para hacer esta prueba.

# 6. Verificación de que el proyecto de test está vacío

Antes de migrar, consulta de forma segura el Supabase de pruebas.

Confirma:

* No contiene datos reales.
* No contiene tenants reales.
* No contiene residentes.
* No contiene PQRS reales.
* No tiene migraciones ajenas al proyecto.
* Puede borrarse o recrearse sin afectar a nadie.

Si contiene datos inesperados, detente.

No limpies esos datos automáticamente.

# 7. Generación del cliente Prisma

Ejecuta:

```text
npx prisma generate
```

Registra:

* Código de salida.
* Si aparece nuevamente `EPERM`.
* Si tipos y motor quedaron generados.

Si aparece `EPERM`:

* No borres `node_modules`.
* No reinstales paquetes.
* No mates procesos no relacionados.
* Reintenta una sola vez después de cerrar únicamente procesos claramente vinculados al proyecto, si resulta seguro.
* Si persiste, registra el fallo.

# 8. Aplicación de migraciones al Supabase de pruebas

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

Antes de ejecutar confirma:

* Guard aprobado.
* Project ref de pruebas confirmado.
* `DATABASE_URL` reemplazada por `TEST_DATABASE_URL`.
* `DIRECT_URL` reemplazada por `TEST_DIRECT_URL`.
* Ninguna conexión normal heredada.
* El proyecto actual de producción/desarrollo no será tocado.

Después confirma:

* Código de salida.
* Migraciones aplicadas.
* Presencia de:

  * `Payment.approvedEffectAppliedAt`
  * `Payment.approvedEffectReconciliationRequired`
  * `WebhookEvent`
  * `WebhookEventResult.RECONCILIATION_REQUIRED`
  * `AuditAction.PAYMENT_RECONCILED`
* Ausencia de cambios en el proyecto normal.

# 9. Ejecución de la suite

Ejecuta exclusivamente:

```text
npm test
```

No ejecutes archivos `.test.ts` directamente.

Registra:

* Total de pruebas.
* Passed.
* Failed.
* Skipped.
* Duración.
* Archivos ejecutados.

Confirma expresamente los 17 escenarios:

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

Confirma también que no se llamó a Mercado Pago real.

# 10. Manejo de fallos

Si una prueba falla:

* No modifiques código.
* No modifiques pruebas.
* No reduzcas aserciones.
* No añadas `skip`.
* No cambies de proyecto Supabase.
* No reintentes repetidamente.

Clasifica el fallo:

* Infraestructura Supabase.
* Pooler.
* Conexión directa.
* Migración.
* Prisma.
* Transacción.
* Concurrencia.
* Limpieza.
* Lógica.
* Aserción.
* Configuración.

Entrega:

* Nombre del test.
* Mensaje seguro.
* Archivo y línea.
* Esperado.
* Observado.
* Hipótesis.
* Corrección recomendada.

Solo se permite una segunda ejecución si el fallo fue claramente transitorio de red o infraestructura.

# 11. Limpieza posterior

Después de la suite:

* Confirma que se eliminaron fixtures.
* Confirma que no quedan Tenant, Subscription, Payment, AuditLog o WebhookEvent de las pruebas.
* No elimines el proyecto Supabase.
* No ejecutes operaciones sobre el proyecto normal.
* Conserva el proyecto de pruebas para próximas fases.

# 12. Validaciones finales

Ejecuta:

```text
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/*.test.ts
```

Registra resultados por separado.

# 13. Archivos permitidos

Solo puedes crear o modificar:

* `.env.test`, ignorado por Git.
* Los dos documentos automáticos.
* Datos temporales dentro del Supabase exclusivo de pruebas.

No modifiques:

* Código.
* Schema.
* Migraciones.
* Tests.
* `package.json`.
* `package-lock.json`.
* `.env`.
* Configuración del proyecto Supabase normal.

Si se necesita una corrección de código, detente y repórtala.

# Criterios de aceptación

1. Se utiliza otro proyecto Supabase.
2. El project ref es diferente.
3. `.env.test` está ignorado.
4. No se copian secretos normales.
5. El guard aprueba.
6. El proyecto de pruebas no contiene datos reales.
7. Migraciones aplicadas solo al proyecto de test.
8. Los 17 escenarios se ejecutan.
9. Cero `skip`.
10. Todos los escenarios pasan.
11. Rollback y concurrencia se demuestran en PostgreSQL.
12. No se llama a Mercado Pago real.
13. Fixtures limpios.
14. Typecheck, lint y pruebas puras pasan.
15. Proyecto normal intacto.
16. No se modifica código.
17. No se hace commit.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git.
3. Inspección del Supabase actual.
4. Existencia o creación pendiente del Supabase de pruebas.
5. Configuración de `.env.test`.
6. Diferencia de project refs.
7. Validación del guard.
8. Prueba de aborto.
9. Estado inicial del proyecto de pruebas.
10. Prisma generate.
11. Migraciones.
12. Resultado de `npm test`.
13. Resultado de los 17 escenarios.
14. Rollback y concurrencia.
15. Limpieza de fixtures.
16. Typecheck, lint y pruebas puras.
17. Fallos.
18. Confirmación de no afectación al proyecto normal.
19. Estado de archivos.
20. Riesgos restantes.
21. Recomendación sobre commit.
22. Estado:

* INTEGRACIÓN APROBADA.
* INTEGRACIÓN APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* BLOQUEADO HASTA CREAR SUPABASE DE PRUEBAS.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/02-facturacion/18-respuesta-claude-supabase-pruebas-e-integracion.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/02-facturacion/17-prompt-claude-supabase-pruebas-e-integracion.md`

3. No hagas commit.

4. No continúes con precedencia, cron, cancelación o métricas.

5. Conserva el proyecto Supabase de pruebas.

6. Detente después del informe.
