// Modulo PURO de PRECEDENCIA y COBERTURA de facturacion.
//
// No importa el cliente Prisma ni abre conexiones: solo usa TIPOS (import type)
// para que el webhook, el preapproval, los guards de acceso y las pruebas consuman
// exactamente la misma logica de decision. Toda entrada es un dato ya cargado.
//
// Resuelve tres problemas distintos que antes se mezclaban:
//   1. Precedencia de estados de un mismo Payment (F2-08): un estado inferior nunca
//      hace retroceder a uno superior; APPROVED aplicado es terminal.
//   2. Estados desconocidos del proveedor (F2-03): no se convierten en un estado
//      inferior; se ignoran de forma segura conservando el estado local.
//   3. Tres definiciones SEPARADAS de cobertura (F2-04): acceso, pago real e
//      evidencia aplicada (real o administrativa) no son lo mismo.

import type { PaymentStatus, SubscriptionStatus } from "@prisma/client";

// --- Razones de decision (constantes TS, NO enums Prisma) --------------------
// Se guardan en metadata del ledger/auditoria. No requieren migracion.
export const PRECEDENCE_REASON = {
  APPLIES: "APPLIES",
  APPROVED_IS_TERMINAL: "APPROVED_IS_TERMINAL",
  LOWER_PRECEDENCE_STATUS: "LOWER_PRECEDENCE_STATUS",
  CURRENT_ACCESS_COVERED: "CURRENT_ACCESS_COVERED",
  UNKNOWN_PROVIDER_STATUS: "UNKNOWN_PROVIDER_STATUS",
  HISTORICAL_PAYMENT_NOT_APPLICABLE: "HISTORICAL_PAYMENT_NOT_APPLICABLE",
  TERMINAL_SUBSCRIPTION_STATUS: "TERMINAL_SUBSCRIPTION_STATUS",
  // Una Subscription ya en GRACE_PERIOD conserva su frontera; un webhook no
  // aprobado nunca reinicia graceEndsAt (F2D-01). El cron decide la suspension.
  EXISTING_GRACE_PRESERVED: "EXISTING_GRACE_PRESERVED",
  PREAPPROVAL_PAUSED_PRESERVED: "PREAPPROVAL_PAUSED_PRESERVED",
  PREAPPROVAL_CANCELLED: "PREAPPROVAL_CANCELLED",
} as const;

export type PrecedenceReason = (typeof PRECEDENCE_REASON)[keyof typeof PRECEDENCE_REASON];

// Razones de conservacion de ACCESO cuando un pago APPROVED se aplica sobre una
// Subscription terminal (F2D-04). El efecto economico se aplica; el acceso no.
export const ACCESS_PRESERVED_REASON = {
  SUSPENDED_REQUIRES_MANUAL_REACTIVATION: "SUSPENDED_REQUIRES_MANUAL_REACTIVATION",
  CANCELLED_ACCESS_PRESERVED: "CANCELLED_ACCESS_PRESERVED",
} as const;

// Longitud maxima de cualquier etiqueta de estado del proveedor persistida o
// registrada en metadata/ledger (F2F-05). Evita que un payload malicioso o
// malformado infle rawStatus o la metadata.
export const MAX_PROVIDER_STATUS_LENGTH = 255;

// Trunca de forma segura un string a la longitud maxima permitida.
export function truncateProviderStatus(value: string): string {
  return value.length > MAX_PROVIDER_STATUS_LENGTH ? value.slice(0, MAX_PROVIDER_STATUS_LENGTH) : value;
}

// Etiqueta SEGURA y acotada de un estado de proveedor recibido por JSON. Nunca
// serializa el valor completo: string -> recortado y truncado al maximo; no-string
// -> nombre del tipo (F2D-05/F2D-07/F2F-05). null/undefined -> "" (ausencia).
// Es pura y no lanza.
export function providerStatusLabel(value: unknown): string {
  if (typeof value === "string") return truncateProviderStatus(value.trim());
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return "array";
  return typeof value; // "number" | "boolean" | "object" | ...
}

// --- Normalizacion de estados de Payment del proveedor -----------------------

export type KnownPaymentStatus = Extract<PaymentStatus, "PENDING" | "REJECTED" | "APPROVED">;

