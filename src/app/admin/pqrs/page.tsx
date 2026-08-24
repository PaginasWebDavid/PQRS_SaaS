'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminShell } from '@/components/shell/AdminShell';
import { Sheet, CloseButton, useIsMobile } from '@/components/shell/Sheet';
import { DetailPanel } from '@/components/shell/DetailPanel';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';
import { pqrsPhaseDisplayLabel } from '@/lib/design/pqrsWorkflow';

type Estado = 'EN_ESPERA' | 'EN_PROGRESO' | 'TERMINADO';
type FaseTipo = 'INSUMOS' | 'PROVEEDOR';
type Pqrs = {
  id: string; numero: number; titulo?: string | null; asunto?: string | null; categoryId?: string | null; categorySnapshot?: string | null; descripcion: string; nombreResidente: string;
  bloque: number; apto: number; estado: Estado; fechaRecibido: string; numeroRadicacion?: string | null;
  notaPrimerContacto?: string | null;
  workflowType?: 'SIMPLE' | 'MAINTENANCE';
  faseActual?: number | null; faseTipo?: FaseTipo | null;
  fase1Nota?: string | null; fase2Nota?: string | null; fase3Nota?: string | null; fase4Nota?: string | null;
  fase1Inicio?: string | null; fase2Inicio?: string | null; fase3Inicio?: string | null; fase4Inicio?: string | null; fase5Inicio?: string | null;
  accionTomada?: string | null; evidenciaCierre?: string | null; queSeHizoParaCerrar?: string | null;
  evidenciaArchivoNombre?: string | null; evidenciaArchivoRetiradaAt?: string | null;
  fotos?: { id: string; nombre: string; tipo: string; size?: number | null; orden: number }[];
  editadoPorResidente?: boolean;
  creadoPor?: { name?: string | null } | null;
};
type PqrsPagination = { page: number; pageSize: number; total: number; totalPages: number };
type PqrsCategory = { id: string; displayName: string; workflowType: 'SIMPLE' | 'MAINTENANCE'; sortOrder: number };

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'EN_ESPERA', label: 'En espera' },
  { key: 'EN_PROGRESO', label: 'En proceso' },
  { key: 'TERMINADO', label: 'Terminada' },
];
const STAGE_LABELS = ['En espera', 'En proceso', 'Terminada'];

const ASUNTOS: { value: string; label: string }[] = [
  { value: 'AREA COMUN', label: 'Área común' },
  { value: 'AREA PRIVADA', label: 'Área privada' },
  { value: 'CONTABILIDAD', label: 'Contabilidad' },
  { value: 'CONVIVENCIA', label: 'Convivencia' },
  { value: 'HUMEDAD/CUBIERTA', label: 'Humedad - Cubierta' },
  { value: 'HUMEDAD/DEPOSITO', label: 'Humedad - Depósito' },
  { value: 'HUMEDAD/VENTANAS', label: 'Humedad - Ventanas' },
  { value: 'HUMEDAD/FACHADA', label: 'Humedad - Fachada' },
  { value: 'HUMEDAD/GARAJE', label: 'Humedad - Garaje' },
];
const ASUNTO_LABEL: Record<string, string> = Object.fromEntries(ASUNTOS.map((a) => [a.value, a.label]));

const FASE_TARGET_DAYS: Record<number, number> = { 1: 2, 2: 2, 3: 15, 4: 5, 5: 0 };
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

function stageIndex(estado: Estado) { return estado === 'EN_ESPERA' ? 0 : estado === 'EN_PROGRESO' ? 1 : 2; }
function badge(status: Estado) { return status === 'EN_ESPERA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : status === 'EN_PROGRESO' ? badgeStyle(COLORS.navySoft, COLORS.navy) : badgeStyle(COLORS.successSoft, COLORS.success); }
function label(status: Estado) { return status === 'EN_ESPERA' ? 'En espera' : status === 'EN_PROGRESO' ? 'En proceso' : 'Terminada'; }
function code(n: number) { return `PQ-${String(n).padStart(4, '0')}`; }
function date(v: string) { return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }); }
function categoryLabel(p: Pqrs) { return p.categorySnapshot || (p.asunto ? (ASUNTO_LABEL[p.asunto] || p.asunto) : 'Sin categoría'); }

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function businessDaysBetween(start: Date, end: Date) {
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cursor < endDay) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function faseSemaphore(faseNum: number, inicioIso?: string | null) {
  if (!inicioIso) return null;
  const target = FASE_TARGET_DAYS[faseNum];
  if (!target) return null;
  const elapsed = businessDaysBetween(new Date(inicioIso), new Date());
  const pct = elapsed / target;
  const color = pct <= 0.5 ? COLORS.success : pct <= 1 ? COLORS.warning : COLORS.danger;
  return { color, elapsed, target };
}

