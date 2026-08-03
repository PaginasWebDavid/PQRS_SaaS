// Constantes puras de politica comercial, sin dependencias de Node.
// Viven aparte de commercial-policy.ts (que importa node:crypto) para que
// la UI de super-admin pueda mostrarlas sin duplicar los valores a mano.

export const PILOT_ACCESS_DAYS = 45;
export const PILOT_RECOMMENDED_LAUNCH_DAYS = 7;
export const PILOT_EVALUATION_DAY = 38;
export const MONTHLY_PERIOD_DAYS = 30;
export const ANNUAL_DISCOUNT_BPS = 1000;
export const MAX_COMMERCIAL_DISCOUNT_BPS = 500;
export const MAX_FOUNDER_CUSTOMERS = 10;
export const FOUNDER_PRICE_PROTECTION_MONTHS = 12;
export const ASSISTED_IMPLEMENTATION_FEE_CENTS = 250_000 * 100;

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

export function applyBasisPointDiscount(listPriceCents: number, discountBps: number): number {
  if (!Number.isSafeInteger(listPriceCents) || listPriceCents <= 0) throw new Error("Precio de lista invalido");
  if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10_000) throw new Error("Descuento invalido");
  return Math.round((listPriceCents * (10_000 - discountBps)) / 10_000);
}
