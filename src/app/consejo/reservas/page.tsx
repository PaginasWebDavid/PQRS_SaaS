'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { CONSEJO_NAV } from '@/lib/design/consejoNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';

type CommonArea = { id: string; name: string; description?: string | null; openingTime: string; closingTime: string };
type Reservation = {
  id: string; startAt: string; endAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  commonArea: { id: string; name: string };
};

const STATUS_BADGE = (status: Reservation['status']) => {
  if (status === 'PENDING') return badgeStyle(COLORS.warningSoft, COLORS.warning);
  if (status === 'APPROVED') return badgeStyle(COLORS.successSoft, COLORS.success);
  if (status === 'REJECTED') return badgeStyle(COLORS.dangerSoft, COLORS.danger);
  return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
};
const STATUS_LABEL: Record<Reservation['status'], string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' };

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '18px 20px', marginBottom: 14 };

export default function ConsejoReservasPage() {
  const [zones, setZones] = useState<CommonArea[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [totalReservas, setTotalReservas] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'' | Reservation['status']>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (status: string) => {
    const [zonesRes, reservationsRes] = await Promise.all([
      fetch('/api/reservas/zonas', { cache: 'no-store' }),
      // Sin pageSize la API entrega 25 y el calendario se corta en silencio.
      // 100 es el tope que acepta la ruta; si hay mas, se avisa abajo.
      fetch(`/api/reservas?pageSize=100${status ? `&status=${status}` : ''}`, { cache: 'no-store' }),
    ]);
    if (!zonesRes.ok || !reservationsRes.ok) throw new Error('load_failed');
    setZones(await zonesRes.json());
    const body = await reservationsRes.json();
    setReservations(body.data || []);
    setTotalReservas(body.pagination?.total ?? (body.data || []).length);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    load(statusFilter).catch(() => { if (alive) setError('No se pudo cargar la información de reservas.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load, statusFilter]);

  return (
    <AdminShell navItems={CONSEJO_NAV} activeKey="reservas" userName="Consejo" userRole="Consejo" initials="CO" mobileTitle="Reservas">
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Reservas y zonas comunes</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Calendario del conjunto (solo lectura)</p>

      {error && <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando…</div>}

      {!loading && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Zonas comunes</div>
          {zones.map((z) => (
            <div key={z.id} style={{ ...cardStyle, padding: '12px 16px' }}>
              <b style={{ fontSize: 13.5 }}>{z.name}</b>
              <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 10 }}>{z.openingTime}–{z.closingTime}</span>
            </div>
          ))}

          <div style={{ fontSize: 13, fontWeight: 800, margin: '20px 0 10px' }}>Reservas</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).map((s) => (
              <button key={s || 'all'} type="button" onClick={() => setStatusFilter(s)} style={{ ...tabStyle(statusFilter === s), border: 'none', fontFamily: 'inherit' }}>
                {s ? STATUS_LABEL[s] : 'Todas'}
              </button>
            ))}
          </div>
          {reservations.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>No hay reservas en este estado.</div>}
          {reservations.map((r) => (
            <div key={r.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <b style={{ fontSize: 14 }}>{r.commonArea.name}</b>
                <span style={STATUS_BADGE(r.status)}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary }}>{fmt(r.startAt)} — {fmt(r.endAt)}</div>
            </div>
          ))}
          {totalReservas > reservations.length && (
            <div style={{ textAlign: 'center', padding: '14px 20px', color: COLORS.textMuted, fontSize: 12.5, fontWeight: 600 }}>
              Se muestran las {reservations.length} reservas más recientes de {totalReservas}. Use el filtro de estado para acotar el listado.
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
