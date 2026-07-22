FASE 0E — Informe final
1. Resumen ejecutivo
Se cerraron los 6 bloqueantes confirmados por la revisión independiente, conservando la arquitectura recuperable de la Fase 0C. La lógica se movió a un módulo neutral server-side (src/lib/testing/test-database-safety.ts, sin Prisma) que es fuente única para el runner, la nueva segunda barrera y las pruebas puras. Ahora: la prioridad de variables es sistema > .env.test > .env; se compara un destino canónico (no cadenas); existe una segunda barrera antes de new PrismaClient() que bloquea ejecuciones directas de Node Test; hay comandos Prisma protegidos con allowlist que fuerzan DATABASE_URL y DIRECT_URL de pruebas; la heurística de nombre ya no depende de subcadena /test/i; y la documentación deja de recomendar Prisma directo ambiguo. Verificado: tsc limpio, lint limpio, 35/35 pruebas puras, runner abortando y barrera bloqueando, todo sin tocar la BD.

2. Diagnóstico de los bloqueantes
F0D-04 (prioridad): dos dotenv.config({override:false}) daban prioridad sistema > .env > .env.test, ocultando .env.test. Confirmado.
F0D-01 (comparación): el guard comparaba cadenas recortadas; misma base con distinta credencial/puerto/case/query/pooler evadía la detección. Confirmado.
F0D-03 (bypass): el runner era la única barrera; npx tsx --test archivo, IDE, etc., creaban Prisma sin pasar por el guard. Confirmado.
F0D-02 (Prisma directo): docs/TESTING.md recomendaba prisma migrate deploy/db push "apuntando a TEST_DATABASE_URL", variable que Prisma no lee → podía tocar la base normal vía DATABASE_URL/DIRECT_URL. Confirmado.
Bloqueante 4 (DIRECT_URL): el runner reemplazaba DATABASE_URL pero heredaba DIRECT_URL normal. Confirmado.
Bloqueante 6 (heurística): /test/i aceptaba latest/contest/prod_test_backup. Confirmado.
3. Diseño corregido
Módulo puro compartido con: canonicalización de destinos, sameDatabaseTarget (incluye ref de proyecto Supabase pooler↔directo), looksLikeTestDatabase (componentes/afijos + allowlist), mergeEnvSources (prioridad correcta), validateTestDatabaseConfig (núcleo sin comparación prod), assertSafeTestDatabase (núcleo + "difiere de DATABASE_URL", para el runner) y evaluatePrismaClientAccess (segunda barrera: exige coincidencia canónica DATABASE_URL === TEST dentro del proceso hijo). El runner y el runner de Prisma consumen el mismo módulo; src/lib/prisma.ts invoca la barrera antes de instanciar el cliente.

4. Archivos modificados
Nuevos: src/lib/testing/test-database-safety.ts, scripts/run-tests.ts (reescrito), scripts/run-test-prisma.ts, tests/unit/test-database-safety.test.ts, .env.test.example (actualizado), .nvmrc, docs/TESTING.md (reescrito).
Modificados versionados: src/lib/prisma.ts (solo la barrera, +16 líneas), package.json (2 scripts + engines), .gitignore (ya ignoraba .env.test).
Eliminados (mis propios archivos 0C, sin trackear): tests/helpers/test-database-guard.ts, tests/unit/test-database-guard.test.ts.
No tocados: negocio, migraciones, schema, documentos borrados previos, docs/programa-mejora/.
5. Resolución y prioridad de variables
El runner parsea .env y .env.test con dotenv.parse (no muta process.env) y combina con mergeEnvSources(envFile, envTestFile, process.env) → sistema > .env.test > .env. El objeto resuelto se pasa explícito al guard y al entorno del hijo. Probado con 4 casos puros (sistema>test, test>env, env fallback, ausencia de .env.test).

