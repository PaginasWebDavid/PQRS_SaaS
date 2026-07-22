# FASE 0G — CORRECCIONES FINALES DEL AISLAMIENTO DE PRUEBAS

Actúa como ingeniero principal responsable de cerrar dos bloqueantes concretos encontrados en la revisión final del sistema de aislamiento de pruebas.

La arquitectura general ya fue considerada correcta. No debes rediseñar nuevamente el sistema ni ampliar el alcance.

## Documentos de referencia

Lee completamente:

* `docs/programa-mejora/01-linea-base/10-respuesta-claude-correcciones-seguridad-tests.md`
* `docs/programa-mejora/01-linea-base/12-respuesta-codex-aprobacion-final-seguridad-tests.md`
* `docs/TESTING.md`

La fuente de verdad sigue siendo el código actual.

## Objetivo único

Corregir estos dos bloqueantes:

### F0F-01

`TEST_DIRECT_URL` puede apuntar a un destino PostgreSQL diferente o incluso productivo porque actualmente se valida su sintaxis, pero no su identidad respecto de `TEST_DATABASE_URL` ni de las conexiones normales.

### F0F-02

Una ejecución directa como:

`npx tsx tests/phase1-infrastructure.test.ts`

puede ejecutar `node:test` sin incluir el argumento `--test`, por lo que el contexto de pruebas no es detectado y Prisma podría crearse sin pasar por la segunda barrera.

También debes corregir tres hallazgos menores:

* Documentación imprecisa sobre alias DNS.
* Manejo no uniforme de nombres de base con percent-encoding inválido.
* Sincronización del campo `engines` en `package-lock.json`.

## Restricciones

No debes:

* Ejecutar `npm test`.
* Ejecutar Prisma.
* Ejecutar `test:db:deploy`.
* Ejecutar `test:db:push`.
* Conectarte a PostgreSQL.
* Aplicar migraciones.
* Ejecutar seeds.
* Ejecutar build.
* Levantar el servidor.
* Instalar o actualizar dependencias.
* Modificar facturación, PQRS, autenticación funcional, Storage, soporte o interfaz.
* Modificar schema o migraciones.
* Restaurar o confirmar los 48 documentos eliminados previamente.
* Hacer commit.
* Hacer push.
* Mostrar variables reales o secretos.

Puedes ejecutar:

* `npx tsc --noEmit`
* `npm run lint`
* Las pruebas puras del módulo de seguridad.
* Escenarios que estén garantizados para abortar antes de crear Prisma.
* Comandos de inspección de Git.

## Primera acción

Antes de modificar:

1. Ejecuta `git status`.
2. Inspecciona el diff actual.
3. Confirma que los cambios siguen limitados a la seguridad de tests.
4. Lee completamente:

   * `src/lib/testing/test-database-safety.ts`
   * `src/lib/prisma.ts`
   * `scripts/run-tests.ts`
   * `scripts/run-test-prisma.ts`
   * `tests/unit/test-database-safety.test.ts`
   * `docs/TESTING.md`
   * `package.json`
   * `package-lock.json`
5. Verifica directamente los hallazgos F0F-01 y F0F-02 antes de cambiar código.

## Corrección 1 — Identidad segura de TEST_DIRECT_URL

Revisa `resolveTestDirectUrl` y todas sus llamadas.

Cuando exista `TEST_DIRECT_URL`, no basta con validar que sea una URL PostgreSQL.

Debe cumplirse todo lo siguiente:

1. `TEST_DIRECT_URL` debe utilizar `postgres:` o `postgresql:`.
2. Debe representar la misma base o el mismo proyecto de pruebas que `TEST_DATABASE_URL`.
3. Debe admitirse una relación legítima entre:

   * Supabase pooler de pruebas.
   * Conexión directa del mismo proyecto Supabase.
4. Debe rechazarse si corresponde al destino normal definido en:

   * `DATABASE_URL`.
   * `DIRECT_URL`.
5. Debe rechazarse si pertenece a otro proyecto Supabase.
6. Debe rechazarse si usa la misma base pero un destino normal explícitamente identificado como producción.
7. No debe compararse por cadena literal, sino mediante las funciones canónicas compartidas.
8. Los mensajes de error no deben exponer usuario, contraseña, query string ni URL completa.

### Fallback

Si no existe `TEST_DIRECT_URL`:

