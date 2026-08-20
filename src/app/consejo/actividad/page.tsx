'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/shell/AdminShell';
import { CONSEJO_NAV } from '@/lib/design/consejoNav';
import { COLORS } from '@/lib/design/tokens';
import { describeActivity, activityCategory, type ActivityEntry } from '@/lib/design/activityFeed';

// Consejo es de solo lectura sobre PQRS/Reportes — la API ya restringe su
// consulta de actividad a esa categoria unicamente, asi que no se ofrecen
// pestañas de Usuarios/Licencia que igual no traerian datos.
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

export default function ConsejoActividadPage() {
  const filter = 'pqrs';
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (category: string, skip: number) => {
    const res = await fetch(`/api/actividad?category=${category}&take=20&skip=${skip}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar la actividad');
    return res.json();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    load(filter, 0).then((body) => {
      setEntries(body.entries); setTotal(body.total);
    }).catch(() => { setEntries([]); setTotal(0); setError('No se pudo cargar la actividad. Intente de nuevo.'); }).finally(() => setLoading(false));
  }, [filter, load, reloadKey]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const body = await load(filter, entries.length);
      setEntries((prev) => [...prev, ...body.entries]);
    } catch {
      setError('No se pudo cargar más actividad.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <AdminShell navItems={CONSEJO_NAV} activeKey="actividad" userName="Consejo" userRole="Consejo de Administración" initials="CM" mobileTitle="Actividad">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Actividad</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Trazabilidad de las PQRS de su conjunto</p>

      {error && <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{error} <button type="button" onClick={() => setReloadKey((value) => value + 1)} style={{ marginLeft: 10, border: 'none', background: COLORS.danger, color: '#FFF', borderRadius: 999, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Reintentar</button></div>}

      <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: '22px 24px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>Cargando actividad…</div>}
        {!loading && entries.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: COLORS.textMuted, fontWeight: 600 }}>No hay actividad registrada en esta categoría.</div>}
        {!loading && entries.map((ev, i) => (
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