6. Canonicalización de destinos
canonicalizeDatabaseUrl produce identidad postgresql://host:puerto/base (protocolo normalizado, host minúsculas, puerto 5432 implícito=explícito, base decodificada, sin credenciales ni query). sameDatabaseTarget iguala por canónico o por ref de proyecto Supabase (extraída de db.<ref>.supabase.co o del usuario postgres.<ref> en *.pooler.supabase.com) → detecta pooler↔directo. No puede probar equivalencia de alias DNS arbitrarios sin conectarse; ante ambigüedad, falla con mensaje seguro (documentado). Solo protocolos postgres:/postgresql:.

7. Segunda barrera de Prisma
En src/lib/prisma.ts, antes de new PrismaClient(). isNodeTestContext combina señales (--test en execArgv/argv, NODE_ENV=test, marca del runner). Fuera de contexto de test → allow (runtime normal intacto). En contexto de test exige: (a) marca del runner, (b) config nuclear válida revalidada, (c) DATABASE_URL coincide canónicamente con TEST_DATABASE_URL. La marca por sí sola no basta. Verificado en vivo: NODE_ENV=test sin marca → bloqueo antes de conectar.

8. Manejo de DIRECT_URL
Prisma Client usa DATABASE_URL para queries; DIRECT_URL es para migraciones. Suite normal (npm test): el hijo elimina DIRECT_URL (o lo pone en TEST_DIRECT_URL si existe) → ningún DIRECT_URL normal se hereda. Comandos Prisma de test: resolveTestDirectUrl exige TEST_DIRECT_URL, con fallback a TEST_DATABASE_URL solo si ALLOW_TEST_DIRECT_URL_FALLBACK=true (documentado).

9. Comandos protegidos de Prisma
scripts/run-test-prisma.ts con allowlist estricta { deploy: migrate deploy, push: db push } → npm run test:db:deploy / test:db:push. Resuelve variables con la misma prioridad, corre el guard, fuerza DATABASE_URL+DIRECT_URL de test y planta la marca. Resuelve el binario de Prisma vía createRequire (sin .cmd/shell), spawnSync con process.execPath, propaga errores/señales/exit code. Rechaza cualquier operación fuera de la allowlist.

10. Heurística o allowlist
Sin /test/i. Acepta: nombres exactos (test, tests, testing, qa, ci, sandbox, e2e) o afijos delimitados por _/- (prefijo/sufijo). Rechaza latest, contest, prod_test_backup, testing-production (todos con test puro). TEST_DATABASE_ALLOWED_TARGETS (allowlist explícita host/base o base) tiene prioridad y la reemplaza. TEST_DATABASE_ALLOW_ANY_NAME=true se conserva pero marcado como bypass deliberado de una defensa secundaria.

11. Compatibilidad Node
engines.node: ">=20.6.0" en package.json (el runner usa node --import y readdirSync) y .nvmrc con 20 (LTS). Se declaró una LTS, no la 24 local.

12. Compatibilidad multiplataforma
spawnSync(process.execPath, [...], { shell:false }) con args en array (sin globs de shell ni .cmd). Descubrimiento vía readdirSync recursivo manual, ordenado, dedupe, sin seguir symlinks. Documentación con cp (Bash) y Copy-Item (PowerShell).

13. Pruebas puras
tests/unit/test-database-safety.test.ts — 35 casos sin Prisma/conexión: prioridad de variables (4), canonicalización (protocolos, case, puerto, query, contraseñas, bases distintas, inválida, decodificada, Supabase pooler↔directo), igualdad canónica con DATABASE_URL, heurística/allowlist (rechaza latest/contest/prod_test_backup/testing-production; acepta patrón), DIRECT_URL (con/ sin fallback), segunda barrera (prod no activa, test sin marca falla, marca+inseguro falla, seguro permite, DATABASE_URL no coincide falla), y protección de secretos (contraseña/usuario/URL/query nunca en mensajes).

14. Comandos ejecutados
git status/git diff; npx tsc --noEmit; npm run lint; npx tsx --test tests/unit/test-database-safety.test.ts; runner con TEST_DATABASE_URL ausente (abort garantizado); barrera con NODE_ENV=test sin marca (bloqueo garantizado antes de Prisma); git check-ignore.