* Solo puede usarse `TEST_DATABASE_URL` como `DIRECT_URL` si:

  * `ALLOW_TEST_DIRECT_URL_FALLBACK=true`.
  * La configuración principal de pruebas ya fue validada.
* El fallback debe quedar explícitamente identificado en el resultado interno.
* No debe heredarse nunca el `DIRECT_URL` normal.

### Resultado recomendado

`resolveTestDirectUrl` debería recibir suficiente contexto para validar:

* `TEST_DIRECT_URL`.
* `TEST_DATABASE_URL`.
* `DATABASE_URL` normal.
* `DIRECT_URL` normal.
* Autorización de fallback.

No dependas de variables globales ocultas si la función puede mantenerse pura.

## Casos obligatorios para TEST_DIRECT_URL

Añade pruebas puras para:

1. `TEST_DIRECT_URL` y `TEST_DATABASE_URL` son exactamente el mismo destino: permitido.
2. Pooler y conexión directa del mismo proyecto Supabase de pruebas: permitido.
3. Proyectos Supabase diferentes: rechazado.
4. Bases diferentes en el mismo host: rechazado.
5. `TEST_DIRECT_URL` coincide con `DIRECT_URL` normal: rechazado.
6. `TEST_DIRECT_URL` coincide con `DATABASE_URL` normal: rechazado.
7. Credenciales diferentes hacia el mismo destino de pruebas: permitido.
8. Query parameters diferentes hacia el mismo destino de pruebas: permitido.
9. Protocolo no PostgreSQL: rechazado.
10. URL inválida: rechazada de forma segura.
11. Sin `TEST_DIRECT_URL` y sin autorización de fallback: rechazado.
12. Sin `TEST_DIRECT_URL`, con fallback explícito y configuración segura: permitido.
13. Ningún error contiene credenciales ni URL completa.

## Corrección 2 — Detección de ejecución directa de archivos de test

Revisa `isNodeTestContext` o su equivalente.

La detección de contexto de test debe ser independiente de la marca del runner.

La marca debe servir únicamente para demostrar que el runner oficial validó la configuración, no para definir por sí sola que el proceso es un test.

Debe detectar como contexto de test:

1. `--test` presente como argumento exacto en `process.execArgv`.
2. `--test` presente como argumento exacto en `process.argv`.
3. `NODE_ENV === "test"`.
4. Un entrypoint ejecutado directamente cuyo nombre siga el patrón de archivos de prueba del repositorio.

Como mínimo, debe detectar:

