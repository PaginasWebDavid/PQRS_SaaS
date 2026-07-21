'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ResidentShell } from '@/components/shell/ResidentShell';
import { Sheet, CloseButton, useIsMobile } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';

type State = 'EN_ESPERA' | 'EN_PROGRESO' | 'TERMINADO';
type Pqrs = {
  id: string; numero: number; titulo?: string | null; asunto?: string | null; descripcion: string; estado: State;
  fechaRecibido: string; updatedAt: string; fechaPrimerContacto?: string | null; fechaCierre?: string | null;
  gestionadoPorId?: string | null; responsable?: string | null; numeroRadicacion?: string | null; editadoPorResidente?: boolean; takenByAdministration?: boolean; accionTomada?: string | null; evidenciaCierre?: string | null; queSeHizoParaCerrar?: string | null; evidenciaArchivo?: { nombre: string; tipo: string | null; size: number | null } | null;
  historial?: { id: string; nota?: string | null; estadoDespues: State; creadoAt: string }[];
  fotos?: { id: string; nombre: string; tipo: string }[];
};
const CATEGORY_LABEL: Record<string, string> = {
  'AREA COMUN': 'Área común', 'AREA PRIVADA': 'Área privada', CONTABILIDAD: 'Contabilidad', CONVIVENCIA: 'Convivencia',
  'HUMEDAD/CUBIERTA': 'Humedad - Cubierta', 'HUMEDAD/DEPOSITO': 'Humedad - Depósito', 'HUMEDAD/VENTANAS': 'Humedad - Ventanas',
  'HUMEDAD/FACHADA': 'Humedad - Fachada', 'HUMEDAD/GARAJE': 'Humedad - Garaje',
};
type Notice = { id: string; title: string; message: string; resourceType?: string | null; resourceId?: string | null; readAt?: string | null; createdAt: string };
type Ticket = { id: string; subject: string; message: string; category: string; status: 'ABIERTA' | 'RESPONDIDA' | 'CERRADA'; response: string | null; createdAt: string };
const TICKET_STATUS_LABEL: Record<string, string> = { ABIERTA: 'Abierta', RESPONDIDA: 'Respondida', CERRADA: 'Cerrada' };
const PQRS_PAGE_SIZE = 20;
const ticketStatusBadge = (status: string) => status === 'ABIERTA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : status === 'RESPONDIDA' ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
type Me = { user?: { name?: string | null; email?: string | null; phone?: string | null; bloque?: number | null; apto?: number | null; bloqueAptoEditado?: boolean }; tenant?: { name?: string | null }; pqrsCloseSlaDays?: number };
type Photo = { data: string; nombre: string; tipo: string; preview: string };
type Step = { label: string; done: boolean; date?: string; hint?: string };

const badgeOf = (s: State) => s === 'EN_ESPERA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : s === 'EN_PROGRESO' ? badgeStyle(COLORS.navySoft, COLORS.navy) : badgeStyle(COLORS.successSoft, COLORS.success);
const label = (s: State) => s === 'EN_ESPERA' ? 'En espera' : s === 'EN_PROGRESO' ? 'En proceso' : 'Terminada';
const code = (n: number) => 'PQ-' + String(n).padStart(4, '0');
const fmt = (v: string) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

function buildTimeline(p: Pqrs, slaDays: number): Step[] {
  const resolved = p.estado === 'TERMINADO';
  const estimated = new Date(p.fechaRecibido);
  estimated.setDate(estimated.getDate() + slaDays);
  return [
    { label: 'Solicitud radicada', done: true, date: fmt(p.fechaRecibido) },
    {
      label: 'Primer contacto',
      done: !!p.fechaPrimerContacto,
      date: p.fechaPrimerContacto ? fmt(p.fechaPrimerContacto) : undefined,
      hint: !p.fechaPrimerContacto ? 'En espera de asignación' : undefined,
    },
    {
      label: 'Resuelta',
      done: resolved,
      date: resolved && p.fechaCierre ? fmt(p.fechaCierre) : undefined,
      hint: !resolved ? `Estimado antes del ${fmt(estimated.toISOString())}` : undefined,
    },
  ];
}

