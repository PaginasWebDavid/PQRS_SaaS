'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { Sheet, CloseButton } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, chipStyle } from '@/lib/design/tokens';

type Role = 'ADMIN' | 'CONSEJO' | 'RESIDENTE';
type User = { id: string; name: string; email: string; role: Role; bloque?: number | null; apto?: number | null; isActive: boolean; createdAt: string };
type ProfileStats = User & { pqrsTotal: number; pqrsTerminadas: number };
const EDITABLE_ROLES: Role[] = ['ADMIN', 'CONSEJO', 'RESIDENTE'];
const roleLabel: Record<Role, string> = { ADMIN: 'Admin', CONSEJO: 'Consejo', RESIDENTE: 'Residente' };
const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const AVATAR_BG = [COLORS.navySoft, COLORS.successSoft, COLORS.warningSoft, COLORS.bgCard];
const AVATAR_COLOR = [COLORS.navy, COLORS.success, COLORS.warning, COLORS.textSecondaryAlt];

function StatusDot({ active }: { active: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: active ? COLORS.success : COLORS.textMuted, flexShrink: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: active ? COLORS.success : COLORS.inputBorderStrong }} />
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function UserRow({ u, index, onClick }: { u: User; index: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', border: 0, borderBottom: '1px solid ' + COLORS.borderSoft, background: '#FFF', display: 'flex', alignItems: 'center', gap: 16, padding: '15px 22px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
      <span style={{ width: 38, height: 38, borderRadius: 999, background: AVATAR_BG[index % 4], color: AVATAR_COLOR[index % 4], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{initials(u.name)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 14 }}>{u.name}</b>
        <small style={{ color: COLORS.textMuted }}>{u.email}{u.bloque && u.apto ? ` · B${u.bloque}-${u.apto}` : ''}</small>
      </span>
      <StatusDot active={u.isActive} />
    </button>
  );
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [bloqueFilter, setBloqueFilter] = useState('all');
  const { toast, showToast } = useToast();

  const [selected, setSelected] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileStats | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [editRole, setEditRole] = useState<Role>('RESIDENTE');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('RESIDENTE');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/users', { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (res.ok) setUsers(body); else showToast(body?.error || 'No se pudieron cargar los usuarios');
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (u: User) => !q || (u.name + ' ' + u.email).toLowerCase().includes(q);

  const admins = useMemo(() => users.filter((u) => u.role === 'ADMIN' && matchesSearch(u)), [users, q]);
  const consejo = useMemo(() => users.filter((u) => u.role === 'CONSEJO' && matchesSearch(u)), [users, q]);
  const residentes = useMemo(
    () => users.filter((u) => u.role === 'RESIDENTE' && matchesSearch(u) && (bloqueFilter === 'all' || String(u.bloque) === bloqueFilter)),
    [users, q, bloqueFilter]
  );
  const bloques = useMemo(() => Array.from(new Set(users.filter((u) => u.role === 'RESIDENTE' && u.bloque).map((u) => u.bloque as number))).sort((a, b) => a - b), [users]);

  async function edit(user: User) {
    setSelected(user);
    setEditRole(user.role);
    setProfile(null);
    setProfileLoading(true);
    try {
      const res = await fetch('/api/users/' + user.id, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.ok) setProfile(body);
    } finally { setProfileLoading(false); }
  }

  async function save(patch: { role?: Role; isActive?: boolean }) {
    if (!selected) return;
    const res = await fetch('/api/users/' + selected.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return showToast(body?.error || 'No se pudo actualizar');
    await load();
    setSelected({ ...selected, ...body });
    setProfile((p) => p ? { ...p, ...body } : p);
    showToast('Usuario actualizado');
  }

  function openInvite() { setInviteEmail(''); setInviteRole('RESIDENTE'); setInviteOpen(true); }

  async function submitInvite() {
    if (!inviteEmail.trim()) return;
    setInviteSubmitting(true);
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) { showToast(body?.error || 'No se pudo enviar la invitación'); return; }
      setInviteOpen(false);
      showToast(body?.email?.sent ? 'Invitación enviada ✓' : 'Invitación creada, pero el correo no se pudo enviar');
    } finally { setInviteSubmitting(false); }
  }

  return <AdminShell navItems={ADMIN_NAV} activeKey="usuarios" userName="Admin" userRole="Administración" initials="AD" mobileTitle="Usuarios">
    <div className="apl-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
      <div><h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 3px' }}>Usuarios</h1><p style={{ color: COLORS.textSecondary, margin: 0 }}>{users.length} usuarios del conjunto</p></div>
      <button type="button" onClick={openInvite} style={{ background: COLORS.navy, color: '#FFF', border: 0, padding: '11px 22px', borderRadius: RADIUS.pill, fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer' }}>+ Invitar usuario</button>
    </div>

    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o correo" style={{ ...inputStyle, flex: 1, minWidth: 220, marginBottom: 0 }} />
      <select value={bloqueFilter} onChange={(e) => setBloqueFilter(e.target.value)} style={{ ...inputStyle, width: 160, marginBottom: 0, background: '#FFF' }}>
        <option value="all">Todos los bloques</option>
        {bloques.map((b) => <option key={b} value={String(b)}>Bloque {b}</option>)}
      </select>
    </div>

    <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.textMuted, letterSpacing: '0.04em', marginBottom: 10 }}>ADMINISTRADORES</div>
    <div style={{ background: '#FFF', border: '1px solid ' + COLORS.border, borderRadius: 18, overflow: 'hidden', marginBottom: 24 }}>
      {admins.length === 0 ? <div style={{ padding: '20px 22px', color: COLORS.textMuted, fontSize: 13 }}>No hay administradores.</div> : admins.map((u, i) => <UserRow key={u.id} u={u} index={i} onClick={() => edit(u)} />)}
    </div>

    <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.textMuted, letterSpacing: '0.04em', marginBottom: 10 }}>CONSEJO</div>
    <div style={{ background: '#FFF', border: '1px solid ' + COLORS.border, borderRadius: 18, overflow: 'hidden', marginBottom: 24 }}>
      {consejo.length === 0 ? <div style={{ padding: '20px 22px', color: COLORS.textMuted, fontSize: 13 }}>No hay miembros de consejo.</div> : consejo.map((u, i) => <UserRow key={u.id} u={u} index={i} onClick={() => edit(u)} />)}
    </div>

    <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.textMuted, letterSpacing: '0.04em', marginBottom: 10 }}>RESIDENTES {bloqueFilter !== 'all' ? `· Bloque ${bloqueFilter}` : ''}</div>
    <div style={{ background: '#FFF', border: '1px solid ' + COLORS.border, borderRadius: 18, overflow: 'hidden' }}>
      {residentes.length === 0 ? <div style={{ padding: 50, textAlign: 'center', color: COLORS.textMuted }}>No hay residentes con estos filtros.</div> : residentes.map((u, i) => <UserRow key={u.id} u={u} index={i} onClick={() => edit(u)} />)}
    </div>

    <Sheet open={!!selected} onClose={() => { setSelected(null); setProfile(null); }} maxWidth={440}>
      {selected && <>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{selected.name}</h2><CloseButton onClick={() => { setSelected(null); setProfile(null); }} /></div>
        <p style={{ color: COLORS.textSecondary, margin: '4px 0 18px' }}>{selected.email}{selected.bloque && selected.apto ? ` · Bloque ${selected.bloque}, Apto ${selected.apto}` : ''}</p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
          <div style={{ flex: 1, background: COLORS.bgCard, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>PQRS RADICADAS</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{profileLoading ? '—' : (profile?.pqrsTotal ?? 0)}</div>
          </div>
          <div style={{ flex: 1, background: COLORS.bgCard, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>FINALIZADAS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.success }}>{profileLoading ? '—' : (profile?.pqrsTerminadas ?? 0)}</div>
          </div>
        </div>

        <label style={labelStyle}>Rol</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{EDITABLE_ROLES.map((r) => <button key={r} onClick={() => setEditRole(r)} style={{ border: 0, ...chipStyle(editRole === r) }}>{roleLabel[r]}</button>)}</div>
        <button onClick={() => save({ role: editRole })} style={primary}>Guardar rol</button>
        <button onClick={() => save({ isActive: !selected.isActive })} style={{ ...secondary, color: selected.isActive ? COLORS.warning : COLORS.success }}>{selected.isActive ? 'Desactivar usuario' : 'Reactivar usuario'}</button>
      </>}
    </Sheet>

    <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth={440}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Invitar usuario</h2>
        <CloseButton onClick={() => setInviteOpen(false)} />
      </div>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 22px' }}>Recibirá una invitación por correo para unirse a tu conjunto.</p>
      <label style={labelStyle}>Correo electrónico</label>
      <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="nombre@correo.com" style={inputStyle} />
      <label style={labelStyle}>Rol</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>{EDITABLE_ROLES.map((r) => <button key={r} onClick={() => setInviteRole(r)} style={{ border: 0, ...chipStyle(inviteRole === r) }}>{roleLabel[r]}</button>)}</div>
      <button onClick={submitInvite} disabled={!inviteEmail.trim() || inviteSubmitting} style={{ ...primary, opacity: (!inviteEmail.trim() || inviteSubmitting) ? 0.5 : 1, cursor: (!inviteEmail.trim() || inviteSubmitting) ? 'default' : 'pointer' }}>{inviteSubmitting ? 'Enviando…' : 'Enviar invitación'}</button>
      <Link href="/admin/invitaciones" style={{ display: 'block', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: COLORS.textMuted, marginTop: 14 }}>Ver invitaciones pendientes →</Link>
    </Sheet>

    <Toast message={toast} />
  </AdminShell>;
}
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 14 };
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 700, margin: '18px 0 8px' };
const primary: React.CSSProperties = { width: '100%', border: 0, background: COLORS.navy, color: '#FFF', fontWeight: 700, padding: 13, borderRadius: RADIUS.pill, marginTop: 24, fontFamily: 'inherit' };
const secondary: React.CSSProperties = { width: '100%', border: '1.5px solid ' + COLORS.inputBorder, background: '#FFF', fontWeight: 700, padding: 12, borderRadius: RADIUS.pill, marginTop: 10, fontFamily: 'inherit' };
