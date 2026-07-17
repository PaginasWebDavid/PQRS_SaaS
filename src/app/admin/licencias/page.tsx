'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';

type Payment = { id: string; amountCents: number; currency: string; status: string; dueDate: string; paidAt?: string | null };
type LicenseSummary = {
  status: string; autoRenew: boolean; currentPeriodEnd: string; nextPaymentDueDate: string;
  priceCents: number; currency: string; unitsSnapshot: number; pendingUnitsSnapshot?: number | null; pendingPriceCents?: number | null; pendingCurrency?: string | null; pendingPriceEffectiveAt?: string | null; recentPayments: Payment[];
};
type MeData = { tenant?: { name?: string | null; units?: number | null } | null; licenseSummary?: LicenseSummary | null };

function money(cents = 0, currency = 'COP') { return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100); }
function shortDate(value?: string | null) { return value ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Falta primer pago', TRIAL: 'Trial', ACTIVE: 'Activa',
  GRACE_PERIOD: 'En mora', SUSPENDED: 'Suspendida', CANCELLED: 'Cancelada',
};
const STATUS_DOT: Record<string, string> = {
  PENDING_PAYMENT: COLORS.warning, TRIAL: COLORS.navy, ACTIVE: COLORS.success,
  GRACE_PERIOD: COLORS.warning, SUSPENDED: COLORS.textMuted, CANCELLED: COLORS.danger,
};
const NEEDS_PAYMENT = new Set(['PENDING_PAYMENT', 'GRACE_PERIOD', 'SUSPENDED']);

const BADGE = { paid: badgeStyle(COLORS.successSoft, COLORS.success), pending: badgeStyle(COLORS.warningSoft, COLORS.warning) };
const FILTERS = [{ key: 'all', label: 'Todas' }, { key: 'paid', label: 'Pagadas' }, { key: 'pending', label: 'Pendientes' }];

