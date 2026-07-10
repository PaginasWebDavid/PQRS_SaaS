'use client';
import { useState } from 'react';
import { ResidentShell } from '@/components/ResidentShell';
import { Sheet, CloseButton } from '@/components/Sheet';
import { Toast, useToast } from '@/components/Toast';
import { COLORS, RADIUS, badgeStyle, tabStyle, chipStyle } from '@/lib/tokens';

type Stage = 0 | 1 | 2 | 3 | 4;
type Item = {
  id: string; subject: string; date: string; stage: Stage; lastUpdate: string;
  firstContact?: string; firstContactTime?: string;
  phaseComments: Record<number, { time: string; text: string }>;
  closingPhotos?: string[];
};

const STAGE_LABELS = ['Nueva', 'Asignada', 'Primer contacto', 'En gestión', 'Resuelta'];
const HINTS = ['La recibimos y pronto la asignaremos.', 'Ya está asignada a un responsable.', 'La administración se pondrá en contacto pronto.', 'Se está trabajando en la solución.'];

function group(stage: Stage) { return stage <= 2 ? 'abiertas' : stage === 3 ? 'gestion' : 'resuelta'; }
function badgeOf(stage: Stage) {
  if (stage === 0) return badgeStyle(COLORS.warningSoft, COLORS.warning);
  if (stage === 1 || stage === 2) return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
  if (stage === 3) return badgeStyle(COLORS.navySoft, COLORS.navy);
  return badgeStyle(COLORS.successSoft, COLORS.success);
}
function label(stage: Stage) { return stage === 0 ? 'Nueva' : (stage === 1 || stage === 2) ? 'En revisión' : stage === 3 ? 'En gestión' : 'Resuelta'; }

const INITIAL: Item[] = [
  { id: 'PQ-0302', subject: 'Goteras en techo torre 2', date: '06 jul 2026', stage: 3, lastUpdate: 'hace 3 horas', phaseComments: { 0: { time: '06 jul · 08:12', text: 'Radicaste esta solicitud.' }, 3: { time: 'hace 3 horas', text: 'Ya tenemos el diagnóstico: es una fisura en la impermeabilización. El técnico llega esta semana.' } } },
  { id: 'PQ-0305', subject: 'Ruido excesivo apartamento vecino', date: '08 jul 2026', stage: 0, lastUpdate: 'hace 1 hora', phaseComments: { 0: { time: 'hace 1 hora', text: 'Radicaste esta solicitud.' } } },
  { id: 'PQ-0298', subject: 'Daño en luminaria del pasillo', date: '25 jun 2026', stage: 4, lastUpdate: 'hace 2 días', phaseComments: { 0: { time: '25 jun', text: 'Radicaste esta solicitud.' }, 4: { time: 'hace 2 días', text: 'Cambiamos el bombillo y revisamos el conector. Ya quedó funcionando.' } }, closingPhotos: ['foto1.jpg'] },
];

