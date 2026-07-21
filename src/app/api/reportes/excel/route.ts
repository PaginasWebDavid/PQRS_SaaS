import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import ExcelJS from "exceljs";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { getPqrsReportData, resolvePeriod, reportFileName, type Estado, type Prioridad } from "@/domains/pqrs/reportes.service";
import { safeExcelText } from "@/lib/excel-styles";

const ESTADO_LABEL: Record<string, string> = { EN_ESPERA: "Abierta", EN_PROGRESO: "En proceso", TERMINADO: "Terminada" };
const PRIORIDAD_LABEL: Record<string, string> = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };

const NAVY = "122545";
const WHITE = "FFFFFF";
const BORDER_COLOR = "D1D5DB";
const WARN = "FBF3DF";
const DANGER = "FBEAEA";

const brd: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};
const hdrFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const hdrFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
const bFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10 };
const bldFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 10, bold: true };

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = hdrFill;
    cell.font = hdrFont;
    cell.border = brd;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}

function fmtDate(date: Date | null) {
  return date ? new Date(date).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!["ADMIN", "CONSEJO"].includes(session.user.role)) {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);

  const params = req.nextUrl.searchParams;
  const { from, to, compareFrom, compareTo, granularity } = resolvePeriod(params);
  const estado = params.get("estado") as Estado | null;
  const asunto = params.get("asunto");
  const prioridad = params.get("prioridad") as Prioridad | null;
  const bloque = params.get("bloque");
  const gestionadoPorId = params.get("gestionadoPorId");
  const cumplimiento = params.get("cumplimiento") as "dentro" | "fuera" | null;

  const [data, tenant] = await Promise.all([
    getPqrsReportData({
      tenantId, from, to, compareFrom, compareTo, granularity,
      estado: estado || undefined, asunto: asunto || undefined, prioridad: prioridad || undefined,
      bloque: bloque ? Number(bloque) : undefined, gestionadoPorId: gestionadoPorId || undefined,
      cumplimiento: cumplimiento || undefined,
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  if (data.detalle.length === 0) {
    return NextResponse.json({ error: "No hay datos para exportar en el periodo y filtros seleccionados" }, { status: 400 });
  }

  const tenantName = tenant?.name || "Conjunto";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PQRS Services";
  workbook.created = new Date();

  // ---------- Hoja 1: Resumen ejecutivo ----------
  const wsResumen = workbook.addWorksheet("Resumen ejecutivo");
  wsResumen.columns = [{ width: 32 }, { width: 18 }, { width: 18 }, { width: 14 }];
  wsResumen.mergeCells("A1:D1");
  wsResumen.getCell("A1").value = "Reporte de gestión de PQRS";
  wsResumen.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: NAVY } };
  wsResumen.mergeCells("A2:D2");
  wsResumen.getCell("A2").value = tenantName;
  wsResumen.getCell("A2").font = { name: "Calibri", size: 12, bold: true };
  wsResumen.mergeCells("A3:D3");
  wsResumen.getCell("A3").value = `Periodo: ${fmtDate(from)} - ${fmtDate(new Date(to.getTime() - 1))}`;
  wsResumen.getCell("A3").font = bFont;
  wsResumen.mergeCells("A4:D4");
  wsResumen.getCell("A4").value = `Generado: ${new Date().toLocaleString("es-CO")} por ${session.user.name || session.user.email}`;
  wsResumen.getCell("A4").font = { name: "Calibri", size: 9, color: { argb: "6B7280" } };

  let r = 6;
  const headerRow = wsResumen.getRow(r);
  headerRow.values = ["Indicador", "Valor actual", "Periodo anterior", "Variación"];
  styleHeaderRow(headerRow);
  r++;

  const summaryRows: [string, string | number, string | number, string][] = [
    ["Total PQRS recibidas", data.resumen.total.value, data.resumen.total.prev, data.resumen.total.deltaPct != null ? `${data.resumen.total.deltaPct}%` : "—"],
    ["PQRS abiertas", data.resumen.abiertas.value, data.resumen.abiertas.prev, data.resumen.abiertas.deltaPct != null ? `${data.resumen.abiertas.deltaPct}%` : "—"],
    ["PQRS en proceso", data.resumen.enProceso.value, data.resumen.enProceso.prev, data.resumen.enProceso.deltaPct != null ? `${data.resumen.enProceso.deltaPct}%` : "—"],
    ["PQRS cerradas", data.resumen.cerradas.value, data.resumen.cerradas.prev, data.resumen.cerradas.deltaPct != null ? `${data.resumen.cerradas.deltaPct}%` : "—"],
    ["PQRS vencidas", data.resumen.vencidas.value, data.resumen.vencidas.prev, data.resumen.vencidas.deltaPct != null ? `${data.resumen.vencidas.deltaPct}%` : "—"],
    ["Tiempo promedio primer contacto (días)", data.resumen.tiempoPromedioPrimerContacto.value ?? "—", data.resumen.tiempoPromedioPrimerContacto.prev ?? "—", data.resumen.tiempoPromedioPrimerContacto.deltaPct != null ? `${data.resumen.tiempoPromedioPrimerContacto.deltaPct}%` : "—"],
    ["Tiempo promedio de cierre (días)", data.resumen.tiempoPromedioCierre.value ?? "—", data.resumen.tiempoPromedioCierre.prev ?? "—", data.resumen.tiempoPromedioCierre.deltaPct != null ? `${data.resumen.tiempoPromedioCierre.deltaPct}%` : "—"],
    ["% Cumplimiento del tiempo esperado", data.resumen.pctCumplimiento.value != null ? `${data.resumen.pctCumplimiento.value}%` : "—", data.resumen.pctCumplimiento.prev != null ? `${data.resumen.pctCumplimiento.prev}%` : "—", data.resumen.pctCumplimiento.deltaPct != null ? `${data.resumen.pctCumplimiento.deltaPct}%` : "—"],
  ];
  for (const row of summaryRows) {
    const excelRow = wsResumen.getRow(r);
    excelRow.values = row;
    excelRow.eachCell((cell) => { cell.font = bFont; cell.border = brd; });
    excelRow.getCell(1).font = bldFont;
    r++;
  }

  r += 1;
  wsResumen.getCell(`A${r}`).value = "Hallazgos";
  wsResumen.getCell(`A${r}`).font = { ...bldFont, size: 11 };
  r++;
  for (const h of data.hallazgos) {
    wsResumen.getCell(`A${r}`).value = `• ${h}`;
    wsResumen.mergeCells(`A${r}:D${r}`);
    wsResumen.getCell(`A${r}`).font = bFont;
    wsResumen.getCell(`A${r}`).alignment = { wrapText: true };
    r++;
  }

  // ---------- Hoja 2: Detalle de PQRS ----------
  const wsDetalle = workbook.addWorksheet("Detalle de PQRS");
  wsDetalle.columns = [
    { header: "N° Radicación", key: "rad", width: 16 },
    { header: "Fecha recibido", key: "fr", width: 16 },
    { header: "Solicitante", key: "sol", width: 22 },
    { header: "Ubicación", key: "ubi", width: 12 },
    { header: "Categoría", key: "cat", width: 20 },
    { header: "Subcategoría", key: "sub", width: 20 },
    { header: "Prioridad", key: "pri", width: 12 },
    { header: "Estado", key: "est", width: 14 },
    { header: "Responsable", key: "resp", width: 20 },
    { header: "Fecha primer contacto", key: "fpc", width: 18 },
    { header: "Tiempo primer contacto (días)", key: "tpc", width: 14 },
    { header: "Última actualización", key: "ua", width: 16 },
    { header: "Fecha de cierre", key: "fc", width: 16 },
    { header: "Tiempo de cierre (días)", key: "tc", width: 14 },
    { header: "Cumplimiento", key: "cump", width: 14 },
  ];
  styleHeaderRow(wsDetalle.getRow(1));
  for (const d of data.detalle) {
    const row = wsDetalle.addRow({
      rad: d.numeroRadicacion || `#${d.numero}`,
      fr: fmtDate(d.fechaRecibido),
      sol: safeExcelText(d.solicitante),
      ubi: d.ubicacion,
      cat: safeExcelText(d.categoria),
      sub: safeExcelText(d.subcategoria || ""),
      pri: PRIORIDAD_LABEL[d.prioridad],
      est: ESTADO_LABEL[d.estado],
      resp: safeExcelText(d.responsable || "Sin asignar"),
      fpc: fmtDate(d.fechaPrimerContacto),
      tpc: d.tiempoPrimerContacto ?? "",
      ua: fmtDate(d.ultimaActualizacion),
      fc: fmtDate(d.fechaCierre),
      tc: d.tiempoCierre ?? "",
      cump: d.vencida ? "Vencida" : "En tiempo",
    });
    row.eachCell((cell) => { cell.font = bFont; cell.border = brd; });
    const estadoCell = row.getCell(8);
    if (d.estado === "EN_ESPERA") estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARN } };
    else if (d.estado === "TERMINADO") estadoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "ECF6EF" } };
    const cumpCell = row.getCell(15);
    if (d.vencida) cumpCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DANGER } };
  }
  wsDetalle.autoFilter = { from: "A1", to: `O${data.detalle.length + 1}` };
  wsDetalle.views = [{ state: "frozen", ySplit: 1 }];

  // ---------- Hoja 3: Análisis por categoría ----------
  const wsCat = workbook.addWorksheet("Análisis por categoría");
  wsCat.columns = [
    { header: "Categoría", key: "cat", width: 26 },
    { header: "Cantidad", key: "cnt", width: 12 },
    { header: "% del total", key: "pct", width: 12 },
    { header: "Tiempo promedio de cierre (días)", key: "t", width: 18 },
    { header: "% Cumplimiento", key: "cump", width: 14 },
  ];
  styleHeaderRow(wsCat.getRow(1));
  const totalDist = data.distribucion.porCategoria.reduce((a, b) => a + b.count, 0) || 1;
  for (const c of data.distribucion.porCategoria) {
    const t = data.tiempos.porCategoria.find((x) => x.key === c.label);
    const row = wsCat.addRow({ cat: safeExcelText(c.label), cnt: c.count, pct: `${Math.round((c.count / totalDist) * 100)}%`, t: t?.avgCierre ?? "", cump: t?.cumplimientoPct != null ? `${t.cumplimientoPct}%` : "" });
    row.eachCell((cell) => { cell.font = bFont; cell.border = brd; });
  }

  // ---------- Hoja 4: Desempeño ----------
  const wsDesempeno = workbook.addWorksheet("Desempeño");
  wsDesempeno.columns = [
    { header: "Responsable", key: "resp", width: 22 },
    { header: "Casos asignados", key: "a", width: 14 },
    { header: "Cerrados", key: "c", width: 12 },
    { header: "Pendientes", key: "p", width: 12 },
    { header: "Vencidos", key: "v", width: 12 },
    { header: "T. prom. primer contacto (días)", key: "tpc", width: 16 },
    { header: "T. prom. cierre (días)", key: "tc", width: 14 },
    { header: "% Cumplimiento", key: "cump", width: 14 },
    { header: "Carga actual", key: "carga", width: 12 },
  ];
  styleHeaderRow(wsDesempeno.getRow(1));
  for (const d of data.desempeno) {
    const row = wsDesempeno.addRow({ resp: safeExcelText(d.responsable), a: d.casosAsignados, c: d.casosCerrados, p: d.casosPendientes, v: d.casosVencidos, tpc: d.tiempoPromedioPrimerContacto ?? "", tc: d.tiempoPromedioCierre ?? "", cump: d.pctCumplimiento != null ? `${d.pctCumplimiento}%` : "", carga: d.cargaActual });
    row.eachCell((cell) => { cell.font = bFont; cell.border = brd; });
  }

  // ---------- Hoja 5: Alertas ----------
  const wsAlertas = workbook.addWorksheet("Alertas");
  wsAlertas.columns = [
    { header: "Alerta", key: "a", width: 20 },
    { header: "Cantidad", key: "c", width: 12 },
    { header: "Motivo", key: "m", width: 70 },
  ];
  styleHeaderRow(wsAlertas.getRow(1));
  if (data.alertas.length === 0) {
    const row = wsAlertas.addRow({ a: "—", c: 0, m: "No hay alertas críticas para el periodo seleccionado." });
    row.eachCell((cell) => { cell.font = bFont; cell.border = brd; });
  }
  for (const al of data.alertas) {
    const row = wsAlertas.addRow({ a: al.key, c: al.count, m: al.motivo });
    row.eachCell((cell) => { cell.font = bFont; cell.border = brd; });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = reportFileName(tenantName, "xlsx");

  await registerAuditLog({
    actorUserId: session.user.id,
    tenantId,
    action: AuditAction.REPORT_EXPORTED,
    targetType: "PqrsReport",
    metadata: { format: "xlsx", from: from.toISOString(), to: to.toISOString(), rows: data.detalle.length },
  }).catch(() => null);

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
