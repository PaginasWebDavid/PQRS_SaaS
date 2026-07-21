// Fuente unica de las etiquetas en espanol de un estado de licencia/suscripcion.
// No importar prisma aqui: este modulo se usa tanto en componentes cliente (admin/licencias)
// como en billing.service.ts, y debe seguir siendo seguro para el bundle del navegador.
export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Falta primer pago',
  TRIAL: 'Trial',
  ACTIVE: 'Activa',
  GRACE_PERIOD: 'En mora',
  SUSPENDED: 'Suspendida',
  CANCELLED: 'Cancelada',
};
