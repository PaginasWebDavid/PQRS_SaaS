export function paymentProviderLabel(provider: string): string {
  if (provider === "COURTESY") return "Cortesia";
  if (provider === "SIMULATED") return "Pago manual";
  if (provider === "MERCADO_PAGO") return "Mercado Pago";
  return "Otro";
}