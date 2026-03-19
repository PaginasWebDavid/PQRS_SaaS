"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Correo o contraseña incorrectos");
    } else {
      router.push("/");
      router.refresh();
    }
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

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Bienvenido</h1>
            <p className="text-gray-500 mt-1">Ingresa a tu cuenta</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-base font-medium text-gray-700"
              >
                Correo electrónico
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
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-base font-medium text-gray-700"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                "Iniciar Sesión"
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/auth/olvidar-contrasena"
              className="text-sm text-gray-500 hover:text-green-700 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          <div className="mt-4 text-center">
            <p className="text-gray-500">
              ¿No tienes cuenta?{" "}
              <Link
                href="/auth/registro"
                className="font-bold text-green-700 hover:text-green-800 hover:underline"
              >
                Regístrate aquí
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-green-200/50 text-sm mt-6">
          Parque Residencial Calle 100 P.H.
        </p>
      </div>
    </main>
  );
}