export default function VistaResidentePage() {
  const [data, setData] = useState<Item[]>(INITIAL);
  const [tab, setTab] = useState<'inicio' | 'mispqrs' | 'notif' | 'perfil'>('inicio');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('Mantenimiento');
  const { toast, showToast } = useToast();

  const active = data.filter((d) => d.stage < 4);
  const recent = data.filter((d) => d.stage === 4).slice(0, 2);
  const selected = data.find((d) => d.id === selectedId);

  const filtered = data.filter((d) => (filter === 'all' || group(d.stage) === filter) && (!search || d.subject.toLowerCase().includes(search.toLowerCase())));

  const submitCreate = () => {
    if (!newLocation.trim() || !newDescription.trim()) return;
    const id = `PQ-0${306 + data.length}`;
    setData((d) => [{ id, subject: newDescription.slice(0, 40), date: 'hoy', stage: 0, lastUpdate: 'ahora', phaseComments: { 0: { time: 'ahora', text: 'Radicaste esta solicitud.' } } }, ...d]);
    setCreateOpen(false); setNewLocation(''); setNewDescription(''); setTab('inicio');
    showToast('Tu solicitud fue enviada ✓');
  };

  const bottomNav = [
    { key: 'inicio', label: 'Inicio', icon: '⌂', onClick: () => setTab('inicio') },
    { key: 'mispqrs', label: 'Mis PQRS', icon: '☰', onClick: () => setTab('mispqrs') },
    { key: 'notif', label: 'Alertas', icon: '◔', onClick: () => setTab('notif') },
    { key: 'perfil', label: 'Perfil', icon: '◐', onClick: () => setTab('perfil') },
  ];

  return (
    <ResidentShell activeKey={tab} initials="DS" greetingName="Diego Salazar" bottomNav={bottomNav}>
      {tab === 'inicio' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 6px' }}>Hola, Diego 👋</h1>
          <p style={{ fontSize: 15, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 24px' }}>{active.length > 0 ? `Tienes ${active.length} solicitud${active.length > 1 ? 'es' : ''} activa${active.length > 1 ? 's' : ''}.` : 'No tienes solicitudes activas.'}</p>

          <div onClick={() => setCreateOpen(true)} style={{ background: COLORS.navy, color: '#FFFFFF', borderRadius: 18, padding: '20px 22px', marginBottom: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div><div style={{ fontSize: 16, fontWeight: 800, marginBottom: 3 }}>Nueva solicitud</div><div style={{ fontSize: 12.5, color: COLORS.navyMuted }}>Cuéntanos qué está pasando</div></div>
            <div style={{ fontSize: 22 }}>＋</div>
          </div>

          {active.length > 0 ? (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.textMuted, marginBottom: 12 }}>SOLICITUDES ACTIVAS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {active.map((row) => (
                  <div key={row.id} onClick={() => setSelectedId(row.id)} style={{ background: COLORS.bgCard, borderRadius: 16, padding: '17px 18px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 800 }}>{row.subject}</span>
                      <span style={badgeOf(row.stage)}>{label(row.stage)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: 500 }}>Última actualización: {row.lastUpdate}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ background: COLORS.bgCard, borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No tienes solicitudes abiertas</div>
              <div style={{ fontSize: 12.5, color: COLORS.textMuted }}>Cuando algo necesite atención, créala aquí.</div>
            </div>
          )}

          {recent.length > 0 && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.textMuted, marginBottom: 12 }}>RECIENTES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recent.map((row) => (
                  <div key={row.id} onClick={() => setSelectedId(row.id)} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{row.subject}</span>
                      <span style={badgeOf(row.stage)}>{label(row.stage)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: COLORS.textMuted }}>Última actualización: {row.lastUpdate}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'mispqrs' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 16px' }}>Mis solicitudes</h1>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título…" style={{ width: '100%', height: 44, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {[{ key: 'all', label: 'Todas' }, { key: 'abiertas', label: 'Abiertas' }, { key: 'gestion', label: 'En gestión' }, { key: 'resuelta', label: 'Resueltas' }].map((f) => <div key={f.key} onClick={() => setFilter(f.key)} style={tabStyle(filter === f.key)}>{f.label}</div>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((row) => (
              <div key={row.id} onClick={() => setSelectedId(row.id)} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: '16px 18px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted }}>{row.id}</span>
                  <span style={badgeOf(row.stage)}>{label(row.stage)}</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 4 }}>{row.subject}</div>
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>Creada el {row.date} · Última actualización: {row.lastUpdate}</div>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '50px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>No encontramos solicitudes con ese filtro.</div>}
          </div>
        </div>
      )}

      {tab === 'notif' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 16px' }}>Notificaciones</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { text: 'Tu PQRS "Goteras en techo torre 2" cambió a En gestión', time: 'hace 3 horas' },
              { text: 'La administración respondió tu solicitud "Ruido excesivo apartamento vecino"', time: 'hace 1 día' },
              { text: '"Daño en luminaria del pasillo" fue cerrada', time: 'hace 2 días' },
            ].map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, background: COLORS.bgCard, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.navy, marginTop: 6, flexShrink: 0 }} />
                <div><div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45 }}>{n.text}</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 3 }}>{n.time}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'perfil' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 20px' }}>Mi perfil</h1>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 19 }}>DS</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Agregar foto <span style={{ fontWeight: 500, color: COLORS.textMuted }}>(opcional)</span></div>
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre</label>
            <input defaultValue="Diego Salazar" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14, background: '#FFFFFF' }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Correo</label>
            <input defaultValue="d.salazar@correo.com" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div onClick={() => showToast('Perfil actualizado ✓')} style={{ flex: 1, textAlign: 'center', background: COLORS.navy, color: '#FFFFFF', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Guardar cambios</div>
          </div>
        </div>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={520}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>Nueva solicitud</div>
          <CloseButton onClick={() => setCreateOpen(false)} />
        </div>
        <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 22px' }}>Cuéntanos qué está pasando.</p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Categoría</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {['Mantenimiento', 'Convivencia', 'Administrativo', 'Zonas comunes'].map((c) => <div key={c} onClick={() => setNewCategory(c)} style={chipStyle(newCategory === c)}>{c}</div>)}
        </div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Ubicación</label>
        <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Ej. Torre 2, apto 402" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }} />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>¿Qué está pasando?</label>
        <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Describe la situación con el mayor detalle posible" rows={4} style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 22, resize: 'vertical' }} />
        <div onClick={submitCreate} style={{ textAlign: 'center', background: (newLocation.trim() && newDescription.trim()) ? COLORS.navy : COLORS.neutralSoft, color: (newLocation.trim() && newDescription.trim()) ? '#FFFFFF' : COLORS.textMuted, fontSize: 15, fontWeight: 700, padding: '14px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Enviar solicitud</div>
      </Sheet>

      <Sheet open={!!selected} onClose={() => setSelectedId(null)} maxWidth={520}>
        {selected && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted }}>{selected.id}</span>
              <CloseButton onClick={() => setSelectedId(null)} />
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: '8px 0 20px' }}>{selected.subject}</h2>
            {selected.stage === 4 ? (
              <div style={{ background: COLORS.successSoft, borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>✓</span><span style={{ fontSize: 14, fontWeight: 800, color: COLORS.success }}>Solicitud resuelta</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <span style={badgeOf(selected.stage)}>{label(selected.stage)}</span>
                <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>{HINTS[selected.stage]}</span>
              </div>
            )}
            <div style={{ background: COLORS.bgCard, borderRadius: 16, padding: '20px 18px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {STAGE_LABELS.map((_, i) => {
                  const done = i < selected.stage || selected.stage === 4; const current = i === selected.stage && !done;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 999, background: done ? COLORS.success : current ? COLORS.navy : COLORS.neutralSoft, color: done || current ? '#FFFFFF' : COLORS.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{done ? '✓' : i + 1}</div>
                      {i < 4 && <div style={{ flex: 1, height: 2.5, borderRadius: 2, background: i < selected.stage ? COLORS.success : COLORS.neutralSoft, margin: '0 2px' }} />}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>La administración dice</div>
            {Object.entries(selected.phaseComments).map(([k, c]) => (
              <div key={k} style={{ background: COLORS.navySoft, borderRadius: 14, padding: '13px 15px', marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: COLORS.navy, fontWeight: 500, lineHeight: 1.5 }}>{c.text}</div>
                <div style={{ fontSize: 11, color: '#5C6C86', fontWeight: 600, marginTop: 4 }}>{c.time}</div>
              </div>
            ))}
          </>
        )}
      </Sheet>

      <Toast message={toast} bottom={78} />
    </ResidentShell>
  );
}
