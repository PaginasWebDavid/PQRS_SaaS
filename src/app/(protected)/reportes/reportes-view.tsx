"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  BarChart3,
  FileSpreadsheet,
  FileText,
  ArrowRightLeft,
  TrendingUp,
  Timer,
  CheckCircle2,
  Hourglass,
  Clock,
} from "lucide-react";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface ReporteData {
  year: number;
  month: number | null;
  resumen: {
    total: number;
    byTipo: { peticion: number; queja: number; reclamo: number; sugerencia: number };
    byEstado: { enEspera: number; enProgreso: number; terminado: number };
    porcentajeCompletadas: number;
    tiempoPromedioRespuesta: number | null;
    tiempoPromedioCierre: number | null;
  };
  transiciones: {
    espera_a_progreso: number;
    progreso_a_terminado: number;
  };
  detalle: {
    numero: number;
    medio: string;
    fechaRecibido: string;
    mes: string;
    bloque: number;
    apto: number;
    nombreResidente: string;
    tipoPqrs: string;
    asunto: string;
    descripcion: string;
    fechaPrimerContacto: string;
    tiempoRespuestaPrimerContacto: number | string;
    accionTomada: string;
    estado: string;
    evidenciaCierre: string;
    fechaCierre: string;
    tiempoRespuestaCierre: number | string;
    gestionadoPor: string;
  }[];
}

function getYears() {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= 2021; y--) {
    years.push(y);
  }
  return years;
}

