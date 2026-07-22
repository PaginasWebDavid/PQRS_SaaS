// Fuente unica de verdad para la seguridad del entorno de pruebas.
//
// Este modulo es PURO y server-side: NO importa Prisma, NO abre conexiones y NO
// lee archivos. Lo consumen tres lugares que deben coincidir siempre:
//   1. El runner oficial  -> scripts/run-tests.ts
//   2. La segunda barrera -> src/lib/prisma.ts (antes de `new PrismaClient()`)
//   3. Las pruebas puras  -> tests/unit/test-database-safety.test.ts
//   4. El runner de Prisma de pruebas -> scripts/run-test-prisma.ts
//
// Ningun mensaje de error revela credenciales, URL completa ni query string:
// como maximo se muestra "host/nombre_de_base".

export class TestDatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDatabaseGuardError";
  }
}

export interface TestDatabaseGuardEnv {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  TEST_DATABASE_URL?: string;
  TEST_DIRECT_URL?: string;
  ALLOW_TEST_DATABASE_MUTATION?: string;
  ALLOW_TEST_DIRECT_URL_FALLBACK?: string;
  TEST_DATABASE_ALLOWED_TARGETS?: string;
  TEST_DATABASE_ALLOW_ANY_NAME?: string;
  // Permite recibir `process.env` directamente.
  [key: string]: string | undefined;
}

// Nombre de la marca que planta el runner oficial en el proceso hijo. No es un
// secreto: por si sola NO autoriza el acceso (la segunda barrera revalida la
// configuracion), solo distingue "vengo del runner" de "ejecucion artesanal".
export const RUNNER_MARKER_ENV = "PQRS_TEST_RUNNER";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const DEFAULT_POSTGRES_PORT = 5432;

// Nombres de base que, por si solos, se consideran de pruebas.
const EXACT_TEST_DB_NAMES = new Set(["test", "tests", "testing", "qa", "ci", "sandbox", "e2e"]);
// Palabras clave que, como prefijo o sufijo delimitado, marcan una base de pruebas.
const TEST_KEYWORDS = "test|qa|ci|sandbox|e2e";
const TEST_PREFIX = new RegExp(`^(${TEST_KEYWORDS})[_-]`);
const TEST_SUFFIX = new RegExp(`[_-](${TEST_KEYWORDS})$`);

export interface CanonicalTarget {
  /** Identidad comparable: postgresql://host:puerto/base (sin credenciales ni query). */
  canonical: string;
  host: string;
  port: number;
  database: string;
  /** Ref de proyecto de Supabase, si puede extraerse con seguridad del host o el usuario. */
  projectRef?: string;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

// Extrae la ref de proyecto de Supabase de forma conservadora:
//   - Conexion directa: host = db.<ref>.supabase.co
//   - Conexion por pooler: host = ...pooler.supabase.com y usuario = postgres.<ref>
// Devuelve undefined si no puede extraerse con seguridad.
function extractSupabaseProjectRef(host: string, username: string): string | undefined {
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
  if (direct) return direct[1];
  if (/\.pooler\.supabase\.com$/.test(host)) {
    const pooled = /^postgres\.([a-z0-9]+)$/.exec(username.toLowerCase());
    if (pooled) return pooled[1];
  }
  return undefined;
}

// Convierte una URL de conexion en un destino canonico comparable.
// Lanza TestDatabaseGuardError si el protocolo no es PostgreSQL o la URL es invalida.
export function canonicalizeDatabaseUrl(rawUrl: string): CanonicalTarget {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new TestDatabaseGuardError("La URL de conexion no es valida.");
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    const shown = parsed.protocol.replace(/:$/, "");
    throw new TestDatabaseGuardError(
      `Protocolo no permitido "${shown}": solo se aceptan URLs postgres:// o postgresql://.`
    );
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port ? Number(parsed.port) : DEFAULT_POSTGRES_PORT;
  // Un nombre de base con percent-encoding invalido (p. ej. %ZZ) hace que
  // decodeURIComponent lance URIError: lo convertimos en el error controlado del
  // sistema, con el mismo mensaje uniforme y sin exponer la URL original.
  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, "")).trim();
  } catch {
    throw new TestDatabaseGuardError("La URL de conexion no es valida.");
  }
  const projectRef = extractSupabaseProjectRef(host, parsed.username);

  return {
    canonical: `postgresql://${host}:${port}/${database}`,
    host,
    port,
    database,
    projectRef,
  };
}

