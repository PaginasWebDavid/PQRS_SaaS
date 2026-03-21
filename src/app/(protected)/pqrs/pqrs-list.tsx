"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  FileText,
  Loader2,
  ClipboardList,
  Frown,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  Clock,
  Hourglass,
  CheckCircle2,
  Eye,
} from "lucide-react";

interface Pqrs {
  id: string;
  numero: number;
  tipoPqrs: string;
  asunto: string;
  descripcion: string;
  estado: string;
  fechaRecibido: string;
  bloque: number;
  apto: number;
  nombreResidente: string;
  creadoPor: { name: string } | null;
}

const tipoConfig: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeBg: string;
    badgeText: string;
    value: string;
  }
> = {
  PETICION: {
    label: "Petición",
    icon: ClipboardList,
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    value: "PETICION",
  },
  QUEJA: {
    label: "Queja",
    icon: Frown,
    badgeBg: "bg-red-100",
    badgeText: "text-red-700",
    value: "QUEJA",
  },
  RECLAMO: {
    label: "Reclamo",
    icon: AlertTriangle,
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    value: "RECLAMO",
  },
  SUGERENCIA: {
    label: "Sugerencia",
    icon: Lightbulb,
    badgeBg: "bg-green-100",
    badgeText: "text-green-700",
    value: "SUGERENCIA",
  },
};

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
    label: "En progreso",
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
  for (let y = current; y >= 2021; y--) {
    years.push(y);
  }
  return years;
}

const tipoList = [
  tipoConfig.PETICION,
  tipoConfig.QUEJA,
  tipoConfig.RECLAMO,
  tipoConfig.SUGERENCIA,
];

interface PqrsListProps {
  role: string;
}

