"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  FileText,
  Loader2,
  ChevronRight,
  Clock,
  Hourglass,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

interface Pqrs {
  id: string;
  numero: number;
  tipoPqrs: string | null;
  asunto: string | null;
  descripcion: string;
  estado: string;
  fechaRecibido: string;
  bloque: number;
  apto: number;
  nombreResidente: string;
  creadoPor: { name: string } | null;
}

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

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const estadoConfig: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    text: string;
  }
> = {
  EN_ESPERA: {
    label: "En espera",
    icon: Hourglass,
    bg: "bg-yellow-100",
    text: "text-yellow-700",
  },
  EN_PROGRESO: {
    label: "En proceso",
    icon: Clock,
    bg: "bg-blue-100",
    text: "text-blue-700",
  },
  TERMINADO: {
    label: "Terminado",
    icon: CheckCircle2,
    bg: "bg-green-100",
    text: "text-green-700",
  },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getYears() {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= 2026; y--) {
    years.push(y);
  }
  return years;
}

interface PqrsListProps {
  role: string;
}

export function PqrsList({ role }: PqrsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const estadoFromUrl = searchParams.get("estado") || "";

  const [pqrs, setPqrs] = useState<Pqrs[]>([]);
  const [loading, setLoading] = useState(true);
  const [asuntoFilter, setAsuntoFilter] = useState("");
  const [year, setYear] = useState("");
  const [mes, setMes] = useState("");
  const [estadoFilter, setEstadoFilter] = useState(estadoFromUrl);
  const [searchBloque, setSearchBloque] = useState("");
  const [searchApto, setSearchApto] = useState("");
  const [searchNumero, setSearchNumero] = useState("");

  const isResidente = role === "RESIDENTE";
  const canCreate = role === "ADMIN";

  const [error, setError] = useState("");

  // Sync estado filter when URL changes
  useEffect(() => {
    if (estadoFromUrl) {
      setEstadoFilter(estadoFromUrl);
    }
  }, [estadoFromUrl]);

  const fetchPqrs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();

      if (estadoFilter && estadoFilter !== "todos") {
        params.set("estado", estadoFilter);
      } else if (!estadoFilter && !isResidente) {
        params.set("scope", "active");
      }

      if (asuntoFilter) params.set("asunto", asuntoFilter);
      if (year) params.set("year", year);
      if (mes) params.set("mes", mes);
      if (searchBloque) params.set("bloque", searchBloque);
      if (searchApto) params.set("apto", searchApto);
      if (searchNumero) params.set("numero", searchNumero);

      const res = await fetch(`/api/pqrs?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar PQRS");
      const data = await res.json();
      setPqrs(data);
    } catch {
      setError("No se pudieron cargar las PQRS.");
    } finally {
      setLoading(false);
    }
  }, [asuntoFilter, year, mes, isResidente, estadoFilter, searchBloque, searchApto, searchNumero]);

  useEffect(() => {
    fetchPqrs();
  }, [fetchPqrs]);

  const hasFilters = !!(year || mes || asuntoFilter || estadoFilter || searchBloque || searchApto || searchNumero);

  return (
    <div className="space-y-4">
      {/* === RESIDENTE: header + crear === */}
      {isResidente && (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Mis PQRS</h1>
            <Link
              href="/pqrs/nuevo"
              className="inline-flex items-center gap-2 bg-green-700 text-white font-bold px-4 py-2.5 rounded-xl hover:bg-green-800 transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              Crear
            </Link>
          </div>
        </>
      )}

      {/* === ADMIN/ASISTENTE/CONSEJO: header === */}
      {!isResidente && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex-1">PQRS</h1>
          {canCreate && (
            <Link
              href="/pqrs/nuevo"
              className="inline-flex items-center gap-2 bg-green-700 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-green-800 transition-colors text-sm"
            >
              <Plus className="h-4 w-4" />
              Nueva
            </Link>
          )}
        </div>
      )}

      {/* === ADMIN: búsqueda por número / bloque / apto === */}
      {!isResidente && (
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            placeholder="N° PQRS"
            value={searchNumero}
            onChange={(e) => setSearchNumero(e.target.value)}
            className="h-10 w-24 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          />
          <input
            type="number"
            placeholder="Bloque"
            value={searchBloque}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "" || (parseInt(val) >= 1 && parseInt(val) <= 12)) {
                setSearchBloque(val);
              }
            }}
            min={1}
            max={12}
            className="h-10 w-24 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          />
          <input
            type="text"
            placeholder="Apto"
            value={searchApto}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 3);
              setSearchApto(val);
            }}
            maxLength={3}
            className="h-10 w-24 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          />
        </div>
      )}

      {/* === Filtros === */}
      <div className="flex flex-wrap gap-2">
        {/* Estado: residente también puede filtrar */}
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
        >
          {isResidente ? (
            <>
              <option value="">Todas</option>
              <option value="EN_ESPERA">En espera</option>
              <option value="EN_PROGRESO">En proceso</option>
              <option value="TERMINADO">Terminadas</option>
            </>
          ) : (
            <>
              <option value="">Activas</option>
              <option value="todos">Todas</option>
              <option value="EN_ESPERA">En espera</option>
              <option value="EN_PROGRESO">En proceso</option>
              <option value="TERMINADO">Terminadas</option>
            </>
          )}
        </select>

        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
        >
          <option value="">Mes</option>
          {MESES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
        >
          <option value="">Año</option>
          {getYears().map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>

        {!isResidente && (
          <select
            value={asuntoFilter}
            onChange={(e) => setAsuntoFilter(e.target.value)}
            className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          >
            <option value="">Asunto</option>
            {ASUNTOS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={() => {
              setYear("");
              setMes("");
              setAsuntoFilter("");
              setEstadoFilter("");
              setSearchBloque("");
              setSearchApto("");
              setSearchNumero("");
            }}
            className="h-10 text-sm px-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-center py-16">
          <p className="text-red-600">{error}</p>
          <button onClick={fetchPqrs} className="mt-3 text-sm text-green-700 underline">Reintentar</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      )}

      {/* No results */}
      {!loading && pqrs.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500">
            {isResidente
              ? "No tienes solicitudes con los filtros seleccionados."
              : "No hay PQRS con los filtros seleccionados."}
          </p>
        </div>
      )}

      {!loading && pqrs.length > 0 && (
        <>
          <p className="text-sm text-gray-500">
            {pqrs.length} solicitud{pqrs.length !== 1 ? "es" : ""}
          </p>

          <div className="space-y-3">
            {pqrs.map((p) => {
              const ec = estadoConfig[p.estado];
              const EstadoIcon = ec?.icon || Clock;

              return (
                <Link key={p.id} href={`/pqrs/${p.id}`}>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-green-200 transition-all duration-200 group">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-gray-400">
                            #{p.numero}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ec?.bg || "bg-gray-100"} ${ec?.text || "text-gray-600"}`}
                          >
                            <EstadoIcon className="h-3 w-3" />
                            {ec?.label || p.estado}
                          </span>
                        </div>

                        <p className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">
                          {p.asunto || p.descripcion.substring(0, 80)}
                        </p>

                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {!isResidente && (
                            <span>
                              {p.nombreResidente} · B{p.bloque}-{p.apto}
                            </span>
                          )}
                          <span>{formatDate(p.fechaRecibido)}</span>
                        </div>
                      </div>

                      <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-green-600 transition-colors shrink-0 mt-1" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
