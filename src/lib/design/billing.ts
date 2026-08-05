export function paymentProviderLabel(provider: string): string {
  if (provider === "COURTESY") return "Cortesía";
  // OJO: SIMULATED no es un pago recibido. Lo genera el boton de renovacion
  // manual del Super Admin y no representa dinero que haya entrado. Antes
  // decia "Pago manual", que se lee como "recibi una transferencia y la
  // registre", justo lo contrario de lo que es.
  if (provider === "SIMULATED") return "Registro manual · sin cobro";
  if (provider === "MERCADO_PAGO") return "Mercado Pago";
  if (provider === "WOMPI") return "Wompi";
  if (provider === "MANUAL_TRANSFER") return "Transferencia confirmada";
  return "Otro";
}

// Fuente unica de que proveedores representan dinero que de verdad entro.
// La consulta de caja del mes (billing.service.ts) y la UI leen de aqui: si
// cada lado tuviera su propia lista, agregar una pasarela nueva la sumaria en
// un sitio y no en el otro, y los totales dejarian de cuadrar en silencio.
export const REAL_MONEY_PROVIDERS = ["MERCADO_PAGO", "WOMPI", "MANUAL_TRANSFER"] as const;

// Un pago solo representa dinero real si entro por la pasarela o por una
// transferencia confirmada. SIMULATED es una anotacion del Super Admin.
export function isRealMoneyProvider(provider: string): boolean {
  return (REAL_MONEY_PROVIDERS as readonly string[]).includes(provider);
}
