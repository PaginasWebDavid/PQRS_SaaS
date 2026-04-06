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
    const periodo = month ? `${MESES[parseInt(month) - 1]} ${year}` : `Año ${year}`;

    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CONJUNTO PARQUE RESIDENCIAL CALLE 100", 14, 15);
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
      ["Prom. primer contacto (días)", r.tiempoPromedioRespuesta !== null ? String(r.tiempoPromedioRespuesta) : "N/A"],
      ["Prom. cierre (días)", r.tiempoPromedioCierre !== null ? String(r.tiempoPromedioCierre) : "N/A"],
    ];

    for (const [asunto, count] of Object.entries(r.byAsunto).sort((a, b) => b[1] - a[1])) {
      summaryRows.push([asunto, String(count)]);
    }

    autoTable(doc, {
      startY: 36,
      head: [["Métrica", "Valor"]],
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
          "N°", "Fecha Recibido", "Bloque", "Apto", "Nombre",
          "Asunto", "Estado",
          "Fecha 1er Contacto", "Días Resp.",
          "Fecha de cierre", "Días Cierre", "Días Apertura",
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
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600">{error}</p>
        <button onClick={fetchData} className="mt-3 text-sm text-green-700 underline">Reintentar</button>
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
            className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-green-700" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        </div>

        <div className="flex gap-2 flex-wrap">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          >
            {getYears().map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>

          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
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
          className="flex items-center gap-2 px-5 py-2.5 bg-green-700 text-white font-bold rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors text-sm"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </button>
        <button
          onClick={exportPDF}
          disabled={exporting || r.total === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
        >
          <FileText className="h-4 w-4" />
          Exportar PDF
        </button>
      </div>

      {r.total === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500">No hay PQRS en el período seleccionado.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Total PQRS" value={r.total} icon={<FileText className="h-5 w-5" />} color="text-gray-900" bg="bg-gray-100" />
            <StatCard label="En espera" value={r.byEstado.enEspera} icon={<Hourglass className="h-5 w-5" />} color="text-yellow-700" bg="bg-yellow-100" />
            <StatCard label="En proceso" value={r.byEstado.enProgreso} icon={<Clock className="h-5 w-5" />} color="text-blue-700" bg="bg-blue-100" />
            <StatCard label="Terminadas" value={r.byEstado.terminado} icon={<CheckCircle2 className="h-5 w-5" />} color="text-green-700" bg="bg-green-100" />
            <StatCard label="% Completadas" value={`${r.porcentajeCompletadas}%`} icon={<TrendingUp className="h-5 w-5" />} color="text-green-700" bg="bg-green-100" />
            <StatCard label="Prom. cierre" value={r.tiempoPromedioCierre !== null ? `${r.tiempoPromedioCierre} días` : "—"} icon={<Timer className="h-5 w-5" />} color="text-blue-700" bg="bg-blue-100" />
          </div>

          {/* Asunto distribution */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">Distribución por asunto</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {asuntoEntries.map(([asunto, count]) => {
                const pct = r.total > 0 ? Math.round((count / r.total) * 100) : 0;
                return (
                  <div key={asunto} className="rounded-2xl border border-gray-100 p-4 bg-green-50">
                    <p className="text-xs text-green-700 font-medium">{asunto}</p>
                    <p className="text-2xl font-bold mt-1 text-green-700">{count}</p>
                    <div className="mt-2 h-2 rounded-full bg-white/60 overflow-hidden">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-green-700 opacity-70 mt-1">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-base font-bold text-gray-900">
                  Detalle de PQRS ({filteredDetalle.length})
                </h2>
                <div className="flex gap-2">
                  <select
                    value={tableAsunto}
                    onChange={(e) => setTableAsunto(e.target.value)}
                    className="h-9 text-xs px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
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
                    className="h-9 text-xs px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                  >
                    <option value="">Todos los estados</option>
                    <option value="En espera">En espera</option>
                    <option value="En proceso">En proceso</option>
                    <option value="Terminado">Terminado</option>
                  </select>
                  {(tableAsunto || tableEstado) && (
                    <button
                      onClick={() => { setTableAsunto(""); setTableEstado(""); }}
                      className="h-9 text-xs px-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">N°</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Nombre</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Bloque</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Apto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Asunto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Fecha de cierre</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Días apertura</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetalle.map((d) => (
                  <tr key={d.numero} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{d.numero}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{d.fechaRecibido}</td>
                    <td className="px-4 py-2.5 text-gray-900">{d.nombreResidente}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-center">{d.bloque}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-center">{d.apto}</td>
                    <td className="px-4 py-2.5 text-gray-900 max-w-[200px] truncate">{d.asunto}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        d.estado.startsWith("Terminado") ? "bg-green-100 text-green-700" :
                        d.estado.startsWith("En proceso") ? "bg-blue-100 text-blue-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {d.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{d.fechaCierre || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-center">{d.diasDesdeApertura}</td>
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
    <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
      <div className={`w-10 h-10 rounded-xl ${bg} ${color} flex items-center justify-center mx-auto mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
