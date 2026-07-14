import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { getPqrsReportData, resolvePeriod, reportFileName, type Estado, type Prioridad } from "@/domains/pqrs/reportes.service";

const ESTADO_LABEL: Record<string, string> = { EN_ESPERA: "Abierta", EN_PROGRESO: "En proceso", TERMINADO: "Terminada" };
const PRIORIDAD_LABEL: Record<string, string> = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" };
const NAVY: [number, number, number] = [18, 37, 69];
const SUCCESS: [number, number, number] = [26, 107, 58];
const WARNING: [number, number, number] = [138, 90, 0];
const DANGER: [number, number, number] = [179, 38, 30];
const MUTED: [number, number, number] = [110, 110, 115];

function fmtDate(date: Date | null) {
  return date ? new Date(date).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role === "RESIDENTE" || session.user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);

  const params = req.nextUrl.searchParams;
  const { from, to, compareFrom, compareTo, granularity } = resolvePeriod(params);
  const reportType = (params.get("type") || "completo") as "ejecutivo" | "completo" | "detallado";
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
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // ---------- Header ----------
  doc.setFillColor(...NAVY);
  doc.roundedRect(margin, 30, 26, 26, 6, 6, "F");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("PQ", margin + 13, 46, { align: "center" });
  doc.setTextColor(18, 37, 69);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("PQRS Services", margin + 34, 44);

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("Reporte de gestión de PQRS", margin, 76);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(tenantName, margin, 94);
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Periodo analizado: ${fmtDate(from)} - ${fmtDate(new Date(to.getTime() - 1))}`, margin, 108);
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}  ·  Filtros: ${[
    estado ? `Estado: ${ESTADO_LABEL[estado]}` : null,
    asunto ? `Categoría: ${asunto}` : null,
    prioridad ? `Prioridad: ${PRIORIDAD_LABEL[prioridad]}` : null,
    bloque ? `Bloque: ${bloque}` : null,
  ].filter(Boolean).join(" · ") || "Ninguno"}`, margin, 120);

  let cursorY = 140;

  // ---------- Resumen ejecutivo ----------
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen ejecutivo", margin, cursorY);
  cursorY += 10;

  const summaryBody = [
    ["Total PQRS recibidas", String(data.resumen.total.value), String(data.resumen.total.prev), data.resumen.total.deltaPct != null ? `${data.resumen.total.deltaPct}%` : "—"],
    ["PQRS abiertas", String(data.resumen.abiertas.value), String(data.resumen.abiertas.prev), data.resumen.abiertas.deltaPct != null ? `${data.resumen.abiertas.deltaPct}%` : "—"],
    ["PQRS en proceso", String(data.resumen.enProceso.value), String(data.resumen.enProceso.prev), data.resumen.enProceso.deltaPct != null ? `${data.resumen.enProceso.deltaPct}%` : "—"],
    ["PQRS cerradas", String(data.resumen.cerradas.value), String(data.resumen.cerradas.prev), data.resumen.cerradas.deltaPct != null ? `${data.resumen.cerradas.deltaPct}%` : "—"],
    ["PQRS vencidas", String(data.resumen.vencidas.value), String(data.resumen.vencidas.prev), data.resumen.vencidas.deltaPct != null ? `${data.resumen.vencidas.deltaPct}%` : "—"],
    ["Tiempo prom. primer contacto (días)", String(data.resumen.tiempoPromedioPrimerContacto.value ?? "—"), String(data.resumen.tiempoPromedioPrimerContacto.prev ?? "—"), data.resumen.tiempoPromedioPrimerContacto.deltaPct != null ? `${data.resumen.tiempoPromedioPrimerContacto.deltaPct}%` : "—"],
    ["Tiempo prom. de cierre (días)", String(data.resumen.tiempoPromedioCierre.value ?? "—"), String(data.resumen.tiempoPromedioCierre.prev ?? "—"), data.resumen.tiempoPromedioCierre.deltaPct != null ? `${data.resumen.tiempoPromedioCierre.deltaPct}%` : "—"],
    ["% Cumplimiento del tiempo esperado", data.resumen.pctCumplimiento.value != null ? `${data.resumen.pctCumplimiento.value}%` : "—", data.resumen.pctCumplimiento.prev != null ? `${data.resumen.pctCumplimiento.prev}%` : "—", data.resumen.pctCumplimiento.deltaPct != null ? `${data.resumen.pctCumplimiento.deltaPct}%` : "—"],
  ];
  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    head: [["Indicador", "Valor actual", "Periodo anterior", "Variación"]],
    body: summaryBody,
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    theme: "grid",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursorY = (doc as any).lastAutoTable.finalY + 22;

  // ---------- Alertas ----------
  const ensureSpace = (needed: number) => {
    if (cursorY + needed > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      cursorY = 50;
    }
  };

  ensureSpace(40);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Alertas y acciones prioritarias", margin, cursorY);
  cursorY += 10;

  if (data.alertas.length === 0) {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      body: [["No hay alertas críticas para el periodo seleccionado. La operación se encuentra dentro de los tiempos esperados."]],
      bodyStyles: { fontSize: 9, textColor: SUCCESS },
      theme: "plain",
    });
  } else {
    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Cantidad", "Motivo"]],
      body: data.alertas.map((a) => [String(a.count), a.motivo]),
      headStyles: { fillColor: WARNING, textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 60, halign: "center" } },
      theme: "grid",
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursorY = (doc as any).lastAutoTable.finalY + 22;

  // ---------- Hallazgos ----------
  ensureSpace(30 + data.hallazgos.length * 14);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Hallazgos e interpretación", margin, cursorY);
  cursorY += 16;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  for (const h of data.hallazgos) {
    const lines = doc.splitTextToSize(`• ${h}`, pageWidth - margin * 2);
    ensureSpace(lines.length * 12 + 6);
    doc.text(lines, margin, cursorY);
    cursorY += lines.length * 12 + 4;
  }
  if (data.hallazgos.length === 0) {
    doc.setTextColor(...MUTED);
    doc.text("Información insuficiente para generar hallazgos en este periodo.", margin, cursorY);
    cursorY += 14;
  }
  doc.setTextColor(0, 0, 0);

  if (reportType !== "ejecutivo") {
    // ---------- Análisis por categoría ----------
    cursorY += 12;
    ensureSpace(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Análisis por categoría", margin, cursorY);
    cursorY += 10;
    const totalDist = data.distribucion.porCategoria.reduce((a, b) => a + b.count, 0) || 1;
    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Categoría", "Cantidad", "% del total", "Tiempo prom. cierre", "% Cumplimiento"]],
      body: data.distribucion.porCategoria.map((c) => {
        const t = data.tiempos.porCategoria.find((x) => x.key === c.label);
        return [c.label, String(c.count), `${Math.round((c.count / totalDist) * 100)}%`, t?.avgCierre != null ? `${t.avgCierre}d` : "—", t?.cumplimientoPct != null ? `${t.cumplimientoPct}%` : "—"];
      }),
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      theme: "grid",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursorY = (doc as any).lastAutoTable.finalY + 22;

    // ---------- Desempeño ----------
    ensureSpace(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Desempeño operativo", margin, cursorY);
    cursorY += 10;
    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["Responsable", "Asignados", "Cerrados", "Pendientes", "Vencidos", "% Cumplimiento"]],
      body: data.desempeno.map((d) => [d.responsable, String(d.casosAsignados), String(d.casosCerrados), String(d.casosPendientes), String(d.casosVencidos), d.pctCumplimiento != null ? `${d.pctCumplimiento}%` : "—"]),
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      theme: "grid",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursorY = (doc as any).lastAutoTable.finalY + 22;
  }

  if (reportType === "detallado") {
    ensureSpace(40);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Detalle de casos", margin, cursorY);
    cursorY += 10;
    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      head: [["N° Rad.", "Fecha", "Solicitante", "Categoría", "Prioridad", "Estado", "Responsable", "T. cierre"]],
      body: data.detalle.map((d) => [
        d.numeroRadicacion || `#${d.numero}`,
        fmtDate(d.fechaRecibido),
        d.solicitante,
        d.categoria,
        PRIORIDAD_LABEL[d.prioridad],
        ESTADO_LABEL[d.estado],
        d.responsable || "Sin asignar",
        d.tiempoCierre != null ? `${d.tiempoCierre}d` : "—",
      ]),
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5 },
      theme: "grid",
      styles: { overflow: "linebreak" },
    });
  }

  // ---------- Footer on every page ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Generado desde PQRS Services", margin, doc.internal.pageSize.getHeight() - 24);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 24, { align: "right" });
  }

  const pdfOutput = doc.output("arraybuffer");
  const fileName = reportFileName(tenantName, "pdf");

  await registerAuditLog({
    actorUserId: session.user.id,
    tenantId,
    action: AuditAction.REPORT_EXPORTED,
    targetType: "PqrsReport",
    metadata: { format: "pdf", reportType, from: from.toISOString(), to: to.toISOString() },
  }).catch(() => null);

  return new NextResponse(new Uint8Array(pdfOutput), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
