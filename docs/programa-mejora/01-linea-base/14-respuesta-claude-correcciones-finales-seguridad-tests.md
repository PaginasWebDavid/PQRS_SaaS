FASE 0G — Informe final
1. Resumen ejecutivo
Se cerraron los dos bloqueantes (F0F-01, F0F-02) y los tres hallazgos menores (F0F-03/04/05) sin rediseñar el sistema. TEST_DIRECT_URL ahora valida identidad canónica contra TEST_DATABASE_URL y contra las conexiones normales (no solo sintaxis); la segunda barrera detecta ejecuciones directas de .test.ts sin --test mediante el entrypoint, y la marca del runner dejó de contar como señal de contexto; el percent-encoding inválido produce error controlado; la doc corrige la afirmación DNS; y package-lock.json sincroniza engines. Verificado: tsc limpio, lint limpio, 62/62 pruebas puras, y tres escenarios de aborto demostrados en vivo sin tocar la BD.

2. Confirmación de los hallazgos
F0F-01: resolveTestDirectUrl solo llamaba canonicalizeDatabaseUrl(safe.testDirectUrl) y devolvía — sin comparar identidad. Confirmado en código.
F0F-02: isNodeTestContext detectaba --test/NODE_ENV=test/marca, pero no el entrypoint; npx tsx tests/x.test.ts (sin --test) no se detectaba y node:test corría igual. Confirmado y reproducido (verificación 2). Además la marca era una de las señales de contexto.
F0F-03: doc afirmaba "falla conservadoramente" ante DNS ambiguo; el código solo los trata como distintos. Confirmado.
F0F-04: %ZZ producía URIError en canonicalizeDatabaseUrl. Confirmado.
F0F-05: packages[""] del lockfile no reflejaba engines. Confirmado.
3. Diseño aplicado
Todo en el módulo compartido src/lib/testing/test-database-safety.ts (sigue puro, sin Prisma). resolveTestDirectUrl recibe safe + env y compara con las funciones canónicas ya existentes (sameDatabaseTarget, con ref de proyecto Supabase). Detección de contexto separada de la marca; nueva isTestEntrypoint. La barrera (evaluatePrismaClientAccess) exige simultáneamente contexto independiente + marca + config segura + coincidencia canónica DATABASE_URL↔TEST_DATABASE_URL.

4. Archivos modificados
src/lib/testing/test-database-safety.ts (percent-encoding, resolveTestDirectUrl con identidad, isTestEntrypoint, isNodeTestContext sin marca).
scripts/run-test-prisma.ts (nuevo retorno {directUrl, usedFallback}).
tests/unit/test-database-safety.test.ts (35 → 62 casos).
docs/TESTING.md (DNS, barrera, fila TEST_DIRECT_URL, nota de seed).
package.json ya tenía engines; package-lock.json (solo engines en la raíz).
No tocados: negocio, schema, migraciones, seed, prisma.ts (la barrera ya pasaba argv, sin cambios), documentos borrados, docs/programa-mejora/.
5. Validación de TEST_DIRECT_URL
Cuando existe: (1) protocolo/URL válidos; (2) mismo destino que TEST_DATABASE_URL (misma base o mismo proyecto Supabase pooler↔directo); (3) rechazo si coincide con DATABASE_URL o DIRECT_URL normales; (4) rechazo si es otro proyecto Supabase o base distinta. Comparación con funciones canónicas, nunca literal. Sin TEST_DIRECT_URL: solo fallback a TEST_DATABASE_URL con ALLOW_TEST_DIRECT_URL_FALLBACK=true, marcado en el resultado (usedFallback). Nunca hereda el DIRECT_URL normal. Mensajes sin credenciales/URL/query.

6. Detección de entrypoints de test
isTestEntrypoint(argv[1]) evalúa solo el nombre base del entrypoint contra /\.test\.(ts|tsx|js|mjs|cjs)$/, con separadores / y \. Detecta tests/x.test.ts, anidados, Windows y las 5 extensiones. No detecta latest/example.ts, contest/example.ts, src/mytest.ts, ni un .test.ts que sea argumento secundario (no entrypoint).

7. Independencia entre contexto y marca
isNodeTestContext ya no considera la marca. Contexto = --test (execArgv/argv) ∨ NODE_ENV=test ∨ entrypoint .test.*. La barrera, tras confirmar contexto independiente, exige además la marca. Caso probado: marca presente sin contexto → testContext=false, no activa la barrera como test.

8. Percent-encoding
canonicalizeDatabaseUrl envuelve decodeURIComponent en try/catch y lanza TestDatabaseGuardError con el mismo mensaje uniforme ("La URL de conexion no es valida"), sin exponer la URL. Cubierto por prueba pura.

