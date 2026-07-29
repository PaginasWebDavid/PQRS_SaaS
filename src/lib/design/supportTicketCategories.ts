export const SUPPORT_TICKET_CATEGORY_LABELS: Record<string, string> = {
  TECNICO: "Tecnico",
  FACTURACION: "Facturacion",
  CUENTA: "Cuenta",
  OTRO: "Otro",
  TECHNICAL: "Tecnico",
  ACCESS: "Acceso",
  PRIVACY_SECURITY: "Privacidad / seguridad",
  BILLING: "Facturacion",
};

export function supportTicketCategoryLabel(category: string): string {
  return SUPPORT_TICKET_CATEGORY_LABELS[category] || "Otro";
}