export type NormalizedProviderPaymentStatus =
  | { known: true; status: KnownPaymentStatus }
  | { known: false; rawStatus: string };

// Estados de Mercado Pago que reconocemos como "pendiente" legitimo.
const KNOWN_PENDING = new Set(["pending", "in_process", "in_mediation"]);
const KNOWN_APPROVED = new Set(["approved", "authorized"]);
const KNOWN_REJECTED = new Set(["rejected", "cancelled", "canceled"]);

// A diferencia del mapeo anterior (cualquier valor -> PENDING), un valor no
// reconocido NO se degrada a PENDING: se marca como desconocido para que el
// llamador lo ignore de forma segura (sin tocar Payment/Subscription/Tenant).
//
// Acepta `unknown` porque proviene de JSON externo: un numero, booleano, objeto o
// array NO debe lanzar (F2D-05). Se valida el tipo ANTES de llamar a .trim().
export function normalizeProviderPaymentStatus(raw: unknown): NormalizedProviderPaymentStatus {
  if (typeof raw !== "string") return { known: false, rawStatus: providerStatusLabel(raw) };
  const normalized = raw.trim().toLowerCase();
  if (KNOWN_APPROVED.has(normalized)) return { known: true, status: "APPROVED" };
  if (KNOWN_REJECTED.has(normalized)) return { known: true, status: "REJECTED" };
  if (KNOWN_PENDING.has(normalized)) return { known: true, status: "PENDING" };
  return { known: false, rawStatus: truncateProviderStatus(raw.trim()) };
}

// --- Precedencia de fila de un mismo Payment (F2-08) -------------------------

// Rango monotono: PENDING < REJECTED < APPROVED. Un evento solo puede MANTENER o
// SUBIR el estado; nunca bajarlo. Un APPROVED con efecto aplicado es terminal.
const PAYMENT_RANK: Record<KnownPaymentStatus, number> = { PENDING: 1, REJECTED: 2, APPROVED: 3 };

export interface CurrentPaymentRowState {
  status: KnownPaymentStatus;
  approvedEffectAppliedAt: Date | null;
}

export interface PaymentRowDecision {
  // APPLY: se escribe nextPaymentStatus. PRESERVE: se conserva el estado actual
  // (solo metadata no economica como rawStatus puede refrescarse).
  paymentStatusAction: "APPLY" | "PRESERVE";
  nextPaymentStatus: KnownPaymentStatus;
  reason: PrecedenceReason;
}

// current === null => fila nueva (aun no existe Payment con ese id externo).
export function decidePaymentRowTransition(input: {
  incoming: KnownPaymentStatus;
  current: CurrentPaymentRowState | null;
}): PaymentRowDecision {
  const { incoming, current } = input;

  if (!current) {
    return { paymentStatusAction: "APPLY", nextPaymentStatus: incoming, reason: PRECEDENCE_REASON.APPLIES };
  }

  // APPROVED con efecto aplicado es terminal aunque el status persistido difiera.
  const currentIsTerminal = current.status === "APPROVED" || current.approvedEffectAppliedAt !== null;
  if (currentIsTerminal && incoming !== "APPROVED") {
    return {
      paymentStatusAction: "PRESERVE",
      nextPaymentStatus: "APPROVED",
      reason: PRECEDENCE_REASON.APPROVED_IS_TERMINAL,
    };
  }

  const incomingRank = PAYMENT_RANK[incoming];
  const currentRank = PAYMENT_RANK[current.status];

  if (incomingRank >= currentRank) {
    // Igual (refresco de metadata idempotente) o superior (PENDING->REJECTED/APPROVED,
    // REJECTED->APPROVED). Se aplica.
    return { paymentStatusAction: "APPLY", nextPaymentStatus: incoming, reason: PRECEDENCE_REASON.APPLIES };
  }

  // incomingRank < currentRank: p.ej. REJECTED actual + PENDING entrante. No retrocede.
  return {
    paymentStatusAction: "PRESERVE",
    nextPaymentStatus: current.status,
    reason: PRECEDENCE_REASON.LOWER_PRECEDENCE_STATUS,
  };
}

