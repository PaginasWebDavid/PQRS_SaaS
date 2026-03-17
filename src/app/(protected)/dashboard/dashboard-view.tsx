"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

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
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const t = data.total;

  return (
    <div className="space-y-6">
      {/* Header + filtro */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Select value={year} onValueChange={(v) => v && setYear(v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getYears().map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="Total PQRS" value={t.total} />
        <SummaryCard label="En espera" value={t.enEspera} color="text-yellow-600" />
        <SummaryCard label="En progreso" value={t.enProgreso} color="text-blue-600" />
        <SummaryCard label="Terminadas" value={t.terminado} color="text-green-600" />
        <SummaryCard label="% Completadas" value={`${t.porcentajeCompletadas}%`} color="text-green-600" />
      </div>

      {/* Tarjetas de tiempo */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Tiempo prom. respuesta</p>
            <p className="text-2xl font-bold mt-1">
              {t.tiempoPromedioRespuesta !== null ? `${t.tiempoPromedioRespuesta} días` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Tiempo prom. cierre</p>
            <p className="text-2xl font-bold mt-1">
              {t.tiempoPromedioCierre !== null ? `${t.tiempoPromedioCierre} días` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cuadro de seguimiento por trimestres */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Cuadro de seguimiento {year}</h2>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap min-w-[160px]">Métrica</TableHead>
                <TableHead className="text-center">Q1</TableHead>
                <TableHead className="text-center">Q2</TableHead>
                <TableHead className="text-center">Q3</TableHead>
                <TableHead className="text-center">Q4</TableHead>
                <TableHead className="text-center font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Distribución por tipo - cards móvil */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Distribución por tipo</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TypeCard label="Peticiones" value={t.peticion} total={t.total} color="bg-blue-500" />
          <TypeCard label="Quejas" value={t.queja} total={t.total} color="bg-red-500" />
          <TypeCard label="Reclamos" value={t.reclamo} total={t.total} color="bg-orange-500" />
          <TypeCard label="Sugerencias" value={t.sugerencia} total={t.total} color="bg-green-500" />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color || ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function TypeCard({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-1">{value}</p>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{pct}%</p>
      </CardContent>
    </Card>
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
    <TableRow>
      <TableCell className={`whitespace-nowrap ${bold ? "font-semibold" : ""}`}>
        {label}
      </TableCell>
      {quarters.map((q) => (
        <TableCell key={q} className="text-center">
          {formatVal(data.trimestres[q][field] as number | null)}
        </TableCell>
      ))}
      <TableCell className="text-center font-semibold">
        {formatVal(data.total[field] as number | null)}
      </TableCell>
    </TableRow>
  );
}
