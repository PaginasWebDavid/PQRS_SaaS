'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/design-export/AdminShell';
import { Sheet, CloseButton } from '@/components/design-export/Sheet';
import { Toast, useToast } from '@/components/design-export/Toast';
import { ADMIN_NAV } from '@/lib/design-export/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle, chipStyle } from '@/lib/design-export/tokens';

type Status = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
type Role = 'ADMIN' | 'ASISTENTE' | 'CONSEJO' | 'RESIDENTE';
type Invite = { id: string; email: string; role: Role; status: Status; createdAt: string; expiresAt: string; acceptedAt?: string | null };
const STATUS_META: Record<Status, { label: string; style: React.CSSProperties }> = {
  PENDING: { label: 'Pendiente', style: badgeStyle(COLORS.warningSoft, COLORS.warning) },
  ACCEPTED: { label: 'Aceptada', style: badgeStyle(COLORS.successSoft, COLORS.success) },
  EXPIRED: { label: 'Expirada', style: badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt) },
  CANCELLED: { label: 'Cancelada', style: badgeStyle(COLORS.neutralSoft, COLORS.textMuted) },
};
const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', ASISTENTE: 'Asistente', CONSEJO: 'Consejo', RESIDENTE: 'Residente' };
const FILTERS = [{ key: 'all', label: 'Todas' }, ...Object.entries(STATUS_META).map(([key, value]) => ({ key, label: value.label }))];

export default function InvitacionesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [filter, setFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('RESIDENTE');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/invitations', { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (res.ok) setInvites(body); else showToast(body?.error || 'No se pudieron cargar las invitaciones');
    setLoading(false);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!email.trim()) return;
    const res = await fetch('/api/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return showToast(body?.error || 'No se pudo enviar la invitación');
    setCreateOpen(false); setEmail(''); await load();
    showToast(body?.email?.sent === false ? 'Invitación creada; el correo quedó pendiente' : 'Invitación enviada');
  }
  async function action(invite: Invite, actionName: 'resend' | 'cancel') {
    setWorkingId(invite.id);
    const res = await fetch('/api/invitations/' + invite.id + '/' + actionName, { method: 'POST' });
    const body = await res.json().catch(() => null);
    setWorkingId('');
    if (!res.ok) return showToast(body?.error || 'No se pudo completar la acción');
    await load(); showToast(actionName === 'resend' ? 'Invitación reenviada' : 'Invitación cancelada');
  }

  const filtered = filter === 'all' ? invites : invites.filter((i) => i.status === filter);
  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="invitaciones" userName="Admin" userRole="Administración" initials="AD" mobileTitle="Invitaciones">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <div><h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 3px' }}>Invitaciones</h1><p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>Invita nuevos usuarios a tu conjunto</p></div>
        <button onClick={() => setCreateOpen(true)} style={{ border: 0, background: COLORS.navy, color: '#FFF', fontSize: 13, fontWeight: 700, padding: '11px 20px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>+ Nueva invitación</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>{FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} style={{ border: 0, ...tabStyle(filter === f.key) }}>{f.label}</button>)}</div>
      <div style={{ background: '#FFF', border: '1px solid ' + COLORS.border, borderRadius: 18, overflow: 'hidden' }}>
        {loading && <div style={{ textAlign: 'center', padding: 48, color: COLORS.textMuted }}>Cargando invitaciones…</div>}
        {!loading && filtered.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: COLORS.textMuted }}>No hay invitaciones en este estado.</div>}
        {!loading && filtered.map((inv) => <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: '1px solid ' + COLORS.borderSoft, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 190, fontSize: 13.5, fontWeight: 700 }}>{inv.email}</span>
          <span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>{ROLE_LABEL[inv.role]}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: COLORS.textMuted }}>{new Date(inv.expiresAt).toLocaleDateString('es-CO')}</span>
          <span style={STATUS_META[inv.status].style}>{STATUS_META[inv.status].label}</span>
          {inv.status === 'PENDING' && <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <button disabled={workingId === inv.id} onClick={() => action(inv, 'resend')} style={{ border: 0, background: 'none', color: COLORS.navy, fontWeight: 700, cursor: 'pointer' }}>Reenviar</button>
            <button disabled={workingId === inv.id} onClick={() => action(inv, 'cancel')} style={{ border: 0, background: 'none', color: COLORS.warning, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          </div>}
        </div>)}
      </div>
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={440}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Nueva invitación</h2><CloseButton onClick={() => setCreateOpen(false)} /></div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>Se enviará un correo con el enlace de activación.</p>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Correo electrónico</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 11, marginBottom: 16 }} />
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Rol</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <button key={r} onClick={() => setRole(r)} style={{ border: 0, ...chipStyle(role === r) }}>{ROLE_LABEL[r]}</button>)}</div>
        <button onClick={create} disabled={!email.trim()} style={{ width: '100%', border: 0, background: email.trim() ? COLORS.navy : COLORS.neutralSoft, color: email.trim() ? '#FFF' : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill }}>Enviar invitación</button>
      </Sheet>
      <Toast message={toast} />
    </AdminShell>
  );
}
