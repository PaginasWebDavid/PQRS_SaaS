import { prisma } from "@/lib/prisma";
import { getGeneralSettings } from "@/domains/platform/platform-setting.service";

export type Granularity = "day" | "week" | "month" | "quarter";
export type Estado = "EN_ESPERA" | "EN_PROGRESO" | "TERMINADO";
export type Prioridad = "ALTA" | "MEDIA" | "BAJA";

export function resolvePeriod(params: URLSearchParams) {
  const now = new Date();
  const preset = params.get("preset") || "last30";
  const comparisonMode = params.get("comparisonMode") || "previous";

  let from: Date;
  let to: Date;

  if (preset === "custom") {
    const customFrom = params.get("from");
    const customTo = params.get("to");
    from = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
    const toBase = customTo ? new Date(customTo) : new Date(now);
    to = new Date(toBase);
    to.setHours(0, 0, 0, 0);
    to.setDate(to.getDate() + 1);
  } else if (preset === "last7") {
    to = new Date(now); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
    from = new Date(to); from.setDate(from.getDate() - 7);
  } else if (preset === "thisMonth") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (preset === "lastMonth") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === "thisQuarter") {
    const q = Math.floor(now.getMonth() / 3);
    from = new Date(now.getFullYear(), q * 3, 1);
    to = new Date(now.getFullYear(), q * 3 + 3, 1);
  } else if (preset === "lastQuarter") {
    const qRaw = Math.floor(now.getMonth() / 3) - 1;
    const year = qRaw < 0 ? now.getFullYear() - 1 : now.getFullYear();
    const q = (qRaw + 4) % 4;
    from = new Date(year, q * 3, 1);
    to = new Date(year, q * 3 + 3, 1);
  } else if (preset === "thisYear") {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now.getFullYear() + 1, 0, 1);
  } else if (preset === "lastYear") {
    from = new Date(now.getFullYear() - 1, 0, 1);
    to = new Date(now.getFullYear(), 0, 1);
  } else {
    to = new Date(now); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
    from = new Date(to); from.setDate(from.getDate() - 30);
  }

  const spanMs = to.getTime() - from.getTime();
  let compareFrom: Date;
  let compareTo: Date;
  const compareFromParam = params.get("compareFrom");
  const compareToParam = params.get("compareTo");

  if (comparisonMode === "custom" && compareFromParam && compareToParam) {
    compareFrom = new Date(compareFromParam);
    compareTo = new Date(compareToParam);
  } else if (comparisonMode === "lastYear") {
    compareFrom = new Date(from); compareFrom.setFullYear(compareFrom.getFullYear() - 1);
    compareTo = new Date(to); compareTo.setFullYear(compareTo.getFullYear() - 1);
  } else {
    compareTo = new Date(from);
    compareFrom = new Date(from.getTime() - spanMs);
  }

  const granularityParam = params.get("granularity") as Granularity | null;
  const granularity: Granularity = granularityParam || (spanMs > 1000 * 60 * 60 * 24 * 180 ? "month" : spanMs > 1000 * 60 * 60 * 24 * 60 ? "week" : "day");

  return { from, to, compareFrom, compareTo, granularity };
}

export type ReportesFilters = {
  tenantId: string;
  from: Date;
  to: Date;
  compareFrom: Date;
  compareTo: Date;
  granularity: Granularity;
  estado?: Estado;
  asunto?: string;
  prioridad?: Prioridad;
  bloque?: number;
  gestionadoPorId?: string;
  cumplimiento?: "dentro" | "fuera";
};

type RawRow = {
  id: string;
  numero: number;
  numeroRadicacion: string | null;
  nombreResidente: string;
  bloque: number;
  apto: number;
  asunto: string | null;
  subAsunto: string | null;
  prioridad: Prioridad;
  estado: Estado;
  fechaRecibido: Date;
  fechaPrimerContacto: Date | null;
  tiempoRespuestaPrimerContacto: number | null;
  fechaCierre: Date | null;
  tiempoRespuestaCierre: number | null;
  updatedAt: Date;
  gestionadoPorId: string | null;
  gestionadoPor: { name: string | null } | null;
  creadoPor: { name: string | null } | null;
};

