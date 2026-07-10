'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Sheet, CloseButton } from '@/components/Sheet';
import { Toast, useToast } from '@/components/Toast';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle, chipStyle } from '@/lib/tokens';

type Role = 'admin' | 'consejo' | 'residente';
type User = { name: string; email: string; role: string; group: Role; status: 'Activo' | 'Pendiente' | 'Inactivo'; active: boolean };

const INITIAL: User[] = [
  { name: 'Ana Ruiz', email: 'ana.ruiz@parque100.com', role: 'Admin', group: 'admin', status: 'Activo', active: true },
  { name: 'Julián Pardo', email: 'j.pardo@parque100.com', role: 'Admin', group: 'admin', status: 'Activo', active: true },
  { name: 'Camila Molina', email: 'c.molina@parque100.com', role: 'Consejo', group: 'consejo', status: 'Activo', active: true },
  { name: 'Diego Salazar', email: 'd.salazar@correo.com', role: 'Residente', group: 'residente', status: 'Activo', active: true },
  { name: 'Laura Higuera', email: 'l.higuera@correo.com', role: 'Residente', group: 'residente', status: 'Pendiente', active: false },
  { name: 'Sergio Nieto', email: 's.nieto@correo.com', role: 'Residente', group: 'residente', status: 'Inactivo', active: false },
];

const ROLE_BADGE: Record<Role, React.CSSProperties> = {
  admin: badgeStyle(COLORS.navySoft, COLORS.navy), consejo: badgeStyle(COLORS.warningSoft, COLORS.warning), residente: badgeStyle(COLORS.successSoft, COLORS.success),
};
const STATUS_BADGE = { Activo: badgeStyle(COLORS.successSoft, COLORS.success), Pendiente: badgeStyle(COLORS.warningSoft, COLORS.warning), Inactivo: badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt) };
const FILTERS: { key: Role | 'all'; label: string }[] = [{ key: 'all', label: 'Todos' }, { key: 'admin', label: 'Admin' }, { key: 'consejo', label: 'Consejo' }, { key: 'residente', label: 'Residente' }];

export default function ModuloUsuariosPage() {
  const [users, setUsers] = useState<User[]>(INITIAL);
  const [filter, setFilter] = useState<Role | 'all'>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('admin');
  const { toast, showToast } = useToast();

  const filtered = filter === 'all' ? users : users.filter((u) => u.group === filter);

  const toggle = (email: string) => setUsers((us) => us.map((u) => u.email === email ? { ...u, active: !u.active, status: !u.active ? 'Activo' : 'Inactivo' } : u));

  const submitInvite = () => {
    if (!inviteEmail.trim()) return;
    const label = { admin: 'Admin', consejo: 'Consejo', residente: 'Residente' }[inviteRole];
    setUsers((us) => [...us, { name: inviteEmail.split('@')[0], email: inviteEmail, role: label, group: inviteRole, status: 'Pendiente', active: false }]);
    setInviteOpen(false); setInviteEmail(''); showToast('Invitación enviada ✓');
  };

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="usuarios" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Usuarios">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div><h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 3px' }}>Usuarios</h1><p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>{users.length} usuarios · Parque Residencial Calle 100</p></div>
        <div onClick={() => setInviteOpen(true)} style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, padding: '11px 22px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>+ Invitar usuario</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => <div key={f.key} onClick={() => setFilter(f.key)} style={tabStyle(filter === f.key)}>{f.label}</div>)}
      </div>

      <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>No hay usuarios con este filtro.</div>}
        {filtered.map((u) => (
          <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <div style={{ width: 38, height: 38, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{u.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{u.name}</div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
            </div>
            <span style={{ width: 110, flexShrink: 0 }}><span style={ROLE_BADGE[u.group]}>{u.role}</span></span>
            <span style={{ width: 100, flexShrink: 0 }}><span style={STATUS_BADGE[u.status]}>{u.status}</span></span>
            <div onClick={() => toggle(u.email)} style={{ fontSize: 12, fontWeight: 700, color: u.active ? COLORS.textSecondary : '#FFFFFF', background: u.active ? COLORS.bgCard : COLORS.navy, padding: '8px 15px', borderRadius: RADIUS.pill, cursor: 'pointer', flexShrink: 0 }}>{u.active ? 'Desactivar' : 'Activar'}</div>
          </div>
        ))}
      </div>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth={460}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Invitar usuario</h2>
          <CloseButton onClick={() => setInviteOpen(false)} />
        </div>
        <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 24px' }}>Recibirá una invitación por correo para unirse a tu conjunto.</p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Correo electrónico</label>
        <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="nombre@correo.com" style={{ width: '100%', height: 46, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14.5, fontFamily: 'inherit', marginBottom: 18 }} />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Rol</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 26 }}>
          {(['admin', 'consejo', 'residente'] as const).map((r) => <div key={r} onClick={() => setInviteRole(r)} style={chipStyle(inviteRole === r)}>{{ admin: 'Admin', consejo: 'Consejo', residente: 'Residente' }[r]}</div>)}
        </div>
        <div onClick={submitInvite} style={{ textAlign: 'center', background: inviteEmail.trim() ? COLORS.navy : COLORS.neutralSoft, color: inviteEmail.trim() ? '#FFFFFF' : COLORS.textMuted, fontSize: 14.5, fontWeight: 700, padding: '14px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Enviar invitación</div>
      </Sheet>

      <Toast message={toast} />
    </AdminShell>
  );
}