// --- Decision de Subscription para un evento NO-APPROVED ---------------------
// Decide si un PENDING/REJECTED puede degradar el acceso a GRACE_PERIOD. Es puro:
// recibe la cobertura ya calculada. La regla economica de doble extension sigue
// viviendo en el marcador atomico approvedEffectAppliedAt (fuera de este modulo).

export interface NonApprovedSubscriptionDecision {
  subscriptionAction: "ENTER_GRACE" | "PRESERVE";
  reason: PrecedenceReason;
}

export function decideSubscriptionActionForNonApproved(input: {
  incoming: Extract<KnownPaymentStatus, "PENDING" | "REJECTED">;
  currentSubscriptionStatus: SubscriptionStatus;
  // El propio Payment que llega ya es APPROVED/efecto aplicado (evento tardio).
  currentPaymentIsTerminal: boolean;
  // hasCurrentAccessCoverage sobre la Subscription.
  accessCovered: boolean;
  // hasCurrentAppliedAccessEvidence sobre OTROS pagos (real o simulado vigente).
  appliedAccessEvidenceElsewhere: boolean;
}): NonApprovedSubscriptionDecision {
  // Un evento no aprobado nunca reanima ni degrada un estado terminal de negocio.
  if (input.currentSubscriptionStatus === "CANCELLED" || input.currentSubscriptionStatus === "SUSPENDED") {
    return { subscriptionAction: "PRESERVE", reason: PRECEDENCE_REASON.TERMINAL_SUBSCRIPTION_STATUS };
  }
  // Ya en GRACE_PERIOD: se conserva la frontera existente (vigente, vencida o null).
  // Un webhook no aprobado NUNCA reinicia graceEndsAt (F2D-01); el cron de la
  // siguiente subfase decidira la suspension de una gracia vencida o inconsistente.
  if (input.currentSubscriptionStatus === "GRACE_PERIOD") {
    return { subscriptionAction: "PRESERVE", reason: PRECEDENCE_REASON.EXISTING_GRACE_PRESERVED };
  }
  // El evento corresponde a un pago que ya aprobo: no puede quitar su propio acceso.
  if (input.currentPaymentIsTerminal) {
    return { subscriptionAction: "PRESERVE", reason: PRECEDENCE_REASON.APPROVED_IS_TERMINAL };
  }
  // Hay cobertura vigente (por la propia suscripcion o por otro pago aplicado).
  if (input.accessCovered || input.appliedAccessEvidenceElsewhere) {
    return { subscriptionAction: "PRESERVE", reason: PRECEDENCE_REASON.CURRENT_ACCESS_COVERED };
  }
  return { subscriptionAction: "ENTER_GRACE", reason: PRECEDENCE_REASON.APPLIES };
}

// --- Cobertura de ACCESO (F2-04, definicion 1) -------------------------------
// Decide si el conjunto tiene acceso operativo AHORA. NO decide ingreso real: no
// exige provider Mercado Pago. Trial y cortesia cuentan como acceso.

export interface AccessCoverageInput {
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  trialEndsAt: Date | null;
  now: Date;
}

export function hasCurrentAccessCoverage(input: AccessCoverageInput): boolean {
  const { subscriptionStatus, now } = input;
  switch (subscriptionStatus) {
    case "TRIAL":
      return input.trialEndsAt !== null && input.trialEndsAt > now;
    case "ACTIVE":
      return input.currentPeriodEnd !== null && input.currentPeriodEnd > now;
    case "GRACE_PERIOD":
      // graceEndsAt = null es una inconsistencia (no evidencia de que la gracia
      // termino); su reparacion es de otra subfase. Aqui NO otorga acceso perpetuo.
      return input.graceEndsAt !== null && input.graceEndsAt > now;
    case "PENDING_PAYMENT":
    case "SUSPENDED":
    case "CANCELLED":
    default:
      return false;
  }
}

// --- Cobertura de PAGO REAL (F2-04, definicion 2) ----------------------------
// Ingreso real vigente de Mercado Pago o transferencia manual confirmada. NO cuenta SIMULATED, cortesia, cuarentena,
// pagos sin efecto aplicado ni periodos vencidos. El llamador debe acotar las
// filas por tenant + subscription (identidad exacta) en la consulta.

