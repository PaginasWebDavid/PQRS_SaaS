"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    bloque: "",
    apto: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.bloque) {
      setError("Selecciona tu torre");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        name: form.name,
        bloque: parseInt(form.bloque),
        apto: parseInt(form.apto),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Cuenta creada. Intenta iniciar sesión manualmente.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-br from-green-950 via-green-900 to-green-800">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Link href="/">
            <div className="bg-white rounded-2xl p-3 shadow-xl hover:shadow-2xl transition-shadow">
              <Image
                src="/logo.png"
                alt="Calle 100"
                width={100}
                height={100}
                className="w-20 h-20 object-contain"
              />
            </div>
          </Link>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Crear cuenta</h1>
            <p className="text-gray-500 mt-1">
              Regístrate para radicar tus PQRS
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="block text-base font-medium text-gray-700"
              >
                Nombre completo
              </label>
              <input
                id="name"
                type="text"
                placeholder="Tu nombre completo"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
                className="w-full h-12 text-base px-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
              />
            </div>

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
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                required
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
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                  required
                  minLength={6}
                  className="w-full h-12 text-base px-4 pr-12 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-700">
                  Bloque
                </label>
                <select
                  value={form.bloque}
                  onChange={(e) => handleChange("bloque", e.target.value)}
                  required
                  className="w-full h-12 text-base px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all bg-white"
                >
                  <option value="">Selecciona</option>
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
                  Apartamento
                </label>
                <input
                  id="apto"
                  type="number"
                  placeholder="Ej: 218"
                  value={form.apto}
                  onChange={(e) => handleChange("apto", e.target.value)}
                  required
                  min={1}
                  className="w-full h-12 text-base px-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                />
              </div>
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
                "Registrarse"
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-gray-500">
              ¿Ya tienes cuenta?{" "}
              <Link
                href="/auth/login"
                className="font-bold text-green-700 hover:text-green-800 hover:underline"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-green-200/50 text-sm mt-6">
          Parque Residencial Calle 100
        </p>
      </div>
    </main>
  );
}
