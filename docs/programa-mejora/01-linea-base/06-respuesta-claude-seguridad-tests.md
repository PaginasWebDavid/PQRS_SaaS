FASE 0C — Informe final
1. Resumen ejecutivo
Se blindó técnicamente la suite de pruebas para que no pueda ejecutarse contra la base normal ni producción. npm test ahora pasa por un runner central (scripts/run-tests.ts) que ejecuta un guard puro antes de crear cualquier cliente Prisma. El guard exige TEST_DATABASE_URL separada, distinta de DATABASE_URL, con confirmación explícita ALLOW_TEST_DATABASE_MUTATION=true, y aborta con código 1 y mensajes sin credenciales si algo es inseguro. Solo si aprueba, lanza la suite forzando DATABASE_URL = TEST_DATABASE_URL. No se tocó ningún módulo de negocio. Verificado: tsc limpio, lint limpio, 12/12 pruebas puras del guard, y el runner abortando correctamente en el guard sin tocar la BD.

2. Riesgo original
npm test usaba tsx --test tests/**/*.test.ts; los tests importan src/lib/prisma, que crea new PrismaClient() leyendo DATABASE_URL. Sin TEST_DATABASE_URL obligatoria ni separación, ejecutar la suite con la DATABASE_URL normal/producción crea y borra datos reales (los after() hacen deleteMany scoped, pero la ejecución en sí ya escribe/borra en esa base).

3. Diseño elegido
Guard puro (tests/helpers/test-database-guard.ts): función assertSafeTestDatabase(env) sin Prisma/IO. Valida presencia, diferencia con DATABASE_URL, confirmación de mutación, URL válida y que la base "parezca" de pruebas. Mensajes solo muestran host/nombre_de_base (nunca usuario/contraseña/URL completa).
Runner central (scripts/run-tests.ts, ejecutado por tsx): carga .env + .env.test, corre el guard, aborta con exit 1 si falla, y si aprueba lanza node --import tsx --test <archivos> con DATABASE_URL reemplazada por la de test. Síncrono (spawnSync, stdio: inherit) → propaga exit code trivialmente y funciona igual en Windows/Linux/macOS (invoca process.execPath, sin shell ni globs ni rutas .cmd).
Punto de override clave: src/lib/prisma.ts construye el cliente al importarse; como el hijo recibe DATABASE_URL ya = test antes de ese import, y el import "dotenv/config" de los tests no sobrescribe variables ya definidas, Prisma solo puede apuntar a la base de test.
4. Alternativas descartadas
--import preload en el propio script npm (tsx --import setup.ts --test ...): más frágil respecto al forwarding de flags de tsx a Node y menos explícito para propagar exit codes / mensajes; un runner dedicado es lo que pedía el encargo.
Chequeo dentro de cada archivo de test: descartado explícitamente por el requisito — no garantiza un punto central obligatorio.
Override de datasource vía new PrismaClient({ datasources }) en prisma.ts: tocaría un módulo compartido con producción; se prefirió no modificar prisma.ts y sobrescribir DATABASE_URL solo en el entorno del proceso hijo de test.
Reescribir la limpieza de los 3 tests: descartado — ya está correctamente acotada por identificadores RUN únicos y hooks after(); reescribir arriesgaba cambiar lógica de test sin beneficio.
5. Archivos modificados
Nuevos: tests/helpers/test-database-guard.ts, scripts/run-tests.ts, tests/unit/test-database-guard.test.ts, .env.test.example, docs/TESTING.md.
Modificados: package.json ("test": "tsx scripts/run-tests.ts"), .gitignore (ignora .env.test).
No tocados: los ~45 docs/* borrados previos, docs/programa-mejora/, y todo módulo de negocio.
6. Funcionamiento del runner
Carga .env y .env.test (sin override, CI-friendly) → guard → si falla imprime [test-guard] … y exit(1) (nunca spawnea, nunca conecta) → si aprueba enumera tests/**/*.test.ts con readdirSync(recursive) → spawnSync(node, ['--import','tsx','--test',...archivos], { env: { ...env, NODE_ENV:'test', DATABASE_URL: testUrl }}) → exit(status).

7. Funcionamiento del guard
Orden de checks: (1) TEST_DATABASE_URL presente/no vacía → (2) distinta de DATABASE_URL → (3) ALLOW_TEST_DATABASE_MUTATION === "true" → (4) URL parseable → (5) host/nombre contiene test salvo TEST_DATABASE_ALLOW_ANY_NAME=true. Lanza TestDatabaseGuardError con mensaje seguro; describeDatabaseTarget reduce cualquier URL a host/base.

