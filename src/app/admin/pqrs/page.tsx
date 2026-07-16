'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminShell } from '@/components/shell/AdminShell';
import { Sheet, CloseButton } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';

type Estado = 'EN_ESPERA' | 'EN_PROGRESO' | 'TERMINADO';
type FaseTipo = 'INSUMOS' | 'PROVEEDOR';
type Pqrs = {
  id: string; numero: number; titulo?: string | null; asunto?: string | null; descripcion: string; nombreResidente: string;
  bloque: number; apto: number; estado: Estado; fechaRecibido: string; numeroRadicacion?: string | null;
  notaPrimerContacto?: string | null;
  faseActual?: number | null; faseTipo?: FaseTipo | null;
  fase1Nota?: string | null; fase2Nota?: string | null; fase3Nota?: string | null; fase4Nota?: string | null;
  fase1Inicio?: string | null; fase2Inicio?: string | null; fase3Inicio?: string | null; fase4Inicio?: string | null; fase5Inicio?: string | null;
  accionTomada?: string | null; evidenciaCierre?: string | null; queSeHizoParaCerrar?: string | null;
  evidenciaArchivoNombre?: string | null; evidenciaArchivoPath?: string | null; evidenciaArchivoUrl?: string | null;
  editadoPorResidente?: boolean;
  creadoPor?: { name?: string | null } | null;
};

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

const FASE_LABELS: Record<number, string> = {
  1: 'Inspección de Campo',
  2: 'Adquisición de insumos',
  3: 'Firma contrato proveedor',
  4: 'Ejecución',
  5: 'Terminado',
};
const FASE_TARGET_DAYS: Record<number, number> = { 1: 2, 2: 2, 3: 15, 4: 5, 5: 0 };
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

