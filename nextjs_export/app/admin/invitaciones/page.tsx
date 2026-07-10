'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Sheet, CloseButton } from '@/components/Sheet';
import { Toast, useToast } from '@/components/Toast';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle, chipStyle } from '@/lib/tokens';

type Status = 'pending' | 'accepted' | 'expired';
type Invite = { email: string; role: string; group: 'admin' | 'consejo' | 'residente'; date: string; status: Status };

const INITIAL: Invite[] = [
  { email: 'l.higuera@correo.com', role: 'Residente', group: 'residente', date: '06 jul', status: 'pending' },
  { email: 'consejo2@parque100.com', role: 'Consejo', group: 'consejo', date: '04 jul', status: 'accepted' },
  { email: 'nuevo.admin@parque100.com', role: 'Admin', group: 'admin', date: '28 jun', status: 'expired' },
];

const STATUS_META: Record<Status, { label: string; style: React.CSSProperties }> = {
  pending: { label: 'Pendiente', style: badgeStyle(COLORS.warningSoft, COLORS.warning) },
  accepted: { label: 'Aceptada', style: badgeStyle(COLORS.successSoft, COLORS.success) },
  expired: { label: 'Expirada', style: badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt) },
};
const ROLE_BADGE = { admin: badgeStyle(COLORS.navySoft, COLORS.navy), consejo: badgeStyle(COLORS.warningSoft, COLORS.warning), residente: badgeStyle(COLORS.successSoft, COLORS.success) };
const FILTERS = [{ key: 'all', label: 'Todas' }, { key: 'pending', label: 'Pendientes' }, { key: 'accepted', label: 'Aceptadas' }, { key: 'expired', label: 'Expiradas' }];

export default function InvitacionesPage() {
  const [invites, setInvites] = useState<Invite[]>(INITIAL);
  const [filter, setFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'consejo' | 'residente'>('residente');
  const { toast, showToast } = useToast();

  const filtered = filter === 'all' ? invites : invites.filter((i) => i.status === filter);

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="invitaciones" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Invitaciones">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <div><h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 3px' }}>Invitaciones</h1><p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>Invita nuevos usuarios a tu conjunto</p></div>
        <div onClick={() => setCreateOpen(true)} style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '11px 20px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>+ Nueva invitación</div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {FILTERS.map((f) => <div key={f.key} onClick={() => setFilter(f.key)} style={tabStyle(filter === f.key)}>{f.label}</div>)}
      </div>

      <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>No hay invitaciones en este estado.</div>}
        {filtered.map((inv) => (
          <div key={inv.email} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 180, fontSize: 13.5, fontWeight: 700 }}>{inv.email}</span>
            <span style={ROLE_BADGE[inv.group]}>{inv.role}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 80 }}>{inv.date}</span>
            <span style={STATUS_META[inv.status].style}>{STATUS_META[inv.status].label}</span>
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
              {inv.status !== 'accepted' && <span onClick={() => showToast(`Invitación reenviada a ${inv.email} ✓`)} style={{ fontSize: 12, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Reenviar</span>}
              {inv.status === 'pending' && <span onClick={() => { setInvites((v) => v.filter((x) => x.email !== inv.email)); showToast('Invitación cancelada'); }} style={{ fontSize: 12, fontWeight: 700, color: COLORS.warning, cursor: 'pointer' }}>Cancelar</span>}
            </div>
          </div>
        ))}
      </div>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={440}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Nueva invitación</h2>
          <CloseButton onClick={() => setCreateOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>Se enviará un correo con el enlace de activación.</p>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Correo electrónico</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 16 }} />
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Rol</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {(['admin', 'consejo', 'residente'] as const).map((r) => <div key={r} onClick={() => setRole(r)} style={chipStyle(role === r)}>{{ admin: 'Admin', consejo: 'Consejo', residente: 'Residente' }[r]}</div>)}
        </div>
        <div onClick={() => { if (!email.trim()) return; setInvites((v) => [{ email, role: { admin: 'Admin', consejo: 'Consejo', residente: 'Residente' }[role], group: role, date: 'hoy', status: 'pending' }, ...v]); setCreateOpen(false); setEmail(''); showToast('Invitación enviada ✓'); }} style={{ textAlign: 'center', background: email.trim() ? COLORS.navy : COLORS.neutralSoft, color: email.trim() ? '#FFFFFF' : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Enviar invitación</div>
      </Sheet>

      <Toast message={toast} />
    </AdminShell>
  );
}
