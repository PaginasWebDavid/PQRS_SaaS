'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, FileText, ShieldCheck } from 'lucide-react';
import { AdminShell } from '@/components/shell/AdminShell';
import { CloseButton, Sheet, useIsMobile } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';
import { SUBSCRIPTION_STATUS_LABEL } from '@/lib/design/licenseStatus';
import { paymentProviderLabel } from '@/lib/design/billing';

type Payment = { id: string; amountCents: number; currency: string; status: string; provider: string; dueDate: string; paidAt?: string | null; createdAt?: string; concept?: string };
type LicenseSummary = {
  status: string; autoRenew: boolean; currentPeriodEnd: string; nextPaymentDueDate: string;
  priceCents: number; currency: string; unitsSnapshot: number; pendingUnitsSnapshot?: number | null; pendingPriceCents?: number | null; pendingCurrency?: string | null; pendingPriceEffectiveAt?: string | null; recentPayments: Payment[];
};
type CommercialSummary = { status: string; pilotAccessEndsAt?: string | null; postPilotPriceCents?: number | null; currency?: string; billingMode?: string | null; contractedPeriodEndsAt?: string | null; implementationType?: string | null; nextAction?: string | null; nextActionDueAt?: string | null };
type MeData = { tenant?: { name?: string | null; units?: number | null } | null; licenseSummary?: LicenseSummary | null; commercial?: CommercialSummary | null; entitlements?: { reservations: boolean; residentPayments: boolean } | null };
type AutomaticPaymentState = {
  environment: 'sandbox' | 'production';
  automaticEnabled: boolean;
  method: { id: string; type: 'CARD'; status: 'ACTIVE' | 'REVOKED'; brand: string | null; lastFour: string | null; expMonth: string | null; expYear: string | null; customerEmail: string; consentedAt: string } | null;
};
type AutomaticPaymentSetup = AutomaticPaymentState & {
  publicKey: string;
  agreements: { termsUrl: string; personalDataUrl: string };
};

function money(cents = 0, currency = 'COP') { return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100); }
function shortDate(value?: string | null) { return value ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }

const STATUS_LABEL = SUBSCRIPTION_STATUS_LABEL;
const STATUS_DOT: Record<string, string> = {
  PENDING_PAYMENT: COLORS.warning, TRIAL: COLORS.navy, ACTIVE: COLORS.success,
  GRACE_PERIOD: COLORS.warning, SUSPENDED: COLORS.textMuted, CANCELLED: COLORS.danger,
};
const NEEDS_PAYMENT = new Set(['PENDING_PAYMENT', 'GRACE_PERIOD', 'SUSPENDED']);

const BADGE = {
  paid: badgeStyle(COLORS.successSoft, COLORS.success),
  pending: badgeStyle(COLORS.warningSoft, COLORS.warning),
  rejected: badgeStyle(COLORS.dangerSoft, COLORS.danger),
  courtesy: badgeStyle(COLORS.navySoft, COLORS.navy),
};
const FILTERS = [{ key: 'all', label: 'Todas' }, { key: 'paid', label: 'Pagadas' }, { key: 'pending', label: 'Pendientes' }, { key: 'rejected', label: 'Rechazadas' }, { key: 'courtesy', label: 'Cortesias' }];

function paymentGroup(payment: Payment) {
  if (payment.provider === 'COURTESY') return 'courtesy';
  if (payment.status === 'APPROVED') return 'paid';
  if (payment.status === 'REJECTED') return 'rejected';
  return 'pending';
}

function paymentGroupLabel(group: string) {
  if (group === 'courtesy') return 'Cortesia';
  if (group === 'paid') return 'Pagado';
  if (group === 'rejected') return 'Rechazado';
  return 'Pendiente';
}

