import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  cancelReservation,
  createCommonArea,
  createCommonAreaBlock,
  createReservation,
  getAvailability,
  getCommonAreaForTenant,
  getReservationForActor,
  listCommonAreasForTenant,
  listReservationsForTenant,
  reviewReservation,
  updateCommonArea,
  isReservationExclusionViolation,
} from "../src/domains/reservations/reservation.service";
import { ReservationDomainError, MAX_AVAILABILITY_RANGE_DAYS } from "../src/domains/reservations/reservation-security";
import { DEFAULT_RESERVATION_TIMEZONE, getZonedDateParts, zonedTimeToUtc } from "../src/domains/reservations/reservation-time";

const RUN = `phase8a-${Date.now()}`;
let sequence = 0;

function nextSeq() {
  sequence += 1;
  return sequence;
}

async function createTenant(prefix: string) {
  const n = nextSeq();
  return prisma.tenant.create({
    data: {
      name: `${prefix} ${n}`,
      slug: `${RUN}-${prefix.toLowerCase()}-${n}`,
      featureEntitlements: {
        create: { feature: "RESERVATIONS", status: "ACTIVE", reason: "Fixture de reservas" },
      },
    },
  });
}

async function createMember(tenantId: string, role: Role = "RESIDENTE") {
  const n = nextSeq();
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${RUN}-${n}@example.com`,
      name: `QA ${role} ${n}`,
      password: "not-used-in-test",
      isActive: true,
    },
  });
  const membership = await prisma.tenantMembership.create({
    data: { userId: user.id, tenantId, role, isActive: true },
  });
  return { user, membership };
}

// `AuditLog.actorUserId` tiene FK a `User`: cualquier actor pasado a los
// servicios de reservas debe ser un usuario real, nunca un string arbitrario.
async function createSystemActor(tenantId: string) {
  const { user } = await createMember(tenantId, "ADMIN");
  return user.id;
}

type ZoneOverrides = Partial<{
  name: string;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  maxReservationsPerWeek: number;
  openingTime: string;
  closingTime: string;
  requiresApproval: boolean;
  isActive: boolean;
  blockedWeekdays: number[];
}>;

async function createZone(tenantId: string, overrides: ZoneOverrides = {}) {
  const n = nextSeq();
  const actorUserId = await createSystemActor(tenantId);
  return createCommonArea({
    tenantId,
    actorUserId,
    name: overrides.name ?? `Zona QA ${n}`,
    minDurationMinutes: overrides.minDurationMinutes ?? 30,
    maxDurationMinutes: overrides.maxDurationMinutes ?? 120,
    maxReservationsPerWeek: overrides.maxReservationsPerWeek ?? 5,
    openingTime: overrides.openingTime ?? "08:00",
    closingTime: overrides.closingTime ?? "22:00",
    requiresApproval: overrides.requiresApproval ?? true,
    isActive: overrides.isActive ?? true,
    blockedWeekdays: overrides.blockedWeekdays ?? [],
  });
}

/**
 * Instante UTC a `hour`:`minute` hora local de Bogota, en el proximo dia
 * civil cuyo weekday local sea `weekdayTarget` (0=domingo..6=sabado), al
 * menos `weeksAhead` semanas completas en el futuro respecto a "ahora". Se
 * usa para construir ventanas de prueba deterministas sin depender de la
 * fecha real de ejecucion de la suite.
 */
function futureSlot(hour: number, minute: number, weekdayTarget: number, weeksAhead = 2) {
  const now = new Date();
  const nowParts = getZonedDateParts(now, DEFAULT_RESERVATION_TIMEZONE);
  const todayLocalMidnight = zonedTimeToUtc(nowParts.year, nowParts.month, nowParts.day, 0, 0, 0, DEFAULT_RESERVATION_TIMEZONE);
  const candidateBase = new Date(todayLocalMidnight.getTime() + weeksAhead * 7 * 86_400_000);
  const candidateParts = getZonedDateParts(candidateBase, DEFAULT_RESERVATION_TIMEZONE);
  const diffDays = (weekdayTarget - candidateParts.weekday + 7) % 7;
  const finalCivilInstant = new Date(candidateBase.getTime() + diffDays * 86_400_000);
  const finalParts = getZonedDateParts(finalCivilInstant, DEFAULT_RESERVATION_TIMEZONE);
  return zonedTimeToUtc(finalParts.year, finalParts.month, finalParts.day, hour, minute, 0, DEFAULT_RESERVATION_TIMEZONE);
}

function iso(date: Date) {
  return date.toISOString();
}

async function assertRejectsCode(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof ReservationDomainError, `expected ReservationDomainError, got ${error}`);
    assert.equal((error as ReservationDomainError).code, code);
    return true;
  });
}

before(async () => {
  await prisma.$connect();
});

after(async () => {
  const tenantIds = (
    await prisma.tenant.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } })
  ).map((entry) => entry.id);

  await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.reservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.commonAreaBlock.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.commonArea.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: RUN } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

test("1. zona de otro tenant no es visible (cross-tenant opaco)", async () => {
  const tenantA = await createTenant("CrossZoneA");
  const tenantB = await createTenant("CrossZoneB");
  const zoneB = await createZone(tenantB.id);
  await assertRejectsCode(
    () => getCommonAreaForTenant({ tenantId: tenantA.id, commonAreaId: zoneB.id }),
    "COMMON_AREA_NOT_FOUND"
  );
});

test("2. RESIDENTE lista solo zonas activas de su propio tenant", async () => {
  const tenantA = await createTenant("ListZonesA");
  const tenantB = await createTenant("ListZonesB");
  const activeZone = await createZone(tenantA.id, { name: "Activa" });
  await createZone(tenantA.id, { name: "Inactiva", isActive: false });
  await createZone(tenantB.id, { name: "De otro tenant" });

  const zones = await listCommonAreasForTenant({ tenantId: tenantA.id, includeInactive: false });
  assert.deepEqual(
    zones.map((z) => z.id).sort(),
    [activeZone.id].sort()
  );
});

test("3. RESIDENTE crea una reserva para su propia membresia", async () => {
  const tenant = await createTenant("CreateOwn");
  const zone = await createZone(tenant.id);
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3); // miercoles 10:00
  const reservation = await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  assert.equal(reservation.membershipId, membership.id);
  assert.equal(reservation.tenantId, tenant.id);
  assert.equal(reservation.status, "PENDING");
});

test("4. el body no puede falsificar el tenant de la reserva", async () => {
  const tenantA = await createTenant("FakeTenantA");
  const tenantB = await createTenant("FakeTenantB");
  const zoneB = await createZone(tenantB.id);
  const { user, membership } = await createMember(tenantA.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  // membershipId pertenece a tenantA, pero se intenta crear en tenantB junto
  // con una zona de tenantB: la revalidacion de membresia (userId+tenantId)
  // dentro de la transaccion lo rechaza.
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenantB.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zoneB.id,
        startAt: iso(start),
        endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
      }),
    "INVALID_INPUT"
  );
});

test("5. el body no puede falsificar la membresia ni el creador", async () => {
  const tenant = await createTenant("FakeMembership");
  const zone = await createZone(tenant.id);
  const residentA = await createMember(tenant.id, "RESIDENTE");
  const residentB = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  // createdByUserId es de residentB, pero membershipId es de residentA.
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: residentA.membership.id,
        createdByUserId: residentB.user.id,
        commonAreaId: zone.id,
        startAt: iso(start),
        endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
      }),
    "INVALID_INPUT"
  );
});

test("6. una membresia CONSEJO no puede crear reservas aunque se invoque el servicio", async () => {
  const tenant = await createTenant("ConsejoNoCrea");
  const zone = await createZone(tenant.id);
  const { user, membership } = await createMember(tenant.id, "CONSEJO");
  const start = futureSlot(10, 0, 3);
  // Defensa en profundidad: la revalidacion exige role RESIDENTE dentro de la
  // transaccion, incluso si el autorizador de la ruta fuera evadido.
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(start),
        endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
      }),
    "INVALID_INPUT"
  );
});

test("7. ADMIN administra zonas solo de su propio tenant", async () => {
  const tenantA = await createTenant("AdminScopeA");
  const tenantB = await createTenant("AdminScopeB");
  const zoneB = await createZone(tenantB.id);
  const actorUserId = await createSystemActor(tenantA.id);
  await assertRejectsCode(
    () =>
      updateCommonArea({
        tenantId: tenantA.id,
        actorUserId,
        commonAreaId: zoneB.id,
        patch: { name: "Intento cruzado" },
      }),
    "COMMON_AREA_NOT_FOUND"
  );
});

test("8. zona inactiva rechaza la creacion de reservas", async () => {
  const tenant = await createTenant("InactiveZone");
  const zone = await createZone(tenant.id, { isActive: false });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(start),
        endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
      }),
    "COMMON_AREA_INACTIVE"
  );
});

test("9. una fecha de inicio pasada es rechazada", async () => {
  const tenant = await createTenant("PastStart");
  const zone = await createZone(tenant.id);
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const past = new Date(Date.now() - 60 * 60 * 1000);
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(past),
        endAt: iso(new Date(past.getTime() + 60 * 60 * 1000)),
      }),
    "START_NOT_IN_FUTURE"
  );
});

test("10. duracion minima y maxima se hacen cumplir", async () => {
  const tenant = await createTenant("DurationBounds");
  const zone = await createZone(tenant.id, { minDurationMinutes: 30, maxDurationMinutes: 90 });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(start),
        endAt: iso(new Date(start.getTime() + 10 * 60 * 1000)),
      }),
    "DURATION_TOO_SHORT"
  );
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(start),
        endAt: iso(new Date(start.getTime() + 120 * 60 * 1000)),
      }),
    "DURATION_TOO_LONG"
  );
});

test("11. el horario de apertura y cierre se hace cumplir", async () => {
  const tenant = await createTenant("OpeningHours");
  const zone = await createZone(tenant.id, { openingTime: "08:00", closingTime: "20:00" });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const beforeOpening = futureSlot(6, 0, 3);
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(beforeOpening),
        endAt: iso(new Date(beforeOpening.getTime() + 60 * 60 * 1000)),
      }),
    "OUTSIDE_OPENING_HOURS"
  );
  const afterClosing = futureSlot(21, 0, 3);
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(afterClosing),
        endAt: iso(new Date(afterClosing.getTime() + 60 * 60 * 1000)),
      }),
    "OUTSIDE_OPENING_HOURS"
  );
});

test("12. un dia de la semana bloqueado rechaza la reserva", async () => {
  const tenant = await createTenant("WeekdayBlocked");
  const zone = await createZone(tenant.id, { blockedWeekdays: [0] }); // domingo bloqueado
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const sunday = futureSlot(10, 0, 0);
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(sunday),
        endAt: iso(new Date(sunday.getTime() + 60 * 60 * 1000)),
      }),
    "WEEKDAY_BLOCKED"
  );
});

test("13. un bloqueo extraordinario impide reservar ese horario", async () => {
  const tenant = await createTenant("ExtraBlock");
  const zone = await createZone(tenant.id);
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  await createCommonAreaBlock({
    tenantId: tenant.id,
    actorUserId: await createSystemActor(tenant.id),
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
    reason: "Mantenimiento programado",
  });
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(start),
        endAt: iso(end),
      }),
    "BLOCKED_WINDOW"
  );
});

test("14. el limite semanal por membresia y zona se hace cumplir", async () => {
  const tenant = await createTenant("WeeklyLimit");
  const zone = await createZone(tenant.id, { maxReservationsPerWeek: 1, requiresApproval: false });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const first = futureSlot(9, 0, 3);
  await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(first),
    endAt: iso(new Date(first.getTime() + 30 * 60 * 1000)),
  });
  // Mismo miercoles, misma semana, horario distinto: debe fallar por limite.
  const second = futureSlot(15, 0, 3);
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: membership.id,
        createdByUserId: user.id,
        commonAreaId: zone.id,
        startAt: iso(second),
        endAt: iso(new Date(second.getTime() + 30 * 60 * 1000)),
      }),
    "WEEKLY_LIMIT_REACHED"
  );
});

test("15. dos reservas concurrentes solapadas: solo una gana", async () => {
  const tenant = await createTenant("ConcurrentOverlap");
  const zone = await createZone(tenant.id, { requiresApproval: false, maxReservationsPerWeek: 10 });
  const residentA = await createMember(tenant.id, "RESIDENTE");
  const residentB = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(11, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const outcomes = await Promise.allSettled([
    createReservation({
      tenantId: tenant.id,
      membershipId: residentA.membership.id,
      createdByUserId: residentA.user.id,
      commonAreaId: zone.id,
      startAt: iso(start),
      endAt: iso(end),
    }),
    createReservation({
      tenantId: tenant.id,
      membershipId: residentB.membership.id,
      createdByUserId: residentB.user.id,
      commonAreaId: zone.id,
      startAt: iso(start),
      endAt: iso(end),
    }),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((entry) => entry.status === "rejected").length, 1);
  const rejected = outcomes.find((entry) => entry.status === "rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof ReservationDomainError);
  assert.equal((rejected.reason as ReservationDomainError).code, "SLOT_UNAVAILABLE");

  const occupying = await prisma.reservation.count({
    where: { tenantId: tenant.id, commonAreaId: zone.id, status: { in: ["PENDING", "APPROVED"] } },
  });
  assert.equal(occupying, 1);
});

test("16. reservas contiguas (fin=inicio) estan permitidas", async () => {
  const tenant = await createTenant("Contiguous");
  const zone = await createZone(tenant.id, { requiresApproval: false, maxReservationsPerWeek: 10 });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const mid = new Date(start.getTime() + 60 * 60 * 1000);
  const end = new Date(mid.getTime() + 60 * 60 * 1000);

  const first = await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(mid),
  });
  const second = await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(mid),
    endAt: iso(end),
  });
  assert.equal(first.status, "APPROVED");
  assert.equal(second.status, "APPROVED");
});

test("17. una reserva cancelada no bloquea el horario", async () => {
  const tenant = await createTenant("CancelledFrees");
  const zone = await createZone(tenant.id, { requiresApproval: false });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  await cancelReservation({
    tenantId: tenant.id,
    actorUserId: user.id,
    actorRole: "RESIDENTE",
    membershipId: membership.id,
    reservationId: created.id,
  });
  const again = await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  assert.equal(again.status, "APPROVED");
});

test("18. una reserva rechazada no bloquea el horario", async () => {
  const tenant = await createTenant("RejectedFrees");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const admin = await createMember(tenant.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  await reviewReservation({
    tenantId: tenant.id,
    actorUserId: admin.user.id,
    reservationId: created.id,
    decision: "REJECTED",
    rejectionReason: "Conflicto con evento",
  });
  const again = await createReservation({
    tenantId: tenant.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  assert.equal(again.status, "PENDING");
});

test("19. una reserva PENDING si bloquea el horario", async () => {
  const tenant = await createTenant("PendingBlocks");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const residentA = await createMember(tenant.id, "RESIDENTE");
  const residentB = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  await createReservation({
    tenantId: tenant.id,
    membershipId: residentA.membership.id,
    createdByUserId: residentA.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  await assertRejectsCode(
    () =>
      createReservation({
        tenantId: tenant.id,
        membershipId: residentB.membership.id,
        createdByUserId: residentB.user.id,
        commonAreaId: zone.id,
        startAt: iso(start),
        endAt: iso(end),
      }),
    "SLOT_UNAVAILABLE"
  );
});

test("20. aprobacion valida cambia el estado y registra al revisor", async () => {
  const tenant = await createTenant("ValidApproval");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const admin = await createMember(tenant.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  const approved = await reviewReservation({
    tenantId: tenant.id,
    actorUserId: admin.user.id,
    reservationId: created.id,
    decision: "APPROVED",
  });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.reviewedByUserId, admin.user.id);
  assert.ok(approved.reviewedAt);
});

test("21. dos aprobaciones concurrentes producen un solo resultado valido", async () => {
  const tenant = await createTenant("ConcurrentApproval");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const adminA = await createMember(tenant.id, "ADMIN");
  const adminB = await createMember(tenant.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });

  const outcomes = await Promise.allSettled([
    reviewReservation({ tenantId: tenant.id, actorUserId: adminA.user.id, reservationId: created.id, decision: "APPROVED" }),
    reviewReservation({ tenantId: tenant.id, actorUserId: adminB.user.id, reservationId: created.id, decision: "REJECTED", rejectionReason: "Duplicada" }),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((entry) => entry.status === "rejected").length, 1);
  const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
  assert.ok(stored.status === "APPROVED" || stored.status === "REJECTED");
});

test("22. una transicion invalida es rechazada", async () => {
  const tenant = await createTenant("InvalidTransition");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const admin = await createMember(tenant.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  await reviewReservation({ tenantId: tenant.id, actorUserId: admin.user.id, reservationId: created.id, decision: "APPROVED" });
  await assertRejectsCode(
    () => reviewReservation({ tenantId: tenant.id, actorUserId: admin.user.id, reservationId: created.id, decision: "REJECTED", rejectionReason: "tarde" }),
    "INVALID_TRANSITION"
  );
});

test("23. RESIDENTE cancela su propia reserva", async () => {
  const tenant = await createTenant("CancelOwn");
  const zone = await createZone(tenant.id, { requiresApproval: false });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  const cancelled = await cancelReservation({
    tenantId: tenant.id,
    actorUserId: user.id,
    actorRole: "RESIDENTE",
    membershipId: membership.id,
    reservationId: created.id,
  });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.cancelledByUserId, user.id);
});

test("24. RESIDENTE no puede cancelar una reserva ajena mediante un ID conocido", async () => {
  const tenant = await createTenant("CancelForeign");
  const zone = await createZone(tenant.id, { requiresApproval: false });
  const owner = await createMember(tenant.id, "RESIDENTE");
  const attacker = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: owner.membership.id,
    createdByUserId: owner.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  await assertRejectsCode(
    () =>
      cancelReservation({
        tenantId: tenant.id,
        actorUserId: attacker.user.id,
        actorRole: "RESIDENTE",
        membershipId: attacker.membership.id,
        reservationId: created.id,
      }),
    "RESERVATION_NOT_FOUND"
  );
  const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stored.status, "APPROVED");
});

test("25. ADMIN cancela dentro de su tenant pero no en otro tenant", async () => {
  const tenantA = await createTenant("AdminCancelA");
  const tenantB = await createTenant("AdminCancelB");
  const zoneA = await createZone(tenantA.id, { requiresApproval: false });
  const resident = await createMember(tenantA.id, "RESIDENTE");
  const adminB = await createMember(tenantB.id, "ADMIN");
  const adminA = await createMember(tenantA.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({
    tenantId: tenantA.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zoneA.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  await assertRejectsCode(
    () =>
      cancelReservation({
        tenantId: tenantB.id,
        actorUserId: adminB.user.id,
        actorRole: "ADMIN",
        membershipId: null,
        reservationId: created.id,
      }),
    "RESERVATION_NOT_FOUND"
  );
  const cancelled = await cancelReservation({
    tenantId: tenantA.id,
    actorUserId: adminA.user.id,
    actorRole: "ADMIN",
    membershipId: null,
    reservationId: created.id,
  });
  assert.equal(cancelled.status, "CANCELLED");
});

test("26. cancelar libera el horario para nuevas reservas", async () => {
  const tenant = await createTenant("CancelFrees");
  const zone = await createZone(tenant.id, { requiresApproval: false });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  await cancelReservation({
    tenantId: tenant.id,
    actorUserId: user.id,
    actorRole: "RESIDENTE",
    membershipId: membership.id,
    reservationId: created.id,
  });
  const replacement = await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  assert.equal(replacement.status, "APPROVED");
});

test("27. crear un bloqueo cross-tenant falla de forma opaca", async () => {
  const tenantA = await createTenant("BlockCrossA");
  const tenantB = await createTenant("BlockCrossB");
  const zoneA = await createZone(tenantA.id);
  const start = futureSlot(10, 0, 3);
  const actorUserId = await createSystemActor(tenantB.id);
  await assertRejectsCode(
    () =>
      createCommonAreaBlock({
        tenantId: tenantB.id,
        actorUserId,
        commonAreaId: zoneA.id,
        startAt: iso(start),
        endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
        reason: "Intento cruzado",
      }),
    "COMMON_AREA_NOT_FOUND"
  );
});

test("28. la configuracion de zona usa whitelist estricta", async () => {
  const tenant = await createTenant("ConfigWhitelist");
  const zone = await createZone(tenant.id);
  const actorUserId = await createSystemActor(tenant.id);
  await assertRejectsCode(
    () =>
      updateCommonArea({
        tenantId: tenant.id,
        actorUserId,
        commonAreaId: zone.id,
        patch: { name: "Nuevo nombre", tenantId: "ataque" },
      }),
    "INVALID_INPUT"
  );
  const updated = await updateCommonArea({
    tenantId: tenant.id,
    actorUserId,
    commonAreaId: zone.id,
    patch: { name: "Nombre valido" },
  });
  assert.equal(updated.name, "Nombre valido");
});

test("29. la disponibilidad no expone informacion personal", async () => {
  const tenant = await createTenant("AvailabilityPII");
  const zone = await createZone(tenant.id, { requiresApproval: false });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  const from = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const availability = await getAvailability({ tenantId: tenant.id, commonAreaId: zone.id, from: iso(from), to: iso(to) });
  assert.equal(availability.busy.length, 1);
  assert.deepEqual(Object.keys(availability.busy[0]).sort(), ["endAt", "startAt"]);
  const serialized = JSON.stringify(availability);
  assert.equal(serialized.includes(user.email), false);
  assert.equal(serialized.includes(membership.id), false);
});

test("30. un rango de disponibilidad demasiado amplio es rechazado", async () => {
  const tenant = await createTenant("RangeTooWide");
  const zone = await createZone(tenant.id);
  const from = new Date();
  const to = new Date(from.getTime() + (MAX_AVAILABILITY_RANGE_DAYS + 5) * 86_400_000);
  await assertRejectsCode(
    () => getAvailability({ tenantId: tenant.id, commonAreaId: zone.id, from: iso(from), to: iso(to) }),
    "RANGE_TOO_WIDE"
  );
});

test("31. la notificacion de reserva pendiente llega al ADMIN del tenant correcto", async () => {
  const tenantA = await createTenant("NotifyCorrectA");
  const tenantB = await createTenant("NotifyCorrectB");
  const zoneA = await createZone(tenantA.id, { requiresApproval: true });
  const resident = await createMember(tenantA.id, "RESIDENTE");
  const adminA = await createMember(tenantA.id, "ADMIN");
  await createMember(tenantB.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({
    tenantId: tenantA.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zoneA.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });

  const notificationsA = await prisma.notification.findMany({
    where: { tenantId: tenantA.id, resourceId: created.id, userId: adminA.user.id },
  });
  assert.equal(notificationsA.length, 1);
  const notificationsB = await prisma.notification.count({ where: { tenantId: tenantB.id, resourceId: created.id } });
  assert.equal(notificationsB, 0);
});

test("32. una membresia o cuenta inactiva no recibe notificacion", async () => {
  const tenant = await createTenant("NotifyInactive");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const inactiveAdmin = await createMember(tenant.id, "ADMIN");
  await prisma.tenantMembership.update({ where: { id: inactiveAdmin.membership.id }, data: { isActive: false } });
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  const notified = await prisma.notification.count({
    where: { tenantId: tenant.id, resourceId: created.id, userId: inactiveAdmin.user.id },
  });
  assert.equal(notified, 0);
});

test("33. un error de reserva inexistente es controlado, no una excepcion cruda", async () => {
  const tenant = await createTenant("NotFoundControlled");
  await assertRejectsCode(
    () => getReservationForActor({ tenantId: tenant.id, membershipId: null, reservationId: "cuid-inexistente" }),
    "RESERVATION_NOT_FOUND"
  );
});

test("34. un usuario multi-conjunto reserva en el tenant seleccionado sin mezclar datos", async () => {
  const tenantA = await createTenant("MultiTenantA");
  const tenantB = await createTenant("MultiTenantB");
  const zoneA = await createZone(tenantA.id, { requiresApproval: false });
  const zoneB = await createZone(tenantB.id, { requiresApproval: false });
  const n = nextSeq();
  const user = await prisma.user.create({
    data: { email: `multi-${RUN}-${n}@example.com`, name: "QA Multi", password: "not-used", isActive: true },
  });
  const membershipA = await prisma.tenantMembership.create({ data: { userId: user.id, tenantId: tenantA.id, role: "RESIDENTE", isActive: true } });
  const membershipB = await prisma.tenantMembership.create({ data: { userId: user.id, tenantId: tenantB.id, role: "RESIDENTE", isActive: true } });

  const start = futureSlot(10, 0, 3);
  const reservationA = await createReservation({
    tenantId: tenantA.id,
    membershipId: membershipA.id,
    createdByUserId: user.id,
    commonAreaId: zoneA.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  const reservationB = await createReservation({
    tenantId: tenantB.id,
    membershipId: membershipB.id,
    createdByUserId: user.id,
    commonAreaId: zoneB.id,
    startAt: iso(start),
    endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  assert.equal(reservationA.tenantId, tenantA.id);
  assert.equal(reservationB.tenantId, tenantB.id);
  assert.notEqual(reservationA.id, reservationB.id);
});

test("35. cambiar de tenant no mezcla el listado de reservas", async () => {
  const tenantA = await createTenant("NoMixListA");
  const tenantB = await createTenant("NoMixListB");
  const zoneA = await createZone(tenantA.id, { requiresApproval: false });
  const zoneB = await createZone(tenantB.id, { requiresApproval: false });
  const n = nextSeq();
  const user = await prisma.user.create({
    data: { email: `nomix-${RUN}-${n}@example.com`, name: "QA NoMix", password: "not-used", isActive: true },
  });
  const membershipA = await prisma.tenantMembership.create({ data: { userId: user.id, tenantId: tenantA.id, role: "RESIDENTE", isActive: true } });
  const membershipB = await prisma.tenantMembership.create({ data: { userId: user.id, tenantId: tenantB.id, role: "RESIDENTE", isActive: true } });
  const start = futureSlot(10, 0, 3);
  await createReservation({
    tenantId: tenantA.id, membershipId: membershipA.id, createdByUserId: user.id, commonAreaId: zoneA.id,
    startAt: iso(start), endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });
  await createReservation({
    tenantId: tenantB.id, membershipId: membershipB.id, createdByUserId: user.id, commonAreaId: zoneB.id,
    startAt: iso(start), endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)),
  });

  const listA = await listReservationsForTenant({ tenantId: tenantA.id, membershipId: membershipA.id });
  const listB = await listReservationsForTenant({ tenantId: tenantB.id, membershipId: membershipB.id });
  assert.equal(listA.total, 1);
  assert.equal(listB.total, 1);
  assert.equal(listA.data[0].tenantId, tenantA.id);
  assert.equal(listB.data[0].tenantId, tenantB.id);
});

test("36. camino completo: crear, aprobar, consultar y cancelar", async () => {
  const tenant = await createTenant("FullPath");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const admin = await createMember(tenant.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const created = await createReservation({
    tenantId: tenant.id,
    membershipId: resident.membership.id,
    createdByUserId: resident.user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
    notes: "Cumpleanos",
  });
  assert.equal(created.status, "PENDING");

  const approved = await reviewReservation({
    tenantId: tenant.id,
    actorUserId: admin.user.id,
    reservationId: created.id,
    decision: "APPROVED",
  });
  assert.equal(approved.status, "APPROVED");

  const fetched = await getReservationForActor({
    tenantId: tenant.id,
    membershipId: resident.membership.id,
    reservationId: created.id,
  });
  assert.equal(fetched.status, "APPROVED");
  assert.equal(fetched.commonArea.id, zone.id);

  const cancelled = await cancelReservation({
    tenantId: tenant.id,
    actorUserId: resident.user.id,
    actorRole: "RESIDENTE",
    membershipId: resident.membership.id,
    reservationId: created.id,
  });
  assert.equal(cancelled.status, "CANCELLED");
});

test("37. un bloqueo que se superpone con reservas activas es rechazado (no cancela en silencio)", async () => {
  const tenant = await createTenant("BlockConflict");
  const zone = await createZone(tenant.id, { requiresApproval: false });
  const { user, membership } = await createMember(tenant.id, "RESIDENTE");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  await createReservation({
    tenantId: tenant.id,
    membershipId: membership.id,
    createdByUserId: user.id,
    commonAreaId: zone.id,
    startAt: iso(start),
    endAt: iso(end),
  });
  const blockActorUserId = await createSystemActor(tenant.id);
  await assertRejectsCode(
    () =>
      createCommonAreaBlock({
        tenantId: tenant.id,
        actorUserId: blockActorUserId,
        commonAreaId: zone.id,
        startAt: iso(start),
        endAt: iso(end),
        reason: "Mantenimiento",
      }),
    "BLOCK_CONFLICTS_WITH_RESERVATIONS"
  );
  const stored = await prisma.reservation.findMany({ where: { tenantId: tenant.id, commonAreaId: zone.id } });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].status, "APPROVED");
});

test("38. una reserva y un bloqueo concurrentes no pueden quedar activos a la vez", async () => {
  const tenant = await createTenant("ConcurrentReservationBlock");
  const zone = await createZone(tenant.id, { requiresApproval: false, maxReservationsPerWeek: 10 });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const blockActorUserId = await createSystemActor(tenant.id);
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const outcomes = await Promise.allSettled([
    createReservation({ tenantId: tenant.id, membershipId: resident.membership.id, createdByUserId: resident.user.id, commonAreaId: zone.id, startAt: iso(start), endAt: iso(end) }),
    createCommonAreaBlock({ tenantId: tenant.id, actorUserId: blockActorUserId, commonAreaId: zone.id, startAt: iso(start), endAt: iso(end), reason: "Mantenimiento concurrente" }),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
  const [reservations, blocks] = await Promise.all([
    prisma.reservation.count({ where: { tenantId: tenant.id, commonAreaId: zone.id, status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.commonAreaBlock.count({ where: { tenantId: tenant.id, commonAreaId: zone.id } }),
  ]);
  assert.equal(reservations + blocks, 1);
});

test("39. una aprobacion y un bloqueo concurrentes conservan una unica agenda valida", async () => {
  const tenant = await createTenant("ConcurrentReviewBlock");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const admin = await createMember(tenant.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const created = await createReservation({ tenantId: tenant.id, membershipId: resident.membership.id, createdByUserId: resident.user.id, commonAreaId: zone.id, startAt: iso(start), endAt: iso(end) });

  const outcomes = await Promise.allSettled([
    reviewReservation({ tenantId: tenant.id, actorUserId: admin.user.id, reservationId: created.id, decision: "APPROVED" }),
    createCommonAreaBlock({ tenantId: tenant.id, actorUserId: admin.user.id, commonAreaId: zone.id, startAt: iso(start), endAt: iso(end), reason: "Mantenimiento concurrente" }),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
  const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(stored.status, "APPROVED");
  assert.equal(await prisma.commonAreaBlock.count({ where: { tenantId: tenant.id, commonAreaId: zone.id } }), 0);
});

test("40. aprobacion y cancelacion concurrentes dejan una transicion linealizable", async () => {
  const tenant = await createTenant("ConcurrentReviewCancel");
  const zone = await createZone(tenant.id, { requiresApproval: true });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const admin = await createMember(tenant.id, "ADMIN");
  const start = futureSlot(10, 0, 3);
  const created = await createReservation({ tenantId: tenant.id, membershipId: resident.membership.id, createdByUserId: resident.user.id, commonAreaId: zone.id, startAt: iso(start), endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)) });

  await Promise.allSettled([
    reviewReservation({ tenantId: tenant.id, actorUserId: admin.user.id, reservationId: created.id, decision: "APPROVED" }),
    cancelReservation({ tenantId: tenant.id, actorUserId: resident.user.id, actorRole: "RESIDENTE", membershipId: resident.membership.id, reservationId: created.id }),
  ]);
  const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: created.id } });
  assert.ok(stored.status === "APPROVED" || stored.status === "CANCELLED");
  if (stored.status === "APPROVED") assert.equal(stored.cancelledAt, null);
  if (stored.status === "CANCELLED") assert.ok(stored.cancelledAt instanceof Date);
});

test("41. una desactivacion que espera el lock impide confirmar una reserva posterior", async () => {
  const tenant = await createTenant("DeactivateWhileWaiting");
  const zone = await createZone(tenant.id, { requiresApproval: false });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const admin = await createMember(tenant.id, "ADMIN");
  const key = `reservation-zone:${tenant.id}:${zone.id}`;
  let releaseLock!: () => void;
  let locked!: () => void;
  const release = new Promise<void>((resolve) => { releaseLock = resolve; });
  const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    locked();
    await release;
  }, { timeout: 10000 });
  await acquired;

  const deactivate = updateCommonArea({ tenantId: tenant.id, actorUserId: admin.user.id, commonAreaId: zone.id, patch: { isActive: false } });
  await new Promise((resolve) => setTimeout(resolve, 25));
  const start = futureSlot(10, 0, 3);
  const creation = createReservation({ tenantId: tenant.id, membershipId: resident.membership.id, createdByUserId: resident.user.id, commonAreaId: zone.id, startAt: iso(start), endAt: iso(new Date(start.getTime() + 60 * 60 * 1000)) });
  releaseLock();
  await holder;
  await deactivate;
  await assertRejectsCode(() => creation, "COMMON_AREA_INACTIVE");
});

test("42. el limite semanal reinicia entre domingo y lunes en America/Bogota", async () => {
  const tenant = await createTenant("WeeklyBoundary");
  const zone = await createZone(tenant.id, { requiresApproval: false, maxReservationsPerWeek: 1 });
  const resident = await createMember(tenant.id, "RESIDENTE");
  const sunday = futureSlot(10, 0, 0);
  const monday = new Date(sunday.getTime() + 24 * 60 * 60 * 1000);
  await createReservation({ tenantId: tenant.id, membershipId: resident.membership.id, createdByUserId: resident.user.id, commonAreaId: zone.id, startAt: iso(sunday), endAt: iso(new Date(sunday.getTime() + 60 * 60 * 1000)) });
  const nextWeek = await createReservation({ tenantId: tenant.id, membershipId: resident.membership.id, createdByUserId: resident.user.id, commonAreaId: zone.id, startAt: iso(monday), endAt: iso(new Date(monday.getTime() + 60 * 60 * 1000)) });
  assert.equal(nextWeek.status, "APPROVED");
});

test("43. SQLSTATE 23P01 se reconoce sin depender del mensaje del driver", () => {
  assert.equal(isReservationExclusionViolation({ code: "23P01" }), true);
  assert.equal(isReservationExclusionViolation({ meta: { code: "23P01" } }), true);
  assert.equal(isReservationExclusionViolation({ cause: { code: "23P01" } }), true);
  assert.equal(isReservationExclusionViolation({ code: "P2002" }), false);
});
