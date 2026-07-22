# FASE 0C — AISLAMIENTO Y SEGURIDAD DEL ENTORNO DE PRUEBAS

Actúa como ingeniero principal responsable de seguridad de entornos, calidad y prevención de incidentes de datos.

Trabajas sobre PQRS Services, una aplicación Next.js, TypeScript, Prisma y PostgreSQL.

## Contexto confirmado

Dos auditorías independientes determinaron que:

* `npm test` utiliza actualmente el cliente normal de Prisma.
* El cliente normal obtiene la conexión desde `DATABASE_URL`.
* No existe una `TEST_DATABASE_URL` obligatoria.
* Los tests crean y eliminan información.
* La limpieza no garantiza recuperación ante interrupción abrupta.
* Ejecutar las pruebas con una `DATABASE_URL` de producción podría contaminar o modificar datos reales.

## Objetivo único

Impedir técnicamente que la suite de pruebas pueda ejecutarse accidentalmente contra la base normal o contra producción.

Esta fase no busca mejorar cobertura ni corregir funcionalidades del negocio.

## Alcance permitido

Puedes modificar únicamente lo necesario para:

1. Crear una configuración explícita para base de datos de pruebas.
2. Obligar a que `npm test` utilice `TEST_DATABASE_URL`.
3. Impedir que los tests utilicen `DATABASE_URL` como fallback.
4. Hacer que la suite falle antes de importar servicios o crear un cliente Prisma cuando la configuración sea insegura.
5. Establecer una confirmación explícita para permitir escritura destructiva en la base de pruebas.
6. Documentar cómo configurar y ejecutar las pruebas de manera segura.
7. Mejorar el aislamiento y limpieza de los datos creados por tests cuando pueda hacerse sin cambiar lógica de producción.
8. Añadir pruebas puras del guard de seguridad que no necesiten conexión a una base de datos.

## Fuera de alcance

No debes modificar:

* Facturación.
* Mercado Pago.
* Webhooks.
* PQRS.
* Autenticación funcional.
* Autorización.
* Storage.
* Soporte.
* Documentos legales.
* Interfaz.
* Migraciones de negocio.
* Modelos Prisma, salvo que sea absolutamente imprescindible para la seguridad del runner, lo cual debe justificarse.
* Los documentos eliminados que aparecen en Git.
* La carpeta de migración documental existente.

No debes:

* Ejecutar `npm test` durante esta fase.
* Conectarte a ninguna base de datos.
* Ejecutar Prisma Studio.
* Ejecutar seeds.
* Aplicar migraciones.
* Ejecutar comandos que consulten o escriban PostgreSQL.
* Mostrar valores de variables de entorno.
* Hacer commit.
* Hacer push.
* Restaurar los archivos eliminados de `docs/`.

## Primera acción

Antes de cambiar código:

1. Ejecuta `git status`.
2. Identifica todos los cambios previos.
3. Confirma que no existen cambios de código fuente anteriores.
4. Registra las eliminaciones documentales existentes, pero no las toques.
5. Inspecciona:

   * `package.json`.
   * Scripts de pruebas.
   * Inicialización de Prisma.
   * Archivos dentro de `tests/`.
   * Carga de variables de entorno.
   * `.gitignore`.
   * Archivos `.env.example` existentes.

## Requisitos funcionales obligatorios

### 1. Variable separada

La ejecución de tests debe requerir:

`TEST_DATABASE_URL`

No debe existir fallback automático hacia:

`DATABASE_URL`

### 2. Diferencia obligatoria

La ejecución debe fallar inmediatamente si:

* `TEST_DATABASE_URL` no existe.
* `TEST_DATABASE_URL` está vacía.
* `TEST_DATABASE_URL` es igual a `DATABASE_URL`.
* No existe una autorización explícita para permitir que la suite escriba en la base de pruebas.

Utiliza una variable explícita similar a:

`ALLOW_TEST_DATABASE_MUTATION=true`

Puedes proponer otro nombre si es más claro, pero debe ser inequívoco.

### 3. Fallo antes de importar Prisma

La validación debe ocurrir antes de:

* Crear el cliente Prisma.
* Importar servicios de dominio que utilicen Prisma.
* Crear datos.
* Ejecutar hooks de pruebas.

No basta con colocar una comprobación dentro de cada archivo de test.

Debe existir un punto central obligatorio por el que pase `npm test`.

### 4. Compatibilidad

La solución debe funcionar correctamente en Windows, Linux y macOS.

No utilices sintaxis de variables inline exclusiva de Unix como:

`NODE_ENV=test comando`

salvo que ya exista una dependencia multiplataforma que la soporte.

Evita agregar dependencias nuevas si puede resolverse de forma segura con Node.js y las herramientas existentes.

### 5. Entorno de producción intacto

La aplicación normal debe continuar usando:

`DATABASE_URL`

Los comandos de desarrollo, build y producción no deben comenzar a exigir `TEST_DATABASE_URL`.

La lógica exclusiva de tests no debe afectar el runtime normal.

### 6. Sin secretos versionados

No crees archivos con credenciales reales.

