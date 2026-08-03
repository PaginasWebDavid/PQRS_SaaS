export function paymentProviderLabel(provider: string): string {
  if (provider === "COURTESY") return "Cortesía";
  // OJO: SIMULATED no es un pago recibido. Lo genera el boton de renovacion
  // manual del Super Admin y no representa dinero que haya entrado. Antes
  // decia "Pago manual", que se lee como "recibi una transferencia y la
  // registre", justo lo contrario de lo que es.
  if (provider === "SIMULATED") return "Registro manual · sin cobro";
  if (provider === "MERCADO_PAGO") return "Mercado Pago";
  return "Otro";
}

// Un pago solo representa dinero real si entro por la pasarela.
export function isRealMoneyProvider(provider: string): boolean {
  return provider === "MERCADO_PAGO";
}
