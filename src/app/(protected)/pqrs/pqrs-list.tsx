"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, Plus, Search } from "lucide-react";
import { EmptyState, StatusBadge } from "@/components/pqrs/design-system";

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

const ASUNTOS = ["AREA COMUN", "AREA PRIVADA", "CONTABILIDAD", "CONVIVENCIA", "HUMEDAD/CUBIERTA", "HUMEDAD/DEPOSITO", "HUMEDAD/VENTANAS", "HUMEDAD/FACHADA", "HUMEDAD/GARAJE"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function getYears() {
  const current = new Date().getFullYear();
  return Array.from({ length: Math.max(current - 2026 + 1, 1) }, (_, index) => current - index);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function stateLabel(state: string) {
  return ({ EN_ESPERA: "Radicada", EN_PROGRESO: "En proceso", TERMINADO: "Terminada" } as Record<string, string>)[state] || state;
}

export function PqrsList({ role }: { role: string }) {
  const searchParams = useSearchParams();
  const estadoFromUrl = searchParams.get("estado") || "";
  const [pqrs, setPqrs] = useState<Pqrs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [asuntoFilter, setAsuntoFilter] = useState("");
  const [year, setYear] = useState("");
  const [mes, setMes] = useState("");
  const [estadoFilter, setEstadoFilter] = useState(estadoFromUrl);
  const [searchBloque, setSearchBloque] = useState("");
  const [searchApto, setSearchApto] = useState("");
  const [searchNumero, setSearchNumero] = useState("");

  const isResidente = role === "RESIDENTE";
  const canCreate = role === "ADMIN" || role === "RESIDENTE";
  const canOperate = role === "ADMIN" || role === "ASISTENTE";

  useEffect(() => { if (estadoFromUrl) setEstadoFilter(estadoFromUrl); }, [estadoFromUrl]);

  const fetchPqrs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (estadoFilter && estadoFilter !== "todos") params.set("estado", estadoFilter);
      else if (!estadoFilter && !isResidente) params.set("scope", "active");
      if (asuntoFilter) params.set("asunto", asuntoFilter);
      if (year) params.set("year", year);
      if (mes) params.set("mes", mes);
      if (searchBloque) params.set("bloque", searchBloque);
      if (searchApto) params.set("apto", searchApto);
      if (searchNumero) params.set("numero", searchNumero);
      const res = await fetch(`/api/pqrs?${params.toString()}`);
      if (!res.ok) throw new Error("pqrs");
      setPqrs(await res.json());
    } catch {
      setError("No se pudieron cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }, [asuntoFilter, year, mes, isResidente, estadoFilter, searchBloque, searchApto, searchNumero]);

  useEffect(() => { fetchPqrs(); }, [fetchPqrs]);

  const clearFilters = () => {
    setYear(""); setMes(""); setAsuntoFilter(""); setEstadoFilter(""); setSearchBloque(""); setSearchApto(""); setSearchNumero("");
  };

  const hasFilters = Boolean(year || mes || asuntoFilter || estadoFilter || searchBloque || searchApto || searchNumero);

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="pqrs-eyebrow">{isResidente ? "CENTRO DE ESTADO" : canOperate ? "MODULO PQRS" : "CONSULTA PQRS"}</p>
          <h1 className="pqrs-title mt-2">{isResidente ? "Mis solicitudes" : "Solicitudes PQRS"}</h1>
          <p className="pqrs-subtitle mt-2">{isResidente ? "Radica nuevas solicitudes y revisa su avance." : "Busca, filtra y revisa el ciclo completo de cada solicitud."}</p>
        </div>
        {canCreate ? <Link href="/pqrs/nuevo" className="pqrs-button-primary gap-2"><Plus className="h-4 w-4" />Nueva solicitud</Link> : null}
      </div>

      <section className="pqrs-panel p-4">
        <div className="grid gap-2 md:grid-cols-7">
          {!isResidente ? <div className="relative md:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E8E93]" /><input value={searchNumero} onChange={(e) => setSearchNumero(e.target.value)} placeholder="Numero de radicado" className="pqrs-input h-10 pl-9" /></div> : null}
          {!isResidente ? <input value={searchBloque} onChange={(e) => setSearchBloque(e.target.value)} placeholder="Bloque" className="pqrs-input h-10" /> : null}
          {!isResidente ? <input value={searchApto} onChange={(e) => setSearchApto(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Apto" className="pqrs-input h-10" /> : null}
          <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="pqrs-input h-10 py-0"><option value="">{isResidente ? "Todas" : "Activas"}</option><option value="todos">Todas</option><option value="EN_ESPERA">Radicadas</option><option value="EN_PROGRESO">En proceso</option><option value="TERMINADO">Terminadas</option></select>
          <select value={mes} onChange={(e) => setMes(e.target.value)} className="pqrs-input h-10 py-0"><option value="">Mes</option>{MESES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="pqrs-input h-10 py-0"><option value="">Ano</option>{getYears().map((y) => <option key={y} value={String(y)}>{y}</option>)}</select>
          {!isResidente ? <select value={asuntoFilter} onChange={(e) => setAsuntoFilter(e.target.value)} className="pqrs-input h-10 py-0 md:col-span-2"><option value="">Asunto</option>{ASUNTOS.map((a) => <option key={a} value={a}>{a}</option>)}</select> : null}
        </div>
        {hasFilters ? <button onClick={clearFilters} className="mt-3 text-xs font-bold text-[#6E6E73] hover:text-[#1D1D1F]">Limpiar filtros</button> : null}
      </section>

      {error ? <EmptyState title="No fue posible cargar PQRS" description={error} /> : null}
      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#122545]" /></div> : null}
      {!loading && !error && pqrs.length === 0 ? <EmptyState title="No hay solicitudes" description="No hay PQRS que coincidan con los filtros seleccionados." /> : null}

      {!loading && !error && pqrs.length > 0 ? (
        <section className="pqrs-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/[0.06] p-5"><div><p className="pqrs-eyebrow">{pqrs.length} REGISTROS</p><h2 className="mt-1 text-lg font-extrabold">Listado de solicitudes</h2></div><FileText className="h-5 w-5 text-[#8E8E93]" /></div>
          <div className="overflow-x-auto">
            <table className="pqrs-table">
              <thead><tr><th>Radicado</th><th>Solicitud</th><th>{isResidente ? "Fecha" : "Residente"}</th><th>Estado</th><th>Accion</th></tr></thead>
              <tbody>{pqrs.map((p) => <tr key={p.id}><td><Link href={`/pqrs/${p.id}`} className="font-mono text-[11px] font-bold text-[#122545]">#{p.numero}</Link></td><td><p className="font-extrabold text-[#1D1D1F]">{p.asunto || p.tipoPqrs || "Solicitud"}</p><p className="mt-1 max-w-[420px] truncate text-xs text-[#6E6E73]">{p.descripcion}</p></td><td>{isResidente ? formatDate(p.fechaRecibido) : `${p.nombreResidente} · B${p.bloque}-${p.apto}`}</td><td><StatusBadge status={stateLabel(p.estado)} /></td><td><Link href={`/pqrs/${p.id}`} className="text-xs font-extrabold text-[#122545]">Ver detalle</Link></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
