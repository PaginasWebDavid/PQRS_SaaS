import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

const GREEN = "15803D";
const GREEN_LIGHT = "F0FDF4";
const BLUE = "1D4ED8";
const BLUE_LIGHT = "EFF6FF";
const YELLOW = "A16207";
const YELLOW_LIGHT = "FEFCE8";
const WHITE = "FFFFFF";
const BLACK = "000000";
const BORDER_COLOR = "D1D5DB";
const GRAY_BG = "F3F4F6";

const border: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};
const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
const headerFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
const bodyFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10 };
const boldFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10, bold: true };
const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role === "RESIDENTE") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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

  const total = pqrs.length;
  const terminado = pqrs.filter((p) => p.estado === "TERMINADO").length;
  const enProgreso = pqrs.filter((p) => p.estado === "EN_PROGRESO").length;
  const enEspera = pqrs.filter((p) => p.estado === "EN_ESPERA").length;

  const trimestres = [
    { label: "I TRIM", meses: [0, 1, 2] },
    { label: "II TRIM", meses: [3, 4, 5] },
    { label: "III TRIM", meses: [6, 7, 8] },
    { label: "IV TRIM", meses: [9, 10, 11] },
  ].map((t) => {
    const d = pqrs.filter((p) => t.meses.includes(p.fechaRecibido.getMonth()));
    return {
      label: t.label,
      total: d.length,
      terminado: d.filter((p) => p.estado === "TERMINADO").length,
      enProgreso: d.filter((p) => p.estado === "EN_PROGRESO").length,
      enEspera: d.filter((p) => p.estado === "EN_ESPERA").length,
    };
  });

  const asuntoMap: Record<string, { total: number; terminado: number; enProgreso: number; enEspera: number; descripciones: Set<string> }> = {};
  for (const p of pqrs) {
    const key = p.asunto || "Sin asunto";
    if (!asuntoMap[key]) asuntoMap[key] = { total: 0, terminado: 0, enProgreso: 0, enEspera: 0, descripciones: new Set() };
    asuntoMap[key].total++;
    if (p.estado === "TERMINADO") asuntoMap[key].terminado++;
    else if (p.estado === "EN_PROGRESO") asuntoMap[key].enProgreso++;
    else asuntoMap[key].enEspera++;
    if (p.subAsunto) asuntoMap[key].descripciones.add(p.subAsunto);
  }
  const porAsuntoDetalle = Object.entries(asuntoMap)
    .map(([asunto, d]) => ({ asunto: asunto.toUpperCase(), cantidad: d.total, descripcion: Array.from(d.descripciones).join(", "), terminados: d.terminado, enProgreso: d.enProgreso, enEspera: d.enEspera }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // Build workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "Conjunto Parque Residencial Calle 100";

  // Sheet 1: Resumen Trimestral
  const ws1 = wb.addWorksheet("Resumen Trimestral");
  ws1.columns = [{ width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }];

  ws1.mergeCells("A1:G1");
  const t1 = ws1.getCell("A1");
  t1.value = `CONJUNTO PARQUE RESIDENCIAL CALLE 100 — PQRS ${year}`;
  t1.font = { name: "Calibri", size: 14, bold: true, color: { argb: GREEN } };
  ws1.getRow(1).height = 30;

  const h1 = ws1.addRow(["PQRS", "I TRIM", "II TRIM", "III TRIM", "IV TRIM", "TOTAL", "%"]);
  h1.eachCell((cell) => { cell.font = headerFont; cell.fill = headerFill; cell.border = border; cell.alignment = center; });
  h1.height = 22;

  const rowData = [
    { label: "Total", vals: trimestres.map((t) => t.total), tot: total, pct: "", fill: null, color: BLACK },
    { label: "Terminado", vals: trimestres.map((t) => t.terminado), tot: terminado, pct: total > 0 ? `${Math.round((terminado / total) * 100)}%` : "0%", fill: GREEN_LIGHT, color: GREEN },
    { label: "En Proceso", vals: trimestres.map((t) => t.enProgreso), tot: enProgreso, pct: total > 0 ? `${Math.round((enProgreso / total) * 100)}%` : "0%", fill: BLUE_LIGHT, color: BLUE },
    { label: "En Espera", vals: trimestres.map((t) => t.enEspera), tot: enEspera, pct: total > 0 ? `${Math.round((enEspera / total) * 100)}%` : "0%", fill: YELLOW_LIGHT, color: YELLOW },
  ];

  for (const rd of rowData) {
    const row = ws1.addRow([rd.label, ...rd.vals, rd.tot, rd.pct]);
    row.eachCell((cell, col) => {
      cell.font = (col === 1 || col === 6 || col === 7) ? { ...boldFont, color: { argb: rd.color } } : { ...bodyFont, color: { argb: rd.color } };
      cell.border = border;
      cell.alignment = col === 1 ? { horizontal: "left", vertical: "middle" } : center;
      if (rd.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rd.fill } };
    });
  }

  // Sheet 2: Por Asunto
  const ws2 = wb.addWorksheet("Por Asunto");
  ws2.columns = [{ width: 12 }, { width: 20 }, { width: 50 }, { width: 14 }, { width: 14 }, { width: 14 }];

  ws2.mergeCells("A1:F1");
  ws2.getCell("A1").value = `PQRS POR DETALLE — ${year}`;
  ws2.getCell("A1").font = { name: "Calibri", size: 14, bold: true, color: { argb: GREEN } };
  ws2.getRow(1).height = 30;

  const h2 = ws2.addRow(["Cantidad", "Asunto", "Descripción", "Terminados", "En Proceso", "En Espera"]);
  h2.eachCell((cell) => { cell.font = headerFont; cell.fill = headerFill; cell.border = border; cell.alignment = center; });
  h2.height = 22;

  for (const a of porAsuntoDetalle) {
    const row = ws2.addRow([a.cantidad, a.asunto, a.descripcion, a.terminados, a.enProgreso, a.enEspera]);
    row.eachCell((cell, col) => { cell.font = bodyFont; cell.border = border; cell.alignment = col <= 3 ? (col === 1 ? center : { horizontal: "left", vertical: "middle" }) : center; });
    row.getCell(1).font = boldFont;
    row.getCell(4).font = { ...bodyFont, color: { argb: GREEN } };
    row.getCell(5).font = { ...bodyFont, color: { argb: BLUE } };
    row.getCell(6).font = { ...bodyFont, color: { argb: YELLOW } };
  }

  const totRow = ws2.addRow([total, "", "", terminado, enProgreso, enEspera]);
  totRow.eachCell((cell) => { cell.font = boldFont; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY_BG } }; cell.border = border; cell.alignment = center; });

  const buffer = await wb.xlsx.writeBuffer();
  const uint8 = new Uint8Array(buffer as ArrayBuffer);

  return new NextResponse(uint8, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Dashboard_PQRS_${year}.xlsx"`,
    },
  });
}
