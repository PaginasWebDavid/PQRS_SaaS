'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminShell } from '@/components/shell/AdminShell';
import { useIsMobile } from '@/components/shell/Sheet';
import { CONSEJO_NAV } from '@/lib/design/consejoNav';
import { COLORS, badgeStyle, tabStyle } from '@/lib/design/tokens';

type Estado = 'EN_ESPERA' | 'EN_PROGRESO' | 'TERMINADO';
type FaseTipo = 'INSUMOS' | 'PROVEEDOR';
type Pqrs = {
  id: string; numero: number; titulo?: string | null; asunto?: string | null; descripcion: string; nombreResidente: string;
  bloque: number; apto: number; estado: Estado; fechaRecibido: string; numeroRadicacion?: string | null;
  notaPrimerContacto?: string | null;
  faseActual?: number | null; faseTipo?: FaseTipo | null;
  fase1Nota?: string | null; fase2Nota?: string | null; fase3Nota?: string | null; fase4Nota?: string | null;
  accionTomada?: string | null; queSeHizoParaCerrar?: string | null; evidenciaCierre?: string | null; evidenciaArchivoNombre?: string | null;
  editadoPorResidente?: boolean;
  creadoPor?: { name?: string | null } | null;
  gestionadoPor?: { name?: string | null } | null;
  fechaCierre?: string | null; updatedAt?: string;
  historial?: { id: string; estadoAntes?: Estado | null; estadoDespues: Estado; nota?: string | null; creadoAt: string }[];
  fotos?: { id: string; nombre: string; tipo: string; size?: number | null }[];
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

function stageIndex(estado: Estado) { return estado === 'EN_ESPERA' ? 0 : estado === 'EN_PROGRESO' ? 1 : 2; }
function badge(status: Estado) { return status === 'EN_ESPERA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : status === 'EN_PROGRESO' ? badgeStyle(COLORS.navySoft, COLORS.navy) : badgeStyle(COLORS.successSoft, COLORS.success); }
function label(status: Estado) { return status === 'EN_ESPERA' ? 'En espera' : status === 'EN_PROGRESO' ? 'En proceso' : 'Terminada'; }
function code(n: number) { return `PQ-${String(n).padStart(4, '0')}`; }
function date(v: string) { return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }); }

