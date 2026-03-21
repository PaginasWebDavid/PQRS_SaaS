"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Frown,
  AlertTriangle,
  Lightbulb,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from "lucide-react";

const TIPOS = [
  {
    value: "PETICION",
    label: "Petición",
    description: "Solicitar información o un servicio",
    icon: ClipboardList,
    color: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300",
    iconBg: "bg-blue-100 text-blue-600",
    activeColor: "bg-blue-100 border-blue-500 ring-2 ring-blue-500",
  },
  {
    value: "QUEJA",
    label: "Queja",
    description: "Expresar una inconformidad",
    icon: Frown,
    color: "bg-red-50 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300",
    iconBg: "bg-red-100 text-red-600",
    activeColor: "bg-red-100 border-red-500 ring-2 ring-red-500",
  },
  {
    value: "RECLAMO",
    label: "Reclamo",
    description: "Exigir un derecho o incumplimiento",
    icon: AlertTriangle,
    color: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300",
    iconBg: "bg-orange-100 text-orange-600",
    activeColor: "bg-orange-100 border-orange-500 ring-2 ring-orange-500",
  },
  {
    value: "SUGERENCIA",
    label: "Sugerencia",
    description: "Proponer una mejora",
    icon: Lightbulb,
    color: "bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300",
    iconBg: "bg-green-100 text-green-600",
    activeColor: "bg-green-100 border-green-500 ring-2 ring-green-500",
  },
];

const ASUNTOS = [
  "Área común",
  "Convivencia",
  "Humedad",
  "Iluminación",
];

const SUB_ASUNTOS_HUMEDAD = [
  "Humedad Ventana",
  "Humedad Sala",
  "Humedad Depósito",
  "Humedad Área Común",
];

interface PqrsFormProps {
  role: "ADMIN" | "RESIDENTE";
  userName?: string | null;
  userBloque?: number | null;
  userApto?: number | null;
  initialTipo?: string;
}

export function PqrsForm({
  role,
  userName,
  userBloque,
  userApto,
  initialTipo,
}: PqrsFormProps) {
  const router = useRouter();
  const isAdmin = role === "ADMIN";

  const [tipoPqrs, setTipoPqrs] = useState(initialTipo || "");
  const [showForm, setShowForm] = useState(!!initialTipo);
  const [asunto, setAsunto] = useState("");
  const [subAsunto, setSubAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [nombreResidente, setNombreResidente] = useState("");
  const [bloque, setBloque] = useState("");
  const [apto, setApto] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function selectTipo(tipo: string) {
    setTipoPqrs(tipo);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!asunto) {
      setError("Debe seleccionar un asunto");
      return;
    }
    if (asunto === "Humedad" && !subAsunto) {
      setError("Debe seleccionar el tipo de humedad");
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
      asunto,
      descripcion: descripcion.trim(),
    };

    if (subAsunto) {
      body.subAsunto = subAsunto;
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

  const selectedTipo = TIPOS.find((t) => t.value === tipoPqrs);

  // Step 1: Type selection
  if (!showForm) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            ¿Qué desea radicar?
          </h1>
        </div>

        <p className="text-gray-500 mb-6 ml-[52px]">
          Seleccione el tipo de solicitud
        </p>

        <div className="grid grid-cols-2 gap-4">
          {TIPOS.map((tipo) => (
            <button
              key={tipo.value}
              onClick={() => selectTipo(tipo.value)}
              className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${tipo.color}`}
            >
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center ${tipo.iconBg}`}
              >
                <tipo.icon className="h-8 w-8" />
              </div>
              <span className="font-bold text-lg">{tipo.label}</span>
              <span className="text-xs text-center opacity-70 leading-snug">
                {tipo.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: Form
  return (
    <div className="max-w-lg mx-auto">
      {/* Header with selected type */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            setShowForm(false);
            setTipoPqrs("");
          }}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Nueva {selectedTipo?.label}
          </h1>
          <p className="text-sm text-gray-500">
            {selectedTipo?.description}
          </p>
        </div>
        {selectedTipo && (
          <div
            className={`ml-auto w-12 h-12 rounded-xl flex items-center justify-center ${selectedTipo.iconBg}`}
          >
            <selectedTipo.icon className="h-6 w-6" />
          </div>
        )}
      </div>

      {/* Form card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Asunto - Dropdown */}
          <div className="space-y-2">
            <label
              htmlFor="asunto"
              className="block text-base font-medium text-gray-700"
            >
              Asunto *
            </label>
            <select
              id="asunto"
              value={asunto}
              onChange={(e) => {
                setAsunto(e.target.value);
                if (e.target.value !== "Humedad") {
                  setSubAsunto("");
                }
              }}
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

          {/* Sub-asunto for Humedad */}
          {asunto === "Humedad" && (
            <div className="space-y-2">
              <label
                htmlFor="subAsunto"
                className="block text-base font-medium text-gray-700"
              >
                Tipo de humedad *
              </label>
              <select
                id="subAsunto"
                value={subAsunto}
                onChange={(e) => setSubAsunto(e.target.value)}
                className="w-full h-12 text-base px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all bg-white"
              >
                <option value="">Seleccionar tipo</option>
                {SUB_ASUNTOS_HUMEDAD.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Descripción */}
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
          </div>

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
                    type="number"
                    placeholder="Ej: 310"
                    value={apto}
                    onChange={(e) => setApto(e.target.value)}
                    min={1}
                    className="w-full h-12 text-base px-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </>
          )}

          {/* Residente: info automática */}
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
              onClick={() => {
                setShowForm(false);
                setTipoPqrs("");
              }}
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