export default function ModuloLicenciasPage() {
  const [filter, setFilter] = useState('all');
  const [detailOpen, setDetailOpen] = useState(false);
  const [me, setMe] = useState<MeData | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [autoRenewLoading, setAutoRenewLoading] = useState(false);
  const { toast, showToast } = useToast();

  const load = () => fetch('/api/me').then((r) => r.ok ? r.json() : null).then(setMe).catch(() => {});
  useEffect(() => { load(); }, []);

  const license = me?.licenseSummary;
  const invoices = (license?.recentPayments || []).map((p, idx) => ({ number: `Factura #${String(idx + 1).padStart(4, '0')}`, date: shortDate(p.paidAt || p.dueDate), amount: money(p.amountCents, p.currency), group: p.status === 'APPROVED' ? 'paid' : 'pending' }));
  const rows = filter === 'all' ? invoices : invoices.filter((i) => i.group === filter);

  async function payNow() {
    setPayLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createPreapproval', backUrl: new URL('/admin/licencias', window.location.origin).toString() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.initPoint) throw new Error(body?.error || 'No se pudo iniciar el pago');
      window.location.href = body.initPoint;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo iniciar el pago');
      setPayLoading(false);
    }
  }

  async function disableAutoRenew() {
    if (!window.confirm('¿Desactivar la renovación automática? Al vencer el período actual, si no pagas manualmente, la licencia entrará en mora.')) return;
    setAutoRenewLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disableAutoRenew' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'No se pudo desactivar');
      showToast('Renovación automática desactivada');
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo desactivar');
    } finally {
      setAutoRenewLoading(false);
    }
  }

  const statusLabel = license ? (STATUS_LABEL[license.status] || license.status) : 'Sin licencia';
  const statusDot = license ? (STATUS_DOT[license.status] || COLORS.textMuted) : COLORS.textMuted;
  const needsPayment = license ? NEEDS_PAYMENT.has(license.status) : false;

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="licencias" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Licencias">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 22px' }}>Licencias y pagos</h1>

      <div style={{ background: COLORS.navy, borderRadius: 20, padding: '30px 34px', color: '#FFFFFF', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(3,1fr)', gap: 26, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 700, marginBottom: 10 }}>ESTADO DE LICENCIA</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 9, height: 9, borderRadius: 999, background: statusDot }} />
              <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.015em' }}>{statusLabel}</span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.navyMuted }}>{me?.tenant?.name || 'Conjunto'}</div>
          </div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>Plan</div><div style={{ fontSize: 16, fontWeight: 800 }}>{license ? `${license.unitsSnapshot} unidades` : '—'}</div></div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>Unidades</div><div style={{ fontSize: 16, fontWeight: 800 }}>{me?.tenant?.units || license?.unitsSnapshot || '—'}</div></div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>Próxima renovación</div><div style={{ fontSize: 16, fontWeight: 800 }}>{shortDate(license?.currentPeriodEnd)}</div></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 20 }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Historial de pagos</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {FILTERS.map((t) => <button key={t.key} type="button" onClick={() => setFilter(t.key)} style={{ ...tabStyle(filter === t.key), border: 'none', fontFamily: 'inherit' }}>{t.label}</button>)}
            </div>
          </div>
          {rows.length ? rows.map((inv) => (
            <div key={inv.number} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <span style={{ flex: 1, minWidth: 100, fontSize: 13.5, fontWeight: 700 }}>{inv.number}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 110 }}>{inv.date}</span>
              <span style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 600, width: 120, textAlign: 'right' }}>{inv.amount}</span>
              <span style={BADGE[inv.group as keyof typeof BADGE]}>{inv.group === 'paid' ? 'Pagado' : 'Pendiente'}</span>
            </div>
          )) : <div style={{ padding: 24, color: COLORS.textMuted, fontWeight: 600 }}>No hay pagos registrados.</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>{needsPayment ? 'Pago pendiente' : 'Próxima factura'}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{money(license?.priceCents || 0, license?.currency)}</div>
            <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 18 }}>{needsPayment ? 'Paga ahora para activar tu licencia' : `Vence el ${shortDate(license?.nextPaymentDueDate)}`}</div>
            <button type="button" onClick={() => setDetailOpen((v) => !v)} style={{ width: '100%', background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '12px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer', marginBottom: 10 }}>{detailOpen ? 'Ocultar detalle' : 'Ver detalle de factura'}</button>
            {needsPayment ? (
              <button type="button" onClick={payNow} disabled={payLoading} style={{ width: '100%', background: COLORS.success, color: '#FFFFFF', textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>{payLoading ? 'Redirigiendo…' : 'Pagar ahora con Mercado Pago'}</button>
            ) : (
              <button type="button" onClick={payNow} disabled={payLoading} style={{ width: '100%', background: 'transparent', border: `1.5px solid ${COLORS.inputBorder}`, textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, fontFamily: 'inherit', cursor: 'pointer' }}>{payLoading ? 'Redirigiendo…' : 'Renovar / cambiar método de pago'}</button>
            )}
            {detailOpen && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: 12.5, color: COLORS.textSecondaryAlt, lineHeight: 1.8 }}>
                Plan actual — {license ? `${license.unitsSnapshot} unidades` : '—'}<br />
                Estado — {statusLabel}<br />
                <strong style={{ color: '#1D1D1F' }}>Total: {money(license?.priceCents || 0, license?.currency)}</strong>
                {license?.pendingPriceCents != null && license.pendingUnitsSnapshot != null && (
                  <><br />Nueva tarifa desde la proxima renovacion: {money(license.pendingPriceCents, license.pendingCurrency || license.currency)} por {license.pendingUnitsSnapshot} unidades.</>
                )}
              </div>
            )}
          </div>

          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>Renovación automática</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: license?.autoRenew ? COLORS.success : COLORS.textMuted }} />
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{license?.autoRenew ? 'Activada' : 'Desactivada'}</span>
            </div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500, lineHeight: 1.6, margin: '0 0 12px' }}>
              {license?.autoRenew
                ? 'Mercado Pago cobrará automáticamente cada mes. Si la desactivas, deberás pagar manualmente antes de cada vencimiento.'
                : 'Debes pagar manualmente cada mes. Al volver a pagar con el botón de arriba, la renovación automática se reactiva.'}
            </p>
            {license?.autoRenew && (
              <button type="button" onClick={disableAutoRenew} disabled={autoRenewLoading} style={{ border: 0, background: 'none', color: COLORS.danger, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>{autoRenewLoading ? 'Desactivando…' : 'Desactivar renovación automática'}</button>
            )}
          </div>
        </div>
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