15. Resultados
tsc --noEmit: 0 errores.
lint: 0 warnings/errores.
Pruebas puras: 35/35 (~0.76s).
Runner sin config: exit 1, sin spawnear ni conectar.
Barrera en test sin marca: bloqueo antes de new PrismaClient(), exit 0 del verificador (error capturado), sin conexión.
16. Validaciones no realizadas
npm test completo, test:db:*, Prisma, build, migraciones, seeds, servidor, conexiones — prohibidos.
Camino de éxito real del runner y de la barrera permitiendo Prisma (requiere .env.test + base de pruebas viva) — validación pendiente para quien tenga el entorno.
17. Diff resumido

package.json       | + test:db:deploy, test:db:push, engines.node ">=20.6.0"
.gitignore         | (ya ignora .env.test)
src/lib/prisma.ts  | + segunda barrera (evaluatePrismaClientAccess) antes de new PrismaClient()
+ src/lib/testing/test-database-safety.ts   (modulo compartido puro)
+ scripts/run-tests.ts                       (reescrito: prioridad, discovery, marca, DIRECT_URL)
+ scripts/run-test-prisma.ts                 (runner Prisma protegido, allowlist)
+ tests/unit/test-database-safety.test.ts    (35 pruebas puras)
+ .env.test.example                          (TEST_DIRECT_URL, allowlist, prioridad)
+ .nvmrc                                      (20)
+ docs/TESTING.md                            (reescrito)
- tests/helpers/test-database-guard.ts        (movido a src/lib/testing)
- tests/unit/test-database-guard.test.ts      (reemplazado)
18. Riesgos restantes
engines.node ">=20.6.0": si el despliegue (Vercel) estuviera fijado a Node 18, podría advertir/fallar. No pude inspeccionar el dashboard de Vercel; vercel.json no fija versión. Node 18 está EOL en este marco temporal, riesgo bajo — verificar la config de Vercel.
Canonicalización: no detecta alias DNS arbitrarios ni hosts equivalentes por rutas distintas sin conectarse (documentado; falla conservador ante ambigüedad).
Bypass documentado: TEST_DATABASE_ALLOW_ANY_NAME=true y ALLOW_TEST_DIRECT_URL_FALLBACK=true siguen existiendo como escapes deliberados.
Terminación abrupta: SIGKILL antes de after() deja residuos etiquetados en la base de pruebas (documentado).
Ejecución artesanal maliciosa: alguien con acceso al código puede plantar la marca y simular todo; el objetivo es impedir bypasses accidentales/habituales, no un atacante interno.
19. Respuesta individual a cada hallazgo F0D
F0D-01 (Crítica, URLs equivalentes) → Corregido: comparación por destino canónico + ref de proyecto Supabase. Cubierto por pruebas.
F0D-02 (Crítica, Prisma directo) → Corregido: comandos test:db:* protegidos que fuerzan DATABASE_URL+DIRECT_URL de test; doc prohíbe Prisma directo.
F0D-03 (Alta, bypass IDE/directo) → Corregido: segunda barrera antes de new PrismaClient() que bloquea contexto de test sin marca del runner. Verificado en vivo.
F0D-04 (Alta, prioridad .env.test) → Corregido: mergeEnvSources con prioridad sistema > .env.test > .env. Cubierto por pruebas.
F0D-05 (Media, versión Node) → Corregido: engines.node ">=20.6.0" + .nvmrc.
F0D-06 (Baja, orden/cp) → Corregido: discovery ordenado/dedupe/sin symlinks; doc con cp y Copy-Item.
20. Estado
CORREGIDO CON RIESGOS.

Los 17 criterios de aceptación se cumplen en código y quedan verificados con tsc/lint/35 pruebas puras y las dos barreras demostradas en vivo. El único "con riesgos" es externo y no bloqueante: confirmar que el despliegue de Vercel corre Node ≥20.6 antes de fijar engines. No se ejecutó ninguna conexión ni npm test; no se hizo commit. Me detengo aquí.