function stageIndex(estado: Estado) { return estado === 'EN_ESPERA' ? 0 : estado === 'EN_PROGRESO' ? 1 : 2; }
function badge(status: Estado) { return status === 'EN_ESPERA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : status === 'EN_PROGRESO' ? badgeStyle(COLORS.navySoft, COLORS.navy) : badgeStyle(COLORS.successSoft, COLORS.success); }
function label(status: Estado) { return status === 'EN_ESPERA' ? 'En espera' : status === 'EN_PROGRESO' ? 'En proceso' : 'Terminada'; }
function code(n: number) { return `PQ-${String(n).padStart(4, '0')}`; }
function date(v: string) { return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }); }

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
  const searchParams = useSearchParams();
  const [data, setData] = useState<Pqrs[]>([]);
  const initialEstado = searchParams.get('estado');
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === initialEstado) ? initialEstado! : 'all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
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
  const [contactAsunto, setContactAsunto] = useState('');
  const [contactNota, setContactNota] = useState('');
  const [contactPrioridad, setContactPrioridad] = useState<'ALTA' | 'MEDIA' | 'BAJA'>('MEDIA');
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

  async function load() { setLoading(true); const res = await fetch('/api/pqrs'); if (res.ok) setData(await res.json()); setLoading(false); }
  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const filtered = useMemo(() => data.filter((p) => (filter === 'all' || p.estado === filter) && (!search || `${p.numero} ${p.titulo || ''} ${p.asunto || ''} ${p.nombreResidente} ${p.bloque}-${p.apto}`.toLowerCase().includes(search.toLowerCase()))), [data, filter, search]);
  const selected = data.find((p) => p.id === selectedId) ?? filtered[0] ?? data[0];

  async function submitCreate() {
    if (!newTitulo.trim() || !newDescription.trim() || !newResident.trim() || !newBloque || !newApto) return;
    const res = await fetch('/api/pqrs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo: newTitulo.trim(), asunto: newSubject || null, descripcion: newDescription, nombreResidente: newResident, bloque: newBloque, apto: newApto }) });
    if (!res.ok) { const err = await res.json().catch(() => null); showToast(err?.error || 'No se pudo crear la PQRS'); return; }
    const created = await res.json(); setCreateOpen(false); setNewTitulo(''); setNewSubject(''); setNewDescription(''); setNewResident(''); setNewBloque(''); setNewApto(''); await load(); setSelectedId(created.id); showToast('PQRS creada ✓');
  }

  function openContact() {
    if (!selected) return;
    setContactAsunto(selected.asunto && ASUNTO_LABEL[selected.asunto] ? selected.asunto : '');
    setContactNota('');
    setContactPrioridad('MEDIA');
    setContactOpen(true);
  }

  async function submitContact() {
    if (!selected || !contactAsunto || !contactNota.trim()) return;
    setContactSubmitting(true);
    try {
      const res = await fetch(`/api/pqrs/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primerContacto: true, asunto: contactAsunto, notaPrimerContacto: contactNota.trim(), prioridad: contactPrioridad }),
      });
      if (!res.ok) { const err = await res.json().catch(() => null); showToast(err?.error || 'No se pudo registrar el primer contacto'); return; }
      setContactOpen(false); await load(); showToast('Primer contacto registrado ✓ Correo enviado al residente.');
    } finally { setContactSubmitting(false); }
  }

  const faseActual = selected?.faseActual || 0;
  const faseTipo = selected?.faseTipo || null;
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
      await load(); showToast('Fase actualizada ✓');
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

  const closeNeedsQueSeHizo = selected ? selected.faseActual !== 5 : false;
  const closeHasExistingEvidence = !!(selected?.evidenciaCierre || selected?.evidenciaArchivoPath || selected?.evidenciaArchivoUrl);
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
      setCloseOpen(false); await load(); showToast('PQRS cerrada ✓ Correo de cierre enviado al residente.');
    } finally { setCloseSubmitting(false); }
  }

  const seguimiento = useMemo(() => {
    if (!selected) return [] as { label: string; text: string }[];
    const entries: { label: string; text: string }[] = [];
    if (selected.notaPrimerContacto) entries.push({ label: 'Primer contacto', text: selected.notaPrimerContacto });
    ([1, 2, 3, 4] as const).forEach((n) => {
      const nota = selected[`fase${n}Nota` as keyof Pqrs] as string | null | undefined;
      if (nota) entries.push({ label: `Fase ${n} · ${FASE_LABELS[n]}`, text: nota });
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
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>{loading ? 'Cargando solicitudes...' : `${data.length} solicitudes reales`}</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, padding: '11px 22px', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>+ Crear PQRS</button>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por asunto, residente o ID…" style={{ width: '100%', maxWidth: 420, height: 42, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{ ...tabStyle(filter === f.key), border: 'none', fontFamily: 'inherit' }}>{f.label}</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>No hay solicitudes que coincidan.</div>}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: '14px 22px', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer', background: p.id === selected?.id ? COLORS.navySoft : 'transparent', fontFamily: 'inherit' }}
            >
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: p.numeroRadicacion ? COLORS.textMuted : COLORS.warning, width: 84, flexShrink: 0 }}>{p.numeroRadicacion || 'Sin radicar'}</span>
              <span style={{ flex: 1, minWidth: 120, overflow: 'hidden' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo || 'Solicitud'}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, marginTop: 2 }}>{p.asunto ? (ASUNTO_LABEL[p.asunto] || p.asunto) : 'Sin categoría'}</div>
              </span>
              <span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, width: 100, flexShrink: 0 }}>{p.nombreResidente}</span>
              <span style={badge(p.estado)}>{label(p.estado)}</span>
            </button>
          ))}
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
          {selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted }}>{code(selected.numero)}</span>
                <span style={badge(selected.estado)}>{label(selected.estado)}</span>
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>{selected.titulo || 'Solicitud'}</h3>
              <div style={{ marginBottom: 18 }}><span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>{selected.asunto ? (ASUNTO_LABEL[selected.asunto] || selected.asunto) : 'Sin categoría'}</span></div>

              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
                {STAGE_LABELS.map((stageLabel, i) => {
                  const idx = stageIndex(selected.estado);
                  const done = i < idx; const current = i === idx;
                  return (
                    <div key={stageLabel} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 999, background: done ? COLORS.success : current ? COLORS.navy : COLORS.neutralSoft, color: done || current ? '#FFFFFF' : COLORS.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{done ? '✓' : i + 1}</div>
                      {i < STAGE_LABELS.length - 1 && <div style={{ flex: 1, height: 2, background: i < idx ? COLORS.success : COLORS.neutralSoft, margin: '0 2px' }} />}
                    </div>
                  );
                })}
              </div>

              {selected.estado === 'EN_PROGRESO' && (
                <div style={{ background: COLORS.bgCard, borderRadius: 14, padding: 14, marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.05em' }}>FASE DE GESTIÓN</div>
                    {activeSemaphore && <div style={{ width: 9, height: 9, borderRadius: 999, background: activeSemaphore.color }} title={`${activeSemaphore.elapsed}/${activeSemaphore.target} días hábiles`} />}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.navy }}>{faseActual ? `Fase ${faseActual} · ${FASE_LABELS[faseActual]}` : 'Sin iniciar'}</div>
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

              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 10 }}>Seguimiento</div>
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
                {seguimiento.length === 0 && <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0 }}>Sin seguimiento registrado aún.</p>}
                {seguimiento.map((s, i) => (
                  <div key={s.label} style={{ display: 'flex', gap: 11 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.navy, marginTop: 5, flexShrink: 0 }} />
                      {i < seguimiento.length - 1 && <div style={{ width: 1.5, flex: 1, background: COLORS.neutralSoft, margin: '3px 0' }} />}
                    </div>
                    <div style={{ paddingBottom: i < seguimiento.length - 1 ? 16 : 0 }}>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 2 }}>{s.label.toUpperCase()}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.estado === 'EN_ESPERA' && (
                  <button type="button" onClick={openContact} style={{ flex: 1, textAlign: 'center', background: COLORS.navy, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Registrar primer contacto</button>
                )}
                {selected.estado === 'EN_PROGRESO' && (
                  <>
                    <button type="button" onClick={openFase} style={{ flex: 1, textAlign: 'center', background: COLORS.bgCard, color: '#1D1D1F', fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Gestionar fase</button>
                    <button type="button" onClick={openClose} style={{ flex: 1, textAlign: 'center', background: COLORS.navy, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Cerrar PQRS</button>
                  </>
                )}
                {selected.estado === 'TERMINADO' && (
                  <div style={{ flex: 1, textAlign: 'center', background: COLORS.bgCard, color: COLORS.textMuted, fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill }}>Terminada</div>
                )}
              </div>
            </>
          ) : <div style={{ color: COLORS.textMuted, fontWeight: 600 }}>Selecciona una PQRS.</div>}
        </div>
      </div>

      {/* Create sheet */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={460}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Crear PQRS</div>
          <CloseButton onClick={() => setCreateOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 22px' }}>Radica una nueva solicitud real en la base de datos.</p>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Título</label>
        <input value={newTitulo} onChange={(e) => setNewTitulo(e.target.value.slice(0, 120))} placeholder="Ej. Goteras en el techo del pasillo" style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Categoría (opcional)</label>
        <select value={newSubject} onChange={(e) => setNewSubject(e.target.value)} style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12, background: '#FFFFFF' }}>
          <option value="">Sin categoría todavía</option>
          {ASUNTOS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Descripción" rows={4} style={{ width: '100%', padding: '12px 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <input value={newResident} onChange={(e) => setNewResident(e.target.value)} placeholder="Nombre del residente" style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <input value={newBloque} onChange={(e) => setNewBloque(e.target.value)} placeholder="Bloque" type="number" style={{ height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit' }} />
          <input value={newApto} onChange={(e) => setNewApto(e.target.value)} placeholder="Apto" type="number" style={{ height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit' }} />
        </div>
        <button type="button" onClick={submitCreate} style={{ width: '100%', textAlign: 'center', background: COLORS.navy, color: '#FFFFFF', fontSize: 13, fontWeight: 600, padding: '12px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Radicar PQRS</button>
      </Sheet>

      {/* Primer contacto sheet */}
      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} maxWidth={460}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Registrar primer contacto</div>
          <CloseButton onClick={() => setContactOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 22px' }}>Esto pasa la PQRS a &quot;En proceso&quot;, genera su número de radicación y avisa al residente por correo.</p>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Categoría (obligatoria)</label>
        <select value={contactAsunto} onChange={(e) => setContactAsunto(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14, background: '#FFFFFF' }}>
          <option value="">Selecciona una categoría…</option>
          {ASUNTOS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Prioridad</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['ALTA', 'MEDIA', 'BAJA'] as const).map((p) => (
            <button key={p} type="button" onClick={() => setContactPrioridad(p)} style={{ flex: 1, border: `1.5px solid ${contactPrioridad === p ? COLORS.navy : COLORS.inputBorder}`, font: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '9px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: contactPrioridad === p ? COLORS.navySoft : 'none', color: contactPrioridad === p ? COLORS.navy : '#1D1D1F' }}>{p === 'ALTA' ? 'Alta' : p === 'MEDIA' ? 'Media' : 'Baja'}</button>
          ))}
        </div>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nota de primer contacto</label>
        <textarea value={contactNota} onChange={(e) => setContactNota(e.target.value)} rows={4} placeholder="¿Qué se le informó o gestionó al residente?" style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 20 }} />
        <button type="button" onClick={submitContact} disabled={!contactAsunto || !contactNota.trim() || contactSubmitting} style={{ width: '100%', textAlign: 'center', background: (contactAsunto && contactNota.trim()) ? COLORS.navy : COLORS.neutralSoft, color: (contactAsunto && contactNota.trim()) ? '#FFFFFF' : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>{contactSubmitting ? 'Guardando…' : 'Registrar primer contacto'}</button>
      </Sheet>

      {/* Fase sheet */}
      <Sheet open={faseOpen} onClose={() => setFaseOpen(false)} maxWidth={480}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Gestión por fases</div>
          <CloseButton onClick={() => setFaseOpen(false)} />
        </div>

        {faseActual === 0 && (
          <>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>Esta PQRS aún no ha iniciado su gestión por fases. Empieza con la Fase I.</p>
            <div style={{ background: COLORS.bgCard, borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Fase I · Inspección de Campo</div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>Plazo: 2 días hábiles</div>
            </div>
            <button type="button" onClick={() => submitFaseAction({ faseActual: 1 })} disabled={faseSubmitting} style={{ width: '100%', border: 'none', font: 'inherit', background: COLORS.navy, color: '#FFFFFF', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>{faseSubmitting ? 'Iniciando…' : 'Iniciar Fase I'}</button>
          </>
        )}

        {faseActual >= 1 && faseActual <= 4 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>Fase {faseActual} · {FASE_LABELS[faseActual]}</div>
              {activeSemaphore && <div style={{ width: 10, height: 10, borderRadius: 999, background: activeSemaphore.color }} />}
            </div>
            <p style={{ fontSize: 11.5, color: COLORS.textMuted, margin: '0 0 18px' }}>
              {activeSemaphore ? `${activeSemaphore.elapsed} de ${activeSemaphore.target} días hábiles transcurridos` : `Plazo: ${FASE_TARGET_DAYS[faseActual]} días hábiles`}
              {faseTipo && ` · Ruta: ${faseTipo === 'INSUMOS' ? 'Insumos' : 'Proveedor'}`}
            </p>

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nota de esta fase (obligatoria para avanzar)</label>
            <textarea value={faseNotaDraft} onChange={(e) => setFaseNotaDraft(e.target.value)} rows={3} placeholder="¿Qué pasó en esta fase?" style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 18 }} />

            {faseActual === 1 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => submitFaseAction({ faseActual: 2, faseTipo: 'INSUMOS', noteFase: 1, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ flex: 1, border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? '#FFFFFF' : COLORS.textMuted }}>Fase II — Insumos</button>
                <button type="button" onClick={() => submitFaseAction({ faseActual: 3, faseTipo: 'PROVEEDOR', noteFase: 1, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ flex: 1, border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? '#FFFFFF' : COLORS.textMuted }}>Fase III — Proveedor</button>
              </div>
            )}
            {(faseActual === 2 || faseActual === 3) && (
              <button type="button" onClick={() => submitFaseAction({ faseActual: 4, noteFase: faseActual, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ width: '100%', border: 'none', font: 'inherit', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? '#FFFFFF' : COLORS.textMuted }}>{faseSubmitting ? 'Guardando…' : 'Avanzar a Fase IV — Ejecución'}</button>
            )}
            {faseActual === 4 && (
              <button type="button" onClick={() => submitFaseAction({ faseActual: 5, noteFase: 4, note: faseNotaDraft.trim() })} disabled={!faseNotaDraft.trim() || faseSubmitting} style={{ width: '100%', border: 'none', font: 'inherit', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', background: faseNotaDraft.trim() ? COLORS.navy : COLORS.neutralSoft, color: faseNotaDraft.trim() ? '#FFFFFF' : COLORS.textMuted }}>{faseSubmitting ? 'Guardando…' : 'Avanzar a Fase V — Terminado'}</button>
            )}
          </>
        )}

        {faseActual === 5 && (
          <div style={{ background: COLORS.successSoft, color: COLORS.success, borderRadius: 11, padding: '14px 16px', fontSize: 12.5, fontWeight: 600 }}>Todas las fases están completas. Ya puedes cerrar la PQRS desde el botón &quot;Cerrar PQRS&quot;.</div>
        )}
      </Sheet>

      {/* Cerrar sheet */}
      <Sheet open={closeOpen} onClose={() => setCloseOpen(false)} maxWidth={480}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Cerrar PQRS</div>
          <CloseButton onClick={() => setCloseOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>El residente recibirá una notificación y un correo con esta información{closeFile || closeHasExistingEvidence ? ', incluyendo el archivo de evidencia' : ''}.</p>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Acción tomada</label>
        <textarea value={closeAccion} onChange={(e) => setCloseAccion(e.target.value)} rows={3} placeholder="¿Qué se hizo para resolver la solicitud?" style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 16 }} />

        {closeNeedsQueSeHizo && (
          <>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>¿Qué se hizo para cerrar? <span style={{ fontWeight: 500, color: COLORS.textMuted }}>(obligatorio: no se completaron las 5 fases)</span></label>
            <textarea value={closeQueSeHizo} onChange={(e) => setCloseQueSeHizo(e.target.value)} rows={3} placeholder="Justifica el cierre sin haber completado todas las fases" style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 16 }} />
          </>
        )}

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Evidencia de cierre</label>
        {closeHasExistingEvidence && !closeFile && (
          <div style={{ fontSize: 11.5, color: COLORS.success, fontWeight: 600, marginBottom: 8 }}>Ya hay evidencia guardada para esta PQRS{selected?.evidenciaArchivoNombre ? ` (${selected.evidenciaArchivoNombre})` : ''}.</div>
        )}
        <textarea value={closeEvidenciaTexto} onChange={(e) => setCloseEvidenciaTexto(e.target.value)} rows={2} placeholder="Descripción de la evidencia (opcional si adjuntas un archivo)" style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 10 }} />
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => handleCloseFileChange(e.target.files?.[0] || null)} style={{ width: '100%', fontSize: 12.5, marginBottom: 6 }} />
        <p style={{ fontSize: 11, color: COLORS.textMuted, margin: '0 0 20px' }}>Máx. 2MB · imagen o PDF</p>
        {closeFileError && <div style={{ fontSize: 11.5, color: COLORS.danger, fontWeight: 600, marginBottom: 16 }}>{closeFileError}</div>}

        <button type="button" onClick={submitClose} disabled={!closeCanSubmit || closeSubmitting} style={{ width: '100%', textAlign: 'center', background: closeCanSubmit ? COLORS.navy : COLORS.neutralSoft, color: closeCanSubmit ? '#FFFFFF' : COLORS.textMuted, fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>{closeSubmitting ? 'Cerrando…' : 'Cerrar PQRS'}</button>
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
