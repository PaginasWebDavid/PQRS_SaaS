1. Resumen ejecutivo
La Fase 0D no puede aprobarse todavía. npm test incorpora una protección útil y falla de forma segura cuando falta configuración, pero aún existen rutas realistas para ejecutar pruebas contra una base incorrecta.
2. Estado de Git
Solo aparecen cambios propios de la Fase 0C en package.json, .gitignore, runner, guard, pruebas y documentación. Hay 48 documentos eliminados previamente que no modifiqué ni restauré.
No encontré cambios en src/, prisma/schema.prisma, migraciones ni lógica de negocio.
3. Secuencia de npm test
La secuencia efectiva es:
npm test → runner → carga .env → carga .env.test → guard → descubrimiento → proceso hijo → importación de tests → Prisma.
El guard sí se ejecuta antes de Prisma en esta ruta oficial: [run-tests.ts (line 28)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/scripts/run-tests.ts:28).
4. Prioridad de variables
La prioridad real es:
variables del sistema > .env > .env.test
Esto ocurre porque ambas llamadas a dotenv usan override: false. Por tanto, .env.test puede ser ignorado silenciosamente si una variable ya existe en .env o Vercel/terminal.
5. Formas de omitir el guard
Estas rutas no pasan por el runner:
npx tsx --test tests/phase1-infrastructure.test.ts
node --import tsx --test ...
Ejecutar tests desde el IDE.
Importar directamente un test de integración.
Un script futuro que invoque Prisma por su cuenta.
Esto hace que la protección dependa de recordar usar exclusivamente npm test.
6. Comparación de URLs
El guard compara cadenas recortadas, no destinos equivalentes: [test-database-guard.ts (line 65)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/tests/helpers/test-database-guard.ts:65).
La misma base podría pasar usando credenciales distintas, parámetros diferentes, mayúsculas, puerto explícito, alias DNS o conexión directa frente a pooler.
7. Heurística test
La comprobación /test/i es orientativa, no una garantía. Acepta falsos positivos como latest, contest o prod_test_backup, y rechaza bases legítimas llamadas qa, ci o sandbox.
TEST_DATABASE_ALLOW_ANY_NAME=true desactiva completamente esta barrera.
8. Secretos y errores
Los mensajes no exponen contraseña, URL completa, usuario, query string ni token. Solo muestran host y base cuando es necesario. Esta parte está correctamente resuelta.
9. Compatibilidad Node
Validado con Node v24.13.0. No existe engines, .nvmrc ni .node-version. El runner depende de node --import y del recorrido recursivo de readdirSync, por lo que recomiendo declarar Node 20 o superior.
10. Compatibilidad de plataforma
El proceso hijo usa argumentos estructurados, sin shell, por lo que funciona correctamente con espacios y rutas Windows/Linux/macOS. La documentación usa cp, que no es nativo de PowerShell.
11. Proceso hijo
spawnSync hereda la salida, fuerza DATABASE_URL, propaga códigos de error y convierte señales o estados nulos en fallo. No encontré una ruta de falso éxito.
12. Descubrimiento de tests
Encuentra recursivamente archivos .test.ts y excluye correctamente helpers. No ordena los archivos y podría incluir tests generados accidentalmente. Con cero tests falla correctamente.
13. Prisma y variables
Prisma consume DATABASE_URL y DIRECT_URL, no TEST_DATABASE_URL: [schema.prisma (line 7)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/prisma/schema.prisma:7).
El runner reemplaza DATABASE_URL, pero no elimina ni reemplaza DIRECT_URL. Las pruebas actuales no ejecutan Prisma CLI, aunque un test o script futuro podría hacerlo.
14. Aplicación normal
La aplicación productiva no importa el runner ni el guard. Desarrollo, build y producción continúan usando las variables normales. No encontré impacto accidental en runtime.
15. Calidad de las pruebas unitarias
Pasaron las 12 pruebas puras del guard usando la misma invocación del proceso hijo. Faltan casos sobre URLs equivalentes, prioridades de entorno, protocolos inválidos y ejecución directa sin runner.
16. Documentación
El riesgo más grave está en [TESTING.md (line 29)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/docs/TESTING.md:29): recomienda ejecutar prisma migrate deploy o prisma db push “apuntando a TEST_DATABASE_URL”, pero Prisma no lee esa variable. Esa instrucción podría modificar la base normal mediante DATABASE_URL o DIRECT_URL.
17. Hallazgos clasificados
ID	Severidad	Hallazgo	Bloquea
F0D-01	Crítica	URLs equivalentes pueden evadir la comparación textual	Sí
F0D-02	Crítica	La instrucción Prisma puede apuntar a la base normal	Sí
F0D-03	Alta	IDE y comandos directos omiten completamente el guard	Sí
F0D-04	Alta	.env.test tiene menor prioridad que .env	Sí
F0D-05	Media	Versión de Node no declarada	No
F0D-06	Baja	Descubrimiento sin orden y documentación cp	No

