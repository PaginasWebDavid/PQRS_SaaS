'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { Sheet, CloseButton } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle, chipStyle } from '@/lib/design/tokens';

type Status = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
type Role = 'ADMIN' | 'CONSEJO' | 'RESIDENTE';
type Invite = { id: string; email: string; role: Role; status: Status; createdAt: string; expiresAt: string; acceptedAt?: string | null };
type InvitationPagination = { page: number; pageSize: number; total: number; totalPages: number };
const STATUS_META: Record<Status, { label: string; style: React.CSSProperties }> = {
  PENDING: { label: 'Pendiente', style: badgeStyle(COLORS.warningSoft, COLORS.warning) },
  ACCEPTED: { label: 'Aceptada', style: badgeStyle(COLORS.successSoft, COLORS.success) },
  EXPIRED: { label: 'Expirada', style: badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt) },
  CANCELLED: { label: 'Cancelada', style: badgeStyle(COLORS.neutralSoft, COLORS.textMuted) },
};
const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', CONSEJO: 'Consejo', RESIDENTE: 'Residente' };
const SELECTABLE_ROLES: Role[] = ['ADMIN', 'CONSEJO', 'RESIDENTE'];
const FILTERS = [{ key: 'all', label: 'Todas' }, ...Object.entries(STATUS_META).map(([key, value]) => ({ key, label: value.label }))];

type BulkResult = { total: number; created: number; failed: { email: string; error?: string }[] };

