'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Toast, useToast } from '@/components/Toast';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/tokens';

const SUMMARY = [
  { label: 'PQRS en el periodo', value: '146', color: '#1D1D1F' },
  { label: 'Tiempo promedio', value: '2.4d', color: COLORS.navy },
  { label: 'Terminadas', value: '128', color: COLORS.success },
  { label: 'Abiertas', value: '18', color: COLORS.warning },
];
const CHART = [18, 24, 16, 30, 22, 27, 19, 21];
const ROWS = [
  { id: 'PQ-0231', subject: 'Ruido excesivo torre 3', assignee: 'Ana Ruiz', closeTime: '—', group: 'abierta' as const },
  { id: 'PQ-0230', subject: 'Fuga de agua zona común', assignee: 'J. Pardo', closeTime: '—', group: 'proceso' as const },
  { id: 'PQ-0229', subject: 'Solicitud de certificado', assignee: 'Ana Ruiz', closeTime: '1.2d', group: 'terminada' as const },
];
const BADGE = { abierta: badgeStyle(COLORS.warningSoft, COLORS.warning), proceso: badgeStyle(COLORS.navySoft, COLORS.navy), terminada: badgeStyle(COLORS.successSoft, COLORS.success) };
const LABEL = { abierta: 'Abierta', proceso: 'En proceso', terminada: 'Terminada' };

export default function ModuloReportesPage() {
  const [filter, setFilter] = useState('all');
  const { toast, showToast } = useToast();
  const max = Math.max(...CHART);
  const rows = filter === 'all' ? ROWS : ROWS.filter((r) => r.group === filter);

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="reportes" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Reportes">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <div><h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 3px' }}>Reportes</h1><p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>Parque Residencial Calle 100</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div onClick={() => showToast('Reporte exportado en Excel ✓')} style={{ border: `1.5px solid ${COLORS.inputBorder}`, fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Excel</div>
          <div onClick={() => showToast('Reporte exportado en PDF ✓')} style={{ border: `1.5px solid ${COLORS.inputBorder}`, fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>PDF</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {[{ key: 'all', label: 'Todas' }, { key: 'abierta', label: 'Abiertas' }, { key: 'proceso', label: 'En proceso' }, { key: 'terminada', label: 'Terminadas' }].map((t) => <div key={t.key} onClick={() => setFilter(t.key)} style={tabStyle(filter === t.key)}>{t.label}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {SUMMARY.map((s) => (
          <div key={s.label} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 20 }}>PQRS radicadas por semana</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 140 }}>
          {CHART.map((v, i) => (
            <div key={i} style={{ flex: 1, minWidth: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{v}</div>
              <div style={{ width: '100%', maxWidth: 32, height: `${Math.max(10, (v / max) * 100)}%`, background: COLORS.navySoft, borderRadius: '6px 6px 0 0' }} />
              <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 600 }}>S{i + 1}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 15, fontWeight: 800 }}>Detalle de PQRS</div>
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 66 }}>{r.id}</span>
            <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, fontWeight: 700 }}>{r.subject}</span>
            <span style={{ fontSize: 12.5, color: COLORS.textSecondary, width: 90 }}>{r.assignee}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 60 }}>{r.closeTime}</span>
            <span style={BADGE[r.group]}>{LABEL[r.group]}</span>
          </div>
        ))}
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
