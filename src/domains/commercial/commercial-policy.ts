import { createHash } from "node:crypto";

export const PILOT_ACCESS_DAYS = 45;
export const PILOT_RECOMMENDED_LAUNCH_DAYS = 7;
export const PILOT_EVALUATION_DAY = 38;
export const MONTHLY_PERIOD_DAYS = 30;
export const ANNUAL_DISCOUNT_BPS = 1000;
export const MAX_COMMERCIAL_DISCOUNT_BPS = 500;
export const MAX_FOUNDER_CUSTOMERS = 10;
export const ASSISTED_IMPLEMENTATION_FEE_CENTS = 250_000 * 100;

export function addCalendarDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

export function addCalendarMonths(value: Date, months: number): Date {
  const result = new Date(value);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function pilotDatesFromPayment(paidAt: Date) {
  return {
    pilotPreparationStartsAt: paidAt,
    recommendedLaunchAt: addCalendarDays(paidAt, PILOT_RECOMMENDED_LAUNCH_DAYS),
    pilotEvaluationAt: addCalendarDays(paidAt, PILOT_EVALUATION_DAY - 1),
    decisionDueAt: addCalendarDays(paidAt, PILOT_ACCESS_DAYS),
    pilotAccessEndsAt: addCalendarDays(paidAt, PILOT_ACCESS_DAYS),
  };
}

export function applyBasisPointDiscount(listPriceCents: number, discountBps: number): number {
  if (!Number.isSafeInteger(listPriceCents) || listPriceCents <= 0) throw new Error("Precio de lista invalido");
  if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10_000) throw new Error("Descuento invalido");
  return Math.round((listPriceCents * (10_000 - discountBps)) / 10_000);
}

export function annualTerms(monthlyListPriceCents: number) {
  const listPriceCents = monthlyListPriceCents * 12;
  return { listPriceCents, discountBps: ANNUAL_DISCOUNT_BPS, effectivePriceCents: applyBasisPointDiscount(listPriceCents, ANNUAL_DISCOUNT_BPS) };
}

export function assertCommercialDiscount(input: { discountBps: number; reason?: string | null; startsAt?: Date | null; endsAt?: Date | null }) {
  if (!Number.isSafeInteger(input.discountBps) || input.discountBps < 0 || input.discountBps > MAX_COMMERCIAL_DISCOUNT_BPS) {
    throw new Error("El descuento comercial debe estar entre 0 % y 5 %");
  }
  if (input.discountBps === 0) return;
  if (!input.reason?.trim()) throw new Error("El descuento requiere un motivo");
  if (!input.startsAt || !input.endsAt || input.endsAt <= input.startsAt) throw new Error("El descuento requiere una vigencia valida");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value instanceof Date ? value.toISOString() : value;
}

export function commercialRequestHash(action: string, payload: unknown): string {
  return createHash("sha256").update(JSON.stringify({ action, payload: canonical(payload) })).digest("hex");
}

export function normalizeCommercialOperationId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) throw new Error("Identificador de operacion invalido");
  return normalized;
}
