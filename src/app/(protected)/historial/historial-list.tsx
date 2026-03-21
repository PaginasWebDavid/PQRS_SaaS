"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  ClipboardList,
  Frown,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  CheckCircle2,
  History,
} from "lucide-react";

interface Pqrs {
  id: string;
  numero: number;
  tipoPqrs: string;
  asunto: string;
  estado: string;
  fechaRecibido: string;
  fechaCierre: string | null;
  bloque: number;
  apto: number;
  nombreResidente: string;
  tiempoRespuestaCierre: number | null;
}

const tipoConfig: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeBg: string;
    badgeText: string;
  }
> = {
  PETICION: { label: "Petición", icon: ClipboardList, badgeBg: "bg-blue-100", badgeText: "text-blue-700" },
  QUEJA: { label: "Queja", icon: Frown, badgeBg: "bg-red-100", badgeText: "text-red-700" },
  RECLAMO: { label: "Reclamo", icon: AlertTriangle, badgeBg: "bg-orange-100", badgeText: "text-orange-700" },
  SUGERENCIA: { label: "Sugerencia", icon: Lightbulb, badgeBg: "bg-green-100", badgeText: "text-green-700" },
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

export function HistorialList() {
  const [pqrs, setPqrs] = useState<Pqrs[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState("");
  const [asuntoFilter, setAsuntoFilter] = useState("");
  const [year, setYear] = useState("");

  const [error, setError] = useState("");

  const fetchPqrs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("scope", "historial");
      if (tipo) params.set("tipo", tipo);
      if (asuntoFilter) params.set("asunto", asuntoFilter);
      if (year) params.set("year", year);

      const res = await fetch(`/api/pqrs?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar historial");
      const data = await res.json();
      setPqrs(data);
    } catch {
      setError("No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }, [tipo, asuntoFilter, year]);

  useEffect(() => {
    fetchPqrs();
  }, [fetchPqrs]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
          <History className="h-5 w-5 text-green-700" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Historial PQRS</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
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

        {(year || tipo || asuntoFilter) && (
          <button
            onClick={() => {
              setYear("");
              setTipo("");
              setAsuntoFilter("");
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
            <History className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500">No hay PQRS terminadas en el historial.</p>
        </div>
      )}

      {!loading && pqrs.length > 0 && (
        <>
          <p className="text-sm text-gray-500">
            {pqrs.length} PQRS cerrada{pqrs.length !== 1 ? "s" : ""}
          </p>

          <div className="space-y-3">
            {pqrs.map((p) => {
              const tc = tipoConfig[p.tipoPqrs];
              const TipoIcon = tc?.icon || FileText;

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
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Terminado
                          </span>
                        </div>

                        <p className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">
                          {p.asunto}
                        </p>

                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                          <span>
                            {p.nombreResidente} · T{p.bloque}-{p.apto}
                          </span>
                          <span>{formatDate(p.fechaRecibido)}</span>
                          {p.fechaCierre && (
                            <span className="text-green-600">
                              Cerrado: {formatDate(p.fechaCierre)}
                              {p.tiempoRespuestaCierre !== null &&
                                ` (${p.tiempoRespuestaCierre} día${p.tiempoRespuestaCierre !== 1 ? "s" : ""})`}
                            </span>
                          )}
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
