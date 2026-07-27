// Modulo PURO de decision de transiciones del cron de mora
// (`applyOverdueLicenseRules`). No importa Prisma en runtime (solo el TIPO
// `SubscriptionStatus`), no crea PrismaClient y no tiene efectos secundarios:
// recibe un snapshot minimo de Subscription + `now` y devuelve una decision
// discriminada. Asi el cron, las pruebas puras y cualquier revisor consumen la
// MISMA logica sin tocar la base de datos.
//
// Politica (FASE 2L, seccion 5):
//   - Estados terminales SUSPENDED / CANCELLED  -> PRESERVE.
//   - ACTIVE  con currentPeriodEnd <= now       -> TRANSITION a GRACE_PERIOD.
//   - TRIAL   con trialEndsAt     <= now        -> TRANSITION a GRACE_PERIOD.
//   - GRACE   con graceEndsAt     <= now        -> TRANSITION a SUSPENDED.
//   - GRACE   con graceEndsAt = null            -> INCONSISTENT (no se suspende,
//                                                  no se inventa fecha, no se toca
//                                                  Tenant; se reporta en el resumen).
//   - PENDING_PAYMENT                           -> PRESERVE (politica actual: el
//                                                  cron nunca lo transiciona).
//   - Estado desconocido / fechas invalidas     -> PRESERVE / INCONSISTENT segun
//                                                  el caso (fail-safe: nunca degrada
//                                                  a ciegas).
//
// Nota sobre la frontera `<= now`: la seccion 5 define la transicion en `<= now`
// (en el instante exacto se transiciona), a diferencia del `<` estricto previo.
// La consulta de candidatos del cron usa la misma frontera (`lte: now`) para que
// seleccion y decision no diverjan nunca.
//
// Nota sobre TRIAL: una suscripcion TRIAL se crea con `currentPeriodEnd` IGUAL a
// `trialEndsAt` (ver tenant-admin.service.ts), por lo que decidir el vencimiento
// del trial por `trialEndsAt` es equivalente al comportamiento nominal previo
// (que lo decidia por `currentPeriodEnd`). Si `trialEndsAt` fuese null, se usa
// `currentPeriodEnd` como respaldo para conservar ese comportamiento.

import type { SubscriptionStatus } from "@prisma/client";

// Snapshot MINIMO de la suscripcion. Los campos de fecha se aceptan como
// `Date | null` (defensa en runtime ante datos ausentes o corruptos). `status`
// se acepta tambien como `string` para no romper ante un valor de enum
// desconocido proveniente de la base (fail-safe: se preserva, no se degrada).
export interface CronSubscriptionSnapshot {
  status: SubscriptionStatus | string;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
}

export type CronTransitionKind = "TRIAL_EXPIRED" | "ACTIVE_EXPIRED" | "GRACE_EXPIRED";

export type CronTransitionDecision =
  | {
      action: "TRANSITION";
      transition: CronTransitionKind;
      nextStatus: SubscriptionStatus;
      reason: string;
    }
  | {
      action: "PRESERVE";
      reason: string;
    }
  | {
      action: "INCONSISTENT";
      reason: string;
    };

// Razones estables (no localizadas) para trazabilidad en auditoria/resumen.
export const CRON_DECISION_REASON = {
  TERMINAL_SUSPENDED: "TERMINAL_STATE_SUSPENDED_PRESERVED",
  TERMINAL_CANCELLED: "TERMINAL_STATE_CANCELLED_PRESERVED",
  PENDING_PAYMENT_PRESERVED: "PENDING_PAYMENT_PRESERVED",
  UNKNOWN_STATUS_PRESERVED: "UNKNOWN_STATUS_PRESERVED",
  ACTIVE_CURRENT: "ACTIVE_PERIOD_CURRENT",
  ACTIVE_EXPIRED_TO_GRACE: "ACTIVE_PERIOD_EXPIRED_TO_GRACE",
  ACTIVE_WITHOUT_PERIOD_END: "ACTIVE_WITHOUT_VALID_PERIOD_END",
  TRIAL_CURRENT: "TRIAL_CURRENT",
  TRIAL_EXPIRED_TO_GRACE: "TRIAL_EXPIRED_TO_GRACE",
  TRIAL_WITHOUT_BOUNDARY: "TRIAL_WITHOUT_VALID_BOUNDARY",
  GRACE_CURRENT: "GRACE_PERIOD_CURRENT",
  GRACE_EXPIRED_TO_SUSPENDED: "GRACE_PERIOD_EXPIRED_TO_SUSPENDED",
  GRACE_WITHOUT_BOUNDARY: "GRACE_PERIOD_WITHOUT_BOUNDARY",
  GRACE_INVALID_BOUNDARY: "GRACE_PERIOD_INVALID_BOUNDARY",
} as const;

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