function VistaConsejoPageContent() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Pqrs[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Pqrs | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetch('/api/pqrs', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((rows: Pqrs[]) => { if (alive) setData(rows); })
      .catch(() => { if (alive) { setData([]); setError("No se pudieron cargar las PQRS. Intenta de nuevo."); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadKey]);

  const filtered = useMemo(
    () => data.filter((p) => (filter === 'all' || p.estado === filter) && (!search || `${p.numero} ${p.titulo || ''} ${p.asunto || ''} ${p.nombreResidente} ${p.bloque}-${p.apto}`.toLowerCase().includes(search.toLowerCase()))),
    [data, filter, search]
  );
  const selectedSummary = data.find((p) => p.id === selectedId) ?? filtered[0] ?? data[0];
  const detailId = selectedSummary?.id ?? null;

  useEffect(() => {
    if (!detailId) { setDetail(null); setDetailError(""); return; }
    let alive = true;
    setDetailLoading(true);
    setDetailError("");
    fetch('/api/pqrs/' + encodeURIComponent(detailId), { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((row: Pqrs) => { if (alive) setDetail(row); })
      .catch(() => { if (alive) { setDetail(null); setDetailError("No se pudo cargar el detalle de esta PQRS."); } })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [detailId]);

  const selected = detail?.id === detailId ? detail : selectedSummary;

  const metrics = useMemo(() => [
    { label: 'En espera', value: data.filter((r) => r.estado === 'EN_ESPERA').length, color: COLORS.warning },
    { label: 'En proceso', value: data.filter((r) => r.estado === 'EN_PROGRESO').length, color: COLORS.navy },
    { label: 'Terminadas', value: data.filter((r) => r.estado === 'TERMINADO').length, color: COLORS.success },
    { label: 'Total', value: data.length, color: '#1D1D1F' },
  ], [data]);

  const faseActual = selected?.faseActual || 0;
  const faseTipo = selected?.faseTipo || null;

  const seguimiento = useMemo(() => {
    if (!selected) return [] as { label: string; text: string }[];
    const entries: { label: string; text: string }[] = [];
    if (selected.historial?.length) {
      selected.historial.forEach((item) => entries.push({
        label: item.estadoAntes ? label(item.estadoDespues) : 'Solicitud radicada',
        text: item.nota || ('Estado: ' + label(item.estadoDespues)),
      }));
    } else if (selected.notaPrimerContacto) {
      entries.push({ label: 'Primer contacto', text: selected.notaPrimerContacto });
    }
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
    <AdminShell navItems={CONSEJO_NAV} activeKey="pqrs" userName="Consejo" userRole="Consejo de Administración" initials="CM" mobileTitle="PQRS">
      <div className="apl-up" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 3px' }}>Panel de supervisión</h1>
        <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>{loading ? 'Cargando solicitudes…' : `${data.length} solicitudes · solo lectura`}</p>
      </div>

      {error && (
        <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
          <div>{error}</div>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} style={{ marginTop: 10, border: 'none', background: COLORS.danger, color: '#FFFFFF', borderRadius: 999, padding: '8px 14px', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Reintentar</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 10 }}>{m.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título, categoría, residente o ID…" style={{ width: '100%', maxWidth: 420, height: 42, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{ ...tabStyle(filter === f.key), border: 'none', fontFamily: 'inherit' }}>{f.label}</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          {!error && filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>No hay solicitudes que coincidan.</div>}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, flexWrap: isMobile ? 'wrap' : 'nowrap', width: '100%', textAlign: 'left', padding: isMobile ? '14px 16px' : '14px 22px', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer', background: p.id === selected?.id ? COLORS.navySoft : 'transparent', fontFamily: 'inherit' }}
            >
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: p.numeroRadicacion ? COLORS.textMuted : COLORS.warning, width: isMobile ? 'auto' : 84, flexShrink: 0, order: isMobile ? 1 : 0 }}>{p.numeroRadicacion || 'Sin radicar'}</span>
              <span style={{ flex: isMobile ? '1 1 100%' : 1, minWidth: isMobile ? 0 : 120, overflow: 'hidden', order: isMobile ? 3 : 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo || 'Solicitud'}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, marginTop: 2 }}>{p.asunto ? (ASUNTO_LABEL[p.asunto] || p.asunto) : 'Sin categoría'}</div>
              </span>
              <span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, width: isMobile ? 'auto' : 100, flexShrink: 0, order: isMobile ? 4 : 0 }}>{p.nombreResidente}</span>
              <span style={{ ...badge(p.estado), order: isMobile ? 2 : 0 }}>{label(p.estado)}</span>
            </button>
          ))}
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
          {detailError && <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 12 }}>{detailError}</div>}
          {detailLoading && <div style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 12 }}>Cargando detalle...</div>}
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
                  <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>FASE DE GESTIÓN (SOLO LECTURA)</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.navy }}>{faseActual ? `Fase ${faseActual} · ${FASE_LABELS[faseActual]}` : 'Sin iniciar'}</div>
                  {faseTipo && <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 2 }}>Ruta: {faseTipo === 'INSUMOS' ? 'Adquisición de insumos' : 'Gestión con proveedor'}</div>}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>RESIDENTE</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.nombreResidente}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>UBICACIÓN</div><div style={{ fontSize: 13, fontWeight: 700 }}>B{selected.bloque} · Apto {selected.apto}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>RADICADA</div><div style={{ fontSize: 13, fontWeight: 700 }}>{date(selected.fechaRecibido)}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>N.° RADICACIÓN</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.numeroRadicacion || '—'}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>CREADA POR</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.creadoPor?.name || 'Residente'}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>GESTIONADA POR</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.gestionadoPor?.name || 'Sin asignar'}</div></div>
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

              {(selected.fotos?.length || selected.evidenciaArchivoNombre) ? (
                <div style={{ borderTop: '1px solid ' + COLORS.borderSoft, paddingTop: 14, marginBottom: 18 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Evidencias</div>
                  {selected.fotos?.map((foto) => (
                    <a key={foto.id} href={'/api/pqrs/' + encodeURIComponent(selected.id) + '/fotos/' + encodeURIComponent(foto.id)} target="_blank" rel="noreferrer" style={{ display: 'block', color: COLORS.navy, fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{foto.nombre}</a>
                  ))}
                  {selected.evidenciaArchivoNombre && <a href={'/api/pqrs/' + encodeURIComponent(selected.id) + '/evidencia'} target="_blank" rel="noreferrer" style={{ display: 'block', color: COLORS.navy, fontSize: 12.5, fontWeight: 700 }}>Evidencia de cierre: {selected.evidenciaArchivoNombre}</a>}
                </div>
              ) : null}

              <p style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 600, textAlign: 'center', margin: 0 }}>Vista de solo lectura — la gestión de esta solicitud la realiza la administración.</p>
            </>
          ) : <div style={{ color: COLORS.textMuted, fontWeight: 600 }}>Selecciona una PQRS.</div>}
        </div>
      </div>
    </AdminShell>
  );
}

export default function VistaConsejoPage() {
  return (
    <Suspense fallback={null}>
      <VistaConsejoPageContent />
    </Suspense>
  );
}
