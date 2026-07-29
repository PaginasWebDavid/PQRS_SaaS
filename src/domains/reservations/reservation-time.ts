// Utilidades puras de zona horaria para el modulo de reservas.
//
// El producto opera inicialmente en una sola zona horaria (America/Bogota).
// Los instantes siempre se almacenan en UTC (columnas `TIMESTAMP(3)` sin tz,
// que Prisma trata como el instante UTC exacto sin conversion). Todo lo que
// dependa de "hora del dia" o "dia de la semana" configurado por el conjunto
// (horario de apertura/cierre, dias bloqueados, limite semanal) se interpreta
// SIEMPRE segun esta zona horaria, nunca segun la zona horaria del proceso
// donde corre el servidor.
//
// No se agrega una columna de zona horaria por tenant a proposito (fuera de
// alcance de esta fase); si el producto se expande a otros paises, ese campo
// se agregaria en `Tenant` y este modulo lo consultaria en vez de la
// constante de abajo.

export const DEFAULT_RESERVATION_TIMEZONE = "America/Bogota";

export type ZonedDateParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Convencion de JS `Date.getDay()`: 0=domingo .. 6=sabado. */
  weekday: number;
};

const WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Descompone un instante UTC en los campos de calendario/hora locales de `timeZone`. */
export function getZonedDateParts(
  date: Date,
  timeZone: string = DEFAULT_RESERVATION_TIMEZONE
): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  // Algunas implementaciones ICU devuelven "24" para la medianoche con hour12:false.
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const weekday = WEEKDAY_BY_SHORT_NAME[map.weekday];
  if (weekday === undefined) throw new Error("RESERVATION_TIMEZONE_WEEKDAY_UNRESOLVED");
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday,
  };
}

/**
 * Convierte una fecha/hora civil (interpretada en `timeZone`) al instante UTC
 * correspondiente. Usa la tecnica de "doble formateo": arma un instante UTC
 * ingenuo con los mismos numeros, mide cuanto se desvia al reinterpretarlo en
 * la zona horaria objetivo, y corrige por esa diferencia. Es exacta para
 * zonas de offset fijo como America/Bogota (sin horario de verano).
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = DEFAULT_RESERVATION_TIMEZONE
): Date {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const zonedParts = getZonedDateParts(new Date(naiveUtcMs), timeZone);
  const zonedAsUtcMs = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second
  );
  const offsetMs = zonedAsUtcMs - naiveUtcMs;
  return new Date(naiveUtcMs - offsetMs);
}

export type TimeOfDay = { hour: number; minute: number };

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parsea "HH:mm" (24 horas). Devuelve `null` si el formato es invalido. */
export function parseTimeOfDay(value: unknown): TimeOfDay | null {
  if (typeof value !== "string") return null;
  const match = TIME_OF_DAY_PATTERN.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function formatTimeOfDay(time: TimeOfDay): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

export function minutesOfDay(time: TimeOfDay): number {
  return time.hour * 60 + time.minute;
}

/** Minutos desde la medianoche local (en `timeZone`) del instante dado. */
export function getLocalMinutesOfDay(
  date: Date,
  timeZone: string = DEFAULT_RESERVATION_TIMEZONE
): number {
  const parts = getZonedDateParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

/** Dia de la semana local (0=domingo..6=sabado) del instante dado. */
export function getLocalWeekday(
  date: Date,
  timeZone: string = DEFAULT_RESERVATION_TIMEZONE
): number {
  return getZonedDateParts(date, timeZone).weekday;
}

export type WeekRangeUtc = { weekStart: Date; weekEnd: Date };

/**
 * Rango [weekStart, weekEnd) en UTC de la semana local que contiene `date`.
 * La semana empieza el lunes a las 00:00:00 hora local de `timeZone` y
 * termina (exclusivo) el lunes siguiente a las 00:00:00. Esta es la
 * convencion ISO de inicio de semana usada para el limite semanal de
 * reservas por zona.
 */
export function getWeekRangeUtc(
  date: Date,
  timeZone: string = DEFAULT_RESERVATION_TIMEZONE
): WeekRangeUtc {
  const parts = getZonedDateParts(date, timeZone);
  const isoWeekday = parts.weekday === 0 ? 7 : parts.weekday; // lunes=1 .. domingo=7
  const daysSinceMonday = isoWeekday - 1;
  // Aritmetica de calendario puro (no de instantes) para hallar la fecha civil
  // del lunes, evitando cualquier suposicion sobre el offset entre dias.
  const mondayCivilMs =
    Date.UTC(parts.year, parts.month - 1, parts.day) - daysSinceMonday * 86_400_000;
  const mondayCivil = new Date(mondayCivilMs);
  const weekStart = zonedTimeToUtc(
    mondayCivil.getUTCFullYear(),
    mondayCivil.getUTCMonth() + 1,
    mondayCivil.getUTCDate(),
    0,
    0,
    0,
    timeZone
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  return { weekStart, weekEnd };
}
