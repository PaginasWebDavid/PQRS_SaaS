'use client';

import { useEffect, useMemo, useState } from 'react';
import { COLORS, RADIUS, badgeStyle } from '@/lib/design/tokens';

type CommercialProfile = {
  commercialStatus: string; pilotPriceCents: number | null; postPilotListPriceCents: number | null;
  postPilotContractPriceCents: number | null; currency: string; pilotPreparationStartsAt: string | null;
  pilotLaunchAt: string | null; pilotRealUseStartsAt: string | null; pilotEvaluationAt: string | null;
  decisionDueAt: string | null; pilotAccessEndsAt: string | null; nextAction: string | null; nextActionDueAt: string | null;
  billingMode: string | null; contractedPeriodEndsAt: string | null; isFounderCustomer: boolean; founderNumber: number | null;
  priceProtectedUntil: string | null; implementationType: string; implementationStatus: string;
  implementationListFeeCents: number; implementationEffectiveFeeCents: number; referralName: string | null;
  referralAgreementType: string; commissionStatus: string; commissionEligibleCents: number | null;
  documentsAcceptedAt: string | null; pilotPaymentConfirmedAt: string | null; residentBaseReceivedAt: string | null;
  categoriesConfiguredAt: string | null; administratorInvitedAt: string | null; trainingCompletedAt: string | null;
  smokeTestApprovedAt: string | null; launchCommunicationSentAt: string | null;
};

type Entitlement = { feature: 'RESERVATIONS' | 'RESIDENT_PAYMENTS'; status: string; priceCents: number | null };
export type CommercialMetrics = { totalDaysRemaining: number | null; realUseDays: number; pqrsCreated: number; pqrsClosed: number; usersInvited: number; usersActivated: number; supportTickets: number; firstPqrsAt: string | null };
export type CommercialTenantDetail = { commercialProfile?: CommercialProfile | null; featureEntitlements?: Entitlement[] };

const STATUS_LABEL: Record<string, string> = {
  LEGACY_REVIEW: 'Revisión pendiente', PILOT_PENDING_PAYMENT: 'Piloto pendiente de pago', PILOT_PREPARATION: 'Preparación',
  PILOT_ACTIVE: 'Piloto activo', PILOT_EVALUATION: 'En evaluación', CONVERTED_MONTHLY: 'Convertido mensual',
  CONVERTED_ANNUAL: 'Convertido anual', NOT_CONVERTED: 'No convertido', CANCELLED: 'Cancelado',
};
const CHECKLIST: { field: keyof CommercialProfile; label: string }[] = [
  { field: 'documentsAcceptedAt', label: 'Documentos aceptados' }, { field: 'residentBaseReceivedAt', label: 'Base de residentes recibida' },
  { field: 'categoriesConfiguredAt', label: 'Categorías configuradas' }, { field: 'administratorInvitedAt', label: 'Administrador invitado' },
  { field: 'trainingCompletedAt', label: 'Capacitación completada' }, { field: 'smokeTestApprovedAt', label: 'Prueba operativa aprobada' },
  { field: 'launchCommunicationSentAt', label: 'Comunicación de lanzamiento enviada' },
];

function money(cents: number | null | undefined, currency = 'COP') {
  if (cents == null) return 'Por definir';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
}
function date(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString('es-CO') : 'Pendiente'; }
function operationId() { return crypto.randomUUID(); }

