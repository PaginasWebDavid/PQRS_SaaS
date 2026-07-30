'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/design/tokens';

type ScopeData = {
  commercial?: { status?: string | null; pilotAccessEndsAt?: string | null; contractedPeriodEndsAt?: string | null } | null;
  entitlements?: { reservations?: boolean; residentPayments?: boolean } | null;
};

const STATUS: Record<string, string> = {
  LEGACY_REVIEW: 'Plan Gestión activo',
  PILOT_PENDING_PAYMENT: 'Pendiente de activación',
  PILOT_PREPARATION: 'Piloto guiado en preparación',
  PILOT_ACTIVE: 'Piloto guiado activo',
  PILOT_EVALUATION: 'Piloto guiado en evaluación',
  CONVERTED_MONTHLY: 'Plan Gestión mensual',
  CONVERTED_ANNUAL: 'Plan Gestión anual',
  NOT_CONVERTED: 'Piloto finalizado',
  CANCELLED: 'Servicio cancelado',
};

function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
}

export function ContractedScopeSummary() {
  const [data, setData] = useState<ScopeData | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/me', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (active) setData(body); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!data) return null;
  const addOns = [data.entitlements?.reservations ? 'Reservas' : null, data.entitlements?.residentPayments ? 'Pagos de residentes' : null].filter(Boolean);
  const validUntil = date(data.commercial?.contractedPeriodEndsAt || data.commercial?.pilotAccessEndsAt);
  return (
    <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '12px 15px', marginBottom: 18, background: COLORS.bgCard, borderRadius: 12, color: COLORS.textSecondaryAlt, fontSize: 12, fontWeight: 600 }}>
      <strong style={{ color: COLORS.navy }}>{STATUS[data.commercial?.status || ''] || 'Plan Gestión'}</strong>
      <span>Consulta y supervisión</span>
      <span>{addOns.length ? `Add-ons activos: ${addOns.join(', ')}` : 'Sin add-ons activos'}</span>
      {validUntil && <span>Vigencia general: {validUntil}</span>}
    </section>
  );
}
