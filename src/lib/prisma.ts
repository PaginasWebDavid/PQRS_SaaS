import { PrismaClient } from "@prisma/client";
import { evaluatePrismaClientAccess } from "./testing/test-database-safety";

// Segunda barrera de seguridad de pruebas: se evalua ANTES de crear el cliente.
// Fuera de un contexto de Node Test no interfiere (la app normal no cambia). En
// contexto de pruebas, aborta si no se paso por el runner seguro o si la
// configuracion (TEST_DATABASE_URL / DATABASE_URL / confirmacion) no es segura.
const prismaAccess = evaluatePrismaClientAccess({
  nodeEnv: process.env.NODE_ENV,
  execArgv: process.execArgv,
  argv: process.argv,
  runnerMarker: process.env.PQRS_TEST_RUNNER,
  env: process.env,
});
if (prismaAccess.action === "block") {
  throw new Error(`[test-guard] ${prismaAccess.reason}`);
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return process.env.NODE_ENV === "test"
    ? new PrismaClient({ transactionOptions: { maxWait: 30_000, timeout: 60_000 } })
    : new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
