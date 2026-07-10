"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { DcAppShell } from "@/components/pqrs/dc-shell";

interface DashboardData {
  year: number;
  resumen: { total: number; enEspera: number; enProgreso: number; terminado: number; porcentajeCompletadas: number; tiempoPromedioCierre: number | null };
  pendientes: { id: string; numero: number; asunto: string; nombreResidente: string; bloque: number; apto: number; diasEspera: number }[];
  pendientesEnProceso: { id: string; numero: number; asunto: string; nombreResidente: string; bloque: number; apto: number; diasEnProceso: number }[];
  licenseSummary: { status: string; nextPaymentDueDate: string; unitsSnapshot: number } | null;
}

function badge(bg: string, color: string): React.CSSProperties { return { background: bg, color, fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }; }
function formatShort(date?: string) { if (!date) return "20 jul"; return new Date(date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }); }

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true); setError("");
    try { const res = await fetch(`/api/dashboard?year=${new Date().getFullYear()}`); if (!res.ok) throw new Error("dashboard"); setData(await res.json()); }
    catch { setError("No se pudieron cargar los datos."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <DcAppShell active="Dashboard"><div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Loader2 className="h-8 w-8 animate-spin" /></div></DcAppShell>;
  if (error || !data) return <DcAppShell active="Dashboard"><div style={{ padding: 40, color: "#B3261E", fontWeight: 700 }}>{error || "Sin datos"}</div></DcAppShell>;

  const r = data.resumen;
  const metrics = [
    { label: "Abiertas", value: String(r.enEspera), color: "#8A5A00", href: "/pqrs?estado=EN_ESPERA" },
    { label: "En proceso", value: String(r.enProgreso), color: "#122545", href: "/pqrs?estado=EN_PROGRESO" },
    { label: "Terminadas", value: String(r.terminado), color: "#1A6B3A", hint: "este año", href: "/pqrs?estado=TERMINADO" },
    { label: "Tiempo promedio", value: r.tiempoPromedioCierre !== null ? `${r.tiempoPromedioCierre}d` : "--", color: "#1D1D1F", hint: "de cierre", href: "/reportes" },
    { label: "Usuarios con cuenta", value: "--", color: "#1D1D1F", hint: `${data.licenseSummary?.unitsSnapshot || ""} unidades`, href: "/usuarios" },
    { label: "Licencia", value: data.licenseSummary ? "Activa" : "--", color: "#1A6B3A", hint: formatShort(data.licenseSummary?.nextPaymentDueDate), href: "/dashboard" },
  ];

  const recentRows = [...data.pendientes.map(p => ({ id: p.id, code: `PQ-${String(p.numero).padStart(4, "0")}`, subject: p.asunto, resident: p.nombreResidente, date: `${p.diasEspera}d`, status: "Abierta", badgeStyle: badge("#FBF3DF", "#8A5A00") })), ...data.pendientesEnProceso.map(p => ({ id: p.id, code: `PQ-${String(p.numero).padStart(4, "0")}`, subject: p.asunto, resident: p.nombreResidente, date: `${p.diasEnProceso}d`, status: "En proceso", badgeStyle: badge("#EAEEF6", "#122545") }))].slice(0, 6);
  const activity = recentRows.slice(0, 4).map((row, i) => ({ text: `${row.status === "Abierta" ? "Nueva PQRS radicada" : "PQRS actualizada"}: ${row.code}`, time: i === 0 ? "hace 20 min" : i === 1 ? "hace 1 h" : i === 2 ? "hace 3 h" : "ayer" }));

  return (
    <DcAppShell active="Dashboard">
      <div style={{ padding: "40px 40px 90px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 28, animation: "apl-up 500ms cubic-bezier(.2,.7,.2,1) both" }}>
            <div><h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em", margin: "0 0 8px" }}>Buenos días, Ana.</h1><p style={{ fontSize: 14.5, color: "#6E6E73", fontWeight: 500, margin: 0 }}>Así está la operación de tu conjunto hoy.</p></div>
            <Link href="/pqrs/nuevo" style={{ background: "#122545", color: "#FFFFFF", fontSize: 13.5, fontWeight: 700, padding: "11px 18px", borderRadius: 999, textDecoration: "none", flexShrink: 0 }}>Nueva PQRS</Link>
          </div>

          {data.licenseSummary ? <div style={{ background: "#FBF3DF", border: "1px solid rgba(138,90,0,0.14)", borderRadius: 18, padding: "16px 18px", marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}><div><div style={{ fontSize: 13.5, fontWeight: 800, color: "#8A5A00" }}>Tu licencia vence pronto</div><div style={{ fontSize: 12.5, color: "#8A5A00", opacity: 0.78, fontWeight: 500, marginTop: 2 }}>Renueva antes del {formatShort(data.licenseSummary.nextPaymentDueDate)} para evitar interrupciones.</div></div><Link href="/dashboard" style={{ background: "#FFFFFF", color: "#8A5A00", padding: "9px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>Ver licencia</Link></div> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
            {metrics.map((m) => <Link key={m.label} href={m.href} style={{ background: "#F5F5F7", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: 20, textDecoration: "none", color: "#1D1D1F", minHeight: 128 }}><div style={{ fontSize: 12, color: "#6E6E73", fontWeight: 700 }}>{m.label}</div><div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 10, color: m.color }}>{m.value}</div>{m.hint ? <div style={{ fontSize: 12.5, color: "#8E8E93", fontWeight: 600, marginTop: 4 }}>{m.hint}</div> : null}</Link>)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 18 }}>
            <section style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ fontSize: 15, fontWeight: 800 }}>PQRS recientes</div><Link href="/pqrs" style={{ color: "#122545", fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>Ver todas</Link></div>
              <div>{recentRows.length ? recentRows.map((row) => <Link key={row.id} href={`/pqrs/${row.id}`} style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 110px", gap: 14, alignItems: "center", padding: "15px 20px", borderBottom: "1px solid rgba(0,0,0,0.05)", textDecoration: "none" }}><div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, color: "#8E8E93", fontWeight: 500 }}>{row.code}</div><div><div style={{ fontSize: 13.5, color: "#1D1D1F", fontWeight: 800 }}>{row.subject}</div><div style={{ fontSize: 12, color: "#8E8E93", fontWeight: 500, marginTop: 2 }}>{row.resident}</div></div><span style={row.badgeStyle}>{row.status}</span><div style={{ fontSize: 12.5, color: "#8E8E93", fontWeight: 600, textAlign: "right" }}>{row.date}</div></Link>) : <div style={{ padding: 24, color: "#8E8E93", fontWeight: 600 }}>No hay PQRS recientes.</div>}</div>
            </section>

            <section style={{ background: "#F5F5F7", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 18 }}>Actividad reciente</div>
              {activity.map((a, i) => <div key={a.text} style={{ position: "relative", paddingBottom: i < activity.length - 1 ? 16 : 0, paddingLeft: 22 }}><div style={{ position: "absolute", left: 0, top: 4, width: 8, height: 8, borderRadius: 999, background: "#122545" }} />{i < activity.length - 1 ? <div style={{ position: "absolute", left: 3.5, top: 14, bottom: 2, width: 1, background: "rgba(0,0,0,0.08)" }} /> : null}<div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{a.text}</div><div style={{ fontSize: 11.5, color: "#8E8E93", fontWeight: 600, marginTop: 3 }}>{a.time}</div></div>)}
            </section>
          </div>
        </div>
      </div>
    </DcAppShell>
  );
}
