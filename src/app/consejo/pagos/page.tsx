'use client';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { CONSEJO_NAV } from '@/lib/design/consejoNav';
import { COLORS, RADIUS } from '@/lib/design/tokens';

type Summary = {
  byStatus: { status: string; count: number; amountCents: number; paidCents: number }[];
  totals: { totalCharges: number; totalAmountCents: number; totalPaidCents: number };
  pendingReceipts: number;
};

const STATUS_LABEL: Record<string, string> = { PENDING: 'Pendientes', PARTIAL: 'Parciales', PAID: 'Pagadas', CANCELLED: 'Canceladas' };

function cop(cents: number) {
  return (cents / 100).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '18px 20px', marginBottom: 14 };

export default function ConsejoPagosPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/pagos/resumen', { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('load_failed'); return res.json(); })
      .then((body) => { if (alive) setSummary(body); })
      .catch(() => { if (alive) setError('No se pudo cargar el resumen de pagos.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <AdminShell navItems={CONSEJO_NAV} activeKey="pagos" userName="Consejo" userRole="Consejo" initials="CO" mobileTitle="Pagos">
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Pagos de administracion</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Resumen agregado del conjunto (sin datos individuales de residentes)</p>

      {error && <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando…</div>}

      {!loading && summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>TOTAL FACTURADO</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{cop(summary.totals.totalAmountCents)}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>TOTAL RECAUDADO</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{cop(summary.totals.totalPaidCents)}</div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, margin: '4px 0 10px' }}>Obligaciones por estado</div>
          {summary.byStatus.map((entry) => (
            <div key={entry.status} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <b style={{ fontSize: 13.5 }}>{STATUS_LABEL[entry.status] || entry.status}</b>
                <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{entry.count} obligaciones</span>
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.textMuted }}>{cop(entry.paidCents)} recaudado de {cop(entry.amountCents)}</div>
            </div>
          ))}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, color: COLORS.textSecondary }}>Comprobantes pendientes de revision: <b>{summary.pendingReceipts}</b></div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
