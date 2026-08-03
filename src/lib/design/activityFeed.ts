// Traduccion de acciones de auditoria a frases para el cliente (Admin y
// Consejo ven este feed). Vivia duplicado en las dos paginas de actividad y
// ya habia empezado a divergir, asi que ahora es una sola fuente.
//
// Regla: nunca mostrar el nombre crudo de la accion. El fallback describe la
// categoria en lenguaje natural, no "report generated · PqrsReport".

export type ActivityEntry = {
  id: string;
  action: string;
  targetType?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { name?: string | null; email?: string | null } | null;
};

export function activityCategory(action: string): 'pqrs' | 'usuarios' | 'licencia' {
  if (action.startsWith('PQRS_')) return 'pqrs';
  if (action.startsWith('INVITATION_') || action.startsWith('USER_') || action === 'ONBOARDING_COMPLETED' || action === 'PROFILE_UPDATED') return 'usuarios';
  return 'licencia';
}

function metaValue(entry: ActivityEntry, key: string): string {
  const value = entry.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

export function activityActorName(entry: ActivityEntry): string {
  return entry.actor?.name || entry.actor?.email || 'Alguien';
}

export function describeActivity(entry: ActivityEntry): string {
  const who = activityActorName(entry);
  const email = metaValue(entry, 'email');
  switch (entry.action) {
    case 'PQRS_CREATED':
      return `${who} radicó una nueva PQRS${metaValue(entry, 'asunto') ? ` — "${metaValue(entry, 'asunto')}"` : ''}`;
    case 'PQRS_UPDATED':
      return `${who} actualizó una PQRS`;
    case 'PQRS_CLOSED':
      return `${who} cerró una PQRS`;
    case 'INVITATION_CREATED':
      return `${who} invitó a ${email || 'un nuevo usuario'}`;
    case 'INVITATION_RESENT':
      return `${who} reenvió la invitación a ${email}`;
    case 'INVITATION_ACCEPTED':
      return `${email || who} aceptó su invitación y activó su cuenta`;
    case 'INVITATION_CANCELLED':
      return `${who} canceló la invitación a ${email}`;
    case 'INVITATION_EXPIRED':
      return `La invitación a ${email} expiró sin ser aceptada`;
    case 'USER_UPDATED':
      return `${who} actualizó los datos de un usuario`;
    case 'USER_DEACTIVATED':
      return `${who} desactivó un usuario`;
    case 'USER_REACTIVATED':
      return `${who} reactivó un usuario`;
    case 'ONBOARDING_COMPLETED':
      return `${who} terminó de crear su cuenta`;
    case 'PROFILE_UPDATED':
      return `${who} actualizó su perfil`;
    case 'PASSWORD_CHANGED':
      return `${who} cambió su contraseña`;
    case 'PASSWORD_RESET_REQUESTED':
      return `${who} pidió restablecer su contraseña`;
    case 'PASSWORD_RESET_COMPLETED':
      return `${who} restableció su contraseña`;
    case 'AVATAR_UPDATED':
    case 'AVATAR_REMOVED':
      return `${who} cambió su foto de perfil`;
    case 'TENANT_CREATED':
      return 'Tu conjunto fue creado en la plataforma';
    case 'TENANT_UPDATED':
      return `${who} actualizó los datos del conjunto`;
    case 'TENANT_SUSPENDED':
      return 'La licencia del conjunto fue suspendida';
    case 'TENANT_REACTIVATED':
      return 'La licencia del conjunto fue reactivada';
    case 'TENANT_CANCELLED':
      return 'La licencia del conjunto fue cancelada';
    case 'TENANT_OVERDUE_RULES_APPLIED':
      return 'El sistema revisó el estado de pago de la licencia';
    case 'SUBSCRIPTION_CREATED':
      return 'Se generó la licencia del conjunto, pendiente de primer pago';
    case 'SUBSCRIPTION_RENEWED':
      return 'La licencia fue renovada';
    case 'MERCADO_PAGO_SUBSCRIPTION_CREATED':
      return `${who} inició el pago de la licencia con Mercado Pago`;
    case 'MERCADO_PAGO_WEBHOOK_PROCESSED':
      return 'Mercado Pago confirmó un movimiento sobre la licencia';
    case 'SUBSCRIPTION_AUTO_RENEW_DISABLED':
      return `${who} desactivó la renovación automática de la licencia`;
    case 'SUBSCRIPTION_AUTO_RENEW_ENABLED':
      return `${who} activó la renovación automática de la licencia`;
    case 'SUBSCRIPTION_PAYMENT_FAILED':
      return 'Un pago de la licencia fue rechazado';
    case 'PAYMENT_SIMULATED':
      return 'Se registró un pago manual de la licencia';
    case 'PAYMENT_RECONCILED':
      return 'Se reconcilió un pago de la licencia';
    case 'REPORT_GENERATED':
      return `${who} generó un reporte`;
    case 'REPORT_EXPORTED':
      return `${who} exportó un reporte`;
    case 'EMAIL_SENT':
      return 'Se envió un correo de notificación';
    case 'EMAIL_FAILED':
      return 'No se pudo enviar un correo de notificación';
    case 'NOTIFICATION_CREATED':
      return 'Se generó una notificación para un usuario';
    default: {
      const scope = activityCategory(entry.action);
      if (scope === 'pqrs') return `${who} hizo un cambio en una PQRS`;
      if (scope === 'usuarios') return `${who} hizo un cambio sobre un usuario`;
      return 'Hubo un movimiento en la licencia del conjunto';
    }
  }
}
