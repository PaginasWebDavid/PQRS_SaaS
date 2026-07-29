import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RESERVATION_TIMEZONE,
  formatTimeOfDay,
  getLocalWeekday,
  getWeekRangeUtc,
  getZonedDateParts,
  minutesOfDay,
  parseTimeOfDay,
  zonedTimeToUtc,
} from "../../src/domains/reservations/reservation-time";

test("1. getZonedDateParts interpreta el instante en America/Bogota (UTC-5 fijo)", () => {
  // 2026-07-15T13:30:00Z -> 08:30 en Bogota (UTC-5, sin horario de verano).
  const parts = getZonedDateParts(new Date("2026-07-15T13:30:00.000Z"), DEFAULT_RESERVATION_TIMEZONE);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 7);
  assert.equal(parts.day, 15);
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 30);
  // 2026-07-15 es miercoles.
  assert.equal(parts.weekday, 3);
});

test("2. zonedTimeToUtc convierte 08:00 hora local de Bogota a 13:00 UTC", () => {
  const utc = zonedTimeToUtc(2026, 7, 15, 8, 0, 0, DEFAULT_RESERVATION_TIMEZONE);
  assert.equal(utc.toISOString(), "2026-07-15T13:00:00.000Z");
});

test("3. zonedTimeToUtc y getZonedDateParts son inversas entre si", () => {
  const utc = zonedTimeToUtc(2026, 1, 20, 22, 15, 0, DEFAULT_RESERVATION_TIMEZONE);
  const parts = getZonedDateParts(utc, DEFAULT_RESERVATION_TIMEZONE);
  assert.deepEqual(
    { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute },
    { year: 2026, month: 1, day: 20, hour: 22, minute: 15 }
  );
});

test("4. getLocalWeekday usa la convencion 0=domingo..6=sabado en Bogota", () => {
  // 2026-07-19 es domingo (00:30 local -> 05:30 UTC).
  const sunday = new Date("2026-07-19T05:30:00.000Z");
  assert.equal(getLocalWeekday(sunday, DEFAULT_RESERVATION_TIMEZONE), 0);
});

test("5. getWeekRangeUtc calcula la semana [lunes 00:00, lunes siguiente 00:00) en hora local", () => {
  // 2026-07-15 (miercoles) 15:00 UTC = 10:00 Bogota.
  const wednesday = new Date("2026-07-15T15:00:00.000Z");
  const { weekStart, weekEnd } = getWeekRangeUtc(wednesday, DEFAULT_RESERVATION_TIMEZONE);
  // Lunes 2026-07-13 00:00 Bogota = 2026-07-13 05:00 UTC.
  assert.equal(weekStart.toISOString(), "2026-07-13T05:00:00.000Z");
  assert.equal(weekEnd.toISOString(), "2026-07-20T05:00:00.000Z");
});

test("6. getWeekRangeUtc: un lunes a medianoche local pertenece a su propia semana", () => {
  const mondayMidnight = zonedTimeToUtc(2026, 7, 13, 0, 0, 0, DEFAULT_RESERVATION_TIMEZONE);
  const { weekStart } = getWeekRangeUtc(mondayMidnight, DEFAULT_RESERVATION_TIMEZONE);
  assert.equal(weekStart.getTime(), mondayMidnight.getTime());
});

test("7. getWeekRangeUtc: un domingo pertenece a la semana que empezo el lunes anterior", () => {
  const sunday = zonedTimeToUtc(2026, 7, 19, 23, 0, 0, DEFAULT_RESERVATION_TIMEZONE);
  const { weekStart, weekEnd } = getWeekRangeUtc(sunday, DEFAULT_RESERVATION_TIMEZONE);
  assert.equal(weekStart.toISOString(), "2026-07-13T05:00:00.000Z");
  assert.equal(weekEnd.toISOString(), "2026-07-20T05:00:00.000Z");
});

test("8. parseTimeOfDay acepta HH:mm valido y rechaza formatos invalidos", () => {
  assert.deepEqual(parseTimeOfDay("08:00"), { hour: 8, minute: 0 });
  assert.deepEqual(parseTimeOfDay("23:59"), { hour: 23, minute: 59 });
  assert.equal(parseTimeOfDay("24:00"), null);
  assert.equal(parseTimeOfDay("8:00"), null);
  assert.equal(parseTimeOfDay("08:60"), null);
  assert.equal(parseTimeOfDay("noon"), null);
  assert.equal(parseTimeOfDay(800), null);
  assert.equal(parseTimeOfDay(null), null);
});

test("9. formatTimeOfDay y minutesOfDay son coherentes con parseTimeOfDay", () => {
  const parsed = parseTimeOfDay(" 08:05 ");
  assert.deepEqual(parsed, { hour: 8, minute: 5 });
  assert.equal(formatTimeOfDay(parsed!), "08:05");
  assert.equal(minutesOfDay(parsed!), 485);
});
