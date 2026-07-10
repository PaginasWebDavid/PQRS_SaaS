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
  evidenciaArchivoUrl: string | null;
  evidenciaArchivoPath: string | null;
  evidenciaArchivoNombre: string | null;
  evidenciaArchivoTipo: string | null;
  evidenciaArchivoSize: number | null;
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
  fase1Nota: string | null;
  fase2Nota: string | null;
  fase3Nota: string | null;
  fase4Nota: string | null;
  fase5Inicio: string | null;
  queSeHizoParaCerrar: string | null;
  creadoPor: { name: string; email: string } | null;
  gestionadoPor: { name: string } | null;
  historial: {
    id: string;
    estadoAntes: string | null;
    estadoDespues: string;
    nota: string | null;
    creadoAt: string;
  }[];
  fotos: { id: string; data: string | null; url: string | null; storagePath: string | null; nombre: string; tipo: string; size: number | null; orden: number }[];
}

const ASUNTOS = [
  "AREA COMUN",
  "AREA PRIVADA",
  "CONTABILIDAD",
  "CONVIVENCIA",
  "HUMEDAD/CUBIERTA",
  "HUMEDAD/DEPOSITO",
  "HUMEDAD/VENTANAS",
  "HUMEDAD/FACHADA",
  "HUMEDAD/GARAJE",
];

const FASES = [
  { num: 1, nombre: "Inspección de Campo", diasHabiles: 2 },
  { num: 2, nombre: "Adquisición de insumos", diasHabiles: 2 },
  { num: 3, nombre: "Firma contrato proveedor", diasHabiles: 15 },
  { num: 4, nombre: "Ejecución", diasHabiles: 5 },
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
  EN_ESPERA: { label: "En espera", icon: Hourglass, bg: "bg-warning/10", text: "text-warning" },
  EN_PROGRESO: { label: "En proceso", icon: Clock, bg: "bg-accent", text: "text-primary" },
  TERMINADO: { label: "Terminado", icon: CheckCircle2, bg: "bg-success/10", text: "text-success" },
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
  if (diasPermitidos === 0) return "bg-success/100"; // Fase V terminado
  const ratio = diasTranscurridos / diasPermitidos;
  if (ratio <= 0.5) return "bg-success/100";
  if (ratio <= 1) return "bg-warning/100";
  return "bg-destructive/100";
}

interface PqrsDetailProps {
  pqrsId: string;
  role: string;
}

