'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, tabStyle } from '@/lib/design/tokens';

type AuditEntry = {
  id: string;
  action: string;
  targetType?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { name?: string | null; email?: string | null } | null;
};

const FILTERS = [
  { key: 'all', label: 'Todo' },
  { key: 'pqrs', label: 'PQRS' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'licencia', label: 'Licencia' },
];

const CATEGORY_DOT: Record<string, string> = { pqrs: COLORS.navy, usuarios: COLORS.warning, licencia: COLORS.success };

function actionCategory(action: string): string {
  if (action.startsWith('PQRS_')) return 'pqrs';
  if (action.startsWith('INVITATION_') || action.startsWith('USER_') || action === 'ONBOARDING_COMPLETED' || action === 'PROFILE_UPDATED') return 'usuarios';
  return 'licencia';
}

function meta(entry: AuditEntry, key: string): string {
  const value = entry.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function actorName(entry: AuditEntry): string {
  return entry.actor?.name || entry.actor?.email || 'Alguien';
}

function describe(entry: AuditEntry): string {
  const who = actorName(entry);
  const email = meta(entry, 'email');
  switch (entry.action) {
    case 'PQRS_CREATED':
      return `${who} radicó una nueva PQRS${meta(entry, 'asunto') ? ` — "${meta(entry, 'asunto')}"` : ''}`;
    case 'PQRS_UPDATED':
      return `${who} actualizó una PQRS`;
    case 'PQRS_CLOSED':
      return `${who} cerró una PQRS`;
    case 'INVITATION_CREATED':
      return `${who} invitó a ${email || 'un nuevo usuario'}`;
    case 'INVITATION_RESENT':
      return `${who} reenvió la invitación a ${email}`;
    case 'INVITATION_ACCEPTED':
      return `${email || who} aceptó su invitación y activó su cuenta`;
    case 'INVITATION_CANCELLED':
      return `${who} canceló la invitación a ${email}`;
    case 'INVITATION_EXPIRED':
      return `La invitación a ${email} expiró sin ser aceptada`;
    case 'USER_UPDATED':
      return `${who} actualizó los datos de un usuario`;
    case 'USER_DEACTIVATED':
      return `${who} desactivó un usuario`;
    case 'USER_REACTIVATED':
      return `${who} reactivó un usuario`;
    case 'ONBOARDING_COMPLETED':
      return `${who} completó el onboarding`;
    case 'PROFILE_UPDATED':
      return `${who} actualizó su perfil`;
    case 'TENANT_CREATED':
      return 'Tu conjunto fue creado en la plataforma';
    case 'TENANT_UPDATED':
      return `${who} actualizó los datos del conjunto`;
    case 'TENANT_SUSPENDED':
      return 'La licencia del conjunto fue suspendida';
    case 'TENANT_REACTIVATED':
      return 'La licencia del conjunto fue reactivada';
    case 'TENANT_CANCELLED':
      return 'La licencia del conjunto fue cancelada';
    case 'SUBSCRIPTION_CREATED':
      return 'Se generó la licencia del conjunto, pendiente de primer pago';
    case 'SUBSCRIPTION_RENEWED':
      return 'La licencia fue renovada';
    case 'MERCADO_PAGO_SUBSCRIPTION_CREATED':
      return `${who} inició el pago de la licencia con Mercado Pago`;
    case 'MERCADO_PAGO_WEBHOOK_PROCESSED':
      return 'Mercado Pago confirmó un movimiento sobre la licencia';
    case 'SUBSCRIPTION_AUTO_RENEW_DISABLED':
      return `${who} desactivó la renovación automática de la licencia`;
    case 'SUBSCRIPTION_AUTO_RENEW_ENABLED':
      return `${who} activó la renovación automática de la licencia`;
    case 'SUBSCRIPTION_PAYMENT_FAILED':
      return 'Un pago de la licencia fue rechazado';
    default:
      return `${who} — ${entry.action.replaceAll('_', ' ').toLowerCase()}`;
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'justo ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ActividadPage() {
  const [filter, setFilter] = useState('all');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (category: string, skip: number) => {
    const res = await fetch(`/api/actividad?category=${category}&take=20&skip=${skip}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  }, []);

  useEffect(() => {
    setLoading(true);
    load(filter, 0).then((body) => {
      if (body) { setEntries(body.entries); setTotal(body.total); }
      setLoading(false);
    });
  }, [filter, load]);

  async function loadMore() {
    setLoadingMore(true);
    const body = await load(filter, entries.length);
    if (body) setEntries((prev) => [...prev, ...body.entries]);
    setLoadingMore(false);
  }

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="actividad" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Actividad">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Actividad</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Trazabilidad completa de tu conjunto</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{ ...tabStyle(filter === f.key), border: 'none', fontFamily: 'inherit' }}>{f.label}</button>)}
      </div>

      <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: '22px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando actividad…</div>}
        {!loading && entries.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>No hay actividad registrada en esta categoría.</div>}
        {!loading && entries.map((ev, i) => (
          <div key={ev.id} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 9, height: 9, borderRadius: 999, background: CATEGORY_DOT[actionCategory(ev.action)] || COLORS.textMuted, marginTop: 5, flexShrink: 0 }} />
              {i < entries.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'rgba(0,0,0,0.08)', margin: '3px 0' }} />}
            </div>
            <div style={{ paddingBottom: i < entries.length - 1 ? 18 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{describe(ev)}</div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, marginTop: 2 }}>{relativeTime(ev.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>

      {!loading && entries.length < total && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" onClick={loadMore} disabled={loadingMore} style={{ border: `1.5px solid ${COLORS.inputBorder}`, background: 'transparent', color: COLORS.textSecondaryAlt, fontSize: 13, fontWeight: 700, padding: '10px 22px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' }}>
            {loadingMore ? 'Cargando…' : 'Ver más'}
          </button>
        </div>
      )}
    </AdminShell>
  );
}
