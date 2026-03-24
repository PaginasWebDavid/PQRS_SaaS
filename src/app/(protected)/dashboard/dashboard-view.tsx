"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  FileText,
  Hourglass,
  Clock,
  CheckCircle2,
  Timer,
  AlertCircle,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface DashboardData {
  year: number;
  resumen: {
    total: number;
    enEspera: number;
    enProgreso: number;
    terminado: number;
    porcentajeCompletadas: number;
    tiempoPromedioRespuesta: number | null;
    tiempoPromedioCierre: number | null;
  };
  porMes: { mes: string; total: number; terminadas: number }[];
  porTipo: { nombre: string; valor: number; color: string }[];
  porAsunto: { nombre: string; valor: number }[];
  porEstado: { nombre: string; valor: number; color: string }[];
  trimestres: { label: string; total: number; terminado: number; enProgreso: number; enEspera: number }[];
  porAsuntoDetalle: { asunto: string; cantidad: number; descripcion: string; terminados: number; enProgreso: number; enEspera: number }[];
  pendientes: {
    id: string;
    numero: number;
    asunto: string;
    tipoPqrs: string;
    nombreResidente: string;
    bloque: number;
    apto: number;
    diasEspera: number;
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

const ASUNTO_COLORS = ["#15803d", "#22c55e", "#86efac", "#bbf7d0", "#166534"];

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");

  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year });
      if (month) params.set("month", month);
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar datos");
      const json = await res.json();
      setData(json);
    } catch {
      setError("No se pudieron cargar los datos del dashboard.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportDashboardExcel() {
    if (!data) return;
    window.open(`/api/dashboard/excel?year=${year}`, "_blank");
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
        <h1 className="text-2xl font-bold text-gray-900">
          Dashboard
          {month ? ` — ${MESES[parseInt(month) - 1]}` : ""} {year}
        </h1>
        <div className="flex gap-2 flex-wrap">
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
          <button
            onClick={exportDashboardExcel}
            disabled={r.total === 0}
            className="flex items-center gap-2 h-10 px-4 bg-green-700 text-white font-bold rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors text-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/pqrs?estado=todos">
          <SummaryCard
            label="Total PQRS"
            value={r.total}
            icon={<FileText className="h-5 w-5" />}
            color="text-gray-900"
            bg="bg-gray-100"
          />
        </Link>
        <Link href="/pqrs?estado=EN_ESPERA">
          <SummaryCard
            label="En espera"
            value={r.enEspera}
            icon={<Hourglass className="h-5 w-5" />}
            color="text-yellow-700"
            bg="bg-yellow-100"
            alert={r.enEspera > 0}
          />
        </Link>
        <Link href="/pqrs?estado=EN_PROGRESO">
          <SummaryCard
            label="En progreso"
            value={r.enProgreso}
            icon={<Clock className="h-5 w-5" />}
            color="text-blue-700"
            bg="bg-blue-100"
          />
        </Link>
        <Link href="/pqrs?estado=TERMINADO">
          <SummaryCard
            label="Terminadas"
            value={r.terminado}
            icon={<CheckCircle2 className="h-5 w-5" />}
            color="text-green-700"
            bg="bg-green-100"
          />
        </Link>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="text-xs text-gray-500">Completadas</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{r.porcentajeCompletadas}%</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-2">
            <Timer className="h-5 w-5" />
          </div>
          <p className="text-xs text-gray-500">Prom. respuesta</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {r.tiempoPromedioRespuesta !== null ? `${r.tiempoPromedioRespuesta}d` : "—"}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-xs text-gray-500">Prom. cierre</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {r.tiempoPromedioCierre !== null ? `${r.tiempoPromedioCierre}d` : "—"}
          </p>
        </div>
      </div>

      {/* Tabla resumen por trimestre */}
      {r.total > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">PQRS - {data.year}</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-bold text-gray-700">PQRS</th>
                {data.trimestres.map((t) => (
                  <th key={t.label} className="text-center px-4 py-3 font-bold text-gray-700">{t.label}</th>
                ))}
                <th className="text-center px-4 py-3 font-bold text-gray-700">TOTAL</th>
                <th className="text-center px-4 py-3 font-bold text-gray-700">%</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900">Total</td>
                {data.trimestres.map((t) => (
                  <td key={t.label} className="text-center px-4 py-2.5 text-gray-700">{t.total || ""}</td>
                ))}
                <td className="text-center px-4 py-2.5 font-bold text-gray-900">{r.total}</td>
                <td className="text-center px-4 py-2.5 text-gray-500"></td>
              </tr>
              <tr className="border-b border-gray-100 bg-green-50">
                <td className="px-4 py-2.5 font-medium text-green-700">Terminado</td>
                {data.trimestres.map((t) => (
                  <td key={t.label} className="text-center px-4 py-2.5 text-green-700">{t.terminado || ""}</td>
                ))}
                <td className="text-center px-4 py-2.5 font-bold text-green-700">{r.terminado}</td>
                <td className="text-center px-4 py-2.5 font-bold text-green-700">{r.total > 0 ? `${Math.round((r.terminado / r.total) * 100)}%` : "0%"}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2.5 font-medium text-blue-700">En Proceso</td>
                {data.trimestres.map((t) => (
                  <td key={t.label} className="text-center px-4 py-2.5 text-blue-700">{t.enProgreso || ""}</td>
                ))}
                <td className="text-center px-4 py-2.5 font-bold text-blue-700">{r.enProgreso}</td>
                <td className="text-center px-4 py-2.5 font-bold text-blue-700">{r.total > 0 ? `${Math.round((r.enProgreso / r.total) * 100)}%` : "0%"}</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-medium text-yellow-700">En Espera</td>
                {data.trimestres.map((t) => (
                  <td key={t.label} className="text-center px-4 py-2.5 text-yellow-700">{t.enEspera || ""}</td>
                ))}
                <td className="text-center px-4 py-2.5 font-bold text-yellow-700">{r.enEspera}</td>
                <td className="text-center px-4 py-2.5 font-bold text-yellow-700">{r.total > 0 ? `${Math.round((r.enEspera / r.total) * 100)}%` : "0%"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla detalle por asunto */}
      {data.porAsuntoDetalle.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">PQRS por detalle de {data.year}</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-center px-4 py-3 font-bold text-gray-700">Cantidad</th>
                <th className="text-left px-4 py-3 font-bold text-gray-700">Asunto</th>
                <th className="text-left px-4 py-3 font-bold text-gray-700">Descripción</th>
                <th className="text-center px-4 py-3 font-bold text-green-700">Terminados</th>
                <th className="text-center px-4 py-3 font-bold text-blue-700">En Proceso</th>
                <th className="text-center px-4 py-3 font-bold text-yellow-700">En Espera</th>
              </tr>
            </thead>
            <tbody>
              {data.porAsuntoDetalle.map((a) => (
                <tr key={a.asunto} className="border-b border-gray-100">
                  <td className="text-center px-4 py-2.5 font-bold text-gray-900">{a.cantidad}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{a.asunto}</td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[300px] truncate">{a.descripcion}</td>
                  <td className="text-center px-4 py-2.5 text-green-700">{a.terminados}</td>
                  <td className="text-center px-4 py-2.5 text-blue-700">{a.enProgreso}</td>
                  <td className="text-center px-4 py-2.5 text-yellow-700">{a.enEspera}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="text-center px-4 py-2.5 text-gray-900">{r.total}</td>
                <td className="px-4 py-2.5 text-gray-900"></td>
                <td className="px-4 py-2.5 text-gray-900"></td>
                <td className="text-center px-4 py-2.5 text-green-700">{r.terminado}</td>
                <td className="text-center px-4 py-2.5 text-blue-700">{r.enProgreso}</td>
                <td className="text-center px-4 py-2.5 text-yellow-700">{r.enEspera}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Pendientes urgentes */}
      {data.pendientes.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <h2 className="text-base font-bold text-yellow-800">
              PQRS pendientes de gestión
            </h2>
          </div>
          <div className="space-y-2">
            {data.pendientes.map((p) => (
              <Link key={p.id} href={`/pqrs/${p.id}`}>
                <div className="flex items-center justify-between bg-white rounded-xl p-3 hover:shadow-sm transition-all group">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-400">#{p.numero}</span>
                      <span className="text-sm font-medium text-gray-900 truncate">{p.asunto}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.nombreResidente} · B{p.bloque}-{p.apto}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      p.diasEspera > 5 ? "bg-red-100 text-red-700" :
                      p.diasEspera > 2 ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {p.diasEspera}d
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-green-600" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Charts row 1: Tendencia mensual */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4">
          Tendencia mensual
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb" }}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="Recibidas"
                stroke="#15803d"
                strokeWidth={2.5}
                dot={{ fill: "#15803d", r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="terminadas"
                name="Terminadas"
                stroke="#86efac"
                strokeWidth={2}
                dot={{ fill: "#86efac", r: 3 }}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: Tipo + Estado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* By tipo */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">
            Por tipo
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.porTipo} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 12 }} width={85} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="valor" name="Cantidad" radius={[0, 6, 6, 0]}>
                  {data.porTipo.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By estado - donut */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">
            Por estado
          </h2>
          {r.total > 0 ? (
            <div className="h-52 flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.porEstado.filter((e) => e.valor > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="valor"
                  >
                    {data.porEstado
                      .filter((e) => e.valor > 0)
                      .map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 shrink-0">
                {data.porEstado.map((e) => (
                  <div key={e.nombre} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: e.color }} />
                    <span className="text-xs text-gray-600">{e.nombre}</span>
                    <span className="text-xs font-bold text-gray-900">{e.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
              Sin datos
            </div>
          )}
        </div>
      </div>

      {/* Chart row 3: By asunto */}
      {data.porAsunto.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">
            Por asunto
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.porAsunto}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="valor" name="Cantidad" radius={[6, 6, 0, 0]}>
                  {data.porAsunto.map((_, i) => (
                    <Cell key={i} fill={ASUNTO_COLORS[i % ASUNTO_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  bg,
  alert,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border ${alert ? "border-yellow-300 shadow-sm shadow-yellow-100" : "border-gray-100"} p-4 text-center hover:shadow-md hover:border-green-200 transition-all cursor-pointer`}>
      <div className={`w-10 h-10 rounded-xl ${bg} ${color} flex items-center justify-center mx-auto mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
