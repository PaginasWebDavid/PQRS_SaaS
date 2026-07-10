'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Toast, useToast } from '@/components/Toast';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/tokens';

type InvGroup = 'paid' | 'pending';
const INVOICES: { number: string; date: string; amount: string; group: InvGroup }[] = [
  { number: 'Factura #0056', date: '15 jun 2026', amount: '$1.240.000', group: 'paid' },
  { number: 'Factura #0055', date: '15 may 2026', amount: '$1.240.000', group: 'paid' },
  { number: 'Factura #0053', date: '15 mar 2026', amount: '$1.180.000', group: 'pending' },
];
const BADGE = { paid: badgeStyle(COLORS.successSoft, COLORS.success), pending: badgeStyle(COLORS.warningSoft, COLORS.warning) };

export default function ModuloLicenciasPage() {
  const [filter, setFilter] = useState<'all' | InvGroup>('all');
  const [detailOpen, setDetailOpen] = useState(false);
  const { toast, showToast } = useToast();
  const rows = filter === 'all' ? INVOICES : INVOICES.filter((i) => i.group === filter);

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="licencias" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Licencias">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 22px' }}>Licencias y pagos</h1>

      <div style={{ background: COLORS.navy, borderRadius: 20, padding: '30px 34px', color: '#FFFFFF', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(3,1fr)', gap: 26, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 700, marginBottom: 10 }}>ESTADO DE LICENCIA</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 9, height: 9, borderRadius: 999, background: '#5FD394' }} />
              <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.015em' }}>Activa</span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.navyMuted }}>Parque Residencial Calle 100</div>
          </div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>Plan</div><div style={{ fontSize: 16, fontWeight: 800 }}>301–500 unidades</div></div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>Unidades</div><div style={{ fontSize: 16, fontWeight: 800 }}>312</div></div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>Próxima renovación</div><div style={{ fontSize: 16, fontWeight: 800 }}>15 ago 2026</div></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 20 }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Historial de pagos</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ key: 'all', label: 'Todas' }, { key: 'paid', label: 'Pagadas' }, { key: 'pending', label: 'Pendientes' }].map((t) => <div key={t.key} onClick={() => setFilter(t.key as any)} style={tabStyle(filter === t.key)}>{t.label}</div>)}
            </div>
          </div>
          {rows.map((inv) => (
            <div key={inv.number} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <span style={{ flex: 1, minWidth: 100, fontSize: 13.5, fontWeight: 700 }}>{inv.number}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 90 }}>{inv.date}</span>
              <span style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 600, width: 100, textAlign: 'right' }}>{inv.amount}</span>
              <span style={BADGE[inv.group]}>{inv.group === 'paid' ? 'Pagado' : 'Pendiente'}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>Próxima factura</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>$1.240.000</div>
            <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 18 }}>Vence el 15 de agosto de 2026</div>
            <div onClick={() => setDetailOpen((v) => !v)} style={{ background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '12px 0', borderRadius: RADIUS.pill, cursor: 'pointer', marginBottom: 10 }}>{detailOpen ? 'Ocultar detalle' : 'Ver detalle de factura'}</div>
            <div onClick={() => showToast('Solicitud de renovación enviada ✓')} style={{ border: `1.5px solid ${COLORS.inputBorder}`, textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Renovar licencia</div>
            {detailOpen && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: 12.5, color: COLORS.textSecondaryAlt, lineHeight: 1.8 }}>
                Cuota administración (312 un.) — $1.100.000<br />Servicio de plataforma — $140.000<br /><strong style={{ color: '#1D1D1F' }}>Total: $1.240.000</strong>
              </div>
            )}
          </div>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 12 }}>Método de pago</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 38, height: 26, borderRadius: 6, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>PSE</div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Débito automático</div>
            </div>
          </div>
        </div>
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