export default function ModuloLicenciasPage() {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState('all');
  const [documentOpen, setDocumentOpen] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [me, setMe] = useState<MeData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [automaticPayment, setAutomaticPayment] = useState<AutomaticPaymentState | null>(null);
  const [automaticSetup, setAutomaticSetup] = useState<AutomaticPaymentSetup | null>(null);
  const [automaticLoading, setAutomaticLoading] = useState(false);
  const [automaticSheetOpen, setAutomaticSheetOpen] = useState(false);
  const [acceptedWompiTerms, setAcceptedWompiTerms] = useState(false);
  const [acceptedWompiPersonalData, setAcceptedWompiPersonalData] = useState(false);
  const tokenFormRef = useRef<HTMLFormElement>(null);
  const { toast, showToast } = useToast();

  const load = async () => {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) throw new Error('profile');
      setMe(await response.json());
      setLoadError('');
    } catch {
      setLoadError('No se pudo cargar la información de la licencia.');
    }
  };
  useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;
    const returnedFromWompi = new URLSearchParams(window.location.search).get('payment') === 'wompi';

    const refresh = async (attempt = 0): Promise<void> => {
      await load();
      if (cancelled || !returnedFromWompi) return;
      if (attempt >= 3) {
        window.history.replaceState({}, '', '/admin/licencias');
        return;
      }
      timeout = window.setTimeout(() => { void refresh(attempt + 1); }, 2000);
    };

    void refresh();
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  const loadAutomaticPaymentState = async () => {
    try {
      const response = await fetch('/api/billing/wompi/payment-method', { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'No se pudo consultar el cobro automatico');
      setAutomaticPayment(body as AutomaticPaymentState);
    } catch {
      setAutomaticPayment(null);
    }
  };

  useEffect(() => {
    void loadAutomaticPaymentState();
    const result = new URLSearchParams(window.location.search).get('automaticPayment');
    if (!result) return;
    window.history.replaceState({}, '', '/admin/licencias');
    window.setTimeout(() => showToast(result === 'enabled' ? 'Cobro automatico activado' : 'No se pudo activar el cobro automatico'), 0);
  }, [showToast]);

  useEffect(() => {
    const form = tokenFormRef.current;
    if (!automaticSheetOpen || !automaticSetup?.publicKey || !acceptedWompiTerms || !acceptedWompiPersonalData || !form) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.wompi.co/widget.js';
    script.async = true;
    script.setAttribute('data-render', 'button');
    script.setAttribute('data-widget-operation', 'tokenize');
    script.setAttribute('data-public-key', automaticSetup.publicKey);
    form.appendChild(script);
    return () => script.remove();
  }, [automaticSheetOpen, automaticSetup?.publicKey, acceptedWompiTerms, acceptedWompiPersonalData]);

  const license = me?.licenseSummary;
  const invoices = (license?.recentPayments || []).map((p, idx) => {
    const courtesy = p.provider === 'COURTESY';
    return {
      number: courtesy ? `Cortesia #${String(idx + 1).padStart(4, '0')}` : `Pago #${String(idx + 1).padStart(4, '0')}`,
      date: shortDate(p.paidAt || p.dueDate),
      amount: courtesy ? 'Sin cobro' : money(p.amountCents, p.currency),
      group: paymentGroup(p),
      providerLabel: paymentProviderLabel(p.provider),
    };
  });
  const rows = filter === 'all' ? invoices : invoices.filter((i) => i.group === filter);

  async function payNow() {
    setPayLoading(true);
    try {
      const res = await fetch('/api/billing/wompi/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: `wompi_${crypto.randomUUID().replaceAll('-', '')}` }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.checkoutUrl) throw new Error(body?.error || 'No se pudo iniciar el pago');
      window.location.href = body.checkoutUrl;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo iniciar el pago');
      setPayLoading(false);
    }
  }

  async function openAutomaticSetup() {
    setAutomaticLoading(true);
    try {
      const response = await fetch('/api/billing/wompi/payment-method?setup=1', { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'No se pudo preparar el cobro automatico');
      setAutomaticSetup(body as AutomaticPaymentSetup);
      setAcceptedWompiTerms(false);
      setAcceptedWompiPersonalData(false);
      setAutomaticSheetOpen(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo preparar el cobro automatico');
    } finally {
      setAutomaticLoading(false);
    }
  }

  async function setAutomaticRenewal(enabled: boolean) {
    setAutomaticLoading(true);
    try {
      const response = await fetch('/api/billing/wompi/payment-method', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'No se pudo actualizar el cobro automatico');
      setAutomaticPayment((current) => current ? { ...current, automaticEnabled: Boolean(body.automaticEnabled) } : current);
      showToast(enabled ? 'Cobro automatico activado' : 'Cobro automatico desactivado');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo actualizar el cobro automatico');
    } finally {
      setAutomaticLoading(false);
    }
  }

  async function removeAutomaticPaymentMethod() {
    if (!window.confirm('Se desactivara el cobro automatico y PQRS Services dejara de usar la tarjeta guardada.')) return;
    setAutomaticLoading(true);
    try {
      const response = await fetch('/api/billing/wompi/payment-method', { method: 'DELETE' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'No se pudo eliminar el medio de pago');
      setAutomaticPayment((current) => current ? { ...current, automaticEnabled: false, method: null } : current);
      showToast('Tarjeta desvinculada del cobro automatico');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo eliminar el medio de pago');
    } finally {
      setAutomaticLoading(false);
    }
  }

  async function downloadBillingDocument() {
    setDocumentLoading(true);
    try {
      const response = await fetch('/api/billing/document', { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'No se pudo generar el documento');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] || 'cuenta-cobro-pqrs-services.pdf';
      link.click();
      URL.revokeObjectURL(url);
      showToast('Documento descargado');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo generar el documento');
    } finally {
      setDocumentLoading(false);
    }
  }

  const statusLabel = license ? (STATUS_LABEL[license.status] || license.status) : 'Sin licencia';
  const statusDot = license ? (STATUS_DOT[license.status] || COLORS.textMuted) : COLORS.textMuted;
  const isPaidPilot = ['PILOT_PREPARATION', 'PILOT_ACTIVE', 'PILOT_EVALUATION'].includes(me?.commercial?.status || '');
  const needsPayment = license ? NEEDS_PAYMENT.has(license.status) && !isPaidPilot : false;
  const visibleStatusLabel = isPaidPilot ? 'Piloto guiado' : statusLabel;
  const activeAddOns = [me?.entitlements?.reservations ? 'Reservas' : null, me?.entitlements?.residentPayments ? 'Pagos de residentes' : null].filter(Boolean) as string[];
  const automaticMethod = automaticPayment?.method;
  const automaticAvailable = automaticMethod?.status === 'ACTIVE';
  const automaticLabel = automaticAvailable
    ? `${automaticMethod?.brand || 'Tarjeta'}${automaticMethod?.lastFour ? ` •••• ${automaticMethod.lastFour}` : ''}`
    : null;

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="licencias" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Licencias">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 22px' }}>Licencias y pagos</h1>
      {loadError && <p style={{ color: COLORS.danger, fontSize: 13, fontWeight: 700, margin: '-10px 0 20px' }}>{loadError}</p>}

      <div style={{ background: COLORS.navy, borderRadius: 20, padding: isMobile ? '22px 20px' : '30px 34px', color: '#FFFFFF', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : '1.4fr repeat(3,minmax(0,1fr))', gap: isMobile ? 18 : 26, alignItems: isMobile ? 'start' : 'center' }}>
          <div style={isMobile ? { gridColumn: 'span 2' } : undefined}>
            <div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 700, marginBottom: 10 }}>ESTADO DE LICENCIA</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 9, height: 9, borderRadius: 999, background: statusDot }} />
              <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.015em' }}>{visibleStatusLabel}</span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.navyMuted }}>{me?.tenant?.name || 'Conjunto'}</div>
          </div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>Plan de unidades</div><div style={{ fontSize: 16, fontWeight: 800 }}>{license ? `${license.unitsSnapshot} unidades` : '—'}</div></div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>Unidades contratadas</div><div style={{ fontSize: 16, fontWeight: 800 }}>{me?.tenant?.units || license?.unitsSnapshot || '—'}</div></div>
          <div><div style={{ fontSize: 11.5, color: COLORS.navyText, fontWeight: 600, marginBottom: 6 }}>{isPaidPilot ? 'Finaliza el piloto' : 'Próxima renovación'}</div><div style={{ fontSize: 16, fontWeight: 800 }}>{shortDate(isPaidPilot ? me?.commercial?.pilotAccessEndsAt : license?.currentPeriodEnd)}</div></div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.14)', fontSize: 12.5, color: COLORS.navyText, fontWeight: 600 }}>
          Plan Gestión · {activeAddOns.length ? `Add-ons: ${activeAddOns.join(', ')}` : 'sin add-ons contratados'}
          {isPaidPilot && me?.commercial?.postPilotPriceCents ? ` · Precio posterior: ${money(me.commercial.postPilotPriceCents, me.commercial.currency || license?.currency)}` : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.7fr 1fr', gap: 20 }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Historial de pagos</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map((t) => <button key={t.key} type="button" onClick={() => setFilter(t.key)} style={{ ...tabStyle(filter === t.key), border: 'none', fontFamily: 'inherit' }}>{t.label}</button>)}
            </div>
          </div>
          {rows.length ? rows.map((inv) => (
            isMobile ? (
              <div key={inv.number} style={{ padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{inv.number}</span>
                  <span style={BADGE[inv.group as keyof typeof BADGE]}>{paymentGroupLabel(inv.group)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted }}>{inv.date}</span>
                  <span style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 600 }}>{inv.amount} - {inv.providerLabel}</span>
                </div>
              </div>
            ) : (
              <div key={inv.number} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ flex: 1, minWidth: 100, fontSize: 13.5, fontWeight: 700 }}>{inv.number}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 110 }}>{inv.date}</span>
                <span style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 600, width: 150, textAlign: 'right' }}>{inv.amount}<br /><small>{inv.providerLabel}</small></span>
                <span style={BADGE[inv.group as keyof typeof BADGE]}>{paymentGroupLabel(inv.group)}</span>
              </div>
            )
          )) : <div style={{ padding: 24, color: COLORS.textMuted, fontWeight: 600 }}>No hay pagos registrados.</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>{isPaidPilot ? 'Precio posterior al piloto' : needsPayment ? 'Pago pendiente' : 'Próxima factura'}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{money(isPaidPilot ? (me?.commercial?.postPilotPriceCents || 0) : (license?.priceCents || 0), me?.commercial?.currency || license?.currency)}</div>
            <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 18 }}>{isPaidPilot ? `El piloto ya está pagado y termina el ${shortDate(me?.commercial?.pilotAccessEndsAt)}` : needsPayment ? 'Paga ahora para activar tu licencia' : `Vence el ${shortDate(license?.nextPaymentDueDate)}`}</div>
            <button type="button" onClick={() => setDocumentOpen(true)} style={{ width: '100%', background: COLORS.navy, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '12px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer', marginBottom: 10 }}><FileText size={16} />Ver resumen de licencia</button>
            {isPaidPilot ? null : needsPayment ? (
              <button type="button" onClick={payNow} disabled={payLoading} style={{ width: '100%', background: COLORS.success, color: '#FFFFFF', textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>{payLoading ? 'Abriendo el portal de pagos…' : 'Pagar mensualidad'}</button>
            ) : (
              <button type="button" onClick={payNow} disabled={payLoading} style={{ width: '100%', background: 'transparent', border: `1.5px solid ${COLORS.inputBorder}`, textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, fontFamily: 'inherit', cursor: 'pointer' }}>{payLoading ? 'Abriendo el portal de pagos…' : 'Renovar o actualizar el pago'}</button>
            )}
          </div>

          {!isPaidPilot && <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>Pagos mensuales</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: automaticPayment?.automaticEnabled ? COLORS.success : COLORS.warning }} />
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Pago en línea disponible</span>
            </div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
              Elige PSE, tarjeta, Nequi o Bancolombia en Wompi. La licencia se actualiza únicamente después de la confirmación del pago.
            </p>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.borderSoft}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <ShieldCheck size={15} color={automaticPayment?.automaticEnabled ? COLORS.success : COLORS.textMuted} />
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {automaticPayment?.automaticEnabled ? 'Cobro automatico activo' : 'Cobro automatico opcional'}
                </span>
              </div>
              <p style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500, lineHeight: 1.55, margin: '0 0 12px' }}>
                {automaticPayment?.automaticEnabled && automaticLabel
                  ? `Wompi cobrara cada renovacion con ${automaticLabel}. El pago manual sigue disponible como alternativa.`
                  : 'Activalo con una tarjeta guardada en Wompi. PQRS Services no almacena los datos de tu tarjeta.'}
              </p>
              {automaticAvailable ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button type="button" onClick={() => void setAutomaticRenewal(!automaticPayment?.automaticEnabled)} disabled={automaticLoading} style={{ border: `1.5px solid ${COLORS.inputBorder}`, background: '#FFFFFF', color: COLORS.textPrimary, borderRadius: RADIUS.pill, padding: '10px 8px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: automaticLoading ? 'wait' : 'pointer' }}>
                    {automaticPayment?.automaticEnabled ? 'Desactivar cobro' : 'Activar cobro'}
                  </button>
                  <button type="button" onClick={() => void removeAutomaticPaymentMethod()} disabled={automaticLoading} style={{ border: 'none', background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: RADIUS.pill, padding: '10px 8px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: automaticLoading ? 'wait' : 'pointer' }}>
                    Desvincular tarjeta
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => void openAutomaticSetup()} disabled={automaticLoading} style={{ width: '100%', border: `1.5px solid ${COLORS.inputBorder}`, background: '#FFFFFF', color: COLORS.navy, borderRadius: RADIUS.pill, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: automaticLoading ? 'wait' : 'pointer' }}>
                  <ShieldCheck size={15} />{automaticLoading ? 'Preparando Wompi...' : 'Activar cobro automatico'}
                </button>
              )}
            </div>
          </div>}
        </div>
      </div>

      <Sheet open={documentOpen} onClose={() => setDocumentOpen(false)} maxWidth={540}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 5 }}>PQRS SERVICES</div>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.015em' }}>Resumen de licencia</h2>
          </div>
          <CloseButton onClick={() => setDocumentOpen(false)} />
        </div>
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.cardSm, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ padding: '16px 18px', background: COLORS.bgCard, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{me?.tenant?.name || 'Conjunto'}</div>
            <div style={{ marginTop: 5, color: COLORS.textSecondary, fontSize: 12.5, fontWeight: 600 }}>Licencia mensual PQRS Services</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '14px 20px', padding: 18, fontSize: 13 }}>
            <span style={{ color: COLORS.textSecondary }}>Unidades contratadas</span><strong>{license?.unitsSnapshot || me?.tenant?.units || 0}</strong>
            <span style={{ color: COLORS.textSecondary }}>Estado de licencia</span><strong>{visibleStatusLabel}</strong>
            <span style={{ color: COLORS.textSecondary }}>Proximo vencimiento</span><strong>{shortDate(license?.nextPaymentDueDate)}</strong>
            <span style={{ color: COLORS.textSecondary, fontWeight: 700 }}>Total a pagar</span><strong style={{ fontSize: 17 }}>{money(license?.priceCents || 0, license?.currency)}</strong>
          </div>
        </div>
        <p style={{ margin: '0 0 18px', color: COLORS.textMuted, fontSize: 12, lineHeight: 1.6 }}>
          El PDF incluye los datos vigentes del conjunto, la licencia, el periodo y el valor de la renovacion.
        </p>
        <button type="button" onClick={downloadBillingDocument} disabled={documentLoading} style={{ width: '100%', background: COLORS.navy, color: '#FFFFFF', border: 'none', borderRadius: RADIUS.pill, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: documentLoading ? 'wait' : 'pointer' }}><Download size={16} />{documentLoading ? 'Generando documento...' : 'Descargar PDF'}</button>
      </Sheet>

      <Sheet open={automaticSheetOpen} onClose={() => setAutomaticSheetOpen(false)} maxWidth={520}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 5 }}>WOMPI</div>
            <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.015em' }}>Activar cobro automatico</h2>
          </div>
          <CloseButton onClick={() => setAutomaticSheetOpen(false)} />
        </div>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: 500, lineHeight: 1.6, margin: '0 0 18px' }}>
          Autoriza una tarjeta una sola vez. Wompi procesa y conserva los datos del medio de pago; PQRS Services solo recibe una referencia enmascarada.
        </p>
        {automaticSetup?.environment === 'sandbox' && (
          <div style={{ background: COLORS.warningSoft, color: COLORS.warning, borderRadius: RADIUS.cardSm, padding: '10px 12px', fontSize: 12, fontWeight: 700, lineHeight: 1.5, marginBottom: 16 }}>
            Estas en modo de pruebas. No se realizara ningun cobro real.
          </div>
        )}
        <form ref={tokenFormRef} method="POST" action="/api/billing/wompi/payment-method/token">
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.55, marginBottom: 12, cursor: 'pointer' }}>
            <input name="wompi_terms" type="checkbox" value="accepted" checked={acceptedWompiTerms} onChange={(event) => setAcceptedWompiTerms(event.target.checked)} style={{ marginTop: 3, accentColor: COLORS.navy }} />
            <span>He leido y acepto los <a href={automaticSetup?.agreements.termsUrl || '#'} target="_blank" rel="noreferrer" style={{ color: COLORS.navy, fontWeight: 700 }}>terminos de Wompi</a>.</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.55, marginBottom: 18, cursor: 'pointer' }}>
            <input name="wompi_personal_data" type="checkbox" value="accepted" checked={acceptedWompiPersonalData} onChange={(event) => setAcceptedWompiPersonalData(event.target.checked)} style={{ marginTop: 3, accentColor: COLORS.navy }} />
            <span>Autorizo el <a href={automaticSetup?.agreements.personalDataUrl || '#'} target="_blank" rel="noreferrer" style={{ color: COLORS.navy, fontWeight: 700 }}>tratamiento de datos personales</a> por Wompi.</span>
          </label>
          {!acceptedWompiTerms || !acceptedWompiPersonalData ? (
            <div style={{ border: `1px dashed ${COLORS.inputBorder}`, borderRadius: RADIUS.cardSm, padding: 13, color: COLORS.textMuted, fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
              Acepta ambos documentos para continuar.
            </div>
          ) : null}
        </form>
        <p style={{ color: COLORS.textMuted, fontSize: 11.5, lineHeight: 1.55, margin: '16px 0 0' }}>
          Puedes desactivar el cobro automatico o eliminar la tarjeta guardada en cualquier momento desde esta pagina.
        </p>
      </Sheet>

      <Toast message={toast} />
    </AdminShell>
  );
}
