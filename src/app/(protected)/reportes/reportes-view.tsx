"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { EmptyState, MetricCard, StatusBadge } from "@/components/pqrs/design-system";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ASUNTOS = ["AREA COMUN", "AREA PRIVADA", "CONTABILIDAD", "CONVIVENCIA", "HUMEDAD/CUBIERTA", "HUMEDAD/DEPOSITO", "HUMEDAD/VENTANAS", "HUMEDAD/FACHADA", "HUMEDAD/GARAJE"];

interface ReporteData {
  year: number;
  month: number | null;
  resumen: { total: number; byAsunto: Record<string, number>; byEstado: { enEspera: number; enProgreso: number; terminado: number }; porcentajeCompletadas: number; tiempoPromedioRespuesta: number | null; tiempoPromedioCierre: number | null };
  detalle: { numero: string; fechaRecibido: string; bloque: number; apto: number; nombreResidente: string; asunto: string; descripcion: string; estado: string; fechaCierre: string; diasDesdeApertura: number }[];
}

function getYears() { const current = new Date().getFullYear(); return Array.from({ length: Math.max(current - 2026 + 1, 1) }, (_, index) => current - index); }

export function ReportesView() {
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [tableAsunto, setTableAsunto] = useState("");
  const [tableEstado, setTableEstado] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try { const params = new URLSearchParams({ year }); if (month) params.set("month", month); const res = await fetch(`/api/reportes?${params.toString()}`); if (!res.ok) throw new Error("reportes"); setData(await res.json()); }
    catch { setError("No se pudieron cargar los reportes."); }
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function exportExcel() { const params = new URLSearchParams({ year }); if (month) params.set("month", month); window.open(`/api/reportes/excel?${params.toString()}`, "_blank"); }

  async function exportPDF() {
    if (!data) return;
    setExporting(true);
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF("landscape", "mm", "letter");
    const periodo = month ? `${MESES[parseInt(month) - 1]} ${year}` : `Ano ${year}`;
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("PQRS Services", 14, 15);
    doc.setFontSize(11); doc.text(`Reporte PQRS - ${periodo}`, 14, 23);
    autoTable(doc, { startY: 32, head: [["Metrica", "Valor"]], body: [["Total PQRS", String(data.resumen.total)], ["Radicadas", String(data.resumen.byEstado.enEspera)], ["En proceso", String(data.resumen.byEstado.enProgreso)], ["Terminadas", String(data.resumen.byEstado.terminado)], ["% completadas", `${data.resumen.porcentajeCompletadas}%`]], theme: "grid", headStyles: { fillColor: [18, 37, 69] } });
    if (data.detalle.length > 0) autoTable(doc, { startY: 82, head: [["No.", "Fecha", "Residente", "Unidad", "Asunto", "Estado", "Cierre", "Dias"]], body: data.detalle.map((d) => [d.numero, d.fechaRecibido, d.nombreResidente, `B${d.bloque}-${d.apto}`, d.asunto, d.estado, d.fechaCierre || "--", String(d.diasDesdeApertura)]), theme: "grid", headStyles: { fillColor: [18, 37, 69] }, styles: { fontSize: 7 } });
    doc.save(`PQRS_${month ? MESES[parseInt(month) - 1] + "_" : ""}${year}.pdf`);
    setExporting(false);
  }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-[#122545]" /></div>;
  if (error) return <EmptyState title="No fue posible cargar reportes" description={error} />;
  if (!data) return null;

  const r = data.resumen;
  const filteredDetalle = data.detalle.filter((d) => (!tableAsunto || d.asunto === tableAsunto) && (!tableEstado || d.estado.startsWith(tableEstado)));
  const asuntoEntries = Object.entries(r.byAsunto).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="pqrs-eyebrow">REPORTES</p><h1 className="pqrs-title mt-2">Resumen ejecutivo</h1><p className="pqrs-subtitle mt-2">Indicadores y exportes para seguimiento operativo y reuniones de consejo.</p></div>
        <div className="flex flex-wrap gap-2"><select value={year} onChange={(e) => setYear(e.target.value)} className="pqrs-input h-10 w-auto min-w-[96px] py-0">{getYears().map((y) => <option key={y} value={String(y)}>{y}</option>)}</select><select value={month} onChange={(e) => setMonth(e.target.value)} className="pqrs-input h-10 w-auto min-w-[150px] py-0"><option value="">Todo el ano</option>{MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}</select></div>
      </div>

      <div className="flex flex-wrap gap-3"><button onClick={exportExcel} disabled={r.total === 0} className="pqrs-button-primary gap-2"><FileSpreadsheet className="h-4 w-4" />Exportar Excel</button><button onClick={exportPDF} disabled={exporting || r.total === 0} className="pqrs-button-ghost gap-2"><FileText className="h-4 w-4" />Exportar PDF</button></div>

      {r.total === 0 ? <EmptyState title="No hay datos" description="No hay PQRS en el periodo seleccionado." /> : <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><MetricCard label="Total" value={r.total} /><MetricCard label="Radicadas" value={r.byEstado.enEspera} /><MetricCard label="En proceso" value={r.byEstado.enProgreso} /><MetricCard label="Terminadas" value={r.byEstado.terminado} /><MetricCard label="Completadas" value={`${r.porcentajeCompletadas}%`} /><MetricCard label="Prom. cierre" value={r.tiempoPromedioCierre !== null ? `${r.tiempoPromedioCierre}d` : "--"} /></div>

      <section className="pqrs-panel p-5"><div className="flex items-center justify-between"><div><p className="pqrs-eyebrow">DISTRIBUCION</p><h2 className="mt-1 text-lg font-extrabold">PQRS por asunto</h2></div><BarChart3 className="h-5 w-5 text-[#8E8E93]" /></div><div className="mt-5 grid gap-3 md:grid-cols-2">{asuntoEntries.map(([asunto, count]) => { const pct = r.total ? Math.round((count / r.total) * 100) : 0; return <div key={asunto} className="rounded-2xl bg-[#F5F5F7] p-4"><div className="flex justify-between text-sm font-extrabold"><span>{asunto}</span><span>{count}</span></div><div className="mt-3 h-2 rounded-full bg-white"><div className="h-full rounded-full bg-[#122545]" style={{ width: `${pct}%` }} /></div><p className="mt-2 text-xs font-bold text-[#6E6E73]">{pct}% del periodo</p></div>; })}</div></section>

      <section className="pqrs-panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-black/[0.06] p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="pqrs-eyebrow">DETALLE</p><h2 className="mt-1 text-lg font-extrabold">Seguimiento PQRS ({filteredDetalle.length})</h2></div><div className="flex flex-wrap gap-2"><select value={tableAsunto} onChange={(e) => setTableAsunto(e.target.value)} className="pqrs-input h-9 w-auto min-w-[190px] py-0"><option value="">Todos los asuntos</option>{ASUNTOS.map((a) => <option key={a} value={a}>{a}</option>)}</select><select value={tableEstado} onChange={(e) => setTableEstado(e.target.value)} className="pqrs-input h-9 w-auto min-w-[150px] py-0"><option value="">Todos los estados</option><option value="En espera">Radicada</option><option value="En proceso">En proceso</option><option value="Terminado">Terminada</option></select></div></div><div className="overflow-x-auto"><table className="pqrs-table"><thead><tr><th>No.</th><th>Fecha</th><th>Residente</th><th>Unidad</th><th>Asunto</th><th>Estado</th><th>Cierre</th><th>Dias</th></tr></thead><tbody>{filteredDetalle.map((d) => <tr key={d.numero}><td className="font-mono text-[#122545]">{d.numero}</td><td>{d.fechaRecibido}</td><td className="font-bold text-[#1D1D1F]">{d.nombreResidente}</td><td>B{d.bloque}-{d.apto}</td><td>{d.asunto}</td><td><StatusBadge status={d.estado} /></td><td>{d.fechaCierre || "--"}</td><td>{d.diasDesdeApertura}</td></tr>)}</tbody></table></div></section></>}
    </div>
  );
}
