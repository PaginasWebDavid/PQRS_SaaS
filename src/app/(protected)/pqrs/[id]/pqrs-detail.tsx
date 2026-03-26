"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  Mail,
  Hourglass,
  Clock,
  CheckCircle2,
  Upload,
  FileDown,
  X,
  AlertCircle,
} from "lucide-react";

interface Pqrs {
  id: string;
  numero: number;
  medio: string;
  fechaRecibido: string;
  mes: string;
  bloque: number;
  apto: number;
  nombreResidente: string;
  tipoPqrs: string | null;
  asunto: string | null;
  subAsunto: string | null;
  descripcion: string;
  estado: string;
  numeroRadicacion: string | null;
  notaPrimerContacto: string | null;
  accionTomada: string | null;
  evidenciaCierre: string | null;
  evidenciaArchivoData: string | null;
  evidenciaArchivoNombre: string | null;
  evidenciaArchivoTipo: string | null;
  fechaPrimerContacto: string | null;
  tiempoRespuestaPrimerContacto: number | null;
  fechaCierre: string | null;
  tiempoRespuestaCierre: number | null;
  faseActual: number | null;
  faseTipo: string | null;
  fase1Inicio: string | null;
  fase2Inicio: string | null;
  fase3Inicio: string | null;
  fase4Inicio: string | null;
  fase5Inicio: string | null;
  creadoPor: { name: string; email: string } | null;
  gestionadoPor: { name: string } | null;
  historial: {
    id: string;
    estadoAntes: string | null;
    estadoDespues: string;
    nota: string | null;
    creadoAt: string;
  }[];
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

const FASES = [
  { num: 1, nombre: "Inspeccion de Campo", diasHabiles: 2 },
  { num: 2, nombre: "Adquisicion de insumos", diasHabiles: 2 },
  { num: 3, nombre: "Firma contrato proveedor", diasHabiles: 15 },
  { num: 4, nombre: "Ejecucion", diasHabiles: 5 },
  { num: 5, nombre: "Terminado", diasHabiles: 0 },
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
  EN_ESPERA: { label: "En espera", icon: Hourglass, bg: "bg-yellow-100", text: "text-yellow-700" },
  EN_PROGRESO: { label: "En proceso", icon: Clock, bg: "bg-blue-100", text: "text-blue-700" },
  TERMINADO: { label: "Terminado", icon: CheckCircle2, bg: "bg-green-100", text: "text-green-700" },
};

function fmtDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcBusinessDays(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  let days = 0;
  const current = new Date(start);
  while (current < now) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) days++;
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function getSemaphore(diasTranscurridos: number, diasPermitidos: number): string {
  if (diasPermitidos === 0) return "bg-green-500"; // Fase V terminado
  const ratio = diasTranscurridos / diasPermitidos;
  if (ratio <= 0.5) return "bg-green-500";
  if (ratio <= 1) return "bg-yellow-500";
  return "bg-red-500";
}

interface PqrsDetailProps {
  pqrsId: string;
  role: string;
}

export function PqrsDetail({ pqrsId, role }: PqrsDetailProps) {
  const router = useRouter();
  const isAdmin = role === "ADMIN";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pqrs, setPqrs] = useState<Pqrs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [asuntoSelected, setAsuntoSelected] = useState("");
  const [notaPrimerContacto, setNotaPrimerContacto] = useState("");
  const [registrandoContacto, setRegistrandoContacto] = useState(false);

