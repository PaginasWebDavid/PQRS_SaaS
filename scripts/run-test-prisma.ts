// Runner protegido para comandos Prisma contra la base de datos de PRUEBAS.
//
// Uso (via npm scripts, nunca a mano):
//   npm run test:db:deploy   -> prisma migrate deploy
//   npm run test:db:push     -> prisma db push
//
// Seguridad:
//   1. Resuelve variables con la prioridad oficial: sistema > .env.test > .env.
//   2. Ejecuta el mismo guard que la suite.
//   3. Fuerza DATABASE_URL y DIRECT_URL al destino de PRUEBAS (nunca hereda el
//      DIRECT_URL normal).
//   4. Solo permite operaciones de una allowlist estricta.
//   5. Propaga errores/senales y no imprime credenciales.
//   6. No depende de sintaxis de shell (funciona en Windows/Linux/macOS).

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parse as parseEnv } from "dotenv";
import {
  assertSafeTestDatabase,
  mergeEnvSources,
  resolveTestDirectUrl,
  RUNNER_MARKER_ENV,
  TestDatabaseGuardError,
} from "../src/lib/testing/test-database-safety";

// Allowlist estricta: nombre de operacion -> argumentos exactos de Prisma.
const ALLOWED_OPERATIONS: Record<string, string[]> = {
  deploy: ["migrate", "deploy"],
  push: ["db", "push"],
};

function readEnvFile(path: string): Record<string, string | undefined> {
  if (!existsSync(path)) return {};
  return parseEnv(readFileSync(path, "utf8"));
}

function fail(message: string): never {
  console.error(`\n[test-db] ${message}\n`);
  process.exit(1);
}

const operation = process.argv[2];
if (!operation || !(operation in ALLOWED_OPERATIONS)) {
  fail(`Operacion no permitida. Usa una de: ${Object.keys(ALLOWED_OPERATIONS).join(", ")}.`);
}
const prismaArgs = ALLOWED_OPERATIONS[operation];

// Prioridad: sistema > .env.test > .env.
const merged = mergeEnvSources(readEnvFile(".env"), readEnvFile(".env.test"), process.env);

let safe;
let directUrl: string;
try {
  safe = assertSafeTestDatabase(merged);
  const resolvedDirect = resolveTestDirectUrl(safe, merged);
  directUrl = resolvedDirect.directUrl;
  if (resolvedDirect.usedFallback) {
    console.error("[test-db] Usando TEST_DATABASE_URL como DIRECT_URL (fallback autorizado con ALLOW_TEST_DIRECT_URL_FALLBACK=true).");
  }
} catch (error) {
  if (error instanceof TestDatabaseGuardError) {
    fail(`Configuracion de pruebas insegura: ${error.message}`);
  }
  throw error;
}

// Resuelve el CLI de Prisma sin depender de `.cmd` ni de un shell.
const requireFromHere = createRequire(import.meta.url);
let prismaBin: string;
try {
  const prismaPkgPath = requireFromHere.resolve("prisma/package.json");
  const prismaPkg = requireFromHere(prismaPkgPath) as { bin?: { prisma?: string } };
  const binRel = prismaPkg.bin?.prisma;
  if (!binRel) {
    fail("No se pudo localizar el binario de Prisma (bin.prisma ausente en su package.json).");
  }
  prismaBin = join(dirname(prismaPkgPath), binRel);
} catch {
  fail("No se pudo resolver el paquete 'prisma'. Instala las dependencias de desarrollo.");
}

// Entorno del hijo: destino de PRUEBAS en ambas variables, marca del runner.
const childEnv: Record<string, string | undefined> = {
  ...merged,
  DATABASE_URL: safe.testDatabaseUrl,
  DIRECT_URL: directUrl,
  [RUNNER_MARKER_ENV]: randomUUID(),
};

const result = spawnSync(process.execPath, [prismaBin, ...prismaArgs], {
  stdio: "inherit",
  env: childEnv as NodeJS.ProcessEnv,
  shell: false,
});

if (result.error) {
  fail(`No se pudo lanzar Prisma: ${result.error.message}`);
}
if (result.signal) {
  fail(`Prisma termino por senal ${result.signal}.`);
}
process.exit(result.status ?? 1);
