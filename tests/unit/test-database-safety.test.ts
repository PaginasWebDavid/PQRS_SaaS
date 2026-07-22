// Pruebas PURAS del sistema de seguridad del entorno de pruebas.
//
// No importan Prisma, no abren conexiones y no leen credenciales reales ni
// process.env: cada caso pasa objetos explicitos. Pueden ejecutarse aisladas con
//   npx tsx --test tests/unit/test-database-safety.test.ts
// sin activar el runner que conecta a la base de datos.

import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeTestDatabase,
  canonicalizeDatabaseUrl,
  describeDatabaseTarget,
  evaluatePrismaClientAccess,
  isNodeTestContext,
  isTestEntrypoint,
  looksLikeTestDatabase,
  mergeEnvSources,
  resolveTestDirectUrl,
  sameDatabaseTarget,
  TestDatabaseGuardError,
  type SafeTestDatabase,
  type TestDatabaseGuardEnv,
} from "../../src/lib/testing/test-database-safety";

const PROD_URL = "postgresql://prod_user:supersecretpassword@prod-db.internal:6543/postgres?sslmode=require";
const TEST_URL = "postgresql://test_user:testpassword@localhost:5432/pqrs_test";

function baseValidEnv(): TestDatabaseGuardEnv {
  return {
    DATABASE_URL: PROD_URL,
    TEST_DATABASE_URL: TEST_URL,
    ALLOW_TEST_DATABASE_MUTATION: "true",
  };
}

// --- Guard basico -----------------------------------------------------------

test("guard: falla cuando falta TEST_DATABASE_URL", () => {
  const env = baseValidEnv();
  delete env.TEST_DATABASE_URL;
  assert.throws(() => assertSafeTestDatabase(env), TestDatabaseGuardError);
});

test("guard: falla cuando TEST_DATABASE_URL esta vacia o son espacios", () => {
  const env = baseValidEnv();
  env.TEST_DATABASE_URL = "   ";
  assert.throws(() => assertSafeTestDatabase(env), TestDatabaseGuardError);
});

test("guard: falla sin ALLOW_TEST_DATABASE_MUTATION=true", () => {
  const env = baseValidEnv();
  delete env.ALLOW_TEST_DATABASE_MUTATION;
  assert.throws(() => assertSafeTestDatabase(env), (error: unknown) => {
    assert.match((error as Error).message, /ALLOW_TEST_DATABASE_MUTATION/);
    return true;
  });
});

test("guard: aprueba una configuracion valida y devuelve la URL de pruebas", () => {
  const result = assertSafeTestDatabase(baseValidEnv());
  assert.equal(result.testDatabaseUrl, TEST_URL);
  assert.equal(result.target.database, "pqrs_test");
});

// --- Canonicalizacion -------------------------------------------------------

test("canon: postgres:// y postgresql:// son equivalentes", () => {
  const a = canonicalizeDatabaseUrl("postgres://u:p@host:5432/db");
  const b = canonicalizeDatabaseUrl("postgresql://u:p@host:5432/db");
  assert.equal(a.canonical, b.canonical);
  assert.ok(sameDatabaseTarget(a, b));
});

test("canon: host en distinta capitalizacion es el mismo destino", () => {
  const a = canonicalizeDatabaseUrl("postgresql://u:p@HOST.Example.COM:5432/db");
  const b = canonicalizeDatabaseUrl("postgresql://u:p@host.example.com:5432/db");
  assert.ok(sameDatabaseTarget(a, b));
});

test("canon: puerto 5432 implicito vs explicito es el mismo destino", () => {
  const a = canonicalizeDatabaseUrl("postgresql://u:p@host/db");
  const b = canonicalizeDatabaseUrl("postgresql://u:p@host:5432/db");
  assert.ok(sameDatabaseTarget(a, b));
});

test("canon: distinto orden de query parameters es el mismo destino", () => {
  const a = canonicalizeDatabaseUrl("postgresql://u:p@host:5432/db?sslmode=require&pgbouncer=true");
  const b = canonicalizeDatabaseUrl("postgresql://u:p@host:5432/db?pgbouncer=true&sslmode=require");
  assert.ok(sameDatabaseTarget(a, b));
});