9. Documentación DNS
docs/TESTING.md ahora dice explícitamente que hostnames distintos que apunten al mismo servidor (alias/CNAME/IP vs. nombre) se tratan como destinos diferentes, que no hay estado "ambiguo" ni "falla conservadora", y que para hosts personalizados/alias debe usarse TEST_DATABASE_ALLOWED_TARGETS (allowlist exacta).

10. Sincronización de package-lock.json
Se añadió únicamente "engines": { "node": ">=20.6.0" } a packages[""], coincidiendo con package.json. Diff confirmado: solo ese bloque; ninguna versión, integridad ni dependencia alterada. JSON validado.

11. Pruebas añadidas
De 35 a 62 casos: 13 de TEST_DIRECT_URL (idéntico, Supabase pooler↔directo, proyectos distintos, bases distintas, coincide con DIRECT_URL/DATABASE_URL normal, credenciales/query distintas permitidas, protocolo no-PG, URL inválida, sin fallback, con fallback, sin fuga de secretos); 15 de detección (los 3 flags/env, entrypoints POSIX/Windows/anidado/extensiones, no-detección de latest/contest/secundario, marca sin contexto, directo sin marca bloqueado, con marca+inseguro bloqueado, oficial permitido); 1 de percent-encoding.

12. Comandos ejecutados
git status/git diff; npx tsc --noEmit; npm run lint; npx tsx --test tests/unit/test-database-safety.test.ts; runner sin TEST_DATABASE_URL (abort); barrera con entrypoint .test.ts sin marca (bloqueo antes de Prisma); runner Prisma con operación desconocida (rechazo); validación JSON del lockfile.

13. Resultados
tsc --noEmit: 0 errores.
lint: 0 warnings/errores.
Pruebas puras: 62/62.
Runner sin config: exit 1 antes de spawnear/conectar.
Entrypoint .test.ts sin marca: bloqueo antes de new PrismaClient() (sin --test), sin conexión.
Runner Prisma con bogus-op: exit 1 antes de resolver conexión.
14. Validaciones no realizadas
npm test, test:db:deploy/push, Prisma, build, migraciones, seeds, servidor, conexiones — prohibidos. Camino de éxito real (runner permitiendo Prisma contra base viva) y confirmación de Node en Vercel — pendientes para quien tenga el entorno.

15. Diff resumido

src/lib/testing/test-database-safety.ts | percent-encoding controlado; resolveTestDirectUrl con
                                        | identidad canonica (+ ResolvedTestDirectUrl); isTestEntrypoint;
                                        | isNodeTestContext sin marca, con entrypoint
scripts/run-test-prisma.ts              | usa resolveTestDirectUrl().directUrl + aviso de fallback
tests/unit/test-database-safety.test.ts | 35 -> 62 casos (DIRECT_URL, deteccion, percent-encoding)
docs/TESTING.md                         | DNS preciso; barrera con entrypoint; TEST_DIRECT_URL; seed
package-lock.json                       | + engines.node ">=20.6.0" en packages[""] (solo eso)
16. Riesgos restantes
Alias DNS arbitrarios: no detectables sin conectarse; mitigación documentada (allowlist exacta). Riesgo aceptado.
engines.node ">=20.6.0": verificar que Vercel corra Node ≥20.6 (no inspeccionable desde el repo).
Bypass deliberados: TEST_DATABASE_ALLOW_ANY_NAME y ALLOW_TEST_DIRECT_URL_FALLBACK siguen como escapes explícitos.
Terminación abrupta: residuos etiquetados en la base de pruebas (documentado).
Desarrollador con control total: puede fabricar variables/marca; objetivo es impedir bypasses accidentales, no un atacante interno.
17. Respuesta individual F0F-01…F0F-05
F0F-01 (Crítica) → Corregido: TEST_DIRECT_URL exige identidad canónica con TEST_DATABASE_URL y rechaza coincidencia con conexiones normales; soporta Supabase pooler↔directo. 13 pruebas.
F0F-02 (Crítica) → Corregido: detección por entrypoint .test.* (cubre ejecución directa sin --test); marca separada del contexto. Demostrado en vivo. 15 pruebas.
F0F-03 (Media) → Corregido: doc describe la limitación DNS con precisión.
F0F-04 (Baja) → Corregido: percent-encoding inválido → TestDatabaseGuardError uniforme. 1 prueba.
F0F-05 (Baja) → Corregido: engines.node sincronizado en el lockfile sin tocar dependencias.
18. Estado
CORREGIDO.

Los 17 criterios de aceptación se cumplen y quedan verificados con tsc/lint/62 pruebas puras y tres escenarios de aborto demostrados sin conexión. Los riesgos restantes son aceptados y documentados. No se ejecutó ninguna conexión, npm test, Prisma, build ni migraciones; no se hizo commit. Me detengo aquí.