export function PqrsList({ role }: PqrsListProps) {
  const searchParams = useSearchParams();
  const estadoFromUrl = searchParams.get("estado") || "";

  const [pqrs, setPqrs] = useState<Pqrs[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState("");
  const [asuntoFilter, setAsuntoFilter] = useState("");
  const [year, setYear] = useState("");
  const [estadoFilter, setEstadoFilter] = useState(estadoFromUrl);
  const [seguimiento, setSeguimiento] = useState(false);

  const isResidente = role === "RESIDENTE";
  const canCreate = !isResidente && role === "ADMIN";

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

      // If a specific estado filter is set, use it directly (no scope)
      if (estadoFilter && estadoFilter !== "todos") {
        params.set("estado", estadoFilter);
      } else if (!estadoFilter && !isResidente) {
        // Default: non-residents see active only
        params.set("scope", "active");
      }

      if (tipo) params.set("tipo", tipo);
      if (asuntoFilter) params.set("asunto", asuntoFilter);
      if (year) params.set("year", year);
      if (isResidente && seguimiento) {
        params.set("estado", "EN_PROGRESO");
      }

      const res = await fetch(`/api/pqrs?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar PQRS");
      const data = await res.json();
      setPqrs(data);
    } catch {
      setError("No se pudieron cargar las PQRS.");
    } finally {
      setLoading(false);
    }
  }, [tipo, asuntoFilter, year, isResidente, seguimiento, estadoFilter]);

  useEffect(() => {
    fetchPqrs();
  }, [fetchPqrs]);

  // Empty state for resident (no PQRS at all)
  if (!loading && pqrs.length === 0 && isResidente && !tipo && !year && !seguimiento) {
    return (
      <div className="space-y-6">
        {/* Type icons for creating */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Mis PQRS</h1>
          <p className="text-gray-500 mb-4">Selecciona el tipo de solicitud que deseas crear:</p>
          <div className="grid grid-cols-4 gap-3">
            {tipoList.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.value}
                  href={`/pqrs/nuevo?tipo=${t.value}`}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-transparent ${t.badgeBg} hover:border-current ${t.badgeText} transition-all hover:shadow-md`}
                >
                  <Icon className="h-8 w-8" />
                  <span className="text-xs font-bold text-center">{t.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <FileText className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            No tienes solicitudes aún
          </h2>
          <p className="text-gray-500 max-w-sm">
            Selecciona un tipo arriba para crear tu primera solicitud
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resident: 4 type icons + Seguimiento */}
      {isResidente && (
        <>
          <h1 className="text-2xl font-bold text-gray-900">Mis PQRS</h1>

          {/* 4x1 type icons */}
          <div className="grid grid-cols-4 gap-2">
            {tipoList.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={t.value}
                  href={`/pqrs/nuevo?tipo=${t.value}`}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-transparent ${t.badgeBg} hover:border-current ${t.badgeText} transition-all hover:shadow-md`}
                >
                  <Icon className="h-7 w-7" />
                  <span className="text-[11px] font-bold text-center leading-tight">{t.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Seguimiento button */}
          <button
            onClick={() => setSeguimiento(!seguimiento)}
            className={`inline-flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl transition-colors text-sm ${
              seguimiento
                ? "bg-green-800 text-white"
                : "bg-green-700 text-white hover:bg-green-800"
            }`}
          >
            <Eye className="h-4 w-4" />
            {seguimiento ? "Ver todas" : "Seguimiento"}
          </button>
        </>
      )}

      {/* Non-resident header */}
      {!isResidente && (
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {estadoFilter === "EN_ESPERA"
              ? "PQRS En Espera"
              : estadoFilter === "EN_PROGRESO"
                ? "PQRS En Progreso"
                : estadoFilter === "TERMINADO"
                  ? "PQRS Terminadas"
                  : estadoFilter === "todos"
                    ? "Todas las PQRS"
                    : "PQRS Activas"}
          </h1>
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {!isResidente && (
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          >
            <option value="">Activas</option>
            <option value="todos">Todas</option>
            <option value="EN_ESPERA">En espera</option>
            <option value="EN_PROGRESO">En progreso</option>
            <option value="TERMINADO">Terminadas</option>
          </select>
        )}

        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
        >
          <option value="">Año</option>
          {getYears().map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
        >
          <option value="">Tipo</option>
          <option value="PETICION">Petición</option>
          <option value="QUEJA">Queja</option>
          <option value="RECLAMO">Reclamo</option>
          <option value="SUGERENCIA">Sugerencia</option>
        </select>

        <select
          value={asuntoFilter}
          onChange={(e) => setAsuntoFilter(e.target.value)}
          className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
        >
          <option value="">Asunto</option>
          <option value="Área común">Área común</option>
          <option value="Convivencia">Convivencia</option>
          <option value="Humedad">Humedad</option>
          <option value="Iluminación">Iluminación</option>
        </select>

        {(year || tipo || asuntoFilter || estadoFilter) && (
          <button
            onClick={() => {
              setYear("");
              setTipo("");
              setAsuntoFilter("");
              setEstadoFilter("");
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
            {isResidente && seguimiento
              ? "No tienes PQRS en proceso en este momento."
              : isResidente
                ? "No se encontraron PQRS con los filtros seleccionados."
                : "No hay PQRS activas en este momento."}
          </p>
        </div>
      )}

      {!loading && pqrs.length > 0 && (
        <>
          <p className="text-sm text-gray-500">
            {pqrs.length} solicitud{pqrs.length !== 1 ? "es" : ""}
            {seguimiento ? " en proceso" : ""}
          </p>

          <div className="space-y-3">
            {pqrs.map((p) => {
              const tc = tipoConfig[p.tipoPqrs];
              const ec = estadoConfig[p.estado];
              const TipoIcon = tc?.icon || FileText;
              const EstadoIcon = ec?.icon || Clock;

              return (
                <Link key={p.id} href={`/pqrs/${p.id}`}>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-green-200 transition-all duration-200 group">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tc?.badgeBg || "bg-gray-100"} ${tc?.badgeText || "text-gray-600"}`}
                      >
                        <TipoIcon className="h-6 w-6" />
                      </div>

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
                          {p.asunto}
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
