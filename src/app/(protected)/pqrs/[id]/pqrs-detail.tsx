"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Save,
  Mail,
  ClipboardList,
  Frown,
  AlertTriangle,
  Lightbulb,
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
  tipoPqrs: string;
  asunto: string;
  descripcion: string;
  estado: string;
  accionTomada: string | null;
  evidenciaCierre: string | null;
  evidenciaArchivoUrl: string | null;
  evidenciaArchivoNombre: string | null;
  fechaPrimerContacto: string | null;
  tiempoRespuestaPrimerContacto: number | null;
  fechaCierre: string | null;
  tiempoRespuestaCierre: number | null;
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

const tipoConfig: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    text: string;
  }
> = {
  PETICION: { label: "Petición", icon: ClipboardList, bg: "bg-blue-100", text: "text-blue-700" },
  QUEJA: { label: "Queja", icon: Frown, bg: "bg-red-100", text: "text-red-700" },
  RECLAMO: { label: "Reclamo", icon: AlertTriangle, bg: "bg-orange-100", text: "text-orange-700" },
  SUGERENCIA: { label: "Sugerencia", icon: Lightbulb, bg: "bg-green-100", text: "text-green-700" },
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
  EN_ESPERA: { label: "En espera", icon: Hourglass, bg: "bg-yellow-100", text: "text-yellow-700" },
  EN_PROGRESO: { label: "En progreso", icon: Clock, bg: "bg-blue-100", text: "text-blue-700" },
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

  const [accionTomada, setAccionTomada] = useState("");
  const [evidenciaCierre, setEvidenciaCierre] = useState("");
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null);
  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
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
    setArchivoUrl(data.evidenciaArchivoUrl || null);
    setArchivoNombre(data.evidenciaArchivoNombre || null);
    setLoading(false);
  }, [pqrsId]);

  useEffect(() => {
    fetchPqrs();
  }, [fetchPqrs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("El archivo no puede superar 5MB");
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
    setArchivoUrl(data.url);
    setArchivoNombre(data.nombre);
    setUploading(false);
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
        evidenciaArchivoUrl: archivoUrl,
        evidenciaArchivoNombre: archivoNombre,
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
    const finalEvidencia = evidenciaCierre.trim();

    if (!finalAccion) {
      setError("Debe completar la acción tomada antes de cerrar la PQRS");
      return;
    }
    if (!finalEvidencia) {
      setError("Debe completar la evidencia de cierre antes de cerrar la PQRS");
      return;
    }

    setTerminating(true);

    const res = await fetch(`/api/pqrs/${pqrsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accionTomada: finalAccion,
        evidenciaCierre: finalEvidencia,
        evidenciaArchivoUrl: archivoUrl,
        evidenciaArchivoNombre: archivoNombre,
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
  const tc = tipoConfig[pqrs.tipoPqrs];
  const ec = estadoConfig[pqrs.estado];
  const TipoIcon = tc?.icon || ClipboardList;
  const EstadoIcon = ec?.icon || Clock;

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
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tc?.bg} ${tc?.text}`}>
              <TipoIcon className="h-3 w-3" />
              {tc?.label || pqrs.tipoPqrs}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ec?.bg} ${ec?.text}`}>
              <EstadoIcon className="h-3 w-3" />
              {ec?.label || pqrs.estado}
            </span>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mt-1">{pqrs.asunto}</h1>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h2 className="text-base font-bold text-gray-900">Información de la solicitud</h2>

        <InfoRow label="Residente" value={pqrs.nombreResidente} />
        <InfoRow label="Ubicación" value={`Torre ${pqrs.bloque} - Apto ${pqrs.apto}`} />
        <InfoRow label="Fecha recibido" value={fmtDateTime(pqrs.fechaRecibido)} />
        {pqrs.creadoPor && <InfoRow label="Registrado por" value={pqrs.creadoPor.name} />}

        <div className="border-t border-gray-100 pt-3">
          <p className="text-sm font-medium text-gray-500 mb-1">Descripción</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {pqrs.descripcion}
          </p>
        </div>
      </div>

      {/* Management card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="text-base font-bold text-gray-900">Gestión</h2>

        {/* Estado (read-only) */}
        <InfoRow label="Estado" value={ec?.label || pqrs.estado} />

        {/* Dates */}
        {pqrs.fechaPrimerContacto && (
          <InfoRow
            label="Primer contacto"
            value={`${fmtDateTime(pqrs.fechaPrimerContacto)} (${pqrs.tiempoRespuestaPrimerContacto} día${pqrs.tiempoRespuestaPrimerContacto !== 1 ? "s" : ""})`}
          />
        )}
        {pqrs.fechaCierre && (
          <InfoRow
            label="Fecha cierre"
            value={`${fmtDateTime(pqrs.fechaCierre)} (${pqrs.tiempoRespuestaCierre} día${pqrs.tiempoRespuestaCierre !== 1 ? "s" : ""})`}
          />
        )}
        {pqrs.gestionadoPor && <InfoRow label="Gestionado por" value={pqrs.gestionadoPor.name} />}

        <div className="border-t border-gray-100" />

        {/* Acción tomada */}
        {isAdmin && !isTerminado ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Acción tomada <span className="text-red-500">*</span>
            </label>
            <textarea
              placeholder="Describa las acciones realizadas"
              value={accionTomada}
              onChange={(e) => setAccionTomada(e.target.value)}
              rows={3}
              className="w-full text-sm px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 transition-all resize-none"
            />
          </div>
        ) : pqrs.accionTomada ? (
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Acción tomada</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{pqrs.accionTomada}</p>
          </div>
        ) : null}

        {/* Evidencia de cierre (texto) */}
        {isAdmin && !isTerminado ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Evidencia de cierre <span className="text-red-500">*</span>
            </label>
            <textarea
              placeholder="Describa la evidencia del cierre"
              value={evidenciaCierre}
              onChange={(e) => setEvidenciaCierre(e.target.value)}
              rows={3}
              className="w-full text-sm px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 transition-all resize-none"
            />
          </div>
        ) : pqrs.evidenciaCierre ? (
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Evidencia de cierre</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{pqrs.evidenciaCierre}</p>
          </div>
        ) : null}

        {/* Evidencia archivo (upload) */}
        {isAdmin && !isTerminado ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Archivo de evidencia
            </label>

            {archivoUrl ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                <FileDown className="h-5 w-5 text-green-600 shrink-0" />
                <span className="text-sm text-green-800 truncate flex-1">
                  {archivoNombre}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setArchivoUrl(null);
                    setArchivoNombre(null);
                  }}
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
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                {uploading ? "Subiendo..." : "Subir archivo (máx. 5MB)"}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx"
              onChange={handleUpload}
            />
          </div>
        ) : pqrs.evidenciaArchivoUrl ? (
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Archivo de evidencia</p>
            <a
              href={pqrs.evidenciaArchivoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-green-700 hover:text-green-800 bg-green-50 border border-green-200 rounded-xl px-4 py-2 transition-colors"
            >
              <FileDown className="h-4 w-4" />
              {pqrs.evidenciaArchivoNombre || "Descargar archivo"}
            </a>
          </div>
        ) : null}

        {/* Messages */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
            {success.includes("notificación") && <Mail className="h-4 w-4" />}
            {success}
          </div>
        )}

        {/* Action buttons */}
        {isAdmin && !isTerminado && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || terminating}
              className="flex-1 h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Save className="h-5 w-5" />
              )}
              Guardar
            </button>

            <button
              onClick={handleTerminar}
              disabled={saving || terminating}
              className="flex-1 h-12 text-base font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {terminating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              Terminar
            </button>
          </div>
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
                    {h.nota && (
                      <p className="text-gray-500 mt-0.5">{h.nota}</p>
                    )}
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
