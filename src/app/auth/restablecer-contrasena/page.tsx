"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";

export default function RestablecerContrasenaPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-gray-900" />
        </main>
      }
    >
      <RestablecerForm />
    </Suspense>
  );
}

function RestablecerForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("La contrasena debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al restablecer la contrasena");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
        <div className="w-full max-w-md">
          <div className="bg-white border border-gray-300 p-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Enlace invalido</h1>
            <p className="text-gray-500 mb-6">
              Este enlace no es valido. Solicita uno nuevo desde la pagina de inicio de sesion.
            </p>
            <Link href="/auth/login" className="inline-flex items-center gap-2 text-green-700 font-bold hover:text-green-800 hover:underline">
              <ArrowLeft className="h-4 w-4" />
              Ir al inicio de sesion
            </Link>
          </div>
        </div>
      </main>
    );
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
          {success ? (
            <div className="text-center">
              <div className="w-12 h-12 border border-gray-300 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Contrasena actualizada</h1>
              <p className="text-gray-500 mb-6">
                Tu contrasena ha sido restablecida correctamente. Ya puedes iniciar sesion.
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center gap-2 w-full h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 transition-colors"
              >
                Iniciar sesion
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Nueva contrasena</h1>
                <p className="text-gray-500 mt-1">Ingresa tu nueva contrasena.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="password" className="block text-base font-medium text-gray-700">
                    Contrasena
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                      className="w-full h-12 text-base px-4 pr-12 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-base font-medium text-gray-700">
                    Confirmar contrasena
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repite tu contrasena"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full h-12 text-base px-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                  />
                </div>

                {error && <div className="border border-gray-300 p-3 text-sm text-gray-900 text-center">{error}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Restablecer contrasena"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
