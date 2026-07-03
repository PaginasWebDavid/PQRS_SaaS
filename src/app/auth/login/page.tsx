"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
      setError("Correo o contrasena incorrectos");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-gray-950">
      <div className="mx-auto max-w-sm">
        <Link href="/" className="text-sm text-gray-500 underline underline-offset-4">
          Volver
        </Link>

        <div className="mt-10 border border-gray-200 p-6">
          <h1 className="text-2xl font-semibold">Iniciar sesion</h1>
          <p className="mt-2 text-sm text-gray-600">Acceso para SUPER_ADMIN, ADMIN, ASISTENTE, CONSEJO y RESIDENTE.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">Correo</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-10 w-full border border-gray-300 px-3 text-sm outline-none focus:border-gray-950"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">Contrasena</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 w-full border border-gray-300 px-3 text-sm outline-none focus:border-gray-950"
              />
            </div>

            {error && <p className="border border-gray-300 p-3 text-sm text-gray-900">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="h-10 w-full border border-gray-950 bg-white px-3 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <Link href="/auth/olvidar-contrasena" className="underline underline-offset-4">
              Olvide mi contrasena
            </Link>
            <Link href="/auth/registro" className="underline underline-offset-4">
              Registro
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}