export function CommercialTenantPanel({ tenantId, detail, metrics, founderSlotsRemaining, onUpdated }: { tenantId: string; detail: CommercialTenantDetail | null; metrics: CommercialMetrics | null; founderSlotsRemaining: number; onUpdated: () => Promise<void> | void }) {
  const profile = detail?.commercialProfile || null;
  const [amountCop, setAmountCop] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('7');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const monthlyEffective = useMemo(() => {
    const list = profile?.postPilotListPriceCents || 0;
    const bps = Math.round(Number(discountPercent || 0) * 100);
    return Math.round(list * (10000 - bps) / 10000);
  }, [profile?.postPilotListPriceCents, discountPercent]);
  const annualEffective = useMemo(() => Math.round((profile?.postPilotListPriceCents || 0) * 12 * 0.9), [profile?.postPilotListPriceCents]);

  useEffect(() => {
    if (profile?.commercialStatus === 'PILOT_PENDING_PAYMENT') setAmountCop(String((profile.pilotPriceCents || 0) / 100));
  }, [profile?.commercialStatus, profile?.pilotPriceCents]);

  async function post(action: string, values: Record<string, unknown> = {}) {
    setLoading(true); setMessage('');
    try {
      const response = await fetch('/api/platform/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, tenantId, operationId: operationId(), ...values }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'No se pudo completar la acción');
      setMessage('Cambio guardado');
      await onUpdated();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la acción');
      return false;
    } finally { setLoading(false); }
  }

  if (!profile) return <div style={{ padding: 16, background: COLORS.warningSoft, borderRadius: 12, color: COLORS.warning, fontSize: 12.5, fontWeight: 700 }}>Este conjunto aún no tiene ficha comercial. Está pendiente de revisión y migración operativa.</div>;

  const status = profile.commercialStatus;
  const entitlement = (feature: Entitlement['feature']) => detail?.featureEntitlements?.find((item) => item.feature === feature);
  const checklistEditable = status === 'PILOT_PREPARATION' || status === 'PILOT_ACTIVE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{ padding: 16, background: COLORS.bgCard, borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Ficha comercial</div>
          <span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>{STATUS_LABEL[status] || status}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          <Value label="Piloto" value={money(profile.pilotPriceCents, profile.currency)} />
          <Value label="Precio posterior" value={money(profile.postPilotContractPriceCents || profile.postPilotListPriceCents, profile.currency)} />
          <Value label="Finaliza" value={date(profile.contractedPeriodEndsAt || profile.pilotAccessEndsAt)} />
          <Value label="Modalidad" value={profile.billingMode || 'Piloto guiado'} />
          <Value label="Siguiente acción" value={profile.nextAction || 'Sin acción pendiente'} />
          <Value label="Fecha objetivo" value={date(profile.nextActionDueAt)} />
        </div>
      </section>

      {profile.isFounderCustomer && <section style={{ padding: 14, background: COLORS.successSoft, borderRadius: 12, color: COLORS.success }}><div style={{ fontSize: 13, fontWeight: 800 }}>Cliente fundador #{profile.founderNumber}</div><div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>Precio protegido hasta {date(profile.priceProtectedUntil)} · implementación asistida sin costo</div></section>}
      {!profile.isFounderCustomer && <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 600 }}>Cupos fundadores disponibles: {founderSlotsRemaining}</div>}

      <section>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 800, marginBottom: 9 }}>PREPARACIÓN</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
          {CHECKLIST.map((item) => {
            const complete = Boolean(profile[item.field]);
            const automatic = item.field === 'administratorInvitedAt';
            return <button key={item.field} type="button" disabled={!checklistEditable || automatic || loading} onClick={() => post('updatePilotChecklist', { field: item.field, completed: !complete })} style={{ minHeight: 42, border: `1px solid ${complete ? COLORS.success : COLORS.inputBorder}`, background: complete ? COLORS.successSoft : '#FFFFFF', color: complete ? COLORS.success : COLORS.textSecondaryAlt, borderRadius: 10, padding: '8px 10px', font: 'inherit', fontSize: 11.5, fontWeight: 700, textAlign: 'left', cursor: checklistEditable && !automatic ? 'pointer' : 'default' }}>{complete ? '✓ ' : ''}{item.label}</button>;
          })}
        </div>
      </section>

      {metrics && <section><div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 800, marginBottom: 9 }}>USO REAL</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        <Value label="Días restantes" value={String(metrics.totalDaysRemaining ?? '—')} /><Value label="Días de uso" value={String(metrics.realUseDays)} />
        <Value label="PQRS" value={`${metrics.pqrsClosed}/${metrics.pqrsCreated} cerradas`} /><Value label="Invitados" value={String(metrics.usersInvited)} />
        <Value label="Activos" value={String(metrics.usersActivated)} /><Value label="Soporte" value={String(metrics.supportTickets)} />
      </div></section>}

      <section>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 800, marginBottom: 9 }}>ALCANCE CONTRATADO</div>
        {(['RESERVATIONS', 'RESIDENT_PAYMENTS'] as const).map((feature) => {
          const row = entitlement(feature); const active = row?.status === 'ACTIVE';
          return <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}><div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>{feature === 'RESERVATIONS' ? 'Reservas' : 'Pagos de residentes'}</div><div style={{ fontSize: 11, color: COLORS.textMuted }}>{row?.status || 'DISABLED'}{row?.priceCents ? ` · ${money(row.priceCents)}` : ''}</div></div><button type="button" disabled={loading} onClick={() => post('setTenantFeature', { feature, status: active ? 'DISABLED' : 'ACTIVE', reason: active ? 'Desactivación comercial desde ficha' : 'Activación comercial desde ficha' })} style={{ border: 0, background: active ? COLORS.neutralSoft : COLORS.navy, color: active ? COLORS.textSecondaryAlt : '#FFFFFF', borderRadius: RADIUS.pill, padding: '8px 12px', font: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{active ? 'Desactivar' : 'Activar'}</button></div>;
        })}
      </section>

      <section style={{ padding: 14, border: `1px solid ${COLORS.border}`, borderRadius: 12 }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 800, marginBottom: 10 }}>DECISIÓN COMERCIAL</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input value={amountCop} onChange={(event) => setAmountCop(event.target.value)} inputMode="numeric" placeholder="Valor recibido (COP)" style={inputStyle} />
          <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Referencia bancaria" style={inputStyle} />
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo o nota" style={{ ...inputStyle, gridColumn: '1 / -1' }} />
        </div>

        {status === 'PILOT_PENDING_PAYMENT' && <Action label="Confirmar pago del piloto" loading={loading} onClick={() => post('confirmPilotPayment', { amountCents: Math.round(Number(amountCop) * 100), manualReference: reference })} />}
        {status === 'PILOT_PREPARATION' && <Action label="Iniciar piloto" loading={loading} onClick={() => post('startPilot', { exceptionReason: reason || undefined })} />}
        {status === 'PILOT_ACTIVE' && <Action label="Iniciar evaluación" loading={loading} onClick={() => post('startPilotEvaluation', { notes: reason || undefined })} />}

        {(status === 'PILOT_ACTIVE' || status === 'PILOT_EVALUATION') && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}><input type="number" min={0} max={5} step={0.25} value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} style={{ ...inputStyle, width: 90 }} /><span style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 600 }}>% descuento mensual · mensual {money(monthlyEffective)} · anual {money(annualEffective)}</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Action label="Convertir a mensual" loading={loading} onClick={() => post('convertPilot', { billingMode: 'MONTHLY', amountCents: monthlyEffective, manualReference: reference, discountBps: Math.round(Number(discountPercent || 0) * 100), discountReason: Number(discountPercent) ? reason : undefined, discountStartsAt: Number(discountPercent) ? new Date().toISOString() : undefined, discountEndsAt: Number(discountPercent) ? new Date(Date.now() + 365 * 86400000).toISOString() : undefined })} />
            <Action label="Convertir a anual" loading={loading} secondary onClick={() => post('convertPilot', { billingMode: 'ANNUAL', amountCents: annualEffective, manualReference: reference })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}><input type="number" min={1} max={30} value={days} onChange={(event) => setDays(event.target.value)} style={{ ...inputStyle, width: 70 }} /><Action label="Extensión excepcional" loading={loading} secondary onClick={() => post('extendPilot', { days: Number(days), reason })} /><Action label="No convertir" loading={loading} danger onClick={() => post('markPilotNotConverted', { reason })} /></div>
        </>}
      </section>

      <section style={{ padding: 14, background: COLORS.bgCard, borderRadius: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>Implementación y referido</div>
        <div style={{ fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 1.6 }}>Implementación: {profile.implementationType} · {profile.implementationStatus} · lista {money(profile.implementationListFeeCents)} · efectivo {money(profile.implementationEffectiveFeeCents)}</div>
        <div style={{ fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 1.6 }}>Referido: {profile.referralName || 'No registrado'} · {profile.referralAgreementType} · comisión {profile.commissionStatus}</div>
        {profile.commissionStatus === 'ELIGIBLE' && <div style={{ marginTop: 9 }}><Action label={`Marcar comisión pagada (${money(profile.commissionEligibleCents)})`} loading={loading} secondary onClick={() => post('markReferralCommissionPaid', { reference })} /></div>}
      </section>

      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message === 'Cambio guardado' ? COLORS.success : COLORS.danger }}>{message}</div>}
    </div>
  );
}

const inputStyle = { height: 40, padding: '0 11px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 10, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', minWidth: 0 } as const;

function Value({ label, value }: { label: string; value: string }) {
  return <div><div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, marginBottom: 3 }}>{label.toUpperCase()}</div><div style={{ fontSize: 12.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div></div>;
}

function Action({ label, loading, onClick, secondary = false, danger = false }: { label: string; loading: boolean; onClick: () => void; secondary?: boolean; danger?: boolean }) {
  const background = danger ? COLORS.dangerSoft : secondary ? COLORS.neutralSoft : COLORS.navy;
  const color = danger ? COLORS.danger : secondary ? COLORS.textSecondaryAlt : '#FFFFFF';
  return <button type="button" disabled={loading} onClick={onClick} style={{ border: 0, background, color, borderRadius: RADIUS.pill, padding: '9px 13px', font: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>{loading ? 'Guardando…' : label}</button>;
}
