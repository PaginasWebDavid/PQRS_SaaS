"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  FileText,
  Hourglass,
  Clock,
  CheckCircle2,
  TrendingUp,
  Timer,
} from "lucide-react";

interface TrimestreStats {
  total: number;
  enEspera: number;
  enProgreso: number;
  terminado: number;
  porcentajeCompletadas: number;
  peticion: number;
  queja: number;
  reclamo: number;
  sugerencia: number;
  tiempoPromedioRespuesta: number | null;
  tiempoPromedioCierre: number | null;
}

interface DashboardData {
  year: number;
  trimestres: Record<string, TrimestreStats>;
  total: TrimestreStats;
}

function getYears() {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= 2021; y--) {
    years.push(y);
  }
  return years;
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/dashboard?year=${year}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!data) return null;

  const t = data.total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Total PQRS"
          value={t.total}
          icon={<FileText className="h-5 w-5" />}
          color="text-gray-900"
          bg="bg-gray-100"
        />
        <SummaryCard
          label="En espera"
          value={t.enEspera}
          icon={<Hourglass className="h-5 w-5" />}
          color="text-yellow-700"
          bg="bg-yellow-100"
        />
        <SummaryCard
          label="En progreso"
          value={t.enProgreso}
          icon={<Clock className="h-5 w-5" />}
          color="text-blue-700"
          bg="bg-blue-100"
        />
        <SummaryCard
          label="Terminadas"
          value={t.terminado}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="text-green-700"
          bg="bg-green-100"
        />
        <SummaryCard
          label="% Completadas"
          value={`${t.porcentajeCompletadas}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          color="text-green-700"
          bg="bg-green-100"
        />
      </div>

      {/* Time cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-2">
            <Timer className="h-5 w-5" />
          </div>
          <p className="text-xs text-gray-500">Tiempo prom. respuesta</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {t.tiempoPromedioRespuesta !== null
              ? `${t.tiempoPromedioRespuesta} días`
              : "—"}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="text-xs text-gray-500">Tiempo prom. cierre</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {t.tiempoPromedioCierre !== null
              ? `${t.tiempoPromedioCierre} días`
              : "—"}
          </p>
        </div>
      </div>

      {/* Quarterly tracking table */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          Cuadro de seguimiento {year}
        </h2>
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap min-w-[160px]">
                  Métrica
                </th>
                <th className="text-center px-3 py-3 font-semibold text-gray-700">Q1</th>
                <th className="text-center px-3 py-3 font-semibold text-gray-700">Q2</th>
                <th className="text-center px-3 py-3 font-semibold text-gray-700">Q3</th>
                <th className="text-center px-3 py-3 font-semibold text-gray-700">Q4</th>
                <th className="text-center px-3 py-3 font-bold text-green-800 bg-green-50">Total</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow label="Total PQRS" field="total" data={data} bold />
              <MetricRow label="Peticiones" field="peticion" data={data} />
              <MetricRow label="Quejas" field="queja" data={data} />
              <MetricRow label="Reclamos" field="reclamo" data={data} />
              <MetricRow label="Sugerencias" field="sugerencia" data={data} />
              <MetricRow label="En espera" field="enEspera" data={data} />
              <MetricRow label="En progreso" field="enProgreso" data={data} />
              <MetricRow label="Terminadas" field="terminado" data={data} />
              <MetricRow label="% Completadas" field="porcentajeCompletadas" data={data} suffix="%" />
              <MetricRow label="Prom. respuesta (días)" field="tiempoPromedioRespuesta" data={data} nullable />
              <MetricRow label="Prom. cierre (días)" field="tiempoPromedioCierre" data={data} nullable />
            </tbody>
          </table>
        </div>
      </div>

      {/* Type distribution */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          Distribución por tipo
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TypeCard label="Peticiones" value={t.peticion} total={t.total} color="bg-blue-500" bg="bg-blue-50" textColor="text-blue-700" />
          <TypeCard label="Quejas" value={t.queja} total={t.total} color="bg-red-500" bg="bg-red-50" textColor="text-red-700" />
          <TypeCard label="Reclamos" value={t.reclamo} total={t.total} color="bg-orange-500" bg="bg-orange-50" textColor="text-orange-700" />
          <TypeCard label="Sugerencias" value={t.sugerencia} total={t.total} color="bg-green-500" bg="bg-green-50" textColor="text-green-700" />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
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

function TypeCard({
  label,
  value,
  total,
  color,
  bg,
  textColor,
}: {
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
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-xs ${textColor} opacity-70 mt-1`}>{pct}%</p>
    </div>
  );
}

function MetricRow({
  label,
  field,
  data,
  bold,
  suffix,
  nullable,
}: {
  label: string;
  field: keyof TrimestreStats;
  data: DashboardData;
  bold?: boolean;
  suffix?: string;
  nullable?: boolean;
}) {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  function formatVal(val: number | null): string {
    if (nullable && val === null) return "—";
    if (val === null) return "0";
    return `${val}${suffix || ""}`;
  }

  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className={`px-4 py-2.5 whitespace-nowrap ${bold ? "font-semibold text-gray-900" : "text-gray-600"}`}>
        {label}
      </td>
      {quarters.map((q) => (
        <td key={q} className="text-center px-3 py-2.5 text-gray-700">
          {formatVal(data.trimestres[q][field] as number | null)}
        </td>
      ))}
      <td className="text-center px-3 py-2.5 font-bold text-green-800 bg-green-50/50">
        {formatVal(data.total[field] as number | null)}
      </td>
    </tr>
  );
}