function ModuloPqrsPageContent() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Pqrs[]>([]);
  const [categories, setCategories] = useState<PqrsCategory[]>([]);
  const [pagination, setPagination] = useState<PqrsPagination>({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const initialEstado = searchParams.get('estado');
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === initialEstado) ? initialEstado! : 'all');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [detail, setDetail] = useState<Pqrs | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitulo, setNewTitulo] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newResident, setNewResident] = useState('');
  const [newBloque, setNewBloque] = useState('');
  const [newApto, setNewApto] = useState('');

  const [contactOpen, setContactOpen] = useState(false);
  const [contactNota, setContactNota] = useState('');
  const [contactPrioridad, setContactPrioridad] = useState<'ALTA' | 'MEDIA' | 'BAJA'>('MEDIA');
  const [contactCategoryId, setContactCategoryId] = useState('');
  const [contactDone, setContactDone] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);

  const [faseOpen, setFaseOpen] = useState(false);
  const [faseNotaDraft, setFaseNotaDraft] = useState('');
  const [faseSubmitting, setFaseSubmitting] = useState(false);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closeAccion, setCloseAccion] = useState('');
  const [closeQueSeHizo, setCloseQueSeHizo] = useState('');
  const [closeEvidenciaTexto, setCloseEvidenciaTexto] = useState('');
  const [closeFile, setCloseFile] = useState<File | null>(null);
  const [closeFileError, setCloseFileError] = useState('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionCategoryId, setCorrectionCategoryId] = useState('');
  const [correctionBloque, setCorrectionBloque] = useState('');
  const [correctionApto, setCorrectionApto] = useState('');
  const [correctionWorkflow, setCorrectionWorkflow] = useState<'SIMPLE' | 'MAINTENANCE'>('SIMPLE');
  const [correctionPhase, setCorrectionPhase] = useState('');
  const [correctionRoute, setCorrectionRoute] = useState('');
  const [correctionReopen, setCorrectionReopen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<{ kind: 'file' | 'photo'; photoId?: string } | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (filter !== 'all') params.set('estado', filter);
    if (searchQuery) params.set('search', searchQuery);
    try {
      const res = await fetch('/api/pqrs?' + params.toString(), { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(body?.error || 'No se pudieron cargar las PQRS');
        return;
      }
      setData(Array.isArray(body) ? body : body?.data || []);
      if (body?.pagination) setPagination(body.pagination);
    } catch {
      showToast('No se pudieron cargar las PQRS. Revise su conexión.');
    } finally {
      setLoading(false);
    }
  }, [filter, page, searchQuery, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearchQuery(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/pqrs/categories', { cache: 'no-store' })
      .then(async (res) => { const body = await res.json().catch(() => null); if (!res.ok || !Array.isArray(body)) throw new Error(); setCategories(body); })
      .catch(() => showToast('No se pudieron cargar las categorías disponibles'));
  }, [showToast]);

  useEffect(() => {
    if (!selectedId || detail?.id === selectedId) return;
    fetch('/api/pqrs/' + selectedId, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (body) setDetail(body); })
      .catch(() => showToast('No se pudo cargar el detalle de la PQRS'));
  }, [detail?.id, selectedId, showToast]);


  const selected = detail?.id === selectedId ? detail : data.find((p) => p.id === selectedId) ?? data[0];

  async function submitCreate() {
    if (!newTitulo.trim() || !newSubject || !newDescription.trim() || !newResident.trim() || !newBloque || !newApto) return;
    const res = await fetch('/api/pqrs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: newTitulo.trim(), categoryId: newSubject, descripcion: newDescription, nombreResidente: newResident, bloque: newBloque, apto: newApto }) });
    if (!res.ok) { const err = await res.json().catch(() => null); showToast(err?.error || 'No se pudo crear la PQRS'); return; }
    const created = await res.json(); setCreateOpen(false); setNewTitulo(''); setNewSubject(''); setNewDescription(''); setNewResident(''); setNewBloque(''); setNewApto(''); setDetail(created); await load(); setSelectedId(created.id); showToast('PQRS creada ✓');
  }

  function openContact() {
    if (!selected) return;
    setContactNota('');
    setContactPrioridad('MEDIA');
    setContactCategoryId(selected.categoryId || '');
    setContactDone(false);
    setContactOpen(true);
  }

  // La categoria elegida decide sola la ruta: no se le pregunta al admin dos
  // veces. Mantenimiento y Zonas comunes van por las 5 fases; el resto es
  // ruta simple.
  const contactCategory = categories.find((c) => c.id === contactCategoryId) || null;
  const contactWorkflow = contactCategory?.workflowType || selected?.workflowType || 'SIMPLE';
  const contactReady = Boolean(contactCategoryId) && contactNota.trim().length > 0;

  async function submitContact() {
    if (!selected || !contactReady) return;
    setContactSubmitting(true);
    try {
      // La categoria se asigna en el mismo paso que el primer contacto: el
      // residente nunca la eligio, asi que esto no es una correccion.
      const res = await fetch(`/api/pqrs/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primerContacto: true, categoryId: contactCategoryId, notaPrimerContacto: contactNota.trim(), prioridad: contactPrioridad }),
      });
      if (!res.ok) { const err = await res.json().catch(() => null); showToast(err?.error || 'No se pudo abrir el caso'); return; }
      // No se cierra en seco: se queda mostrando que cambio y cual es el paso
      // siguiente, para no dejar al admin buscando la solicitud otra vez.
      await refreshSelected(selected.id);
      setContactDone(true);
    } finally { setContactSubmitting(false); }
  }

  const faseActual = selected?.faseActual || 0;
  const faseTipo = selected?.faseTipo || null;
  const isSimpleWorkflow = selected?.workflowType === 'SIMPLE';
  const activeFaseNota = faseActual >= 1 && faseActual <= 4 ? (selected?.[`fase${faseActual}Nota` as keyof Pqrs] as string | null | undefined) : null;
  const activeFaseInicio = faseActual >= 1 && faseActual <= 4 ? (selected?.[`fase${faseActual}Inicio` as keyof Pqrs] as string | null | undefined) : null;
  const activeSemaphore = faseActual >= 1 && faseActual <= 4 ? faseSemaphore(faseActual, activeFaseInicio) : null;

  function openFase() {
    if (!selected) return;
    setFaseNotaDraft(activeFaseNota || '');
    setFaseOpen(true);
  }

  async function submitFaseAction(payload: { faseActual: number; faseTipo?: FaseTipo; noteFase?: number; note?: string }) {
    if (!selected) return;
    setFaseSubmitting(true);
    try {
      const body: Record<string, unknown> = { actualizarFase: true, faseActual: payload.faseActual };
      if (payload.faseTipo) body.faseTipo = payload.faseTipo;
      if (payload.noteFase && payload.note !== undefined) body[`fase${payload.noteFase}Nota`] = payload.note;
      const res = await fetch(`/api/pqrs/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json().catch(() => null); showToast(err?.error || 'No se pudo actualizar la fase'); return; }
      await refreshSelected(selected.id); showToast('Fase actualizada ✓');
    } finally { setFaseSubmitting(false); }
  }

  function openClose() {
    if (!selected) return;
    setCloseAccion(selected.accionTomada || '');
    setCloseQueSeHizo(selected.queSeHizoParaCerrar || '');
    setCloseEvidenciaTexto(selected.evidenciaCierre || '');
    setCloseFile(null);
    setCloseFileError('');
    setCloseOpen(true);
  }

  function handleCloseFileChange(file: File | null) {
    if (file && file.size > MAX_EVIDENCE_BYTES) {
      setCloseFileError('El archivo supera el máximo de 2MB.');
      setCloseFile(null);
      return;
    }
    setCloseFileError('');
    setCloseFile(file);
  }

  // Solo se pregunta "que se hizo para cerrar" donde hay fases que saltarse.
  // En el flujo SIMPLE cerrar desde la fase 1 es el camino normal, no una
  // excepcion que haya que justificar. Debe coincidir con la regla del API.
  const closeNeedsQueSeHizo = selected
    ? selected.workflowType === 'MAINTENANCE' && selected.faseActual !== 5
    : false;
  const closeHasExistingEvidence = !!(selected?.evidenciaCierre || (selected?.evidenciaArchivoNombre && !selected.evidenciaArchivoRetiradaAt));
  const closeCanSubmit = !!closeAccion.trim() && (!closeNeedsQueSeHizo || !!closeQueSeHizo.trim()) && (!!closeEvidenciaTexto.trim() || !!closeFile || closeHasExistingEvidence) && !closeFileError;

  async function submitClose() {
    if (!selected || !closeCanSubmit) return;
    setCloseSubmitting(true);
    try {
      const body: Record<string, unknown> = { terminar: true, accionTomada: closeAccion.trim() };
      if (closeNeedsQueSeHizo) body.queSeHizoParaCerrar = closeQueSeHizo.trim();
      if (closeEvidenciaTexto.trim()) body.evidenciaCierre = closeEvidenciaTexto.trim();
      if (closeFile) {
        body.evidenciaArchivoData = await fileToDataUrl(closeFile);
        body.evidenciaArchivoNombre = closeFile.name;
      }
      const res = await fetch(`/api/pqrs/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json().catch(() => null); showToast(err?.error || 'No se pudo cerrar la PQRS'); return; }
      await refreshSelected(selected.id); setCloseOpen(false); showToast('PQRS cerrada ✓ Correo de cierre enviado al residente.');
    } finally { setCloseSubmitting(false); }
  }

  async function refreshSelected(id: string) {
    const res = await fetch(`/api/pqrs/${id}`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || 'No se pudo actualizar el detalle');
    setDetail(body);
    await load();
  }

  function openCorrection() {
    if (!selected) return;
    setCorrectionCategoryId(selected.categoryId || '');
    setCorrectionBloque(String(selected.bloque));
    setCorrectionApto(String(selected.apto));
    setCorrectionWorkflow(selected.workflowType || 'SIMPLE');
    setCorrectionPhase(selected.faseActual ? String(selected.faseActual) : '');
    setCorrectionRoute(selected.faseTipo || '');
    setCorrectionReopen(false);
    setCorrectionReason('');
    setCorrectionOpen(true);
  }

  async function submitCorrection() {
    if (!selected || correctionReason.trim().length < 10 || correctionSubmitting) return;
    const body: Record<string, unknown> = {
      operationId: crypto.randomUUID(),
      reason: correctionReason.trim(),
    };
    if (correctionCategoryId && correctionCategoryId !== selected.categoryId) body.categoryId = correctionCategoryId;
    if (Number(correctionBloque) !== selected.bloque) body.bloque = Number(correctionBloque);
    if (Number(correctionApto) !== selected.apto) body.apto = Number(correctionApto);
    if (correctionWorkflow !== selected.workflowType) body.workflowType = correctionWorkflow;
    const nextPhase = correctionPhase ? Number(correctionPhase) : null;
    if (nextPhase !== (selected.faseActual ?? null)) body.faseActual = nextPhase;
    const nextRoute = correctionWorkflow === 'MAINTENANCE' && correctionRoute ? correctionRoute : null;
    if (nextRoute !== (selected.faseTipo ?? null)) body.faseTipo = nextRoute;
    if (correctionReopen) body.reopen = true;
    setCorrectionSubmitting(true);
    try {
      const res = await fetch(`/api/pqrs/${selected.id}/corregir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const response = await res.json().catch(() => null);
      if (!res.ok) { showToast(response?.error || 'No se pudo corregir el caso'); return; }
      setCorrectionOpen(false);
      await refreshSelected(selected.id);
      showToast('Corrección registrada con auditoría');
    } catch {
      showToast('No se pudo conectar para corregir el caso');
    } finally { setCorrectionSubmitting(false); }
  }

  function openWithdraw(kind: 'file' | 'photo', photoId?: string) {
    setWithdrawTarget({ kind, photoId });
    setWithdrawReason('');
  }

  async function submitWithdraw() {
    if (!selected || !withdrawTarget) return;
    const reason = withdrawReason.trim();
    if (reason.length < 10) return;
    setWithdrawSubmitting(true);
    try {
      const url = withdrawTarget.kind === 'file'
        ? `/api/pqrs/${selected.id}/evidencia`
        : `/api/pqrs/${selected.id}/fotos/${withdrawTarget.photoId}`;
      const res = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) { showToast(body?.error || 'No se pudo retirar la evidencia'); return; }
      setWithdrawTarget(null);
      await refreshSelected(selected.id);
      showToast('Evidencia retirada y auditada');
    } finally { setWithdrawSubmitting(false); }
  }
  const seguimiento = useMemo(() => {
    if (!selected) return [] as { label: string; text: string }[];
    const entries: { label: string; text: string }[] = [];
    if (selected.notaPrimerContacto) entries.push({ label: 'Primer contacto', text: selected.notaPrimerContacto });
    ([1, 2, 3, 4] as const).forEach((n) => {
      const nota = selected[`fase${n}Nota` as keyof Pqrs] as string | null | undefined;
      if (nota) entries.push({ label: pqrsPhaseDisplayLabel(selected.workflowType, n), text: nota });
    });
    if (selected.estado === 'TERMINADO') {
      if (selected.accionTomada) entries.push({ label: 'Acción tomada', text: selected.accionTomada });
      if (selected.queSeHizoParaCerrar) entries.push({ label: 'Qué se hizo para cerrar', text: selected.queSeHizoParaCerrar });
      if (selected.evidenciaCierre) entries.push({ label: 'Evidencia de cierre', text: selected.evidenciaCierre });
      if (selected.evidenciaArchivoNombre) entries.push({ label: 'Archivo de evidencia', text: selected.evidenciaArchivoNombre });
    }
    return entries;
  }, [selected]);

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="pqrs" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="PQRS">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 3px' }}>PQRS</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>{loading ? 'Cargando solicitudes...' : `${data.length} solicitudes`}</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} style={{ background: COLORS.navy, color: COLORS.white, fontSize: 13.5, fontWeight: 700, padding: '11px 22px', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Radicar una PQRS</button>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por asunto, residente o ID…" style={{ width: '100%', maxWidth: 420, height: 42, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => <button key={f.key} type="button" onClick={() => { setFilter(f.key); setPage(1); }} style={{ ...tabStyle(filter === f.key), border: 'none', fontFamily: 'inherit' }}>{f.label}</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, overflow: 'hidden' }}>
          {/* Un conjunto recien creado no tiene "coincidencias" que buscar: no hay
              nada todavia. Decirle que nada coincide sugiere un filtro invisible. */}
          {data.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>{filter === 'all' && !searchQuery ? 'Aún no hay solicitudes radicadas.' : 'No hay solicitudes que coincidan.'}</div>}
          {data.map((p, i) => (
            isMobile ? (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="apl-up"
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '14px 18px', border: 'none', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer', background: p.id === selected?.id ? COLORS.navySoft : 'transparent', fontFamily: 'inherit', animationDelay: `${Math.min(i, 9) * 30}ms` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{p.titulo || 'Solicitud'}</div>
                  <span style={badge(p.estado)}>{label(p.estado)}</span>
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, marginBottom: 2 }}>{categoryLabel(p)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: COLORS.textMuted }}>{p.numeroRadicacion || code(p.numero)}</span>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombreResidente}</span>
                </div>
              </button>
            ) : (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="apl-up"
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: '14px 22px', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer', background: p.id === selected?.id ? COLORS.navySoft : 'transparent', fontFamily: 'inherit', animationDelay: `${Math.min(i, 9) * 30}ms` }}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 84, flexShrink: 0 }}>{p.numeroRadicacion || code(p.numero)}</span>
                <span style={{ flex: 1, minWidth: 120, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo || 'Solicitud'}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, marginTop: 2 }}>{categoryLabel(p)}</div>
                </span>
                <span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, width: 100, flexShrink: 0 }}>{p.nombreResidente}</span>
                <span style={badge(p.estado)}>{label(p.estado)}</span>
              </button>
            )
          ))}
          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderTop: '1px solid ' + COLORS.borderSoft }}>
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} style={{ border: 0, background: 'none', color: page <= 1 ? COLORS.textMuted : COLORS.navy, font: 'inherit', fontSize: 12, fontWeight: 700 }}>Anterior</button>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: COLORS.textMuted }}>Pagina {pagination.page} de {pagination.totalPages}</span>
              <button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} style={{ border: 0, background: 'none', color: page >= pagination.totalPages ? COLORS.textMuted : COLORS.navy, font: 'inherit', fontSize: 12, fontWeight: 700 }}>Siguiente</button>
            </div>
          )}
        </div>

        {/* En celular el detalle va sobre la lista: antes quedaba debajo de
            todas las filas y con 100 solicitudes tocaba bajar la pagina entera
            para leer la que acababas de tocar. */}
        {/* En escritorio `selected` cae por defecto en la primera de la lista,
            lo cual esta bien para la columna fija; en celular eso abriria el
            panel encima de la lista apenas entra, asi que aqui manda el
            seleccionado de verdad. */}
        <DetailPanel isMobile={isMobile} open={Boolean(selectedId)} onClose={() => setSelectedId(null)}>
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted }}>{code(selected.numero)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={badge(selected.estado)}>{label(selected.estado)}</span>
                  {isMobile && <CloseButton onClick={() => setSelectedId(null)} />}
                </div>
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>{selected.titulo || 'Solicitud'}</h3>
              <div style={{ marginBottom: 18 }}><span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>{categoryLabel(selected)}</span></div>

              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
                {STAGE_LABELS.map((stageLabel, i) => {
                  const idx = stageIndex(selected.estado);
                  const done = i < idx; const current = i === idx;
                  return (
                    <div key={stageLabel} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      <div style={{ width: 24, height: 24, borderRadius: RADIUS.pill, background: done ? COLORS.success : current ? COLORS.navy : COLORS.neutralSoft, color: done || current ? COLORS.white : COLORS.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{done ? '✓' : i + 1}</div>
                      {i < STAGE_LABELS.length - 1 && <div style={{ flex: 1, height: 2, background: i < idx ? COLORS.success : COLORS.neutralSoft, margin: '0 2px' }} />}
                    </div>
                  );
                })}
              </div>

              {selected.estado === 'EN_PROGRESO' && (
                <div style={{ background: COLORS.bgCard, borderRadius: RADIUS.stat, padding: 14, marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.05em' }}>{isSimpleWorkflow ? 'ESTADO DE LA GESTIÓN' : 'FASE DE GESTIÓN'}</div>
                    {activeSemaphore && <div style={{ width: 9, height: 9, borderRadius: RADIUS.pill, background: activeSemaphore.color }} title={`${activeSemaphore.elapsed}/${activeSemaphore.target} días hábiles`} />}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.navy }}>{faseActual ? pqrsPhaseDisplayLabel(selected?.workflowType, faseActual) : 'Sin iniciar'}</div>
                  {faseTipo && <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 2 }}>Ruta: {faseTipo === 'INSUMOS' ? 'Adquisición de insumos' : 'Gestión con proveedor'}</div>}
                  {activeSemaphore && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{activeSemaphore.elapsed} de {activeSemaphore.target} días hábiles permitidos</div>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>RESIDENTE</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.nombreResidente}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>UBICACIÓN</div><div style={{ fontSize: 13, fontWeight: 700 }}>B{selected.bloque} · Apto {selected.apto}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>RADICADA</div><div style={{ fontSize: 13, fontWeight: 700 }}>{date(selected.fechaRecibido)}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>N.° RADICACIÓN</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.numeroRadicacion || '—'}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>CREADA POR</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.creadoPor?.name || 'Residente'}</div></div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.05em' }}>DESCRIPCIÓN</div>
                {selected.editadoPorResidente && <span style={badgeStyle(COLORS.warningSoft, COLORS.warning)}>Editada por el residente</span>}
              </div>
              <p style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 500, lineHeight: 1.55, margin: '0 0 20px' }}>{selected.descripcion}</p>

              {(selected.evidenciaArchivoNombre || (selected.fotos?.length || 0) > 0) && (
                <div style={{ background: COLORS.bgCard, borderRadius: RADIUS.input, padding: 12, marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 8 }}>EVIDENCIAS</div>
                  {selected.evidenciaArchivoNombre && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <a href={`/api/pqrs/${selected.id}/evidencia`} target="_blank" style={{ color: COLORS.navy, fontSize: 12.5, fontWeight: 700 }}>{selected.evidenciaArchivoNombre}</a>
                      <button type="button" onClick={() => openWithdraw('file')} style={{ border: 0, background: 'none', color: COLORS.danger, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Retirar</button>
                    </div>
                  )}
                  {selected.fotos?.map((photo) => (
                    <div key={photo.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <a href={`/api/pqrs/${selected.id}/fotos/${photo.id}`} target="_blank" style={{ color: COLORS.navy, fontSize: 12.5, fontWeight: 700 }}>{photo.nombre}</a>
                      <button type="button" onClick={() => openWithdraw('photo', photo.id)} style={{ border: 0, background: 'none', color: COLORS.danger, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Retirar</button>
                    </div>
                  ))}
                </div>
              )}


              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 10 }}>Seguimiento</div>
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
                {seguimiento.length === 0 && <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0 }}>Sin seguimiento registrado aún.</p>}
                {seguimiento.map((s, i) => (
                  <div key={s.label} style={{ display: 'flex', gap: 11 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 8, height: 8, borderRadius: RADIUS.pill, background: COLORS.navy, marginTop: 5, flexShrink: 0 }} />
                      {i < seguimiento.length - 1 && <div style={{ width: 1.5, flex: 1, background: COLORS.neutralSoft, margin: '3px 0' }} />}
                    </div>
                    <div style={{ paddingBottom: i < seguimiento.length - 1 ? 16 : 0 }}>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Una sola accion principal segun la etapa. "Corregir caso" es
                  una salida de emergencia, no un par de la accion principal,
                  asi que baja a enlace discreto. */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.estado === 'EN_ESPERA' && (
                  <button type="button" onClick={openContact} style={{ flex: 1, textAlign: 'center', background: COLORS.navy, color: COLORS.white, fontSize: 13.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Abrir caso</button>
                )}
                {selected.estado === 'EN_PROGRESO' && (
                  <>
                    <button type="button" onClick={openFase} style={{ flex: 1, textAlign: 'center', background: COLORS.navy, color: COLORS.white, fontSize: 13.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Continuar proceso</button>
                    <button type="button" onClick={openClose} style={{ flex: 1, textAlign: 'center', background: COLORS.bg, color: COLORS.textPrimary, fontSize: 13.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: `1.5px solid ${COLORS.inputBorder}`, fontFamily: 'inherit', cursor: 'pointer' }}>Cerrar solicitud</button>
                  </>
                )}
                {selected.estado === 'TERMINADO' && (
                  <div style={{ flex: 1, textAlign: 'center', background: COLORS.successSoft, color: COLORS.success, fontSize: 13, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill }}>Solicitud terminada</div>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button type="button" onClick={openCorrection} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 600, color: COLORS.textMuted, cursor: 'pointer', textDecoration: 'underline' }}>Corregir un error de esta solicitud</button>
              </div>
            </>
          ) : <div style={{ color: COLORS.textMuted, fontWeight: 600 }}>Seleccione una solicitud.</div>}
        </DetailPanel>
      </div>

      {/* Create sheet */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={460}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Registrar una solicitud</div>
          <CloseButton onClick={() => setCreateOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 22px' }}>Registra una solicitud para hacerle seguimiento.</p>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Título</label>
        <input value={newTitulo} onChange={(e) => setNewTitulo(e.target.value.slice(0, 120))} placeholder="Ej. Goteras en el techo del pasillo" style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Categoría</label>
        <select value={newSubject} onChange={(e) => setNewSubject(e.target.value)} style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12, background: COLORS.bg }}>
          <option value="">Seleccione una categoría</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select>
        <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Descripción" rows={4} style={{ width: '100%', padding: '12px 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <input value={newResident} onChange={(e) => setNewResident(e.target.value)} placeholder="Nombre del residente" style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <input value={newBloque} onChange={(e) => setNewBloque(e.target.value)} placeholder="Bloque" type="number" style={{ height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit' }} />
          <input value={newApto} onChange={(e) => setNewApto(e.target.value)} placeholder="Apto" type="number" style={{ height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit' }} />
        </div>
        <button type="button" onClick={submitCreate} style={{ width: '100%', textAlign: 'center', background: COLORS.navy, color: COLORS.white, fontSize: 13, fontWeight: 600, padding: '12px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Radicar PQRS</button>
      </Sheet>

      {/* Primer contacto sheet */}
      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} maxWidth={460}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{contactDone ? 'Caso abierto' : 'Abrir caso'}</div>
          <CloseButton onClick={() => setContactOpen(false)} />
        </div>

        {contactDone ? (
          <div className="apl-up">
            <div style={{ background: COLORS.successSoft, borderRadius: RADIUS.stat, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: COLORS.success, marginBottom: 6 }}>✓ Listo, ya quedó en proceso</div>
              <div style={{ fontSize: 12.5, color: COLORS.success, fontWeight: 500, lineHeight: 1.55 }}>
                Radicado <strong>{selected?.numeroRadicacion || code(selected?.numero ?? 0)}</strong>. Se le avisó por correo a {selected?.nombreResidente}.
              </div>
            </div>
            {/* Sin "¿continuar ahora o mas tarde?": era una pregunta que no
                decidia nada. El caso ya quedo en gestion al abrirlo, y la
                siguiente accion esta a un clic en la ficha. */}
            <div style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.55, marginBottom: 16 }}>
              {selected?.workflowType === 'MAINTENANCE'
                ? 'Ya puede registrar la inspección de campo o avanzar de fase desde la ficha.'
                : 'Cuando lo resuelva, cierre la solicitud con la acción tomada y la evidencia.'}
            </div>
            <button type="button" onClick={() => setContactOpen(false)} style={{ width: '100%', background: COLORS.navy, color: COLORS.white, fontSize: 13.5, fontWeight: 700, padding: '12px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Entendido</button>
          </div>
        ) : (
        <>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 16px' }}>Se asigna el número de radicación, la solicitud pasa a En proceso y el residente recibe la respuesta por correo.</p>

        {/* Lo que escribio el residente, a la vista mientras se llena el
            formulario. Antes habia que cerrar el modal para releerlo, o
            recordarlo de memoria justo cuando hay que clasificar y responder. */}
        {selected && (
          <div style={{ background: COLORS.bgCard, borderRadius: RADIUS.stat, padding: '13px 15px', marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: COLORS.textMuted, marginBottom: 6 }}>Lo que reportó el residente</div>
            {selected.titulo && (
              <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4, lineHeight: 1.35 }}>{selected.titulo}</div>
            )}
            <div style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{selected.descripcion}</div>
            <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 600, marginTop: 8 }}>
              {selected.nombreResidente} · Bloque {selected.bloque} · Apto {selected.apto}
              {selected.fotos && selected.fotos.length > 0 ? ` · ${selected.fotos.length} ${selected.fotos.length === 1 ? 'foto adjunta' : 'fotos adjuntas'}` : ''}
            </div>
          </div>
        )}

        <label htmlFor="contact-categoria" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>1. Clasifique la solicitud</label>
        <select
          id="contact-categoria"
          value={contactCategoryId}
          onChange={(e) => setContactCategoryId(e.target.value)}
          style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', marginBottom: 10 }}
        >
          <option value="">Seleccione una categoría</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select>

        {/* La ruta no se pregunta: se muestra como consecuencia de la
            categoria, con los pasos que el admin va a tener que llenar. */}
        {contactCategory && (
          <div className="apl-up" style={{ background: contactWorkflow === 'MAINTENANCE' ? COLORS.warningSoft : COLORS.navySoft, borderRadius: RADIUS.stat, padding: '13px 15px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: contactWorkflow === 'MAINTENANCE' ? COLORS.warning : COLORS.navy, marginBottom: 6 }}>
              {contactWorkflow === 'MAINTENANCE' ? 'Se gestiona en 5 fases' : 'Gestión directa'}
            </div>
            <div style={{ fontSize: 12, color: contactWorkflow === 'MAINTENANCE' ? COLORS.warning : COLORS.navy, fontWeight: 500, lineHeight: 1.5 }}>
              {contactWorkflow === 'MAINTENANCE'
                ? 'Registrará cinco fases: inspección de campo, adquisición de insumos o contrato con proveedor, ejecución y cierre. Cada una tiene su plazo en días hábiles.'
                : 'Registrará dos cosas: esta primera respuesta y, al resolver, la acción tomada con su evidencia.'}
            </div>
          </div>
        )}

        <label htmlFor="contact-nota" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>2. Primera respuesta al residente</label>
        <textarea id="contact-nota" value={contactNota} onChange={(e) => setContactNota(e.target.value)} rows={4} placeholder="Ej. Recibimos su solicitud. Programamos la visita técnica para el jueves 22." style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 16 }} />

        {/* La prioridad arranca en Media y casi nunca hay que tocarla, asi que
            no estorba como un paso mas. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>Prioridad</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ALTA', 'MEDIA', 'BAJA'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setContactPrioridad(p)} style={{ border: `1.5px solid ${contactPrioridad === p ? COLORS.navy : COLORS.inputBorder}`, font: 'inherit', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: RADIUS.pill, cursor: 'pointer', background: contactPrioridad === p ? COLORS.navySoft : 'none', color: contactPrioridad === p ? COLORS.navy : COLORS.textSecondary }}>{p === 'ALTA' ? 'Alta' : p === 'MEDIA' ? 'Media' : 'Baja'}</button>
            ))}
          </div>
        </div>

        <button type="button" onClick={submitContact} disabled={!contactReady || contactSubmitting} style={{ width: '100%', textAlign: 'center', background: contactReady ? COLORS.navy : COLORS.neutralSoft, color: contactReady ? COLORS.white : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: contactReady ? 'pointer' : 'default' }}>{contactSubmitting ? 'Abriendo…' : 'Abrir caso y avisar al residente'}</button>
        </>
        )}
      </Sheet>

      {/* Correccion auditada */}
      <Sheet open={correctionOpen} onClose={() => setCorrectionOpen(false)} maxWidth={500}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Corregir caso</div>
          <CloseButton onClick={() => setCorrectionOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 18px' }}>Para arreglar un dato mal registrado. Los cambios quedan en el historial y en la auditoría.</p>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Categoría</label>
        <select
          value={correctionCategoryId}
          onChange={(e) => {
            setCorrectionCategoryId(e.target.value);
            // La categoria manda: al cambiarla, la ruta se ajusta sola en vez
            // de dejar que queden en contradiccion.
            const next = categories.find((c) => c.id === e.target.value);
            if (next) setCorrectionWorkflow(next.workflowType);
          }}
          style={{ width: '100%', height: 42, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, marginBottom: 10 }}
        >
          <option value="">Seleccione una categoría</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
        </select>
        <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 600, marginBottom: 12 }}>
          Esta categoría se gestiona {correctionWorkflow === 'MAINTENANCE' ? 'por 5 fases' : 'de forma simple'}.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <input type="number" min={1} value={correctionBloque} onChange={(e) => setCorrectionBloque(e.target.value)} placeholder="Bloque" style={{ height: 42, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input }} />
          <input type="number" min={1} value={correctionApto} onChange={(e) => setCorrectionApto(e.target.value)} placeholder="Apartamento" style={{ height: 42, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input }} />
        </div>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>En qué punto del proceso va</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <select value={correctionPhase} onChange={(e) => setCorrectionPhase(e.target.value)} style={{ height: 42, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input }}>
            <option value="">Sin empezar</option><option value="1">Fase 1</option>
            {correctionWorkflow === 'MAINTENANCE' && <><option value="2">Fase 2</option><option value="3">Fase 3</option><option value="4">Fase 4</option></>}
          </select>
          <select disabled={correctionWorkflow !== 'MAINTENANCE'} value={correctionRoute} onChange={(e) => setCorrectionRoute(e.target.value)} style={{ height: 42, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, opacity: correctionWorkflow === 'MAINTENANCE' ? 1 : 0.5 }}>
            <option value="">Sin ruta</option><option value="INSUMOS">Compra de insumos</option><option value="PROVEEDOR">Gestión con proveedor</option>
          </select>
        </div>
        {selected?.estado === 'TERMINADO' && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}><input type="checkbox" checked={correctionReopen} onChange={(e) => setCorrectionReopen(e.target.checked)} /> Reabrir caso cerrado por equivocación</label>}
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Motivo (obligatorio)</label>
        <textarea value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} rows={3} maxLength={500} placeholder="Explique el error que se está corrigiendo." style={{ width: '100%', padding: 12, border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontFamily: 'inherit', marginBottom: 16 }} />
        <button type="button" onClick={submitCorrection} disabled={correctionReason.trim().length < 10 || correctionSubmitting} style={{ width: '100%', border: 0, background: correctionReason.trim().length >= 10 ? COLORS.navy : COLORS.neutralSoft, color: correctionReason.trim().length >= 10 ? COLORS.white : COLORS.textMuted, padding: '13px 0', borderRadius: RADIUS.pill, fontWeight: 700 }}>{correctionSubmitting ? 'Guardando...' : 'Guardar corrección'}</button>
      </Sheet>
      {/* Withdraw evidence sheet */}
      <Sheet open={withdrawTarget !== null} onClose={() => setWithdrawTarget(null)} maxWidth={440}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Retirar evidencia</div>
          <CloseButton onClick={() => setWithdrawTarget(null)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 18px' }}>El archivo deja de estar disponible para descarga y el motivo queda registrado en la auditoría.</p>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Motivo del retiro (mínimo 10 caracteres)</label>
        <textarea value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} rows={3} maxLength={500} placeholder="Explique por qué se retira esta evidencia." style={{ width: '100%', padding: 12, border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontFamily: 'inherit', marginBottom: 16 }} />
        <button type="button" onClick={submitWithdraw} disabled={withdrawReason.trim().length < 10 || withdrawSubmitting} style={{ width: '100%', border: 0, background: withdrawReason.trim().length >= 10 ? COLORS.danger : COLORS.neutralSoft, color: withdrawReason.trim().length >= 10 ? COLORS.white : COLORS.textMuted, padding: '13px 0', borderRadius: RADIUS.pill, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{withdrawSubmitting ? 'Retirando…' : 'Retirar evidencia'}</button>
      </Sheet>
      {/* Fase sheet */}
      <Sheet open={faseOpen} onClose={() => setFaseOpen(false)} maxWidth={480}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{isSimpleWorkflow ? 'Avance de la gestión' : 'Gestión por fases'}</div>
          <CloseButton onClick={() => setFaseOpen(false)} />
        </div>

        {faseActual === 0 && (
          <>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>{isSimpleWorkflow ? 'Esta solicitud aún no tiene gestión registrada.' : 'Esta solicitud aún no inicia su gestión por fases. Comience por la Fase 1.'}</p>
            <div style={{ background: COLORS.bgCard, borderRadius: RADIUS.stat, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{isSimpleWorkflow ? 'En gestión' : 'Fase 1 · Inspección de campo'}</div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>Plazo: 2 días hábiles</div>
            </div>
            <button type="button" onClick={() => submitFaseAction({ faseActual: 1 })} disabled={faseSubmitting} style={{ width: '100%', border: 'none', font: 'inherit', background: COLORS.navy, color: COLORS.white, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>{faseSubmitting ? 'Iniciando…' : isSimpleWorkflow ? 'Iniciar gestión' : 'Iniciar la Fase 1'}</button>
          </>
        )}

        {faseActual >= 1 && faseActual <= 4 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{pqrsPhaseDisplayLabel(selected?.workflowType, faseActual)}</div>
              {activeSemaphore && <div style={{ width: 10, height: 10, borderRadius: RADIUS.pill, background: activeSemaphore.color }} />}
            </div>
            <p style={{ fontSize: 11.5, color: COLORS.textMuted, margin: '0 0 18px' }}>
              {activeSemaphore ? `${activeSemaphore.elapsed} de ${activeSemaphore.target} días hábiles transcurridos` : `Plazo: ${FASE_TARGET_DAYS[faseActual]} días hábiles`}
              {faseTipo && ` · Ruta: ${faseTipo === 'INSUMOS' ? 'Insumos' : 'Proveedor'}`}
            </p>

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>{isSimpleWorkflow ? 'Avance de la gestión' : 'Nota de la fase (obligatoria para avanzar)'}</label>
            <textarea value={faseNotaDraft} onChange={(e) => setFaseNotaDraft(e.target.value)} rows={3} placeholder={isSimpleWorkflow ? 'Ej. Se contactó al proveedor y la reparación quedó programada.' : 'Describa lo realizado en esta fase.'} style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 18 }} />

            {faseActual === 1 && isSimpleWorkflow && (
              <button type="button" onClick={() => submitFaseAction({ faseActual: 5, noteFase: 1, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ width: '100%', border: 'none', font: 'inherit', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? COLORS.white : COLORS.textMuted }}>{faseSubmitting ? 'Guardando…' : 'Guardar el avance y dejar la solicitud lista para cerrar'}</button>
            )}
            {faseActual === 1 && !isSimpleWorkflow && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => submitFaseAction({ faseActual: 2, faseTipo: 'INSUMOS', noteFase: 1, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ flex: 1, border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? COLORS.white : COLORS.textMuted }}>Fase 2 · Adquisición de insumos</button>
                <button type="button" onClick={() => submitFaseAction({ faseActual: 3, faseTipo: 'PROVEEDOR', noteFase: 1, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ flex: 1, border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? COLORS.white : COLORS.textMuted }}>Fase 3 · Contrato con proveedor</button>
              </div>
            )}
            {(faseActual === 2 || faseActual === 3) && (
              <button type="button" onClick={() => submitFaseAction({ faseActual: 4, noteFase: faseActual, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ width: '100%', border: 'none', font: 'inherit', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? COLORS.white : COLORS.textMuted }}>{faseSubmitting ? 'Guardando…' : 'Avanzar a la Fase 4 · Ejecución'}</button>
            )}
            {faseActual === 4 && (
              <button type="button" onClick={() => submitFaseAction({ faseActual: 5, noteFase: 4, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ width: '100%', border: 'none', font: 'inherit', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? COLORS.white : COLORS.textMuted }}>{faseSubmitting ? 'Guardando…' : 'Avanzar a la Fase 5 · Terminado'}</button>
            )}
          </>
        )}

        {faseActual === 5 && (
          <div style={{ background: COLORS.successSoft, color: COLORS.success, borderRadius: RADIUS.input, padding: '14px 16px', fontSize: 12.5, fontWeight: 600 }}>{isSimpleWorkflow ? 'La gestión quedó registrada. Ya puede marcar la solicitud como resuelta.' : 'Todas las fases están completas. Ya puede marcar la solicitud como resuelta.'}</div>
        )}
      </Sheet>

      {/* Cerrar sheet */}
      <Sheet open={closeOpen} onClose={() => setCloseOpen(false)} maxWidth={480}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Marcar como resuelta</div>
          <CloseButton onClick={() => setCloseOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>El residente recibirá una notificación y un correo con esta información{closeFile || closeHasExistingEvidence ? ', incluyendo el archivo de evidencia' : ''}.</p>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Acción tomada</label>
        <textarea value={closeAccion} onChange={(e) => setCloseAccion(e.target.value)} rows={3} placeholder="Ej. Se cambió el filtro de la piscina y se verificó el funcionamiento." style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 16 }} />

        {closeNeedsQueSeHizo && (
          <>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Motivo del cierre anticipado <span style={{ fontWeight: 500, color: COLORS.textMuted }}>(no se completaron las 5 fases)</span></label>
            <textarea value={closeQueSeHizo} onChange={(e) => setCloseQueSeHizo(e.target.value)} rows={3} placeholder="Explique por qué se cierra sin completar todas las fases." style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 16 }} />
          </>
        )}

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Evidencia de cierre</label>
        {closeHasExistingEvidence && !closeFile && (
          <div style={{ fontSize: 11.5, color: COLORS.success, fontWeight: 600, marginBottom: 8 }}>Ya hay evidencia guardada para esta PQRS{selected?.evidenciaArchivoNombre ? ` (${selected.evidenciaArchivoNombre})` : ''}.</div>
        )}
        <textarea value={closeEvidenciaTexto} onChange={(e) => setCloseEvidenciaTexto(e.target.value)} rows={2} placeholder="Describa la evidencia. Puede omitirlo si adjunta un archivo." style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 10 }} />
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => handleCloseFileChange(e.target.files?.[0] || null)} style={{ width: '100%', fontSize: 12.5, marginBottom: 6 }} />
        <p style={{ fontSize: 11, color: COLORS.textMuted, margin: '0 0 20px' }}>Máx. 2MB · imagen o PDF</p>
        {closeFileError && <div style={{ fontSize: 11.5, color: COLORS.danger, fontWeight: 600, marginBottom: 16 }}>{closeFileError}</div>}

        <button type="button" onClick={submitClose} disabled={!closeCanSubmit || closeSubmitting} style={{ width: '100%', textAlign: 'center', background: closeCanSubmit ? COLORS.navy : COLORS.neutralSoft, color: closeCanSubmit ? COLORS.white : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>{closeSubmitting ? 'Guardando…' : 'Marcar como resuelta'}</button>
      </Sheet>

      <Toast message={toast} />
    </AdminShell>
  );
}

export default function ModuloPqrsPage() {
  return (
    <Suspense fallback={null}>
      <ModuloPqrsPageContent />
    </Suspense>
  );
}
