// Utilidades PURAS para la cuarentena de pagos historicos y el CLI de
// reconciliacion. No importan Prisma ni abren conexiones.

export interface ClaimablePaymentState {
  status: string;
  approvedEffectAppliedAt: Date | null;
  approvedEffectReconciliationRequired: boolean;
}

// Un pago historico en cuarentena espera reconciliacion manual: NUNCA reclama efecto.
export function isHistoricalQuarantined(payment: ClaimablePaymentState): boolean {
  return payment.approvedEffectReconciliationRequired === true;
}

// Condiciones NECESARIAS para reclamar el efecto economico de un APPROVED nuevo.
// La garantia real es el update condicional en PostgreSQL; esta funcion pura
// documenta y prueba la misma regla (status APPROVED, sin efecto previo, sin cuarentena).
export function canClaimApprovedEffect(payment: ClaimablePaymentState): boolean {
  return (
    payment.status === "APPROVED" &&
    payment.approvedEffectAppliedAt === null &&
    payment.approvedEffectReconciliationRequired === false
  );
}

// Enmascara un ID externo para mostrarlo sin filtrar el valor completo.
export function maskExternalId(id: string): string {
  if (!id) return "(vacio)";
  if (id.length <= 8) return "*".repeat(id.length);
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

// Metadata segura para la auditoria de reconciliacion (sin importes ni secretos).
export function buildReconciliationAuditMetadata(input: {
  paymentId: string;
  externalId: string | null;
  reason: string;
  appliedAt: Date;
}): Record<string, string> {
  return {
    action: "manual-reconciliation",
    paymentId: input.paymentId,
    externalId: input.externalId ? maskExternalId(input.externalId) : "(sin externalId)",
    reason: input.reason.trim(),
    appliedAt: input.appliedAt.toISOString(),
  };
}

// --- Parseo y validacion del CLI (puro, sin conexion) ------------------------

export type ReconcileCommand =
  | { command: "list" }
  | { command: "mark-applied"; paymentId: string; reason: string; confirmProduction: boolean; confirmPaymentId: string | null }
  | { command: "error"; message: string };

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) return undefined;
  return value;
}

// argv es process.argv.slice(2). Por defecto (sin args) => list (solo lectura).
export function parseReconcileArgs(argv: string[]): ReconcileCommand {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "list";

  if (command === "list") {
    return { command: "list" };
  }

  if (command === "mark-applied") {
    const paymentIds = argv.filter((_, i) => argv[i - 1] === "--payment-id");
    const paymentId = readFlag(argv, "--payment-id");
    const reason = readFlag(argv, "--reason");
    const confirmProduction = argv.includes("--confirm-production");
    const confirmPaymentId = readFlag(argv, "--confirm-payment-id") ?? null;
    if (!paymentId) {
      return { command: "error", message: "Falta --payment-id (obligatorio para mark-applied)." };
    }
    // Un solo pago por ejecucion: nunca wildcard ni varios --payment-id.
    if (paymentId === "*" || paymentIds.length > 1) {
      return { command: "error", message: "mark-applied opera sobre UN solo --payment-id (sin wildcard ni multiples IDs)." };
    }
    if (!reason || reason.trim() === "") {
      return { command: "error", message: "Falta --reason con un motivo no vacio." };
    }
    return { command: "mark-applied", paymentId, reason, confirmProduction, confirmPaymentId };
  }

  return { command: "error", message: `Comando no reconocido: "${command}". Usa: list | mark-applied.` };
}

// Doble confirmacion en destinos que NO parecen de pruebas: exige --confirm-production
// y repetir el ID exacto en --confirm-payment-id. En una base de pruebas no se exige
// repetir el ID. La confirmacion nunca proviene de variables de entorno.
export function validateProductionConfirmation(input: {
  isTestTarget: boolean;
  paymentId: string;
  confirmProduction: boolean;
  confirmPaymentId: string | null;
}): { ok: true } | { ok: false; message: string } {
  if (input.isTestTarget) return { ok: true };
  if (!input.confirmProduction) {
    return { ok: false, message: "La base no parece de pruebas: agrega --confirm-production para escribir." };
  }
  if (!input.confirmPaymentId) {
    return { ok: false, message: "En produccion debes repetir el ID con --confirm-payment-id <id>." };
  }
  if (input.confirmPaymentId !== input.paymentId) {
    return { ok: false, message: "El --confirm-payment-id no coincide con --payment-id." };
  }
  return { ok: true };
}

// --- Evidencia de auditoria del webhook para un pago (helpers PUROS) ----------
// El webhook audita con targetId = subscriptionId y metadata.externalId = ID del pago.
// La evidencia se busca por subscriptionId y se filtra en memoria por externalId,
// NUNCA por tenantId (evita contar auditorias de otro pago del mismo conjunto).

export const WEBHOOK_AUDIT_ACTIONS = ["MERCADO_PAGO_WEBHOOK_PROCESSED"] as const;

export interface AuditEvidenceRow {
  action: string;
  createdAt: Date;
  metadata: unknown;
}

export interface AuditEvidenceSummary {
  count: number;
  actions: string[];
  latestAt: string | null;
}

// Estricto y tolerante a metadata nula/malformada: no lanza excepcion.
export function auditMetadataMatchesPayment(metadata: unknown, externalId: string): boolean {
  if (!externalId) return false;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return record.provider === "MERCADO_PAGO" && record.externalId === externalId;
}

export function summarizeAuditEvidence(rows: AuditEvidenceRow[], externalId: string): AuditEvidenceSummary {
  const matching = rows.filter((row) => auditMetadataMatchesPayment(row.metadata, externalId));
  const actions = Array.from(new Set(matching.map((row) => row.action)));
  const latest = matching.reduce<Date | null>((acc, row) => (acc === null || row.createdAt > acc ? row.createdAt : acc), null);
  return {
    count: matching.length,
    actions,
    latestAt: latest ? latest.toISOString() : null,
  };
}
