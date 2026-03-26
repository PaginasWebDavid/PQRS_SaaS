import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role === "RESIDENTE") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const monthParam = searchParams.get("month");
  const month = monthParam ? parseInt(monthParam) : null;

  let dateGte: Date;
  let dateLt: Date;
  if (month && month >= 1 && month <= 12) {
    dateGte = new Date(year, month - 1, 1);
    dateLt = new Date(year, month, 1);
  } else {
    dateGte = new Date(`${year}-01-01`);
    dateLt = new Date(`${year + 1}-01-01`);
  }

  const pqrs = await prisma.pqrs.findMany({
    where: {
      fechaRecibido: { gte: dateGte, lt: dateLt },
    },
  });

  // Summary
  const total = pqrs.length;
  const enEspera = pqrs.filter((p) => p.estado === "EN_ESPERA").length;
  const enProgreso = pqrs.filter((p) => p.estado === "EN_PROGRESO").length;
  const terminado = pqrs.filter((p) => p.estado === "TERMINADO").length;
  const porcentajeCompletadas = total > 0 ? Math.round((terminado / total) * 100) : 0;

  // Time averages
  const tiemposRespuesta = pqrs
    .filter((p) => p.tiempoRespuestaPrimerContacto !== null)
    .map((p) => p.tiempoRespuestaPrimerContacto!);
  const tiemposCierre = pqrs
    .filter((p) => p.tiempoRespuestaCierre !== null)
    .map((p) => p.tiempoRespuestaCierre!);

  const tiempoPromedioRespuesta = tiemposRespuesta.length > 0
    ? Math.round((tiemposRespuesta.reduce((a, b) => a + b, 0) / tiemposRespuesta.length) * 10) / 10
    : null;
  const tiempoPromedioCierre = tiemposCierre.length > 0
    ? Math.round((tiemposCierre.reduce((a, b) => a + b, 0) / tiemposCierre.length) * 10) / 10
    : null;

  // Monthly breakdown (for line chart)
  const porMes = MESES_CORTO.map((mes, i) => {
    const mesData = pqrs.filter((p) => p.fechaRecibido.getMonth() === i);
    return {
      mes,
      total: mesData.length,
      terminadas: mesData.filter((p) => p.estado === "TERMINADO").length,
    };
  });

  // By asunto (for bar chart)
  const asuntoCounts: Record<string, number> = {};
  for (const p of pqrs) {
    const key = p.asunto || "Sin asunto";
    asuntoCounts[key] = (asuntoCounts[key] || 0) + 1;
  }
  const porAsunto = Object.entries(asuntoCounts)
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor);

  // By estado (for pie chart)
  const porEstado = [
    { nombre: "En espera", valor: enEspera, color: "#eab308" },
    { nombre: "En proceso", valor: enProgreso, color: "#3b82f6" },
    { nombre: "Terminadas", valor: terminado, color: "#22c55e" },
  ];

  // By trimester
  const trimestres = [
    { label: "I TRIM", meses: [0, 1, 2] },
    { label: "II TRIM", meses: [3, 4, 5] },
    { label: "III TRIM", meses: [6, 7, 8] },
    { label: "IV TRIM", meses: [9, 10, 11] },
  ].map((t) => {
    const trimData = pqrs.filter((p) => t.meses.includes(p.fechaRecibido.getMonth()));
    return {
      label: t.label,
      total: trimData.length,
      terminado: trimData.filter((p) => p.estado === "TERMINADO").length,
      enProgreso: trimData.filter((p) => p.estado === "EN_PROGRESO").length,
      enEspera: trimData.filter((p) => p.estado === "EN_ESPERA").length,
    };
  });

  // By asunto with status breakdown and descriptions
  const asuntoMap: Record<string, { total: number; terminado: number; enProgreso: number; enEspera: number; descripciones: Set<string> }> = {};
  for (const p of pqrs) {
    const key = p.asunto || "Sin asunto";
    if (!asuntoMap[key]) {
      asuntoMap[key] = { total: 0, terminado: 0, enProgreso: 0, enEspera: 0, descripciones: new Set() };
    }
    asuntoMap[key].total++;
    if (p.estado === "TERMINADO") asuntoMap[key].terminado++;
    else if (p.estado === "EN_PROGRESO") asuntoMap[key].enProgreso++;
    else asuntoMap[key].enEspera++;
    if (p.subAsunto) asuntoMap[key].descripciones.add(p.subAsunto);
  }
  const porAsuntoDetalle = Object.entries(asuntoMap)
    .map(([asunto, d]) => ({
      asunto: asunto.toUpperCase(),
      cantidad: d.total,
      descripcion: Array.from(d.descripciones).join(", ") || "",
      terminados: d.terminado,
      enProgreso: d.enProgreso,
      enEspera: d.enEspera,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // PQRS en espera (urgent)
  const pendientes = pqrs
    .filter((p) => p.estado === "EN_ESPERA")
    .sort((a, b) => a.fechaRecibido.getTime() - b.fechaRecibido.getTime())
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      asunto: p.asunto || "Sin asunto",
      nombreResidente: p.nombreResidente,
      bloque: p.bloque,
      apto: p.apto,
      diasEspera: Math.ceil(
        (Date.now() - p.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

  // PQRS en proceso (new section)
  const pendientesEnProceso = pqrs
    .filter((p) => p.estado === "EN_PROGRESO")
    .sort((a, b) => a.fechaRecibido.getTime() - b.fechaRecibido.getTime())
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      asunto: p.asunto || "Sin asunto",
      nombreResidente: p.nombreResidente,
      bloque: p.bloque,
      apto: p.apto,
      diasEnProceso: Math.ceil(
        (Date.now() - (p.fechaPrimerContacto || p.fechaRecibido).getTime()) / (1000 * 60 * 60 * 24)
      ),
      faseActual: p.faseActual,
    }));

  return NextResponse.json({
    year,
    resumen: {
      total,
      enEspera,
      enProgreso,
      terminado,
      porcentajeCompletadas,
      tiempoPromedioRespuesta,
      tiempoPromedioCierre,
    },
    porMes,
    porAsunto,
    porEstado,
    trimestres,
    porAsuntoDetalle,
    pendientes,
    pendientesEnProceso,
  });
}
