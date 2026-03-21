"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";

export default function RestablecerContrasenaPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 via-green-900 to-green-800">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
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
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
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
        setError(data.error || "Error al restablecer la contraseña");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-green-950 via-green-900 to-green-800">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Enlace inválido
            </h1>
            <p className="text-gray-500 mb-6">
              Este enlace no es válido. Solicita uno nuevo desde la página de
              inicio de sesión.
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 text-green-700 font-bold hover:text-green-800 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Ir al inicio de sesión
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-green-950 via-green-900 to-green-800">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link href="/">
            <div className="bg-white rounded-2xl p-3 shadow-xl hover:shadow-2xl transition-shadow">
              <Image
                src="/logo.png"
                alt="Calle 100"
                width={120}
                height={120}
                className="w-24 h-24 object-contain"
              />
            </div>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Contraseña actualizada
              </h1>
              <p className="text-gray-500 mb-6">
                Tu contraseña ha sido restablecida correctamente. Ya puedes
                iniciar sesión.
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center gap-2 w-full h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 transition-colors"
              >
                Iniciar Sesión
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                  Nueva contraseña
                </h1>
                <p className="text-gray-500 mt-1">
                  Ingresa tu nueva contraseña
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label
                    htmlFor="password"
                    className="block text-base font-medium text-gray-700"
                  >
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
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
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="confirmPassword"
                    className="block text-base font-medium text-gray-700"
                  >
                    Confirmar contraseña
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Repite tu contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full h-12 text-base px-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 text-center">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 text-base font-bold text-white bg-green-700 rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Restablecer contraseña"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-green-200/50 text-sm mt-6">
          Parque Residencial Calle 100
        </p>
      </div>
    </main>
  );
}
