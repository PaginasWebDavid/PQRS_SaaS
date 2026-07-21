'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/shell/AdminShell';
import { useIsMobile } from '@/components/shell/Sheet';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, badgeStyle } from '@/lib/design/tokens';

type DashboardData = {
  resumen: { total: number; enEspera: number; enProgreso: number; terminado: number; tiempoPromedioCierre: number | null; tiempoPromedioRespuesta: number | null };
  licenseSummary?: { status: string; currentPeriodEnd: string; priceCents: number; unitsSnapshot: number; nextPaymentDueDate: string } | null;
  usersActiveCount?: number;
  recentPqrs?: { id: string; numero: number; asunto: string; nombreResidente: string; estado: string; fechaRecibido: string }[];
  recentActivity?: { id: string; numero: number; nombreResidente: string; asunto: string | null; estadoAntes: string | null; estadoDespues: string; nota: string | null; creadoAt: string }[];
};

type MeData = { tenant?: { units?: number | null } | null; user?: { name?: string | null } | null };

const BADGE_BY_ESTADO: Record<string, React.CSSProperties> = {
  EN_ESPERA: badgeStyle(COLORS.warningSoft, COLORS.warning),
  EN_PROGRESO: badgeStyle(COLORS.navySoft, COLORS.navy),
  TERMINADO: badgeStyle(COLORS.successSoft, COLORS.success),
};
const ESTADO_LABEL: Record<string, string> = { EN_ESPERA: 'En espera', EN_PROGRESO: 'En proceso', TERMINADO: 'Terminada' };

function shortDate(value?: string) { return value ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—'; }
function longDate(value: Date) { return value.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }); }

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function humanizeActivity(h: NonNullable<DashboardData['recentActivity']>[number]) {
  const code = `PQ-${String(h.numero).padStart(4, '0')}`;
  if (h.estadoDespues === 'TERMINADO') return `${code} (${h.nombreResidente}) fue cerrada${h.nota ? `: ${h.nota}` : ''}`;
  if (h.estadoAntes === 'EN_ESPERA' && h.estadoDespues === 'EN_PROGRESO') return `Se registró primer contacto en ${code} (${h.nombreResidente})`;
  if (!h.estadoAntes) return `Nueva PQRS radicada por ${h.nombreResidente} (${code})`;
  return `${code} (${h.nombreResidente}) actualizada${h.nota ? `: ${h.nota}` : ''}`;
}

