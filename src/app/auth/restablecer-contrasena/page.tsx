"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function Logo({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: "block" }} aria-hidden="true"><path d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z" fill="#122545" /><path d="M40 62l17 17 31-34" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const activeButton = { textAlign: "center" as const, background: "#122545", color: "#FFFFFF", fontSize: 14.5, fontWeight: 700, padding: "13px 0", borderRadius: 999, cursor: "pointer", border: "none", width: "100%" };
const disabledButton = { ...activeButton, background: "#E8E8ED", color: "#8E8E93", cursor: "default" };

export default function RestablecerContrasenaPage() {
  return <Suspense fallback={<Shell><p style={{ textAlign: "center", color: "#6E6E73", fontWeight: 700 }}>Cargando…</p></Shell>}><ResetForm /></Suspense>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style jsx global>{`
        body { margin: 0; background: #FFFFFF; }
        ::selection { background: #EAEEF6; color: #122545; }
        @keyframes apl-up { from { opacity:0; transform: translateY(18px); } to { opacity:1; transform: translateY(0); } }
        @keyframes apl-pop { from { opacity:0; transform: scale(0.85); } to { opacity:1; transform: scale(1); } }
        .reset-input:focus { outline: none; border-color: #122545 !important; box-shadow: 0 0 0 3.5px rgba(18,37,69,0.12); }
      `}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", fontFamily: "Manrope, sans-serif", color: "#1D1D1F", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 380, animation: "apl-up 500ms cubic-bezier(.2,.7,.2,1) both" }}>
          <Link href="/auth/login" style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 40, justifyContent: "center", textDecoration: "none" }}>
            <Logo />
            <span style={{ fontWeight: 800, fontSize: 15.5, letterSpacing: "-0.01em", color: "#1D1D1F" }}>PQRS <span style={{ fontWeight: 500, color: "#6E6E73" }}>Services</span></span>
          </Link>
          {children}
        </div>
      </div>
    </>
  );
}

function ResetForm() {
  const token = useSearchParams().get("token");
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(!token);
  const [error, setError] = useState("");
  const mismatch = Boolean(pass1 && pass2 && pass1 !== pass2);
  const canReset = pass1.length >= 8 && pass1 === pass2;

  async function submitReset() {
    if (!canReset || loading || !token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pass1 }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo actualizar la contraseña.");
        if (res.status === 400 || res.status === 404) setExpired(true);
      } else {
        setDone(true);
      }
    } catch {
      setError("No se pudo actualizar la contraseña.");
    } finally {
      setLoading(false);
    }
  }

  if (expired) {
    return <Shell><div style={{ textAlign: "center" }}><div style={{ width: 56, height: 56, borderRadius: 999, background: "#FBF3DF", color: "#8A5A00", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 20px" }}>!</div><h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Este enlace venció</h1><p style={{ fontSize: 13.5, color: "#6E6E73", fontWeight: 500, margin: "0 0 26px", lineHeight: 1.55 }}>Por seguridad, los enlaces de recuperación duran un tiempo limitado. Solicita uno nuevo.</p><Link href="/auth/olvidar-contrasena" style={{ display: "block", background: "#122545", color: "#FFFFFF", textAlign: "center", fontSize: 14, fontWeight: 700, padding: "13px 0", borderRadius: 999, textDecoration: "none" }}>Solicitar nuevo enlace</Link></div></Shell>;
  }

  if (done) {
    return <Shell><div style={{ textAlign: "center" }}><div style={{ width: 56, height: 56, borderRadius: 999, background: "#ECF6EF", color: "#1A6B3A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 20px", animation: "apl-pop 400ms cubic-bezier(.2,.7,.2,1) both" }}>✓</div><h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Contraseña actualizada</h1><p style={{ fontSize: 13.5, color: "#6E6E73", fontWeight: 500, margin: "0 0 26px", lineHeight: 1.55 }}>Ya puedes iniciar sesión con tu nueva contraseña.</p><Link href="/auth/login" style={{ display: "block", background: "#122545", color: "#FFFFFF", textAlign: "center", fontSize: 14, fontWeight: 700, padding: "13px 0", borderRadius: 999, textDecoration: "none" }}>Iniciar sesión</Link></div></Shell>;
  }

  return (
    <Shell>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px", textAlign: "center" }}>Crea tu nueva contraseña</h1>
        <p style={{ fontSize: 13.5, color: "#6E6E73", fontWeight: 500, margin: "0 0 26px", textAlign: "center" }}>Usa al menos 8 caracteres.</p>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Nueva contraseña</label>
        <input className="reset-input" type="password" value={pass1} onChange={(e) => setPass1(e.target.value)} placeholder="••••••••" style={{ width: "100%", height: 48, padding: "0 15px", border: "1.5px solid #E8E8ED", borderRadius: 12, fontSize: 14.5, fontFamily: "Manrope, sans-serif", marginBottom: 14 }} />
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Confirmar contraseña</label>
        <input className="reset-input" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••••" style={{ width: "100%", height: 48, padding: "0 15px", border: "1.5px solid #E8E8ED", borderRadius: 12, fontSize: 14.5, fontFamily: "Manrope, sans-serif", marginBottom: 8 }} />
        {mismatch ? <p style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600, margin: "0 0 14px" }}>Las contraseñas no coinciden.</p> : <div style={{ marginBottom: 14 }} />}
        {error ? <p style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600, margin: "0 0 14px" }}>{error}</p> : null}
        <button type="button" onClick={submitReset} disabled={!canReset || loading} style={canReset && !loading ? activeButton : disabledButton}>{loading ? "Guardando…" : "Guardar contraseña"}</button>
      </div>
    </Shell>
  );
}
