import { AuditAction, Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotificationIdempotent, NotificationTypes } from "@/domains/notifications/notification.service";
import { renderEmailLayout, sendEmailSafe } from "@/lib/email";
import {
  ReservationDomainError,
  assertAllowedKeys,
  escapeReservationHtml,
  normalizeBlockReason,
  normalizeBlockedWeekdays,
  normalizeDescription,
  normalizeDurationBounds,
  normalizeName,
  normalizeNotes,
  normalizeOpeningClosing,
  normalizeRejectionReason,
  normalizeRules,
  normalizeWeeklyLimit,
  parseIsoInstant,
  MAX_AVAILABILITY_RANGE_DAYS,
  MAX_BLOCK_RANGE_DAYS,
} from "@/domains/reservations/reservation-security";
import {
  DEFAULT_RESERVATION_TIMEZONE,
  getWeekRangeUtc,
  getZonedDateParts,
  minutesOfDay,
  parseTimeOfDay,
} from "@/domains/reservations/reservation-time";

const OCCUPYING_STATUSES: ReservationStatus[] = ["PENDING", "APPROVED"];

// --- Helpers internos --------------------------------------------------

async function lockCommonAreaSchedule(
  tx: Prisma.TransactionClient,
  tenantId: string,
  commonAreaId: string
) {
  const key = `reservation-zone:${tenantId}:${commonAreaId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export function isReservationExclusionViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { code?: unknown }; cause?: unknown; message?: unknown };
  // Los adaptadores de Prisma/PostgreSQL pueden conservar el SQLSTATE en la
  // excepcion, en meta o en cause. Esta es la senal estable; el texto queda
  // solo como compatibilidad con adaptadores que no propagan el codigo.
  if (candidate.code === "23P01" || candidate.meta?.code === "23P01") return true;
  if (candidate.cause && isReservationExclusionViolation(candidate.cause)) return true;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    message.includes("Reservation_no_overlap_excl") ||
    message.includes("exclusion constraint") ||
    message.includes("23P01")
  );
}

type ZoneSchedule = {
  minDurationMinutes: number;
  maxDurationMinutes: number;
  openingTime: string;
  closingTime: string;
  blockedWeekdays: number[];
};

/**
 * Valida una ventana [startAt, endAt) contra la configuracion de la zona:
 * duracion, dia de la semana y horario, todo interpretado en la zona horaria
 * del producto (America/Bogota). Por diseno NO se permiten reservas que
 * crucen medianoche local: inicio y fin deben caer en el mismo dia civil.
 */
function assertWithinZoneSchedule(area: ZoneSchedule, startAt: Date, endAt: Date) {
  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  if (durationMinutes < area.minDurationMinutes) throw new ReservationDomainError("DURATION_TOO_SHORT");
  if (durationMinutes > area.maxDurationMinutes) throw new ReservationDomainError("DURATION_TOO_LONG");

  const startParts = getZonedDateParts(startAt, DEFAULT_RESERVATION_TIMEZONE);
  const endParts = getZonedDateParts(endAt, DEFAULT_RESERVATION_TIMEZONE);
  const sameLocalDay =
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day;
  if (!sameLocalDay) throw new ReservationDomainError("OUTSIDE_OPENING_HOURS");
  if (area.blockedWeekdays.includes(startParts.weekday)) throw new ReservationDomainError("WEEKDAY_BLOCKED");

  const opening = parseTimeOfDay(area.openingTime);
  const closing = parseTimeOfDay(area.closingTime);
  if (!opening || !closing) throw new Error("RESERVATION_ZONE_SCHEDULE_CORRUPT");
  const startMinutes = startParts.hour * 60 + startParts.minute;
  const endMinutes = endParts.hour * 60 + endParts.minute;
  if (startMinutes < minutesOfDay(opening) || endMinutes > minutesOfDay(closing)) {
    throw new ReservationDomainError("OUTSIDE_OPENING_HOURS");
  }
}

async function getCommonAreaOrThrow(tenantId: string, commonAreaId: string) {
  const area = await prisma.commonArea.findFirst({ where: { id: commonAreaId, tenantId } });
  if (!area) throw new ReservationDomainError("COMMON_AREA_NOT_FOUND");
  return area;
}

// --- Zonas comunes ------------------------------------------------------

export async function listCommonAreasForTenant({
  tenantId,
  includeInactive = false,
}: {
  tenantId: string;
  includeInactive?: boolean;
}) {
  return prisma.commonArea.findMany({
    where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
}

export async function getCommonAreaForTenant({
  tenantId,
  commonAreaId,
}: {
  tenantId: string;
  commonAreaId: string;
}) {
  return getCommonAreaOrThrow(tenantId, commonAreaId);
}

export async function createCommonArea({
  tenantId,
  actorUserId,
  name,
  description,
  isActive,
  requiresApproval,
  minDurationMinutes,
  maxDurationMinutes,
  maxReservationsPerWeek,
  openingTime,
  closingTime,
  blockedWeekdays,
  rules,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  name: unknown;
  description?: unknown;
  isActive?: unknown;
  requiresApproval?: unknown;
  minDurationMinutes: unknown;
  maxDurationMinutes: unknown;
  maxReservationsPerWeek: unknown;
  openingTime: unknown;
  closingTime: unknown;
  blockedWeekdays?: unknown;
  rules?: unknown;
  origin?: string | null;
}) {
  const normalizedName = normalizeName(name);
  const normalizedDescription = normalizeDescription(description);
  const normalizedRules = normalizeRules(rules);
  const { min, max } = normalizeDurationBounds(minDurationMinutes, maxDurationMinutes);
  const weeklyLimit = normalizeWeeklyLimit(maxReservationsPerWeek);
  const schedule = normalizeOpeningClosing(openingTime, closingTime);
  const weekdays = normalizeBlockedWeekdays(blockedWeekdays);
  if (isActive !== undefined && typeof isActive !== "boolean") {
    throw new ReservationDomainError("INVALID_INPUT");
  }
  if (requiresApproval !== undefined && typeof requiresApproval !== "boolean") {
    throw new ReservationDomainError("INVALID_INPUT");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const area = await tx.commonArea.create({
        data: {
          tenantId,
          name: normalizedName,
          description: normalizedDescription,
          isActive: isActive === undefined ? true : isActive,
          requiresApproval: requiresApproval === undefined ? true : requiresApproval,
          minDurationMinutes: min,
          maxDurationMinutes: max,
          maxReservationsPerWeek: weeklyLimit,
          openingTime: schedule.openingTime,
          closingTime: schedule.closingTime,
          blockedWeekdays: weekdays,
          rules: normalizedRules,
        },
      });
      await registerAuditLog(
        {
          actorUserId,
          tenantId,
          action: AuditAction.COMMON_AREA_CREATED,
          targetType: "CommonArea",
          targetId: area.id,
          origin,
          metadata: { name: area.name, isActive: area.isActive, requiresApproval: area.requiresApproval },
        },
        tx
      );
      return area;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ReservationDomainError("COMMON_AREA_NAME_TAKEN");
    }
    throw error;
  }
}

const COMMON_AREA_PATCH_KEYS = [
  "name",
  "description",
  "isActive",
  "requiresApproval",
  "minDurationMinutes",
  "maxDurationMinutes",
  "maxReservationsPerWeek",
  "openingTime",
  "closingTime",
  "blockedWeekdays",
  "rules",
] as const;

export async function updateCommonArea({
  tenantId,
  actorUserId,
  commonAreaId,
  patch,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  commonAreaId: string;
  patch: unknown;
  origin?: string | null;
}) {
  assertAllowedKeys(patch, COMMON_AREA_PATCH_KEYS);
  const record = patch as Record<string, unknown>;

  try {
    return await prisma.$transaction(async (tx) => {
      // Configuracion y agenda comparten la misma exclusividad. Asi una zona
      // que acaba de desactivarse no puede aceptar una creacion que estaba
      // esperando el lock, y los patches concurrentes se calculan desde el
      // estado actual, no desde una lectura obsoleta.
      await lockCommonAreaSchedule(tx, tenantId, commonAreaId);
      const existing = await tx.commonArea.findFirst({ where: { id: commonAreaId, tenantId } });
      if (!existing) throw new ReservationDomainError("COMMON_AREA_NOT_FOUND");

      const data: Prisma.CommonAreaUpdateInput = {};
      if ("name" in record) data.name = normalizeName(record.name);
      if ("description" in record) data.description = normalizeDescription(record.description);
      if ("rules" in record) data.rules = normalizeRules(record.rules);
      if ("isActive" in record) {
        if (typeof record.isActive !== "boolean") throw new ReservationDomainError("INVALID_INPUT");
        data.isActive = record.isActive;
      }
      if ("requiresApproval" in record) {
        if (typeof record.requiresApproval !== "boolean") throw new ReservationDomainError("INVALID_INPUT");
        data.requiresApproval = record.requiresApproval;
      }
      const minProvided = "minDurationMinutes" in record;
      const maxProvided = "maxDurationMinutes" in record;
      if (minProvided || maxProvided) {
        const { min, max } = normalizeDurationBounds(
          minProvided ? record.minDurationMinutes : existing.minDurationMinutes,
          maxProvided ? record.maxDurationMinutes : existing.maxDurationMinutes
        );
        data.minDurationMinutes = min;
        data.maxDurationMinutes = max;
      }
      if ("maxReservationsPerWeek" in record) {
        data.maxReservationsPerWeek = normalizeWeeklyLimit(record.maxReservationsPerWeek);
      }
      const openingProvided = "openingTime" in record;
      const closingProvided = "closingTime" in record;
      if (openingProvided || closingProvided) {
        const schedule = normalizeOpeningClosing(
          openingProvided ? record.openingTime : existing.openingTime,
          closingProvided ? record.closingTime : existing.closingTime
        );
        data.openingTime = schedule.openingTime;
        data.closingTime = schedule.closingTime;
      }
      if ("blockedWeekdays" in record) data.blockedWeekdays = normalizeBlockedWeekdays(record.blockedWeekdays);
      if (Object.keys(data).length === 0) throw new ReservationDomainError("INVALID_INPUT");

      const updated = await tx.commonArea.update({ where: { id: commonAreaId }, data });
      await registerAuditLog(
        {
          actorUserId,
          tenantId,
          action: AuditAction.COMMON_AREA_UPDATED,
          targetType: "CommonArea",
          targetId: commonAreaId,
          origin,
          metadata: { fields: Object.keys(data) },
        },
        tx
      );
      return updated;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ReservationDomainError("COMMON_AREA_NAME_TAKEN");
    }
    throw error;
  }
}
// --- Disponibilidad -------------------------------------------------------

export async function getAvailability({
  tenantId,
  commonAreaId,
  from,
  to,
}: {
  tenantId: string;
  commonAreaId: string;
  from: unknown;
  to: unknown;
}) {
  const area = await getCommonAreaOrThrow(tenantId, commonAreaId);
  const fromDate = parseIsoInstant(from, "INVALID_RANGE");
  const toDate = parseIsoInstant(to, "INVALID_RANGE");
  if (fromDate >= toDate) throw new ReservationDomainError("INVALID_RANGE");
  const rangeDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (rangeDays > MAX_AVAILABILITY_RANGE_DAYS) throw new ReservationDomainError("RANGE_TOO_WIDE");

  const [reservations, blocks] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        tenantId,
        commonAreaId,
        status: { in: OCCUPYING_STATUSES },
        startAt: { lt: toDate },
        endAt: { gt: fromDate },
      },
      select: { startAt: true, endAt: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.commonAreaBlock.findMany({
      where: { tenantId, commonAreaId, startAt: { lt: toDate }, endAt: { gt: fromDate } },
      select: { startAt: true, endAt: true, reason: true },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return {
    commonArea: {
      id: area.id,
      name: area.name,
      isActive: area.isActive,
      requiresApproval: area.requiresApproval,
      minDurationMinutes: area.minDurationMinutes,
      maxDurationMinutes: area.maxDurationMinutes,
      maxReservationsPerWeek: area.maxReservationsPerWeek,
      openingTime: area.openingTime,
      closingTime: area.closingTime,
      blockedWeekdays: area.blockedWeekdays,
    },
    // Sin PII: unicamente el intervalo ocupado, nunca quien reservo.
    busy: reservations.map((entry) => ({ startAt: entry.startAt, endAt: entry.endAt })),
    blocks: blocks.map((entry) => ({ startAt: entry.startAt, endAt: entry.endAt, reason: entry.reason })),
  };
}

// --- Reservas -------------------------------------------------------------

export async function createReservation({
  tenantId,
  membershipId,
  createdByUserId,
  commonAreaId,
  startAt,
  endAt,
  notes,
  origin,
}: {
  tenantId: string;
  membershipId: string;
  createdByUserId: string;
  commonAreaId: string;
  startAt: unknown;
  endAt: unknown;
  notes?: unknown;
  origin?: string | null;
}) {
  const start = parseIsoInstant(startAt, "INVALID_TIME_WINDOW");
  const end = parseIsoInstant(endAt, "INVALID_TIME_WINDOW");
  if (start.getTime() >= end.getTime()) throw new ReservationDomainError("INVALID_TIME_WINDOW");
  if (start.getTime() <= Date.now()) throw new ReservationDomainError("START_NOT_IN_FUTURE");
  const normalizedNotes = normalizeNotes(notes);
  const { weekStart, weekEnd } = getWeekRangeUtc(start, DEFAULT_RESERVATION_TIMEZONE);

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Un solo advisory lock por (tenant, zona) serializa TODA escritura de
      // agenda sobre esa zona (creacion, aprobacion, bloqueos). El EXCLUDE
      // constraint de PostgreSQL es la barrera autoritativa independiente de
      // este lock; el lock existe ademas para que el conteo del limite
      // semanal (mas abajo) sea seguro bajo concurrencia sin necesitar un
      // segundo mecanismo.
      await lockCommonAreaSchedule(tx, tenantId, commonAreaId);

      const area = await tx.commonArea.findFirst({ where: { id: commonAreaId, tenantId } });
      if (!area) throw new ReservationDomainError("COMMON_AREA_NOT_FOUND");
      if (!area.isActive) throw new ReservationDomainError("COMMON_AREA_INACTIVE");
      assertWithinZoneSchedule(area, start, end);

      // Defensa adicional: aunque el caller ya deriva membershipId de la
      // identidad autorizada (nunca del cliente), se reconfirma que la
      // membresia sigue activa y es RESIDENTE en este instante.
      const membership = await tx.tenantMembership.findFirst({
        where: { id: membershipId, tenantId, userId: createdByUserId, isActive: true, role: "RESIDENTE" },
        select: { id: true },
      });
      if (!membership) throw new ReservationDomainError("INVALID_INPUT");

      const blockCount = await tx.commonAreaBlock.count({
        where: { tenantId, commonAreaId, startAt: { lt: end }, endAt: { gt: start } },
      });
      if (blockCount > 0) throw new ReservationDomainError("BLOCKED_WINDOW");

      // Chequeo de solapamiento amigable: el EXCLUDE constraint es quien
      // realmente impide la doble reserva bajo carrera; esto solo produce un
      // mensaje claro en el caso comun sin carrera.
      const overlapCount = await tx.reservation.count({
        where: {
          tenantId,
          commonAreaId,
          status: { in: OCCUPYING_STATUSES },
          startAt: { lt: end },
          endAt: { gt: start },
        },
      });
      if (overlapCount > 0) throw new ReservationDomainError("SLOT_UNAVAILABLE");

      // Limite semanal: PENDING+APPROVED de esta membresia en ESTA zona,
      // dentro de la semana local [lunes 00:00, lunes siguiente 00:00) que
      // contiene el inicio de la nueva reserva. Documentado explicitamente:
      // el limite es por (membresia, zona), no por tenant completo.
      const weeklyCount = await tx.reservation.count({
        where: {
          tenantId,
          commonAreaId,
          membershipId,
          status: { in: OCCUPYING_STATUSES },
          startAt: { gte: weekStart, lt: weekEnd },
        },
      });
      if (weeklyCount >= area.maxReservationsPerWeek) throw new ReservationDomainError("WEEKLY_LIMIT_REACHED");

      const status: ReservationStatus = area.requiresApproval ? "PENDING" : "APPROVED";
      const created = await tx.reservation.create({
        data: {
          tenantId,
          commonAreaId,
          membershipId,
          createdByUserId,
          startAt: start,
          endAt: end,
          status,
          notes: normalizedNotes,
        },
      });
      await registerAuditLog(
        {
          actorUserId: createdByUserId,
          tenantId,
          action: AuditAction.RESERVATION_CREATED,
          targetType: "Reservation",
          targetId: created.id,
          origin,
          metadata: { commonAreaId, status: created.status },
        },
        tx
      );
      return { created, areaName: area.name };
    });

    await notifyReservationCreated({
      tenantId,
      reservationId: outcome.created.id,
      status: outcome.created.status,
      areaName: outcome.areaName,
    });
    return outcome.created;
  } catch (error) {
    if (error instanceof ReservationDomainError) throw error;
    if (isReservationExclusionViolation(error)) throw new ReservationDomainError("SLOT_UNAVAILABLE");
    throw error;
  }
}

export type ReservationDecision = "APPROVED" | "REJECTED";

export async function reviewReservation({
  tenantId,
  actorUserId,
  reservationId,
  decision,
  rejectionReason,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  reservationId: string;
  decision: ReservationDecision;
  rejectionReason?: unknown;
  origin?: string | null;
}) {
  const normalizedRejectionReason = decision === "REJECTED" ? normalizeRejectionReason(rejectionReason) : null;

  const existing = await prisma.reservation.findFirst({
    where: { id: reservationId, tenantId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ReservationDomainError("RESERVATION_NOT_FOUND");
  if (existing.status !== "PENDING") throw new ReservationDomainError("INVALID_TRANSITION");

  const reviewed = await prisma.$transaction(async (tx) => {
    const current = await tx.reservation.findFirst({
      where: { id: reservationId, tenantId },
      select: { id: true, status: true, commonAreaId: true, startAt: true, endAt: true },
    });
    if (!current) throw new ReservationDomainError("RESERVATION_NOT_FOUND");

    await lockCommonAreaSchedule(tx, tenantId, current.commonAreaId);

    // Se relee despues del lock: si otro admin ya resolvio esta reserva
    // mientras esperabamos el lock, la transicion deja de ser valida.
    const locked = await tx.reservation.findFirst({
      where: { id: reservationId, tenantId },
      select: { status: true },
    });
    if (!locked || locked.status !== "PENDING") throw new ReservationDomainError("INVALID_TRANSITION");

    if (decision === "APPROVED") {
      const area = await tx.commonArea.findUnique({
        where: { id: current.commonAreaId },
        select: { isActive: true },
      });
      if (!area?.isActive) throw new ReservationDomainError("COMMON_AREA_INACTIVE");
      const blockCount = await tx.commonAreaBlock.count({
        where: {
          tenantId,
          commonAreaId: current.commonAreaId,
          startAt: { lt: current.endAt },
          endAt: { gt: current.startAt },
        },
      });
      if (blockCount > 0) throw new ReservationDomainError("BLOCKED_WINDOW");
      const overlapCount = await tx.reservation.count({
        where: {
          tenantId,
          commonAreaId: current.commonAreaId,
          id: { not: current.id },
          status: { in: OCCUPYING_STATUSES },
          startAt: { lt: current.endAt },
          endAt: { gt: current.startAt },
        },
      });
      if (overlapCount > 0) throw new ReservationDomainError("SLOT_UNAVAILABLE");
    }

    const updated = await tx.reservation.updateMany({
      where: { id: reservationId, tenantId, status: "PENDING" },
      data: {
        status: decision,
        reviewedByUserId: actorUserId,
        reviewedAt: new Date(),
        ...(decision === "REJECTED" ? { rejectionReason: normalizedRejectionReason } : {}),
      },
    });
    if (updated.count !== 1) throw new ReservationDomainError("INVALID_TRANSITION");

    const result = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action: decision === "APPROVED" ? AuditAction.RESERVATION_APPROVED : AuditAction.RESERVATION_REJECTED,
        targetType: "Reservation",
        targetId: reservationId,
        origin,
        metadata: { commonAreaId: current.commonAreaId, decision },
      },
      tx
    );
    return result;
  });

  await notifyReservationReviewed(reviewed);
  return reviewed;
}

export async function cancelReservation({
  tenantId,
  actorUserId,
  actorRole,
  membershipId,
  reservationId,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  actorRole: "ADMIN" | "CONSEJO" | "RESIDENTE";
  membershipId: string | null;
  reservationId: string;
  origin?: string | null;
}) {
  const isAdmin = actorRole === "ADMIN";
  const scope: Prisma.ReservationWhereInput = isAdmin
    ? { id: reservationId, tenantId }
    : { id: reservationId, tenantId, membershipId: membershipId ?? "__no-membership__" };

  const existing = await prisma.reservation.findFirst({
    where: scope,
    select: { id: true, status: true, endAt: true },
  });
  if (!existing) throw new ReservationDomainError("RESERVATION_NOT_FOUND");
  if (existing.status === "CANCELLED" || existing.status === "REJECTED") {
    throw new ReservationDomainError("NOT_CANCELLABLE");
  }
  if (existing.endAt.getTime() <= Date.now()) throw new ReservationDomainError("NOT_CANCELLABLE");

  const now = new Date();
  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.reservation.updateMany({
      where: { id: reservationId, tenantId, status: { in: OCCUPYING_STATUSES } },
      data: { status: "CANCELLED", cancelledAt: now, cancelledByUserId: actorUserId },
    });
    if (updated.count !== 1) throw new ReservationDomainError("NOT_CANCELLABLE");
    const result = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action: AuditAction.RESERVATION_CANCELLED,
        targetType: "Reservation",
        targetId: reservationId,
        origin,
        metadata: { commonAreaId: result.commonAreaId, cancelledByRole: actorRole },
      },
      tx
    );
    return result;
  });

  await notifyReservationCancelled(cancelled, actorRole);
  return cancelled;
}

export async function listReservationsForTenant({
  tenantId,
  membershipId,
  commonAreaId,
  status,
  page = 1,
  pageSize = 25,
}: {
  tenantId: string;
  membershipId?: string | null;
  commonAreaId?: string | null;
  status?: ReservationStatus;
  page?: number;
  pageSize?: number;
}) {
  const where: Prisma.ReservationWhereInput = {
    tenantId,
    ...(membershipId ? { membershipId } : {}),
    ...(commonAreaId ? { commonAreaId } : {}),
    ...(status ? { status } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      orderBy: { startAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { commonArea: { select: { id: true, name: true } } },
    }),
    prisma.reservation.count({ where }),
  ]);
  return { data, total };
}

export async function getReservationForActor({
  tenantId,
  membershipId,
  reservationId,
}: {
  tenantId: string;
  membershipId: string | null;
  reservationId: string;
}) {
  const where: Prisma.ReservationWhereInput = membershipId
    ? { id: reservationId, tenantId, membershipId }
    : { id: reservationId, tenantId };
  const reservation = await prisma.reservation.findFirst({
    where,
    include: { commonArea: { select: { id: true, name: true } } },
  });
  if (!reservation) throw new ReservationDomainError("RESERVATION_NOT_FOUND");
  return reservation;
}

// --- Bloqueos extraordinarios ---------------------------------------------

export async function createCommonAreaBlock({
  tenantId,
  actorUserId,
  commonAreaId,
  startAt,
  endAt,
  reason,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  commonAreaId: string;
  startAt: unknown;
  endAt: unknown;
  reason: unknown;
  origin?: string | null;
}) {
  const start = parseIsoInstant(startAt, "INVALID_BLOCK_RANGE");
  const end = parseIsoInstant(endAt, "INVALID_BLOCK_RANGE");
  if (start.getTime() >= end.getTime()) throw new ReservationDomainError("INVALID_BLOCK_RANGE");
  const rangeDays = (end.getTime() - start.getTime()) / 86_400_000;
  if (rangeDays > MAX_BLOCK_RANGE_DAYS) throw new ReservationDomainError("BLOCK_RANGE_TOO_WIDE");
  const normalizedReason = normalizeBlockReason(reason);

  await getCommonAreaOrThrow(tenantId, commonAreaId);

  return prisma.$transaction(async (tx) => {
    await lockCommonAreaSchedule(tx, tenantId, commonAreaId);
    // Politica: un bloqueo que se superpone con reservas PENDING/APPROVED
    // vigentes se RECHAZA en vez de cancelar reservas silenciosamente. El
    // ADMIN debe cancelar esas reservas explicitamente antes de bloquear.
    const conflicting = await tx.reservation.count({
      where: {
        tenantId,
        commonAreaId,
        status: { in: OCCUPYING_STATUSES },
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (conflicting > 0) throw new ReservationDomainError("BLOCK_CONFLICTS_WITH_RESERVATIONS");

    const created = await tx.commonAreaBlock.create({
      data: { tenantId, commonAreaId, startAt: start, endAt: end, reason: normalizedReason, createdByUserId: actorUserId },
    });
    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action: AuditAction.COMMON_AREA_BLOCK_CREATED,
        targetType: "CommonAreaBlock",
        targetId: created.id,
        origin,
        metadata: { commonAreaId },
      },
      tx
    );
    return created;
  });
}

export async function listCommonAreaBlocks({ tenantId, commonAreaId }: { tenantId: string; commonAreaId: string }) {
  await getCommonAreaOrThrow(tenantId, commonAreaId);
  return prisma.commonAreaBlock.findMany({
    where: { tenantId, commonAreaId },
    orderBy: { startAt: "desc" },
  });
}

// --- Notificaciones (best-effort, fuera de cualquier transaccion) --------

async function notifyReservationCreated({
  tenantId,
  reservationId,
  status,
  areaName,
}: {
  tenantId: string;
  reservationId: string;
  status: ReservationStatus;
  areaName: string;
}) {
  if (status !== "PENDING") return;
  const admins = await prisma.tenantMembership.findMany({
    where: { tenantId, role: "ADMIN", isActive: true, user: { isActive: true } },
    select: { userId: true },
  });
  await Promise.allSettled(
    admins.map((admin) =>
      createNotificationIdempotent(
        {
          tenantId,
          userId: admin.userId,
          type: NotificationTypes.RESERVATION_CREATED,
          title: "Nueva reserva pendiente",
          message: `Hay una reserva pendiente de aprobacion para ${areaName}.`,
          resourceType: "Reservation",
          resourceId: reservationId,
          dedupeKey: `reservation:${reservationId}:created:${admin.userId}`,
        },
        prisma
      ).catch(() => null)
    )
  );
}

async function getActiveResidentRecipient(membershipId: string) {
  const membership = await prisma.tenantMembership.findUnique({
    where: { id: membershipId },
    select: { userId: true, isActive: true, user: { select: { isActive: true, email: true, name: true } } },
  });
  if (!membership?.isActive || !membership.user.isActive) return null;
  return membership;
}

async function notifyReservationReviewed(reservation: {
  id: string;
  tenantId: string;
  membershipId: string;
  commonAreaId: string;
  status: ReservationStatus;
  rejectionReason: string | null;
}) {
  const membership = await getActiveResidentRecipient(reservation.membershipId);
  if (!membership) return;
  const area = await prisma.commonArea.findUnique({ where: { id: reservation.commonAreaId }, select: { name: true } });
  const areaName = area?.name ?? "la zona";
  const approved = reservation.status === "APPROVED";

  await createNotificationIdempotent(
    {
      tenantId: reservation.tenantId,
      userId: membership.userId,
      type: approved ? NotificationTypes.RESERVATION_APPROVED : NotificationTypes.RESERVATION_REJECTED,
      title: approved ? "Reserva aprobada" : "Reserva rechazada",
      message: approved
        ? `Tu reserva para ${areaName} fue aprobada.`
        : `Tu reserva para ${areaName} fue rechazada.`,
      resourceType: "Reservation",
      resourceId: reservation.id,
      dedupeKey: `reservation:${reservation.id}:reviewed:${reservation.status}`,
    },
    prisma
  ).catch(() => null);

  if (!membership.user.email) return;
  const safeName = escapeReservationHtml(membership.user.name);
  const safeArea = escapeReservationHtml(areaName);
  await sendEmailSafe({
    tenantId: reservation.tenantId,
    to: membership.user.email,
    template: approved ? "reservation_approved" : "reservation_rejected",
    subject: approved ? `Tu reserva de ${areaName} fue aprobada` : `Tu reserva de ${areaName} fue rechazada`,
    html: renderEmailLayout({
      accent: approved ? "success" : "danger",
      eyebrow: "Reservas",
      heading: approved ? "Reserva aprobada" : "Reserva rechazada",
      bodyHtml: `
        <p>Hola <strong>${safeName}</strong>,</p>
        <p>Tu reserva para <strong>${safeArea}</strong> fue ${approved ? "aprobada" : "rechazada"}.</p>
        ${!approved && reservation.rejectionReason ? `<p>Motivo: ${escapeReservationHtml(reservation.rejectionReason)}</p>` : ""}
      `,
    }),
  }).catch(() => null);
}

async function notifyReservationCancelled(
  reservation: { id: string; tenantId: string; membershipId: string; commonAreaId: string },
  cancelledByRole: string
) {
  // Si el propio residente cancela su reserva no hace falta notificarlo.
  if (cancelledByRole !== "ADMIN") return;
  const membership = await getActiveResidentRecipient(reservation.membershipId);
  if (!membership) return;
  const area = await prisma.commonArea.findUnique({ where: { id: reservation.commonAreaId }, select: { name: true } });
  const areaName = area?.name ?? "la zona";

  await createNotificationIdempotent(
    {
      tenantId: reservation.tenantId,
      userId: membership.userId,
      type: NotificationTypes.RESERVATION_CANCELLED,
      title: "Reserva cancelada",
      message: `Tu reserva para ${areaName} fue cancelada por administracion.`,
      resourceType: "Reservation",
      resourceId: reservation.id,
      dedupeKey: `reservation:${reservation.id}:cancelled`,
    },
    prisma
  ).catch(() => null);
}
