"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  BarChart3,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  Timer,
  CheckCircle2,
  Hourglass,
  Clock,
  ArrowLeft,
} from "lucide-react";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const ASUNTOS = [
  "AREA COMUN",
  "AREA PRIVADA",
  "CONTABILIDAD",
  "CONVIVENCIA",
  "HUMEDAD/CUBIERTA",
  "HUMEDAD/DEPOSITO",
  "HUMEDAD/VENTANAS",
  "HUMEDAD/FACHADA",
  "HUMEDAD/GARAJE",
];

interface ReporteData {
  year: number;
  month: number | null;
  resumen: {
    total: number;
    byAsunto: Record<string, number>;
    byEstado: { enEspera: number; enProgreso: number; terminado: number };
    porcentajeCompletadas: number;
    tiempoPromedioRespuesta: number | null;
    tiempoPromedioCierre: number | null;
  };
  detalle: {
    numero: string;
    fechaRecibido: string;
    bloque: number;
    apto: number;
    nombreResidente: string;
    asunto: string;
    descripcion: string;
    estado: string;
    fechaPrimerContacto: string;
    tiempoRespuestaPrimerContacto: number | string;
    accionTomada: string;
    evidenciaCierre: string;
    fechaCierre: string;
    tiempoRespuestaCierre: number | string;
    diasDesdeApertura: number;
    gestionadoPor: string;
  }[];
}

function getYears() {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= 2026; y--) {
    years.push(y);
  }
  return years;
}

