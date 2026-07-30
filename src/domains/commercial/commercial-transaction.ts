import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MAX_SERIALIZATION_ATTEMPTS = 4;
const COMMERCIAL_TRANSACTION_MAX_WAIT_MS = 10_000;
const COMMERCIAL_TRANSACTION_TIMEOUT_MS = 60_000;

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function waitBeforeRetry(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, 15 * 2 ** attempt));
}

export async function runCommercialTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: COMMERCIAL_TRANSACTION_MAX_WAIT_MS,
        timeout: COMMERCIAL_TRANSACTION_TIMEOUT_MS,
      });
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === MAX_SERIALIZATION_ATTEMPTS - 1) {
        throw error;
      }
      await waitBeforeRetry(attempt);
    }
  }

  throw new Error("No se pudo completar la transaccion comercial");
}
