"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { BrandMark } from "@/components/pqrs/design-system";

export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", name: "", bloque: "", apto: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(field: string, value: string) { setForm((prev) => ({ ...prev, [field]: value })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!form.bloque) return setError("Selecciona tu bloque.");
    setLoading(true);
    const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email, password: form.password, name: form.name, bloque: parseInt(form.bloque), apto: parseInt(form.apto) }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "No se pudo crear la cuenta."); setLoading(false); return; }
    const result = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
    setLoading(false);
    if (result?.error) setError("Cuenta creada. Intenta iniciar sesion manualmente."); else { router.push("/"); router.refresh(); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-12">
      <section className="w-full max-w-[460px]">
        <Link href="/" className="mb-10 inline-flex"><BrandMark /></Link>
        <div className="pqrs-panel p-6 md:p-8">
          <p className="pqrs-eyebrow">REGISTRO RESIDENTE</p>
          <h1 className="mt-3 text-[30px] font-extrabold tracking-[-0.03em]">Crear cuenta</h1>
          <p className="pqrs-subtitle mt-2">Completa tus datos para radicar y consultar solicitudes.</p>
          {error ? <div className="mt-5 rounded-2xl bg-[#FBEAEA] p-3 text-sm font-bold text-[#B3261E]">{error}</div> : null}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input className="pqrs-input" placeholder="Nombre completo" value={form.name} onChange={(e) => handleChange("name", e.target.value)} required />
            <input className="pqrs-input" type="email" placeholder="Correo electronico" value={form.email} onChange={(e) => handleChange("email", e.target.value)} required />
            <div className="relative"><input className="pqrs-input pr-12" type={showPassword ? "text" : "password"} placeholder="Contrasena" value={form.password} onChange={(e) => handleChange("password", e.target.value)} required minLength={6} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93]" aria-label="Mostrar contrasena">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div>
            <div className="grid grid-cols-2 gap-3"><select className="pqrs-input py-0" value={form.bloque} onChange={(e) => handleChange("bloque", e.target.value)} required><option value="">Bloque</option>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>Bloque {n}</option>)}</select><input className="pqrs-input" type="number" min={1} placeholder="Apartamento" value={form.apto} onChange={(e) => handleChange("apto", e.target.value)} required /></div>
            <button disabled={loading} className="pqrs-button-primary h-12 w-full">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Crear cuenta"}</button>
          </form>
          <p className="mt-6 text-center text-sm font-medium text-[#6E6E73]">Ya tienes cuenta? <Link href="/auth/login" className="font-extrabold text-[#1D1D1F]">Inicia sesion</Link></p>
        </div>
      </section>
    </main>
  );
}
