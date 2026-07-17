'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/shell/AdminShell';
import { Sheet, CloseButton } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle } from '@/lib/design/tokens';

type Estado = 'EN_ESPERA' | 'EN_PROGRESO' | 'TERMINADO';
type Prioridad = 'ALTA' | 'MEDIA' | 'BAJA';
type Metric = { value: number | null; prev: number | null; deltaPct: number | null; goodDirection: 'up' | 'down'; soportado?: boolean };
type AlertItem = { key: string; level: 'alta' | 'media' | 'baja'; count: number; motivo: string; filterHint: { quick: string; value?: string } };
type TimeGroup = { key: string; count: number; avgCierre: number | null; cumplimientoPct: number | null };
type Series = { label: string; value: number | null };
type DistItem = { label: string; count: number };
type DesempenoRow = { responsable: string; casosAsignados: number; casosCerrados: number; casosPendientes: number; casosVencidos: number; tiempoPromedioPrimerContacto: number | null; tiempoPromedioCierre: number | null; pctCumplimiento: number | null; cargaActual: number; tendenciaDeltaPct: number | null };
type DetalleRow = {
  id: string; numero: number; numeroRadicacion: string | null; fechaRecibido: string; solicitante: string; ubicacion: string; bloque: number;
  categoria: string; subcategoria: string | null; prioridad: Prioridad; estado: Estado; responsable: string | null;
  fechaPrimerContacto: string | null; tiempoPrimerContacto: number | null; ultimaActualizacion: string; fechaCierre: string | null; tiempoCierre: number | null; vencida: boolean;
};
type ReportData = {
  periodo: { from: string; to: string; compareFrom: string; compareTo: string };
  slaDays: number;
  resumen: { total: Metric; abiertas: Metric; enProceso: Metric; cerradas: Metric; vencidas: Metric; tiempoPromedioPrimerContacto: Metric; tiempoPromedioCierre: Metric; pctCumplimiento: Metric; tasaReapertura: Metric };
  alertas: AlertItem[];
  tiempos: { primerContacto: { avg: number | null; median: number | null; min: number | null; max: number | null }; cierre: { avg: number | null; median: number | null; min: number | null; max: number | null }; distribucionCierre: DistItem[]; porCategoria: TimeGroup[]; porPrioridad: TimeGroup[]; porResponsable: TimeGroup[]; pctCumplimiento: number | null; slaDays: number };
  tendencias: { granularity: string; seriesRecibidas: Series[]; seriesCerradas: Series[]; seriesInventario: Series[]; seriesVencidos: Series[]; seriesTiempoPromedio: Series[]; seriesCumplimiento: Series[] };
  distribucion: { porCategoria: DistItem[]; porSubcategoria: DistItem[]; porEstado: DistItem[]; porPrioridad: DistItem[]; porResponsable: DistItem[]; porBloque: DistItem[]; categoriasMayorCrecimiento: { label: string; deltaPct: number; count: number }[]; categoriasMayorTiempoResolucion: TimeGroup[] };
  desempeno: DesempenoRow[];
  detalle: DetalleRow[];
  alertCases: Record<string, DetalleRow[]>;
  hallazgos: string[];
  hayDatosSuficientes: boolean;
  hayComparacionSuficiente: boolean;
  tenantName: string;
  staff: { id: string; name: string }[];
  bloques: number[];
};

const PRESETS = [
  { key: 'last7', label: 'Últimos 7 días' },
  { key: 'last30', label: 'Últimos 30 días' },
  { key: 'thisMonth', label: 'Mes actual' },
  { key: 'lastMonth', label: 'Mes anterior' },
  { key: 'thisQuarter', label: 'Trimestre actual' },
  { key: 'lastQuarter', label: 'Trimestre anterior' },
  { key: 'thisYear', label: 'Año actual' },
  { key: 'lastYear', label: 'Año anterior' },
  { key: 'custom', label: 'Personalizado' },
];
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
const PRESET_LABEL: Record<string, string> = Object.fromEntries(PRESETS.map((p) => [p.key, p.label]));
const PRIORIDAD_LABEL: Record<Prioridad, string> = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };
const ESTADO_LABEL: Record<Estado, string> = { EN_ESPERA: 'Abierta', EN_PROGRESO: 'En proceso', TERMINADO: 'Terminada' };
const ALERT_LABEL: Record<string, string> = { sinAbrir: 'Sin abrir 3+ días', sinCerrar: 'Sin cerrar 5+ días', sinActividad: 'Sin actividad', proximosAVencer: 'Próximos a vencer', vencidos: 'Vencidos' };

function fmtDate(v: string | null) { return v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }
function fmtShort(v: string) { return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }); }
function fmtDays(v: number | null) { return v == null ? '—' : `${v}d`; }