// Vencida si la frontera es <= now (FASE 2L seccion 5). Con una fecha invalida
// nunca devuelve true (la validez se comprueba antes de llamar).
function isExpired(boundary: Date, now: Date): boolean {
  return boundary.getTime() <= now.getTime();
}

function preserve(reason: string): CronTransitionDecision {
  return { action: "PRESERVE", reason };
}

function inconsistent(reason: string): CronTransitionDecision {
  return { action: "INCONSISTENT", reason };
}

/**
 * Decide la transicion del cron para una suscripcion, de forma pura. No muta el
 * snapshot recibido ni depende de nada externo salvo `now`.
 */
export function decideCronTransition(
  snapshot: CronSubscriptionSnapshot,
  now: Date
): CronTransitionDecision {
  switch (snapshot.status) {
    case "SUSPENDED":
      return preserve(CRON_DECISION_REASON.TERMINAL_SUSPENDED);
    case "CANCELLED":
      return preserve(CRON_DECISION_REASON.TERMINAL_CANCELLED);
    case "PENDING_PAYMENT":
      return preserve(CRON_DECISION_REASON.PENDING_PAYMENT_PRESERVED);

    case "ACTIVE": {
      const boundary = snapshot.currentPeriodEnd;
      if (!isValidDate(boundary)) return inconsistent(CRON_DECISION_REASON.ACTIVE_WITHOUT_PERIOD_END);
      if (!isExpired(boundary, now)) return preserve(CRON_DECISION_REASON.ACTIVE_CURRENT);
      return {
        action: "TRANSITION",
        transition: "ACTIVE_EXPIRED",
        nextStatus: "GRACE_PERIOD",
        reason: CRON_DECISION_REASON.ACTIVE_EXPIRED_TO_GRACE,
      };
    }

    case "TRIAL": {
      // El trial se decide por `trialEndsAt`; si falta, se respalda en
      // `currentPeriodEnd` (equivalente para trials creados por el sistema).
      const boundary = isValidDate(snapshot.trialEndsAt) ? snapshot.trialEndsAt : snapshot.currentPeriodEnd;
      if (!isValidDate(boundary)) return inconsistent(CRON_DECISION_REASON.TRIAL_WITHOUT_BOUNDARY);
      if (!isExpired(boundary, now)) return preserve(CRON_DECISION_REASON.TRIAL_CURRENT);
      return {
        action: "TRANSITION",
        transition: "TRIAL_EXPIRED",
        nextStatus: "GRACE_PERIOD",
        reason: CRON_DECISION_REASON.TRIAL_EXPIRED_TO_GRACE,
      };
    }

    case "GRACE_PERIOD": {
      const boundary = snapshot.graceEndsAt;
      // graceEndsAt = null es un estado invalido: no se suspende, no se inventa
      // una fecha, no se reinicia Grace. Se reporta como inconsistencia.
      if (boundary === null || boundary === undefined) {
        return inconsistent(CRON_DECISION_REASON.GRACE_WITHOUT_BOUNDARY);
      }
      if (!isValidDate(boundary)) return inconsistent(CRON_DECISION_REASON.GRACE_INVALID_BOUNDARY);
      if (!isExpired(boundary, now)) return preserve(CRON_DECISION_REASON.GRACE_CURRENT);
      return {
        action: "TRANSITION",
        transition: "GRACE_EXPIRED",
        nextStatus: "SUSPENDED",
        reason: CRON_DECISION_REASON.GRACE_EXPIRED_TO_SUSPENDED,
      };
    }

    default:
      // Estado desconocido (drift de enum): fail-safe, nunca degrada.
      return preserve(CRON_DECISION_REASON.UNKNOWN_STATUS_PRESERVED);
  }
}
