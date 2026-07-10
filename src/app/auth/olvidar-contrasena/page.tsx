"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";

export default function OlvidarContraseñaPage() {
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

        <div className="bg-white border border-input p-6">
          {sent ? (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground mb-2">Revisa tu correo</h1>
              <p className="text-muted-foreground mb-6">
                Si el correo <strong>{email}</strong> esta registrado, recibiras un enlace para restablecer tu contraseña.
              </p>
              <Link href="/auth/login" className="inline-flex items-center gap-2 text-success font-bold hover:text-success hover:underline">
                <ArrowLeft className="h-4 w-4" />
                Volver al inicio de sesion
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-foreground">Olvidaste tu contraseña?</h1>
                <p className="text-muted-foreground mt-1">Ingresa tu correo y te enviaremos un enlace para restablecerla.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-base font-medium text-foreground">
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
                    className="w-full h-12 text-base px-4 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  />
                </div>

                {error && <div className="border border-input p-3 text-sm text-foreground text-center">{error}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base font-bold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar enlace"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/auth/login" className="inline-flex items-center gap-2 text-success font-bold hover:text-success hover:underline">
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
