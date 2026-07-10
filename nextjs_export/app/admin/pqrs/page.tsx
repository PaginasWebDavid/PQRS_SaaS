'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Sheet, CloseButton } from '@/components/Sheet';
import { Toast, useToast } from '@/components/Toast';
import { ADMIN_NAV } from '@/lib/adminNav';
import { COLORS, RADIUS, badgeStyle, tabStyle } from '@/lib/tokens';

type Stage = 0 | 1 | 2 | 3 | 4;
type Pqrs = {
  id: string; subject: string; resident: string; location: string; priority: 'Alta' | 'Media' | 'Baja';
  description: string; assignee: string; date: string; stage: Stage;
  internalNotes: { text: string; time: string }[];
  history: { text: string; time: string }[];
};

const STAGE_LABELS = ['Radicada', 'Recibida', 'En revisión', 'En proceso', 'Terminada'];

function groupOf(stage: Stage) { return stage <= 1 ? 'abierta' : stage === 2 ? 'revision' : stage === 3 ? 'proceso' : 'terminada'; }
function statusLabel(stage: Stage) { return { abierta: 'Abierta', revision: 'En revisión', proceso: 'En proceso', terminada: 'Terminada' }[groupOf(stage)]; }
function badgeOf(stage: Stage) {
  const g = groupOf(stage);
  if (g === 'abierta') return badgeStyle(COLORS.warningSoft, COLORS.warning);
  if (g === 'revision') return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
  if (g === 'proceso') return badgeStyle(COLORS.navySoft, COLORS.navy);
  return badgeStyle(COLORS.successSoft, COLORS.success);
}
function priorityBadge(p: Pqrs['priority']) {
  if (p === 'Alta') return badgeStyle(COLORS.dangerSoft, COLORS.danger);
  if (p === 'Media') return badgeStyle(COLORS.warningSoft, COLORS.warning);
  return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
}

const INITIAL: Pqrs[] = [
  { id: 'PQ-0231', subject: 'Ruido excesivo torre 3', resident: 'C. Ramírez', location: 'Torre 3 · Apto 502', priority: 'Media', description: 'El residente reporta música y ruido después de las 10pm de forma recurrente.', assignee: 'Ana Ruiz', date: '07 jul', stage: 0, internalNotes: [], history: [{ text: 'Radicada por el residente con 2 evidencias', time: '07 jul · 08:12' }] },
  { id: 'PQ-0230', subject: 'Fuga de agua zona común', resident: 'M. Torres', location: 'Pasillo torre 2, piso 3', priority: 'Alta', description: 'Fuga visible en el techo del pasillo, riesgo de daño a unidades inferiores.', assignee: 'J. Pardo', date: '06 jul', stage: 3, internalNotes: [{ text: 'Plomero cotizó $340.000, aprobado.', time: '01 jul · 09:00' }], history: [{ text: 'Radicada por el residente', time: '06 jul · 14:02' }, { text: 'Visita técnica: fisura identificada', time: '30 jun · 15:10' }] },
  { id: 'PQ-0229', subject: 'Solicitud de certificado', resident: 'A. Gómez', location: 'Torre 1 · Apto 101', priority: 'Baja', description: 'Solicita certificado de residencia para trámite bancario.', assignee: 'Ana Ruiz', date: '05 jul', stage: 4, internalNotes: [], history: [{ text: 'Radicada por el residente', time: '05 jul · 10:00' }, { text: 'Certificado emitido y enviado', time: '05 jul · 16:20' }] },
  { id: 'PQ-0228', subject: 'Daño en parqueadero', resident: 'J. Pardo', location: 'Sótano 1, celda 12', priority: 'Media', description: 'Columna con desprendimiento de pintura cerca de la celda de parqueo.', assignee: 'C. Molina', date: '04 jul', stage: 4, internalNotes: [], history: [{ text: 'Radicada por el residente', time: '04 jul · 09:15' }, { text: 'Reparación completada', time: '04 jul · 17:00' }] },
];

const FILTERS = [{ key: 'all', label: 'Todas' }, { key: 'abierta', label: 'Abiertas' }, { key: 'revision', label: 'En revisión' }, { key: 'proceso', label: 'En proceso' }, { key: 'terminada', label: 'Terminadas' }];

