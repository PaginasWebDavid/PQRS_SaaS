'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, tabStyle } from '@/lib/design/tokens';
import { describeActivity, activityCategory, type ActivityEntry } from '@/lib/design/activityFeed';

const FILTERS = [
  { key: 'all', label: 'Todo' },
  { key: 'pqrs', label: 'PQRS' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'licencia', label: 'Licencia' },
];

const CATEGORY_DOT: Record<string, string> = { pqrs: COLORS.navy, usuarios: COLORS.warning, licencia: COLORS.success };


function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'justo ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ActividadPage() {
  const [filter, setFilter] = useState('all');
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (category: string, skip: number) => {
    const res = await fetch(`/api/actividad?category=${category}&take=20&skip=${skip}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    load(filter, 0).then((body) => {
      if (!alive) return;
      if (body) { setEntries(body.entries); setTotal(body.total); }
      else setError('No se pudo cargar la actividad.');
    }).catch(() => {
      if (alive) setError('No se pudo cargar la actividad.');
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [filter, load]);

  async function loadMore() {
    setLoadingMore(true);
    const body = await load(filter, entries.length);
    if (body) setEntries((prev) => [...prev, ...body.entries]);
    setLoadingMore(false);
  }

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="actividad" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Actividad">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Actividad</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Trazabilidad completa de su conjunto</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTERS.map((f) => <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{ ...tabStyle(filter === f.key), border: 'none', fontFamily: 'inherit' }}>{f.label}</button>)}
      </div>

      <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: '22px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando actividad…</div>}
        {!loading && error && <div style={{ textAlign: 'center', padding: 30, color: COLORS.danger, fontWeight: 600 }}>{error}</div>}
        {!loading && !error && entries.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>No hay actividad registrada en esta categoría.</div>}
        {!loading && !error && entries.map((ev, i) => (
          <div key={ev.id} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 9, height: 9, borderRadius: 999, background: CATEGORY_DOT[activityCategory(ev.action)] || COLORS.textMuted, marginTop: 5, flexShrink: 0 }} />
              {i < entries.length - 1 && <div style={{ width: 1.5, flex: 1, background: 'rgba(0,0,0,0.08)', margin: '3px 0' }} />}
            </div>
            <div style={{ paddingBottom: i < entries.length - 1 ? 18 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{describeActivity(ev)}</div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, marginTop: 2 }}>{relativeTime(ev.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>

      {!loading && entries.length < total && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" onClick={loadMore} disabled={loadingMore} style={{ border: `1.5px solid ${COLORS.inputBorder}`, background: 'transparent', color: COLORS.textSecondaryAlt, fontSize: 13, fontWeight: 700, padding: '10px 22px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' }}>
            {loadingMore ? 'Cargando…' : 'Ver más'}
          </button>
        </div>
      )}
    </AdminShell>
  );
}
