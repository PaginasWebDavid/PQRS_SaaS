import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TIPO_LABEL: Record<string, string> = {
  PETICION: "Petición",
  QUEJA: "Queja",
  RECLAMO: "Reclamo",
  SUGERENCIA: "Sugerencia",
};

const ESTADO_LABEL: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_PROGRESO: "En progreso",
  TERMINADO: "Terminado",
};

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
  const month = searchParams.get("month"); // optional: 1-12

  let dateFrom: Date;
  let dateTo: Date;

  if (month) {
    const m = parseInt(month);
    dateFrom = new Date(year, m - 1, 1);
    dateTo = new Date(year, m, 1);
  } else {
    dateFrom = new Date(`${year}-01-01`);
    dateTo = new Date(`${year + 1}-01-01`);
  }

  // All PQRS in the period
  const pqrs = await prisma.pqrs.findMany({
    where: {
      fechaRecibido: { gte: dateFrom, lt: dateTo },
    },
    orderBy: { numero: "asc" },
    include: {
      creadoPor: { select: { name: true } },
      gestionadoPor: { select: { name: true } },
    },
  });

  // State transitions in the period (from historial)
  const historial = await prisma.historialPqrs.findMany({
    where: {
      creadoAt: { gte: dateFrom, lt: dateTo },
      estadoAntes: { not: null },
    },
    include: {
      pqrs: { select: { numero: true, asunto: true } },
    },
  });

  const transiciones = {
    espera_a_progreso: historial.filter(
      (h) => h.estadoAntes === "EN_ESPERA" && h.estadoDespues === "EN_PROGRESO"
    ).length,
    progreso_a_terminado: historial.filter(
      (h) => h.estadoAntes === "EN_PROGRESO" && h.estadoDespues === "TERMINADO"
    ).length,
  };

  // Summary stats
  const total = pqrs.length;
  const byTipo = { peticion: 0, queja: 0, reclamo: 0, sugerencia: 0 };
  const byEstado = { enEspera: 0, enProgreso: 0, terminado: 0 };
  let sumRespuesta = 0;
  let countRespuesta = 0;
  let sumCierre = 0;
  let countCierre = 0;

  for (const p of pqrs) {
    if (p.tipoPqrs === "PETICION") byTipo.peticion++;
    if (p.tipoPqrs === "QUEJA") byTipo.queja++;
    if (p.tipoPqrs === "RECLAMO") byTipo.reclamo++;
    if (p.tipoPqrs === "SUGERENCIA") byTipo.sugerencia++;

    if (p.estado === "EN_ESPERA") byEstado.enEspera++;
    if (p.estado === "EN_PROGRESO") byEstado.enProgreso++;
    if (p.estado === "TERMINADO") byEstado.terminado++;

    if (p.tiempoRespuestaPrimerContacto !== null) {
      sumRespuesta += p.tiempoRespuestaPrimerContacto;
      countRespuesta++;
    }
    if (p.tiempoRespuestaCierre !== null) {
      sumCierre += p.tiempoRespuestaCierre;
      countCierre++;
    }
  }

  // Detailed list for export
  const detalle = pqrs.map((p) => ({
    numero: p.numero,
    medio: p.medio === "PLATAFORMA_WEB" ? "Plataforma Web" : p.medio,
    fechaRecibido: p.fechaRecibido.toLocaleDateString("es-CO"),
    mes: p.mes,
    bloque: p.bloque,
    apto: p.apto,
    nombreResidente: p.nombreResidente,
    tipoPqrs: TIPO_LABEL[p.tipoPqrs] || p.tipoPqrs,
    asunto: p.asunto,
    descripcion: p.descripcion,
    fechaPrimerContacto: p.fechaPrimerContacto
      ? p.fechaPrimerContacto.toLocaleDateString("es-CO")
      : "",
    tiempoRespuestaPrimerContacto: p.tiempoRespuestaPrimerContacto ?? "",
    accionTomada: p.accionTomada || "",
    estado: ESTADO_LABEL[p.estado] || p.estado,
    evidenciaCierre: p.evidenciaCierre || "",
    fechaCierre: p.fechaCierre ? p.fechaCierre.toLocaleDateString("es-CO") : "",
    tiempoRespuestaCierre: p.tiempoRespuestaCierre ?? "",
    gestionadoPor: p.gestionadoPor?.name || "",
  }));

  return NextResponse.json({
    year,
    month: month ? parseInt(month) : null,
    resumen: {
      total,
      byTipo,
      byEstado,
      porcentajeCompletadas: total > 0 ? Math.round((byEstado.terminado / total) * 100) : 0,
      tiempoPromedioRespuesta: countRespuesta > 0 ? Math.round((sumRespuesta / countRespuesta) * 10) / 10 : null,
      tiempoPromedioCierre: countCierre > 0 ? Math.round((sumCierre / countCierre) * 10) / 10 : null,
    },
    transiciones,
    detalle,
  });
}
