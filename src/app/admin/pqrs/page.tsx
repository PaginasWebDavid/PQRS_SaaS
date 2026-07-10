'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/shell/AdminShell';
import { Sheet, CloseButton } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/design/tokens';

type Estado = 'EN_ESPERA' | 'EN_PROGRESO' | 'TERMINADO';
type Pqrs = {
  id: string; numero: number; asunto?: string | null; descripcion: string; nombreResidente: string;
  bloque: number; apto: number; estado: Estado; fechaRecibido: string; faseActual?: number | null;
  notaPrimerContacto?: string | null; accionTomada?: string | null; evidenciaCierre?: string | null;
  creadoPor?: { name?: string | null } | null;
};

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'EN_ESPERA', label: 'Abiertas' },
  { key: 'EN_PROGRESO', label: 'En proceso' },
  { key: 'TERMINADO', label: 'Terminadas' },
];
// Real 3-state status system (matches prisma `Estado` enum). No 5-stage stepper exists in the schema.
const STAGE_LABELS = ['Abierta', 'En proceso', 'Terminada'];

function stageIndex(estado: Estado) { return estado === 'EN_ESPERA' ? 0 : estado === 'EN_PROGRESO' ? 1 : 2; }
function badge(status: Estado) { return status === 'EN_ESPERA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : status === 'EN_PROGRESO' ? badgeStyle(COLORS.navySoft, COLORS.navy) : badgeStyle(COLORS.successSoft, COLORS.success); }
function label(status: Estado) { return status === 'EN_ESPERA' ? 'Abierta' : status === 'EN_PROGRESO' ? 'En proceso' : 'Terminada'; }
function code(n: number) { return `PQ-${String(n).padStart(4, '0')}`; }
function date(v: string) { return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }); }

export default function ModuloPqrsPage() {
  const [data, setData] = useState<Pqrs[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newResident, setNewResident] = useState('');
  const [newBloque, setNewBloque] = useState('');
  const [newApto, setNewApto] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();

  async function load() { setLoading(true); const res = await fetch('/api/pqrs'); if (res.ok) setData(await res.json()); setLoading(false); }
  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const filtered = useMemo(() => data.filter((p) => (filter === 'all' || p.estado === filter) && (!search || `${p.numero} ${p.asunto || ''} ${p.nombreResidente} ${p.bloque}-${p.apto}`.toLowerCase().includes(search.toLowerCase()))), [data, filter, search]);
  const selected = data.find((p) => p.id === selectedId) ?? filtered[0] ?? data[0];

  async function advance(id: string, current: Estado) {
    const next: Estado = current === 'EN_ESPERA' ? 'EN_PROGRESO' : 'TERMINADO';
    const body = next === 'TERMINADO' ? { estado: next, queSeHizoParaCerrar: 'Cierre registrado desde el panel admin.', accionTomada: 'Gestión finalizada.' } : { estado: next, notaPrimerContacto: 'Primer contacto registrado desde el panel admin.' };
    const res = await fetch(`/api/pqrs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { showToast('No se pudo actualizar la PQRS'); return; }
    await load(); showToast('Estado actualizado ✓');
  }

  async function submitCreate() {
    if (!newDescription.trim() || !newResident.trim() || !newBloque || !newApto) return;
    const res = await fetch('/api/pqrs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asunto: newSubject, descripcion: newDescription, nombreResidente: newResident, bloque: newBloque, apto: newApto }) });
    if (!res.ok) { const err = await res.json().catch(() => null); showToast(err?.error || 'No se pudo crear la PQRS'); return; }
    const created = await res.json(); setCreateOpen(false); setNewSubject(''); setNewDescription(''); setNewResident(''); setNewBloque(''); setNewApto(''); await load(); setSelectedId(created.id); showToast('PQRS creada ✓');
  }

  // Real static follow-up fields — not a fake growing history/notes list. Only what the schema actually has.
  const seguimiento = useMemo(() => {
    if (!selected) return [] as { label: string; text: string }[];
    const entries: { label: string; text: string }[] = [];
    if (selected.notaPrimerContacto) entries.push({ label: 'Primer contacto', text: selected.notaPrimerContacto });
    if (selected.estado === 'TERMINADO') {
      if (selected.accionTomada) entries.push({ label: 'Acción tomada', text: selected.accionTomada });
      if (selected.evidenciaCierre) entries.push({ label: 'Evidencia de cierre', text: selected.evidenciaCierre });
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
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 66, flexShrink: 0 }}>{code(p.numero)}</span>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1D1D1F' }}>{p.asunto || 'Solicitud'}</span>
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
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 18px' }}>{selected.asunto || 'Solicitud'}</h3>

              {/* Compressed 3-position stepper (Abierta -> En proceso -> Terminada) — visual only, driven by the real `estado` enum. No 5-stage/priority fields exist in the schema. */}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>RESIDENTE</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.nombreResidente}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>UBICACIÓN</div><div style={{ fontSize: 13, fontWeight: 700 }}>B{selected.bloque} · Apto {selected.apto}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>RADICADA</div><div style={{ fontSize: 13, fontWeight: 700 }}>{date(selected.fechaRecibido)}</div></div>
                <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>FASE</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.faseActual || 'Sin fase'}</div></div>
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

              <div style={{ display: 'flex', gap: 8 }}>
                {selected.estado !== 'TERMINADO'
                  ? <button type="button" onClick={() => advance(selected.id, selected.estado)} style={{ flex: 1, textAlign: 'center', background: COLORS.navy, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Avanzar estado</button>
                  : <div style={{ flex: 1, textAlign: 'center', background: COLORS.bgCard, color: COLORS.textMuted, fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill }}>Terminada</div>}
                <Link href={`/pqrs/${selected.id}`} style={{ flex: 1, textAlign: 'center', background: COLORS.bgCard, color: '#1D1D1F', fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill }}>Detalle completo</Link>
              </div>
            </>
          ) : <div style={{ color: COLORS.textMuted, fontWeight: 600 }}>Selecciona una PQRS.</div>}
        </div>
      </div>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={460}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Crear PQRS</div>
          <CloseButton onClick={() => setCreateOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 22px' }}>Radica una nueva solicitud real en la base de datos.</p>
        <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Asunto" style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Descripción" rows={4} style={{ width: '100%', padding: '12px 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <input value={newResident} onChange={(e) => setNewResident(e.target.value)} placeholder="Nombre del residente" style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <input value={newBloque} onChange={(e) => setNewBloque(e.target.value)} placeholder="Bloque" type="number" style={{ height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit' }} />
          <input value={newApto} onChange={(e) => setNewApto(e.target.value)} placeholder="Apto" type="number" style={{ height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit' }} />
        </div>
        <button type="button" onClick={submitCreate} style={{ width: '100%', textAlign: 'center', background: COLORS.navy, color: '#FFFFFF', fontSize: 13, fontWeight: 600, padding: '12px 0', borderRadius: RADIUS.pill, border: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>Radicar PQRS</button>
      </Sheet>
      <Toast message={toast} />
    </AdminShell>
  );
}
