export type EstadoPqrsSla = "EN_ESPERA" | "EN_PROGRESO" | "TERMINADO";

export function daysSince(date: Date, now: Date) {
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

// Fuente unica de la regla de "vencida": un caso cerrado esta vencido si tardo mas
// dias que el SLA (el limite exacto cuenta como a tiempo); uno abierto esta vencido
// si ya lleva mas dias abiertos que el SLA. reportes.service.ts y analytics.service.ts
// usaban formulas ligeramente distintas (>= vs >) que daban cifras de "vencidas"
// diferentes para el mismo dato; ahora ambos consumen esta misma regla.
export function isVencida(
  row: { estado: EstadoPqrsSla; tiempoRespuestaCierre: number | null; fechaRecibido: Date },
  slaDays: number,
  now: Date
) {
  if (row.estado === "TERMINADO") return (row.tiempoRespuestaCierre ?? 0) > slaDays;
  return daysSince(row.fechaRecibido, now) > slaDays;
}

// Fecha de corte para consultas Prisma sobre casos abiertos: fechaRecibido <= este
// valor equivale a daysSince(fechaRecibido, now) > thresholdDays (misma semantica
// que isVencida), para poder filtrar en la base de datos sin traer todas las filas.
export function overdueCutoffDate(thresholdDays: number, now: Date) {
  return new Date(now.getTime() - (thresholdDays + 1) * 86400000);
}
