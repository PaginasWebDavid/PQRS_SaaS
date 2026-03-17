"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, Save, Mail } from "lucide-react";

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

const tipoBadge: Record<string, string> = {
  PETICION: "bg-blue-100 text-blue-800",
  QUEJA: "bg-red-100 text-red-800",
  RECLAMO: "bg-orange-100 text-orange-800",
  SUGERENCIA: "bg-green-100 text-green-800",
};

const tipoLabel: Record<string, string> = {
  PETICION: "Petición",
  QUEJA: "Queja",
  RECLAMO: "Reclamo",
  SUGERENCIA: "Sugerencia",
};

const estadoBadge: Record<string, string> = {
  EN_ESPERA: "bg-yellow-100 text-yellow-800",
  EN_PROGRESO: "bg-blue-100 text-blue-800",
  TERMINADO: "bg-green-100 text-green-800",
};

const estadoLabel: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_PROGRESO: "En progreso",
  TERMINADO: "Terminado",
};

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

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

  const [pqrs, setPqrs] = useState<Pqrs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Campos editables (solo admin)
  const [estado, setEstado] = useState("");
  const [accionTomada, setAccionTomada] = useState("");
  const [evidenciaCierre, setEvidenciaCierre] = useState("");

  const fetchPqrs = useCallback(async () => {
    const res = await fetch(`/api/pqrs/${pqrsId}`);
    if (!res.ok) {
      setError("No se pudo cargar la PQRS");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setPqrs(data);
    setEstado(data.estado);
    setAccionTomada(data.accionTomada || "");
    setEvidenciaCierre(data.evidenciaCierre || "");
    setLoading(false);
  }, [pqrsId]);

  useEffect(() => {
    fetchPqrs();
  }, [fetchPqrs]);

  async function handleSave() {
    setError("");
    setSuccess("");
    setSaving(true);

    const res = await fetch(`/api/pqrs/${pqrsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado,
        accionTomada: accionTomada.trim() || null,
        evidenciaCierre: evidenciaCierre.trim() || null,
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
    setSuccess(
      estado === "TERMINADO" && pqrs?.estado !== "TERMINADO"
        ? "PQRS cerrada. Se envió notificación al residente."
        : "Cambios guardados."
    );
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pqrs) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{error || "PQRS no encontrada"}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const isTerminado = pqrs.estado === "TERMINADO";

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">
              #{pqrs.numero}
            </span>
            <Badge variant="secondary" className={tipoBadge[pqrs.tipoPqrs]}>
              {tipoLabel[pqrs.tipoPqrs]}
            </Badge>
            <Badge variant="secondary" className={estadoBadge[pqrs.estado]}>
              {estadoLabel[pqrs.estado]}
            </Badge>
          </div>
          <h1 className="text-lg font-semibold mt-1">{pqrs.asunto}</h1>
        </div>
      </div>

      {/* Info de la solicitud */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Información de la solicitud</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow label="Residente" value={pqrs.nombreResidente} />
          <InfoRow label="Ubicación" value={`Torre ${pqrs.bloque} - Apto ${pqrs.apto}`} />
          <InfoRow label="Fecha recibido" value={fmtDateTime(pqrs.fechaRecibido)} />
          {pqrs.creadoPor && (
            <InfoRow label="Registrado por" value={pqrs.creadoPor.name} />
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Descripción</p>
            <p className="text-sm whitespace-pre-wrap">{pqrs.descripcion}</p>
          </div>
        </CardContent>
      </Card>

      {/* Gestión (solo ADMIN edita, todos ven) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gestión</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Estado */}
          {isAdmin && !isTerminado ? (
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v) => v && setEstado(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EN_ESPERA">En espera</SelectItem>
                  <SelectItem value="EN_PROGRESO">En progreso</SelectItem>
                  <SelectItem value="TERMINADO">Terminado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <InfoRow label="Estado" value={estadoLabel[pqrs.estado]} />
          )}

          {/* Fechas de gestión (si existen) */}
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
          {pqrs.gestionadoPor && (
            <InfoRow label="Gestionado por" value={pqrs.gestionadoPor.name} />
          )}

          <Separator />

          {/* Acción tomada */}
          {isAdmin && !isTerminado ? (
            <div className="space-y-2">
              <Label htmlFor="accion">
                Acción tomada {estado === "TERMINADO" && "*"}
              </Label>
              <Textarea
                id="accion"
                placeholder="Describa las acciones realizadas"
                value={accionTomada}
                onChange={(e) => setAccionTomada(e.target.value)}
                rows={3}
              />
            </div>
          ) : pqrs.accionTomada ? (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Acción tomada</p>
              <p className="text-sm whitespace-pre-wrap">{pqrs.accionTomada}</p>
            </div>
          ) : null}

          {/* Evidencia de cierre */}
          {isAdmin && !isTerminado ? (
            <div className="space-y-2">
              <Label htmlFor="evidencia">
                Evidencia de cierre {estado === "TERMINADO" && "*"}
              </Label>
              <Textarea
                id="evidencia"
                placeholder="Describa la evidencia del cierre"
                value={evidenciaCierre}
                onChange={(e) => setEvidenciaCierre(e.target.value)}
                rows={3}
              />
            </div>
          ) : pqrs.evidenciaCierre ? (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Evidencia de cierre</p>
              <p className="text-sm whitespace-pre-wrap">{pqrs.evidenciaCierre}</p>
            </div>
          ) : null}

          {/* Mensajes */}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md p-3">
              {success.includes("notificación") && <Mail className="h-4 w-4" />}
              {success}
            </div>
          )}

          {/* Botón guardar (solo admin, no terminado) */}
          {isAdmin && !isTerminado && (
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {estado === "TERMINADO" ? "Cerrar PQRS y notificar" : "Guardar cambios"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Historial - solo para TERMINADO */}
      {isTerminado && pqrs.historial.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historial</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pqrs.historial.map((h) => (
                <div key={h.id} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                    {fmtDateTime(h.creadoAt)}
                  </span>
                  <div>
                    {h.estadoAntes && (
                      <span>
                        {estadoLabel[h.estadoAntes]} →{" "}
                      </span>
                    )}
                    <Badge variant="secondary" className={estadoBadge[h.estadoDespues]}>
                      {estadoLabel[h.estadoDespues]}
                    </Badge>
                    {h.nota && (
                      <p className="text-muted-foreground mt-0.5">{h.nota}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
