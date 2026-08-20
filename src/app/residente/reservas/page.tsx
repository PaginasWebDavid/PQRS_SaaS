'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResidentShell } from '@/components/shell/ResidentShell';
import { Toast, useToast } from '@/components/shell/Toast';
import { COLORS, RADIUS, badgeStyle } from '@/lib/design/tokens';
import { DEFAULT_RESERVATION_TIMEZONE, zonedTimeToUtc } from '@/domains/reservations/reservation-time';

type CommonArea = {
  id: string; name: string; description?: string | null; requiresApproval: boolean;
  minDurationMinutes: number; maxDurationMinutes: number; openingTime: string; closingTime: string;
  blockedWeekdays: number[]; rules?: string | null;
};
type Reservation = {
  id: string; startAt: string; endAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  notes?: string | null; rejectionReason?: string | null;
  commonArea: { id: string; name: string };
};
type Me = { user?: { name?: string | null } };

const STATUS_BADGE = (status: Reservation['status']) => {
  if (status === 'PENDING') return badgeStyle(COLORS.warningSoft, COLORS.warning);
  if (status === 'APPROVED') return badgeStyle(COLORS.successSoft, COLORS.success);
  if (status === 'REJECTED') return badgeStyle(COLORS.dangerSoft, COLORS.danger);
  return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
};
const STATUS_LABEL: Record<Reservation['status'], string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' };

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { timeZone: DEFAULT_RESERVATION_TIMEZONE, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '18px 20px', marginBottom: 14 };
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 12 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, margin: '0 0 7px' };
const primaryButton: React.CSSProperties = { width: '100%', border: 0, background: COLORS.navy, color: '#FFFFFF', fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryButton: React.CSSProperties = { border: `1.5px solid ${COLORS.inputBorder}`, background: '#FFFFFF', color: COLORS.navy, fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };

export default function ResidenteReservasPage() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [zones, setZones] = useState<CommonArea[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [meRes, zonesRes, reservationsRes] = await Promise.all([
      fetch('/api/me', { cache: 'no-store' }),
      fetch('/api/reservas/zonas', { cache: 'no-store' }),
      fetch('/api/reservas', { cache: 'no-store' }),
    ]);
    if (!meRes.ok || !zonesRes.ok || !reservationsRes.ok) throw new Error('load_failed');
    setMe(await meRes.json());
    const zonesBody: CommonArea[] = await zonesRes.json();
    setZones(zonesBody);
    setSelectedZoneId((current) => current || zonesBody[0]?.id || '');
    const reservationsBody = await reservationsRes.json();
    setReservations(reservationsBody.data || []);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    load().catch(() => { if (alive) setError('No se pudo cargar la información de reservas.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null;

  async function createReservation() {
    if (creating || !selectedZoneId || !date || !startTime) return;
    setCreating(true);
    try {
      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = startTime.split(':').map(Number);
      const duration = Number(durationMinutes);
      if (![year, month, day, hour, minute, duration].every(Number.isFinite) || !Number.isInteger(duration) || duration <= 0) {
        showToast('Complete una fecha, hora y duracion validas');
        return;
      }
      // El formulario representa hora civil de Bogota, aun si el navegador se
      // encuentra en otra zona horaria. El servidor recibe un instante UTC
      // explicito, nunca un string local ambiguo.
      const startAt = zonedTimeToUtc(year, month, day, hour, minute, 0, DEFAULT_RESERVATION_TIMEZONE);
      const endAt = new Date(startAt.getTime() + duration * 60 * 1000);
      const res = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commonAreaId: selectedZoneId, startAt: startAt.toISOString(), endAt: endAt.toISOString(), notes: notes.trim() || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { showToast(body?.error || 'No se pudo crear la reserva'); return; }
      setDate(''); setStartTime(''); setNotes('');
      await load();
      showToast('Reserva enviada correctamente');
    } finally {
      setCreating(false);
    }
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/reservas/${id}/cancelar`, { method: 'POST' });
    const body = await res.json().catch(() => null);
    if (!res.ok) { showToast(body?.error || 'No se pudo cancelar la reserva'); return; }
    await load();
    showToast('Reserva cancelada');
  }

  const bottomNav = [
    { key: 'inicio', label: 'Inicio', icon: '⌂', onClick: () => router.push('/residente') },
    { key: 'reservas', label: 'Reservas', icon: '▤', onClick: () => {} },
    { key: 'perfil', label: 'Perfil', icon: '◐', onClick: () => router.push('/residente') },
    { key: 'ayuda', label: 'Ayuda', icon: '?', onClick: () => router.push('/residente') },
  ];
  const name = me?.user?.name || 'Residente';
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <ResidentShell activeKey="reservas" initials={initials || 'RS'} greetingName={name} bottomNav={bottomNav}>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>Reservas</h1>
      <p style={{ color: COLORS.textSecondary, marginBottom: 24, fontSize: 14 }}>Reserva zonas comunes de su conjunto</p>

      {error && <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando…</div>}

      {!loading && zones.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Tu conjunto aún no tiene zonas comunes disponibles.</div>}

      {!loading && zones.length > 0 && (
        <div style={cardStyle}>
          <label style={labelStyle}>Zona</label>
          <select value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)} style={inputStyle}>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          {selectedZone && (
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '-6px 0 12px' }}>
              Horario {selectedZone.openingTime}–{selectedZone.closingTime} · {selectedZone.minDurationMinutes}-{selectedZone.maxDurationMinutes} min
              {selectedZone.requiresApproval ? ' · requiere aprobación del administrador' : ' · confirmación automática'}
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Hora de inicio</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle}>Duración (minutos)</label>
          <input inputMode="numeric" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value.replace(/\D/g, ''))} style={inputStyle} />
          <label style={labelStyle}>Nota (opcional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} placeholder="Ej. Cumpleaños infantil" />
          <button type="button" onClick={createReservation} disabled={creating || !selectedZoneId || !date || !startTime} style={primaryButton}>
            {creating ? 'Enviando…' : 'Reservar'}
          </button>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 800, margin: '24px 0 10px' }}>Mis reservas</div>
      {!loading && reservations.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Aún no tiene reservas.</div>}
      {reservations.map((r) => (
        <div key={r.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <b style={{ fontSize: 14 }}>{r.commonArea.name}</b>
            <span style={STATUS_BADGE(r.status)}>{STATUS_LABEL[r.status]}</span>
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 }}>{fmt(r.startAt)} — {fmt(r.endAt)}</div>
          {r.rejectionReason && <div style={{ fontSize: 12.5, color: COLORS.danger, marginBottom: 8 }}>Motivo de rechazo: {r.rejectionReason}</div>}
          {(r.status === 'PENDING' || r.status === 'APPROVED') && (
            <button type="button" onClick={() => cancel(r.id)} style={secondaryButton}>Cancelar</button>
          )}
        </div>
      ))}
      <Toast message={toast} bottom={78} />
    </ResidentShell>
  );
}
