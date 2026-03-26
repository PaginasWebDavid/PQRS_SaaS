import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

const ESTADO_LABEL: Record<string, string> = { EN_ESPERA: "En espera", EN_PROGRESO: "En proceso", TERMINADO: "Terminado" };
const FASE_LABEL: Record<number, string> = { 1: "Fase I", 2: "Fase II", 3: "Fase III", 4: "Fase IV", 5: "Fase V" };
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const GREEN = "15803D";
const GREEN_LIGHT = "F0FDF4";
const BLUE = "1D4ED8";
const BLUE_LIGHT = "EFF6FF";
const YELLOW = "A16207";
const YELLOW_LIGHT = "FEFCE8";
const WHITE = "FFFFFF";
const BORDER_COLOR = "D1D5DB";
const GRAY = "6B7280";

const brd: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};
const hdrFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
const hdrFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
const bFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10 };
const bldFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10, bold: true };
const ctr: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
const lft: Partial<ExcelJS.Alignment> = { horizontal: "left", vertical: "middle" };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role === "RESIDENTE") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const monthParam = searchParams.get("month");
  const month = monthParam ? parseInt(monthParam) : null;

  let dateFrom: Date, dateTo: Date;
  if (month && month >= 1 && month <= 12) {
    dateFrom = new Date(year, month - 1, 1);
    dateTo = new Date(year, month, 1);
  } else {
    dateFrom = new Date(`${year}-01-01`);
    dateTo = new Date(`${year + 1}-01-01`);
  }

  const pqrs = await prisma.pqrs.findMany({
    where: { fechaRecibido: { gte: dateFrom, lt: dateTo } },
    orderBy: { numero: "asc" },
    include: {
      gestionadoPor: { select: { name: true } },
    },
  });

  const periodo = month ? `${MESES[month - 1]} ${year}` : `Año ${year}`;

  // Resumen stats
  const total = pqrs.length;
  const byAsunto: Record<string, number> = {};
  const byEstado = { enEspera: 0, enProgreso: 0, terminado: 0 };
  let sumResp = 0, cntResp = 0, sumCierre = 0, cntCierre = 0;

  for (const p of pqrs) {
    const asuntoKey = p.asunto || "Sin asunto";
    byAsunto[asuntoKey] = (byAsunto[asuntoKey] || 0) + 1;
    if (p.estado === "EN_ESPERA") byEstado.enEspera++;
    if (p.estado === "EN_PROGRESO") byEstado.enProgreso++;
    if (p.estado === "TERMINADO") byEstado.terminado++;
    if (p.tiempoRespuestaPrimerContacto !== null) { sumResp += p.tiempoRespuestaPrimerContacto; cntResp++; }
    if (p.tiempoRespuestaCierre !== null) { sumCierre += p.tiempoRespuestaCierre; cntCierre++; }
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Conjunto Parque Residencial Calle 100";

  // Sheet 1: Resumen
  const ws1 = wb.addWorksheet("Resumen");
  ws1.columns = [{ width: 30 }, { width: 16 }];

  ws1.mergeCells("A1:B1");
  ws1.getCell("A1").value = `REPORTE PQRS — CONJUNTO PARQUE RESIDENCIAL CALLE 100`;
  ws1.getCell("A1").font = { name: "Calibri", size: 14, bold: true, color: { argb: GREEN } };
  ws1.getRow(1).height = 30;

  ws1.mergeCells("A2:B2");
  ws1.getCell("A2").value = `Período: ${periodo}`;
  ws1.getCell("A2").font = { name: "Calibri", size: 11, color: { argb: GRAY } };

  function addSection(title: string, rows: [string, string | number][]) {
    ws1.addRow([]);
    const tRow = ws1.addRow([title]);
    tRow.getCell(1).font = { ...bldFont, size: 11, color: { argb: GREEN } };
    ws1.mergeCells(`A${tRow.number}:B${tRow.number}`);
    for (const [label, value] of rows) {
      const row = ws1.addRow([label, value]);
      row.getCell(1).font = bFont;
      row.getCell(2).font = bldFont;
      row.getCell(2).alignment = ctr;
      row.eachCell((cell) => { cell.border = brd; });
    }
  }

  addSection("RESUMEN GENERAL", [
    ["Total PQRS", total],
  ]);

  const asuntoRows: [string, number][] = Object.entries(byAsunto)
    .sort((a, b) => b[1] - a[1])
    .map(([asunto, count]) => [asunto, count]);
  addSection("DISTRIBUCIÓN POR ASUNTO", asuntoRows);

  addSection("ESTADO ACTUAL", [
    ["En espera", byEstado.enEspera],
    ["En proceso", byEstado.enProgreso],
    ["Terminadas", byEstado.terminado],
    ["% Completadas", total > 0 ? `${Math.round((byEstado.terminado / total) * 100)}%` : "0%"],
  ]);
  addSection("TIEMPOS PROMEDIO", [
    ["Primer contacto (días)", cntResp > 0 ? Math.round((sumResp / cntResp) * 10) / 10 : "N/A"],
    ["Cierre (días)", cntCierre > 0 ? Math.round((sumCierre / cntCierre) * 10) / 10 : "N/A"],
  ]);

  // Sheet 2: Seguimiento PQRS
  const ws2 = wb.addWorksheet("Seguimiento PQRS");
  ws2.columns = [
    { width: 14 }, { width: 14 }, { width: 10 },
    { width: 10 }, { width: 22 }, { width: 18 },
    { width: 35 }, { width: 18 }, { width: 14 },
    { width: 35 }, { width: 14 }, { width: 30 },
    { width: 16 }, { width: 14 }, { width: 14 },
  ];

  ws2.mergeCells("A1:O1");
  ws2.getCell("A1").value = `SEGUIMIENTO PQRS — ${periodo}`;
  ws2.getCell("A1").font = { name: "Calibri", size: 14, bold: true, color: { argb: GREEN } };
  ws2.getRow(1).height = 30;

  const headers = [
    "N° PQRS", "Fecha Recibido", "Bloque", "Apto", "Nombre",
    "Asunto", "Descripción", "Estado",
    "Fecha Primer Contacto", "Tiempo Resp.", "Acción Tomada",
    "Evidencia Cierre", "Fecha de cierre", "Tiempo Cierre", "Días Apertura",
  ];
  const hRow = ws2.addRow(headers);
  hRow.height = 28;
  hRow.eachCell((cell) => { cell.font = hdrFont; cell.fill = hdrFill; cell.border = brd; cell.alignment = { ...ctr, wrapText: true }; });

  const estadoFills: Record<string, string> = { "En espera": YELLOW_LIGHT, "En proceso": BLUE_LIGHT, "Terminado": GREEN_LIGHT };
  const estadoColors: Record<string, string> = { "En espera": YELLOW, "En proceso": BLUE, "Terminado": GREEN };
  const ahora = new Date();

  for (const p of pqrs) {
    let estadoLabel = ESTADO_LABEL[p.estado] || p.estado;
    if (p.estado === "EN_PROGRESO" && p.faseActual) {
      estadoLabel = `En proceso - ${FASE_LABEL[p.faseActual] || `Fase ${p.faseActual}`}`;
    }

    const numPadded = String(p.numero).padStart(4, "0");
    const yearStr = p.fechaRecibido.getFullYear().toString();
    const diasDesdeApertura = p.fechaCierre
      ? Math.ceil((p.fechaCierre.getTime() - p.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24))
      : Math.ceil((ahora.getTime() - p.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24));

    const row = ws2.addRow([
      p.numeroRadicacion || `${yearStr}-${numPadded}`,
      p.fechaRecibido.toLocaleDateString("es-CO"),
      p.bloque,
      p.apto,
      p.nombreResidente,
      p.asunto || "Sin asunto",
      p.descripcion,
      estadoLabel,
      p.fechaPrimerContacto ? p.fechaPrimerContacto.toLocaleDateString("es-CO") : "",
      p.tiempoRespuestaPrimerContacto ?? "",
      p.accionTomada || "",
      p.evidenciaCierre || "",
      p.fechaCierre ? p.fechaCierre.toLocaleDateString("es-CO") : "",
      p.tiempoRespuestaCierre ?? "",
      diasDesdeApertura,
    ]);

    row.eachCell((cell, col) => {
      cell.font = bFont;
      cell.border = brd;
      cell.alignment = [3, 4, 10, 14, 15].includes(col) ? ctr : { ...lft, wrapText: true, vertical: "middle" as const };
    });

    // Color the estado cell
    const estadoCell = row.getCell(8);
    const baseEstado = estadoLabel.startsWith("En proceso") ? "En proceso" : estadoLabel.startsWith("En espera") ? "En espera" : estadoLabel;
    if (estadoFills[baseEstado]) {
      estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: estadoFills[baseEstado] } };
      estadoCell.font = { ...bldFont, color: { argb: estadoColors[baseEstado] } };
    }
    estadoCell.alignment = ctr;
  }

  ws2.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + pqrs.length, column: 15 } };
  ws2.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await wb.xlsx.writeBuffer();
  const uint8 = new Uint8Array(buffer as ArrayBuffer);
  const filename = `PQRS_${month ? MESES[month - 1] + "_" : ""}${year}.xlsx`;

  return new NextResponse(uint8, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
