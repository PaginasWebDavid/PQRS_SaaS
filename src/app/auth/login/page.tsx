"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
      setError("Correo o contraseña incorrectos.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1fr_1.05fr]">
      <div className="flex items-center justify-center px-6 py-12 md:px-12">
        <div className="w-full max-w-[380px]">
          <Link href="/" className="mb-11 flex items-center gap-2">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
              P
            </span>
            <span className="text-[16.5px] font-extrabold tracking-tight">
              PQRS <span className="font-medium text-muted-foreground">Services</span>
            </span>
          </Link>

          <h1 className="mb-2 text-[30px] font-extrabold tracking-tight">Hola de nuevo.</h1>
          <p className="mb-8 text-[14.5px] font-medium text-muted-foreground">
            Inicia sesión para gestionar tu conjunto.
          </p>

          {error && (
            <div className="mb-5 rounded-xl bg-warning/10 px-4 py-3 text-[13px] font-semibold text-warning">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[13px] font-bold">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@tuconjunto.com"
                className="h-12 w-full rounded-xl border border-input bg-white px-4 text-[14.5px] font-medium outline-none transition-colors focus:border-primary focus:ring-[3.5px] focus:ring-primary/10"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[13px] font-bold">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="h-12 w-full rounded-xl border border-input bg-white px-4 text-[14.5px] outline-none transition-colors focus:border-primary focus:ring-[3.5px] focus:ring-primary/10"
              />
            </div>

            <div className="flex justify-end pt-1">
              <Link
                href="/auth/olvidar-contrasena"
                className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "h-[50px] w-full rounded-full bg-primary text-[15px] font-bold text-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0"
              )}
            >
              {loading ? "Iniciando sesión…" : "Iniciar sesión"}
            </button>
          </form>

          <p className="mt-7 text-center text-[13px] font-medium leading-relaxed text-muted-foreground">
            ¿Eres residente y necesitas crear una cuenta?
            <br />
            <Link href="/auth/registro" className="font-bold text-foreground">
              Regístrate como residente
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-primary lg:m-3.5 lg:ml-0 lg:flex lg:items-center lg:justify-center lg:rounded-[28px] lg:p-16">
        <div className="pointer-events-none absolute -right-16 -top-24 h-[360px] w-[360px] rounded-full bg-white/[0.09] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-[280px] w-[280px] rounded-full bg-success/20 blur-3xl" />

        <div className="relative z-10 max-w-[400px]">
          <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-extrabold text-primary">
            P
          </span>
          <h2 className="mb-3.5 text-[32px] font-extrabold leading-tight tracking-tight text-white">
            Cada solicitud, bajo control.
          </h2>
          <p className="mb-10 text-[15px] font-medium leading-relaxed text-primary-foreground/70">
            Radica, atiende y cierra PQRS con trazabilidad completa. Tu conjunto siempre sabe en qué va cada cosa.
          </p>

          <div className="flex flex-col gap-3">
            {[
              { icon: "✓", title: "Trazabilidad total", desc: "Cada solicitud con historial completo, fase por fase." },
              { icon: "▤", title: "Reportes ejecutivos", desc: "Métricas listas para tu consejo de administración." },
              { icon: "◷", title: "Respuesta a tiempo", desc: "Tiempos de cierre visibles para todo el equipo." },
            ].map((h) => (
              <div
                key={h.title}
                className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.06] px-[17px] py-[15px]"
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-white/10 text-[13px] font-bold text-white">
                  {h.icon}
                </span>
                <div>
                  <div className="text-[13.5px] font-bold text-white">{h.title}</div>
                  <div className="mt-0.5 text-[12.5px] font-medium text-primary-foreground/60">{h.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
