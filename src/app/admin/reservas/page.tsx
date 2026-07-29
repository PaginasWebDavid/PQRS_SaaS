'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';

type CommonArea = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  requiresApproval: boolean;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  maxReservationsPerWeek: number;
  openingTime: string;
  closingTime: string;
  blockedWeekdays: number[];
  rules?: string | null;
};

type Reservation = {
  id: string;
  startAt: string;
  endAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  notes?: string | null;
  rejectionReason?: string | null;
  commonArea: { id: string; name: string };
};

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const STATUS_BADGE = (status: Reservation['status']) => {
  if (status === 'PENDING') return badgeStyle(COLORS.warningSoft, COLORS.warning);
  if (status === 'APPROVED') return badgeStyle(COLORS.successSoft, COLORS.success);
  if (status === 'REJECTED') return badgeStyle(COLORS.dangerSoft, COLORS.danger);
  return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
};
const STATUS_LABEL: Record<Reservation['status'], string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const inputStyle: React.CSSProperties = { width: '100%', height: 42, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5, color: COLORS.textSecondaryAlt };
const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '20px 22px', marginBottom: 16 };
const primaryButton: React.CSSProperties = { border: 0, background: COLORS.navy, color: '#FFFFFF', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryButton: React.CSSProperties = { border: `1.5px solid ${COLORS.inputBorder}`, background: '#FFFFFF', color: COLORS.textSecondaryAlt, fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };

export default function AdminReservasPage() {
  const [section, setSection] = useState<'zonas' | 'reservas'>('reservas');
  const [zones, setZones] = useState<CommonArea[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | Reservation['status']>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [creatingZone, setCreatingZone] = useState(false);
  const [zoneForm, setZoneForm] = useState({
    name: '', description: '', requiresApproval: true,
    minDurationMinutes: '30', maxDurationMinutes: '120', maxReservationsPerWeek: '2',
    openingTime: '08:00', closingTime: '20:00', blockedWeekdays: [] as number[], rules: '',
  });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadZones = useCallback(async () => {
    const res = await fetch('/api/reservas/zonas', { cache: 'no-store' });
    if (res.ok) setZones(await res.json());
  }, []);

  const loadReservations = useCallback(async (status: string) => {
    const params = status ? `?status=${status}` : '';
    const res = await fetch(`/api/reservas${params}`, { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json();
      setReservations(body.data || []);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([loadZones(), loadReservations(statusFilter)])
      .catch(() => { if (alive) setError('No se pudo cargar la información de reservas.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadZones, loadReservations, statusFilter]);

  async function createZone() {
    if (creatingZone || !zoneForm.name.trim()) return;
    setCreatingZone(true);
    try {
      const res = await fetch('/api/reservas/zonas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: zoneForm.name.trim(),
          description: zoneForm.description.trim() || undefined,
          requiresApproval: zoneForm.requiresApproval,
          minDurationMinutes: Number(zoneForm.minDurationMinutes),
          maxDurationMinutes: Number(zoneForm.maxDurationMinutes),
          maxReservationsPerWeek: Number(zoneForm.maxReservationsPerWeek),
          openingTime: zoneForm.openingTime,
          closingTime: zoneForm.closingTime,
          blockedWeekdays: zoneForm.blockedWeekdays,
          rules: zoneForm.rules.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error || 'No se pudo crear la zona'); return; }
      setShowCreateZone(false);
      setZoneForm({ name: '', description: '', requiresApproval: true, minDurationMinutes: '30', maxDurationMinutes: '120', maxReservationsPerWeek: '2', openingTime: '08:00', closingTime: '20:00', blockedWeekdays: [], rules: '' });
      await loadZones();
    } finally {
      setCreatingZone(false);
    }
  }

  async function toggleZoneActive(zone: CommonArea) {
    const res = await fetch(`/api/reservas/zonas/${zone.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !zone.isActive }),
    });
    if (res.ok) await loadZones();
  }

  async function reviewReservation(id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    const res = await fetch(`/api/reservas/${id}/revisar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, rejectionReason: reason }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error || 'No se pudo actualizar la reserva'); return; }
    setRejectingId(null);
    setRejectionReason('');
    await loadReservations(statusFilter);
  }

  async function adminCancel(id: string) {
    const res = await fetch(`/api/reservas/${id}/cancelar`, { method: 'POST' });
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error || 'No se pudo cancelar la reserva'); return; }
    await loadReservations(statusFilter);
  }

  function toggleWeekday(day: number) {
    setZoneForm((f) => ({
      ...f,
      blockedWeekdays: f.blockedWeekdays.includes(day) ? f.blockedWeekdays.filter((d) => d !== day) : [...f.blockedWeekdays, day],
    }));
  }

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="reservas" userName="Administradora" userRole="Administradora" initials="AD" mobileTitle="Reservas">
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Reservas y zonas comunes</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Administra zonas comunes y gestiona las solicitudes de reserva</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button type="button" onClick={() => setSection('reservas')} style={{ ...tabStyle(section === 'reservas'), border: 'none', fontFamily: 'inherit' }}>Reservas</button>
        <button type="button" onClick={() => setSection('zonas')} style={{ ...tabStyle(section === 'zonas'), border: 'none', fontFamily: 'inherit' }}>Zonas comunes</button>
      </div>

      {error && <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando…</div>}

      {!loading && section === 'reservas' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', ''] as const).map((s) => (
              <button key={s || 'all'} type="button" onClick={() => setStatusFilter(s)} style={{ ...tabStyle(statusFilter === s), border: 'none', fontFamily: 'inherit' }}>
                {s ? STATUS_LABEL[s] : 'Todas'}
              </button>
            ))}
          </div>
          {reservations.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>No hay reservas en este estado.</div>}
          {reservations.map((r) => (
            <div key={r.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b style={{ fontSize: 14 }}>{r.commonArea.name}</b>
                <span style={STATUS_BADGE(r.status)}>{STATUS_LABEL[r.status]}</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 }}>{fmt(r.startAt)} — {fmt(r.endAt)}</div>
              {r.notes && <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 8 }}>Nota: {r.notes}</div>}
              {r.rejectionReason && <div style={{ fontSize: 12.5, color: COLORS.danger, marginBottom: 8 }}>Motivo de rechazo: {r.rejectionReason}</div>}
              {r.status === 'PENDING' && rejectingId !== r.id && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => reviewReservation(r.id, 'APPROVED')} style={primaryButton}>Aprobar</button>
                  <button type="button" onClick={() => setRejectingId(r.id)} style={secondaryButton}>Rechazar</button>
                </div>
              )}
              {rejectingId === r.id && (
                <div>
                  <input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Motivo del rechazo" style={inputStyle} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => reviewReservation(r.id, 'REJECTED', rejectionReason)} disabled={!rejectionReason.trim()} style={primaryButton}>Confirmar rechazo</button>
                    <button type="button" onClick={() => { setRejectingId(null); setRejectionReason(''); }} style={secondaryButton}>Cancelar</button>
                  </div>
                </div>
              )}
              {(r.status === 'PENDING' || r.status === 'APPROVED') && rejectingId !== r.id && (
                <button type="button" onClick={() => adminCancel(r.id)} style={{ ...secondaryButton, marginTop: 8 }}>Cancelar reserva</button>
              )}
            </div>
          ))}
        </>
      )}

      {!loading && section === 'zonas' && (
        <>
          <button type="button" onClick={() => setShowCreateZone((v) => !v)} style={{ ...primaryButton, marginBottom: 16 }}>
            {showCreateZone ? 'Cerrar' : '+ Nueva zona'}
          </button>
          {showCreateZone && (
            <div style={cardStyle}>
              <label style={labelStyle}>Nombre</label>
              <input value={zoneForm.name} onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="Ej. Salón comunal" />
              <label style={labelStyle}>Descripción</label>
              <input value={zoneForm.description} onChange={(e) => setZoneForm((f) => ({ ...f, description: e.target.value }))} style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Duración mínima (min)</label>
                  <input inputMode="numeric" value={zoneForm.minDurationMinutes} onChange={(e) => setZoneForm((f) => ({ ...f, minDurationMinutes: e.target.value.replace(/\D/g, '') }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Duración máxima (min)</label>
                  <input inputMode="numeric" value={zoneForm.maxDurationMinutes} onChange={(e) => setZoneForm((f) => ({ ...f, maxDurationMinutes: e.target.value.replace(/\D/g, '') }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Apertura</label>
                  <input value={zoneForm.openingTime} onChange={(e) => setZoneForm((f) => ({ ...f, openingTime: e.target.value }))} style={inputStyle} placeholder="08:00" />
                </div>
                <div>
                  <label style={labelStyle}>Cierre</label>
                  <input value={zoneForm.closingTime} onChange={(e) => setZoneForm((f) => ({ ...f, closingTime: e.target.value }))} style={inputStyle} placeholder="20:00" />
                </div>
                <div>
                  <label style={labelStyle}>Máx. reservas por semana</label>
                  <input inputMode="numeric" value={zoneForm.maxReservationsPerWeek} onChange={(e) => setZoneForm((f) => ({ ...f, maxReservationsPerWeek: e.target.value.replace(/\D/g, '') }))} style={inputStyle} />
                </div>
              </div>
              <label style={labelStyle}>Días bloqueados</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {WEEKDAY_LABELS.map((label, day) => (
                  <button key={day} type="button" onClick={() => toggleWeekday(day)} style={{ ...tabStyle(zoneForm.blockedWeekdays.includes(day)), border: 'none', fontFamily: 'inherit' }}>{label}</button>
                ))}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                <input type="checkbox" checked={zoneForm.requiresApproval} onChange={(e) => setZoneForm((f) => ({ ...f, requiresApproval: e.target.checked }))} />
                Requiere aprobación de un administrador
              </label>
              <label style={labelStyle}>Reglas / instrucciones</label>
              <textarea value={zoneForm.rules} onChange={(e) => setZoneForm((f) => ({ ...f, rules: e.target.value }))} rows={3} style={{ ...inputStyle, height: 'auto', paddingTop: 10 }} />
              <button type="button" onClick={createZone} disabled={creatingZone || !zoneForm.name.trim()} style={primaryButton}>{creatingZone ? 'Creando…' : 'Crear zona'}</button>
            </div>
          )}

          {zones.map((zone) => (
            <div key={zone.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <b style={{ fontSize: 14 }}>{zone.name}</b>
                <span style={zone.isActive ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt)}>{zone.isActive ? 'Activa' : 'Inactiva'}</span>
              </div>
              {zone.description && <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 6 }}>{zone.description}</div>}
              <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginBottom: 10 }}>
                {zone.openingTime}–{zone.closingTime} · {zone.minDurationMinutes}-{zone.maxDurationMinutes} min · máx {zone.maxReservationsPerWeek}/semana
                {zone.requiresApproval ? ' · requiere aprobación' : ' · aprobación automática'}
              </div>
              <button type="button" onClick={() => toggleZoneActive(zone)} style={secondaryButton}>{zone.isActive ? 'Desactivar' : 'Activar'}</button>
            </div>
          ))}
        </>
      )}
    </AdminShell>
  );
}