export interface PaymentCoverageRow {
  // Identidad exacta de la fila. Se exige la pareja tenantId+subscriptionId (F2F-02):
  // el schema permite dos FKs independientes, asi que una fila con el tenant objetivo
  // y una subscription ajena NO debe contar como cobertura.
  tenantId: string;
  subscriptionId: string;
  provider: string;
  status: string;
  periodEnd: Date | null;
  approvedEffectAppliedAt: Date | null;
  approvedEffectReconciliationRequired: boolean;
}

// Identidad esperada que toda cobertura debe exigir. Una fila que no coincida en
// AMBOS campos se descarta aunque el caller la haya cargado por error.
export interface CoverageIdentity {
  tenantId: string;
  subscriptionId: string;
}

function matchesIdentity(row: PaymentCoverageRow, identity: CoverageIdentity): boolean {
  return row.tenantId === identity.tenantId && row.subscriptionId === identity.subscriptionId;
}

export function isCurrentRealPaymentRow(row: PaymentCoverageRow, now: Date, identity: CoverageIdentity): boolean {
  return (
    matchesIdentity(row, identity) &&
    (row.provider === "MERCADO_PAGO" || row.provider === "MANUAL_TRANSFER") &&
    row.status === "APPROVED" &&
    row.approvedEffectAppliedAt !== null &&
    row.approvedEffectReconciliationRequired === false &&
    row.periodEnd !== null &&
    row.periodEnd > now
  );
}

export function hasCurrentRealPaymentCoverage(rows: PaymentCoverageRow[], now: Date, identity: CoverageIdentity): boolean {
  return rows.some((row) => isCurrentRealPaymentRow(row, now, identity));
}

// --- EVIDENCIA de acceso aplicada (F2-04, definicion 3) ----------------------
// Evidencia vigente que justifica conservar/reactivar el acceso: un pago real
// (mismos requisitos que la cobertura real) O una renovacion simulada/cortesia
// administrativa vigente (provider SIMULATED, APPROVED, periodo vigente). NO es
// ingreso real: sirve para acceso y reactivacion, nunca para reportes de ingresos.

export function isCurrentSimulatedAccessRow(row: PaymentCoverageRow, now: Date, identity: CoverageIdentity): boolean {
  return (
    matchesIdentity(row, identity) &&
    (row.provider === "SIMULATED" || row.provider === "COURTESY") &&
    row.status === "APPROVED" &&
    row.approvedEffectReconciliationRequired === false &&
    row.periodEnd !== null &&
    row.periodEnd > now
  );
}

export function isCurrentAppliedAccessEvidenceRow(row: PaymentCoverageRow, now: Date, identity: CoverageIdentity): boolean {
  return isCurrentRealPaymentRow(row, now, identity) || isCurrentSimulatedAccessRow(row, now, identity);
}

export function hasCurrentAppliedAccessEvidence(rows: PaymentCoverageRow[], now: Date, identity: CoverageIdentity): boolean {
  return rows.some((row) => isCurrentAppliedAccessEvidenceRow(row, now, identity));
}

// --- Preapproval: precedencia y cobertura ------------------------------------

export type PreapprovalKind = "AUTHORIZED" | "PAUSED" | "CANCELLED" | "PENDING";

export type NormalizedPreapprovalStatus =
  | { known: true; kind: PreapprovalKind }
  | { known: false; rawStatus: string };

// Acepta `unknown` por la misma razon que normalizeProviderPaymentStatus (F2D-05).
export function normalizePreapprovalStatus(status: unknown): NormalizedPreapprovalStatus {
  if (typeof status !== "string") return { known: false, rawStatus: providerStatusLabel(status) };
  const normalized = status.trim().toLowerCase();
  if (normalized === "authorized") return { known: true, kind: "AUTHORIZED" };
  if (normalized === "paused") return { known: true, kind: "PAUSED" };
  if (normalized === "cancelled" || normalized === "canceled") return { known: true, kind: "CANCELLED" };
  if (normalized === "pending") return { known: true, kind: "PENDING" };
  return { known: false, rawStatus: truncateProviderStatus(status.trim()) };
}

