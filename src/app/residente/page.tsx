'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ResidentShell } from '@/components/design-export/ResidentShell';
import { Sheet, CloseButton } from '@/components/design-export/Sheet';
import { Toast, useToast } from '@/components/design-export/Toast';
import { COLORS, RADIUS, badgeStyle, tabStyle, chipStyle } from '@/lib/design-export/tokens';

type State = 'EN_ESPERA' | 'EN_PROGRESO' | 'TERMINADO';
type Pqrs = { id: string; numero: number; asunto?: string | null; descripcion: string; estado: State; fechaRecibido: string; updatedAt: string; fechaPrimerContacto?: string | null; gestionadoPorId?: string | null; numeroRadicacion?: string | null; historial?: { id: string; nota?: string | null; estadoDespues: State; creadoAt: string }[]; fotos?: { id: string; nombre: string; tipo: string }[] };
type Notice = { id: string; title: string; message: string; resourceType?: string | null; resourceId?: string | null; readAt?: string | null; createdAt: string };
type Me = { user?: { name?: string | null; email?: string | null; phone?: string | null; bloque?: number | null; apto?: number | null }; tenant?: { name?: string | null } };
type Photo = { data: string; nombre: string; tipo: string; preview: string };
const CATEGORIES = ['AREA COMUN','AREA PRIVADA','CONTABILIDAD','CONVIVENCIA'] as const;
const badgeOf = (s: State) => s === 'EN_ESPERA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : s === 'EN_PROGRESO' ? badgeStyle(COLORS.navySoft, COLORS.navy) : badgeStyle(COLORS.successSoft, COLORS.success);
const label = (s: State) => s === 'EN_ESPERA' ? 'Nueva' : s === 'EN_PROGRESO' ? 'En gestión' : 'Resuelta';
const code = (n: number) => 'PQ-' + String(n).padStart(4, '0');
const fmt = (v: string) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export default function VistaResidentePage() {
  const [data, setData] = useState<Pqrs[]>([]);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<'inicio' | 'mispqrs' | 'notif' | 'perfil'>('inicio');
  const [filter, setFilter] = useState('all'); const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Pqrs | null>(null); const [createOpen, setCreateOpen] = useState(false);
  const [description, setDescription] = useState(''); const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('AREA COMUN');
  const [location, setLocation] = useState(''); const [photos, setPhotos] = useState<Photo[]>([]);
  const [profileName, setProfileName] = useState(''); const [profilePhone, setProfilePhone] = useState('');
  const [editing, setEditing] = useState(false); const [editDescription, setEditDescription] = useState('');
  const fileRef = useRef<HTMLInputElement>(null); const { toast, showToast } = useToast();

  async function load() {
    const [p, n, m] = await Promise.all([fetch('/api/pqrs', { cache: 'no-store' }), fetch('/api/notifications', { cache: 'no-store' }), fetch('/api/me', { cache: 'no-store' })]);
    if (p.ok) setData(await p.json()); if (n.ok) setNotifications(await n.json());
    if (m.ok) { const value = await m.json(); setMe(value); setProfileName(value.user?.name || ''); setProfilePhone(value.user?.phone || ''); }
  }
  useEffect(() => { void load(); }, []);
  async function openDetail(id: string) { const res = await fetch('/api/pqrs/' + id, { cache: 'no-store' }); const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo abrir'); setSelected(body); setEditDescription(body.descripcion); }
  const taken = selected ? selected.estado !== 'EN_ESPERA' || !!selected.fechaPrimerContacto || !!selected.gestionadoPorId || !!selected.numeroRadicacion : false;
  const filtered = useMemo(() => data.filter((d) => (filter === 'all' || (filter === 'abiertas' && d.estado === 'EN_ESPERA') || (filter === 'gestion' && d.estado === 'EN_PROGRESO') || (filter === 'resuelta' && d.estado === 'TERMINADO')) && (!search || (d.numero + ' ' + (d.asunto || '') + ' ' + d.descripcion).toLowerCase().includes(search.toLowerCase()))), [data, filter, search]);
  const active = data.filter((d) => d.estado !== 'TERMINADO'); const name = me?.user?.name || 'Residente'; const initials = name.split(' ').map((p) => p[0]).slice(0,2).join('').toUpperCase();

  function selectPhotos(files: FileList | null) {
    Array.from(files || []).slice(0, 3 - photos.length).forEach((file) => {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 1024 * 1024) return showToast('Solo JPG, PNG o WEBP de máximo 1MB');
      const reader = new FileReader(); reader.onload = () => setPhotos((v) => [...v, { data: String(reader.result), nombre: file.name, tipo: file.type, preview: String(reader.result) }]); reader.readAsDataURL(file);
    });
  }
  async function create() {
    if (!location.trim() || !description.trim()) return;
    const res = await fetch('/api/pqrs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asunto: category, descripcion: description.trim() + '\n\nUbicación: ' + location.trim(), fotos: photos.map(({ data, nombre, tipo }) => ({ data, nombre, tipo })) }) });
    const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo enviar');
    setCreateOpen(false); setDescription(''); setLocation(''); setPhotos([]); await load(); showToast('Tu solicitud fue enviada');
  }
  async function saveEdit() {
    if (!selected) return; const res = await fetch('/api/pqrs/' + selected.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descripcion: editDescription }) });
    const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo editar');
    setSelected(body); setEditing(false); await load(); showToast('Solicitud actualizada');
  }
  async function markRead(notice: Notice) {
    if (!notice.readAt) await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notice.id }) });
    setNotifications((v) => v.map((n) => n.id === notice.id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n));
    if (notice.resourceType === 'Pqrs' && notice.resourceId) void openDetail(notice.resourceId);
  }
  async function markAll() { await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }); setNotifications((v) => v.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))); }
  async function saveProfile() { const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: profileName, phone: profilePhone }) }); const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo guardar'); await load(); showToast('Perfil actualizado'); }

  const bottomNav = [{ key: 'inicio', label: 'Inicio', icon: '⌂', onClick: () => setTab('inicio') }, { key: 'mispqrs', label: 'Mis PQRS', icon: '☰', onClick: () => setTab('mispqrs') }, { key: 'notif', label: 'Alertas', icon: '◔', onClick: () => setTab('notif') }, { key: 'perfil', label: 'Perfil', icon: '◐', onClick: () => setTab('perfil') }];
  return <ResidentShell activeKey={tab} initials={initials || 'RS'} greetingName={name} bottomNav={bottomNav}>
    {tab === 'inicio' && <div className="apl-up"><h1 style={h1}>Hola, {name.split(' ')[0]}</h1><p style={sub}>{active.length ? 'Tienes ' + active.length + ' solicitudes activas.' : 'No tienes solicitudes activas.'}</p><button onClick={() => setCreateOpen(true)} style={newButton}><span><b>Nueva solicitud</b><small>Cuéntanos qué está pasando</small></span><span>＋</span></button>{active.map((row) => <PqrsCard key={row.id} row={row} onClick={() => openDetail(row.id)} />)}</div>}
    {tab === 'mispqrs' && <div className="apl-up"><h1 style={h1}>Mis solicitudes</h1><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" style={inputStyle} /><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 20px' }}>{[['all','Todas'],['abiertas','Abiertas'],['gestion','En gestión'],['resuelta','Resueltas']].map(([k,l]) => <button key={k} onClick={() => setFilter(k)} style={{ border: 0, ...tabStyle(filter === k) }}>{l}</button>)}</div>{filtered.length === 0 ? <Empty /> : filtered.map((row) => <PqrsCard key={row.id} row={row} onClick={() => openDetail(row.id)} />)}</div>}
    {tab === 'notif' && <div className="apl-up"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h1 style={h1}>Notificaciones</h1><button onClick={markAll} style={linkButton}>Marcar todas</button></div>{notifications.length === 0 ? <Empty text="No tienes notificaciones." /> : notifications.map((n) => <button key={n.id} onClick={() => markRead(n)} style={{ width: '100%', border: 0, textAlign: 'left', display: 'flex', gap: 12, background: n.readAt ? '#FFF' : COLORS.bgCard, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: n.readAt ? COLORS.textMuted : COLORS.navy, marginTop: 6 }} /><span><b style={{ fontSize: 13.5 }}>{n.title}</b><span style={{ display: 'block', fontSize: 12.5, color: COLORS.textSecondary, marginTop: 3 }}>{n.message}</span><small style={{ color: COLORS.textMuted }}>{fmt(n.createdAt)}</small></span></button>)}</div>}
    {tab === 'perfil' && <div className="apl-up"><h1 style={h1}>Mi perfil</h1><div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}><Label>Nombre</Label><input value={profileName} onChange={(e) => setProfileName(e.target.value)} style={inputStyle} /><Label>Teléfono</Label><input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} style={inputStyle} /><Label>Correo</Label><input value={me?.user?.email || ''} disabled style={{ ...inputStyle, background: '#F0F0F0' }} /><Label>Ubicación</Label><input value={me?.user?.bloque && me?.user?.apto ? 'Bloque ' + me.user.bloque + ' · Apto ' + me.user.apto : 'Sin asignar'} disabled style={{ ...inputStyle, background: '#F0F0F0' }} /><button onClick={saveProfile} style={primary}>Guardar cambios</button><Link href="/cambiar-contrasena" style={{ display: 'block', textAlign: 'center', marginTop: 16, color: COLORS.navy, fontWeight: 700 }}>Cambiar contraseña</Link></div></div>}
    <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={520}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h2>Nueva solicitud</h2><CloseButton onClick={() => setCreateOpen(false)} /></div><Label>Categoría</Label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>{CATEGORIES.map((c) => <button key={c} onClick={() => setCategory(c)} style={{ border: 0, ...chipStyle(category === c) }}>{c.replace('AREA ', 'Área ')}</button>)}</div><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ubicación" style={inputStyle} /><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe la situación" rows={4} style={{ ...inputStyle, height: 'auto', paddingTop: 12, marginTop: 14 }} /><input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => selectPhotos(e.target.files)} /><button onClick={() => fileRef.current?.click()} style={secondary}>Adjuntar evidencias ({photos.length}/3)</button><button onClick={create} disabled={!location.trim() || !description.trim()} style={primary}>Enviar solicitud</button></Sheet>
    <Sheet open={!!selected} onClose={() => { setSelected(null); setEditing(false); }} maxWidth={560}>{selected && <><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontFamily: 'JetBrains Mono, monospace', color: COLORS.textMuted }}>{code(selected.numero)}</span><CloseButton onClick={() => setSelected(null)} /></div><h2>{selected.asunto || 'Solicitud'}</h2><span style={badgeOf(selected.estado)}>{label(selected.estado)}</span>{editing ? <><textarea rows={5} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} style={{ ...inputStyle, height: 'auto', paddingTop: 12, marginTop: 18 }} /><button onClick={saveEdit} style={primary}>Guardar edición</button></> : <p style={{ lineHeight: 1.6, color: COLORS.textSecondaryAlt, whiteSpace: 'pre-wrap' }}>{selected.descripcion}</p>}{!taken && !editing && <button onClick={() => setEditing(true)} style={secondary}>Editar solicitud</button>}{taken && <p style={{ fontSize: 12, color: COLORS.textMuted }}>La administración ya tomó esta solicitud; su contenido quedó bloqueado.</p>}{selected.fotos?.map((f) => <a key={f.id} href={'/api/pqrs/' + selected.id + '/fotos/' + f.id} target="_blank" style={{ display: 'block', color: COLORS.navy, fontWeight: 700, marginTop: 8 }}>Ver evidencia: {f.nombre}</a>)}<h3 style={{ marginTop: 24 }}>Historial</h3>{selected.historial?.map((h) => <div key={h.id} style={{ borderLeft: '2px solid ' + COLORS.navySoft, padding: '4px 0 12px 14px' }}><b style={{ fontSize: 12.5 }}>{label(h.estadoDespues)}</b><p style={{ margin: '3px 0', fontSize: 12.5, color: COLORS.textSecondary }}>{h.nota || 'Actualización registrada'}</p><small style={{ color: COLORS.textMuted }}>{fmt(h.creadoAt)}</small></div>)}</>}</Sheet>
    <Toast message={toast} bottom={78} />
  </ResidentShell>;
}
function PqrsCard({ row, onClick }: { row: Pqrs; onClick: () => void }) { return <button onClick={onClick} style={{ width: '100%', textAlign: 'left', border: '1px solid ' + COLORS.border, background: '#FFF', borderRadius: 16, padding: '16px 18px', cursor: 'pointer', marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b>{row.asunto || 'Solicitud'}</b><span style={badgeOf(row.estado)}>{label(row.estado)}</span></div><small style={{ color: COLORS.textMuted }}>{code(row.numero)} · {fmt(row.updatedAt)}</small></button>; }
function Empty({ text = 'No hay solicitudes con este filtro.' }: { text?: string }) { return <div style={{ textAlign: 'center', padding: 50, color: COLORS.textMuted }}>{text}</div>; }
function Label({ children }: { children: React.ReactNode }) { return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, margin: '14px 0 7px' }}>{children}</label>; }
const h1: React.CSSProperties = { fontSize: 26, fontWeight: 800, margin: '0 0 16px' }; const sub: React.CSSProperties = { color: COLORS.textSecondary, marginBottom: 24 };
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 12, fontSize: 14, fontFamily: 'inherit' };
const primary: React.CSSProperties = { width: '100%', border: 0, background: COLORS.navy, color: '#FFF', fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, marginTop: 18, cursor: 'pointer' };
const secondary: React.CSSProperties = { width: '100%', border: '1.5px solid ' + COLORS.inputBorder, background: '#FFF', color: COLORS.navy, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, marginTop: 14, cursor: 'pointer' };
const linkButton: React.CSSProperties = { border: 0, background: 'none', color: COLORS.navy, fontWeight: 700, cursor: 'pointer' };
const newButton: React.CSSProperties = { width: '100%', border: 0, background: COLORS.navy, color: '#FFF', borderRadius: 18, padding: '20px 22px', marginBottom: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 16 };
