"use client";

import React, { CSSProperties, useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

export function DcLogo({ size = 22, invert = false, style }: { size?: number; invert?: boolean; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: "block", ...style }} aria-hidden="true"><path d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z" fill={invert ? "#FFFFFF" : "#122545"} /><path d="M40 62l17 17 31-34" fill="none" stroke={invert ? "#122545" : "#FFFFFF"} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const nav = [
  ["/dashboard", "Dashboard"],
  ["/pqrs", "PQRS"],
  ["/usuarios", "Usuarios"],
  ["/reportes", "Reportes"],
  ["/dashboard", "Licencias y pagos"],
  ["/historial", "Actividad"],
  ["/dashboard", "Configuración"],
  ["/cambiar-contrasena", "Mi cuenta"],
  ["/dashboard", "Ayuda"],
];

function useBreakpoints() {
  const [state, setState] = useState({ isMobile: false, isNarrowTable: false });
  useEffect(() => {
    const check = () => setState({ isMobile: window.innerWidth < 900, isNarrowTable: window.innerWidth < 1180 });
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return state;
}

export function DcAppShell({ children, active = "Dashboard", userName = "Ana Ruiz", role = "Administradora" }: { children: React.ReactNode; active?: string; userName?: string; role?: string }) {
  const { isMobile } = useBreakpoints();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebar = (
    <div style={{ width: 264, flexShrink: 0, borderRight: "1px solid rgba(0,0,0,0.06)", background: "#FAFAFA", position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", padding: "24px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 20px" }}><DcLogo /><span style={{ fontWeight: 800, fontSize: 14.5, letterSpacing: "-0.01em" }}>PQRS <span style={{ fontWeight: 500, color: "#6E6E73" }}>Services</span></span></div>
      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 14, padding: "14px 16px", marginBottom: 20 }}><div style={{ fontSize: 10.5, color: "#8E8E93", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 5 }}>CONJUNTO</div><div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>Parque Residencial Calle 100</div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9 }}><div style={{ width: 7, height: 7, borderRadius: 999, background: "#1A6B3A" }} /><span style={{ fontSize: 11.5, fontWeight: 700, color: "#1A6B3A" }}>Licencia activa</span></div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
        {nav.map(([href, label], idx) => <React.Fragment key={`${href}-${label}`}><Link href={href} onClick={() => setDrawerOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: active === label ? "#EAEEF6" : "transparent", color: active === label ? "#122545" : "#424245", fontSize: 13.5, fontWeight: active === label ? 700 : 600, textDecoration: "none", transition: "background 200ms" }}>{label}</Link>{idx === 4 ? <div style={{ height: 1, background: "rgba(0,0,0,0.07)", margin: "8px 4px" }} /> : null}</React.Fragment>)}
      </div>
      <div style={{ marginTop: "auto" }}><div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 8px", borderTop: "1px solid rgba(0,0,0,0.06)" }}><div style={{ width: 34, height: 34, borderRadius: 999, background: "#EAEEF6", color: "#122545", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>AR</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.2 }}>{userName}</div><div style={{ fontSize: 11, color: "#8E8E93", fontWeight: 500 }}>{role}</div></div><button onClick={() => signOut({ callbackUrl: "/auth/login" })} style={{ fontSize: 11.5, fontWeight: 700, color: "#8E8E93", background: "none", border: "none", cursor: "pointer" }}>Salir</button></div></div>
    </div>
  );

  return (
    <>
      <style jsx global>{`@keyframes apl-up { from { opacity:0; transform: translateY(18px); } to { opacity:1; transform: translateY(0); } } @keyframes apl-fade { from { opacity:0; } to { opacity:1; } } @keyframes apl-sheet { from { opacity:0; transform: translateY(26px); } to { opacity:1; transform: translateY(0); } }`}</style>
      <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "Manrope, sans-serif", color: "#1D1D1F", display: "flex" }}>
        {!isMobile ? sidebar : null}
        {drawerOpen ? <><div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", zIndex: 190, animation: "apl-fade 250ms ease both" }} /><div style={{ position: "fixed", top: 0, left: 0, height: "100vh", width: 290, maxWidth: "84vw", zIndex: 195, animation: "apl-sheet 300ms cubic-bezier(.2,.7,.2,1) both" }}>{sidebar}</div></> : null}
        {isMobile ? <button onClick={() => setDrawerOpen(true)} style={{ position: "fixed", top: 16, left: 16, zIndex: 80, width: 42, height: 42, borderRadius: 999, border: "1px solid rgba(0,0,0,0.06)", background: "#FFFFFF", fontSize: 18 }}>☰</button> : null}
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </>
  );
}
