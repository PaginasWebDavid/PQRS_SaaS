// Herramienta administrativa CLI para reconciliar pagos historicos en cuarentena
// (approvedEffectReconciliationRequired = true), producto de la migracion de
// idempotencia. NO extiende periodos automaticamente ni llama a Mercado Pago.
//
// Uso:
//   npx tsx scripts/reconcile-historical-payment-effects.ts list
//   npx tsx scripts/reconcile-historical-payment-effects.ts mark-applied \
//     --payment-id <id> --reason "<motivo>" [--confirm-production --confirm-payment-id <id>]
//
// `list` es solo lectura (por defecto). `mark-applied` opera sobre UN pago por
// ejecucion, exige motivo, corre en transaccion, fija approvedEffectAppliedAt
// (usando paidAt cuando existe), limpia la cuarentena y audita. No modifica el periodo.
//
// Proteccion de entorno: si la base NO parece de pruebas, `mark-applied` exige
// --confirm-production Y repetir el ID en --confirm-payment-id. NO ejecutar en esta sesion.

import { pathToFileURL } from "node:url";
import { AuditAction } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { registerAuditLog } from "../src/domains/platform/audit.service";
import {
  buildReconciliationAuditMetadata,
  maskExternalId,
  parseReconcileArgs,
  summarizeAuditEvidence,
  validateProductionConfirmation,
  type AuditEvidenceRow,
  type AuditEvidenceSummary,
} from "../src/domains/billing/reconciliation";
import { canonicalizeDatabaseUrl, describeDatabaseTarget, looksLikeTestDatabase } from "../src/lib/testing/test-database-safety";

function log(message: string) {
  process.stdout.write(`${message}\n`);
}

function fail(message: string): never {
  process.stderr.write(`[reconcile] ${message}\n`);
  process.exit(1);
}

// Determina si la base actual parece de pruebas (reutiliza el guard de la Fase 0).
function targetLooksLikeTest(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const target = canonicalizeDatabaseUrl(url);
    return looksLikeTestDatabase(target.database, target.host, process.env);
  } catch {
    return false;
  }
}

// Evidencia de auditoria del webhook para un pago concreto. El webhook audita con
// targetId = subscriptionId y metadata.externalId = ID externo del pago. Se consulta
// por subscriptionId y se filtra en memoria por externalId (helper puro), NUNCA por
// tenantId, para no contar auditorias de otro pago del mismo conjunto.
export async function findPaymentAuditEvidence(
  subscriptionId: string,
  externalId: string | null
): Promise<AuditEvidenceSummary> {
  if (!externalId) return { count: 0, actions: [], latestAt: null };
  const rows = await prisma.auditLog.findMany({
    where: { targetId: subscriptionId, action: { in: [AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED] } },
    select: { action: true, createdAt: true, metadata: true },
  });
  const evidenceRows: AuditEvidenceRow[] = rows.map((row) => ({
    action: row.action,
    createdAt: row.createdAt,
    metadata: row.metadata,
  }));
  return summarizeAuditEvidence(evidenceRows, externalId);
}

async function runList() {
  const payments = await prisma.payment.findMany({
    where: { approvedEffectReconciliationRequired: true },
    orderBy: { paidAt: "desc" },
    select: {
      id: true,
      tenantId: true,
      subscriptionId: true,
      status: true,
      provider: true,
      paidAt: true,
      periodStart: true,
      periodEnd: true,
      mercadoPagoPaymentId: true,
      approvedEffectAppliedAt: true,
      approvedEffectReconciliationRequired: true,
    },
  });

  log(`Pagos en cuarentena de reconciliacion: ${payments.length}`);
  for (const p of payments) {
    const evidence = await findPaymentAuditEvidence(p.subscriptionId, p.mercadoPagoPaymentId);
    log(
      [
        `- payment=${p.id}`,
        `tenant=${p.tenantId}`,
        `status=${p.status}`,
        `provider=${p.provider}`,
        `externalId=${p.mercadoPagoPaymentId ? maskExternalId(p.mercadoPagoPaymentId) : "(sin externalId)"}`,
        `paidAt=${p.paidAt ? p.paidAt.toISOString() : "(null)"}`,
        `periodStart=${p.periodStart.toISOString()}`,
        `periodEnd=${p.periodEnd.toISOString()}`,
        `reconciliationRequired=${p.approvedEffectReconciliationRequired}`,
        `auditEvidenceCount=${evidence.count}`,
        `latestAuditAt=${evidence.latestAt ?? "(ninguna)"}`,
        `auditActions=${evidence.actions.join(",") || "(ninguna)"}`,
      ].join(" | ")
    );
  }
}

async function runMarkApplied(
  paymentId: string,
  reason: string,
  confirmProduction: boolean,
  confirmPaymentId: string | null
) {
  const confirmation = validateProductionConfirmation({
    isTestTarget: targetLooksLikeTest(),
    paymentId,
    confirmProduction,
    confirmPaymentId,
  });
  if (!confirmation.ok) {
    fail(`${confirmation.message} (destino: ${describeDatabaseTarget(process.env.DATABASE_URL || "")})`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error(`No existe el Payment ${paymentId}`);
    if (!payment.approvedEffectReconciliationRequired) {
      throw new Error(`El Payment ${paymentId} no esta en cuarentena de reconciliacion`);
    }

    const appliedAt = payment.paidAt ?? new Date();
    // NO se modifica el periodo. Solo se marca el efecto como aplicado y se limpia
    // la cuarentena, para que futuros webhooks de este pago se traten como DUPLICATE.
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        approvedEffectAppliedAt: appliedAt,
        approvedEffectReconciliationRequired: false,
      },
    });

    await registerAuditLog(
      {
        actorUserId: null,
        tenantId: payment.tenantId,
        action: AuditAction.PAYMENT_RECONCILED,
        targetType: "Payment",
        targetId: payment.id,
        origin: "cli-reconciliation",
        metadata: buildReconciliationAuditMetadata({
          paymentId: payment.id,
          externalId: payment.mercadoPagoPaymentId,
          reason,
          appliedAt,
        }),
      },
      tx
    );

    return { appliedAt };
  });

  log(`Payment ${paymentId} reconciliado. approvedEffectAppliedAt=${result.appliedAt.toISOString()}. Periodo sin cambios.`);
}

export async function main() {
  const parsed = parseReconcileArgs(process.argv.slice(2));

  if (parsed.command === "error") {
    fail(parsed.message);
  }

  try {
    if (parsed.command === "list") {
      await runList();
    } else {
      await runMarkApplied(parsed.paymentId, parsed.reason, parsed.confirmProduction, parsed.confirmPaymentId);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Solo se ejecuta cuando el script es el entrypoint directo. Importarlo (p. ej. desde
// una prueba de integracion para reutilizar findPaymentAuditEvidence) NO corre main().
const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
  main().catch((error) => fail(error instanceof Error ? error.message : "Error desconocido"));
}