  const [accionTomada, setAccionTomada] = useState("");
  const [evidenciaCierre, setEvidenciaCierre] = useState("");
  const [archivoData, setArchivoData] = useState<string | null>(null);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [archivoTipo, setArchivoTipo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchPqrs = useCallback(async () => {
    const res = await fetch(`/api/pqrs/${pqrsId}`);
    if (!res.ok) {
      setError("No se pudo cargar la PQRS");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setPqrs(data);
    setAccionTomada(data.accionTomada || "");
    setEvidenciaCierre(data.evidenciaCierre || "");
    setArchivoData(data.evidenciaArchivoData || null);
    setArchivoNombre(data.evidenciaArchivoNombre || null);
    setArchivoTipo(data.evidenciaArchivoTipo || null);
    setAsuntoSelected(data.asunto || "");
    setLoading(false);
  }, [pqrsId]);

  useEffect(() => {
    fetchPqrs();
  }, [fetchPqrs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("El archivo no puede superar 2MB");
      return;
    }
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al subir el archivo");
      setUploading(false);
      return;
    }
    const data = await res.json();
    setArchivoData(data.data);
    setArchivoNombre(data.nombre);
    setArchivoTipo(data.tipo);
    setUploading(false);
  }

  async function handlePrimerContacto() {
    setError("");
    setSuccess("");
    const nota = notaPrimerContacto.trim();
    if (!asuntoSelected) {
      setError("Debe seleccionar un asunto");
      return;
    }
    if (!nota) {
      setError("Debe escribir una nota de primer contacto");
      return;
    }
    setRegistrandoContacto(true);
    const res = await fetch(`/api/pqrs/${pqrsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primerContacto: true,
        notaPrimerContacto: nota,
        asunto: asuntoSelected,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al registrar primer contacto");
      setRegistrandoContacto(false);
      return;
    }
    const updated = await res.json();
    setPqrs(updated);
    setAccionTomada(updated.accionTomada || "");
    setEvidenciaCierre(updated.evidenciaCierre || "");
    setSuccess("Primer contacto registrado.");
    setRegistrandoContacto(false);
  }

  async function handleFaseChange(nuevaFase: number, tipo?: string) {
    setError("");
    setSuccess("");
    setSaving(true);
    const body: Record<string, unknown> = { actualizarFase: true, faseActual: nuevaFase };
    if (tipo) body.faseTipo = tipo;
    const res = await fetch(`/api/pqrs/${pqrsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al actualizar fase");
      setSaving(false);
      return;
    }
    const updated = await res.json();
    setPqrs(updated);
    setSuccess("Fase actualizada.");
    setSaving(false);
  }

  async function handleSave() {
    setError("");
    setSuccess("");
    setSaving(true);
    const res = await fetch(`/api/pqrs/${pqrsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accionTomada: accionTomada.trim() || null,
        evidenciaCierre: evidenciaCierre.trim() || null,
        evidenciaArchivoData: archivoData,
        evidenciaArchivoNombre: archivoNombre,
        evidenciaArchivoTipo: archivoTipo,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al guardar");
      setSaving(false);
      return;
    }
    const updated = await res.json();
    setPqrs(updated);
    setSuccess("Cambios guardados.");
    setSaving(false);
  }

  async function handleTerminar() {
    setError("");
    setSuccess("");
    const finalAccion = accionTomada.trim();
    if (!finalAccion) {
      setError("Debe completar la accion tomada antes de cerrar la PQRS");
      return;
    }
    if (!pqrs || pqrs.faseActual !== 5) {
      setError("La Fase V (Terminado) debe estar activa para cerrar la PQRS");
      return;
    }
    if (!evidenciaCierre.trim() && !archivoData) {
      setError("Debe diligenciar la evidencia de cierre antes de terminar");
      return;
    }
    setTerminating(true);
    const res = await fetch(`/api/pqrs/${pqrsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accionTomada: finalAccion,
        evidenciaCierre: evidenciaCierre.trim() || null,
        evidenciaArchivoData: archivoData,
        evidenciaArchivoNombre: archivoNombre,
        evidenciaArchivoTipo: archivoTipo,
        terminar: true,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al cerrar la PQRS");
      setTerminating(false);
      return;
    }
    const updated = await res.json();
    setPqrs(updated);
    setSuccess("PQRS cerrada. Se envio notificacion al residente.");
    setTerminating(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!pqrs) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{error || "PQRS no encontrada"}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-6 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Volver
        </button>
      </div>
    );
  }

  const isTerminado = pqrs.estado === "TERMINADO";
  const ec = estadoConfig[pqrs.estado];
  const EstadoIcon = ec?.icon || Clock;
  const faseV = pqrs.faseActual === 5;
  const evidenciaEnabled = faseV;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-gray-400">#{pqrs.numero}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ec?.bg} ${ec?.text}`}>
              <EstadoIcon className="h-3 w-3" />
              {ec?.label || pqrs.estado}
            </span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mt-1">
            {pqrs.asunto || pqrs.descripcion.substring(0, 60)}
          </h1>
        </div>
      </div>

      {/* Radicacion banner */}
      {pqrs.numeroRadicacion && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-green-600 font-medium">N° de radicacion</p>
            <p className="text-lg font-bold text-green-800">{pqrs.numeroRadicacion}</p>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-base font-bold text-gray-900">Informacion de la solicitud</h2>
        <InfoRow label="Residente" value={pqrs.nombreResidente} />
        <InfoRow label="Ubicacion" value={`Bloque ${pqrs.bloque} - Apto ${pqrs.apto}`} />
        {pqrs.asunto && <InfoRow label="Asunto" value={pqrs.asunto} />}
        <InfoRow label="Fecha recibido" value={fmtDateTime(pqrs.fechaRecibido)} />
        {pqrs.creadoPor && <InfoRow label="Registrado por" value={pqrs.creadoPor.name} />}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-sm font-medium text-gray-500 mb-1">Descripcion</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {pqrs.descripcion}
          </p>
        </div>
      </div>

      {/* Management card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-base font-bold text-gray-900">Gestion</h2>
        <InfoRow label="Estado" value={ec?.label || pqrs.estado} />
        {pqrs.fechaPrimerContacto && (
          <InfoRow
            label="Primer contacto"
            value={`${fmtDateTime(pqrs.fechaPrimerContacto)} (${pqrs.tiempoRespuestaPrimerContacto} dia${pqrs.tiempoRespuestaPrimerContacto !== 1 ? "s" : ""})`}
          />
        )}
        {pqrs.notaPrimerContacto && (
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Nota de primer contacto</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{pqrs.notaPrimerContacto}</p>
          </div>
        )}
        {pqrs.fechaCierre && (
          <InfoRow
            label="Fecha cierre"
            value={`${fmtDateTime(pqrs.fechaCierre)} (${pqrs.tiempoRespuestaCierre} dia${pqrs.tiempoRespuestaCierre !== 1 ? "s" : ""})`}
          />
        )}
        {pqrs.gestionadoPor && <InfoRow label="Gestionado por" value={pqrs.gestionadoPor.name} />}
        <div className="border-t border-gray-100" />

        {/* === EN_ESPERA: Asunto + Primer contacto form === */}
        {isAdmin && pqrs.estado === "EN_ESPERA" && (
          <>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
              <p className="font-medium">Tiempo de respuesta: 1 dia habil</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Asunto <span className="text-red-500">*</span>
              </label>
              <select
                value={asuntoSelected}
                onChange={(e) => setAsuntoSelected(e.target.value)}
                className="w-full h-12 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
              >
                <option value="">Seleccionar asunto</option>
                {ASUNTOS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Primer contacto <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="Escriba la nota de primer contacto..."
                value={notaPrimerContacto}
                onChange={(e) => setNotaPrimerContacto(e.target.value)}
                rows={3}
                className="w-full text-sm px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 transition-all resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
                {success}
              </div>
            )}

            <button
              onClick={handlePrimerContacto}
              disabled={registrandoContacto || !asuntoSelected || !notaPrimerContacto.trim()}
              className="w-full h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {registrandoContacto ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              Registrar primer contacto
            </button>
          </>
        )}

        {/* === EN_PROGRESO: Accion tomada + Fases + Evidencia === */}
        {pqrs.estado === "EN_PROGRESO" && isAdmin && (
          <>
            {/* Accion tomada */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Accion tomada <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="Describa las acciones realizadas"
                value={accionTomada}
                onChange={(e) => setAccionTomada(e.target.value)}
                rows={3}
                className="w-full text-sm px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 transition-all resize-none"
              />
            </div>

            {/* Phase panel - only visible to admin */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-900">Fases de gestion</h3>

              {/* Phase II/III selector if in phase 1 or not yet decided */}
              {(pqrs.faseActual === 1 || !pqrs.faseActual) && !pqrs.faseTipo && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                  <p className="font-medium mb-2">Seleccione el tipo de gestion:</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFaseChange(pqrs.faseActual || 1, "INSUMOS")}
                      disabled={saving}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      Fase II - Insumos
                    </button>
                    <button
                      onClick={() => handleFaseChange(pqrs.faseActual || 1, "PROVEEDOR")}
                      disabled={saving}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      Fase III - Proveedor
                    </button>
                  </div>
                </div>
              )}

              {FASES.map((fase) => {
                // Skip Phase II if PROVEEDOR path, skip Phase III if INSUMOS path
                if (fase.num === 2 && pqrs.faseTipo === "PROVEEDOR") return null;
                if (fase.num === 3 && pqrs.faseTipo === "INSUMOS") return null;
                if (fase.num === 2 && !pqrs.faseTipo) return null;
                if (fase.num === 3 && !pqrs.faseTipo) return null;

                const isActive = pqrs.faseActual === fase.num;
                const isCompleted = pqrs.faseActual !== null && pqrs.faseActual > fase.num;
                const faseInicio = fase.num === 1 ? pqrs.fase1Inicio :
                  fase.num === 2 ? pqrs.fase2Inicio :
                  fase.num === 3 ? pqrs.fase3Inicio :
                  fase.num === 4 ? pqrs.fase4Inicio :
                  pqrs.fase5Inicio;

                const diasTranscurridos = faseInicio ? calcBusinessDays(faseInicio) : 0;
                const semaphore = isActive && faseInicio
                  ? getSemaphore(diasTranscurridos, fase.diasHabiles)
                  : isCompleted ? "bg-green-500" : "bg-gray-300";

                return (
                  <div key={fase.num} className={`flex items-center gap-3 p-2 rounded-lg ${isActive ? "bg-white border border-green-200" : ""}`}>
                    <div className={`w-3 h-3 rounded-full shrink-0 ${semaphore}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${isActive ? "text-gray-900" : isCompleted ? "text-green-700" : "text-gray-400"}`}>
                        Fase {fase.num === 2 ? "II" : fase.num === 3 ? "III" : fase.num === 1 ? "I" : fase.num === 4 ? "IV" : "V"} — {fase.nombre}
                      </p>
                      {fase.diasHabiles > 0 && (
                        <p className="text-[10px] text-gray-400">
                          {fase.diasHabiles} dias habiles
                          {isActive && faseInicio ? ` (${diasTranscurridos}d transcurridos)` : ""}
                        </p>
                      )}
                    </div>
                    {isActive && pqrs.faseActual !== null && pqrs.faseActual < 5 && (
                      <button
                        onClick={() => {
                          // Next phase logic: skip 2 or 3 based on faseTipo
                          let next = fase.num + 1;
                          if (next === 2 && pqrs.faseTipo === "PROVEEDOR") next = 3;
                          if (next === 3 && pqrs.faseTipo === "INSUMOS") next = 4;
                          handleFaseChange(next);
                        }}
                        disabled={saving}
                        className="text-xs font-bold px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 shrink-0"
                      >
                        Avanzar
                      </button>
                    )}
                    {!isActive && !isCompleted && pqrs.faseActual === null && fase.num === 1 && (
                      <button
                        onClick={() => handleFaseChange(1)}
                        disabled={saving}
                        className="text-xs font-bold px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 shrink-0"
                      >
                        Iniciar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Evidencia de cierre - only enabled when Phase V is active */}
            <div className={`space-y-3 ${!evidenciaEnabled ? "opacity-50 pointer-events-none" : ""}`}>
              <label className="block text-sm font-medium text-gray-700">
                Evidencia de cierre {!evidenciaEnabled && "(disponible en Fase V)"}
              </label>
              <textarea
                placeholder="Describa la evidencia del cierre"
                value={evidenciaCierre}
                onChange={(e) => setEvidenciaCierre(e.target.value)}
                rows={3}
                className="w-full text-sm px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 transition-all resize-none"
              />
              {archivoData ? (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                  <FileDown className="h-5 w-5 text-green-600 shrink-0" />
                  <span className="text-sm text-green-800 truncate flex-1">{archivoNombre}</span>
                  <button
                    type="button"
                    onClick={() => { setArchivoData(null); setArchivoNombre(null); setArchivoTipo(null); }}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 h-12 text-sm font-medium text-gray-600 border-2 border-dashed border-gray-300 rounded-xl hover:border-green-400 hover:text-green-700 hover:bg-green-50 transition-all"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  {uploading ? "Subiendo..." : "Subir archivo (max. 2MB)"}
                </button>
              )}
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleUpload} />
            </div>

            {/* Messages */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
                {success.includes("notificacion") && <Mail className="h-4 w-4" />}
                {success}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || terminating}
                className="flex-1 h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Guardar
              </button>
              <button
                onClick={handleTerminar}
                disabled={saving || terminating || !faseV || (!evidenciaCierre.trim() && !archivoData)}
                className="flex-1 h-12 text-base font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {terminating ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                Terminar
              </button>
            </div>
          </>
        )}

        {/* === EN_PROGRESO: Read-only for non-admin === */}
        {pqrs.estado === "EN_PROGRESO" && !isAdmin && (
          <>
            {pqrs.accionTomada && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Accion tomada</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{pqrs.accionTomada}</p>
              </div>
            )}
          </>
        )}

        {/* === TERMINADO: Everything read-only === */}
        {isTerminado && (
          <>
            {pqrs.accionTomada && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Accion tomada</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{pqrs.accionTomada}</p>
              </div>
            )}
            {(pqrs.evidenciaCierre || pqrs.evidenciaArchivoData) && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">Evidencia de cierre</p>
                {pqrs.evidenciaCierre && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{pqrs.evidenciaCierre}</p>
                )}
                {pqrs.evidenciaArchivoData && (
                  <a
                    href={`/api/pqrs/${pqrs.id}/evidencia`}
                    download={pqrs.evidenciaArchivoNombre || "evidencia"}
                    className="inline-flex items-center gap-2 text-sm text-green-700 hover:text-green-800 bg-green-50 border border-green-200 rounded-xl px-4 py-2 transition-colors"
                  >
                    <FileDown className="h-4 w-4" />
                    {pqrs.evidenciaArchivoNombre || "Descargar archivo"}
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* History */}
      {pqrs.historial.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">Historial</h2>
          <div className="space-y-3">
            {pqrs.historial.map((h) => {
              const hec = estadoConfig[h.estadoDespues];
              const HIcon = hec?.icon || Clock;
              return (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                    {fmtDateTime(h.creadoAt)}
                  </span>
                  <div>
                    {h.estadoAntes && (
                      <span className="text-gray-500">
                        {estadoConfig[h.estadoAntes]?.label || h.estadoAntes} →{" "}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${hec?.bg} ${hec?.text}`}>
                      <HIcon className="h-3 w-3" />
                      {hec?.label || h.estadoDespues}
                    </span>
                    {h.nota && <p className="text-gray-500 mt-0.5">{h.nota}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-right text-gray-900 font-medium">{value}</span>
    </div>
  );
}
