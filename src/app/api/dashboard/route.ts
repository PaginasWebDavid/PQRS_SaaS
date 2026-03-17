import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface TrimestreStats {
  total: number;
  enEspera: number;
  enProgreso: number;
  terminado: number;
  porcentajeCompletadas: number;
  peticion: number;
  queja: number;
  reclamo: number;
  sugerencia: number;
  tiempoPromedioRespuesta: number | null;
  tiempoPromedioCierre: number | null;
}

function emptyStats(): TrimestreStats {
  return {
    total: 0,
    enEspera: 0,
    enProgreso: 0,
    terminado: 0,
    porcentajeCompletadas: 0,
    peticion: 0,
    queja: 0,
    reclamo: 0,
    sugerencia: 0,
    tiempoPromedioRespuesta: null,
    tiempoPromedioCierre: null,
  };
}

function getQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

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

  const pqrs = await prisma.pqrs.findMany({
    where: {
      fechaRecibido: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
  });

  // Inicializar stats por trimestre
  const trimestres: Record<string, TrimestreStats> = {
    Q1: emptyStats(),
    Q2: emptyStats(),
    Q3: emptyStats(),
    Q4: emptyStats(),
  };
  const total = emptyStats();

  // Acumuladores para promedios
  const tiemposRespuesta: Record<string, number[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  const tiemposCierre: Record<string, number[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  const tiemposRespuestaTotal: number[] = [];
  const tiemposCierreTotal: number[] = [];

  for (const p of pqrs) {
    const q = `Q${getQuarter(p.fechaRecibido)}`;
    const stats = trimestres[q];

    stats.total++;
    total.total++;

    // Por estado
    if (p.estado === "EN_ESPERA") { stats.enEspera++; total.enEspera++; }
    if (p.estado === "EN_PROGRESO") { stats.enProgreso++; total.enProgreso++; }
    if (p.estado === "TERMINADO") { stats.terminado++; total.terminado++; }

    // Por tipo
    if (p.tipoPqrs === "PETICION") { stats.peticion++; total.peticion++; }
    if (p.tipoPqrs === "QUEJA") { stats.queja++; total.queja++; }
    if (p.tipoPqrs === "RECLAMO") { stats.reclamo++; total.reclamo++; }
    if (p.tipoPqrs === "SUGERENCIA") { stats.sugerencia++; total.sugerencia++; }

    // Tiempos
    if (p.tiempoRespuestaPrimerContacto !== null) {
      tiemposRespuesta[q].push(p.tiempoRespuestaPrimerContacto);
      tiemposRespuestaTotal.push(p.tiempoRespuestaPrimerContacto);
    }
    if (p.tiempoRespuestaCierre !== null) {
      tiemposCierre[q].push(p.tiempoRespuestaCierre);
      tiemposCierreTotal.push(p.tiempoRespuestaCierre);
    }
  }

  // Calcular porcentajes y promedios
  for (const q of ["Q1", "Q2", "Q3", "Q4"]) {
    const s = trimestres[q];
    s.porcentajeCompletadas = s.total > 0 ? Math.round((s.terminado / s.total) * 100) : 0;
    s.tiempoPromedioRespuesta = tiemposRespuesta[q].length > 0
      ? Math.round((tiemposRespuesta[q].reduce((a, b) => a + b, 0) / tiemposRespuesta[q].length) * 10) / 10
      : null;
    s.tiempoPromedioCierre = tiemposCierre[q].length > 0
      ? Math.round((tiemposCierre[q].reduce((a, b) => a + b, 0) / tiemposCierre[q].length) * 10) / 10
      : null;
  }

  total.porcentajeCompletadas = total.total > 0 ? Math.round((total.terminado / total.total) * 100) : 0;
  total.tiempoPromedioRespuesta = tiemposRespuestaTotal.length > 0
    ? Math.round((tiemposRespuestaTotal.reduce((a, b) => a + b, 0) / tiemposRespuestaTotal.length) * 10) / 10
    : null;
  total.tiempoPromedioCierre = tiemposCierreTotal.length > 0
    ? Math.round((tiemposCierreTotal.reduce((a, b) => a + b, 0) / tiemposCierreTotal.length) * 10) / 10
    : null;

  return NextResponse.json({ year, trimestres, total });
}
