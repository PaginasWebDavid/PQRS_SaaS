'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/design-export/AdminShell';
import { Sheet, CloseButton } from '@/components/design-export/Sheet';
import { Toast, useToast } from '@/components/design-export/Toast';
import { ADMIN_NAV } from '@/lib/design-export/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle, chipStyle } from '@/lib/design-export/tokens';

type Role = 'ADMIN' | 'ASISTENTE' | 'CONSEJO' | 'RESIDENTE';
type User = { id: string; name: string; email: string; role: Role; bloque?: number | null; apto?: number | null; isActive: boolean; createdAt: string };
const ROLES: Role[] = ['ADMIN','ASISTENTE','CONSEJO','RESIDENTE'];
const roleLabel: Record<Role,string> = { ADMIN:'Admin', ASISTENTE:'Asistente', CONSEJO:'Consejo', RESIDENTE:'Residente' };
const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0,2).join('').toUpperCase();

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]); const [search, setSearch] = useState(''); const [roleFilter, setRoleFilter] = useState('all'); const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<User | null>(null); const [editRole, setEditRole] = useState<Role>('RESIDENTE'); const { toast, showToast } = useToast();
  const load = useCallback(async () => { const res = await fetch('/api/users', { cache: 'no-store' }); const body = await res.json().catch(() => null); if (res.ok) setUsers(body); else showToast(body?.error || 'No se pudieron cargar los usuarios'); }, [showToast]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => users.filter((u) => (roleFilter === 'all' || u.role === roleFilter) && (status === 'all' || (status === 'active') === u.isActive) && (!search || (u.name + ' ' + u.email).toLowerCase().includes(search.toLowerCase()))), [users, search, roleFilter, status]);
  function edit(user: User) { setSelected(user); setEditRole(user.role); }
  async function save(patch: { role?: Role; isActive?: boolean }) { if (!selected) return; const res = await fetch('/api/users/' + selected.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo actualizar'); await load(); setSelected({ ...selected, ...body }); showToast('Usuario actualizado'); }

  return <AdminShell navItems={ADMIN_NAV} activeKey="usuarios" userName="Admin" userRole="AdministraciÃ³n" initials="AD" mobileTitle="Usuarios">
    <div className="apl-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}><div><h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 3px' }}>Usuarios</h1><p style={{ color: COLORS.textSecondary, margin: 0 }}>{users.length} usuarios del conjunto</p></div><Link href="/admin/invitaciones" style={{ background: COLORS.navy, color: '#FFF', padding: '11px 22px', borderRadius: RADIUS.pill, fontWeight: 700 }}>+ Invitar usuario</Link></div>
    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o correo" style={inputStyle} />
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0' }}>{['all',...ROLES].map((r) => <button key={r} onClick={() => setRoleFilter(r)} style={{ border: 0, ...tabStyle(roleFilter === r) }}>{r === 'all' ? 'Todos' : roleLabel[r as Role]}</button>)}</div>
    <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>{[['all','Cualquier estado'],['active','Activos'],['inactive','Inactivos']].map(([k,l]) => <button key={k} onClick={() => setStatus(k)} style={{ border: 0, ...tabStyle(status === k) }}>{l}</button>)}</div>
    <div style={{ background: '#FFF', border: '1px solid ' + COLORS.border, borderRadius: 18, overflow: 'hidden' }}>{filtered.length === 0 && <div style={{ padding: 50, textAlign: 'center', color: COLORS.textMuted }}>No hay usuarios con estos filtros.</div>}{filtered.map((u) => <button key={u.id} onClick={() => edit(u)} style={{ width: '100%', border: 0, borderBottom: '1px solid ' + COLORS.borderSoft, background: '#FFF', display: 'flex', alignItems: 'center', gap: 16, padding: '15px 22px', textAlign: 'left' }}><span style={{ width: 38, height: 38, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{initials(u.name)}</span><span style={{ flex: 1 }}><b style={{ display: 'block' }}>{u.name}</b><small style={{ color: COLORS.textMuted }}>{u.email}{u.bloque && u.apto ? ' Â· B' + u.bloque + '-' + u.apto : ''}</small></span><span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>{roleLabel[u.role]}</span><span style={u.isActive ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.neutralSoft, COLORS.textMuted)}>{u.isActive ? 'Activo' : 'Inactivo'}</span></button>)}</div>
    <Sheet open={!!selected} onClose={() => setSelected(null)} maxWidth={440}>{selected && <><div style={{ display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{selected.name}</h2><CloseButton onClick={() => setSelected(null)} /></div><p style={{ color: COLORS.textSecondary }}>{selected.email}</p><label style={labelStyle}>Rol</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{ROLES.map((r) => <button key={r} onClick={() => setEditRole(r)} style={{ border: 0, ...chipStyle(editRole === r) }}>{roleLabel[r]}</button>)}</div><button onClick={() => save({ role: editRole })} style={primary}>Guardar rol</button><button onClick={() => save({ isActive: !selected.isActive })} style={{ ...secondary, color: selected.isActive ? COLORS.warning : COLORS.success }}>{selected.isActive ? 'Desactivar usuario' : 'Reactivar usuario'}</button></>}</Sheet>
    <Toast message={toast} />
  </AdminShell>;
}
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 12, fontSize: 14 };
const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 700, margin: '18px 0 8px' };
const primary: React.CSSProperties = { width: '100%', border: 0, background: COLORS.navy, color: '#FFF', fontWeight: 700, padding: 13, borderRadius: RADIUS.pill, marginTop: 24 };
const secondary: React.CSSProperties = { width: '100%', border: '1.5px solid ' + COLORS.inputBorder, background: '#FFF', fontWeight: 700, padding: 12, borderRadius: RADIUS.pill, marginTop: 10 };
