"use client";

import React, { useState } from "react";
import Link from "next/link";

function Logo({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: "block" }} aria-hidden="true"><path d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z" fill="#122545" /><path d="M40 62l17 17 31-34" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const activeButton = { textAlign: "center" as const, background: "#122545", color: "#FFFFFF", fontSize: 14.5, fontWeight: 700, padding: "13px 0", borderRadius: 999, cursor: "pointer", border: "none", width: "100%" };
const disabledButton = { ...activeButton, background: "#E8E8ED", color: "#8E8E93", cursor: "default" };

export default function OlvidarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canRequest = Boolean(email.trim());

  async function submitRequest() {
    if (!canRequest || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!res.ok) setError((await res.json()).error || "No se pudo enviar el correo.");
      else setSent(true);
    } catch {
      setError("No se pudo enviar el correo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        body { margin: 0; background: #FFFFFF; }
        ::selection { background: #EAEEF6; color: #122545; }
        @keyframes apl-up { from { opacity:0; transform: translateY(18px); } to { opacity:1; transform: translateY(0); } }
        @keyframes apl-pop { from { opacity:0; transform: scale(0.85); } to { opacity:1; transform: scale(1); } }
        .recover-input:focus { outline: none; border-color: #122545 !important; box-shadow: 0 0 0 3.5px rgba(18,37,69,0.12); }
      `}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF", fontFamily: "Manrope, sans-serif", color: "#1D1D1F", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 380, animation: "apl-up 500ms cubic-bezier(.2,.7,.2,1) both" }}>
          <Link href="/auth/login" style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 40, justifyContent: "center", textDecoration: "none" }}>
            <Logo />
            <span style={{ fontWeight: 800, fontSize: 15.5, letterSpacing: "-0.01em", color: "#1D1D1F" }}>PQRS <span style={{ fontWeight: 500, color: "#6E6E73" }}>Services</span></span>
          </Link>

          {!sent ? (
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px", textAlign: "center" }}>Recupera tu acceso</h1>
              <p style={{ fontSize: 13.5, color: "#6E6E73", fontWeight: 500, margin: "0 0 28px", textAlign: "center", lineHeight: 1.5 }}>Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.</p>
              {error ? <p style={{ background: "#FBEAEA", color: "#B3261E", fontSize: 12.5, fontWeight: 700, borderRadius: 12, padding: "10px 12px", marginBottom: 16 }}>{error}</p> : null}
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Correo electrónico</label>
              <input className="recover-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" style={{ width: "100%", height: 48, padding: "0 15px", border: "1.5px solid #E8E8ED", borderRadius: 12, fontSize: 14.5, fontFamily: "Manrope, sans-serif", marginBottom: 22 }} />
              <button type="button" onClick={submitRequest} disabled={!canRequest || loading} style={canRequest && !loading ? activeButton : disabledButton}>{loading ? "Enviando…" : "Enviar enlace"}</button>
              <p style={{ fontSize: 13, color: "#8E8E93", fontWeight: 500, marginTop: 24, textAlign: "center" }}><Link href="/auth/login" style={{ fontWeight: 700, color: "#122545", textDecoration: "none" }}>← Volver a iniciar sesión</Link></p>
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 999, background: "#EAEEF6", color: "#122545", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 20px", animation: "apl-pop 400ms cubic-bezier(.2,.7,.2,1) both" }}>✉</div>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Revisa tu correo</h1>
              <p style={{ fontSize: 13.5, color: "#6E6E73", fontWeight: 500, margin: "0 0 6px", lineHeight: 1.55 }}>Enviamos un enlace para restablecer tu contraseña a</p>
              <p style={{ fontSize: 14, color: "#1D1D1F", fontWeight: 700, margin: "0 0 26px" }}>{email}</p>
              <Link href="/auth/login" style={{ display: "block", background: "#122545", color: "#FFFFFF", textAlign: "center", fontSize: 14, fontWeight: 700, padding: "13px 0", borderRadius: 999, textDecoration: "none", marginBottom: 14 }}>Volver al login</Link>
              <p style={{ fontSize: 12.5, color: "#8E8E93", fontWeight: 500 }}>¿No llegó? <button type="button" onClick={submitRequest} style={{ fontWeight: 700, color: "#122545", cursor: "pointer", background: "none", border: "none", padding: 0 }}>Reenviar correo</button></p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