export function PqrsDetail({ pqrsId, role }: PqrsDetailProps) {
  const router = useRouter();
  const isAdmin = role === "ADMIN";
  const isResidente = role === "RESIDENTE";

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
  const [queSeHizoParaCerrar, setQueSeHizoParaCerrar] = useState("");
  const [faseNotas, setFaseNotas] = useState<Record<number, string>>({ 1: "", 2: "", 3: "", 4: "" });
  const [evidenciaCierre, setEvidenciaCierre] = useState("");
  const [archivoData, setArchivoData] = useState<string | null>(null);
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null);
  const [archivoPath, setArchivoPath] = useState<string | null>(null);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [archivoTipo, setArchivoTipo] = useState<string | null>(null);
  const [archivoSize, setArchivoSize] = useState<number | null>(null);
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
    setFaseNotas({
      1: data.fase1Nota || "",
      2: data.fase2Nota || "",
      3: data.fase3Nota || "",
      4: data.fase4Nota || "",
    });
    setArchivoData(data.evidenciaArchivoData || null);
    setArchivoUrl(data.evidenciaArchivoUrl || null);
    setArchivoPath(data.evidenciaArchivoPath || null);
    setArchivoNombre(data.evidenciaArchivoNombre || null);
    setArchivoTipo(data.evidenciaArchivoTipo || null);
    setArchivoSize(data.evidenciaArchivoSize || null);
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
    setArchivoData(null);
    setArchivoUrl(data.url || null);
    setArchivoPath(data.path || null);
    setArchivoNombre(data.nombre);
    setArchivoTipo(data.tipo);
    setArchivoSize(data.size || null);
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

  async function handleFaseChange(nuevaFase: number, tipo?: string, notaFaseActual?: string) {
    setError("");
    setSuccess("");
    setSaving(true);
    const body: Record<string, unknown> = { actualizarFase: true, faseActual: nuevaFase };
    if (tipo) body.faseTipo = tipo;
    // Save the note for the current (departing) fase
    if (notaFaseActual !== undefined && pqrs?.faseActual) {
      body[`fase${pqrs.faseActual}Nota`] = notaFaseActual;
    }
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
    setFaseNotas({
      1: updated.fase1Nota || "",
      2: updated.fase2Nota || "",
      3: updated.fase3Nota || "",
      4: updated.fase4Nota || "",
    });
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
        asunto: asuntoSelected || undefined,
        accionTomada: accionTomada.trim() || null,
        evidenciaCierre: evidenciaCierre.trim() || null,
        evidenciaArchivoData: archivoData,
        evidenciaArchivoUrl: archivoUrl,
        evidenciaArchivoPath: archivoPath,
        evidenciaArchivoNombre: archivoNombre,
        evidenciaArchivoTipo: archivoTipo,
        evidenciaArchivoSize: archivoSize,
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
      setError("Debe completar la acción tomada antes de cerrar la PQRS");
      return;
    }
    if (!pqrs || (!faseV && !queSeHizoParaCerrar.trim())) {
      setError("Complete todas las fases o indique qué se hizo para cerrar la PQRS");
      return;
    }
    if (!evidenciaCierre.trim() && !archivoData && !archivoUrl && !archivoPath) {
      setError("Debe diligenciar la evidencia de cierre antes de terminar");
      return;
    }
    setTerminating(true);
    const res = await fetch(`/api/pqrs/${pqrsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accionTomada: finalAccion,
        queSeHizoParaCerrar: queSeHizoParaCerrar.trim() || null,
        evidenciaCierre: evidenciaCierre.trim() || null,
        evidenciaArchivoData: archivoData,
        evidenciaArchivoUrl: archivoUrl,
        evidenciaArchivoPath: archivoPath,
        evidenciaArchivoNombre: archivoNombre,
        evidenciaArchivoTipo: archivoTipo,
        evidenciaArchivoSize: archivoSize,
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
    setSuccess("PQRS cerrada. Se envió notificación al residente.");
    setTerminating(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  if (!pqrs) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">{error || "PQRS no encontrada"}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-6 py-2 text-sm font-medium text-muted-foreground border border-input rounded-xl hover:bg-muted transition-colors"
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
  const cierreTempranoValido = !faseV && queSeHizoParaCerrar.trim().length > 0;
  const evidenciaEnabled = faseV || cierreTempranoValido;
  const hasArchivo = Boolean(archivoData || archivoUrl || archivoPath);
  const hasEvidenciaArchivo = Boolean(pqrs.evidenciaArchivoData || pqrs.evidenciaArchivoUrl || pqrs.evidenciaArchivoPath);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">#{pqrs.numero}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ec?.bg} ${ec?.text}`}>
              <EstadoIcon className="h-3 w-3" />
              {ec?.label || pqrs.estado}
            </span>
          </div>
          <h1 className="text-lg font-bold text-foreground mt-1">
            {pqrs.asunto || pqrs.descripcion.substring(0, 60)}
          </h1>
        </div>
      </div>

      {/* Radicacion banner */}
      {pqrs.numeroRadicacion && (
        <div className="bg-success/10 border border-success/30 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-success font-medium">N° de radicación</p>
            <p className="text-lg font-bold text-success">{pqrs.numeroRadicacion}</p>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
        <h2 className="text-base font-bold text-foreground">Información de la solicitud</h2>
        <InfoRow label="Residente" value={pqrs.nombreResidente} />
        <InfoRow label="Ubicación" value={`Bloque ${pqrs.bloque} - Apto ${pqrs.apto}`} />
        {pqrs.asunto && <InfoRow label="Asunto" value={pqrs.asunto} />}
        <InfoRow label="Fecha recibido" value={fmtDateTime(pqrs.fechaRecibido)} />
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium text-muted-foreground mb-1">Descripción</p>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {pqrs.descripcion}
          </p>
        </div>
        {pqrs.fotos && pqrs.fotos.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium text-muted-foreground mb-2">Fotos adjuntas</p>
            <div className="grid grid-cols-3 gap-2">
              {pqrs.fotos.map((foto) => (
                <a
                  key={foto.id}
                  href={`/api/pqrs/${pqrs.id}/fotos/${foto.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl overflow-hidden border border-border aspect-square hover:opacity-90 transition-opacity"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/pqrs/${pqrs.id}/fotos/${foto.id}`}
                    alt={foto.nombre}
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Management card */}
      <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
        <h2 className="text-base font-bold text-foreground">Gestión</h2>
        <InfoRow label="Estado" value={ec?.label || pqrs.estado} />
        {pqrs.fechaPrimerContacto && (
          <InfoRow
            label="Primer contacto"
            value={`${fmtDateTime(pqrs.fechaPrimerContacto)}`}
          />
        )}
        {pqrs.notaPrimerContacto && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Nota de primer contacto</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{pqrs.notaPrimerContacto}</p>
          </div>
        )}
        {pqrs.fechaCierre && (
          <InfoRow
            label="Fecha cierre"
            value={`${fmtDateTime(pqrs.fechaCierre)} (${pqrs.tiempoRespuestaCierre} dia${pqrs.tiempoRespuestaCierre !== 1 ? "s" : ""})`}
          />
        )}
        {/* === EN_ESPERA: Asunto + Primer contacto form === */}
        {isAdmin && pqrs.estado === "EN_ESPERA" && (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Asunto <span className="text-destructive">*</span>
              </label>
              <select
                value={asuntoSelected}
                onChange={(e) => setAsuntoSelected(e.target.value)}
                className="w-full h-12 text-sm px-3 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                <option value="">Seleccionar asunto</option>
                {ASUNTOS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Primer contacto <span className="text-destructive">*</span>
              </label>
              <textarea
                placeholder="Escriba la nota de primer contacto..."
                value={notaPrimerContacto}
                onChange={(e) => setNotaPrimerContacto(e.target.value)}
                rows={3}
                className="w-full text-sm px-4 py-3 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center justify-center gap-2 text-sm text-success bg-success/10 border border-success/30 rounded-xl p-3">
                {success}
              </div>
            )}

            <button
              onClick={handlePrimerContacto}
              disabled={registrandoContacto || !asuntoSelected || !notaPrimerContacto.trim()}
              className="w-full h-12 text-base font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
            {/* Cambiar asunto */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Asunto
              </label>
              <select
                value={asuntoSelected}
                onChange={(e) => setAsuntoSelected(e.target.value)}
                className="w-full h-12 text-sm px-3 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              >
                {ASUNTOS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Accion tomada */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Acción tomada <span className="text-destructive">*</span>
              </label>
              <textarea
                placeholder="Describa las acciones realizadas"
                value={accionTomada}
                onChange={(e) => setAccionTomada(e.target.value)}
                rows={3}
                className="w-full text-sm px-4 py-3 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </div>

            {/* Phase panel - only visible to admin */}
            <div className="bg-muted border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">Fases de gestión</h3>

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
                const savedNota = fase.num === 1 ? pqrs.fase1Nota :
                  fase.num === 2 ? pqrs.fase2Nota :
                  fase.num === 3 ? pqrs.fase3Nota :
                  fase.num === 4 ? pqrs.fase4Nota : null;

                const diasTranscurridos = faseInicio ? calcBusinessDays(faseInicio) : 0;
                const semaphore = isActive && faseInicio
                  ? getSemaphore(diasTranscurridos, fase.diasHabiles)
                  : isCompleted ? "bg-success/100" : "bg-muted";

                const isNested = fase.num === 2 || fase.num === 3;
                // "Avanzar" requires: nota filled + (if fase 1) faseTipo selected
                const notaActual = faseNotas[fase.num] || "";
                const canAdvance = notaActual.trim().length > 0 &&
                  (fase.num !== 1 || !!pqrs.faseTipo);

                return (
                  <div key={fase.num} className={isNested ? "ml-6 border-l-2 border-border pl-3" : ""}>
                    <div className={`flex items-center gap-3 p-2 rounded-lg ${isActive ? "bg-white border border-success/30" : ""}`}>
                      <div className={`w-3 h-3 rounded-full shrink-0 ${semaphore}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${isActive ? "text-foreground" : isCompleted ? "text-success" : "text-muted-foreground"}`}>
                          Fase {fase.num === 2 ? "II" : fase.num === 3 ? "III" : fase.num === 1 ? "I" : fase.num === 4 ? "IV" : "V"} — {fase.nombre}
                        </p>
                        {fase.diasHabiles > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            {fase.diasHabiles} días hábiles
                            {isActive && faseInicio ? ` (${diasTranscurridos}d transcurridos)` : ""}
                          </p>
                        )}
                      </div>
                      {isActive && pqrs.faseActual !== null && pqrs.faseActual < 5 && (
                        <button
                          onClick={() => {
                            let next = fase.num + 1;
                            if (next === 2 && pqrs.faseTipo === "PROVEEDOR") next = 3;
                            if (next === 3 && pqrs.faseTipo === "INSUMOS") next = 4;
                            handleFaseChange(next, undefined, notaActual);
                          }}
                          disabled={saving || !canAdvance}
                          className="text-xs font-bold px-3 py-1 bg-primary text-white rounded-lg hover:bg-primary disabled:opacity-50 shrink-0"
                          title={!notaActual.trim() ? "Escriba una nota antes de avanzar" : (fase.num === 1 && !pqrs.faseTipo) ? "Seleccione Fase II o III antes de avanzar" : ""}
                        >
                          Avanzar
                        </button>
                      )}
                      {!isActive && !isCompleted && pqrs.faseActual === null && fase.num === 1 && (
                        <button
                          onClick={() => handleFaseChange(1)}
                          disabled={saving}
                          className="text-xs font-bold px-3 py-1 bg-primary text-white rounded-lg hover:bg-primary disabled:opacity-50 shrink-0"
                        >
                          Iniciar
                        </button>
                      )}
                    </div>

                    {/* Nota de la fase activa (obligatoria para avanzar) */}
                    {isActive && fase.num !== 5 && (
                      <div className="mt-2 px-2">
                        <textarea
                          placeholder={`Nota de ${fase.nombre} (obligatoria para avanzar)`}
                          value={notaActual}
                          onChange={(e) => setFaseNotas(prev => ({ ...prev, [fase.num]: e.target.value }))}
                          rows={2}
                          className="w-full text-xs px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none bg-white"
                        />
                      </div>
                    )}

                    {/* Nota guardada de fase completada (solo lectura) */}
                    {isCompleted && savedNota && (
                      <div className="mt-1 px-2">
                        <p className="text-[10px] text-muted-foreground whitespace-pre-wrap italic">{savedNota}</p>
                      </div>
                    )}

                    {/* Selector de tipo (Insumos / Proveedor) — debajo de Fase I, requiere nota primero */}
                    {fase.num === 1 && isActive && !pqrs.faseTipo && (
                      <div className="ml-6 border-l-2 border-border pl-3 mt-2">
                        <div className={`bg-accent border border-accent rounded-lg p-3 text-sm text-primary ${!notaActual.trim() ? "opacity-50 pointer-events-none" : ""}`}>
                          <p className="font-medium mb-1">
                            {!notaActual.trim()
                              ? "Escriba una nota de Fase I para continuar"
                              : "Seleccione el tipo de gestión:"}
                          </p>
                          {notaActual.trim() && (
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handleFaseChange(pqrs.faseActual || 1, "INSUMOS", notaActual)}
                                disabled={saving}
                                className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                              >
                                Fase II - Insumos
                              </button>
                              <button
                                onClick={() => handleFaseChange(pqrs.faseActual || 1, "PROVEEDOR", notaActual)}
                                disabled={saving}
                                className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
                              >
                                Fase III - Proveedor
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cierre temprano: campo obligatorio si no se completaron todas las fases */}
            {!faseV && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  ¿Qué se hizo para cerrar? {cierreTempranoValido ? "" : <span className="text-destructive">*</span>}
                </label>
                <p className="text-xs text-muted-foreground">Requerido si no se completaron todas las fases de gestión.</p>
                <textarea
                  placeholder="Describa qué se hizo para cerrar la PQRS sin completar todas las fases"
                  value={queSeHizoParaCerrar}
                  onChange={(e) => setQueSeHizoParaCerrar(e.target.value)}
                  rows={3}
                  className="w-full text-sm px-4 py-3 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                />
              </div>
            )}

            {/* Evidencia de cierre - only enabled when Phase V is active or cierre temprano is valid */}
            <div className={`space-y-3 ${!evidenciaEnabled ? "opacity-50 pointer-events-none" : ""}`}>
              <label className="block text-sm font-medium text-foreground">
                Evidencia de cierre {!evidenciaEnabled && "(complete las fases o indique que se hizo para cerrar)"}
              </label>
              <textarea
                placeholder="Describa la evidencia del cierre"
                value={evidenciaCierre}
                onChange={(e) => setEvidenciaCierre(e.target.value)}
                rows={3}
                className="w-full text-sm px-4 py-3 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
              {hasArchivo ? (
                <div className="flex items-center gap-3 bg-success/10 border border-success/30 rounded-xl p-3">
                  <FileDown className="h-5 w-5 text-success shrink-0" />
                  <span className="text-sm text-success truncate flex-1">{archivoNombre}</span>
                  <button
                    type="button"
                    onClick={() => { setArchivoData(null); setArchivoUrl(null); setArchivoPath(null); setArchivoNombre(null); setArchivoTipo(null); setArchivoSize(null); }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 h-12 text-sm font-medium text-muted-foreground border-2 border-dashed border-input rounded-xl hover:border-success hover:text-success hover:bg-success/10 transition-all"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  {uploading ? "Subiendo..." : "Subir archivo (max. 2MB)"}
                </button>
              )}
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={handleUpload} />
            </div>

            {/* Messages */}
            {error && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center justify-center gap-2 text-sm text-success bg-success/10 border border-success/30 rounded-xl p-3">
                {success.includes("notificación") && <Mail className="h-4 w-4" />}
                {success}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || terminating}
                className="flex-1 h-12 text-base font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Guardar
              </button>
              <button
                onClick={handleTerminar}
                disabled={saving || terminating || (!faseV && !queSeHizoParaCerrar.trim()) || (!evidenciaCierre.trim() && !hasArchivo)}
                className="flex-1 h-12 text-base font-bold text-white bg-destructive rounded-xl hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
            {/* Residente: mostrar nota de Fase IV como "En ejecucion" */}
            {isResidente && pqrs.fase4Nota && (
              <div className="bg-accent border border-accent rounded-xl p-4">
                <p className="text-sm font-bold text-primary mb-1">En ejecución</p>
                <p className="text-sm text-primary whitespace-pre-wrap">{pqrs.fase4Nota}</p>
              </div>
            )}
            {pqrs.accionTomada && !isResidente && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Acción tomada</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{pqrs.accionTomada}</p>
              </div>
            )}
            {/* Fases en solo lectura para CONSEJO/ASISTENTE */}
            {!isAdmin && !isResidente && pqrs.faseActual !== null && (
              <div className="bg-muted border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-foreground">Fases de gestión</h3>
                {FASES.map((fase) => {
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
                  const savedNota = fase.num === 1 ? pqrs.fase1Nota :
                    fase.num === 2 ? pqrs.fase2Nota :
                    fase.num === 3 ? pqrs.fase3Nota :
                    fase.num === 4 ? pqrs.fase4Nota : null;
                  const diasTranscurridos = faseInicio ? calcBusinessDays(faseInicio) : 0;
                  const semaphore = isActive && faseInicio
                    ? getSemaphore(diasTranscurridos, fase.diasHabiles)
                    : isCompleted ? "bg-success/100" : "bg-muted";
                  const isNested = fase.num === 2 || fase.num === 3;
                  return (
                    <div key={fase.num} className={isNested ? "ml-6 border-l-2 border-border pl-3" : ""}>
                      <div className={`flex items-center gap-3 p-2 rounded-lg ${isActive ? "bg-white border border-success/30" : ""}`}>
                        <div className={`w-3 h-3 rounded-full shrink-0 ${semaphore}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${isActive ? "text-foreground" : isCompleted ? "text-success" : "text-muted-foreground"}`}>
                            Fase {fase.num === 2 ? "II" : fase.num === 3 ? "III" : fase.num === 1 ? "I" : fase.num === 4 ? "IV" : "V"} — {fase.nombre}
                          </p>
                          {fase.diasHabiles > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {fase.diasHabiles} días hábiles
                              {isActive && faseInicio ? ` (${diasTranscurridos}d transcurridos)` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      {savedNota && (
                        <div className="px-2 mt-1">
                          <p className="text-[10px] text-muted-foreground whitespace-pre-wrap italic">{savedNota}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* === TERMINADO: Everything read-only === */}
        {isTerminado && (
          <>
            {pqrs.accionTomada && !isResidente && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Acción tomada</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{pqrs.accionTomada}</p>
              </div>
            )}
            {(pqrs.evidenciaCierre || hasEvidenciaArchivo) && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Evidencia de cierre</p>
                {pqrs.evidenciaCierre && (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{pqrs.evidenciaCierre}</p>
                )}
                {hasEvidenciaArchivo && (
                  <a
                    href={`/api/pqrs/${pqrs.id}/evidencia`}
                    download={pqrs.evidenciaArchivoNombre || "evidencia"}
                    className="inline-flex items-center gap-2 text-sm text-success hover:text-success bg-success/10 border border-success/30 rounded-xl px-4 py-2 transition-colors"
                  >
                    <FileDown className="h-4 w-4" />
                    {pqrs.evidenciaArchivoNombre || "Descargar archivo"}
                  </a>
                )}
              </div>
            )}
            {pqrs.queSeHizoParaCerrar && !isResidente && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Qué se hizo para cerrar</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{pqrs.queSeHizoParaCerrar}</p>
              </div>
            )}
            {/* Fases en solo lectura para ADMIN/ASISTENTE/CONSEJO en estado TERMINADO */}
            {!isResidente && pqrs.faseActual !== null && (
              <div className="bg-muted border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-foreground">Fases de gestión</h3>
                {FASES.map((fase) => {
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
                  const savedNota = fase.num === 1 ? pqrs.fase1Nota :
                    fase.num === 2 ? pqrs.fase2Nota :
                    fase.num === 3 ? pqrs.fase3Nota :
                    fase.num === 4 ? pqrs.fase4Nota : null;
                  const diasTranscurridos = faseInicio ? calcBusinessDays(faseInicio) : 0;
                  const semaphore = isActive && faseInicio
                    ? getSemaphore(diasTranscurridos, fase.diasHabiles)
                    : isCompleted ? "bg-success/100" : "bg-muted";
                  const isNested = fase.num === 2 || fase.num === 3;
                  return (
                    <div key={fase.num} className={isNested ? "ml-6 border-l-2 border-border pl-3" : ""}>
                      <div className={`flex items-center gap-3 p-2 rounded-lg ${isActive ? "bg-white border border-success/30" : ""}`}>
                        <div className={`w-3 h-3 rounded-full shrink-0 ${semaphore}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${isActive ? "text-foreground" : isCompleted ? "text-success" : "text-muted-foreground"}`}>
                            Fase {fase.num === 2 ? "II" : fase.num === 3 ? "III" : fase.num === 1 ? "I" : fase.num === 4 ? "IV" : "V"} — {fase.nombre}
                          </p>
                          {fase.diasHabiles > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {fase.diasHabiles} días hábiles
                              {isActive && faseInicio ? ` (${diasTranscurridos}d transcurridos)` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      {savedNota && (
                        <div className="px-2 mt-1">
                          <p className="text-[10px] text-muted-foreground whitespace-pre-wrap italic">{savedNota}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* History */}
      {pqrs.historial.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="text-base font-bold text-foreground mb-4">Historial</h2>
          <div className="space-y-3">
            {pqrs.historial.map((h) => {
              const hec = estadoConfig[h.estadoDespues];
              const HIcon = hec?.icon || Clock;
              return (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                    {fmtDateTime(h.creadoAt)}
                  </span>
                  <div>
                    {h.estadoAntes && (
                      <span className="text-muted-foreground">
                        {estadoConfig[h.estadoAntes]?.label || h.estadoAntes} →{" "}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${hec?.bg} ${hec?.text}`}>
                      <HIcon className="h-3 w-3" />
                      {hec?.label || h.estadoDespues}
                    </span>
                    {h.nota && <p className="text-muted-foreground mt-0.5">{h.nota}</p>}
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
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right text-foreground font-medium">{value}</span>
    </div>
  );
}