8. Manejo de variables
TEST_DATABASE_URL (obligatoria), ALLOW_TEST_DATABASE_MUTATION=true (obligatoria), TEST_DATABASE_ALLOW_ANY_NAME (opcional). Producción/dev/build siguen usando DATABASE_URL sin cambios — el reemplazo solo ocurre en el proceso hijo de test. .env.test está en .gitignore (verificado: ignorado); .env.test.example es trackeable (verificado) y solo tiene valores ficticios.
9. Cambios en limpieza de datos
Ninguno en código. Se confirmó (sin ejecutar) que los 3 archivos usan identificadores RUN/RUN_ID únicos por corrida, borran solo por tenantId in [...] / email contains RUN / id in [...], sin ningún deleteMany({}) global ni borrado por coincidencia amplia, dentro de hooks after(). La limitación ante terminación abrupta (SIGKILL) quedó documentada en docs/TESTING.md.

10. Pruebas puras añadidas
tests/unit/test-database-guard.test.ts (12 casos, sin Prisma/conexión/credenciales): falta/vacía TEST_DATABASE_URL, igual a DATABASE_URL, falta confirmación de mutación, valor de confirmación no exacto, URL inválida, base no-test sin override, override válido, config válida, nombre con test, no-exposición de contraseña/URL completa, y describeDatabaseTarget.

11. Comandos ejecutados
git status (inspección inicial y final)
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/test-database-guard.test.ts (pruebas puras, sin BD)
env -u TEST_DATABASE_URL -u ALLOW_TEST_DATABASE_MUTATION npx tsx scripts/run-tests.ts (demostración de abort del guard, sin BD)
git check-ignore de .env.test / .env.test.example
12. Resultados
tsc --noEmit: 0 errores.
lint: 0 warnings/errors.
Pruebas puras del guard: 12/12 pasan (~0.6s).
Runner sin TEST_DATABASE_URL: exit 1, mensaje Falta la variable TEST_DATABASE_URL…, sin spawnear la suite ni conectar a Prisma.
.env.test → ignorado; .env.test.example → trackeable.
13. Validaciones no ejecutadas
npm test completo (prohibido — conectaría a la BD).
Camino "éxito" del runner (spawnear la suite real) — requeriría .env.test con BD de pruebas viva; no ejecutado por la prohibición de conectar a BD. Validación pendiente para quien tenga una base de pruebas configurada.
build/prisma generate/comandos de BD — no ejecutados.
14. Diff resumido

package.json   | "test": "tsx --test tests/**/*.test.ts"  →  "tsx scripts/run-tests.ts"
.gitignore     | + .env.test  (bajo "local env files")
+ tests/helpers/test-database-guard.ts     (guard puro, ~110 líneas)
+ scripts/run-tests.ts                     (runner central, ~70 líneas)
+ tests/unit/test-database-guard.test.ts   (12 pruebas puras)
+ .env.test.example                        (plantilla, valores ficticios)
+ docs/TESTING.md                          (documentación)
15. Riesgos restantes
Esquema de la base de test: el runner no aplica migraciones; el desarrollador debe aplicar el esquema a TEST_DATABASE_URL (documentado). Si la base de test está vacía, los tests fallarán por tablas ausentes (falla segura, no contamina producción).
Override deliberado: TEST_DATABASE_ALLOW_ANY_NAME=true puede desactivar la heurística de nombre; es una vía consciente, no accidental (requiere editar .env.test).
Terminación abrupta: SIGKILL antes de after() puede dejar residuos etiquetados con RUN en la base de test (documentado, no afecta datos reales).
La comparación TEST_DATABASE_URL !== DATABASE_URL es exacta; dos URLs equivalentes escritas distinto (p. ej. distinto orden de query params) no se detectarían como iguales — mitigado por el check adicional de nombre y la separación explícita de bases.
16. Instrucciones para configurar .env.test
Crea una base PostgreSQL dedicada a pruebas (idealmente con test en el nombre, p. ej. pqrs_test), distinta de la normal.
cp .env.test.example .env.test.
Edita .env.test: pon tu TEST_DATABASE_URL real de pruebas y deja ALLOW_TEST_DATABASE_MUTATION=true.
Aplica el esquema de Prisma a esa base apuntando a TEST_DATABASE_URL (con tus herramientas Prisma habituales).
npm test.
17. Estado
IMPLEMENTADO.

Los criterios de aceptación 1–12 se cumplen; el único punto no verificable en esta sesión (camino de éxito real del runner contra una BD de pruebas viva) queda como validación pendiente por la prohibición explícita de conectarse a bases de datos, no por una carencia de la implementación. No se hizo commit. Me detengo aquí según lo indicado.