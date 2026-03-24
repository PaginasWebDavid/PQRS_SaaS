import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

const ESTADO_LABEL: Record<string, string> = { EN_ESPERA: "En espera", EN_PROGRESO: "En progreso", TERMINADO: "Terminado" };
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
  const byTipo = { peticion: 0, queja: 0, reclamo: 0, sugerencia: 0 };
  const byEstado = { enEspera: 0, enProgreso: 0, terminado: 0 };
  let sumResp = 0, cntResp = 0, sumCierre = 0, cntCierre = 0;

  for (const p of pqrs) {
    if (p.tipoPqrs === "PETICION") byTipo.peticion++;
    if (p.tipoPqrs === "QUEJA") byTipo.queja++;
    if (p.tipoPqrs === "RECLAMO") byTipo.reclamo++;
    if (p.tipoPqrs === "SUGERENCIA") byTipo.sugerencia++;
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
    ["Peticiones", byTipo.peticion],
    ["Quejas", byTipo.queja],
    ["Reclamos", byTipo.reclamo],
    ["Sugerencias", byTipo.sugerencia],
  ]);
  addSection("ESTADO ACTUAL", [
    ["En espera", byEstado.enEspera],
    ["En progreso", byEstado.enProgreso],
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
    { width: 10 }, { width: 14 }, { width: 16 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 22 }, { width: 14 },
    { width: 18 }, { width: 35 }, { width: 18 }, { width: 14 },
    { width: 35 }, { width: 14 }, { width: 30 }, { width: 16 }, { width: 14 },
  ];

  ws2.mergeCells("A1:Q1");
  ws2.getCell("A1").value = `SEGUIMIENTO PQRS — ${periodo}`;
  ws2.getCell("A1").font = { name: "Calibri", size: 14, bold: true, color: { argb: GREEN } };
  ws2.getRow(1).height = 30;

  const headers = ["N° PQRS", "Medio", "Fecha Recibido", "Mes", "Bloque", "Apto", "Nombre", "Asunto", "Descripción", "Fecha Primer Contacto", "Tiempo Resp.", "Acción Tomada", "Estado", "Evidencia Cierre", "Fecha Cierre", "Tiempo Cierre"];
  const hRow = ws2.addRow(headers);
  hRow.height = 28;
  hRow.eachCell((cell) => { cell.font = hdrFont; cell.fill = hdrFill; cell.border = brd; cell.alignment = { ...ctr, wrapText: true }; });

  const estadoFills: Record<string, string> = { "En espera": YELLOW_LIGHT, "En progreso": BLUE_LIGHT, "Terminado": GREEN_LIGHT };
  const estadoColors: Record<string, string> = { "En espera": YELLOW, "En progreso": BLUE, "Terminado": GREEN };

  for (const p of pqrs) {
    const estado = ESTADO_LABEL[p.estado] || p.estado;
    const row = ws2.addRow([
      p.numero,
      p.medio === "PLATAFORMA_WEB" ? "Plataforma Web" : p.medio,
      p.fechaRecibido.toLocaleDateString("es-CO"),
      p.mes,
      p.bloque,
      p.apto,
      p.nombreResidente,
      p.asunto,
      p.descripcion,
      p.fechaPrimerContacto ? p.fechaPrimerContacto.toLocaleDateString("es-CO") : "",
      p.tiempoRespuestaPrimerContacto ?? "",
      p.accionTomada || "",
      estado,
      p.evidenciaCierre || "",
      p.fechaCierre ? p.fechaCierre.toLocaleDateString("es-CO") : "",
      p.tiempoRespuestaCierre ?? "",
    ]);

    row.eachCell((cell, col) => {
      cell.font = bFont;
      cell.border = brd;
      cell.alignment = [1, 4, 5, 6, 11, 16].includes(col) ? ctr : { ...lft, wrapText: true, vertical: "middle" as const };
    });

    const estadoCell = row.getCell(13);
    if (estadoFills[estado]) {
      estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: estadoFills[estado] } };
      estadoCell.font = { ...bldFont, color: { argb: estadoColors[estado] } };
    }
    estadoCell.alignment = ctr;
  }

  ws2.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + pqrs.length, column: 16 } };
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
