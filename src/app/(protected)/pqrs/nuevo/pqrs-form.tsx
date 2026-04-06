"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  FileText,
} from "lucide-react";

interface PqrsFormProps {
  role: "ADMIN" | "RESIDENTE";
  userName?: string | null;
  userBloque?: number | null;
  userApto?: number | null;
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

export function PqrsForm({
  role,
  userName,
  userBloque,
  userApto,
}: PqrsFormProps) {
  const router = useRouter();
  const isAdmin = role === "ADMIN";

  function countWords(text: string): number {
    return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  }

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

    if (!descripcion.trim()) {
      setError("La descripción es obligatoria");
      return;
    }
    if (countWords(descripcion) > 300) {
      setError("La descripción no puede superar 300 palabras");
      return;
    }
    if (isAdmin && !nombreResidente.trim()) {
      setError("El nombre del residente es obligatorio");
      return;
    }
    if (isAdmin && !bloque) {
      setError("El bloque es obligatorio");
      return;
    }
    if (isAdmin && !apto) {
      setError("El apartamento es obligatorio");
      return;
    }
    if (isAdmin && apto && apto.length !== 3) {
      setError("El apartamento debe tener exactamente 3 dígitos");
      return;
    }

    setLoading(true);

    const body: Record<string, string> = {
      descripcion: descripcion.trim(),
    };

    // Admin can set asunto at creation (optional, can also set later)
    if (isAdmin && asunto) {
      body.asunto = asunto;
    }

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
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Nuevo PQRS
          </h1>
          <p className="text-sm text-gray-500">
            Describe tu solicitud
          </p>
        </div>
        <div className="ml-auto w-12 h-12 rounded-xl flex items-center justify-center bg-green-100 text-green-600">
          <FileText className="h-6 w-6" />
        </div>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Descripcion */}
          <div className="space-y-2">
            <label
              htmlFor="descripcion"
              className="block text-base font-medium text-gray-700"
            >
              Descripción *
            </label>
            <textarea
              id="descripcion"
              placeholder="Describe tu solicitud con el mayor detalle posible"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={5}
              className="w-full text-base px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all resize-none"
            />
            <p className={`text-xs text-right ${countWords(descripcion) > 300 ? "text-red-500 font-medium" : "text-gray-400"}`}>
              {countWords(descripcion)} / 300 palabras
            </p>
          </div>

          {/* Admin: Asunto (optional at creation, can assign later in EN_ESPERA) */}
          {isAdmin && (
            <div className="space-y-2">
              <label
                htmlFor="asunto"
                className="block text-base font-medium text-gray-700"
              >
                Asunto (opcional)
              </label>
              <select
                id="asunto"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                className="w-full h-12 text-base px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all bg-white"
              >
                <option value="">Seleccionar asunto</option>
                {ASUNTOS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Admin: datos del residente */}
          {isAdmin && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                  Datos del residente
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="nombre"
                  className="block text-base font-medium text-gray-700"
                >
                  Nombre del residente *
                </label>
                <input
                  id="nombre"
                  placeholder="Nombre completo"
                  value={nombreResidente}
                  onChange={(e) => setNombreResidente(e.target.value)}
                  className="w-full h-12 text-base px-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-base font-medium text-gray-700">
                    Bloque *
                  </label>
                  <select
                    value={bloque}
                    onChange={(e) => setBloque(e.target.value)}
                    className="w-full h-12 text-base px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all bg-white"
                  >
                    <option value="">Seleccionar</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={String(n)}>
                        Bloque {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="apto"
                    className="block text-base font-medium text-gray-700"
                  >
                    Apartamento *
                  </label>
                  <input
                    id="apto"
                    type="text"
                    placeholder="Ej: 310"
                    value={apto}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 3);
                      setApto(val);
                    }}
                    maxLength={3}
                    className="w-full h-12 text-base px-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {/* Residente: info automatica */}
          {!isAdmin && (
            <div className="rounded-xl bg-green-50 border border-green-100 p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div className="text-sm text-green-800">
                <p>
                  <span className="font-medium">Residente:</span> {userName}
                </p>
                <p>
                  <span className="font-medium">Ubicación:</span> Bloque{" "}
                  {userBloque} - Apto {userApto}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 text-center">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 h-12 text-base font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Enviar PQRS"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
