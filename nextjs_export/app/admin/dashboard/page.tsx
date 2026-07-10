'use client';
import Link from 'next/link';
import { AdminShell } from '@/components/AdminShell';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, badgeStyle } from '@/lib/tokens';

const METRICS = [
  { label: 'Abiertas', value: '24', color: COLORS.warning, href: '/admin/pqrs' },
  { label: 'En proceso', value: '12', color: COLORS.navy, href: '/admin/pqrs' },
  { label: 'Terminadas', value: '128', color: COLORS.success, hint: 'este año', href: '/admin/pqrs' },
  { label: 'Tiempo promedio', value: '2.4d', color: '#1D1D1F', hint: 'de cierre', href: '/admin/reportes' },
  { label: 'Usuarios con cuenta', value: '7', color: '#1D1D1F', hint: 'de 312 unidades', href: '/admin/usuarios' },
  { label: 'Licencia', value: 'Activa', color: COLORS.success, hint: '15 ago', href: '/admin/licencias' },
];

const RECENT = [
  { id: 'PQ-0231', subject: 'Ruido excesivo torre 3', resident: 'C. Ramírez', date: '07 jul', group: 'abierta' as const },
  { id: 'PQ-0230', subject: 'Fuga de agua zona común', resident: 'M. Torres', date: '06 jul', group: 'proceso' as const },
  { id: 'PQ-0229', subject: 'Solicitud de certificado', resident: 'A. Gómez', date: '05 jul', group: 'terminada' as const },
  { id: 'PQ-0228', subject: 'Daño en parqueadero', resident: 'J. Pardo', date: '04 jul', group: 'terminada' as const },
];

const BADGE_BY_GROUP: Record<string, React.CSSProperties> = {
  abierta: badgeStyle(COLORS.warningSoft, COLORS.warning),
  proceso: badgeStyle(COLORS.navySoft, COLORS.navy),
  terminada: badgeStyle(COLORS.successSoft, COLORS.success),
};
const LABEL_BY_GROUP: Record<string, string> = { abierta: 'Abierta', proceso: 'En proceso', terminada: 'Terminada' };

export default function DashboardAdminPage() {
  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="dashboard" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Dashboard">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 26 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Buen día, Ana.</h1>
          <p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>Así va tu conjunto hoy.</p>
        </div>
        <Link href="/admin/pqrs" style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, padding: '11px 22px', borderRadius: 999 }}>+ Crear PQRS</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
        {METRICS.map((m) => (
          <Link key={m.label} href={m.href} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 18, color: '#1D1D1F' }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>{m.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: m.color }}>{m.value}</span>
              {m.hint && <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>{m.hint}</span>}
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>PQRS recientes</span>
            <Link href="/admin/pqrs" style={{ fontSize: 12.5, fontWeight: 700 }}>Ver todas ›</Link>
          </div>
          <div>
            {RECENT.map((r) => (
              <Link key={r.id} href="/admin/pqrs" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, color: '#1D1D1F' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 66, flexShrink: 0 }}>{r.id}</span>
                <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</span>
                <span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, width: 90, flexShrink: 0 }}>{r.resident}</span>
                <span style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, width: 48, flexShrink: 0 }}>{r.date}</span>
                <span style={BADGE_BY_GROUP[r.group]}>{LABEL_BY_GROUP[r.group]}</span>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: '20px 22px' }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16 }}>Actividad reciente</div>
            {[
              { text: 'Ana Ruiz cerró PQ-0229 con evidencia de cierre', time: 'hace 20 min' },
              { text: 'Nueva PQRS radicada por C. Ramírez', time: 'hace 1 h' },
              { text: 'Julián Pardo actualizó PQ-0230 a "En proceso"', time: 'hace 3 h' },
            ].map((ev, i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 11 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.navy, marginTop: 5, flexShrink: 0 }} />
                  {i < arr.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'rgba(0,0,0,0.09)', margin: '3px 0' }} />}
                </div>
                <div style={{ paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>{ev.text}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500, marginTop: 2 }}>{ev.time}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link href="/admin/usuarios" style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, color: '#1D1D1F' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Usuarios</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, marginTop: 3 }}>7 activos</div>
            </Link>
            <Link href="/admin/reportes" style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, color: '#1D1D1F' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Reportes</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, marginTop: 3 }}>Excel · PDF</div>
            </Link>
            <Link href="/admin/licencias" style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, color: '#1D1D1F' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Licencia</div><div style={{ fontSize: 11.5, color: COLORS.success, fontWeight: 700, marginTop: 3 }}>Activa · 15 ago</div>
            </Link>
            <Link href="/admin/pqrs" style={{ background: COLORS.navy, borderRadius: 14, padding: 16, color: '#FFFFFF' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Crear PQRS</div><div style={{ fontSize: 11.5, color: COLORS.navyMuted, fontWeight: 500, marginTop: 3 }}>Radicar solicitud</div>
            </Link>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
