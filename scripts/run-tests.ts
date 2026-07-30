// Runner central y obligatorio de la suite de pruebas (`npm test`).
//
// Responsabilidades de seguridad:
//   1. Resolver variables con la prioridad oficial: sistema > .env.test > .env
//      (sin mutar process.env durante el calculo).
//   2. Ejecutar el guard (src/lib/testing/test-database-safety) ANTES de crear
//      cualquier proceso de pruebas o cliente Prisma.
//   3. Abortar con codigo 1 y mensajes sin credenciales si algo es inseguro.
//   4. Lanzar la suite en un proceso hijo forzando DATABASE_URL al destino de
//      pruebas, eliminando el DIRECT_URL normal y plantando la marca del runner.
//   5. Propagar el codigo de salida del hijo, sin caminos de falso exito.
//
// Requiere Node >= 20.6 (usa `node --import`). Es sincrono a proposito.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseEnv } from "dotenv";
import {
  assertSafeTestDatabase,
  mergeEnvSources,
  RUNNER_MARKER_ENV,
  TestDatabaseGuardError,
} from "../src/lib/testing/test-database-safety";

function readEnvFile(path: string): Record<string, string | undefined> {
  if (!existsSync(path)) return {};
  return parseEnv(readFileSync(path, "utf8"));
}

function fail(message: string): never {
  console.error(`\n[test-guard] ${message}\n`);
  process.exit(1);
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireExclusiveTestLock() {
  const workspaceHash = createHash("sha256").update(resolve(".")).digest("hex").slice(0, 16);
  const lockPath = join(tmpdir(), `pqrs-saas-tests-${workspaceHash}.lock`);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, "wx");
      writeFileSync(descriptor, String(process.pid), "utf8");
      return () => {
        closeSync(descriptor);
        try { unlinkSync(lockPath); } catch { /* El proceso puede haber perdido el lock al terminar. */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const ownerPid = Number.parseInt(readFileSync(lockPath, "utf8"), 10);
      if (Number.isSafeInteger(ownerPid) && processIsAlive(ownerPid)) {
        fail(`Ya existe una suite de este repositorio en ejecucion (PID ${ownerPid}). Espera a que termine.`);
      }
      try { unlinkSync(lockPath); } catch { /* Otro proceso pudo limpiar el lock primero. */ }
    }
  }

  fail("No fue posible adquirir el lock exclusivo de pruebas.");
}

// Prioridad: sistema > .env.test > .env. No se muta process.env.
const merged = mergeEnvSources(readEnvFile(".env"), readEnvFile(".env.test"), process.env);

let safe;
try {
  safe = assertSafeTestDatabase(merged);
} catch (error) {
  if (error instanceof TestDatabaseGuardError) {
    fail(`Configuracion de pruebas insegura: ${error.message}`);
  }
  throw error;
}

// Descubrimiento de archivos *.test.ts: recursivo, ordenado, sin duplicados y sin
// seguir symlinks de directorios.
function discoverTestFiles(root: string): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
        found.add(full);
      }
    }
  };
  walk(root);
  return Array.from(found).sort();
}

const testsDir = resolve("tests");
if (!existsSync(testsDir)) {
  fail("No existe el directorio tests/.");
}
const testFiles = discoverTestFiles(testsDir);
if (testFiles.length === 0) {
  fail("No se encontraron archivos *.test.ts en tests/.");
}
const namePatternArg = process.argv.slice(2).find((value) => value.startsWith("--name-pattern="));
const namePattern = namePatternArg?.slice("--name-pattern=".length);
const requested = process.argv.slice(2).filter((value) => !value.startsWith("--name-pattern=")).map((value) => resolve(value));
const selectedTestFiles = requested.length
  ? testFiles.filter((file) => requested.includes(resolve(file)))
  : testFiles;
if (requested.length && selectedTestFiles.length !== requested.length) {
  fail("Uno o mas archivos de prueba solicitados no existen o no terminan en .test.ts.");
}
// Las suites PostgreSQL comparten una base remota protegida y algunas limpiezas
// historicas no son seguras entre archivos. Serializar archivos evita interferencia
// sin desactivar las carreras que cada archivo prueba internamente.
const suiteConcurrencyArgs = ["--test-concurrency", "1"];

// Las transacciones interactivas de Prisma no son compatibles con el transaction
// pooler de Supabase. Cuando existe TEST_DIRECT_URL, ya validada por el guard como
// el mismo destino de pruebas, se usa tambien como DATABASE_URL del runtime.
const runtimeDatabaseUrl = safe.testDirectUrl || safe.testDatabaseUrl;

// Entorno del proceso hijo: base = variables resueltas; se fuerza el destino de
// pruebas y se retira el DIRECT_URL normal para que ningun comando accidental lo herede.
const childEnv: NodeJS.ProcessEnv = {
  ...merged,
  NODE_ENV: "test",
  DATABASE_URL: runtimeDatabaseUrl,
  [RUNNER_MARKER_ENV]: randomUUID(),
};
if (safe.testDirectUrl) {
  childEnv.DIRECT_URL = safe.testDirectUrl;
} else {
  delete childEnv.DIRECT_URL;
}

const releaseTestLock = acquireExclusiveTestLock();
let result;
try {
  result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...suiteConcurrencyArgs, ...(namePattern ? ["--test-name-pattern", namePattern] : []), ...selectedTestFiles], {
    stdio: "inherit",
    env: childEnv,
    shell: false,
  });
} finally {
  releaseTestLock();
}

if (result.error) {
  fail(`No se pudo lanzar la suite: ${result.error.message}`);
}
if (result.signal) {
  fail(`La suite termino por senal ${result.signal}.`);
}
process.exit(result.status ?? 1);
