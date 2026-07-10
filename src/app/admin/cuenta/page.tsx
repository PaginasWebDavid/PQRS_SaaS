'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, tabStyle } from '@/lib/design/tokens';

type Notice = { id: string; title: string; message: string; resourceType?: string | null; resourceId?: string | null; readAt?: string | null; createdAt: string };
export default function MiCuentaPage() {
  const [tab, setTab] = useState<'profile' | 'notif'>('profile'); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [notices, setNotices] = useState<Notice[]>([]); const { toast, showToast } = useToast();
  async function load() { const [m,n] = await Promise.all([fetch('/api/me', { cache: 'no-store' }), fetch('/api/notifications', { cache: 'no-store' })]); if (m.ok) { const d = await m.json(); setName(d.user?.name || ''); setPhone(d.user?.phone || ''); setEmail(d.user?.email || ''); } if (n.ok) setNotices(await n.json()); }
  useEffect(() => { void load(); }, []);
  async function save() { const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) }); const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo guardar'); showToast('Perfil actualizado'); }
  async function read(n: Notice) { if (!n.readAt) await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) }); setNotices((v) => v.map((x) => x.id === n.id ? { ...x, readAt: x.readAt || new Date().toISOString() } : x)); if (n.resourceType === 'Pqrs' && n.resourceId) window.location.href = '/admin/pqrs?id=' + encodeURIComponent(n.resourceId); }
  async function readAll() { await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }); setNotices((v) => v.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))); }
  const initials = name.split(' ').map((p) => p[0]).slice(0,2).join('').toUpperCase();
  return <AdminShell navItems={ADMIN_NAV} activeKey="cuenta" userName={name || 'Admin'} userRole="Administración" initials={initials || 'AD'} mobileTitle="Mi cuenta">
    <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 18px' }}>Mi cuenta</h1><div style={{ maxWidth: 640 }}><div style={{ display: 'flex', gap: 6, marginBottom: 22 }}><button onClick={() => setTab('profile')} style={{ border: 0, ...tabStyle(tab === 'profile') }}>Perfil</button><button onClick={() => setTab('notif')} style={{ border: 0, ...tabStyle(tab === 'notif') }}>Notificaciones ({notices.filter((n) => !n.readAt).length})</button></div>
    {tab === 'profile' && <><div style={card}><div style={{ width: 64, height: 64, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, marginBottom: 20 }}>{initials}</div><Label>Nombre completo</Label><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /><Label>Teléfono</Label><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /><Label>Correo</Label><input value={email} disabled style={{ ...inputStyle, background: '#F0F0F0', color: COLORS.textMuted }} /><button onClick={save} style={primary}>Guardar cambios</button><Link href="/cambiar-contrasena" style={{ display: 'block', color: COLORS.navy, fontWeight: 700, marginTop: 18 }}>Cambiar contraseña</Link></div></>}
    {tab === 'notif' && <div><div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button onClick={readAll} style={{ border: 0, background: 'none', color: COLORS.navy, fontWeight: 700 }}>Marcar todas como leídas</button></div>{notices.length === 0 ? <div style={empty}>No tienes notificaciones.</div> : notices.map((n) => <button key={n.id} onClick={() => read(n)} style={{ width: '100%', border: 0, textAlign: 'left', background: n.readAt ? '#FFF' : COLORS.bgCard, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}><b>{n.title}</b><span style={{ display: 'block', color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>{n.message}</span><small style={{ color: COLORS.textMuted }}>{new Date(n.createdAt).toLocaleString('es-CO')}</small></button>)}</div>}</div><Toast message={toast} />
  </AdminShell>;
}
function Label({ children }: { children: React.ReactNode }) { return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, margin: '14px 0 7px' }}>{children}</label>; }
const card: React.CSSProperties = { background: COLORS.bgCard, borderRadius: 18, padding: 24 };
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 11, fontSize: 13.5 };
const primary: React.CSSProperties = { border: 0, background: COLORS.navy, color: '#FFF', fontWeight: 700, padding: '13px 24px', borderRadius: RADIUS.pill, marginTop: 20 };
const empty: React.CSSProperties = { textAlign: 'center', padding: 50, color: COLORS.textMuted };