export interface PreapprovalDecision {
  // SET: se escribe nextStatus en Subscription/Tenant. PRESERVE: solo metadata
  // (mercadoPagoStatus/lastWebhookAt), sin cambiar acceso. IGNORE: estado
  // desconocido -> nada, ledger IGNORED.
  action: "SET" | "PRESERVE" | "IGNORE";
  nextStatus: SubscriptionStatus;
  reason: PrecedenceReason;
}

// Solo precedencia y conservacion de cobertura. NO implementa politica comercial
// de cancelacion (fuera de alcance): cancelled conserva el comportamiento previo.
export function decidePreapprovalOutcome(input: {
  normalized: NormalizedPreapprovalStatus;
  accessCovered: boolean;
  realPaymentCovered: boolean;
  trialValid: boolean;
  currentStatus: SubscriptionStatus;
}): PreapprovalDecision {
  const { normalized, accessCovered, realPaymentCovered, trialValid, currentStatus } = input;

  if (!normalized.known) {
    return { action: "IGNORE", nextStatus: currentStatus, reason: PRECEDENCE_REASON.UNKNOWN_PROVIDER_STATUS };
  }

  // Cancelled entrante: la politica de cancelacion queda FUERA DE ALCANCE; se
  // conserva el comportamiento previo (marcar CANCELLED). Se evalua antes del guard
  // de terminales porque es la unica accion administrativa explicita del proveedor.
  if (normalized.kind === "CANCELLED") {
    return { action: "SET", nextStatus: "CANCELLED", reason: PRECEDENCE_REASON.PREAPPROVAL_CANCELLED };
  }

  // Guard de estados terminales (F2D-03): authorized/paused/pending NO alteran una
  // Subscription SUSPENDED o CANCELLED. Solo una accion administrativa explicita
  // (no un webhook de preapproval) puede sacarla de ese estado.
  if (currentStatus === "SUSPENDED" || currentStatus === "CANCELLED") {
    return { action: "PRESERVE", nextStatus: currentStatus, reason: PRECEDENCE_REASON.TERMINAL_SUBSCRIPTION_STATUS };
  }

  switch (normalized.kind) {
    case "AUTHORIZED":
      // "authorized" es autorizacion de cobro, no ingreso: no activa por si solo.
      if (realPaymentCovered) return { action: "SET", nextStatus: "ACTIVE", reason: PRECEDENCE_REASON.APPLIES };
      if (accessCovered)
        return { action: "PRESERVE", nextStatus: currentStatus, reason: PRECEDENCE_REASON.CURRENT_ACCESS_COVERED };
      if (trialValid) return { action: "SET", nextStatus: "TRIAL", reason: PRECEDENCE_REASON.APPLIES };
      return { action: "SET", nextStatus: "PENDING_PAYMENT", reason: PRECEDENCE_REASON.APPLIES };

    case "PENDING":
      // No convierte una suscripcion cubierta en un estado inferior.
      if (accessCovered || realPaymentCovered)
        return { action: "PRESERVE", nextStatus: currentStatus, reason: PRECEDENCE_REASON.CURRENT_ACCESS_COVERED };
      if (trialValid) return { action: "SET", nextStatus: "TRIAL", reason: PRECEDENCE_REASON.APPLIES };
      return { action: "SET", nextStatus: "PENDING_PAYMENT", reason: PRECEDENCE_REASON.APPLIES };

    case "PAUSED":
    default:
      // Pausar cobros futuros NO es quitar acceso VIGENTE, pero tampoco debe inventar
      // acceso vencido (F2D-03). Con cobertura vigente -> PRESERVE; sin cobertura ->
      // fallback tecnico PENDING_PAYMENT (no una politica comercial de pausa).
      if (accessCovered || realPaymentCovered)
        return { action: "PRESERVE", nextStatus: currentStatus, reason: PRECEDENCE_REASON.PREAPPROVAL_PAUSED_PRESERVED };
      return { action: "SET", nextStatus: "PENDING_PAYMENT", reason: PRECEDENCE_REASON.APPLIES };
  }
}

// Traduce un estado conocido de Payment al estado de Subscription al degradar.
// APPROVED se maneja en la rama de extension; aqui solo interesan los no aprobados.
export function nonApprovedSubscriptionStatus(): SubscriptionStatus {
  return "GRACE_PERIOD";
}