export function ReportesView() {
  const [data, setData] = useState<ReporteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");
  const [exporting, setExporting] = useState(false);

  const [error, setError] = useState("");

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

    autoTable(doc, {
      startY: 36,
      head: [["Métrica", "Valor"]],
      body: [
        ["Total PQRS", String(data.resumen.total)],
        ["Peticiones", String(data.resumen.byTipo.peticion)],
        ["Quejas", String(data.resumen.byTipo.queja)],
        ["Reclamos", String(data.resumen.byTipo.reclamo)],
        ["Sugerencias", String(data.resumen.byTipo.sugerencia)],
        ["En espera", String(data.resumen.byEstado.enEspera)],
        ["En progreso", String(data.resumen.byEstado.enProgreso)],
        ["Terminadas", String(data.resumen.byEstado.terminado)],
        ["% Completadas", `${data.resumen.porcentajeCompletadas}%`],
        ["Prom. respuesta (días)", data.resumen.tiempoPromedioRespuesta !== null ? String(data.resumen.tiempoPromedioRespuesta) : "N/A"],
        ["Prom. cierre (días)", data.resumen.tiempoPromedioCierre !== null ? String(data.resumen.tiempoPromedioCierre) : "N/A"],
        ["Transiciones: Espera → Progreso", String(data.transiciones.espera_a_progreso)],
        ["Transiciones: Progreso → Terminado", String(data.transiciones.progreso_a_terminado)],
      ],
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
          "Tipo", "Asunto", "Estado",
          "Fecha 1er Contacto", "Días Resp.",
          "Fecha Cierre", "Días Cierre",
        ]],
        body: data.detalle.map((d) => [
          String(d.numero),
          d.fechaRecibido,
          String(d.bloque),
          String(d.apto),
          d.nombreResidente,
          d.tipoPqrs,
          d.asunto.substring(0, 40),
          d.estado,
          d.fechaPrimerContacto || "—",
          d.tiempoRespuestaPrimerContacto !== "" ? String(d.tiempoRespuestaPrimerContacto) : "—",
          d.fechaCierre || "—",
          d.tiempoRespuestaCierre !== "" ? String(d.tiempoRespuestaCierre) : "—",
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-green-700" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        </div>

        <div className="flex gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          >
            {getYears().map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          >
            <option value="">Todo el año</option>
            {MESES.map((m, i) => (
              <option key={i} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex gap-3">
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
            <StatCard
              label="Total PQRS"
              value={r.total}
              icon={<FileText className="h-5 w-5" />}
              color="text-gray-900"
              bg="bg-gray-100"
            />
            <StatCard
              label="En espera"
              value={r.byEstado.enEspera}
              icon={<Hourglass className="h-5 w-5" />}
              color="text-yellow-700"
              bg="bg-yellow-100"
            />
            <StatCard
              label="En progreso"
              value={r.byEstado.enProgreso}
              icon={<Clock className="h-5 w-5" />}
              color="text-blue-700"
              bg="bg-blue-100"
            />
            <StatCard
              label="Terminadas"
              value={r.byEstado.terminado}
              icon={<CheckCircle2 className="h-5 w-5" />}
              color="text-green-700"
              bg="bg-green-100"
            />
            <StatCard
              label="% Completadas"
              value={`${r.porcentajeCompletadas}%`}
              icon={<TrendingUp className="h-5 w-5" />}
              color="text-green-700"
              bg="bg-green-100"
            />
            <StatCard
              label="Prom. cierre"
              value={r.tiempoPromedioCierre !== null ? `${r.tiempoPromedioCierre} días` : "—"}
              icon={<Timer className="h-5 w-5" />}
              color="text-blue-700"
              bg="bg-blue-100"
            />
          </div>

          {/* Transitions card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <ArrowRightLeft className="h-5 w-5 text-green-700" />
              <h2 className="text-base font-bold text-gray-900">Transiciones de estado</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-600 font-medium">En espera → En progreso</p>
                <p className="text-3xl font-bold text-blue-700 mt-1">{data.transiciones.espera_a_progreso}</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-sm text-green-600 font-medium">En progreso → Terminado</p>
                <p className="text-3xl font-bold text-green-700 mt-1">{data.transiciones.progreso_a_terminado}</p>
              </div>
            </div>
          </div>

          {/* Type distribution */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">Distribución por tipo</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TypeCard label="Peticiones" value={r.byTipo.peticion} total={r.total} color="bg-blue-500" bg="bg-blue-50" textColor="text-blue-700" />
              <TypeCard label="Quejas" value={r.byTipo.queja} total={r.total} color="bg-red-500" bg="bg-red-50" textColor="text-red-700" />
              <TypeCard label="Reclamos" value={r.byTipo.reclamo} total={r.total} color="bg-orange-500" bg="bg-orange-50" textColor="text-orange-700" />
              <TypeCard label="Sugerencias" value={r.byTipo.sugerencia} total={r.total} color="bg-green-500" bg="bg-green-50" textColor="text-green-700" />
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                Detalle de PQRS ({data.detalle.length})
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">N°</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Residente</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Ubicación</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Asunto</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Cierre</th>
                </tr>
              </thead>
              <tbody>
                {data.detalle.map((d) => (
                  <tr key={d.numero} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-gray-600">#{d.numero}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{d.fechaRecibido}</td>
                    <td className="px-4 py-2.5 text-gray-900">{d.nombreResidente}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">B{d.bloque}-{d.apto}</td>
                    <td className="px-4 py-2.5 text-gray-600">{d.tipoPqrs}</td>
                    <td className="px-4 py-2.5 text-gray-900 max-w-[200px] truncate">{d.asunto}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        d.estado === "Terminado" ? "bg-green-100 text-green-700" :
                        d.estado === "En progreso" ? "bg-blue-100 text-blue-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {d.estado}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{d.fechaCierre || "—"}</td>
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

function TypeCard({ label, value, total, color, bg, textColor }: {
  label: string;
  value: number;
  total: number;
  color: string;
  bg: string;
  textColor: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`rounded-2xl border border-gray-100 p-4 ${bg}`}>
      <p className={`text-xs ${textColor} font-medium`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${textColor}`}>{value}</p>
      <div className="mt-2 h-2 rounded-full bg-white/60 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-xs ${textColor} opacity-70 mt-1`}>{pct}%</p>
    </div>
  );
}
