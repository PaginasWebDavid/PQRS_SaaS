// Fuente UNICA del calculo de periodo de facturacion y resolucion de terminos
// pendientes. Modulo PURO: no importa Prisma ni tiene efectos secundarios, para
// que webhook, renovacion simulada y pruebas consuman la misma logica.

// Unica constante de duracion del periodo. Reemplaza las copias que existian en
// billing.service.ts y wompi.service.ts.
export const BILLING_PERIOD_DAYS = 30;

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export interface EffectiveTerms {
  unitsSnapshot: number;
  priceCents: number;
  currency: string;
}

export interface PendingTermsInput {
  pendingUnitsSnapshot: number | null;
  pendingPriceCents: number | null;
  pendingCurrency: string | null;
  // Moneda a usar cuando hay unidades/precio pendientes pero no moneda pendiente.
  fallbackCurrency: string;
}

export interface NextPeriodInput {
  currentPeriodEnd: Date;
  now: Date;
  periodDays: number;
  // Terminos pendientes a aplicar en esta renovacion, si los hay.
  pending?: PendingTermsInput;
}

export interface NextPeriodResult {
  periodStart: Date;
  periodEnd: Date;
  // Terminos efectivos a aplicar (desde los pendientes) o null si no hay cambio.
  effectiveTerms: EffectiveTerms | null;
  // true si hay campos pendientes que deben limpiarse tras aplicar.
  clearPending: boolean;
}

// Resuelve los terminos efectivos a partir de los pendientes. Solo hay terminos
// nuevos cuando existen unidades Y precio pendientes.
export function resolveEffectiveTerms(pending?: PendingTermsInput): EffectiveTerms | null {
  if (!pending) return null;
  if (pending.pendingUnitsSnapshot === null || pending.pendingPriceCents === null) return null;
  return {
    unitsSnapshot: pending.pendingUnitsSnapshot,
    priceCents: pending.pendingPriceCents,
    currency: pending.pendingCurrency ?? pending.fallbackCurrency,
  };
}

// Calcula el siguiente periodo. Si el periodo vigente aun no vencio, el nuevo
// arranca donde termina el actual (no se pierden dias pagados); si ya vencio,
// arranca en `now`.
export function computeNextPeriod(input: NextPeriodInput): NextPeriodResult {
  const periodStart = input.currentPeriodEnd > input.now ? input.currentPeriodEnd : input.now;
  const periodEnd = addDays(periodStart, input.periodDays);
  const effectiveTerms = resolveEffectiveTerms(input.pending);
  return {
    periodStart,
    periodEnd,
    effectiveTerms,
    clearPending: effectiveTerms !== null,
  };
}