// Descripcion segura para mensajes: solo host/base, nunca credenciales ni query.
export function describeDatabaseTarget(rawUrl: string): string {
  try {
    const { host, database } = canonicalizeDatabaseUrl(rawUrl);
    return `${host}/${database || "(sin nombre)"}`;
  } catch {
    return "(destino no interpretable)";
  }
}

// Dos URLs apuntan al mismo destino si su identidad canonica coincide o si
// comparten la misma ref de proyecto de Supabase (pooler vs. directo).
export function sameDatabaseTarget(a: CanonicalTarget, b: CanonicalTarget): boolean {
  if (a.canonical === b.canonical) return true;
  if (a.projectRef && b.projectRef && a.projectRef === b.projectRef) return true;
  return false;
}

// Decide si una base "parece" de pruebas evaluando componentes completos o afijos
// delimitados, nunca subcadenas arbitrarias. Una allowlist explicita tiene prioridad.
export function looksLikeTestDatabase(database: string, host: string, env: TestDatabaseGuardEnv): boolean {
  const allowRaw = env.TEST_DATABASE_ALLOWED_TARGETS;
  if (allowRaw && allowRaw.trim() !== "") {
    const allow = allowRaw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    const db = database.toLowerCase();
    const target = `${host.toLowerCase()}/${db}`;
    return allow.includes(db) || allow.includes(target);
  }

  const db = database.toLowerCase();
  if (EXACT_TEST_DB_NAMES.has(db)) return true;
  return TEST_PREFIX.test(db) || TEST_SUFFIX.test(db);
}

export interface SafeTestDatabase {
  testDatabaseUrl: string;
  testDirectUrl?: string;
  target: CanonicalTarget;
}

// Nucleo de validacion de la configuracion de pruebas, INDEPENDIENTE de la base
// normal: presencia, confirmacion de mutacion, protocolo/forma y defensa de
// nombre. NO compara contra DATABASE_URL (esa comparacion tiene sentido distinto
// en el runner y en la segunda barrera). Lanza TestDatabaseGuardError si falla.
export function validateTestDatabaseConfig(env: TestDatabaseGuardEnv): SafeTestDatabase {
  if (isBlank(env.TEST_DATABASE_URL)) {
    throw new TestDatabaseGuardError(
      "Falta TEST_DATABASE_URL (o esta vacia). Las pruebas requieren una base de datos de pruebas dedicada. Configurala en .env.test."
    );
  }
  const testUrl = (env.TEST_DATABASE_URL as string).trim();

  if (env.ALLOW_TEST_DATABASE_MUTATION !== "true") {
    throw new TestDatabaseGuardError(
      "Falta ALLOW_TEST_DATABASE_MUTATION=true. Las pruebas crean y borran datos: debes autorizarlo explicitamente en .env.test."
    );
  }

  // Valida protocolo y forma; produce la identidad canonica.
  const target = canonicalizeDatabaseUrl(testUrl);

  // Defensa secundaria: la base debe coincidir con un patron de pruebas reconocido.
  if (env.TEST_DATABASE_ALLOW_ANY_NAME !== "true" && !looksLikeTestDatabase(target.database, target.host, env)) {
    throw new TestDatabaseGuardError(
      `La base "${describeDatabaseTarget(testUrl)}" no coincide con un patron de pruebas reconocido. ` +
        `Usa una base cuyo nombre sea de pruebas (por ejemplo pqrs_test), define TEST_DATABASE_ALLOWED_TARGETS con el destino exacto, ` +
        `o TEST_DATABASE_ALLOW_ANY_NAME=true para omitir deliberadamente esta defensa secundaria.`
    );
  }

  const testDirectUrl = isBlank(env.TEST_DIRECT_URL) ? undefined : (env.TEST_DIRECT_URL as string).trim();
  return { testDatabaseUrl: testUrl, testDirectUrl, target };
}