export default function ModuloPqrsPage() {
  const [data, setData] = useState<Pqrs[]>(INITIAL);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(INITIAL[0].id);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newResident, setNewResident] = useState('');
  const { toast, showToast } = useToast();

  const filtered = data.filter((p) => (filter === 'all' || groupOf(p.stage) === filter) && (!search || p.subject.toLowerCase().includes(search.toLowerCase()) || p.resident.toLowerCase().includes(search.toLowerCase())));
  const selected = data.find((p) => p.id === selectedId) ?? data[0];

  const advance = (id: string) => setData((d) => d.map((p) => p.id === id ? { ...p, stage: Math.min(4, p.stage + 1) as Stage, history: [...p.history, { text: `Avanzó a "${STAGE_LABELS[Math.min(4, p.stage + 1)]}"`, time: 'ahora' }] } : p));
  const addNote = (id: string) => setData((d) => d.map((p) => p.id === id ? { ...p, internalNotes: [...p.internalNotes, { text: 'Nota interna de Ana Ruiz', time: 'ahora' }] } : p));

  const submitCreate = () => {
    if (!newSubject.trim()) return;
    const id = `PQ-0${232 + data.length}`;
    const item: Pqrs = { id, subject: newSubject, resident: newResident || 'Sin especificar', location: '—', priority: 'Media', description: '', assignee: 'Sin asignar', date: 'hoy', stage: 0, internalNotes: [], history: [{ text: 'Radicada por el administrador', time: 'ahora' }] };
    setData((d) => [item, ...d]);
    setSelectedId(id); setCreateOpen(false); setNewSubject(''); setNewResident('');
    showToast('PQRS creada ✓');
  };

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="pqrs" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="PQRS">
      <div className="apl-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div><h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 3px' }}>PQRS</h1><p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>{data.length} solicitudes · Parque Residencial Calle 100</p></div>
        <div onClick={() => setCreateOpen(true)} style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, padding: '11px 22px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>+ Crear PQRS</div>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por asunto, residente o ID…" style={{ width: '100%', maxWidth: 420, height: 42, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => <div key={f.key} onClick={() => setFilter(f.key)} style={tabStyle(filter === f.key)}>{f.label}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>No hay solicitudes que coincidan con este filtro.</div>}
          {filtered.map((p) => (
            <div key={p.id} onClick={() => setSelectedId(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer', background: p.id === selectedId ? COLORS.navySoft : 'transparent' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 66, flexShrink: 0 }}>{p.id}</span>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.subject}</span>
              <span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, width: 90, flexShrink: 0 }}>{p.resident}</span>
              <span style={badgeOf(p.stage)}>{statusLabel(p.stage)}</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted }}>{selected.id}</span>
            <span style={badgeOf(selected.stage)}>{statusLabel(selected.stage)}</span>
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 18px' }}>{selected.subject}</h3>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
            {STAGE_LABELS.map((label, i) => {
              const done = i < selected.stage; const current = i === selected.stage;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 999, background: done ? COLORS.success : current ? COLORS.navy : COLORS.neutralSoft, color: done || current ? '#FFFFFF' : COLORS.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{done ? '✓' : i + 1}</div>
                  {i < 4 && <div style={{ flex: 1, height: 2, background: i < selected.stage ? COLORS.success : COLORS.neutralSoft, margin: '0 2px' }} />}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
            <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>RESPONSABLE</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.assignee}</div></div>
            <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>UBICACIÓN</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.location}</div></div>
            <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>PRIORIDAD</div><span style={priorityBadge(selected.priority)}>{selected.priority}</span></div>
            <div><div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>RADICADA</div><div style={{ fontSize: 13, fontWeight: 700 }}>{selected.date}</div></div>
          </div>

          {selected.description && <p style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 500, lineHeight: 1.55, margin: '0 0 20px' }}>{selected.description}</p>}

          <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 10 }}>Seguimiento</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
            {selected.history.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 11 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.navy, marginTop: 5, flexShrink: 0 }} />
                  {i < selected.history.length - 1 && <div style={{ width: 1.5, flex: 1, background: COLORS.neutralSoft, margin: '3px 0' }} />}
                </div>
                <div style={{ paddingBottom: i < selected.history.length - 1 ? 16 : 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{h.text}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500, marginTop: 2 }}>{h.time}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 10 }}>Comentarios internos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {selected.internalNotes.length === 0 && <p style={{ fontSize: 12, color: COLORS.textMuted, margin: 0 }}>Sin comentarios internos aún.</p>}
            {selected.internalNotes.map((n, i) => (
              <div key={i} style={{ background: COLORS.warningSoft, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 12.5, color: COLORS.warning, fontWeight: 600 }}>{n.text}</div>
                <div style={{ fontSize: 10.5, color: COLORS.warning, fontWeight: 500, marginTop: 2, opacity: 0.75 }}>{n.time}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {selected.stage < 4
              ? <div onClick={() => advance(selected.id)} style={{ flex: 1, textAlign: 'center', background: COLORS.navy, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Avanzar estado</div>
              : <div style={{ flex: 1, textAlign: 'center', background: COLORS.bgCard, color: COLORS.textMuted, fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill }}>Terminada</div>}
            <div onClick={() => addNote(selected.id)} style={{ flex: 1, textAlign: 'center', background: COLORS.bgCard, color: '#1D1D1F', fontSize: 12.5, fontWeight: 700, padding: '10px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Agregar nota interna</div>
          </div>
        </div>
      </div>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={420}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Crear PQRS</div>
          <CloseButton onClick={() => setCreateOpen(false)} />
        </div>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 22px' }}>Radica una nueva solicitud para tu conjunto.</p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>Asunto</label>
        <input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Ej. Ruido excesivo torre 4" style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 16 }} />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>Residente</label>
        <input value={newResident} onChange={(e) => setNewResident(e.target.value)} placeholder="Nombre del residente" style={{ width: '100%', height: 42, padding: '0 14px', border: `1px solid ${COLORS.inputBorder}`, borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 24 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div onClick={() => setCreateOpen(false)} style={{ flex: 1, textAlign: 'center', border: `1px solid ${COLORS.inputBorderStrong}`, fontSize: 13, fontWeight: 600, padding: '10px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Cancelar</div>
          <div onClick={submitCreate} style={{ flex: 1, textAlign: 'center', background: COLORS.navy, color: '#FFFFFF', fontSize: 13, fontWeight: 600, padding: '10px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Radicar PQRS</div>
        </div>
      </Sheet>

      <Toast message={toast} />
    </AdminShell>
  );
}