Puedes crear o actualizar un archivo de ejemplo como:

`.env.test.example`

Este debe contener solamente nombres y valores ficticios.

Confirma que `.env.test` y otros archivos con secretos estén ignorados por Git.

### 7. Runner seguro

El script `npm test` debe pasar por un runner central que:

1. Establezca inequívocamente el contexto de pruebas.
2. Cargue o valide las variables necesarias.
3. Ejecute el guard de seguridad.
4. Solo después lance la suite.
5. Propague correctamente el código de salida.
6. Finalice si la configuración es inválida.

No debe imprimir la URL completa de conexión.

Los errores pueden mostrar únicamente información no sensible, por ejemplo:

* Variable ausente.
* Las dos URLs son iguales.
* Confirmación de mutación ausente.
* Host o base no permitida, sin revelar credenciales.

### 8. Protección adicional

Evalúa una protección adicional razonable, por ejemplo:

* Exigir que el nombre de la base o esquema indique explícitamente que es de pruebas.
* Mantener una allowlist configurable.
* Bloquear hosts conocidos de producción.
* Exigir una segunda confirmación explícita.

No implementes reglas frágiles que bloqueen entornos válidos sin una vía clara de configuración.

La protección mínima obligatoria sigue siendo:

* URL separada.
* URL diferente.
* Confirmación explícita.
* Guard anterior a Prisma.

### 9. Limpieza

Inspecciona cómo se crean y eliminan datos en las pruebas.

Sin ejecutar la suite:

* Confirma que los datos usan identificadores únicos.
* Limita toda limpieza a entidades creadas por la ejecución actual.
* Utiliza `try/finally`, hooks o estrategias equivalentes cuando ayuden ante fallos normales.
* No implementes eliminaciones globales.
* No uses `deleteMany({})` sin filtros estrictos.
* No borres información por coincidencias amplias de correo o nombre.

Una interrupción forzada del proceso no siempre puede garantizar limpieza; documenta esta limitación.

### 10. Pruebas del guard

Crea pruebas unitarias puras para la función de validación de seguridad.

Estas pruebas no deben:

* Importar Prisma.
* Abrir conexiones.
* Leer credenciales reales.
* Depender de servicios externos.

Deben cubrir al menos:

* Falta `TEST_DATABASE_URL`.
* URL vacía.
* Es igual a `DATABASE_URL`.
* Falta autorización de mutación.
* Configuración válida.
* No exposición de contraseña o URL completa en errores.

No ejecutes la suite global.

Puedes ejecutar exclusivamente estas pruebas puras si existe una forma inequívoca de hacerlo sin activar el runner que conecta Prisma. Si no puedes garantizarlo, no ejecutes ninguna prueba y documenta la validación pendiente.

## Implementación esperada

La estructura exacta depende del repositorio. Puedes utilizar, por ejemplo:

* Un script runner en `scripts/`.
* Un módulo puro de validación.
* Una inicialización específica de test.
* Un override de datasource de Prisma en modo test.
* Un archivo de configuración de ejemplo.

No adoptes esta estructura automáticamente; inspecciona primero y elige la alternativa mínima y más robusta.

## Validaciones permitidas

Puedes ejecutar:

* `npx tsc --noEmit`.
* `npm run lint`.
* Pruebas puras que no importen Prisma ni accedan a servicios.

No ejecutes:

* `npm test`.
* Build si importa código que pueda abrir conexiones.
* Prisma generate si no es necesario.
* Cualquier comando de base de datos.

## Criterios de aceptación

La fase se considera implementada únicamente si:

1. `npm test` no puede usar `DATABASE_URL` como base de pruebas.
2. Sin `TEST_DATABASE_URL`, falla antes de Prisma.
3. Si ambas URLs son iguales, falla antes de Prisma.
4. Sin autorización explícita de mutación, falla.
5. La aplicación normal conserva su comportamiento.
6. No se versionan secretos.
7. La solución funciona en Windows.
8. Existe documentación clara.
9. Existen pruebas puras del guard o una justificación técnica precisa si no pudieron agregarse.
10. No se modificó ningún módulo funcional del negocio.
11. No se tocaron los documentos eliminados previamente.
12. El diff se limita a archivos relacionados con seguridad de tests.

## Informe final obligatorio

Entrega:

1. Resumen ejecutivo.
2. Riesgo original.
3. Diseño elegido.
4. Alternativas descartadas.
5. Archivos modificados.
6. Funcionamiento del runner.
7. Funcionamiento del guard.
8. Manejo de variables.
9. Cambios en limpieza de datos.
10. Pruebas puras añadidas.
11. Comandos ejecutados.
12. Resultados.
13. Validaciones no ejecutadas.
14. Diff resumido.
15. Riesgos restantes.
16. Instrucciones exactas para que un desarrollador configure `.env.test`.
17. Estado:

* IMPLEMENTADO.
* IMPLEMENTADO CON RIESGOS.
* BLOQUEADO.

## Finalización

Detente después de implementar esta fase y entregar el informe.

No continúes con facturación.

No corrijas otros hallazgos aunque sean evidentes.

No hagas commit.