* `tests/archivo.test.ts`
* `tests/subcarpeta/archivo.test.ts`
* Rutas Windows con `\`.
* Rutas Unix con `/`.
* Extensiones razonables utilizadas por el proyecto:

  * `.test.ts`
  * `.test.tsx`
  * `.test.js`
  * `.test.mjs`
  * `.test.cjs`

Evalúa `process.argv[1]` como entrypoint principal. No marques cualquier argumento arbitrario que contenga la palabra `test`.

### Evitar falsos positivos

No debe activarse solo porque:

* Una carpeta se llame `latest`.
* Un argumento contenga `contest`.
* Una ruta normal tenga una carpeta llamada `testing`.
* Un valor cualquiera incluya la cadena `.test.ts` sin ser el entrypoint.
* El nombre de una ruta productiva incluya la palabra `test` como parte de otra palabra.

### Marca del runner

La segunda barrera debe exigir simultáneamente:

1. Existe un contexto de test detectado independientemente.
2. Existe la marca válida del runner.
3. Existe `TEST_DATABASE_URL`.
4. Existe la confirmación explícita.
5. `DATABASE_URL` coincide canónicamente con `TEST_DATABASE_URL`.
6. La configuración completa es segura.

La marca por sí sola no debe activar ni autorizar el contexto.

## Casos obligatorios de detección

Añade pruebas puras para:

1. `--test` en `execArgv`: detectado.
2. `--test` en `argv`: detectado.
3. `NODE_ENV=test`: detectado.
4. Entry point POSIX `tests/example.test.ts`: detectado.
5. Entry point Windows `tests\example.test.ts`: detectado.
6. Archivo anidado: detectado.
7. `.test.tsx`: detectado.
8. `.test.js`, `.mjs` y `.cjs`: detectados.
9. `latest/example.ts`: no detectado.
10. `contest/example.ts`: no detectado.
11. Argumento secundario con `.test.ts`: no detectado si el entrypoint no es test.
12. Marca del runner sin contexto independiente: no activa la barrera como test.
13. Test directo sin marca: bloqueado antes de Prisma.
14. Test directo con marca pero URLs inseguras: bloqueado.
15. Test oficial con contexto, marca y URLs seguras: permitido.

## Corrección menor 1 — Percent-encoding inválido

`canonicalizeDatabaseUrl` debe convertir errores como un nombre de base con `%ZZ` en el error controlado utilizado por el sistema.

No debe dejar escapar un `URIError` genérico.

Debe:

* Fallar cerrado.
* No exponer la URL original.
* Mantener un mensaje uniforme y seguro.
* Tener prueba pura.

## Corrección menor 2 — Alias DNS

Corrige `docs/TESTING.md`.

No afirmes que una equivalencia DNS desconocida “falla conservadoramente” si el código simplemente considera que son destinos diferentes.

Documenta con precisión:

* Se detectan equivalencias canónicas conocidas.
* Se detectan conexiones Supabase directas y pooler del mismo proyecto cuando la referencia puede extraerse.
* No se pueden detectar alias DNS arbitrarios sin conectarse.
* Por ello, debe utilizarse una allowlist exacta cuando existan hosts personalizados o alias.

## Corrección menor 3 — package-lock.json

Sin ejecutar `npm install` ni modificar dependencias:

* Inspecciona la entrada raíz de `package-lock.json`.
* Sincroniza únicamente el campo `engines.node` con `package.json`, si el formato del lockfile lo requiere.
* No alteres versiones, integridades ni dependencias.
* Explica el cambio en el informe.

## Segunda barrera y seed

No extiendas esta fase al seed ni a scripts administrativos normales.

Sí debes confirmar documentalmente que:

* El seed no está protegido por esta barrera.
* No debe utilizarse como mecanismo de pruebas.
* Los únicos comandos aprobados para preparar una base de pruebas son `test:db:deploy` y `test:db:push`.

No modifiques el seed salvo que encuentres una dependencia directa creada por esta fase, lo cual debe justificarse.

## Validaciones permitidas

Ejecuta:

```bash
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/test-database-safety.test.ts
```

También puedes ejecutar:

* El runner sin variables, para demostrar aborto previo.
* La segunda barrera con un entrypoint ficticio `.test.ts`, sin marca, garantizando que falle antes de Prisma.
* El runner Prisma con una operación desconocida, garantizando que falle antes de resolver conexión.

No ejecutes:

```bash
npm test
npm run test:db:deploy
npm run test:db:push
npx prisma
npm run build
```

## Criterios de aceptación

La fase queda corregida únicamente si:

1. `TEST_DIRECT_URL` debe corresponder al mismo destino de pruebas.
2. Se rechaza si coincide con una conexión normal.
3. Se soporta Supabase pooler y directo del mismo proyecto.
4. El fallback requiere autorización explícita.
5. La ejecución directa de `.test.ts` se detecta.
6. La ejecución directa sin marca se bloquea antes de Prisma.
7. La marca no cuenta como contexto independiente.
8. No existen falsos positivos obvios por subcadenas.
9. Los errores de percent-encoding son controlados.
10. La documentación describe correctamente las limitaciones DNS.
11. `package-lock.json` queda sincronizado sin modificar dependencias.
12. Las pruebas puras nuevas pasan.
13. Typecheck y lint pasan.
14. No se ejecuta ninguna conexión.
15. No se modifica lógica de negocio.
16. No se tocan los 48 documentos eliminados.
17. No se hace commit.

## Informe final

Entrega:

1. Resumen ejecutivo.
2. Confirmación de los hallazgos.
3. Diseño aplicado.
4. Archivos modificados.
5. Validación de `TEST_DIRECT_URL`.
6. Detección de entrypoints de test.
7. Independencia entre contexto y marca.
8. Percent-encoding.
9. Documentación DNS.
10. Sincronización de `package-lock.json`.
11. Pruebas añadidas.
12. Comandos ejecutados.
13. Resultados.
14. Validaciones no realizadas.
15. Diff resumido.
16. Riesgos restantes.
17. Respuesta individual a F0F-01 hasta F0F-05.
18. Estado:

* CORREGIDO.
* CORREGIDO CON RIESGOS MENORES.
* BLOQUEADO.

## Finalización

Detente después de implementar y entregar el informe.

No continúes con facturación.

No hagas commit.