// Guard del RUNNER: la configuracion nuclear MAS la exigencia de que
// TEST_DATABASE_URL NO apunte al mismo destino que DATABASE_URL (que en el runner
// todavia es la base normal/produccion). Lanza TestDatabaseGuardError si falla.
export function assertSafeTestDatabase(env: TestDatabaseGuardEnv): SafeTestDatabase {
  const safe = validateTestDatabaseConfig(env);

  if (!isBlank(env.DATABASE_URL)) {
    let normalTarget: CanonicalTarget | undefined;
    try {
      normalTarget = canonicalizeDatabaseUrl((env.DATABASE_URL as string).trim());
    } catch {
      normalTarget = undefined;
    }
    if (normalTarget && sameDatabaseTarget(safe.target, normalTarget)) {
      throw new TestDatabaseGuardError(
        `TEST_DATABASE_URL apunta al mismo destino que DATABASE_URL (${describeDatabaseTarget(safe.testDatabaseUrl)}). Usa una base de datos de pruebas distinta.`
      );
    }
  }

  return safe;
}

export interface ResolvedTestDirectUrl {
  directUrl: string;
  /** true si se uso TEST_DATABASE_URL como DIRECT_URL por fallback autorizado. */
  usedFallback: boolean;
}

// Resuelve el DIRECT_URL de pruebas para comandos Prisma (migraciones/db push).
//
// Cuando existe TEST_DIRECT_URL no basta con validar su sintaxis: debe
// corresponder al MISMO destino de pruebas que TEST_DATABASE_URL (misma base o
// mismo proyecto Supabase, pooler<->directo) y NO puede coincidir con las
// conexiones normales (DATABASE_URL / DIRECT_URL). La comparacion usa las
// funciones canonicas compartidas, nunca cadenas literales.
//
// Si no existe TEST_DIRECT_URL, solo se admite TEST_DATABASE_URL como fallback si
// ALLOW_TEST_DIRECT_URL_FALLBACK=true. Nunca se hereda el DIRECT_URL normal.
export function resolveTestDirectUrl(safe: SafeTestDatabase, env: TestDatabaseGuardEnv): ResolvedTestDirectUrl {
  if (safe.testDirectUrl) {
    // Valida protocolo/forma y produce la identidad canonica del direct url.
    const directTarget = canonicalizeDatabaseUrl(safe.testDirectUrl);

    // 1. Debe apuntar al mismo destino de pruebas que TEST_DATABASE_URL.
    if (!sameDatabaseTarget(directTarget, safe.target)) {
      throw new TestDatabaseGuardError(
        `TEST_DIRECT_URL (${describeDatabaseTarget(safe.testDirectUrl)}) no corresponde al mismo destino de pruebas que ` +
          `TEST_DATABASE_URL (${describeDatabaseTarget(safe.testDatabaseUrl)}). Debe ser la conexion directa de la MISMA base o proyecto de pruebas.`
      );
    }

    // 2. No puede coincidir con una conexion normal (produccion/desarrollo).
    for (const normalName of ["DATABASE_URL", "DIRECT_URL"] as const) {
      const rawNormal = env[normalName];
      if (isBlank(rawNormal)) continue;
      let normalTarget: CanonicalTarget | undefined;
      try {
        normalTarget = canonicalizeDatabaseUrl((rawNormal as string).trim());
      } catch {
        normalTarget = undefined;
      }
      if (normalTarget && sameDatabaseTarget(directTarget, normalTarget)) {
        throw new TestDatabaseGuardError(
          `TEST_DIRECT_URL coincide con la conexion normal ${normalName} (${describeDatabaseTarget(safe.testDirectUrl)}). ` +
            `Usa la conexion directa de la base de PRUEBAS, nunca la normal.`
        );
      }
    }

    return { directUrl: safe.testDirectUrl, usedFallback: false };
  }

  if (env.ALLOW_TEST_DIRECT_URL_FALLBACK === "true") {
    return { directUrl: safe.testDatabaseUrl, usedFallback: true };
  }

  throw new TestDatabaseGuardError(
    "Falta TEST_DIRECT_URL para comandos Prisma de pruebas. Definela en .env.test (conexion directa de la base de pruebas) " +
      "o autoriza ALLOW_TEST_DIRECT_URL_FALLBACK=true para usar TEST_DATABASE_URL como DIRECT_URL."
  );
}

// Prioridad de variables: sistema > .env.test > .env.
// El ultimo objeto del spread gana, por eso el orden es base -> test -> sistema.
export function mergeEnvSources(
  envFile: Record<string, string | undefined>,
  envTestFile: Record<string, string | undefined>,
  systemEnv: Record<string, string | undefined>
): Record<string, string | undefined> {
  return { ...envFile, ...envTestFile, ...systemEnv };
}

