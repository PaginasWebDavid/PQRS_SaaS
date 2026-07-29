import test from "node:test";
import assert from "node:assert/strict";
import {
  ReservationDomainError,
  assertAllowedKeys,
  canAdministerReservations,
  canCreateReservation,
  canReadReservations,
  escapeReservationHtml,
  mapReservationError,
  normalizeBlockReason,
  normalizeBlockedWeekdays,
  normalizeDurationBounds,
  normalizeName,
  normalizeNotes,
  normalizeOpeningClosing,
  normalizeRejectionReason,
  normalizeWeeklyLimit,
  parseIsoInstant,
} from "../../src/domains/reservations/reservation-security";

test("1. RESIDENTE es el unico rol que puede crear reservas", () => {
  assert.equal(canCreateReservation("RESIDENTE"), true);
  assert.equal(canCreateReservation("ADMIN"), false);
  assert.equal(canCreateReservation("CONSEJO"), false);
  assert.equal(canCreateReservation("SUPER_ADMIN"), false);
});

test("2. Solo ADMIN administra zonas, aprueba, rechaza y bloquea", () => {
  assert.equal(canAdministerReservations("ADMIN"), true);
  assert.equal(canAdministerReservations("CONSEJO"), false);
  assert.equal(canAdministerReservations("RESIDENTE"), false);
});

test("3. ADMIN, CONSEJO y RESIDENTE pueden leer; SUPER_ADMIN no", () => {
  assert.equal(canReadReservations("ADMIN"), true);
  assert.equal(canReadReservations("CONSEJO"), true);
  assert.equal(canReadReservations("RESIDENTE"), true);
  assert.equal(canReadReservations("SUPER_ADMIN"), false);
});

test("4. normalizeName normaliza espacios y rechaza longitudes invalidas", () => {
  assert.equal(normalizeName("  Salon   Comunal  "), "Salon Comunal");
  assert.throws(() => normalizeName("A"), ReservationDomainError);
  assert.throws(() => normalizeName("x".repeat(121)), ReservationDomainError);
  assert.throws(() => normalizeName(123), ReservationDomainError);
});

test("5. normalizeName rechaza caracteres de control", () => {
  const withControlChar = "Salon" + String.fromCharCode(7) + "Comunal";
  assert.throws(() => normalizeName(withControlChar), ReservationDomainError);
});

test("6. normalizeDurationBounds exige min<=max dentro de rango", () => {
  assert.deepEqual(normalizeDurationBounds(30, 120), { min: 30, max: 120 });
  assert.throws(() => normalizeDurationBounds(120, 30), ReservationDomainError);
  assert.throws(() => normalizeDurationBounds(0, 60), ReservationDomainError);
  assert.throws(() => normalizeDurationBounds(30, 24 * 60 + 1), ReservationDomainError);
  assert.throws(() => normalizeDurationBounds("a", 60), ReservationDomainError);
});

test("7. normalizeOpeningClosing exige apertura antes que cierre y formato HH:mm", () => {
  assert.deepEqual(normalizeOpeningClosing("08:00", "20:00"), { openingTime: "08:00", closingTime: "20:00" });
  assert.throws(() => normalizeOpeningClosing("20:00", "08:00"), ReservationDomainError);
  assert.throws(() => normalizeOpeningClosing("20:00", "20:00"), ReservationDomainError);
  assert.throws(() => normalizeOpeningClosing("8:00", "20:00"), ReservationDomainError);
});

test("8. normalizeBlockedWeekdays deduplica, ordena y valida rango 0..6", () => {
  assert.deepEqual(normalizeBlockedWeekdays([2, 0, 2, 6]), [0, 2, 6]);
  assert.deepEqual(normalizeBlockedWeekdays(undefined), []);
  assert.throws(() => normalizeBlockedWeekdays([7]), ReservationDomainError);
  assert.throws(() => normalizeBlockedWeekdays([-1]), ReservationDomainError);
  assert.throws(() => normalizeBlockedWeekdays("not-array"), ReservationDomainError);
});

test("9. normalizeWeeklyLimit exige entero positivo acotado", () => {
  assert.equal(normalizeWeeklyLimit(2), 2);
  assert.throws(() => normalizeWeeklyLimit(0), ReservationDomainError);
  assert.throws(() => normalizeWeeklyLimit(51), ReservationDomainError);
  assert.throws(() => normalizeWeeklyLimit(1.5), ReservationDomainError);
});

test("10. assertAllowedKeys rechaza cualquier campo fuera de la whitelist", () => {
  assert.doesNotThrow(() => assertAllowedKeys({ name: "x" }, ["name", "description"]));
  assert.throws(
    () => assertAllowedKeys({ name: "x", tenantId: "ataque" }, ["name", "description"]),
    ReservationDomainError
  );
  assert.throws(() => assertAllowedKeys(null, ["name"]), ReservationDomainError);
  assert.throws(() => assertAllowedKeys(["array"], ["name"]), ReservationDomainError);
});

test("11. normalizeNotes acota longitud y permite ausencia", () => {
  assert.equal(normalizeNotes(undefined), null);
  assert.equal(normalizeNotes(""), null);
  assert.equal(normalizeNotes("Traer balon propio"), "Traer balon propio");
  assert.throws(() => normalizeNotes("x".repeat(1001)), ReservationDomainError);
});

test("12. normalizeBlockReason y normalizeRejectionReason exigen texto no vacio", () => {
  assert.equal(normalizeBlockReason("Mantenimiento programado"), "Mantenimiento programado");
  assert.throws(() => normalizeBlockReason(""), ReservationDomainError);
  assert.throws(() => normalizeBlockReason("a"), ReservationDomainError);
  assert.equal(normalizeRejectionReason("Conflicto con mantenimiento"), "Conflicto con mantenimiento");
  assert.throws(() => normalizeRejectionReason(undefined), ReservationDomainError);
});

test("13. parseIsoInstant exige un offset explicito y rechaza strings ambiguos", () => {
  const parsed = parseIsoInstant("2026-08-01T10:00:00.000Z");
  assert.equal(parsed.toISOString(), "2026-08-01T10:00:00.000Z");
  assert.equal(parseIsoInstant("2026-08-01T05:00:00-05:00").toISOString(), "2026-08-01T10:00:00.000Z");
  assert.throws(() => parseIsoInstant("2026-08-01T10:00:00"), ReservationDomainError);
  assert.throws(() => parseIsoInstant("no-es-una-fecha"), ReservationDomainError);
  assert.throws(() => parseIsoInstant("x".repeat(65)), ReservationDomainError);
  assert.throws(() => parseIsoInstant(12345), ReservationDomainError);
});

test("14. mapReservationError traduce errores de dominio y generaliza lo desconocido", () => {
  const domainError = new ReservationDomainError("SLOT_UNAVAILABLE");
  const mapped = mapReservationError(domainError);
  assert.equal(mapped.status, 409);
  assert.equal(mapped.message, "Ese horario ya no esta disponible");

  const unexpected = mapReservationError(new Error("Prisma P2002 postgresql://user:pass@host/db"));
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.message, "No se pudo procesar la solicitud");
  assert.equal(JSON.stringify(unexpected).includes("postgresql"), false);
});

test("15. escapeReservationHtml escapa caracteres peligrosos", () => {
  assert.equal(
    escapeReservationHtml(`<script>"a" & 'b'</script>`),
    "&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;"
  );
  assert.equal(escapeReservationHtml(null), "");
  assert.equal(escapeReservationHtml(undefined), "");
});
