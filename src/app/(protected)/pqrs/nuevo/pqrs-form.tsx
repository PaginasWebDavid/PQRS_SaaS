"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface PqrsFormProps {
  role: "ADMIN" | "RESIDENTE";
  userName?: string | null;
  userBloque?: number | null;
  userApto?: number | null;
}

export function PqrsForm({ role, userName, userBloque, userApto }: PqrsFormProps) {
  const router = useRouter();
  const isAdmin = role === "ADMIN";

  const [tipoPqrs, setTipoPqrs] = useState("");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [nombreResidente, setNombreResidente] = useState("");
  const [bloque, setBloque] = useState("");
  const [apto, setApto] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!tipoPqrs) {
      setError("Selecciona el tipo de solicitud");
      return;
    }
    if (!asunto.trim()) {
      setError("El asunto es obligatorio");
      return;
    }
    if (!descripcion.trim()) {
      setError("La descripción es obligatoria");
      return;
    }
    if (isAdmin && !nombreResidente.trim()) {
      setError("El nombre del residente es obligatorio");
      return;
    }
    if (isAdmin && !bloque) {
      setError("La torre es obligatoria");
      return;
    }
    if (isAdmin && !apto) {
      setError("El apartamento es obligatorio");
      return;
    }

    setLoading(true);

    const body: Record<string, string> = {
      tipoPqrs,
      asunto: asunto.trim(),
      descripcion: descripcion.trim(),
    };

    if (isAdmin) {
      body.nombreResidente = nombreResidente.trim();
      body.bloque = bloque;
      body.apto = apto;
    }

    const res = await fetch("/api/pqrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al crear la PQRS");
      setLoading(false);
      return;
    }

    router.push("/pqrs");
    router.refresh();
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Nueva PQRS</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo */}
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de solicitud *</Label>
              <Select value={tipoPqrs} onValueChange={(v) => v && setTipoPqrs(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PETICION">Petición</SelectItem>
                  <SelectItem value="QUEJA">Queja</SelectItem>
                  <SelectItem value="RECLAMO">Reclamo</SelectItem>
                  <SelectItem value="SUGERENCIA">Sugerencia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Asunto */}
            <div className="space-y-2">
              <Label htmlFor="asunto">Asunto *</Label>
              <Input
                id="asunto"
                placeholder="Resumen breve de la solicitud"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción *</Label>
              <Textarea
                id="descripcion"
                placeholder="Describe tu solicitud con el mayor detalle posible"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={5}
              />
            </div>

            {/* Campos de admin: datos del residente */}
            {isAdmin && (
              <>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    Datos del residente
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre del residente *</Label>
                  <Input
                    id="nombre"
                    placeholder="Nombre completo"
                    value={nombreResidente}
                    onChange={(e) => setNombreResidente(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="torre">Torre *</Label>
                    <Select value={bloque} onValueChange={(v) => v && setBloque(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Torre" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            Torre {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apto">Apartamento *</Label>
                    <Input
                      id="apto"
                      type="number"
                      placeholder="Ej: 310"
                      value={apto}
                      onChange={(e) => setApto(e.target.value)}
                      min={1}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Info del residente (auto) */}
            {!isAdmin && (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                <p><span className="font-medium">Residente:</span> {userName}</p>
                <p><span className="font-medium">Ubicación:</span> Torre {userBloque} - Apto {userApto}</p>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => router.back()}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar PQRS
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
