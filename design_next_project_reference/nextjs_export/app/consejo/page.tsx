'use client';
import { useState } from 'react';
import Link from 'next/link';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/tokens';
import { BrandLockup } from '@/components/Logo';
import { Sheet, CloseButton, useIsMobile } from '@/components/Sheet';

type Group = 'abierta' | 'proceso' | 'terminada';
const NAV = [{ key: 'pqrs', label: 'PQRS' }, { key: 'reportes', label: 'Reportes' }, { key: 'historial', label: 'Historial' }];
const METRICS = [
  { label: 'PQRS abiertas', value: '24', color: COLORS.warning },
  { label: 'En proceso', value: '12', color: COLORS.navy },
  { label: 'Cerradas', value: '128', color: COLORS.success },
  { label: 'Tiempo promedio', value: '2.4d', color: '#1D1D1F' },
];
const ROWS = [
  { id: 'PQ-0231', subject: 'Ruido excesivo torre 3', assignee: 'Ana Ruiz', date: '07 jul', group: 'abierta' as Group, history: [{ text: 'Radicada por el residente', time: '07 jul · 08:12' }] },
  { id: 'PQ-0230', subject: 'Fuga de agua zona común', assignee: 'J. Pardo', date: '06 jul', group: 'proceso' as Group, history: [{ text: 'Radicada por el residente', time: '06 jul · 14:02' }, { text: 'En revisión técnica', time: '06 jul · 15:10' }] },
  { id: 'PQ-0229', subject: 'Solicitud de certificado', assignee: 'Ana Ruiz', date: '05 jul', group: 'terminada' as Group, history: [{ text: 'Radicada por el residente', time: '05 jul · 10:00' }, { text: 'Certificado emitido', time: '05 jul · 16:20' }] },
];
const BADGE = { abierta: badgeStyle(COLORS.warningSoft, COLORS.warning), proceso: badgeStyle(COLORS.navySoft, COLORS.navy), terminada: badgeStyle(COLORS.successSoft, COLORS.success) };
const LABEL = { abierta: 'Abierta', proceso: 'En proceso', terminada: 'Terminada' };
const FILTERS = [{ key: 'all', label: 'Todas' }, { key: 'abierta', label: 'Abiertas' }, { key: 'proceso', label: 'En proceso' }, { key: 'terminada', label: 'Terminadas' }];

export default function VistaConsejoPage() {
  const isMobile = useIsMobile();
  const [nav, setNav] = useState('pqrs');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = filter === 'all' ? ROWS : ROWS.filter((r) => r.group === filter);
  const selected = ROWS.find((r) => r.id === selectedId);

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F' }}>
      {!isMobile && (
        <div style={{ width: 250, flexShrink: 0, borderRight: `1px solid ${COLORS.borderSoft}`, background: COLORS.bgSidebar, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '24px 16px' }}>
          <div style={{ padding: '0 8px 20px' }}><BrandLockup /></div>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: '13px 15px', marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 5 }}>CONJUNTO</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Parque Residencial Calle 100</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {NAV.map((n) => (
              <div key={n.key} onClick={() => setNav(n.key)} style={{ padding: '9px 11px', borderRadius: 9, fontSize: 13, cursor: 'pointer', fontWeight: nav === n.key ? 700 : 600, background: nav === n.key ? COLORS.navySoft : 'transparent', color: nav === n.key ? COLORS.navy : COLORS.textSecondaryAlt }}>{n.label}</div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${COLORS.borderSoft}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>CM</div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 800 }}>Camila Molina</div><div style={{ fontSize: 10.5, color: COLORS.textMuted }}>Consejo de Administración</div></div>
            <Link href="/login" style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>Salir</Link>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '24px 20px 70px' : '36px 40px 90px' }}>
          <h1 className="apl-up" style={{ fontSize: isMobile ? 23 : 27, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Panel de supervisión</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 22px' }}>Parque Residencial Calle 100 · Solo lectura</p>

          {nav === 'pqrs' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
                {METRICS.map((m) => (
                  <div key={m.label} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 18 }}>
                    <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>{m.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                {FILTERS.map((f) => <div key={f.key} onClick={() => setFilter(f.key)} style={tabStyle(filter === f.key)}>{f.label}</div>)}
              </div>
              <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
                {rows.map((r) => (
                  <div key={r.id} onClick={() => setSelectedId(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer' }}>
                    <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, fontWeight: 700 }}>{r.subject}</span>
                    <span style={{ fontSize: 12.5, color: COLORS.textSecondary, width: 90 }}>{r.assignee}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 50 }}>{r.date}</span>
                    <span style={BADGE[r.group]}>{LABEL[r.group]}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {nav === 'reportes' && (
            <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>PQRS por estado (solo lectura)</div>
              <p style={{ fontSize: 12.5, color: COLORS.textMuted }}>Los reportes exportables están disponibles para el administrador del conjunto.</p>
            </div>
          )}

          {nav === 'historial' && (
            <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 18 }}>Historial general del conjunto</div>
              {ROWS.flatMap((r) => r.history.map((h) => ({ subject: r.subject, ...h }))).map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 11, marginBottom: 16 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: COLORS.inputBorderStrong, marginTop: 6, flexShrink: 0 }} />
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>{h.subject} <span style={{ fontWeight: 500, color: COLORS.textSecondary }}>— {h.text}</span></div><div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{h.time}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!selected} onClose={() => setSelectedId(null)} maxWidth={460}>
        {selected && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted }}>{selected.id}</span>
              <CloseButton onClick={() => setSelectedId(null)} />
            </div>
            <span style={BADGE[selected.group]}>{LABEL[selected.group]}</span>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: '14px 0 22px' }}>{selected.subject}</h3>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Historial</div>
            {selected.history.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: COLORS.inputBorderStrong, marginTop: 6, flexShrink: 0 }} />
                <div><div style={{ fontSize: 13, fontWeight: 500 }}>{h.text}</div><div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>{h.time}</div></div>
              </div>
            ))}
          </>
        )}
      </Sheet>
    </div>
  );
}