test("canon: distintas contraseñas hacia el mismo destino son el mismo destino", () => {
  const a = canonicalizeDatabaseUrl("postgresql://u:PASS_A@host:5432/db");
  const b = canonicalizeDatabaseUrl("postgresql://u:PASS_B@host:5432/db");
  assert.ok(sameDatabaseTarget(a, b));
});

test("canon: bases realmente diferentes NO son el mismo destino", () => {
  const a = canonicalizeDatabaseUrl("postgresql://u:p@host:5432/db_a");
  const b = canonicalizeDatabaseUrl("postgresql://u:p@host:5432/db_b");
  assert.equal(sameDatabaseTarget(a, b), false);
});

test("canon: rechaza protocolos que no son PostgreSQL", () => {
  assert.throws(() => canonicalizeDatabaseUrl("mysql://u:p@host:3306/db"), (error: unknown) => {
    assert.ok(error instanceof TestDatabaseGuardError);
    assert.match((error as Error).message, /Protocolo no permitido/);
    return true;
  });
});

test("canon: rechaza una URL invalida", () => {
  assert.throws(() => canonicalizeDatabaseUrl("no-es-una-url"), TestDatabaseGuardError);
});

test("canon: decodifica el nombre de base porcentual", () => {
  const target = canonicalizeDatabaseUrl("postgresql://u:p@host:5432/pqrs%5Ftest");
  assert.equal(target.database, "pqrs_test");
});

