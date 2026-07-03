"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";

export default function OlvidarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al enviar el correo");
      } else {
        setSent(true);
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Link href="/" className="text-sm underline">
            PQRS SaaS
          </Link>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          {sent ? (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Revisa tu correo</h1>
              <p className="text-gray-500 mb-6">
                Si el correo <strong>{email}</strong> esta registrado, recibiras un enlace para restablecer tu contrasena.
              </p>
              <Link href="/auth/login" className="inline-flex items-center gap-2 text-green-700 font-bold hover:text-green-800 hover:underline">
                <ArrowLeft className="h-4 w-4" />
                Volver al inicio de sesion
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Olvidaste tu contrasena?</h1>
                <p className="text-gray-500 mt-1">Ingresa tu correo y te enviaremos un enlace para restablecerla.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-base font-medium text-gray-700">
                    Correo electronico
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full h-12 text-base px-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                  />
                </div>

                {error && <div className="border border-gray-300 p-3 text-sm text-gray-900 text-center">{error}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar enlace"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/auth/login" className="inline-flex items-center gap-2 text-green-700 font-bold hover:text-green-800 hover:underline">
                  <ArrowLeft className="h-4 w-4" />
                  Volver al inicio de sesion
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