export function ReportesView() {
  const router = useRouter();
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [tableAsunto, setTableAsunto] = useState("");
  const [tableEstado, setTableEstado] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year });
      if (month) params.set("month", month);
      const res = await fetch(`/api/reportes?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar reportes");
      const json = await res.json();
      setData(json);
    } catch {
      setError("No se pudieron cargar los reportes.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportExcel() {
    if (!data) return;
    const params = new URLSearchParams({ year });
    if (month) params.set("month", month);
    window.open(`/api/reportes/excel?${params.toString()}`, "_blank");
  }

  async function exportPDF() {
    if (!data) return;
    setExporting(true);

    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF("landscape", "mm", "letter");
    const periodo = month ? `${MESES[parseInt(month) - 1]} ${year}` : `AÃ±o ${year}`;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("PQRS SaaS", 14, 15);
    doc.setFontSize(12);
    doc.text(`Reporte PQRS - ${periodo}`, 14, 23);

    // Summary table
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen General", 14, 33);

    const r = data.resumen;
    const summaryRows: [string, string][] = [
      ["Total PQRS", String(r.total)],
      ["En espera", String(r.byEstado.enEspera)],
      ["En proceso", String(r.byEstado.enProgreso)],
      ["Terminadas", String(r.byEstado.terminado)],
      ["% Completadas", `${r.porcentajeCompletadas}%`],
      ["Prom. primer contacto (dÃ­as)", r.tiempoPromedioRespuesta !== null ? String(r.tiempoPromedioRespuesta) : "N/A"],
      ["Prom. cierre (dÃ­as)", r.tiempoPromedioCierre !== null ? String(r.tiempoPromedioCierre) : "N/A"],
    ];

    for (const [asunto, count] of Object.entries(r.byAsunto).sort((a, b) => b[1] - a[1])) {
      summaryRows.push([asunto, String(count)]);
    }

    autoTable(doc, {
      startY: 36,
      head: [["MÃ©trica", "Valor"]],
      body: summaryRows,
      theme: "grid",
      headStyles: { fillColor: [21, 128, 61] },
      styles: { fontSize: 9 },
      margin: { left: 14 },
      tableWidth: 120,
    });

    // Detail table on new page
    if (data.detalle.length > 0) {
      doc.addPage("landscape");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Seguimiento PQRS", 14, 15);

      autoTable(doc, {
        startY: 18,
        head: [[
          "NÂ°", "Fecha Recibido", "Bloque", "Apto", "Nombre",
          "Asunto", "Estado",
          "Fecha 1er Contacto", "DÃ­as Resp.",
          "Fecha de cierre", "DÃ­as Cierre", "DÃ­as Apertura",
        ]],
        body: data.detalle.map((d) => [
          d.numero,
          d.fechaRecibido,
          String(d.bloque),
          String(d.apto),
          d.nombreResidente,
          d.asunto.substring(0, 40),
          d.estado,
          d.fechaPrimerContacto || "—",
          d.tiempoRespuestaPrimerContacto !== "" ? String(d.tiempoRespuestaPrimerContacto) : "—",
          d.fechaCierre || "—",
          d.tiempoRespuestaCierre !== "" ? String(d.tiempoRespuestaCierre) : "—",
          String(d.diasDesdeApertura),
        ]),
        theme: "grid",
        headStyles: { fillColor: [21, 128, 61], fontSize: 7 },
        styles: { fontSize: 7 },
        margin: { left: 14 },
      });
    }

    const filename = `PQRS_${month ? MESES[parseInt(month) - 1] + "_" : ""}${year}.pdf`;
    doc.save(filename);

    setExporting(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive">{error}</p>
        <button onClick={fetchData} className="mt-3 text-sm text-success underline">Reintentar</button>
      </div>
    );
  }

  if (!data) return null;

  const r = data.resumen;

  // Filter detail table
  const filteredDetalle = data.detalle.filter((d) => {
    if (tableAsunto && d.asunto !== tableAsunto) return false;
    if (tableEstado) {
      if (tableEstado === "En espera" && !d.estado.startsWith("En espera")) return false;
      if (tableEstado === "En proceso" && !d.estado.startsWith("En proceso")) return false;
      if (tableEstado === "Terminado" && !d.estado.startsWith("Terminado")) return false;
    }
    return true;
  });

  const asuntoEntries = Object.entries(r.byAsunto).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
        </div>

        <div className="flex gap-2 flex-wrap">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-10 text-sm px-3 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            {getYears().map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>

          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 text-sm px-3 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            <option value="">Todo el año</option>
            {MESES.map((m, i) => (
              <option key={i} value={String(i + 1)}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={exportExcel}
          disabled={exporting || r.total === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </button>
        <button
          onClick={exportPDF}
          disabled={exporting || r.total === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-destructive text-white font-bold rounded-xl hover:bg-destructive/90 disabled:opacity-50 transition-colors text-sm"
        >
          <FileText className="h-4 w-4" />
          Exportar PDF
        </button>
      </div>

      {r.total === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">No hay PQRS en el perÃ­odo seleccionado.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Total PQRS" value={r.total} icon={<FileText className="h-5 w-5" />} color="text-foreground" bg="bg-muted" />
            <StatCard label="En espera" value={r.byEstado.enEspera} icon={<Hourglass className="h-5 w-5" />} color="text-warning" bg="bg-warning/10" />
            <StatCard label="En proceso" value={r.byEstado.enProgreso} icon={<Clock className="h-5 w-5" />} color="text-primary" bg="bg-accent" />
            <StatCard label="Terminadas" value={r.byEstado.terminado} icon={<CheckCircle2 className="h-5 w-5" />} color="text-success" bg="bg-success/10" />
            <StatCard label="% Completadas" value={`${r.porcentajeCompletadas}%`} icon={<TrendingUp className="h-5 w-5" />} color="text-success" bg="bg-success/10" />
            <StatCard label="Prom. cierre" value={r.tiempoPromedioCierre !== null ? `${r.tiempoPromedioCierre} dÃ­as` : "—"} icon={<Timer className="h-5 w-5" />} color="text-primary" bg="bg-accent" />
          </div>

          {/* Asunto distribution */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-base font-bold text-foreground mb-4">DistribuciÃ³n por asunto</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {asuntoEntries.map(([asunto, count]) => {
                const pct = r.total > 0 ? Math.round((count / r.total) * 100) : 0;
                return (
                  <div key={asunto} className="rounded-2xl border border-border p-4 bg-success/10">
                    <p className="text-xs text-success font-medium">{asunto}</p>
                    <p className="text-2xl font-bold mt-1 text-success">{count}</p>
                    <div className="mt-2 h-2 rounded-full bg-white/60 overflow-hidden">
                      <div className="h-full rounded-full bg-success/100" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-success opacity-70 mt-1">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-white rounded-2xl border border-border overflow-x-auto">
            <div className="p-5 border-b border-border">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-base font-bold text-foreground">
                  Detalle de PQRS ({filteredDetalle.length})
                </h2>
                <div className="flex gap-2">
                  <select
                    value={tableAsunto}
                    onChange={(e) => setTableAsunto(e.target.value)}
                    className="h-9 text-xs px-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  >
                    <option value="">Todos los asuntos</option>
                    {ASUNTOS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                    {data.detalle.some((d) => d.asunto === "Sin asunto") && (
                      <option value="Sin asunto">Sin asunto</option>
                    )}
                  </select>
                  <select
                    value={tableEstado}
                    onChange={(e) => setTableEstado(e.target.value)}
                    className="h-9 text-xs px-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  >
                    <option value="">Todos los estados</option>
                    <option value="En espera">En espera</option>
                    <option value="En proceso">En proceso</option>
                    <option value="Terminado">Terminado</option>
                  </select>
                  {(tableAsunto || tableEstado) && (
                    <button
                      onClick={() => { setTableAsunto(""); setTableEstado(""); }}
                      className="h-9 text-xs px-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">NÂ°</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Nombre</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Bloque</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Apto</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Asunto</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">Fecha de cierre</th>
                  <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap">DÃ­as apertura</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetalle.map((d) => (
                  <tr key={d.numero} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{d.numero}</td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{d.fechaRecibido}</td>
                    <td className="px-4 py-2.5 text-foreground">{d.nombreResidente}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-center">{d.bloque}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-center">{d.apto}</td>
                    <td className="px-4 py-2.5 text-foreground max-w-[200px] truncate">{d.asunto}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        d.estado.startsWith("Terminado") ? "bg-success/10 text-success" :
                        d.estado.startsWith("En proceso") ? "bg-accent text-primary" :
                        "bg-warning/10 text-warning"
                      }`}>
                        {d.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{d.fechaCierre || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-center">{d.diasDesdeApertura}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color, bg }: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-border p-4 text-center">
      <div className={`w-10 h-10 rounded-xl ${bg} ${color} flex items-center justify-center mx-auto mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
