'use client';

import { useEffect, useMemo, useState } from 'react';
import { COLORS, RADIUS, badgeStyle } from '@/lib/design/tokens';
import { InfoTip } from '@/components/shell/InfoTip';

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

// Traducciones de enums crudos que antes se mostraban tal cual ("STANDARD",
// "PENDING_PAYMENTS"), sin que se entendiera nada.
const IMPLEMENTATION_TYPE_LABEL: Record<string, string> = {
  STANDARD: 'Estándar (el conjunto se configura solo)',
  ASSISTED: 'Asistida (la configuramos nosotros)',
  FOUNDER_WAIVED: 'Sin costo por ser fundador',
};
const IMPLEMENTATION_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Sin empezar', IN_PROGRESS: 'En curso', COMPLETED: 'Terminada', WAIVED: 'No aplica',
};
const REFERRAL_TYPE_LABEL: Record<string, string> = {
  NONE: 'Sin referido', GENERAL: 'Acuerdo general', FOUNDER_EXCEPTION: 'Excepción de fundador',
};
const COMMISSION_STATUS_LABEL: Record<string, string> = {
  NOT_APPLICABLE: 'No aplica',
  PENDING_CONVERSION: 'Esperando que el conjunto se convierta en cliente pagado',
  PENDING_PAYMENTS: 'Esperando que acumule las mensualidades necesarias',
  ELIGIBLE: 'Lista para pagarse',
  PAID: 'Ya pagada',
  MANUAL_REVIEW: 'Requiere revisión manual',
  CANCELLED: 'Cancelada',
};
const BILLING_MODE_LABEL: Record<string, string> = { MONTHLY: 'Mensual', ANNUAL: 'Anual' };

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
  const checklistDone = CHECKLIST.filter((item) => Boolean(profile[item.field])).length;
  const checklistPending = CHECKLIST.filter((item) => !profile[item.field]).map((item) => item.label);
  const isPilotStage = status === 'PILOT_PENDING_PAYMENT' || status === 'PILOT_PREPARATION' || status === 'PILOT_ACTIVE' || status === 'PILOT_EVALUATION';
  const canDecide = status === 'PILOT_ACTIVE' || status === 'PILOT_EVALUATION';

  // Que hacer ahora, segun la etapa. Antes la pantalla mostraba todos los
  // campos y botones a la vez sin decir cual tocaba.
  const guidance: { text: string; tone: 'info' | 'action' | 'done' } = (() => {
    switch (status) {
      case 'LEGACY_REVIEW':
        return { text: 'Este conjunto viene de antes del modelo de piloto, así que no tiene un flujo comercial que seguir. Opera normalmente; no hay nada pendiente aquí.', tone: 'info' };
      case 'PILOT_PENDING_PAYMENT':
        return { text: 'El conjunto aceptó el piloto pero todavía no lo ha pagado. Cuando recibas el dinero, confirma el pago aquí abajo para que arranque la preparación.', tone: 'action' };
      case 'PILOT_PREPARATION':
        return {
          text: checklistPending.length > 0
            ? `Ya pagó el piloto. Antes de arrancar falta dejar listo: ${checklistPending.join(', ')}. Cuando termines, inicia el piloto.`
            : 'Ya pagó el piloto y la preparación está completa. Puedes iniciar el piloto cuando quieras.',
          tone: 'action',
        };
      case 'PILOT_ACTIVE':
        return { text: `El piloto está corriendo${metrics?.totalDaysRemaining != null ? ` y le quedan ${metrics.totalDaysRemaining} días` : ''}. Cerca del final, abre la evaluación para decidir con el conjunto si continúa como cliente pagado.`, tone: 'info' };
      case 'PILOT_EVALUATION':
        return { text: `Toca decidir antes del ${date(profile.decisionDueAt)}: convertirlo en cliente pagado, darle una extensión excepcional, o cerrarlo sin conversión.`, tone: 'action' };
      case 'CONVERTED_MONTHLY':
      case 'CONVERTED_ANNUAL':
        return { text: `Ya es cliente pagado (${BILLING_MODE_LABEL[profile.billingMode || ''] || 'plan activo'}). No queda nada pendiente aquí; su cobro y renovación se manejan en "Licencias y pagos".`, tone: 'done' };
      case 'NOT_CONVERTED':
        return { text: 'El piloto terminó y el conjunto no se convirtió en cliente pagado. No hay acciones comerciales pendientes.', tone: 'info' };
      case 'CANCELLED':
        return { text: 'Este proceso comercial está cancelado. No hay acciones pendientes.', tone: 'info' };
      default:
        return { text: 'Sin acciones comerciales pendientes.', tone: 'info' };
    }
  })();

  const guidanceStyle = guidance.tone === 'action'
    ? { background: COLORS.warningSoft, color: COLORS.warning }
    : guidance.tone === 'done'
      ? { background: COLORS.successSoft, color: COLORS.success }
      : { background: COLORS.navySoft, color: COLORS.navy };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Lo primero: en que etapa va y que toca hacer. */}
      <section style={{ padding: 16, borderRadius: 12, ...guidanceStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.85 }}>Qué sigue</span>
          <span style={badgeStyle('rgba(255,255,255,0.55)', 'inherit')}>{STATUS_LABEL[status] || status}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.55 }}>{guidance.text}</div>
      </section>

      <section style={{ padding: 16, background: COLORS.bgCard, borderRadius: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 12 }}>
          Ficha comercial
          <InfoTip text="Los precios y fechas pactados con este conjunto. El precio del piloto es un pago único; el precio posterior es lo que pagaría cada mes si se convierte en cliente." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          <Value label="Piloto" value={money(profile.pilotPriceCents, profile.currency)} />
          <Value label="Precio posterior" value={money(profile.postPilotContractPriceCents || profile.postPilotListPriceCents, profile.currency)} />
          <Value label="Finaliza" value={date(profile.contractedPeriodEndsAt || profile.pilotAccessEndsAt)} />
          <Value label="Modalidad" value={BILLING_MODE_LABEL[profile.billingMode || ''] || 'Piloto guiado'} />
        </div>
      </section>

      {profile.isFounderCustomer && <section style={{ padding: 14, background: COLORS.successSoft, borderRadius: 12, color: COLORS.success }}><div style={{ fontSize: 13, fontWeight: 800 }}>Cliente fundador #{profile.founderNumber}</div><div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>Precio protegido hasta {date(profile.priceProtectedUntil)} · implementación asistida sin costo</div></section>}
      {!profile.isFounderCustomer && isPilotStage && <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 600 }}>Cupos de fundador disponibles: {founderSlotsRemaining}<InfoTip text="Si este conjunto se convierte en cliente pagado y todavía quedan cupos, entra automáticamente como fundador: no paga implementación y su precio queda protegido 12 meses." /></div>}

      {/* La preparacion solo es accionable durante el piloto; en otras etapas
          se muestra como historial para no invitar a tocar lo que no aplica. */}
      {(isPilotStage || checklistDone > 0) && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 800 }}>
              PREPARACIÓN
              <InfoTip text="Los pasos que hay que dejar listos antes de que el conjunto empiece a usar la plataforma de verdad. Marca cada uno a medida que lo completes; solo se pueden editar durante la preparación y el piloto." />
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: checklistDone === CHECKLIST.length ? COLORS.success : COLORS.textSecondary }}>{checklistDone} de {CHECKLIST.length} listos</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
            {CHECKLIST.map((item) => {
              const complete = Boolean(profile[item.field]);
              const automatic = item.field === 'administratorInvitedAt';
              return <button key={item.field} type="button" title={automatic ? 'Se marca solo cuando se envía la invitación al administrador' : undefined} disabled={!checklistEditable || automatic || loading} onClick={() => post('updatePilotChecklist', { field: item.field, completed: !complete })} style={{ minHeight: 42, border: `1px solid ${complete ? COLORS.success : COLORS.inputBorder}`, background: complete ? COLORS.successSoft : COLORS.bg, color: complete ? COLORS.success : COLORS.textSecondaryAlt, borderRadius: 10, padding: '8px 10px', font: 'inherit', fontSize: 11.5, fontWeight: 700, textAlign: 'left', cursor: checklistEditable && !automatic ? 'pointer' : 'default' }}>{complete ? '✓ ' : ''}{item.label}{automatic ? ' (automático)' : ''}</button>;
            })}
          </div>
        </section>
      )}

      {metrics && isPilotStage && <section>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 800, marginBottom: 9 }}>
          USO REAL
          <InfoTip text="Qué tanto está usando el conjunto la plataforma durante el piloto. Es la evidencia para decidir si vale la pena convertirlo en cliente pagado." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
          <Value label="Días restantes" value={String(metrics.totalDaysRemaining ?? '—')} /><Value label="Días de uso" value={String(metrics.realUseDays)} />
          <Value label="PQRS" value={`${metrics.pqrsClosed}/${metrics.pqrsCreated} cerradas`} /><Value label="Invitados" value={String(metrics.usersInvited)} />
          <Value label="Activos" value={String(metrics.usersActivated)} /><Value label="Soporte" value={String(metrics.supportTickets)} />
        </div>
      </section>}

      <section>
        <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 800, marginBottom: 9 }}>
          ALCANCE CONTRATADO
          <InfoTip text="Módulos opcionales además de la gestión de PQRS. Si están desactivados, el conjunto no los ve ni puede usarlos." />
        </div>
        {(['RESERVATIONS', 'RESIDENT_PAYMENTS'] as const).map((feature) => {
          const row = entitlement(feature); const active = row?.status === 'ACTIVE';
          return <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}><div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>{feature === 'RESERVATIONS' ? 'Reservas' : 'Pagos de residentes'}</div><div style={{ fontSize: 11, color: active ? COLORS.success : COLORS.textMuted, fontWeight: 600 }}>{active ? 'Contratado' : 'No contratado'}{row?.priceCents ? ` · ${money(row.priceCents)}` : ''}</div></div><button type="button" disabled={loading} onClick={() => post('setTenantFeature', { feature, status: active ? 'DISABLED' : 'ACTIVE', reason: active ? 'Desactivación comercial desde ficha' : 'Activación comercial desde ficha' })} style={{ border: 0, background: active ? COLORS.neutralSoft : COLORS.navy, color: active ? COLORS.textSecondaryAlt : COLORS.white, borderRadius: RADIUS.pill, padding: '8px 12px', font: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{active ? 'Desactivar' : 'Activar'}</button></div>;
        })}
      </section>

      {/* Solo aparece cuando de verdad hay una decision que tomar, y solo con
          los campos que esa decision necesita. */}
      {(status === 'PILOT_PENDING_PAYMENT' || status === 'PILOT_PREPARATION' || canDecide) && (
        <section style={{ padding: 14, border: `1px solid ${COLORS.border}`, borderRadius: 12 }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 800, marginBottom: 10 }}>
            DECISIÓN COMERCIAL
            <InfoTip text="Las acciones que mueven al conjunto de una etapa a la siguiente: confirmar el pago del piloto, arrancarlo, evaluarlo y finalmente convertirlo en cliente pagado o cerrarlo." />
          </div>

          {status === 'PILOT_PENDING_PAYMENT' && <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <Field label="Valor recibido (COP)"><input value={amountCop} onChange={(event) => setAmountCop(event.target.value)} inputMode="numeric" style={inputStyle} /></Field>
              <Field label="Referencia bancaria"><input value={reference} onChange={(event) => setReference(event.target.value)} style={inputStyle} /></Field>
            </div>
            <Action label="Confirmar pago del piloto" loading={loading} onClick={() => post('confirmPilotPayment', { amountCents: Math.round(Number(amountCop) * 100), manualReference: reference })} />
          </>}

          {status === 'PILOT_PREPARATION' && <>
            <Field label="Nota (opcional)"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej: se arrancó antes por pedido del consejo" style={{ ...inputStyle, width: '100%' }} /></Field>
            <div style={{ marginTop: 10 }}><Action label="Iniciar piloto" loading={loading} onClick={() => post('startPilot', { exceptionReason: reason || undefined })} /></div>
          </>}

          {status === 'PILOT_ACTIVE' && <div style={{ marginBottom: 14 }}>
            <Action label="Iniciar evaluación" loading={loading} onClick={() => post('startPilotEvaluation', { notes: reason || undefined })} />
          </div>}

          {canDecide && <>
            <div style={{ borderTop: status === 'PILOT_ACTIVE' ? `1px solid ${COLORS.borderSoft}` : 'none', paddingTop: status === 'PILOT_ACTIVE' ? 14 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Convertir en cliente pagado</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <Field label="Descuento mensual (%)" hint="Máximo 5 %"><input type="number" min={0} max={5} step={0.25} value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} style={inputStyle} /></Field>
                <Field label="Referencia bancaria"><input value={reference} onChange={(event) => setReference(event.target.value)} style={inputStyle} /></Field>
                <Field label={Number(discountPercent) > 0 ? 'Motivo del descuento (obligatorio)' : 'Motivo o nota'}><input value={reason} onChange={(event) => setReason(event.target.value)} style={{ ...inputStyle, width: '100%' }} /></Field>
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 600, marginBottom: 10 }}>Quedaría en {money(monthlyEffective)}/mes · o {money(annualEffective)} al año (10 % de descuento por pago anticipado)</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Action label="Convertir a mensual" loading={loading} onClick={() => post('convertPilot', { billingMode: 'MONTHLY', amountCents: monthlyEffective, manualReference: reference, discountBps: Math.round(Number(discountPercent || 0) * 100), discountReason: Number(discountPercent) ? reason : undefined, discountStartsAt: Number(discountPercent) ? new Date().toISOString() : undefined, discountEndsAt: Number(discountPercent) ? new Date(Date.now() + 365 * 86400000).toISOString() : undefined })} />
                <Action label="Convertir a anual" loading={loading} secondary onClick={() => post('convertPilot', { billingMode: 'ANNUAL', amountCents: annualEffective, manualReference: reference })} />
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${COLORS.borderSoft}`, marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Si todavía no se puede decidir</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Field label="Días extra"><input type="number" min={1} max={30} value={days} onChange={(event) => setDays(event.target.value)} style={{ ...inputStyle, width: 80 }} /></Field>
                <Action label="Extensión excepcional" loading={loading} secondary onClick={() => post('extendPilot', { days: Number(days), reason })} />
                <Action label="Cerrar sin conversión" loading={loading} danger onClick={() => post('markPilotNotConverted', { reason })} />
              </div>
            </div>
          </>}
        </section>
      )}

      <section style={{ padding: 14, background: COLORS.bgCard, borderRadius: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>
          Implementación
          <InfoTip text="Cómo se configuró el conjunto al arrancar. La implementación asistida es un cobro único aparte de la mensualidad; los conjuntos fundadores no la pagan." />
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 1.6 }}>
          {IMPLEMENTATION_TYPE_LABEL[profile.implementationType] || profile.implementationType} · {IMPLEMENTATION_STATUS_LABEL[profile.implementationStatus] || profile.implementationStatus}
          {profile.implementationEffectiveFeeCents > 0 ? ` · cobro ${money(profile.implementationEffectiveFeeCents)}` : ' · sin cobro'}
        </div>

        {/* El bloque de referido solo tiene sentido si de verdad hay uno. */}
        {(profile.referralAgreementType !== 'NONE' || profile.referralName) && <>
          <div style={{ fontSize: 12.5, fontWeight: 800, margin: '14px 0 8px' }}>
            Referido
            <InfoTip text="Quién trajo a este conjunto. Si hay acuerdo de comisión, se vuelve pagable solo cuando el conjunto se convierte en cliente y acumula las mensualidades acordadas." />
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 1.6 }}>
            {profile.referralName || 'Sin nombre registrado'} · {REFERRAL_TYPE_LABEL[profile.referralAgreementType] || profile.referralAgreementType}
          </div>
          <div style={{ fontSize: 11.5, color: profile.commissionStatus === 'ELIGIBLE' ? COLORS.warning : COLORS.textSecondary, fontWeight: profile.commissionStatus === 'ELIGIBLE' ? 700 : 500, lineHeight: 1.6 }}>
            Comisión: {COMMISSION_STATUS_LABEL[profile.commissionStatus] || profile.commissionStatus}
          </div>
          {profile.commissionStatus === 'ELIGIBLE' && <div style={{ marginTop: 9 }}><Action label={`Marcar comisión pagada (${money(profile.commissionEligibleCents)})`} loading={loading} secondary onClick={() => post('markReferralCommissionPaid', { reference })} /></div>}
        </>}
      </section>

      {message && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: message === 'Cambio guardado' ? COLORS.success : COLORS.danger }}>{message}</div>}
    </div>
  );
}

const inputStyle = { height: 40, padding: '0 11px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 10, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', minWidth: 0, width: '100%' } as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>{label}{hint ? ` · ${hint}` : ''}</span>
      {children}
    </label>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return <div><div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, marginBottom: 3 }}>{label.toUpperCase()}</div><div style={{ fontSize: 12.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div></div>;
}

function Action({ label, loading, onClick, secondary = false, danger = false }: { label: string; loading: boolean; onClick: () => void; secondary?: boolean; danger?: boolean }) {
  const background = danger ? COLORS.dangerSoft : secondary ? COLORS.neutralSoft : COLORS.navy;
  const color = danger ? COLORS.danger : secondary ? COLORS.textSecondaryAlt : COLORS.white;
  return <button type="button" disabled={loading} onClick={onClick} style={{ border: 0, background, color, borderRadius: RADIUS.pill, padding: '9px 13px', font: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>{loading ? 'Guardando…' : label}</button>;
}