export default function VistaResidentePage() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<Pqrs[]>([]);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<'inicio' | 'notif' | 'perfil' | 'ayuda'>('inicio');
  const [filter, setFilter] = useState('all'); const [search, setSearch] = useState('');
  const [pqrsPage, setPqrsPage] = useState(1); const [pqrsTotal, setPqrsTotal] = useState(0);
  const [selected, setSelected] = useState<Pqrs | null>(null); const [createOpen, setCreateOpen] = useState(false);
  const [titulo, setTitulo] = useState(''); const [description, setDescription] = useState(''); const [category, setCategory] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]); const [creating, setCreating] = useState(false);
  const [profileName, setProfileName] = useState(''); const [profilePhone, setProfilePhone] = useState('');
  const [profileBloque, setProfileBloque] = useState(''); const [profileApto, setProfileApto] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [editing, setEditing] = useState(false); const [editDescription, setEditDescription] = useState('');
  const fileRef = useRef<HTMLInputElement>(null); const { toast, showToast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketSubject, setTicketSubject] = useState(''); const [ticketMessage, setTicketMessage] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false); const [ticketsError, setTicketsError] = useState('');
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState('');

  const loadPqrs = useCallback(async (targetPage: number, targetFilter: string, targetSearch: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PQRS_PAGE_SIZE) });
      const estado = targetFilter === 'abiertas' ? 'EN_ESPERA' : targetFilter === 'gestion' ? 'EN_PROGRESO' : targetFilter === 'resuelta' ? 'TERMINADO' : '';
      if (estado) params.set('estado', estado);
      if (targetSearch.trim()) params.set('search', targetSearch.trim());
      const res = await fetch('/api/pqrs?' + params.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('pqrs_load_failed');
      const body = await res.json();
      if (!body || !Array.isArray(body.data) || !body.pagination) throw new Error('invalid_pqrs_response');
      setData(body.data);
      setPqrsPage(body.pagination.page);
      setPqrsTotal(body.pagination.total);
    } finally {
      setLoading(false);
    }
  }, []);
  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const [, n, m] = await Promise.all([
        loadPqrs(1, filter, search),
        fetch('/api/notifications', { cache: 'no-store' }),
        fetch('/api/me', { cache: 'no-store' }),
      ]);
      if (!n.ok || !m.ok) throw new Error('load_failed');
      setNotifications(await n.json());
      const value = await m.json(); setMe(value); setProfileName(value.user?.name || ''); setProfilePhone(value.user?.phone || '');
      setProfileBloque(value.user?.bloque ? String(value.user?.bloque) : ''); setProfileApto(value.user?.apto ? String(value.user?.apto) : '');
    } catch {
      setLoadError('No pudimos cargar tus datos. Revisa tu conexion e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }
  // load intentionally runs once on mount; filter/search changes use the debounced paginated loader below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);
  const skipFilterLoad = useRef(true);
  useEffect(() => {
    if (skipFilterLoad.current) { skipFilterLoad.current = false; return; }
    const timer = window.setTimeout(() => {
      void loadPqrs(1, filter, search).catch(() => setLoadError('No pudimos cargar tus solicitudes. Revisa tu conexion e intenta de nuevo.'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filter, search, loadPqrs]);
  async function loadTickets() {
    setTicketsError('');
    try {
      const res = await fetch('/api/support-tickets', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body)) throw new Error('tickets_load_failed');
      setTickets(body);
    } catch {
      setTicketsError('No pudimos cargar tus solicitudes de ayuda. Revisa tu conexion e intenta de nuevo.');
    }
  }
  useEffect(() => { if (tab === 'ayuda') void loadTickets(); }, [tab]);
  async function submitTicket() {
    if (submittingTicket || !ticketSubject.trim() || !ticketMessage.trim()) return;
    setSubmittingTicket(true);
    try {
      const res = await fetch('/api/support-tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: ticketSubject.trim(), message: ticketMessage.trim(), category: 'OTRO' }) });
      const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo enviar la solicitud');
      setTicketSubject(''); setTicketMessage(''); await loadTickets(); showToast('Solicitud enviada ✓ Te avisaremos por correo cuando la respondamos.');
    } finally {
      setSubmittingTicket(false);
    }
  }
  async function openDetail(id: string) {
    try {
      const res = await fetch('/api/pqrs/' + id, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) return showToast(body?.error || 'No se pudo abrir');
      setSelected(body); setEditDescription(body.descripcion);
    } catch {
      showToast('No se pudo conectar para abrir la solicitud');
    }
  }
  const taken = selected ? selected.takenByAdministration ?? (selected.estado !== 'EN_ESPERA' || !!selected.fechaPrimerContacto || !!selected.gestionadoPorId || !!selected.numeroRadicacion) : false;
  const filtered = data;
  const active = data.filter((d) => d.estado !== 'TERMINADO'); const name = me?.user?.name || 'Residente'; const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const slaDays = me?.pqrsCloseSlaDays ?? 7;

  function selectPhotos(files: FileList | null) {
    Array.from(files || []).slice(0, 3 - photos.length).forEach((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) return showToast('Solo JPG, PNG o WEBP de máximo 1MB');
      const reader = new FileReader(); reader.onload = () => setPhotos((v) => [...v, { data: String(reader.result), nombre: file.name, tipo: file.type, preview: String(reader.result) }]); reader.readAsDataURL(file);
    });
  }
  async function create() {
    if (creating || !titulo.trim() || !category || !description.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/pqrs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: titulo.trim(), asunto: category, descripcion: description.trim(), fotos: photos.map(({ data, nombre, tipo }) => ({ data, nombre, tipo })) }) });
      const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo enviar');
      setCreateOpen(false); setTitulo(''); setCategory(''); setDescription(''); setPhotos([]); await load(); showToast('Tu solicitud fue enviada');
    } catch {
      showToast('No se pudo conectar para enviar la solicitud');
    } finally {
      setCreating(false);
    }
  }
  async function saveEdit() {
    if (!selected) return;
    try {
      const res = await fetch('/api/pqrs/' + selected.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ descripcion: editDescription }) });
      const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo editar');
      setSelected(body); setEditing(false); await load(); showToast('Solicitud actualizada');
    } catch {
      showToast('No se pudo conectar para editar la solicitud');
    }
  }
  async function markRead(notice: Notice) {
    if (!notice.readAt) {
      try {
        const res = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notice.id }) });
        const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo marcar la notificacion');
      } catch { return showToast('No se pudo conectar para marcar la notificacion'); }
    }
    setNotifications((v) => v.map((n) => n.id === notice.id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n));
    if (notice.resourceType === 'Pqrs' && notice.resourceId) void openDetail(notice.resourceId);
  }
  async function markAll() {
    try {
      const res = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
      const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudieron actualizar las notificaciones');
      setNotifications((v) => v.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    } catch { showToast('No se pudo conectar para actualizar las notificaciones'); }
  }
  const bloqueAptoLocked = Boolean(me?.user?.bloqueAptoEditado);
  async function saveProfile() {
    if (savingProfile) return;
    const bloque = Number(profileBloque); const apto = Number(profileApto);
    if (!Number.isInteger(bloque) || bloque < 1 || !Number.isInteger(apto) || apto < 1) return showToast('Bloque y apartamento deben ser números válidos');

    const bloqueAptoChanged = bloque !== (me?.user?.bloque ?? null) || apto !== (me?.user?.apto ?? null);
    if (bloqueAptoChanged) {
      if (bloqueAptoLocked) return showToast('Ya corregiste tu bloque y apartamento una vez; contacta a la administración para otro cambio');
      const confirmed = window.confirm(`Vas a cambiar tu ubicación a Bloque ${bloque}, Apto ${apto}. Solo puedes hacer esta corrección una vez — después no podrás editarla de nuevo. ¿Confirmas que es correcto?`);
      if (!confirmed) return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: profileName, phone: profilePhone, bloque, apto }) });
      const body = await res.json().catch(() => null); if (!res.ok) return showToast(body?.error || 'No se pudo guardar');
      await load(); showToast('Perfil actualizado');
    } finally {
      setSavingProfile(false);
    }
  }

  const bottomNav = [
    { key: 'inicio', label: 'Inicio', icon: '⌂', onClick: () => setTab('inicio') },
    { key: 'notif', label: 'Alertas', icon: '◔', onClick: () => setTab('notif') },
    { key: 'perfil', label: 'Perfil', icon: '◐', onClick: () => setTab('perfil') },
    { key: 'ayuda', label: 'Ayuda', icon: '?', onClick: () => setTab('ayuda') },
  ];

  return <ResidentShell activeKey={tab} initials={initials || 'RS'} greetingName={name} bottomNav={bottomNav}>
    {tab === 'inicio' && (
      <div className="apl-up">
        <h1 style={h1}>Hola, {name.split(' ')[0]}</h1>
        <p style={sub}>{active.length ? `Tienes ${active.length} solicitud${active.length === 1 ? '' : 'es'} activa${active.length === 1 ? '' : 's'}.` : 'No tienes solicitudes activas.'}</p>
        <button onClick={() => setCreateOpen(true)} style={newButton}><span><b>Nueva solicitud</b><small style={{ display: 'block', fontWeight: 500, color: COLORS.navyMuted, marginTop: 2 }}>Cuéntanos qué está pasando</small></span><span style={{ fontSize: 22 }}>＋</span></button>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en tus solicitudes" style={{ ...inputStyle, flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {[['all', 'Todas'], ['abiertas', 'En espera'], ['gestion', 'En proceso'], ['resuelta', 'Terminada']].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={{ border: 0, ...tabStyle(filter === k) }}>{l}</button>)}
        </div>
        {loading ? <Empty text={'Cargando tus solicitudes...'} /> : loadError ? <div style={{ textAlign: 'center', padding: '40px 20px', color: COLORS.danger, background: COLORS.dangerSoft, borderRadius: 16, fontSize: 13.5, fontWeight: 600 }}>{loadError}<button onClick={() => void load()} style={{ ...secondary, maxWidth: 220, margin: '16px auto 0' }}>Intentar de nuevo</button></div> : filtered.length === 0 ? <Empty text={data.length === 0 ? 'Aún no tienes solicitudes. Crea la primera con el botón de arriba.' : 'No hay solicitudes con este filtro.'} /> : filtered.map((row) => <PqrsCard key={row.id} row={row} onClick={() => openDetail(row.id)} />)}
        {!loading && !loadError && pqrsTotal > PQRS_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
            <button type='button' disabled={pqrsPage <= 1} onClick={() => void loadPqrs(pqrsPage - 1, filter, search)} style={{ ...secondary, width: 'auto', minWidth: 100, opacity: pqrsPage <= 1 ? 0.5 : 1 }}>Anterior</button>
            <span style={{ color: COLORS.textSecondary, fontSize: 12.5, fontWeight: 600 }}>Pagina {pqrsPage} de {Math.ceil(pqrsTotal / PQRS_PAGE_SIZE)}</span>
            <button type='button' disabled={pqrsPage >= Math.ceil(pqrsTotal / PQRS_PAGE_SIZE)} onClick={() => void loadPqrs(pqrsPage + 1, filter, search)} style={{ ...secondary, width: 'auto', minWidth: 100, opacity: pqrsPage >= Math.ceil(pqrsTotal / PQRS_PAGE_SIZE) ? 0.5 : 1 }}>Siguiente</button>
          </div>
        )}
      </div>
    )}

    {tab === 'notif' && (
      <div className="apl-up">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}><h1 style={{ ...h1, margin: 0 }}>Notificaciones</h1>{notifications.length > 0 && <button onClick={markAll} style={linkButton}>Marcar todas</button>}</div>
        {notifications.length === 0 ? <Empty text="No tienes notificaciones." /> : notifications.map((n) => <button key={n.id} onClick={() => markRead(n)} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, background: n.readAt ? '#FFF' : COLORS.bgCard, border: `1px solid ${n.readAt ? COLORS.border : 'transparent'}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', fontFamily: 'inherit' }}><span style={{ width: 8, height: 8, borderRadius: 999, background: n.readAt ? COLORS.textMuted : COLORS.navy, marginTop: 6, flexShrink: 0 }} /><span><b style={{ fontSize: 13.5 }}>{n.title}</b><span style={{ display: 'block', fontSize: 12.5, color: COLORS.textSecondary, marginTop: 3 }}>{n.message}</span><small style={{ color: COLORS.textMuted }}>{fmt(n.createdAt)}</small></span></button>)}
      </div>
    )}

    {tab === 'perfil' && (
      <div className="apl-up">
        <h1 style={h1}>Mi perfil</h1>
        <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
          <Label>Nombre</Label>
          <input value={profileName} onChange={(e) => setProfileName(e.target.value)} style={inputStyle} />
          <Label>Teléfono</Label>
          <input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} style={inputStyle} />
          <Label>Correo</Label>
          <input value={me?.user?.email || ''} disabled style={{ ...inputStyle, background: '#F0F0F0', color: COLORS.textMuted }} />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Bloque</Label>
              <input inputMode="numeric" value={profileBloque} disabled={bloqueAptoLocked} onChange={(e) => setProfileBloque(e.target.value.replace(/\D/g, '').slice(0, 3))} style={bloqueAptoLocked ? { ...inputStyle, background: '#F0F0F0', color: COLORS.textMuted } : inputStyle} />
            </div>
            <div>
              <Label>Apartamento</Label>
              <input inputMode="numeric" value={profileApto} disabled={bloqueAptoLocked} onChange={(e) => setProfileApto(e.target.value.replace(/\D/g, '').slice(0, 6))} style={bloqueAptoLocked ? { ...inputStyle, background: '#F0F0F0', color: COLORS.textMuted } : inputStyle} />
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, margin: '8px 0 0' }}>
            {bloqueAptoLocked ? 'Ya corregiste tu bloque y apartamento una vez. Si necesitas otro cambio, contacta a la administración.' : 'Puedes corregir tu bloque y apartamento una sola vez si los pusiste mal en el registro.'}
          </p>
          <button onClick={saveProfile} disabled={savingProfile} style={primary}>{savingProfile ? 'Guardando…' : 'Guardar cambios'}</button>
          <Link href="/cambiar-contrasena" style={{ display: 'block', textAlign: 'center', marginTop: 16, color: COLORS.navy, fontWeight: 700 }}>Cambiar contraseña</Link>
        </div>
      </div>
    )}

    {tab === 'ayuda' && (
      <div className="apl-up">
        <h1 style={h1}>Ayuda</h1>
        <p style={sub}>¿Tienes un problema con la plataforma? Escríbenos y te responderemos por aquí y por correo.</p>
        <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22, marginBottom: 20 }}>
          <Label>Asunto</Label>
          <input value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder="Ej. No puedo subir fotos a mi solicitud" style={inputStyle} />
          <Label>Mensaje</Label>
          <textarea value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} rows={4} placeholder="Cuéntanos qué necesitas" style={{ ...inputStyle, height: 'auto', paddingTop: 12 }} />
          <button onClick={submitTicket} disabled={submittingTicket || !ticketSubject.trim() || !ticketMessage.trim()} style={primary}>{submittingTicket ? 'Enviando…' : 'Enviar solicitud'}</button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Mis solicitudes</div>
        {ticketsError ? <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 600 }}>{ticketsError}<button type='button' onClick={() => void loadTickets()} style={{ ...secondary, width: 'auto', marginTop: 10 }}>Intentar de nuevo</button></div> : tickets.length === 0 ? <Empty text='Aun no has enviado ninguna solicitud.' /> : tickets.map((t) => (
          <div key={t.id} style={{ background: '#FFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <b style={{ fontSize: 13.5 }}>{t.subject}</b>
              <span style={ticketStatusBadge(t.status)}>{TICKET_STATUS_LABEL[t.status]}</span>
            </div>
            <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: '0 0 8px', lineHeight: 1.5 }}>{t.message}</p>
            {t.response && (
              <div style={{ background: COLORS.successSoft, borderRadius: 10, padding: '10px 12px', fontSize: 12, lineHeight: 1.5 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.success, marginBottom: 4 }}>Respuesta de PQRS Services</div>
                {t.response}
              </div>
            )}
          </div>
        ))}
      </div>
    )}

    <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={520}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Nueva solicitud</h2><CloseButton onClick={() => setCreateOpen(false)} /></div>
      <Label>Título</Label>
      <input value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 80))} placeholder="Ej. Goteras en el techo del pasillo" style={inputStyle} />
      <Label>Categoria</Label>
      <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
        <option value="">Selecciona una categoria</option>
        {Object.entries(CATEGORY_LABEL).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
      <Label>Descripción</Label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe la situación, incluyendo la ubicación exacta si ayuda" rows={5} style={{ ...inputStyle, height: 'auto', paddingTop: 12 }} />
      <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => selectPhotos(e.target.files)} />
      <button onClick={() => fileRef.current?.click()} style={secondary}>Adjuntar evidencias ({photos.length}/3)</button>
      <button onClick={create} disabled={creating || !titulo.trim() || !category || !description.trim()} style={primary}>{creating ? 'Enviando…' : 'Enviar solicitud'}</button>
    </Sheet>

    <Sheet open={!!selected} onClose={() => { setSelected(null); setEditing(false); }} maxWidth={560}>
      {selected && <>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontFamily: 'JetBrains Mono, monospace', color: COLORS.textMuted, fontSize: 12.5 }}>{code(selected.numero)}</span><CloseButton onClick={() => setSelected(null)} /></div>
        <h2 style={{ margin: '4px 0 8px', fontSize: 19, fontWeight: 800 }}>{selected.titulo || 'Solicitud'}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={badgeOf(selected.estado)}>{label(selected.estado)}</span>
          {selected.asunto && <span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>{CATEGORY_LABEL[selected.asunto] || selected.asunto}</span>}
        </div>

        <Timeline steps={buildTimeline(selected, slaDays)} />

        {editing ? <><textarea rows={5} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} style={{ ...inputStyle, height: 'auto', paddingTop: 12, marginTop: 18 }} /><button onClick={saveEdit} style={primary}>Guardar edición</button></> : <p style={{ lineHeight: 1.6, color: COLORS.textSecondaryAlt, whiteSpace: 'pre-wrap', marginTop: 18 }}>{selected.descripcion}</p>}
        {!taken && !selected.editadoPorResidente && !editing && <button onClick={() => setEditing(true)} style={secondary}>Editar solicitud</button>}
        {taken && <p style={{ fontSize: 12, color: COLORS.textMuted }}>La administración ya tomó esta solicitud; su contenido quedó bloqueado.</p>}
        {!taken && selected.editadoPorResidente && !editing && <p style={{ fontSize: 12, color: COLORS.textMuted }}>Ya editaste esta solicitud una vez; no puede editarse de nuevo.</p>}
        {selected.responsable && <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: '18px 0 0' }}>Responsable: <b>{selected.responsable}</b></p>}
        {(selected.accionTomada || selected.evidenciaCierre || selected.queSeHizoParaCerrar) && <div style={{ background: COLORS.successSoft, borderRadius: 14, padding: '14px 16px', marginTop: 16 }}>
          <b style={{ fontSize: 13.5, color: COLORS.success }}>Respuesta de la administracion</b>
          {selected.accionTomada && <p style={{ margin: '8px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{selected.accionTomada}</p>}
          {selected.queSeHizoParaCerrar && <p style={{ margin: '8px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{selected.queSeHizoParaCerrar}</p>}
          {selected.evidenciaCierre && <p style={{ margin: '8px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{selected.evidenciaCierre}</p>}
          {selected.evidenciaArchivo && <a href={'/api/pqrs/' + selected.id + '/evidencia'} target="_blank" style={{ display: 'block', color: COLORS.navy, fontWeight: 700, marginTop: 8 }}>Ver archivo de cierre: {selected.evidenciaArchivo.nombre}</a>}
        </div>}
        {selected.fotos?.map((f) => <a key={f.id} href={'/api/pqrs/' + selected.id + '/fotos/' + f.id} target="_blank" style={{ display: 'block', color: COLORS.navy, fontWeight: 700, marginTop: 8 }}>Ver evidencia: {f.nombre}</a>)}
        <h3 style={{ marginTop: 24, fontSize: 14 }}>Historial</h3>
        {selected.historial?.map((h) => <div key={h.id} style={{ borderLeft: '2px solid ' + COLORS.navySoft, padding: '4px 0 12px 14px' }}><b style={{ fontSize: 12.5 }}>{label(h.estadoDespues)}</b><p style={{ margin: '3px 0', fontSize: 12.5, color: COLORS.textSecondary }}>{h.nota || 'Actualización registrada'}</p><small style={{ color: COLORS.textMuted }}>{fmt(h.creadoAt)}</small></div>)}
      </>}
    </Sheet>
    <Toast message={toast} bottom={78} />
  </ResidentShell>;
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <div style={{ background: COLORS.bgCard, borderRadius: 16, padding: '16px 18px', margin: '18px 0 4px' }}>
      {steps.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, background: s.done ? COLORS.success : '#FFFFFF', border: s.done ? 'none' : `1.5px solid ${COLORS.inputBorder}`, color: s.done ? '#FFFFFF' : COLORS.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{s.done ? '✓' : i + 1}</div>
            {i < steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 26, background: s.done ? COLORS.success : COLORS.borderSoft, margin: '2px 0' }} />}
          </div>
          <div style={{ paddingBottom: i < steps.length - 1 ? 16 : 2 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{s.label}</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{s.date || s.hint}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
function PqrsCard({ row, onClick }: { row: Pqrs; onClick: () => void }) {
  const titulo = row.titulo || row.descripcion.slice(0, 60) || 'Solicitud';
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', border: '1px solid ' + COLORS.border, background: '#FFF', borderRadius: 16, padding: '16px 18px', cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <b style={{ fontSize: 14 }}>{titulo}</b>
        <span style={{ ...badgeOf(row.estado), flexShrink: 0 }}>{label(row.estado)}</span>
      </div>
      <small style={{ color: COLORS.textMuted }}>
        {row.numeroRadicacion ? `N.° ${row.numeroRadicacion}` : 'Sin radicar aún'}
        {row.asunto ? ` · ${CATEGORY_LABEL[row.asunto] || row.asunto}` : ''} · {fmt(row.updatedAt)}
      </small>
    </button>
  );
}
function Empty({ text = 'No hay solicitudes con este filtro.' }: { text?: string }) { return <div style={{ textAlign: 'center', padding: '50px 20px', color: COLORS.textMuted, background: COLORS.bgCard, borderRadius: 16, fontSize: 13.5, fontWeight: 500 }}>{text}</div>; }
function Label({ children }: { children: React.ReactNode }) { return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, margin: '14px 0 7px' }}>{children}</label>; }
const h1: React.CSSProperties = { fontSize: 26, fontWeight: 800, margin: '0 0 6px' };
const sub: React.CSSProperties = { color: COLORS.textSecondary, marginBottom: 24, fontSize: 14 };
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 12, fontSize: 14, fontFamily: 'inherit' };
const primary: React.CSSProperties = { width: '100%', border: 0, background: COLORS.navy, color: '#FFF', fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, marginTop: 18, cursor: 'pointer', fontFamily: 'inherit' };
const secondary: React.CSSProperties = { width: '100%', border: '1.5px solid ' + COLORS.inputBorder, background: '#FFF', color: COLORS.navy, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, marginTop: 14, cursor: 'pointer', fontFamily: 'inherit' };
const linkButton: React.CSSProperties = { border: 0, background: 'none', color: COLORS.navy, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const newButton: React.CSSProperties = { width: '100%', border: 0, background: COLORS.navy, color: '#FFF', borderRadius: 18, padding: '20px 22px', marginBottom: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 16, fontFamily: 'inherit' };