export interface PrismaAccessContext {
  nodeEnv?: string;
  execArgv?: string[];
  argv?: string[];
  runnerMarker?: string;
  env: TestDatabaseGuardEnv;
}

export interface PrismaAccessDecision {
  action: "allow" | "block";
  testContext: boolean;
  reason?: string;
}

// Patron de archivos de prueba del repositorio (extensiones que el proyecto usa).
const TEST_FILE_PATTERN = /\.test\.(ts|tsx|js|mjs|cjs)$/;

// Decide si el entrypoint (process.argv[1]) es un archivo de prueba ejecutado
// directamente. Evalua solo el nombre base del entrypoint, no argumentos
// arbitrarios, y exige el patron ".test.<ext>" delimitado por un punto: asi una
// carpeta "latest"/"contest"/"testing" o una ruta productiva con la palabra
// "test" como parte de otra palabra NO produce falsos positivos.
export function isTestEntrypoint(entrypoint: string | undefined): boolean {
  if (!entrypoint) return false;
  const base = entrypoint.split(/[\\/]/).pop() ?? "";
  return TEST_FILE_PATTERN.test(base);
}

// Detecta si estamos en un contexto de Node Test de forma INDEPENDIENTE de la
// marca del runner, combinando varias senales: flag --test en execArgv/argv,
// NODE_ENV=test, o un entrypoint que sigue el patron de archivos de prueba
// (cubre `npx tsx tests/x.test.ts` sin --test, que node:test ejecuta igual).
// La marca del runner NO cuenta aqui como senal de contexto.
export function isNodeTestContext(ctx: PrismaAccessContext): boolean {
  const execArgv = ctx.execArgv ?? [];
  const argv = ctx.argv ?? [];
  const hasTestFlag = execArgv.includes("--test") || argv.includes("--test");
  const nodeTestEnv = ctx.nodeEnv === "test";
  const testEntrypoint = isTestEntrypoint(argv[1]);
  return hasTestFlag || nodeTestEnv || testEntrypoint;
}

// Segunda barrera: decide si se puede crear un PrismaClient.
// - Fuera de contexto de pruebas: no interfiere (allow), runtime normal intacto.
// - En contexto de pruebas: exige marca del runner + configuracion segura +
//   que DATABASE_URL del proceso coincida canonicamente con TEST_DATABASE_URL.
export function evaluatePrismaClientAccess(ctx: PrismaAccessContext): PrismaAccessDecision {
  const testContext = isNodeTestContext(ctx);
  if (!testContext) {
    return { action: "allow", testContext: false };
  }

  if (!ctx.runnerMarker) {
    return {
      action: "block",
      testContext: true,
      reason:
        "Se detecto un contexto de pruebas que no paso por el runner seguro (scripts/run-tests.ts). " +
        "No ejecutes archivos de integracion directamente; usa `npm test`.",
    };
  }

  // Revalida la configuracion nuclear (sin exigir que difiera de DATABASE_URL:
  // dentro del proceso de pruebas AMBAS deben apuntar al destino de pruebas).
  let safe: SafeTestDatabase;
  try {
    safe = validateTestDatabaseConfig(ctx.env);
  } catch (error) {
    return {
      action: "block",
      testContext: true,
      reason: error instanceof TestDatabaseGuardError ? error.message : "Configuracion de pruebas invalida.",
    };
  }

  if (isBlank(ctx.env.DATABASE_URL)) {
    return { action: "block", testContext: true, reason: "DATABASE_URL no esta definida en el proceso de pruebas." };
  }

  let dbTarget: CanonicalTarget;
  try {
    dbTarget = canonicalizeDatabaseUrl((ctx.env.DATABASE_URL as string).trim());
  } catch (error) {
    return {
      action: "block",
      testContext: true,
      reason: error instanceof TestDatabaseGuardError ? error.message : "DATABASE_URL invalida.",
    };
  }

  if (!sameDatabaseTarget(dbTarget, safe.target)) {
    return {
      action: "block",
      testContext: true,
      reason: "DATABASE_URL del proceso de pruebas no coincide con TEST_DATABASE_URL. Se aborta antes de crear PrismaClient.",
    };
  }

  return { action: "allow", testContext: true };
}