18. Correcciones obligatorias
Comparar un destino canónico ignorando credenciales y parámetros irrelevantes.
Validar únicamente protocolos PostgreSQL.
Añadir una segunda barrera antes de crear PrismaClient, activada en contexto de pruebas.
Crear un comando protegido para migraciones de prueba que reemplace tanto DATABASE_URL como DIRECT_URL.
Definir explícitamente la prioridad de .env.test y probarla.
Cubrir ejecución directa, URLs equivalentes y overrides con pruebas.
19. Mejoras opcionales
Declarar "engines": { "node": ">=20" }, añadir .nvmrc, ordenar los tests y documentar comandos equivalentes para PowerShell.
20. Validaciones realizadas
Prueba pura del guard: 12/12 aprobadas.
Aborto con variables vacías: correcto, exit code 1 antes de Prisma.
npx tsc --noEmit: aprobado.
npm run lint: aprobado, sin advertencias.
No ejecuté integración, Prisma, migraciones, seeds, servidor, build ni conexiones de base de datos.
21. Veredicto
REQUIERE CORRECCIONES
La arquitectura central es recuperable y el runner oficial funciona, pero todavía no demuestra aislamiento fuerte. Las tres rutas bloqueantes son la comparación textual de URLs, el bypass mediante ejecución directa y la instrucción insegura para Prisma. No apliqué ninguna corrección ni modifiqué archivos.


7:22 PM






# FASE 0F — APROBACIÓN FINAL DEL AISLAMIENTO DE PRUEBAS Actúa como revisor técn…




Worked for 13m 35s



