'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, tabStyle } from '@/lib/tokens';

const ACTIVITY = [
  { text: 'Ana Ruiz cerró PQ-0229 con evidencia de cierre', time: 'hace 20 min', type: 'pqrs', dot: COLORS.success },
  { text: 'Nueva PQRS radicada por C. Ramírez — "Ruido excesivo torre 3"', time: 'hace 1 h', type: 'pqrs', dot: COLORS.warning },
  { text: 'Julián Pardo actualizó PQ-0230 a "En proceso"', time: 'hace 3 h', type: 'pqrs', dot: COLORS.navy },
  { text: 'Carlos invitó a un nuevo usuario residente', time: 'hace 5 h', type: 'usuarios', dot: COLORS.navy },
  { text: 'Licencia renovada hasta el 15 de agosto de 2026', time: 'hace 2 días', type: 'licencia', dot: COLORS.success },
];
const FILTERS = [{ key: 'all', label: 'Todo' }, { key: 'pqrs', label: 'PQRS' }, { key: 'usuarios', label: 'Usuarios' }, { key: 'licencia', label: 'Licencia' }];

export default function ActividadPage() {
  const [filter, setFilter] = useState('all');
  const rows = filter === 'all' ? ACTIVITY : ACTIVITY.filter((a) => a.type === filter);

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="actividad" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Actividad">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Actividad</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Trazabilidad completa de tu conjunto</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => <div key={f.key} onClick={() => setFilter(f.key)} style={tabStyle(filter === f.key)}>{f.label}</div>)}
      </div>

      <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: '22px 24px' }}>
        {rows.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 9, height: 9, borderRadius: 999, background: ev.dot, marginTop: 5, flexShrink: 0 }} />
              {i < rows.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'rgba(0,0,0,0.08)', margin: '3px 0' }} />}
            </div>
            <div style={{ paddingBottom: i < rows.length - 1 ? 18 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{ev.text}</div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, marginTop: 2 }}>{ev.time}</div>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
