import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ESTADO_LABEL: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_PROGRESO: "En proceso",
  TERMINADO: "Terminado",
};

const FASE_LABEL: Record<number, string> = {
  1: "Fase I",
  2: "Fase II",
  3: "Fase III",
  4: "Fase IV",
  5: "Fase V",
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
  const month = searchParams.get("month");

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

  // Summary stats
  const total = pqrs.length;
  const byEstado = { enEspera: 0, enProgreso: 0, terminado: 0 };
  const byAsunto: Record<string, number> = {};
  let sumRespuesta = 0;
  let countRespuesta = 0;
  let sumCierre = 0;
  let countCierre = 0;

  for (const p of pqrs) {
    if (p.estado === "EN_ESPERA") byEstado.enEspera++;
    if (p.estado === "EN_PROGRESO") byEstado.enProgreso++;
    if (p.estado === "TERMINADO") byEstado.terminado++;

    const asuntoKey = p.asunto || "Sin asunto";
    byAsunto[asuntoKey] = (byAsunto[asuntoKey] || 0) + 1;

    if (p.tiempoRespuestaPrimerContacto !== null) {
      sumRespuesta += p.tiempoRespuestaPrimerContacto;
      countRespuesta++;
    }
    if (p.tiempoRespuestaCierre !== null) {
      sumCierre += p.tiempoRespuestaCierre;
      countCierre++;
    }
  }

  const ahora = new Date();

  // Detailed list
  const detalle = pqrs.map((p) => {
    const numPadded = String(p.numero).padStart(4, "0");
    const yearStr = p.fechaRecibido.getFullYear().toString();
    const diasDesdeApertura = p.fechaCierre
      ? Math.ceil((p.fechaCierre.getTime() - p.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24))
      : Math.ceil((ahora.getTime() - p.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24));

    let estadoLabel = ESTADO_LABEL[p.estado] || p.estado;
    if (p.estado === "EN_PROGRESO" && p.faseActual) {
      estadoLabel = `En proceso - ${FASE_LABEL[p.faseActual] || `Fase ${p.faseActual}`}`;
    }

    return {
      numero: p.numeroRadicacion || `${yearStr}-${numPadded}`,
      fechaRecibido: p.fechaRecibido.toLocaleDateString("es-CO"),
      bloque: p.bloque,
      apto: p.apto,
      nombreResidente: p.nombreResidente,
      asunto: p.asunto || "Sin asunto",
      descripcion: p.descripcion,
      estado: estadoLabel,
      fechaPrimerContacto: p.fechaPrimerContacto
        ? p.fechaPrimerContacto.toLocaleDateString("es-CO")
        : "",
      tiempoRespuestaPrimerContacto: p.tiempoRespuestaPrimerContacto ?? "",
      accionTomada: p.accionTomada || "",
      evidenciaCierre: p.evidenciaCierre || "",
      fechaCierre: p.fechaCierre ? p.fechaCierre.toLocaleDateString("es-CO") : "",
      tiempoRespuestaCierre: p.tiempoRespuestaCierre ?? "",
      diasDesdeApertura,
      gestionadoPor: p.gestionadoPor?.name || "",
    };
  });

  return NextResponse.json({
    year,
    month: month ? parseInt(month) : null,
    resumen: {
      total,
      byAsunto,
      byEstado,
      porcentajeCompletadas: total > 0 ? Math.round((byEstado.terminado / total) * 100) : 0,
      tiempoPromedioRespuesta: countRespuesta > 0 ? Math.round((sumRespuesta / countRespuesta) * 10) / 10 : null,
      tiempoPromedioCierre: countCierre > 0 ? Math.round((sumCierre / countCierre) * 10) / 10 : null,
    },
    detalle,
  });
}