1. Resumen ejecutivo
La solución mejora significativamente la Fase 0C, pero todavía conserva dos rutas críticas capaces de alcanzar una base incorrecta. No recomiendo cerrar la fase ni confirmar estos cambios todavía.
2. Estado de Git
Persisten exactamente 48 documentos eliminados previamente. No fueron alterados durante esta revisión. Los antiguos archivos 0C no versionados ya no existen y fueron sustituidos por la solución actual.
No modifiqué ningún archivo.
3. Alcance del diff
Los cambios funcionales se limitan a .gitignore, package.json y [prisma.ts (line 1)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/src/lib/prisma.ts:1), más los nuevos runners, módulo de seguridad, pruebas y documentación.
No hay cambios en facturación, PQRS, autenticación, storage, schema, migraciones, webhooks ni interfaz.
4. Runtime normal
Con NODE_ENV=development o production, sin marca ni --test, la barrera permite continuar antes de validar variables de prueba. El build normal tampoco debería bloquearse.
El seed usa su propio new PrismaClient() y no pasa por esta barrera. Es comportamiento anterior y no debe utilizarse como comando de pruebas.
5. Detección de test
Detecta NODE_ENV=test, el argumento exacto --test o la marca del runner. No produce falsos positivos por rutas que solamente contengan la palabra “test”.
Sin embargo, no detecta npx tsx tests/phase1-infrastructure.test.ts sin --test. node:test sí ejecuta un archivo así, como confirmé con la prueba pura.
6. Prioridad de variables
La prioridad implementada coincide con la documentación:
proceso/CI > .env.test > .env
Los archivos se parsean sin mutar process.env. Un string vacío del sistema oculta valores inferiores, pero las variables obligatorias terminan fallando de forma cerrada.
7. Canonicalización
Normaliza protocolo PostgreSQL, host, puerto 5432, credenciales, query, slash final y nombre codificado. También reconoce Supabase directo y pooler mediante la referencia del proyecto.
IPv6 funcionó correctamente. Una codificación inválida como %ZZ produce un URIError inesperado, aunque falla antes de cualquier conexión.
8. Segunda barrera
Está correctamente ubicada antes de new PrismaClient(). Con NODE_ENV=test y sin marca, abortó antes de conectar.
La marca sola no autoriza Prisma porque también exige configuración, confirmación y coincidencia canónica. No obstante, la marca cuenta simultáneamente como “contexto de test” y como marca, por lo que ambas señales no son realmente independientes.
9. DIRECT_URL
Cuando no existe TEST_DIRECT_URL, el runner elimina el DIRECT_URL normal. El fallback a TEST_DATABASE_URL exige autorización explícita.
El bloqueante es que TEST_DIRECT_URL solo se valida sintácticamente: no se compara contra TEST_DATABASE_URL, DATABASE_URL ni el DIRECT_URL normal.
10. Runner de tests
No importa Prisma, ejecuta primero el guard, descubre archivos ordenados, evita symlinks y duplicados, falla con cero tests y usa process.execPath con shell:false.
Incluye actualmente tres pruebas de integración y una prueba unitaria. Propaga errores, señales y estados nulos correctamente.
11. Runner Prisma
La allowlist solo transforma deploy y push en argumentos fijos; argumentos adicionales no se pasan. Resuelve el Prisma local y no usa shell.
Su entorno fuerza ambas variables, pero puede forzar un DIRECT_URL productivo si fue colocado por error en TEST_DIRECT_URL.
12. Heurística y allowlist
Rechaza correctamente latest, contest, prod_test_backup y testing-production. Acepta pqrs_test, test_pqrs, qa, ci y sandbox.
La allowlist recorta espacios y puede usar host/base o solo base. ALLOW_ANY_NAME=true omite únicamente esta defensa secundaria; protocolo, confirmación y comparación principal permanecen.
13. Compatibilidad Node
engines.node >=20.6.0 es coherente con node --import. .nvmrc fija Node 20 y la ejecución local se realizó con Node v24.13.0.
La versión configurada en el dashboard de Vercel no puede confirmarse desde el repositorio. El package-lock.json todavía no refleja el nuevo campo engines.
14. Multiplataforma
Los procesos usan argumentos estructurados y shell:false, compatibles con rutas que contienen espacios. La documentación incluye comandos separados para Bash y PowerShell.
15. Pruebas puras
Suite pura oficial: 35/35 aprobadas.
Ejecución directa sin --test: 35/35, confirmando que esta forma sí ejecuta node:test.
Typecheck: aprobado.
Lint: aprobado sin advertencias.
Runner sin configuración: abortó correctamente.
Prisma sin marca en contexto test: abortó antes del cliente.
Operación Prisma desconocida: rechazada.
16. Documentación
[TESTING.md (line 64)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/docs/TESTING.md:64) ya prohíbe Prisma directo y documenta correctamente comandos, CI, PowerShell, prioridad y residuos.
Todavía afirma que ante una equivalencia DNS ambigua el guard falla conservadoramente, pero el código no tiene un estado de “ambiguo”: simplemente considera distintos los hosts que no puede relacionar.
17. Archivos de entorno
.env.test está ignorado y actualmente no existe. .env.test.example es versionable, usa datos ficticios y contiene todas las variables documentadas. No encontré secretos reales.
18. Hallazgos
F0F-01 | Crítica | [resolveTestDirectUrl (line 210)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/src/lib/testing/test-database-safety.ts:210). Acepta un TEST_DIRECT_URL de cualquier destino PostgreSQL. Un error al copiar variables puede hacer que test:db:push modifique producción. El escenario puro devolvió accepted:true y directMatchesTest:false. Debe exigir identidad canónica con TEST_DATABASE_URL y rechazar coincidencias con conexiones normales. Bloquea: Sí.
F0F-02 | Crítica | [isNodeTestContext (line 252)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/src/lib/testing/test-database-safety.ts:252). Ejecutar directamente un .test.ts sin --test no activa la barrera, aunque node:test sí corre sus pruebas. Las integraciones importarían Prisma y usarían .env. Debe detectar entrypoints .test.ts bajo tests/ o exigir un bootstrap verificable en toda integración. Bloquea: Sí.
F0F-03 | Media | [TESTING.md (line 118)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/docs/TESTING.md:118). La afirmación de fallo conservador ante alias DNS no coincide con el código. Debe documentarse como limitación no detectable. Bloquea: No.
F0F-04 | Baja | [canonicalizeDatabaseUrl (line 78)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/src/lib/testing/test-database-safety.ts:78). Una ruta porcentual malformada genera URIError en lugar de TestDatabaseGuardError. Falla cerrado, pero sin manejo uniforme. Bloquea: No.
F0F-05 | Baja | package-lock.json. El paquete raíz no refleja todavía engines.node. Debe sincronizarse antes del commit. Bloquea: No.
19. Riesgos aceptados
No se resuelven alias DNS arbitrarios, un desarrollador con control total puede fabricar variables y una terminación abrupta puede dejar residuos en la base de pruebas. Estos riesgos son aceptables si quedan documentados.
20. Verificación operativa pendiente
Tras corregir los dos bloqueantes, deberá probarse el camino exitoso con una base de pruebas real y confirmar Node compatible en Vercel. No ejecuté npm test, Prisma, migraciones, seeds, build ni conexiones.
21. Recomendación sobre commit
No hacer commit todavía. Después de corregir F0F-01 y F0F-02, deben añadirse pruebas de regresión y repetirse esta aprobación. Al preparar el commit, hay que agregar archivos explícitamente para no incluir accidentalmente los 48 documentos eliminados.
22. Veredicto
REQUIERE CORRECCIONES
La base técnica es buena, pero TEST_DIRECT_URL aún puede dirigir Prisma a producción y una ejecución directa habitual de .test.ts puede omitir la segunda barrera.