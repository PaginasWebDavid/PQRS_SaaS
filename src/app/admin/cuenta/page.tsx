'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/shell/AdminShell';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, tabStyle } from '@/lib/design/tokens';

type Notice = { id: string; title: string; message: string; resourceType?: string | null; resourceId?: string | null; readAt?: string | null; createdAt: string };

function shortDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
}

export default function MiCuentaPage() {
  const [tab, setTab] = useState<'profile' | 'seguridad' | 'notif'>('profile');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [notifyNewPqrsEmail, setNotifyNewPqrsEmail] = useState(true);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast, showToast } = useToast();

  async function load() {
    const [m, n] = await Promise.all([
      fetch('/api/me', { cache: 'no-store' }),
      fetch('/api/notifications', { cache: 'no-store' }),
    ]);
    if (m.ok) {
      const d = await m.json();
      setName(d.user?.name || '');
      setPhone(d.user?.phone || '');
      setEmail(d.user?.email || '');
      setImage(d.user?.image || null);
      setCreatedAt(d.user?.createdAt || null);
      setNotifyNewPqrsEmail(d.user?.notifyNewPqrsEmail ?? true);
    }
    if (n.ok) setNotices(await n.json());
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return showToast(body?.error || 'No se pudo guardar');
    showToast('Perfil actualizado');
  }

  async function toggleNotify(next: boolean) {
    setNotifyNewPqrsEmail(next);
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, notifyNewPqrsEmail: next }) });
    if (!res.ok) { setNotifyNewPqrsEmail(!next); showToast('No se pudo actualizar la preferencia'); return; }
    showToast(next ? 'Recibirás correo por cada nueva PQRS' : 'Ya no recibirás correo por nuevas PQRS');
  }

  async function uploadAvatar(file: File) {
    setAvatarLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/me/avatar', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) { showToast(body?.error || 'No se pudo subir la foto'); return; }
      setImage(body.image);
      showToast('Foto de perfil actualizada');
    } finally {
      setAvatarLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeAvatar() {
    setAvatarLoading(true);
    try {
      const res = await fetch('/api/me/avatar', { method: 'DELETE' });
      if (res.ok) { setImage(null); showToast('Foto de perfil eliminada'); }
    } finally {
      setAvatarLoading(false);
    }
  }

  async function read(n: Notice) {
    if (!n.readAt) await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) });
    setNotices((v) => v.map((x) => x.id === n.id ? { ...x, readAt: x.readAt || new Date().toISOString() } : x));
    if (n.resourceType === 'Pqrs' && n.resourceId) window.location.href = '/admin/pqrs?id=' + encodeURIComponent(n.resourceId);
  }
  async function readAll() {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
    setNotices((v) => v.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
  }

  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const unreadCount = notices.filter((n) => !n.readAt).length;

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="cuenta" userName={name || 'Admin'} userRole="Administración" initials={initials || 'AD'} mobileTitle="Mi cuenta">
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 18px' }}>Mi cuenta</h1>
      <div style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
          <button onClick={() => setTab('profile')} style={{ border: 0, ...tabStyle(tab === 'profile') }}>Perfil</button>
          <button onClick={() => setTab('seguridad')} style={{ border: 0, ...tabStyle(tab === 'seguridad') }}>Seguridad</button>
          <button onClick={() => setTab('notif')} style={{ border: 0, ...tabStyle(tab === 'notif') }}>Notificaciones {unreadCount > 0 ? `(${unreadCount})` : ''}</button>
        </div>

        {tab === 'profile' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
              <div style={{ width: 64, height: 64, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, overflow: 'hidden', flexShrink: 0 }}>
                {image ? <img src={image} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" disabled={avatarLoading} onClick={() => fileRef.current?.click()} style={{ border: `1.5px solid ${COLORS.inputBorder}`, background: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' }}>{avatarLoading ? 'Subiendo…' : 'Cambiar foto'}</button>
                  {image && <button type="button" disabled={avatarLoading} onClick={removeAvatar} style={{ border: 0, background: 'none', color: COLORS.danger, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Quitar</button>}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, marginTop: 6 }}>JPG, PNG o WEBP. Máximo 2MB.</div>
              </div>
            </div>
            <Label>Nombre completo</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <Label>Teléfono</Label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            <Label>Correo</Label>
            <input value={email} disabled style={{ ...inputStyle, background: '#F0F0F0', color: COLORS.textMuted }} />
            <button onClick={save} style={primary}>Guardar cambios</button>
          </div>
        )}

        {tab === 'seguridad' && (
          <div style={card}>
            <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Acceso a la cuenta</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>ROL</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Administrador</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>MIEMBRO DESDE</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{shortDate(createdAt)}</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 20 }}>Correo de acceso: <span style={{ color: COLORS.textPrimary, fontWeight: 800 }}>{email}</span></div>
            <Link href="/cambiar-contrasena" style={{ display: 'inline-block', border: `1.5px solid ${COLORS.inputBorder}`, color: COLORS.textPrimary, fontSize: 13, fontWeight: 700, padding: '11px 20px', borderRadius: RADIUS.pill, textDecoration: 'none' }}>Cambiar contraseña</Link>
          </div>
        )}

        {tab === 'notif' && (
          <div>
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ maxWidth: 420 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Avisarme por correo ante una nueva PQRS</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 500 }}>Además de la notificación aquí abajo, te llega un correo apenas un residente radica una solicitud.</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleNotify(!notifyNewPqrsEmail)}
                  style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', background: notifyNewPqrsEmail ? COLORS.success : COLORS.neutralSoft, transition: 'background 150ms' }}
                >
                  <span style={{ position: 'absolute', top: 3, left: notifyNewPqrsEmail ? 23 : 3, width: 20, height: 20, borderRadius: 999, background: '#FFFFFF', transition: 'left 150ms', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button onClick={readAll} style={{ border: 0, background: 'none', color: COLORS.navy, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Marcar todas como leídas</button>
            </div>
            {notices.length === 0 ? <div style={empty}>No tienes notificaciones.</div> : notices.map((n) => (
              <button key={n.id} onClick={() => read(n)} style={{ width: '100%', border: 0, textAlign: 'left', background: n.readAt ? '#FFF' : COLORS.bgCard, borderRadius: 14, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                <b>{n.title}</b>
                <span style={{ display: 'block', color: COLORS.textSecondary, fontSize: 13, marginTop: 3 }}>{n.message}</span>
                <small style={{ color: COLORS.textMuted }}>{new Date(n.createdAt).toLocaleString('es-CO')}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <Toast message={toast} />
    </AdminShell>
  );
}

function Label({ children }: { children: React.ReactNode }) { return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, margin: '14px 0 7px' }}>{children}</label>; }
const card: React.CSSProperties = { background: COLORS.bgCard, borderRadius: 18, padding: 24 };
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit' };
const primary: React.CSSProperties = { border: 0, background: COLORS.navy, color: '#FFF', fontWeight: 700, padding: '13px 24px', borderRadius: RADIUS.pill, marginTop: 20, cursor: 'pointer', fontFamily: 'inherit' };
const empty: React.CSSProperties = { textAlign: 'center', padding: 50, color: COLORS.textMuted };