function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} style={{ marginLeft: 5, verticalAlign: 'middle' }}>
      <span style={{ width: 14, height: 14, borderRadius: 999, background: COLORS.neutralSoft, color: COLORS.textSecondaryAlt, fontSize: 9.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}>?</span>
      <span className="info-tip-bubble">{text}</span>
    </span>
  );
}

function DeltaTag({ metric }: { metric: Metric }) {
  if (metric.deltaPct == null) return <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600 }}>Sin comparación</span>;
  const improved = metric.goodDirection === 'down' ? metric.deltaPct < 0 : metric.deltaPct > 0;
  const color = metric.deltaPct === 0 ? COLORS.textMuted : improved ? COLORS.success : COLORS.danger;
  const arrow = metric.deltaPct === 0 ? '·' : metric.deltaPct > 0 ? '▲' : '▼';
  return <span style={{ fontSize: 11, fontWeight: 700, color }}>{arrow} {Math.abs(metric.deltaPct)}% vs. periodo anterior</span>;
}

function MiniBarChart({ data, color, formatValue }: { data: Series[]; color: string; formatValue: (v: number) => string }) {
  const values = data.map((d) => d.value ?? 0);
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, overflowX: 'auto' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: '1 0 18px', minWidth: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 9, fontWeight: 700 }}>{d.value != null ? formatValue(d.value) : '—'}</div>
          <div style={{ width: '100%', maxWidth: 22, height: `${d.value != null ? Math.max(4, (d.value / max) * 100) : 2}%`, background: d.value != null ? color : COLORS.neutralSoft, borderRadius: '4px 4px 0 0' }} />
          <div style={{ fontSize: 8.5, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function DistBars({ items, color = COLORS.navy }: { items: DistItem[]; color?: string }) {
  const total = items.reduce((a, b) => a + b.count, 0) || 1;
  return (
    <div>
      {items.slice(0, 8).map((it) => {
        const pct = Math.round((it.count / total) * 100);
        return (
          <div key={it.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{it.label}</span>
              <span style={{ color: COLORS.textMuted }}>{it.count} ({pct}%)</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: COLORS.bgCard, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const card: React.CSSProperties = { background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20 };
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 800, margin: '0 0 4px' };
const sectionSubtitle: React.CSSProperties = { fontSize: 12, color: COLORS.textSecondary, margin: '0 0 16px' };
const selectStyle: React.CSSProperties = { height: 38, padding: '0 10px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 9, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', background: '#FFFFFF' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 };
const controlPillStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: `1.5px solid ${COLORS.inputBorder}`, background: '#FFFFFF', color: '#1D1D1F', fontSize: 12.5, fontWeight: 700, padding: '9px 14px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };

export default function ModuloReportesPage() {
  const { toast, showToast } = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [preset, setPreset] = useState('last30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [comparisonMode, setComparisonMode] = useState<'previous' | 'lastYear'>('previous');
  const [estado, setEstado] = useState('');
  const [asunto, setAsunto] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [bloque, setBloque] = useState('');
  const [gestionadoPorId, setGestionadoPorId] = useState('');
  const [cumplimiento, setCumplimiento] = useState('');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [quickFilter, setQuickFilter] = useState<{ key: string; label: string } | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [sortKey, setSortKey] = useState<'fecha' | 'tiempoCierre'>('fecha');

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfType, setPdfType] = useState<'ejecutivo' | 'completo' | 'detallado'>('completo');
  const [exporting, setExporting] = useState(false);

  const buildParams = () => {
    const p = new URLSearchParams();
    p.set('preset', preset);
    if (preset === 'custom') { if (customFrom) p.set('from', customFrom); if (customTo) p.set('to', customTo); }
    p.set('comparisonMode', comparisonMode);
    p.set('granularity', 'month');
    if (estado) p.set('estado', estado);
    if (asunto) p.set('asunto', asunto);
    if (prioridad) p.set('prioridad', prioridad);
    if (bloque) p.set('bloque', bloque);
    if (gestionadoPorId) p.set('gestionadoPorId', gestionadoPorId);
    if (cumplimiento) p.set('cumplimiento', cumplimiento);
    return p;
  };

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = buildParams();
      fetch('/api/reportes?' + params.toString(), { cache: 'no-store', signal: controller.signal })
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((d: ReportData) => { setData(d); setQuickFilter(null); })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === 'AbortError') return;
          setError('No se pudieron cargar los reportes. Intenta de nuevo.');
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo, comparisonMode, estado, asunto, prioridad, bloque, gestionadoPorId, cumplimiento]);

  function resetFilters() {
    setPreset('last30'); setCustomFrom(''); setCustomTo(''); setComparisonMode('previous');
    setEstado(''); setAsunto(''); setPrioridad(''); setBloque(''); setGestionadoPorId(''); setCumplimiento('');
  }

  const activeChips = [
    estado && { key: 'estado', label: `Estado: ${ESTADO_LABEL[estado as Estado]}`, clear: () => setEstado('') },
    asunto && { key: 'asunto', label: `Categoría: ${ASUNTOS.find((a) => a.value === asunto)?.label || asunto}`, clear: () => setAsunto('') },
    prioridad && { key: 'prioridad', label: `Prioridad: ${PRIORIDAD_LABEL[prioridad as Prioridad]}`, clear: () => setPrioridad('') },
    bloque && { key: 'bloque', label: `Bloque ${bloque}`, clear: () => setBloque('') },
    gestionadoPorId && { key: 'resp', label: `Responsable: ${data?.staff.find((s) => s.id === gestionadoPorId)?.name || ''}`, clear: () => setGestionadoPorId('') },
    cumplimiento && { key: 'cump', label: cumplimiento === 'dentro' ? 'Dentro de tiempo' : 'Fuera de tiempo', clear: () => setCumplimiento('') },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
  const activeFilterCount = activeChips.length;

  function openAlert(a: AlertItem) {
    if (!data?.alertCases[a.filterHint.quick]) return;
    setQuickFilter({ key: a.filterHint.quick, label: ALERT_LABEL[a.filterHint.quick] || a.key });
    setTimeout(() => document.getElementById('tabla-detallada')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  const q = tableSearch.trim().toLowerCase();
  const filteredTableRows = useMemo(() => {
    const tableRows = quickFilter ? (data?.alertCases[quickFilter.key] || []) : (data?.detalle || []);
    const rows = tableRows.filter((r) => !q || `${r.numeroRadicacion || r.numero} ${r.solicitante} ${r.categoria}`.toLowerCase().includes(q));
    return [...rows].sort((a, b) => sortKey === 'fecha' ? new Date(b.fechaRecibido).getTime() - new Date(a.fechaRecibido).getTime() : (b.tiempoCierre ?? -1) - (a.tiempoCierre ?? -1));
  }, [data, quickFilter, q, sortKey]);

  async function downloadExcel() {
    setExporting(true);
    try {
      const params = buildParams();
      const res = await fetch(`/api/reportes/excel?${params.toString()}`);
      if (!res.ok) { const body = await res.json().catch(() => null); showToast(body?.error || 'No se pudo generar el Excel'); return; }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = match?.[1] || 'reporte-pqrs.xlsx'; a.click();
      URL.revokeObjectURL(url);
      showToast('Excel generado ✓');
    } finally { setExporting(false); }
  }

  async function downloadPdf() {
    setExporting(true);
    try {
      const params = buildParams();
      params.set('type', pdfType);
      const res = await fetch(`/api/reportes/pdf?${params.toString()}`);
      if (!res.ok) { const body = await res.json().catch(() => null); showToast(body?.error || 'No se pudo generar el PDF'); return; }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = match?.[1] || 'reporte-pqrs.pdf'; a.click();
      URL.revokeObjectURL(url);
      setPdfOpen(false);
      showToast('PDF generado ✓');
    } finally { setExporting(false); }
  }

  const RED_ALERT_KEYS = new Set(['vencidos', 'sinAbrir', 'sinCerrar']);
  const redAlerts = data?.alertas.filter((a) => RED_ALERT_KEYS.has(a.key)) || [];
  const yellowAlerts = data?.alertas.filter((a) => !RED_ALERT_KEYS.has(a.key)) || [];

  const resumenCards = data ? [
    { label: 'Total recibidas', metric: data.resumen.total, desc: 'Cantidad total de PQRS radicadas dentro del periodo seleccionado.' },
    { label: 'Abiertas', metric: data.resumen.abiertas, desc: 'PQRS que aún no han tenido primer contacto del equipo administrativo.' },
    { label: 'En proceso', metric: data.resumen.enProceso, desc: 'PQRS con primer contacto ya registrado, en gestión activa hacia el cierre.' },
    { label: 'Cerradas', metric: data.resumen.cerradas, desc: 'PQRS que ya fueron cerradas dentro del periodo seleccionado.' },
    { label: 'Vencidas', metric: data.resumen.vencidas, desc: `PQRS que superaron el tiempo esperado de ${data.slaDays} días sin resolverse.` },
    { label: 'T. prom. primer contacto', metric: data.resumen.tiempoPromedioPrimerContacto, suffix: 'd', desc: 'Días promedio entre la radicación de la PQRS y el primer contacto del equipo.' },
    { label: 'T. prom. de cierre', metric: data.resumen.tiempoPromedioCierre, suffix: 'd', desc: 'Días promedio entre la radicación de la PQRS y su cierre definitivo.' },
    { label: '% Cumplimiento', metric: data.resumen.pctCumplimiento, suffix: '%', desc: `Porcentaje de PQRS cerradas dentro del tiempo esperado (${data.slaDays} días).` },
  ] : [];

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="reportes" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Reportes">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 3px' }}>Reportes de PQRS</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>Centro de control para entender qué pasa en tu conjunto y decidir con datos</p>
          {data && <p style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 600, margin: '4px 0 0' }}>Periodo: {fmtDate(data.periodo.from)} — {fmtDate(new Date(new Date(data.periodo.to).getTime() - 1).toISOString())}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={downloadExcel} disabled={exporting || !data?.hayDatosSuficientes} style={{ border: `1.5px solid ${COLORS.inputBorder}`, background: 'none', fontSize: 12.5, fontWeight: 700, padding: '10px 16px', borderRadius: RADIUS.pill, cursor: 'pointer', color: '#1D1D1F', fontFamily: 'inherit' }}>Excel</button>
          <button type="button" onClick={() => setPdfOpen(true)} disabled={!data?.hayDatosSuficientes} style={{ border: 'none', background: COLORS.navy, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '10px 16px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' }}>PDF</button>
        </div>
      </div>

      {/* Controles: periodo + filtros, compactos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 0 12px' }}>
        <button type="button" onClick={() => setPeriodOpen(true)} style={controlPillStyle}>
          <span style={{ opacity: 0.6 }}>📅</span> {PRESET_LABEL[preset] || 'Periodo'} <span style={{ opacity: 0.5 }}>▾</span>
        </button>
        <button type="button" onClick={() => setFiltersOpen(true)} style={controlPillStyle}>
          <span style={{ opacity: 0.6 }}>⚙</span> Filtros{activeFilterCount > 0 && <span style={{ background: COLORS.navy, color: '#FFF', borderRadius: 999, fontSize: 10.5, fontWeight: 800, padding: '1px 6px', marginLeft: 2 }}>{activeFilterCount}</span>} <span style={{ opacity: 0.5 }}>▾</span>
        </button>
        {activeFilterCount > 0 && <button type="button" onClick={resetFilters} style={{ border: 'none', background: 'none', color: COLORS.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Limpiar todo</button>}
      </div>

      {activeChips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {activeChips.map((c) => (
            <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: COLORS.navySoft, color: COLORS.navy, fontSize: 11.5, fontWeight: 700, padding: '5px 6px 5px 12px', borderRadius: RADIUS.pill }}>
              {c.label}
              <button type="button" onClick={c.clear} style={{ border: 'none', background: 'rgba(18,37,69,0.12)', color: COLORS.navy, borderRadius: 999, width: 16, height: 16, fontSize: 10, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            </span>
          ))}
        </div>
      )}

      <Sheet open={periodOpen} onClose={() => setPeriodOpen(false)} maxWidth={420}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Periodo y comparación</h2>
          <CloseButton onClick={() => setPeriodOpen(false)} />
        </div>
        <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: '0 0 18px' }}>Todas las métricas, gráficas y tablas se actualizan según lo que elijas aquí.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPreset(p.key)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', border: 'none', background: preset === p.key ? COLORS.navySoft : 'none', color: preset === p.key ? COLORS.navy : '#1D1D1F', fontSize: 13, fontWeight: preset === p.key ? 800 : 600, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p.label}{preset === p.key && <span>✓</span>}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...selectStyle, flex: 1, height: 42 }} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...selectStyle, flex: 1, height: 42 }} />
          </div>
        )}
        <label style={labelStyle}>Comparar con</label>
        <select value={comparisonMode} onChange={(e) => setComparisonMode(e.target.value as 'previous' | 'lastYear')} style={{ ...selectStyle, width: '100%', height: 42 }}>
          <option value="previous">Periodo anterior</option>
          <option value="lastYear">Mismo periodo año anterior</option>
        </select>
      </Sheet>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} maxWidth={420}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Filtros</h2>
          <CloseButton onClick={() => setFiltersOpen(false)} />
        </div>
        <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: '0 0 18px' }}>Acota el reporte por estado, categoría, prioridad, bloque o responsable.</p>
        <label style={labelStyle}>Estado</label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ ...selectStyle, width: '100%', height: 42, marginBottom: 14 }}>
          <option value="">Todos los estados</option>
          <option value="EN_ESPERA">Abiertas</option>
          <option value="EN_PROGRESO">En proceso</option>
          <option value="TERMINADO">Terminadas</option>
        </select>
        <label style={labelStyle}>Categoría</label>
        <select value={asunto} onChange={(e) => setAsunto(e.target.value)} style={{ ...selectStyle, width: '100%', height: 42, marginBottom: 14 }}>
          <option value="">Todas las categorías</option>
          {ASUNTOS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <label style={labelStyle}>Prioridad</label>
        <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} style={{ ...selectStyle, width: '100%', height: 42, marginBottom: 14 }}>
          <option value="">Toda prioridad</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Media</option>
          <option value="BAJA">Baja</option>
        </select>
        <label style={labelStyle}>Bloque</label>
        <select value={bloque} onChange={(e) => setBloque(e.target.value)} style={{ ...selectStyle, width: '100%', height: 42, marginBottom: 14 }}>
          <option value="">Todos los bloques</option>
          {(data?.bloques || []).map((b) => <option key={b} value={String(b)}>Bloque {b}</option>)}
        </select>
        <label style={labelStyle}>Responsable</label>
        <select value={gestionadoPorId} onChange={(e) => setGestionadoPorId(e.target.value)} style={{ ...selectStyle, width: '100%', height: 42, marginBottom: 14 }}>
          <option value="">Todo responsable</option>
          {(data?.staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label style={labelStyle}>Cumplimiento</label>
        <select value={cumplimiento} onChange={(e) => setCumplimiento(e.target.value)} style={{ ...selectStyle, width: '100%', height: 42, marginBottom: 20 }}>
          <option value="">Todos</option>
          <option value="dentro">Dentro de tiempo</option>
          <option value="fuera">Fuera de tiempo</option>
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={resetFilters} style={{ flex: 1, border: `1.5px solid ${COLORS.inputBorder}`, background: 'none', color: '#1D1D1F', fontSize: 13, fontWeight: 700, padding: '12px 0', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' }}>Restablecer</button>
          <button type="button" onClick={() => setFiltersOpen(false)} style={{ flex: 1, border: 'none', background: COLORS.navy, color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '12px 0', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' }}>Aplicar</button>
        </div>
      </Sheet>

      {loading && <div style={{ textAlign: 'center', padding: '60px 0', color: COLORS.textMuted, fontSize: 13.5 }}>Cargando reportes…</div>}
      {!loading && error && <div style={{ textAlign: 'center', padding: '60px 0', color: COLORS.danger, fontSize: 13.5 }}>{error}</div>}
      {!loading && !error && data && !data.hayDatosSuficientes && (
        <div style={{ ...card, textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>No hay datos para el periodo y filtros seleccionados.</div>
      )}

      {!loading && !error && data && data.hayDatosSuficientes && (
        <>
          {/* A. Resumen ejecutivo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {resumenCards.map((c) => (
              <div key={c.label} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 16 }}>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 8 }}>{c.label}<InfoTip text={c.desc} /></div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{c.metric.value == null ? '—' : `${c.metric.value}${c.suffix || ''}`}</div>
                <DeltaTag metric={c.metric} />
              </div>
            ))}
          </div>

          {/* B. Alertas */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={sectionTitle}>Centro de alertas y acciones prioritarias</div>
            <p style={sectionSubtitle}>Situaciones que requieren atención ahora, no solo información</p>
            {data.alertas.length === 0 ? (
              <div style={{ background: COLORS.successSoft, color: COLORS.success, borderRadius: 12, padding: '14px 16px', fontSize: 13, fontWeight: 600 }}>No hay alertas críticas para el periodo seleccionado. La operación se encuentra dentro de los tiempos esperados.</div>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 800, color: COLORS.danger, marginBottom: 10 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: COLORS.danger, marginRight: 8, flexShrink: 0 }} />
                    Solicitudes en alerta roja
                    <InfoTip text="Casos extremos: ya vencieron el tiempo esperado, llevan 3+ días sin primer contacto, o llevan 5+ días en proceso sin poderse cerrar. Requieren acción inmediata." />
                  </div>
                  {redAlerts.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: COLORS.textMuted }}>Sin alertas rojas en este periodo.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {redAlerts.map((a) => (
                        <button key={a.key} type="button" onClick={() => openAlert(a)} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', border: 'none', background: COLORS.dangerSoft, borderRadius: 12, padding: '12px 16px', cursor: data.alertCases[a.filterHint.quick] ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.danger, width: 30, flexShrink: 0 }}>{a.count}</span>
                          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{a.motivo}</span>
                          {data.alertCases[a.filterHint.quick] && <span style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.danger, flexShrink: 0 }}>Ver casos ›</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 800, color: COLORS.warning, marginBottom: 10 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: COLORS.warning, marginRight: 8, flexShrink: 0 }} />
                    Alertas amarillas
                    <InfoTip text="Situaciones que empiezan a ser preocupantes pero aún no son críticas: casos cerca de vencer, sin actividad reciente, sobrecarga de un responsable, o un aumento inusual en alguna categoría." />
                  </div>
                  {yellowAlerts.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: COLORS.textMuted }}>Sin alertas amarillas en este periodo.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {yellowAlerts.map((a) => (
                        <button key={a.key} type="button" onClick={() => openAlert(a)} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', border: 'none', background: COLORS.warningSoft, borderRadius: 12, padding: '12px 16px', cursor: data.alertCases[a.filterHint.quick] ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.warning, width: 30, flexShrink: 0 }}>{a.count}</span>
                          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{a.motivo}</span>
                          {data.alertCases[a.filterHint.quick] && <span style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.warning, flexShrink: 0 }}>Ver casos ›</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* C. Tiempos de atención */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={sectionTitle}>Tiempos de atención</div>
            <p style={sectionSubtitle}>SLA esperado: {data.slaDays} días para cierre</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700 }}>PRIMER CONTACTO — PROMEDIO<InfoTip text="Días promedio entre la radicación y el primer contacto del equipo." /></div><div style={{ fontSize: 18, fontWeight: 800 }}>{fmtDays(data.tiempos.primerContacto.avg)}</div></div>
              <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700 }}>MEDIANA<InfoTip text="El valor central: la mitad de los casos tardó menos, la otra mitad tardó más. Menos sensible a casos extremos que el promedio." /></div><div style={{ fontSize: 18, fontWeight: 800 }}>{fmtDays(data.tiempos.primerContacto.median)}</div></div>
              <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700 }}>MÍN / MÁX</div><div style={{ fontSize: 18, fontWeight: 800 }}>{fmtDays(data.tiempos.primerContacto.min)} / {fmtDays(data.tiempos.primerContacto.max)}</div></div>
              <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700 }}>% CUMPLIMIENTO<InfoTip text={`Porcentaje de PQRS cerradas dentro del tiempo esperado (${data.slaDays} días).`} /></div><div style={{ fontSize: 18, fontWeight: 800, color: COLORS.success }}>{data.tiempos.pctCumplimiento != null ? `${data.tiempos.pctCumplimiento}%` : '—'}</div></div>
              <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700 }}>CIERRE — PROMEDIO<InfoTip text="Días promedio entre la radicación y el cierre definitivo de la PQRS." /></div><div style={{ fontSize: 18, fontWeight: 800 }}>{fmtDays(data.tiempos.cierre.avg)}</div></div>
              <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700 }}>MEDIANA</div><div style={{ fontSize: 18, fontWeight: 800 }}>{fmtDays(data.tiempos.cierre.median)}</div></div>
              <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700 }}>MÍN / MÁX</div><div style={{ fontSize: 18, fontWeight: 800 }}>{fmtDays(data.tiempos.cierre.min)} / {fmtDays(data.tiempos.cierre.max)}</div></div>
              <div>
                <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>DISTRIBUCIÓN DE CIERRE<InfoTip text="Cuántos casos cerraron en menos de 3 días, entre 3-7 días, o en más de 7 días." /></div>
                <div style={{ display: 'flex', gap: 4 }}>{data.tiempos.distribucionCierre.map((b) => <span key={b.label} title={b.label} style={{ fontSize: 10, fontWeight: 700, background: COLORS.bgCard, borderRadius: 6, padding: '4px 6px' }}>{b.count}</span>)}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Por categoría</div>{data.tiempos.porCategoria.slice(0, 6).map((t) => <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}><span>{t.key}</span><span style={{ fontWeight: 700 }}>{fmtDays(t.avgCierre)}</span></div>)}</div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Por prioridad</div>{data.tiempos.porPrioridad.map((t) => <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}><span>{PRIORIDAD_LABEL[t.key as Prioridad] || t.key}</span><span style={{ fontWeight: 700 }}>{fmtDays(t.avgCierre)}</span></div>)}</div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Por responsable</div>{data.tiempos.porResponsable.slice(0, 6).map((t) => <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}><span>{t.key}</span><span style={{ fontWeight: 700 }}>{fmtDays(t.avgCierre)}</span></div>)}</div>
            </div>
          </div>

          {/* D. Tendencias */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={sectionTitle}>Tendencias y evolución</div>
            <p style={sectionSubtitle}>Vista mensual</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Recibidas por periodo<InfoTip text="Cuántas PQRS nuevas llegaron cada mes." /></div><MiniBarChart data={data.tendencias.seriesRecibidas} color={COLORS.navy} formatValue={(v) => String(v)} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Cerradas por periodo<InfoTip text="Cuántas PQRS se cerraron cada mes, sin importar cuándo se recibieron." /></div><MiniBarChart data={data.tendencias.seriesCerradas} color={COLORS.success} formatValue={(v) => String(v)} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Inventario de casos abiertos<InfoTip text="Cuántos casos seguían abiertos (sin cerrar) al final de cada mes." /></div><MiniBarChart data={data.tendencias.seriesInventario} color={COLORS.warning} formatValue={(v) => String(v)} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Casos vencidos en el tiempo<InfoTip text={`Casos que ya superaban los ${data.slaDays} días esperados y seguían abiertos al final de cada mes.`} /></div><MiniBarChart data={data.tendencias.seriesVencidos} color={COLORS.danger} formatValue={(v) => String(v)} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Tiempo promedio de cierre<InfoTip text="Promedio de días para cerrar los casos que se cerraron en cada mes." /></div><MiniBarChart data={data.tendencias.seriesTiempoPromedio} color={COLORS.navy} formatValue={(v) => `${v}d`} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>% Cumplimiento<InfoTip text={`Porcentaje de los cierres de cada mes que se lograron dentro de los ${data.slaDays} días esperados.`} /></div><MiniBarChart data={data.tendencias.seriesCumplimiento} color={COLORS.success} formatValue={(v) => `${v}%`} /></div>
            </div>
          </div>

          {/* E. Distribución */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={sectionTitle}>Distribución y causas principales</div>
            <p style={sectionSubtitle}>De qué se trata lo que llega, y dónde</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Por categoría</div><DistBars items={data.distribucion.porCategoria} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Por bloque</div><DistBars items={data.distribucion.porBloque} color={COLORS.success} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Por prioridad</div><DistBars items={data.distribucion.porPrioridad.map((p) => ({ label: PRIORIDAD_LABEL[p.label as Prioridad] || p.label, count: p.count }))} color={COLORS.warning} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Por responsable</div><DistBars items={data.distribucion.porResponsable} color={COLORS.navy} /></div>
              {data.distribucion.porSubcategoria.length > 0 && <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Por subcategoría</div><DistBars items={data.distribucion.porSubcategoria} /></div>}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Mayor crecimiento / mayor tiempo de resolución</div>
                {data.distribucion.categoriasMayorCrecimiento.length === 0 && data.distribucion.categoriasMayorTiempoResolucion.length === 0 && <p style={{ fontSize: 12, color: COLORS.textMuted }}>Sin hallazgos suficientes en este periodo.</p>}
                {data.distribucion.categoriasMayorCrecimiento.map((c) => <div key={c.label} style={{ fontSize: 12, padding: '5px 0' }}>📈 {c.label} — creció {c.deltaPct}%</div>)}
                {data.distribucion.categoriasMayorTiempoResolucion.slice(0, 3).map((c) => <div key={c.key} style={{ fontSize: 12, padding: '5px 0' }}>⏱ {c.key} — {fmtDays(c.avgCierre)} promedio</div>)}
              </div>
            </div>
          </div>

          {/* F. Desempeño operativo */}
          <div style={{ ...card, marginBottom: 20, overflowX: 'auto' }}>
            <div style={sectionTitle}>Desempeño operativo</div>
            <p style={sectionSubtitle}>Carga y cumplimiento por responsable — no es una tabla punitiva, es para balancear el trabajo</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
              <thead><tr style={{ textAlign: 'left', color: COLORS.textMuted, fontSize: 10.5 }}>
                <th style={{ padding: '6px 8px' }}>RESPONSABLE</th><th>ASIGNADOS</th><th>CERRADOS</th><th>PENDIENTES<InfoTip text="Casos que este responsable tiene actualmente sin cerrar, sin importar cuándo se recibieron." /></th><th>VENCIDOS<InfoTip text="De sus casos pendientes, cuántos ya superaron el tiempo esperado." /></th><th>% CUMPL.<InfoTip text="De sus casos cerrados en el periodo, qué porcentaje se cerró a tiempo." /></th><th>TENDENCIA<InfoTip text="Variación en la cantidad de casos cerrados frente al periodo anterior." /></th>
              </tr></thead>
              <tbody>
                {data.desempeno.map((d) => (
                  <tr key={d.responsable} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{d.responsable}</td>
                    <td>{d.casosAsignados}</td>
                    <td>{d.casosCerrados}</td>
                    <td>{d.casosPendientes}</td>
                    <td style={{ color: d.casosVencidos > 0 ? COLORS.danger : undefined, fontWeight: d.casosVencidos > 0 ? 700 : 400 }}>{d.casosVencidos}</td>
                    <td>{d.pctCumplimiento != null ? `${d.pctCumplimiento}%` : '—'}</td>
                    <td>{d.tendenciaDeltaPct != null ? `${d.tendenciaDeltaPct > 0 ? '+' : ''}${d.tendenciaDeltaPct}%` : '—'}</td>
                  </tr>
                ))}
                {data.desempeno.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: COLORS.textMuted }}>Sin casos asignados en este periodo.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Hallazgos */}
          {data.hallazgos.length > 0 && (
            <div style={{ ...card, marginBottom: 20, background: COLORS.navySoft, border: 'none' }}>
              <div style={{ ...sectionTitle, color: COLORS.navy }}>Hallazgos e interpretación</div>
              {data.hallazgos.map((h, i) => <div key={i} style={{ fontSize: 12.5, color: COLORS.navy, padding: '4px 0', fontWeight: 600 }}>• {h}</div>)}
            </div>
          )}

          {/* G. Tabla detallada */}
          <div id="tabla-detallada" style={{ ...card, overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
              <div style={sectionTitle}>Tabla detallada {quickFilter ? `— ${quickFilter.label}` : ''}</div>
              {quickFilter && <button type="button" onClick={() => setQuickFilter(null)} style={{ border: 'none', background: 'none', color: COLORS.navy, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Quitar filtro de alerta ✕</button>}
            </div>
            <p style={sectionSubtitle}>{filteredTableRows.length} casos — se exporta según los filtros del panel superior</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Buscar por radicación, solicitante o categoría…" style={{ ...selectStyle, flex: 1, minWidth: 220 }} />
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as 'fecha' | 'tiempoCierre')} style={selectStyle}>
                <option value="fecha">Ordenar: más reciente</option>
                <option value="tiempoCierre">Ordenar: tiempo de cierre</option>
              </select>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
              <thead><tr style={{ textAlign: 'left', color: COLORS.textMuted, fontSize: 10 }}>
                <th style={{ padding: '6px 8px' }}>RADICACIÓN</th><th>FECHA</th><th>SOLICITANTE</th><th>UBICACIÓN</th><th>CATEGORÍA</th><th>PRIORIDAD</th><th>ESTADO</th><th>RESPONSABLE</th><th>T. CIERRE</th><th>CUMPLIMIENTO</th><th></th>
              </tr></thead>
              <tbody>
                {filteredTableRows.slice(0, 200).map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                    <td style={{ padding: '8px', fontFamily: "'JetBrains Mono', monospace" }}>{r.numeroRadicacion || `#${r.numero}`}</td>
                    <td>{fmtShort(r.fechaRecibido)}</td>
                    <td style={{ fontWeight: 700 }}>{r.solicitante}</td>
                    <td>{r.ubicacion}</td>
                    <td>{r.categoria}</td>
                    <td>{PRIORIDAD_LABEL[r.prioridad]}</td>
                    <td><span style={r.estado === 'EN_ESPERA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : r.estado === 'EN_PROGRESO' ? badgeStyle(COLORS.navySoft, COLORS.navy) : badgeStyle(COLORS.successSoft, COLORS.success)}>{ESTADO_LABEL[r.estado]}</span></td>
                    <td>{r.responsable || 'Sin asignar'}</td>
                    <td>{fmtDays(r.tiempoCierre)}</td>
                    <td>{r.vencida ? <span style={badgeStyle(COLORS.dangerSoft, COLORS.danger)}>Vencida</span> : <span style={badgeStyle(COLORS.successSoft, COLORS.success)}>En tiempo</span>}</td>
                    <td><Link href={`/admin/pqrs?id=${r.id}`} style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.navy, whiteSpace: 'nowrap' }}>Ver en PQRS ›</Link></td>
                  </tr>
                ))}
                {filteredTableRows.length === 0 && <tr><td colSpan={11} style={{ padding: 30, textAlign: 'center', color: COLORS.textMuted }}>No hay casos que coincidan.</td></tr>}
              </tbody>
            </table>
            {filteredTableRows.length > 200 && <p style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 10 }}>Mostrando los primeros 200 de {filteredTableRows.length} casos. Usa un filtro más específico o exporta a Excel/PDF para ver todo.</p>}
          </div>
        </>
      )}

      <Sheet open={pdfOpen} onClose={() => setPdfOpen(false)} maxWidth={420}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Exportar a PDF</h2>
          <CloseButton onClick={() => setPdfOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>Elige el nivel de detalle del documento.</p>
        {[
          { key: 'ejecutivo', label: 'Ejecutivo', desc: 'Resumen, alertas y hallazgos — ideal para el consejo' },
          { key: 'completo', label: 'Completo', desc: 'Ejecutivo + análisis por categoría y desempeño' },
          { key: 'detallado', label: 'Detallado', desc: 'Completo + tabla con todos los casos' },
        ].map((opt) => (
          <button key={opt.key} type="button" onClick={() => setPdfType(opt.key as 'ejecutivo' | 'completo' | 'detallado')} style={{ display: 'block', width: '100%', textAlign: 'left', border: `1.5px solid ${pdfType === opt.key ? COLORS.navy : COLORS.inputBorder}`, background: pdfType === opt.key ? COLORS.navySoft : 'none', borderRadius: 12, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: pdfType === opt.key ? COLORS.navy : '#1D1D1F' }}>{opt.label}</div>
            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 2 }}>{opt.desc}</div>
          </button>
        ))}
        <button type="button" onClick={downloadPdf} disabled={exporting} style={{ width: '100%', border: 'none', font: 'inherit', background: COLORS.navy, color: '#FFFFFF', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', marginTop: 8 }}>{exporting ? 'Generando…' : 'Descargar PDF'}</button>
      </Sheet>

      <Toast message={toast} />
    </AdminShell>
  );
}