const ROW_SELECT = {
  id: true,
  numero: true,
  numeroRadicacion: true,
  nombreResidente: true,
  bloque: true,
  apto: true,
  asunto: true,
  subAsunto: true,
  prioridad: true,
  estado: true,
  fechaRecibido: true,
  fechaPrimerContacto: true,
  tiempoRespuestaPrimerContacto: true,
  fechaCierre: true,
  tiempoRespuestaCierre: true,
  updatedAt: true,
  gestionadoPorId: true,
  gestionadoPor: { select: { name: true } },
  creadoPor: { select: { name: true } },
} as const;

export function slugifyTenantName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "conjunto";
}

export function reportFileName(tenantName: string, ext: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `reporte-pqrs-${slugifyTenantName(tenantName)}-${date}.${ext}`;
}

function daysSince(date: Date, now: Date) {
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

function avg(values: number[]) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

function pctDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function isVencida(row: { estado: Estado; tiempoRespuestaCierre: number | null; fechaRecibido: Date }, slaDays: number, now: Date) {
  if (row.estado === "TERMINADO") return (row.tiempoRespuestaCierre ?? 0) > slaDays;
  return daysSince(row.fechaRecibido, now) > slaDays;
}

function bucketStart(date: Date, granularity: Granularity): Date {
  const d = new Date(date);
  if (granularity === "day") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (granularity === "week") {
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  if (granularity === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function bucketLabel(date: Date, granularity: Granularity): string {
  if (granularity === "day") return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  if (granularity === "week") return `Sem. ${date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}`;
  if (granularity === "month") return date.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `T${q} ${date.getFullYear()}`;
}

function nextBucket(date: Date, granularity: Granularity): Date {
  const d = new Date(date);
  if (granularity === "day") d.setDate(d.getDate() + 1);
  else if (granularity === "week") d.setDate(d.getDate() + 7);
  else if (granularity === "month") d.setMonth(d.getMonth() + 1);
  else d.setMonth(d.getMonth() + 3);
  return d;
}

function buildBuckets(from: Date, to: Date, granularity: Granularity) {
  const buckets: { start: Date; end: Date; label: string }[] = [];
  let cursor = bucketStart(from, granularity);
  const cap = 400;
  let i = 0;
  while (cursor < to && i < cap) {
    const end = nextBucket(cursor, granularity);
    buckets.push({ start: cursor, end, label: bucketLabel(cursor, granularity) });
    cursor = end;
    i++;
  }
  return buckets;
}

const ASUNTO_LABELS: Record<string, string> = {
  "AREA COMUN": "Área común",
  "AREA PRIVADA": "Área privada",
  CONTABILIDAD: "Contabilidad",
  CONVIVENCIA: "Convivencia",
  "HUMEDAD/CUBIERTA": "Humedad - Cubierta",
  "HUMEDAD/DEPOSITO": "Humedad - Depósito",
  "HUMEDAD/VENTANAS": "Humedad - Ventanas",
  "HUMEDAD/FACHADA": "Humedad - Fachada",
  "HUMEDAD/GARAJE": "Humedad - Garaje",
};
function asuntoLabel(asunto: string | null) {
  if (!asunto) return "Sin categoría";
  return ASUNTO_LABELS[asunto] || asunto;
}

async function fetchRows(tenantId: string, from: Date, to: Date, filters: Partial<ReportesFilters>, byReceivedDate: boolean): Promise<RawRow[]> {
  return prisma.pqrs.findMany({
    where: {
      tenantId,
      ...(byReceivedDate ? { fechaRecibido: { gte: from, lt: to } } : {}),
      ...(filters.estado ? { estado: filters.estado } : {}),
      ...(filters.asunto ? { asunto: filters.asunto } : {}),
      ...(filters.prioridad ? { prioridad: filters.prioridad } : {}),
      ...(filters.bloque ? { bloque: filters.bloque } : {}),
      ...(filters.gestionadoPorId ? { gestionadoPorId: filters.gestionadoPorId } : {}),
    },
    select: ROW_SELECT,
    orderBy: { fechaRecibido: "desc" },
    take: 5000,
  });
}

export async function getPqrsReportData(filters: ReportesFilters) {
  const now = new Date();
  const { pqrsCloseSlaDays: slaDays } = await getGeneralSettings();

  const [currentAll, compareAll, openAll, lifetimeLight] = await Promise.all([
    fetchRows(filters.tenantId, filters.from, filters.to, filters, true),
    fetchRows(filters.tenantId, filters.compareFrom, filters.compareTo, filters, true),
    prisma.pqrs.findMany({
      where: {
        tenantId: filters.tenantId,
        estado: { not: "TERMINADO" },
        ...(filters.asunto ? { asunto: filters.asunto } : {}),
        ...(filters.prioridad ? { prioridad: filters.prioridad } : {}),
        ...(filters.bloque ? { bloque: filters.bloque } : {}),
        ...(filters.gestionadoPorId ? { gestionadoPorId: filters.gestionadoPorId } : {}),
      },
      select: ROW_SELECT,
      take: 5000,
    }),
    prisma.pqrs.findMany({
      where: { tenantId: filters.tenantId, fechaRecibido: { lte: filters.to } },
      select: { fechaRecibido: true, fechaCierre: true },
      take: 20000,
    }),
  ]);

  const cumplimientoFilter = (rows: RawRow[]) => {
    if (!filters.cumplimiento) return rows;
    return rows.filter((r) => {
      const vencida = isVencida(r, slaDays, now);
      return filters.cumplimiento === "fuera" ? vencida : !vencida;
    });
  };

  const current = cumplimientoFilter(currentAll);
  const compare = cumplimientoFilter(compareAll);
  const open = cumplimientoFilter(openAll);

  // ---------- A. Resumen ejecutivo ----------
  const closedCurrent = current.filter((r) => r.estado === "TERMINADO");
  const closedCompare = compare.filter((r) => r.estado === "TERMINADO");
  const vencidasCurrent = current.filter((r) => isVencida(r, slaDays, now));
  const vencidasCompare = compare.filter((r) => isVencida(r, slaDays, now));

  const tContactoCurrent = current.map((r) => r.tiempoRespuestaPrimerContacto).filter((v): v is number => v != null);
  const tContactoCompare = compare.map((r) => r.tiempoRespuestaPrimerContacto).filter((v): v is number => v != null);
  const tCierreCurrent = closedCurrent.map((r) => r.tiempoRespuestaCierre).filter((v): v is number => v != null);
  const tCierreCompare = closedCompare.map((r) => r.tiempoRespuestaCierre).filter((v): v is number => v != null);

  const cumplimientoPctCurrent = closedCurrent.length > 0 ? Math.round((closedCurrent.filter((r) => (r.tiempoRespuestaCierre ?? 0) <= slaDays).length / closedCurrent.length) * 100) : null;
  const cumplimientoPctCompare = closedCompare.length > 0 ? Math.round((closedCompare.filter((r) => (r.tiempoRespuestaCierre ?? 0) <= slaDays).length / closedCompare.length) * 100) : null;

  const resumen = {
    total: { value: current.length, prev: compare.length, deltaPct: pctDelta(current.length, compare.length), goodDirection: "up" as const },
    abiertas: { value: current.filter((r) => r.estado === "EN_ESPERA").length, prev: compare.filter((r) => r.estado === "EN_ESPERA").length, deltaPct: pctDelta(current.filter((r) => r.estado === "EN_ESPERA").length, compare.filter((r) => r.estado === "EN_ESPERA").length), goodDirection: "down" as const },
    enProceso: { value: current.filter((r) => r.estado === "EN_PROGRESO").length, prev: compare.filter((r) => r.estado === "EN_PROGRESO").length, deltaPct: pctDelta(current.filter((r) => r.estado === "EN_PROGRESO").length, compare.filter((r) => r.estado === "EN_PROGRESO").length), goodDirection: "down" as const },
    cerradas: { value: closedCurrent.length, prev: closedCompare.length, deltaPct: pctDelta(closedCurrent.length, closedCompare.length), goodDirection: "up" as const },
    vencidas: { value: vencidasCurrent.length, prev: vencidasCompare.length, deltaPct: pctDelta(vencidasCurrent.length, vencidasCompare.length), goodDirection: "down" as const },
    tiempoPromedioPrimerContacto: { value: avg(tContactoCurrent), prev: avg(tContactoCompare), deltaPct: pctDelta(avg(tContactoCurrent), avg(tContactoCompare)), goodDirection: "down" as const },
    tiempoPromedioCierre: { value: avg(tCierreCurrent), prev: avg(tCierreCompare), deltaPct: pctDelta(avg(tCierreCurrent), avg(tCierreCompare)), goodDirection: "down" as const },
    pctCumplimiento: { value: cumplimientoPctCurrent, prev: cumplimientoPctCompare, deltaPct: pctDelta(cumplimientoPctCurrent, cumplimientoPctCompare), goodDirection: "up" as const },
    tasaReapertura: { value: null, prev: null, deltaPct: null, goodDirection: "down" as const, soportado: false as const },
  };

  // ---------- B. Alertas ----------
  const sinAbrir = open.filter((r) => r.estado === "EN_ESPERA" && daysSince(r.fechaRecibido, now) >= 3);
  const sinCerrar = open.filter((r) => r.estado === "EN_PROGRESO" && daysSince(r.fechaPrimerContacto || r.fechaRecibido, now) >= 5);
  const sinActividad = open.filter((r) => daysSince(r.updatedAt, now) >= 5);
  const proximosAVencer = open.filter((r) => {
    const d = daysSince(r.fechaRecibido, now);
    return d <= slaDays && d >= Math.ceil(slaDays * 0.8);
  });
  const vencidosAhora = open.filter((r) => daysSince(r.fechaRecibido, now) > slaDays);

  const responsableCounts = new Map<string, { name: string; count: number }>();
  for (const r of open) {
    if (!r.gestionadoPorId) continue;
    const entry = responsableCounts.get(r.gestionadoPorId) || { name: r.gestionadoPor?.name || "Sin nombre", count: 0 };
    entry.count++;
    responsableCounts.set(r.gestionadoPorId, entry);
  }
  const responsableValues = Array.from(responsableCounts.values());
  const responsableAvg = responsableValues.length > 0 ? responsableValues.reduce((a, b) => a + b.count, 0) / responsableValues.length : 0;
  const responsableThreshold = Math.max(5, Math.ceil(responsableAvg * 1.5));
  const responsablesSobrecargados = responsableValues.filter((r) => r.count >= responsableThreshold);

  const currentByAsunto = new Map<string, number>();
  for (const r of current) currentByAsunto.set(r.asunto || "Sin categoría", (currentByAsunto.get(r.asunto || "Sin categoría") || 0) + 1);
  const compareByAsunto = new Map<string, number>();
  for (const r of compare) compareByAsunto.set(r.asunto || "Sin categoría", (compareByAsunto.get(r.asunto || "Sin categoría") || 0) + 1);
  const categoriasAtipicas: { asunto: string; count: number; prevCount: number; deltaPct: number }[] = [];
  for (const [asunto, count] of Array.from(currentByAsunto.entries())) {
    const prevCount = compareByAsunto.get(asunto) || 0;
    if (count >= 3 && prevCount > 0) {
      const delta = pctDelta(count, prevCount);
      if (delta !== null && delta >= 50) categoriasAtipicas.push({ asunto, count, prevCount, deltaPct: delta });
    }
  }

  const alertas = [
    { key: "sinAbrir", level: "alta" as const, count: sinAbrir.length, motivo: "PQRS sin ser abiertas (primer contacto) hace 3 días o más", filterHint: { quick: "sinAbrir" } },
    { key: "sinCerrar", level: "media" as const, count: sinCerrar.length, motivo: "PQRS en proceso sin cerrar hace 5 días o más desde el primer contacto", filterHint: { quick: "sinCerrar" } },
    { key: "sinActividad", level: "media" as const, count: sinActividad.length, motivo: "Casos sin ninguna actualización en los últimos 5 días", filterHint: { quick: "sinActividad" } },
    { key: "proximosAVencer", level: "media" as const, count: proximosAVencer.length, motivo: `Casos que llegarán al límite de ${slaDays} días en las próximas 24-48 horas`, filterHint: { quick: "proximosAVencer" } },
    { key: "vencidos", level: "alta" as const, count: vencidosAhora.length, motivo: `Casos que ya superaron el tiempo esperado de ${slaDays} días sin cerrarse`, filterHint: { quick: "vencidos" } },
    ...responsablesSobrecargados.map((r) => ({ key: `responsable-${r.name}`, level: "media" as const, count: r.count, motivo: `${r.name} tiene ${r.count} casos abiertos acumulados`, filterHint: { quick: "responsable", value: r.name } })),
    ...categoriasAtipicas.map((c) => ({ key: `categoria-${c.asunto}`, level: "baja" as const, count: c.count, motivo: `La categoría "${asuntoLabel(c.asunto)}" aumentó ${c.deltaPct}% frente al periodo anterior (${c.prevCount} → ${c.count})`, filterHint: { quick: "categoria", value: c.asunto } })),
  ].filter((a) => a.count > 0);

  // ---------- C. Tiempos de atención ----------
  const closeBuckets3 = { menos3: 0, entre3y7: 0, mas7: 0 };
  for (const r of closedCurrent) {
    const t = r.tiempoRespuestaCierre ?? 0;
    if (t < 3) closeBuckets3.menos3++;
    else if (t <= 7) closeBuckets3.entre3y7++;
    else closeBuckets3.mas7++;
  }

  function groupTimeBy(rows: RawRow[], keyFn: (r: RawRow) => string) {
    const map = new Map<string, { count: number; cerrados: number; times: number[] }>();
    for (const r of rows) {
      const key = keyFn(r);
      const entry = map.get(key) || { count: 0, cerrados: 0, times: [] };
      entry.count++;
      if (r.estado === "TERMINADO" && r.tiempoRespuestaCierre != null) {
        entry.cerrados++;
        entry.times.push(r.tiempoRespuestaCierre);
      }
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, count: v.count, avgCierre: avg(v.times), cumplimientoPct: v.cerrados > 0 ? Math.round((v.times.filter((t) => t <= slaDays).length / v.cerrados) * 100) : null }));
  }

  const tiempos = {
    primerContacto: { avg: avg(tContactoCurrent), median: median(tContactoCurrent), min: tContactoCurrent.length ? Math.min(...tContactoCurrent) : null, max: tContactoCurrent.length ? Math.max(...tContactoCurrent) : null },
    cierre: { avg: avg(tCierreCurrent), median: median(tCierreCurrent), min: tCierreCurrent.length ? Math.min(...tCierreCurrent) : null, max: tCierreCurrent.length ? Math.max(...tCierreCurrent) : null },
    distribucionCierre: [
      { label: "< 3 días", count: closeBuckets3.menos3 },
      { label: "3-7 días", count: closeBuckets3.entre3y7 },
      { label: "+7 días", count: closeBuckets3.mas7 },
    ],
    porCategoria: groupTimeBy(current, (r) => asuntoLabel(r.asunto)),
    porPrioridad: groupTimeBy(current, (r) => r.prioridad),
    porResponsable: groupTimeBy(current, (r) => r.gestionadoPor?.name || "Sin asignar"),
    pctCumplimiento: cumplimientoPctCurrent,
    slaDays,
  };

  // ---------- D. Tendencias ----------
  const buckets = buildBuckets(filters.from, filters.to, filters.granularity);
  const lifetimeRows = lifetimeLight;
  const seriesRecibidas = buckets.map((b) => ({ label: b.label, value: current.filter((r) => r.fechaRecibido >= b.start && r.fechaRecibido < b.end).length }));
  const seriesCerradas = buckets.map((b) => ({ label: b.label, value: current.filter((r) => r.fechaCierre && r.fechaCierre >= b.start && r.fechaCierre < b.end).length }));
  const seriesInventario = buckets.map((b) => ({
    label: b.label,
    value: lifetimeRows.filter((r) => r.fechaRecibido < b.end && (!r.fechaCierre || r.fechaCierre >= b.end)).length,
  }));
  const seriesVencidos = buckets.map((b) => ({
    label: b.label,
    value: lifetimeRows.filter((r) => r.fechaRecibido < b.end && (!r.fechaCierre || r.fechaCierre >= b.end) && daysSince(r.fechaRecibido, b.end) > slaDays).length,
  }));
  const seriesTiempoPromedio = buckets.map((b) => {
    const closedInBucket = current.filter((r) => r.fechaCierre && r.fechaCierre >= b.start && r.fechaCierre < b.end && r.tiempoRespuestaCierre != null);
    return { label: b.label, value: avg(closedInBucket.map((r) => r.tiempoRespuestaCierre as number)) };
  });
  const seriesCumplimiento = buckets.map((b) => {
    const closedInBucket = current.filter((r) => r.fechaCierre && r.fechaCierre >= b.start && r.fechaCierre < b.end);
    return { label: b.label, value: closedInBucket.length > 0 ? Math.round((closedInBucket.filter((r) => (r.tiempoRespuestaCierre ?? 0) <= slaDays).length / closedInBucket.length) * 100) : null };
  });

  // ---------- E. Distribución ----------
  function countBy(rows: RawRow[], keyFn: (r: RawRow) => string) {
    const map = new Map<string, number>();
    for (const r of rows) { const k = keyFn(r); map.set(k, (map.get(k) || 0) + 1); }
    return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }
  const distribucion = {
    porCategoria: countBy(current, (r) => asuntoLabel(r.asunto)),
    porSubcategoria: countBy(current.filter((r) => r.subAsunto), (r) => r.subAsunto as string),
    porEstado: countBy(current, (r) => r.estado),
    porPrioridad: countBy(current, (r) => r.prioridad),
    porResponsable: countBy(current, (r) => r.gestionadoPor?.name || "Sin asignar"),
    porBloque: countBy(current, (r) => `Bloque ${r.bloque}`),
    categoriasMayorCrecimiento: categoriasAtipicas.map((c) => ({ label: asuntoLabel(c.asunto), deltaPct: c.deltaPct, count: c.count })).sort((a, b) => b.deltaPct - a.deltaPct),
    categoriasMayorTiempoResolucion: tiempos.porCategoria.filter((c) => c.avgCierre != null).sort((a, b) => (b.avgCierre ?? 0) - (a.avgCierre ?? 0)).slice(0, 5),
  };

  // ---------- F. Desempeño operativo ----------
  const responsableIds = new Set<string>();
  for (const r of current) if (r.gestionadoPorId) responsableIds.add(r.gestionadoPorId);
  for (const r of open) if (r.gestionadoPorId) responsableIds.add(r.gestionadoPorId);
  const desempeno = Array.from(responsableIds).map((id) => {
    const mine = current.filter((r) => r.gestionadoPorId === id);
    const mineCompare = compare.filter((r) => r.gestionadoPorId === id);
    const minePendientes = open.filter((r) => r.gestionadoPorId === id);
    const name = mine[0]?.gestionadoPor?.name || minePendientes[0]?.gestionadoPor?.name || "Sin nombre";
    const cerrados = mine.filter((r) => r.estado === "TERMINADO");
    const cerradosCompare = mineCompare.filter((r) => r.estado === "TERMINADO");
    const vencidos = minePendientes.filter((r) => isVencida(r, slaDays, now));
    return {
      responsable: name,
      casosAsignados: mine.length,
      casosCerrados: cerrados.length,
      casosPendientes: minePendientes.length,
      casosVencidos: vencidos.length,
      tiempoPromedioPrimerContacto: avg(mine.map((r) => r.tiempoRespuestaPrimerContacto).filter((v): v is number => v != null)),
      tiempoPromedioCierre: avg(cerrados.map((r) => r.tiempoRespuestaCierre).filter((v): v is number => v != null)),
      pctCumplimiento: cerrados.length > 0 ? Math.round((cerrados.filter((r) => (r.tiempoRespuestaCierre ?? 0) <= slaDays).length / cerrados.length) * 100) : null,
      cargaActual: minePendientes.length,
      tendenciaDeltaPct: pctDelta(cerrados.length, cerradosCompare.length),
    };
  }).sort((a, b) => b.casosAsignados - a.casosAsignados);

  // ---------- G. Tabla detallada ----------
  const toDetalleRow = (r: RawRow) => ({
    id: r.id,
    numero: r.numero,
    numeroRadicacion: r.numeroRadicacion,
    fechaRecibido: r.fechaRecibido,
    solicitante: r.nombreResidente,
    ubicacion: `B${r.bloque}-${r.apto}`,
    bloque: r.bloque,
    categoria: asuntoLabel(r.asunto),
    subcategoria: r.subAsunto,
    prioridad: r.prioridad,
    estado: r.estado,
    responsable: r.gestionadoPor?.name || null,
    fechaPrimerContacto: r.fechaPrimerContacto,
    tiempoPrimerContacto: r.tiempoRespuestaPrimerContacto,
    ultimaActualizacion: r.updatedAt,
    fechaCierre: r.fechaCierre,
    tiempoCierre: r.tiempoRespuestaCierre,
    vencida: isVencida(r, slaDays, now),
  });
  const detalle = current.map(toDetalleRow);
  const alertCases = {
    sinAbrir: sinAbrir.map(toDetalleRow),
    sinCerrar: sinCerrar.map(toDetalleRow),
    sinActividad: sinActividad.map(toDetalleRow),
    proximosAVencer: proximosAVencer.map(toDetalleRow),
    vencidos: vencidosAhora.map(toDetalleRow),
  };

  // ---------- Hallazgos automáticos ----------
  const hallazgos: string[] = [];
  if (resumen.tiempoPromedioCierre.deltaPct !== null) {
    const dir = resumen.tiempoPromedioCierre.deltaPct < 0 ? "mejoró" : "empeoró";
    hallazgos.push(`El tiempo promedio de cierre ${dir} un ${Math.abs(resumen.tiempoPromedioCierre.deltaPct)}% frente al periodo anterior.`);
  }
  if (resumen.tiempoPromedioPrimerContacto.deltaPct !== null) {
    const dir = resumen.tiempoPromedioPrimerContacto.deltaPct < 0 ? "mejoró" : "empeoró";
    hallazgos.push(`El tiempo de primer contacto ${dir} un ${Math.abs(resumen.tiempoPromedioPrimerContacto.deltaPct)}% frente al periodo anterior.`);
  }
  if (distribucion.porCategoria.length > 0 && current.length > 0) {
    const top = distribucion.porCategoria[0];
    hallazgos.push(`Los casos de "${top.label}" representan el ${Math.round((top.count / current.length) * 100)}% de las PQRS recibidas.`);
  }
  if (vencidasCurrent.length > 0) {
    const diff = vencidasCurrent.length - vencidasCompare.length;
    hallazgos.push(diff > 0 ? `Actualmente hay ${vencidasCurrent.length} casos vencidos, ${diff} más que en el periodo anterior.` : diff < 0 ? `Actualmente hay ${vencidasCurrent.length} casos vencidos, ${Math.abs(diff)} menos que en el periodo anterior.` : `Actualmente hay ${vencidasCurrent.length} casos vencidos, igual que en el periodo anterior.`);
  }
  if (distribucion.categoriasMayorTiempoResolucion.length > 0) {
    const worst = distribucion.categoriasMayorTiempoResolucion[0];
    hallazgos.push(`La categoría "${worst.key}" tiene el mayor tiempo promedio de cierre (${worst.avgCierre} días).`);
  }
  if (current.length >= 7) {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const r of current) dayCounts[r.fechaRecibido.getDay()]++;
    const maxDay = dayCounts.indexOf(Math.max(...dayCounts));
    const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    hallazgos.push(`Los ${dayNames[maxDay]}s presentan el mayor volumen de solicitudes.`);
  }

  return {
    periodo: { from: filters.from, to: filters.to, compareFrom: filters.compareFrom, compareTo: filters.compareTo },
    slaDays,
    resumen,
    alertas,
    tiempos,
    tendencias: { granularity: filters.granularity, seriesRecibidas, seriesCerradas, seriesInventario, seriesVencidos, seriesTiempoPromedio, seriesCumplimiento },
    distribucion,
    desempeno,
    detalle,
    alertCases,
    hallazgos,
    hayDatosSuficientes: current.length > 0,
    hayComparacionSuficiente: compare.length > 0,
  };
}