test("canon: pooler y conexion directa de Supabase se detectan como el mismo proyecto", () => {
  const direct = canonicalizeDatabaseUrl("postgresql://postgres:pw@db.abcdef123456.supabase.co:5432/postgres");
  const pooled = canonicalizeDatabaseUrl(
    "postgresql://postgres.abcdef123456:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  );
  assert.equal(direct.projectRef, "abcdef123456");
  assert.equal(pooled.projectRef, "abcdef123456");
  assert.ok(sameDatabaseTarget(direct, pooled));
});

test("guard: rechaza cuando el destino canonico coincide con DATABASE_URL", () => {
  const env = baseValidEnv();
  // Base con nombre de pruebas (pasa la defensa de nombre) pero mismo destino
  // canonico que DATABASE_URL, solo cambiando credenciales y query.
  env.DATABASE_URL = "postgresql://user_a:pass_a@shared-host:5432/pqrs_test";
  env.TEST_DATABASE_URL = "postgresql://user_b:pass_b@shared-host:5432/pqrs_test?sslmode=require&x=1";
  assert.throws(() => assertSafeTestDatabase(env), (error: unknown) => {
    assert.match((error as Error).message, /mismo destino que DATABASE_URL/i);
    return true;
  });
});

// --- Heuristica / allowlist -------------------------------------------------

const NO_ENV: TestDatabaseGuardEnv = {};

test("heuristica: NO acepta 'latest'", () => {
  assert.equal(looksLikeTestDatabase("latest", "host", NO_ENV), false);
});

test("heuristica: NO acepta 'contest'", () => {
  assert.equal(looksLikeTestDatabase("contest", "host", NO_ENV), false);
});

test("heuristica: NO acepta 'prod_test_backup' como prueba suficiente", () => {
  assert.equal(looksLikeTestDatabase("prod_test_backup", "host", NO_ENV), false);
});

test("heuristica: NO acepta 'testing-production'", () => {
  assert.equal(looksLikeTestDatabase("testing-production", "host", NO_ENV), false);
});

test("heuristica: acepta sufijo delimitado (pqrs_test) y nombres exactos (qa, sandbox)", () => {
  assert.equal(looksLikeTestDatabase("pqrs_test", "host", NO_ENV), true);
  assert.equal(looksLikeTestDatabase("qa", "host", NO_ENV), true);
  assert.equal(looksLikeTestDatabase("sandbox", "host", NO_ENV), true);
  assert.equal(looksLikeTestDatabase("test_pqrs", "host", NO_ENV), true);
});

test("allowlist: TEST_DATABASE_ALLOWED_TARGETS acepta destino exacto y rechaza el resto", () => {
  const env: TestDatabaseGuardEnv = { TEST_DATABASE_ALLOWED_TARGETS: "myhost/qa_main" };
  assert.equal(looksLikeTestDatabase("qa_main", "myhost", env), true);
  assert.equal(looksLikeTestDatabase("qa_main", "otrohost", env), false);
  assert.equal(looksLikeTestDatabase("otra", "myhost", env), false);
});

test("bypass: TEST_DATABASE_ALLOW_ANY_NAME=true omite la defensa secundaria", () => {
  const env = baseValidEnv();
  env.TEST_DATABASE_URL = "postgresql://u:p@localhost:5432/cualquiera";
  assert.throws(() => assertSafeTestDatabase(env), TestDatabaseGuardError);
  env.TEST_DATABASE_ALLOW_ANY_NAME = "true";
  assert.equal(assertSafeTestDatabase(env).target.database, "cualquiera");
});

// --- DIRECT_URL de pruebas: identidad segura --------------------------------

// Construye un SafeTestDatabase a partir de una TEST_DATABASE_URL (para probar
// resolveTestDirectUrl de forma aislada del guard exterior).
function safeFor(testUrl: string, testDirectUrl?: string): SafeTestDatabase {
  return { testDatabaseUrl: testUrl, testDirectUrl, target: canonicalizeDatabaseUrl(testUrl) };
}

test("direct 1: TEST_DIRECT_URL identico al destino de pruebas: permitido", () => {
  const safe = safeFor(TEST_URL, TEST_URL);
  const resolved = resolveTestDirectUrl(safe, {});
  assert.equal(resolved.directUrl, TEST_URL);
  assert.equal(resolved.usedFallback, false);
});

test("direct 2: pooler y directo del mismo proyecto Supabase: permitido", () => {
  const pooler = "postgresql://postgres.abcdef123456:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
  const direct = "postgresql://postgres:pw@db.abcdef123456.supabase.co:5432/postgres";
  const resolved = resolveTestDirectUrl(safeFor(pooler, direct), {});
  assert.equal(resolved.directUrl, direct);
});

test("direct 3: proyectos Supabase diferentes: rechazado", () => {
  const pooler = "postgresql://postgres.aaaaaaaaaaaa:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
  const otherDirect = "postgresql://postgres:pw@db.bbbbbbbbbbbb.supabase.co:5432/postgres";
  assert.throws(() => resolveTestDirectUrl(safeFor(pooler, otherDirect), {}), (error: unknown) => {
    assert.match((error as Error).message, /no corresponde al mismo destino/i);
    return true;
  });
});

test("direct 4: bases diferentes en el mismo host: rechazado", () => {
  const safe = safeFor("postgresql://u:p@localhost:5432/pqrs_test", "postgresql://u:p@localhost:5432/otra_test");
  assert.throws(() => resolveTestDirectUrl(safe, {}), TestDatabaseGuardError);
});

test("direct 5: coincide con DIRECT_URL normal: rechazado", () => {
  const safe = safeFor(TEST_URL, TEST_URL);
  assert.throws(() => resolveTestDirectUrl(safe, { DIRECT_URL: "postgresql://otro:otro@localhost:5432/pqrs_test" }), (error: unknown) => {
    assert.match((error as Error).message, /DIRECT_URL/);
    return true;
  });
});

test("direct 6: coincide con DATABASE_URL normal: rechazado", () => {
  const safe = safeFor(TEST_URL, TEST_URL);
  assert.throws(() => resolveTestDirectUrl(safe, { DATABASE_URL: "postgresql://otro:otro@localhost:5432/pqrs_test" }), (error: unknown) => {
    assert.match((error as Error).message, /DATABASE_URL/);
    return true;
  });
});

test("direct 7: credenciales diferentes hacia el mismo destino de pruebas: permitido", () => {
  const safe = safeFor(TEST_URL, "postgresql://otro_user:otra_pass@localhost:5432/pqrs_test");
  const resolved = resolveTestDirectUrl(safe, {});
  assert.equal(resolved.usedFallback, false);
});

test("direct 8: query parameters diferentes hacia el mismo destino: permitido", () => {
  const safe = safeFor(TEST_URL, "postgresql://test_user:testpassword@localhost:5432/pqrs_test?sslmode=require&x=1");
  const resolved = resolveTestDirectUrl(safe, {});
  assert.equal(resolved.usedFallback, false);
});

test("direct 9: protocolo no PostgreSQL: rechazado", () => {
  const safe = safeFor(TEST_URL, "mysql://u:p@localhost:3306/pqrs_test");
  assert.throws(() => resolveTestDirectUrl(safe, {}), (error: unknown) => {
    assert.match((error as Error).message, /Protocolo no permitido/);
    return true;
  });
});

test("direct 10: URL invalida: rechazada de forma segura", () => {
  const safe = safeFor(TEST_URL, "no-es-una-url");
  assert.throws(() => resolveTestDirectUrl(safe, {}), TestDatabaseGuardError);
});

test("direct 11: sin TEST_DIRECT_URL y sin fallback: rechazado", () => {
  const safe = safeFor(TEST_URL);
  assert.throws(() => resolveTestDirectUrl(safe, {}), (error: unknown) => {
    assert.match((error as Error).message, /Falta TEST_DIRECT_URL/);
    return true;
  });
});

test("direct 12: sin TEST_DIRECT_URL, con fallback explicito: permitido", () => {
  const safe = safeFor(TEST_URL);
  const resolved = resolveTestDirectUrl(safe, { ALLOW_TEST_DIRECT_URL_FALLBACK: "true" });
  assert.equal(resolved.directUrl, TEST_URL);
  assert.equal(resolved.usedFallback, true);
});

test("direct 13: los errores no exponen credenciales ni URL completa", () => {
  const safe = safeFor(TEST_URL, "postgresql://prod_user:supersecretpassword@localhost:5432/otra_base?token=abcd");
  try {
    resolveTestDirectUrl(safe, {});
    assert.fail("Se esperaba un error");
  } catch (error) {
    const message = (error as Error).message;
    assert.doesNotMatch(message, /supersecretpassword/);
    assert.doesNotMatch(message, /prod_user:/);
    assert.doesNotMatch(message, /token=abcd/);
  }
});

// --- Prioridad de variables -------------------------------------------------

test("prioridad: el sistema gana sobre .env.test", () => {
  const merged = mergeEnvSources(
    { TEST_DATABASE_URL: "from-env" },
    { TEST_DATABASE_URL: "from-env-test" },
    { TEST_DATABASE_URL: "from-system" }
  );
  assert.equal(merged.TEST_DATABASE_URL, "from-system");
});

test("prioridad: .env.test gana sobre .env", () => {
  const merged = mergeEnvSources(
    { TEST_DATABASE_URL: "from-env" },
    { TEST_DATABASE_URL: "from-env-test" },
    {}
  );
  assert.equal(merged.TEST_DATABASE_URL, "from-env-test");
});

test("prioridad: .env es el fallback cuando no hay nada mas", () => {
  const merged = mergeEnvSources({ TEST_DATABASE_URL: "from-env" }, {}, {});
  assert.equal(merged.TEST_DATABASE_URL, "from-env");
});

test("prioridad: ausencia de .env.test no borra la variable de .env", () => {
  const merged = mergeEnvSources({ FOO: "bar" }, {}, {});
  assert.equal(merged.FOO, "bar");
});

// --- Segunda barrera --------------------------------------------------------

function safeBarrierEnv(): TestDatabaseGuardEnv {
  return {
    DATABASE_URL: TEST_URL,
    TEST_DATABASE_URL: TEST_URL,
    ALLOW_TEST_DATABASE_MUTATION: "true",
  };
}

test("barrera: contexto normal de produccion no se activa (allow)", () => {
  const decision = evaluatePrismaClientAccess({
    nodeEnv: "production",
    execArgv: [],
    argv: ["node", "server.js"],
    env: { DATABASE_URL: PROD_URL },
  });
  assert.equal(decision.action, "allow");
  assert.equal(decision.testContext, false);
});

test("barrera: contexto Node Test sin marca del runner falla", () => {
  const decision = evaluatePrismaClientAccess({
    nodeEnv: "test",
    execArgv: ["--test"],
    argv: ["node", "--test", "tests/phase1.test.ts"],
    env: safeBarrierEnv(),
  });
  assert.equal(decision.action, "block");
  assert.match(String(decision.reason), /runner seguro/i);
});

test("barrera: marca presente pero URLs inseguras falla", () => {
  const decision = evaluatePrismaClientAccess({
    nodeEnv: "test",
    execArgv: ["--test"],
    argv: [],
    runnerMarker: "marca-123",
    env: { DATABASE_URL: TEST_URL, TEST_DATABASE_URL: TEST_URL }, // falta ALLOW_TEST_DATABASE_MUTATION
  });
  assert.equal(decision.action, "block");
  assert.match(String(decision.reason), /ALLOW_TEST_DATABASE_MUTATION/);
});

test("barrera: configuracion segura con marca permite crear Prisma", () => {
  const decision = evaluatePrismaClientAccess({
    nodeEnv: "test",
    execArgv: ["--test"],
    argv: [],
    runnerMarker: "marca-123",
    env: safeBarrierEnv(),
  });
  assert.equal(decision.action, "allow");
  assert.equal(decision.testContext, true);
});

test("barrera: DATABASE_URL que no coincide canonicamente con TEST_DATABASE_URL falla", () => {
  const decision = evaluatePrismaClientAccess({
    nodeEnv: "test",
    execArgv: ["--test"],
    argv: [],
    runnerMarker: "marca-123",
    env: {
      DATABASE_URL: PROD_URL, // distinto del test target
      TEST_DATABASE_URL: TEST_URL,
      ALLOW_TEST_DATABASE_MUTATION: "true",
    },
  });
  assert.equal(decision.action, "block");
  assert.match(String(decision.reason), /no coincide con TEST_DATABASE_URL/i);
});

// --- Proteccion de secretos -------------------------------------------------

test("secretos: ningun mensaje de error expone contraseña, usuario, URL completa ni query", () => {
  const env = baseValidEnv();
  env.DATABASE_URL = "postgresql://otro:otra@otro-host:5432/otra";
  env.TEST_DATABASE_URL =
    "postgresql://prod_user:supersecretpassword@prod-host:5432/postgres?token=abcd1234&sslmode=require";
  try {
    assertSafeTestDatabase(env);
    assert.fail("Se esperaba un error del guard");
  } catch (error) {
    const message = (error as Error).message;
    assert.doesNotMatch(message, /supersecretpassword/, "no debe filtrar la contraseña");
    assert.doesNotMatch(message, /prod_user:/, "no debe filtrar usuario:contraseña");
    assert.doesNotMatch(message, /token=abcd1234/, "no debe filtrar el query string");
    assert.doesNotMatch(message, /sslmode=require/, "no debe filtrar el query string");
    assert.match(message, /prod-host\/postgres/, "solo host/base como identificacion segura");
  }
});

test("describeDatabaseTarget solo devuelve host/base, sin credenciales ni query", () => {
  const description = describeDatabaseTarget("postgresql://usuario:clave@mi-host:6543/mi_base?sslmode=require");
  assert.equal(description, "mi-host/mi_base");
  assert.doesNotMatch(description, /usuario/);
  assert.doesNotMatch(description, /clave/);
  assert.doesNotMatch(description, /sslmode/);
});

// --- Percent-encoding invalido ----------------------------------------------

test("canon: percent-encoding invalido (%ZZ) produce error controlado, no URIError", () => {
  assert.throws(() => canonicalizeDatabaseUrl("postgresql://u:p@host:5432/base%ZZmala"), (error: unknown) => {
    assert.ok(error instanceof TestDatabaseGuardError, "debe ser TestDatabaseGuardError, no URIError");
    assert.doesNotMatch((error as Error).message, /%ZZmala/, "no debe exponer la URL original");
    return true;
  });
});

// --- Deteccion de contexto de test (independiente de la marca) --------------

function ctxWith(partial: Partial<Parameters<typeof isNodeTestContext>[0]>) {
  return { execArgv: [], argv: [], env: {}, ...partial };
}

test("deteccion 1: --test en execArgv", () => {
  assert.equal(isNodeTestContext(ctxWith({ execArgv: ["--test"] })), true);
});

test("deteccion 2: --test en argv", () => {
  assert.equal(isNodeTestContext(ctxWith({ argv: ["node", "--test", "x.ts"] })), true);
});

test("deteccion 3: NODE_ENV=test", () => {
  assert.equal(isNodeTestContext(ctxWith({ nodeEnv: "test" })), true);
});

test("deteccion 4: entrypoint POSIX tests/example.test.ts", () => {
  assert.equal(isNodeTestContext(ctxWith({ argv: ["node", "tests/example.test.ts"] })), true);
});

test("deteccion 5: entrypoint Windows tests\\example.test.ts", () => {
  assert.equal(isNodeTestContext(ctxWith({ argv: ["node", "tests\\example.test.ts"] })), true);
});

test("deteccion 6: entrypoint anidado", () => {
  assert.equal(isNodeTestContext(ctxWith({ argv: ["node", "tests/sub/carpeta/example.test.ts"] })), true);
});

test("deteccion 7: extension .test.tsx", () => {
  assert.equal(isTestEntrypoint("tests/example.test.tsx"), true);
});

test("deteccion 8: extensiones .test.js, .mjs, .cjs", () => {
  assert.equal(isTestEntrypoint("tests/a.test.js"), true);
  assert.equal(isTestEntrypoint("tests/a.test.mjs"), true);
  assert.equal(isTestEntrypoint("tests/a.test.cjs"), true);
});

test("deteccion 9: latest/example.ts NO se detecta", () => {
  assert.equal(isNodeTestContext(ctxWith({ argv: ["node", "latest/example.ts"] })), false);
  assert.equal(isTestEntrypoint("latest/example.ts"), false);
});

test("deteccion 10: contest/example.ts NO se detecta", () => {
  assert.equal(isNodeTestContext(ctxWith({ argv: ["node", "contest/example.ts"] })), false);
  assert.equal(isTestEntrypoint("src/mytest.ts"), false);
});

test("deteccion 11: argumento secundario con .test.ts NO activa si el entrypoint no es test", () => {
  assert.equal(isNodeTestContext(ctxWith({ argv: ["node", "server.js", "--foo", "algo.test.ts"] })), false);
});

test("deteccion 12: la marca del runner sin contexto independiente NO activa la barrera como test", () => {
  assert.equal(isNodeTestContext(ctxWith({ argv: ["node", "server.js"], runnerMarker: "marca-123" })), false);
  const decision = evaluatePrismaClientAccess({
    nodeEnv: "production",
    execArgv: [],
    argv: ["node", "server.js"],
    runnerMarker: "marca-123",
    env: { DATABASE_URL: PROD_URL },
  });
  assert.equal(decision.action, "allow");
  assert.equal(decision.testContext, false);
});

test("deteccion 13: ejecucion directa de .test.ts sin marca se bloquea antes de Prisma", () => {
  const decision = evaluatePrismaClientAccess({
    nodeEnv: undefined,
    execArgv: [],
    argv: ["node", "tests/phase1-infrastructure.test.ts"],
    env: safeBarrierEnv(),
  });
  assert.equal(decision.action, "block");
  assert.equal(decision.testContext, true);
  assert.match(String(decision.reason), /runner seguro/i);
});

test("deteccion 14: entrypoint .test.ts con marca pero URLs inseguras: bloqueado", () => {
  const decision = evaluatePrismaClientAccess({
    execArgv: [],
    argv: ["node", "tests/phase1-infrastructure.test.ts"],
    runnerMarker: "marca-123",
    env: { DATABASE_URL: TEST_URL, TEST_DATABASE_URL: TEST_URL }, // falta ALLOW_TEST_DATABASE_MUTATION
  });
  assert.equal(decision.action, "block");
  assert.match(String(decision.reason), /ALLOW_TEST_DATABASE_MUTATION/);
});

test("deteccion 15: contexto + marca + URLs seguras: permitido", () => {
  const decision = evaluatePrismaClientAccess({
    execArgv: ["--test"],
    argv: ["node", "tests/phase1-infrastructure.test.ts"],
    runnerMarker: "marca-123",
    env: safeBarrierEnv(),
  });
  assert.equal(decision.action, "allow");
  assert.equal(decision.testContext, true);
});
