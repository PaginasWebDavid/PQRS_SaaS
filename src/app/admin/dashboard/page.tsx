'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/design-export/AdminShell';
import { ADMIN_NAV } from '@/lib/design-export/adminNav';
import { COLORS, badgeStyle } from '@/lib/design-export/tokens';

type DashboardData = {
  resumen: { total: number; enEspera: number; enProgreso: number; terminado: number; tiempoPromedioCierre: number | null; tiempoPromedioRespuesta: number | null };
  pendientes: { id: string; numero: number; asunto: string; nombreResidente: string; diasEspera: number }[];
  pendientesEnProceso: { id: string; numero: number; asunto: string; nombreResidente: string; diasEnProceso: number }[];
  licenseSummary?: { status: string; currentPeriodEnd: string; priceCents: number; unitsSnapshot: number; nextPaymentDueDate: string } | null;
};

type MeData = { tenant?: { units?: number | null } | null; user?: { name?: string | null } | null };

const BADGE_BY_GROUP: Record<string, React.CSSProperties> = {
  abierta: badgeStyle(COLORS.warningSoft, COLORS.warning),
  proceso: badgeStyle(COLORS.navySoft, COLORS.navy),
  terminada: badgeStyle(COLORS.successSoft, COLORS.success),
};

function money(cents?: number) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format((cents || 0) / 100); }
function shortDate(value?: string) { return value ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—'; }

export default function DashboardAdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/dashboard?year=${new Date().getFullYear()}`).then((r) => r.ok ? r.json() : Promise.reject()),
      fetch('/api/me').then((r) => r.ok ? r.json() : null),
    ]).then(([dashboard, profile]) => { if (alive) { setData(dashboard); setMe(profile); } }).catch(() => { if (alive) setError('No se pudo cargar el dashboard.'); });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    const abiertas = (data?.pendientes || []).slice(0, 3).map((p) => ({ id: p.id, code: `PQ-${String(p.numero).padStart(4, '0')}`, subject: p.asunto, resident: p.nombreResidente, date: `${p.diasEspera}d`, group: 'abierta' }));
    const proceso = (data?.pendientesEnProceso || []).slice(0, 3).map((p) => ({ id: p.id, code: `PQ-${String(p.numero).padStart(4, '0')}`, subject: p.asunto, resident: p.nombreResidente, date: `${p.diasEnProceso}d`, group: 'proceso' }));
    return [...abiertas, ...proceso].slice(0, 4);
  }, [data]);

  const metrics = [
    { label: 'Abiertas', value: data?.resumen.enEspera ?? '—', color: COLORS.warning, href: '/admin/pqrs?estado=EN_ESPERA' },
    { label: 'En proceso', value: data?.resumen.enProgreso ?? '—', color: COLORS.navy, href: '/admin/pqrs?estado=EN_PROGRESO' },
    { label: 'Terminadas', value: data?.resumen.terminado ?? '—', color: COLORS.success, hint: 'este año', href: '/admin/pqrs?estado=TERMINADO' },
    { label: 'Tiempo promedio', value: data?.resumen.tiempoPromedioCierre ? `${data.resumen.tiempoPromedioCierre}d` : '—', color: '#1D1D1F', hint: 'de cierre', href: '/admin/reportes' },
    { label: 'Unidades', value: me?.tenant?.units ?? '—', color: '#1D1D1F', hint: 'del conjunto', href: '/admin/configuracion' },
    { label: 'Licencia', value: data?.licenseSummary?.status === 'ACTIVE' ? 'Activa' : (data?.licenseSummary?.status || '—'), color: data?.licenseSummary?.status === 'ACTIVE' ? COLORS.success : COLORS.warning, hint: shortDate(data?.licenseSummary?.currentPeriodEnd), href: '/admin/licencias' },
  ];

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="dashboard" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Dashboard">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 26 }}>
        <div><h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Buen día, {(me?.user?.name || 'Ana').split(' ')[0]}.</h1><p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>{error || 'Así va tu conjunto hoy.'}</p></div>
        <Link href="/admin/pqrs" style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, padding: '11px 22px', borderRadius: 999 }}>+ Crear PQRS</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>{metrics.map((m) => <Link key={m.label} href={m.href} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 18, color: '#1D1D1F' }}><div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>{m.label}</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: m.color }}>{m.value}</span>{m.hint && <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>{m.hint}</span>}</div></Link>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}><span style={{ fontSize: 15, fontWeight: 800 }}>PQRS recientes</span><Link href="/admin/pqrs" style={{ fontSize: 12.5, fontWeight: 700 }}>Ver todas ›</Link></div>{rows.length ? rows.map((r) => <Link key={r.id} href={`/pqrs/${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, color: '#1D1D1F' }}><span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 66, flexShrink: 0 }}>{r.code}</span><span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</span><span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, width: 90, flexShrink: 0 }}>{r.resident}</span><span style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, width: 48, flexShrink: 0 }}>{r.date}</span><span style={BADGE_BY_GROUP[r.group]}>{r.group === 'abierta' ? 'Abierta' : 'En proceso'}</span></Link>) : <div style={{ padding: 24, color: COLORS.textMuted, fontWeight: 600 }}>No hay PQRS recientes.</div>}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}><div style={{ background: COLORS.bgCard, borderRadius: 18, padding: '20px 22px' }}><div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Licencia</div><div style={{ fontSize: 24, fontWeight: 800 }}>{money(data?.licenseSummary?.priceCents)}</div><div style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: 600, marginTop: 4 }}>Renovación: {shortDate(data?.licenseSummary?.nextPaymentDueDate)}</div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><Link href="/admin/usuarios" style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, color: '#1D1D1F' }}><div style={{ fontSize: 13, fontWeight: 800 }}>Usuarios</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 }}>Gestionar roles</div></Link><Link href="/admin/reportes" style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, color: '#1D1D1F' }}><div style={{ fontSize: 13, fontWeight: 800 }}>Reportes</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 }}>Excel</div></Link></div></div>
      </div>
    </AdminShell>
  );
}