export default function InvitacionesPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<InvitationPagination>({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [createOpen, setCreateOpen] = useState(false);
  const [createTab, setCreateTab] = useState<'single' | 'bulk'>('single');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('RESIDENTE');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkRole, setBulkRole] = useState<Role>('RESIDENTE');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (filter !== 'all') params.set('status', filter);
    if (searchQuery) params.set('search', searchQuery);
    const res = await fetch('/api/invitations?' + params.toString(), { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      setInvites(body?.data || []);
      if (body?.pagination) setPagination(body.pagination);
    } else showToast(body?.error || 'No se pudieron cargar las invitaciones');
    setLoading(false);
  }, [filter, page, searchQuery, showToast]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchQuery(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!email.trim()) return;
    const res = await fetch('/api/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return showToast(body?.error || 'No se pudo enviar la invitación');
    setCreateOpen(false); setEmail(''); await load();
    showToast(body?.email?.sent === false ? 'Invitación creada; el correo quedó pendiente' : 'Invitación enviada');
  }
  async function uploadBulk() {
    if (!bulkFile) return;
    setBulkLoading(true);
    setBulkResult(null);
    const formData = new FormData();
    formData.append('file', bulkFile);
    formData.append('role', bulkRole);
    try {
      const res = await fetch('/api/invitations/bulk', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      setBulkLoading(false);
      if (!res.ok) return showToast(body?.error || 'No se pudo procesar el archivo');
      setBulkResult(body);
      setBulkFile(null);
      await load();
    } catch {
      setBulkLoading(false);
      showToast('No se pudo procesar el archivo');
    }
  }
  function closeCreate() {
    setCreateOpen(false);
    setCreateTab('single');
    setBulkFile(null);
    setBulkResult(null);
  }
  async function action(invite: Invite, actionName: 'resend' | 'cancel') {
    setWorkingId(invite.id);
    const res = await fetch('/api/invitations/' + invite.id + '/' + actionName, { method: 'POST' });
    const body = await res.json().catch(() => null);
    setWorkingId('');
    if (!res.ok) return showToast(body?.error || 'No se pudo completar la acción');
    await load(); showToast(actionName === 'resend' ? 'Invitación reenviada' : 'Invitación cancelada');
  }

  const filtered = invites;
  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="invitaciones" userName="Admin" userRole="Administración" initials="AD" mobileTitle="Invitaciones">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <div><h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 3px' }}>Invitaciones</h1><p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>Invita nuevos usuarios a tu conjunto</p></div>
        <button onClick={() => setCreateOpen(true)} style={{ border: 0, background: COLORS.navy, color: '#FFF', fontSize: 13, fontWeight: 700, padding: '11px 20px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>+ Nueva invitación</button>
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por correo" style={{ width: '100%', maxWidth: 360, height: 42, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>{FILTERS.map((f) => <button key={f.key} onClick={() => { setFilter(f.key); setPage(1); }} style={{ border: 0, ...tabStyle(filter === f.key) }}>{f.label}</button>)}</div>
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
        {pagination.totalPages > 1 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} style={{ border: 0, background: 'none', color: page <= 1 ? COLORS.textMuted : COLORS.navy, font: 'inherit', fontSize: 12, fontWeight: 700 }}>Anterior</button>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: COLORS.textMuted }}>Pagina {pagination.page} de {pagination.totalPages}</span>
          <button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} style={{ border: 0, background: 'none', color: page >= pagination.totalPages ? COLORS.textMuted : COLORS.navy, font: 'inherit', fontSize: 12, fontWeight: 700 }}>Siguiente</button>
        </div>}
      </div>
      <Sheet open={createOpen} onClose={closeCreate} maxWidth={440}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Nueva invitación</h2><CloseButton onClick={closeCreate} /></div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 18px' }}>Se enviará un correo con el enlace de activación a cada persona invitada.</p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <button onClick={() => setCreateTab('single')} style={{ border: 0, flex: 1, ...tabStyle(createTab === 'single') }}>Uno por uno</button>
          <button onClick={() => setCreateTab('bulk')} style={{ border: 0, flex: 1, ...tabStyle(createTab === 'bulk') }}>Subir Excel</button>
        </div>

        {createTab === 'single' && (
          <>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Correo electrónico</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 11, marginBottom: 16 }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Rol</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>{SELECTABLE_ROLES.map((r) => <button key={r} onClick={() => setRole(r)} style={{ border: 0, ...chipStyle(role === r) }}>{ROLE_LABEL[r]}</button>)}</div>
            <button onClick={create} disabled={!email.trim()} style={{ width: '100%', border: 0, background: email.trim() ? COLORS.navy : COLORS.neutralSoft, color: email.trim() ? '#FFF' : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill }}>Enviar invitación</button>
          </>
        )}

        {createTab === 'bulk' && (
          <>
            <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: '0 0 14px', lineHeight: 1.6 }}>
              Sube un archivo .xlsx con una sola columna de correos electrónicos (sin encabezado, o con un encabezado que no sea un correo — se ignora automáticamente). Se enviará una invitación a cada uno con el rol que elijas. Podrás ver quién ya ingresó y quién sigue pendiente en la lista.
            </p>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Archivo Excel (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => { setBulkFile(e.target.files?.[0] || null); setBulkResult(null); }}
              style={{ width: '100%', marginBottom: 16, fontSize: 12.5 }}
            />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Rol para todos los correos del archivo</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>{SELECTABLE_ROLES.map((r) => <button key={r} onClick={() => setBulkRole(r)} style={{ border: 0, ...chipStyle(bulkRole === r) }}>{ROLE_LABEL[r]}</button>)}</div>
            <button onClick={uploadBulk} disabled={!bulkFile || bulkLoading} style={{ width: '100%', border: 0, background: bulkFile && !bulkLoading ? COLORS.navy : COLORS.neutralSoft, color: bulkFile && !bulkLoading ? '#FFF' : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, marginBottom: 14 }}>{bulkLoading ? 'Enviando invitaciones…' : 'Subir y enviar invitaciones'}</button>
            {bulkResult && (
              <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 14, fontSize: 12.5 }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{bulkResult.created} de {bulkResult.total} invitaciones enviadas</div>
                {bulkResult.failed.length > 0 && (
                  <div style={{ color: COLORS.warning }}>
                    {bulkResult.failed.length} no se pudieron enviar:
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {bulkResult.failed.map((f) => <li key={f.email}>{f.email} — {f.error}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Sheet>
      <Toast message={toast} />
    </AdminShell>
  );
}