export default function DashboardAdminPage() {
  const isMobile = useIsMobile();
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

  const rows = (data?.recentPqrs || []).map((p) => ({
    id: p.id,
    code: `PQ-${String(p.numero).padStart(4, '0')}`,
    subject: p.asunto,
    resident: p.nombreResidente,
    date: shortDate(p.fechaRecibido),
    estado: p.estado,
  }));

  const licenseEnd = data?.licenseSummary?.currentPeriodEnd ? new Date(data.licenseSummary.currentPeriodEnd) : null;
  const licenseDaysLeft = licenseEnd ? Math.ceil((licenseEnd.getTime() - Date.now()) / 86400000) : null;
  const showLicenseBanner = licenseDaysLeft !== null && licenseDaysLeft <= 15;
  const licenseActive = data?.licenseSummary?.status === 'ACTIVE';

  const metrics = [
    { label: 'En espera', value: data?.resumen.enEspera ?? '—', color: COLORS.warning, href: '/admin/pqrs?estado=EN_ESPERA' },
    { label: 'En proceso', value: data?.resumen.enProgreso ?? '—', color: COLORS.navy, href: '/admin/pqrs?estado=EN_PROGRESO' },
    { label: 'Resueltas', value: data?.resumen.terminado ?? '—', color: COLORS.success, hint: 'este año', href: '/admin/pqrs?estado=TERMINADO' },
    { label: 'Tiempo promedio', value: data?.resumen.tiempoPromedioCierre ? `${data.resumen.tiempoPromedioCierre}d` : '—', color: '#1D1D1F', hint: 'de cierre', href: '/admin/reportes' },
    { label: 'Usuarios con cuenta', value: data?.usersActiveCount ?? '—', color: '#1D1D1F', hint: me?.tenant?.units ? `de ${me.tenant.units} unidades` : undefined, href: '/admin/usuarios' },
    { label: 'Licencia', value: licenseActive ? 'Activa' : (data?.licenseSummary?.status || '—'), color: licenseActive ? COLORS.success : COLORS.warning, hint: shortDate(data?.licenseSummary?.currentPeriodEnd), href: '/admin/licencias' },
  ];

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="dashboard" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Inicio">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Buen día, {(me?.user?.name || 'Ana').split(' ')[0]}.</h1>
          <p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>{error || `Así va tu conjunto hoy, ${longDate(new Date())}.`}</p>
        </div>
        <Link href="/admin/pqrs" style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, padding: '11px 22px', borderRadius: 999 }}>Radicar una PQRS</Link>
      </div>

      {showLicenseBanner && (
        <Link href="/admin/licencias" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', background: '#FBF3DF', borderRadius: 14, padding: '14px 18px', marginBottom: 20, color: '#8A5A00' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Tu licencia se renueva en {licenseDaysLeft} día{licenseDaysLeft === 1 ? '' : 's'} ({shortDate(data?.licenseSummary?.currentPeriodEnd)}). Revisa el estado de pago.</span>
          <span style={{ fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>Ver licencia ›</span>
        </Link>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
        {metrics.map((m) => (
          <Link key={m.label} href={m.href} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 18, color: '#1D1D1F' }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>{m.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: m.color }}>{m.value}</span>
              {m.hint && <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>{m.hint}</span>}
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.55fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>PQRS recientes</span>
            <Link href="/admin/pqrs" style={{ fontSize: 12.5, fontWeight: 700 }}>Ver todas ›</Link>
          </div>
          {rows.length ? rows.map((r) => (
            <Link key={r.id} href={`/admin/pqrs?id=${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, color: '#1D1D1F' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 66, flexShrink: 0 }}>{r.code}</span>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</span>
              <span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, width: 90, flexShrink: 0 }}>{r.resident}</span>
              <span style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, width: 48, flexShrink: 0 }}>{r.date}</span>
              <span style={BADGE_BY_ESTADO[r.estado]}>{ESTADO_LABEL[r.estado]}</span>
            </Link>
          )) : <div style={{ padding: 24, color: COLORS.textMuted, fontWeight: 600 }}>{data ? 'No hay PQRS recientes.' : 'Cargando…'}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: '20px 22px' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Actividad reciente</div>
            {(data?.recentActivity || []).length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>{data ? 'Sin actividad reciente.' : 'Cargando…'}</div>
            ) : (
              (data?.recentActivity || []).map((h, i, arr) => (
                <div key={h.id} style={{ display: 'flex', gap: 11 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 999, background: h.estadoDespues === 'TERMINADO' ? COLORS.success : COLORS.navy, marginTop: 5, flexShrink: 0 }} />
                    {i < arr.length - 1 && <div style={{ width: 1.5, flex: 1, background: COLORS.borderSoft, margin: '3px 0' }} />}
                  </div>
                  <div style={{ paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>{humanizeActivity(h)}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500, marginTop: 2 }}>{relativeTime(h.creadoAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link href="/admin/usuarios" style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, color: '#1D1D1F' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Usuarios</div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 }}>{data?.usersActiveCount ?? '—'} activos</div>
            </Link>
            <Link href="/admin/reportes" style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, color: '#1D1D1F' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Reportes</div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 }}>Excel · PDF</div>
            </Link>
            <Link href="/admin/licencias" style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, color: '#1D1D1F' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Licencia y pagos</div>
              <div style={{ fontSize: 11.5, color: licenseActive ? COLORS.success : COLORS.warning, fontWeight: 700, marginTop: 3 }}>{licenseActive ? 'Activa' : (data?.licenseSummary?.status || '—')} · renueva {shortDate(data?.licenseSummary?.currentPeriodEnd)}</div>
            </Link>
            <Link href="/admin/pqrs" style={{ background: COLORS.navy, borderRadius: 14, padding: 16, color: '#FFFFFF' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Radicar una PQRS</div>
              <div style={{ fontSize: 11.5, color: COLORS.navyMuted, fontWeight: 500, marginTop: 3 }}>Radicar solicitud</div>
            </Link>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
