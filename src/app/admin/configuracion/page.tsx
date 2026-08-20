'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/shell/AdminShell';
import { useIsMobile } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { ADMIN_NAV } from '@/lib/design/adminNav';
import { COLORS, RADIUS } from '@/lib/design/tokens';

type PqrsWorkflowType = 'SIMPLE' | 'MAINTENANCE';
type TenantInfo = { units?: number | null; status?: string | null; pqrsWorkflowType?: PqrsWorkflowType | null };
type TenantSettings = { tenant?: TenantInfo | null; pqrsCloseSlaDays?: number; integrations?: { correoTransaccional: boolean; almacenamientoEvidencias: boolean; pagos: boolean } };
type PqrsCategory = { id: string; displayName: string; isActive: boolean; isCustom: boolean; sortOrder: number; workflowType: PqrsWorkflowType };

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Falta primer pago', TRIAL: 'En prueba', ACTIVE: 'Activa',
  GRACE_PERIOD: 'En mora', SUSPENDED: 'Suspendida', CANCELLED: 'Cancelada',
};

export default function ConfiguracionConjuntoPage() {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [categories, setCategories] = useState<PqrsCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryWorkflow, setNewCategoryWorkflow] = useState<PqrsWorkflowType>('SIMPLE');
  const [categorySaving, setCategorySaving] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    fetch('/api/me').then((r) => r.ok ? r.json() : null).then((data) => {
      if (!data) return;
      setName(data.tenant?.name || '');
      setCity(data.tenant?.city || '');
      setAddress(data.tenant?.address || '');
      setEmail(data.user?.email || '');
    }).catch(() => setLoadError('No se pudo cargar la información del conjunto.'));
    fetch('/api/tenant').then((r) => r.ok ? r.json() : null).then((data) => { if (data) setSettings(data); }).catch(() => setLoadError('No se pudo cargar la configuración del conjunto.'));
    // Faltaba: sin esto la lista de categorias salia siempre vacia y no habia
    // forma de ver ni editar las que ya existian.
    fetch('/api/tenant/pqrs-categories')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data)) setCategories([...data].sort((a, b) => a.sortOrder - b.sortOrder)); })
      .catch(() => setLoadError('No se pudieron cargar las categorías.'));
  }, []);

  async function saveTenant() {
    try {
      const res = await fetch('/api/tenant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, city, address }) });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setSettings((current) => current ? { ...current, tenant: body } : current);
        showToast('Configuración guardada ✓');
      } else {
        showToast(body?.error || 'No se pudo guardar la configuración');
      }
    } catch {
      showToast('No se pudo guardar la configuración. Revise su conexión.');
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: '#FFFFFF' };
  const statusLabel = settings?.tenant?.status ? (STATUS_LABEL[settings.tenant.status] || settings.tenant.status) : '—';

  async function updateCategory(categoryId: string, patch: Partial<Pick<PqrsCategory, 'displayName' | 'isActive' | 'sortOrder' | 'workflowType'>>) {
    if (categorySaving) return;
    setCategorySaving(true);
    try {
      const res = await fetch('/api/tenant/pqrs-categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId, ...patch }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) { if (res.status !== 409) showToast(body?.error || 'No se pudo actualizar la categoria'); return; }
      setCategories((current) => current.map((item) => item.id === body.id ? body : item).sort((a, b) => a.sortOrder - b.sortOrder));
      showToast('Categoria actualizada');
    } catch { showToast('No se pudo actualizar la categoria. Revise su conexion.'); }
    finally { setCategorySaving(false); }
  }

  // Reordenar intercambiando el orden con la vecina, para que el admin no
  // tenga que entender ni escribir el numero de orden a mano.
  async function moveCategory(index: number, direction: -1 | 1) {
    if (categorySaving) return;
    const current = categories[index];
    const neighbour = categories[index + direction];
    if (!current || !neighbour) return;
    setCategorySaving(true);
    try {
      const a = await fetch('/api/tenant/pqrs-categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId: current.id, sortOrder: neighbour.sortOrder }) });
      const b = await fetch('/api/tenant/pqrs-categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId: neighbour.id, sortOrder: current.sortOrder }) });
      if (!a.ok || !b.ok) { showToast('No se pudo cambiar el orden'); return; }
      setCategories((list) => list
        .map((item) => item.id === current.id ? { ...item, sortOrder: neighbour.sortOrder } : item.id === neighbour.id ? { ...item, sortOrder: current.sortOrder } : item)
        .sort((x, y) => x.sortOrder - y.sortOrder));
    } catch { showToast('No se pudo cambiar el orden. Revise su conexión.'); }
    finally { setCategorySaving(false); }
  }

  async function createCategory() {
    if (categorySaving || newCategoryName.trim().length < 2) return;
    setCategorySaving(true);
    try {
      const nextOrder = Math.min(999, Math.max(90, ...categories.map((item) => item.sortOrder + 10)));
      const res = await fetch('/api/tenant/pqrs-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: newCategoryName.trim(), sortOrder: nextOrder, workflowType: newCategoryWorkflow }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) { showToast(body?.error || 'No se pudo crear la categoria'); return; }
      setCategories((current) => [...current, body].sort((a, b) => a.sortOrder - b.sortOrder)); setNewCategoryName(''); showToast('Categoria creada');
    } catch { showToast('No se pudo crear la categoria. Revise su conexion.'); }
    finally { setCategorySaving(false); }
  }

  return (
    <AdminShell navItems={ADMIN_NAV} activeKey="configuracion" userName="Ana Ruiz" userRole="Administradora" initials="AR" mobileTitle="Configuración">
      <h1 className="apl-up" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Configuración del conjunto</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 24px' }}>Estos datos se leen y guardan en su conjunto real.</p>
      {loadError && <p style={{ color: COLORS.danger, fontSize: 13, fontWeight: 700, margin: '-10px 0 20px' }}>{loadError}</p>}

      <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Información general</div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre del conjunto</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Ciudad</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Dirección</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ background: COLORS.navySoft, borderRadius: 10, padding: '11px 14px', fontSize: 12, color: COLORS.navy, fontWeight: 600, marginBottom: 14 }}>El número de unidades y el plan de precio los administra PQRS Services.</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 16 }}>Correo de la cuenta: <span style={{ color: COLORS.textPrimary, fontWeight: 800 }}>{email}</span></div>
          <button onClick={saveTenant} style={{ border: 0, background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 26px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Guardar cambios</button>
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 16 }}>Licencia y reglas del servicio</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>ESTADO</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{statusLabel}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>UNIDADES CONTRATADAS</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{settings?.tenant?.units ?? '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>SLA DE CIERRE</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{settings?.pqrsCloseSlaDays ?? '—'} días</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 14px' }}>
            Una PQRS se marca como vencida en Reportes cuando supera este número de días sin resolverse. Esta regla la define PQRS Services para toda la plataforma.
          </p>
          <Link href="/admin/licencias" style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy }}>Ver detalle de licencia y pagos →</Link>
        </div>

        <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 6 }}>Categorías de PQRS</div>
          <p style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 4px', lineHeight: 1.6 }}>
            Cuando abre un caso, elige una de estas. La categoría decide cómo se gestiona:
          </p>
          <ul style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 14px', paddingLeft: 18, lineHeight: 1.7 }}>
            <li><strong>Simple</strong>: primer contacto, acción tomada y evidencia de cierre. Para convivencia, certificados, cartera, consultas.</li>
            <li><strong>Mantenimiento</strong>: las 5 fases (diagnóstico, cotización o proveedor, ejecución, verificación y cierre). Para arreglos y zonas comunes.</li>
          </ul>
          <p style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, margin: '0 0 14px' }}>Lo que cambies aquí solo aplica a los casos nuevos. Desactivar una categoría no borra los casos que ya la usaban.</p>

          {categories.length === 0 && <div style={{ padding: '20px 0', fontSize: 12.5, color: COLORS.textMuted }}>Cargando categorías…</div>}

          {!isMobile && categories.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px,1fr) 165px 92px 70px', gap: 8, padding: '0 10px 6px', fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em' }}>
              <span>NOMBRE</span><span>CÓMO SE GESTIONA</span><span>¿SE PUEDE USAR?</span><span style={{ textAlign: 'right' }}>ORDEN</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {categories.map((category, index) => (
              <div key={category.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(170px,1fr) 165px 92px 70px', gap: 8, alignItems: 'center', padding: 10, background: COLORS.bgCard, borderRadius: 12 }}>
                <input aria-label="Nombre de la categoría" value={category.displayName} onChange={(e) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, displayName: e.target.value } : item))} onBlur={() => void updateCategory(category.id, { displayName: category.displayName })} style={{ ...inputStyle, height: 38 }} />
                <select aria-label="Cómo se gestiona" value={category.workflowType} onChange={(e) => void updateCategory(category.id, { workflowType: e.target.value as PqrsWorkflowType })} style={{ ...inputStyle, height: 38 }}><option value="SIMPLE">Simple</option><option value="MAINTENANCE">Mantenimiento (5 fases)</option></select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}><input type="checkbox" checked={category.isActive} onChange={(e) => void updateCategory(category.id, { isActive: e.target.checked })} /> Sí</label>
                {/* Antes aqui habia un campo numerico sin etiqueta (el orden
                    interno). Nadie sabia que era, asi que ahora se mueve con
                    flechas y el numero no se muestra. */}
                <div style={{ display: 'flex', gap: 4, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                  <button type="button" aria-label="Subir" disabled={index === 0 || categorySaving} onClick={() => void moveCategory(index, -1)} style={{ width: 32, height: 32, borderRadius: 9, border: `1.5px solid ${COLORS.inputBorder}`, background: COLORS.bg, cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.4 : 1, fontSize: 12 }}>↑</button>
                  <button type="button" aria-label="Bajar" disabled={index === categories.length - 1 || categorySaving} onClick={() => void moveCategory(index, 1)} style={{ width: 32, height: 32, borderRadius: 9, border: `1.5px solid ${COLORS.inputBorder}`, background: COLORS.bg, cursor: index === categories.length - 1 ? 'default' : 'pointer', opacity: index === categories.length - 1 ? 0.4 : 1, fontSize: 12 }}>↓</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${COLORS.borderSoft}`, marginTop: 16, paddingTop: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 3 }}>Crear una categoría propia ({categories.filter((item) => item.isCustom).length}/3)</div>
            <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginBottom: 8 }}>Por si su conjunto maneja un tipo de solicitud que no encaja en las de arriba.</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 190px auto', gap: 8 }}>
              <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} maxLength={80} placeholder="Ej. Mascotas" aria-label="Nombre de la categoría nueva" style={inputStyle} />
              <select value={newCategoryWorkflow} onChange={(e) => setNewCategoryWorkflow(e.target.value as PqrsWorkflowType)} aria-label="Cómo se gestiona" style={inputStyle}><option value="SIMPLE">Simple</option><option value="MAINTENANCE">Mantenimiento (5 fases)</option></select>
              <button type="button" onClick={() => void createCategory()} disabled={categorySaving || newCategoryName.trim().length < 2 || categories.filter((item) => item.isCustom).length >= 3} style={{ border: 0, background: COLORS.navy, color: COLORS.white, borderRadius: RADIUS.pill, padding: '0 18px', fontWeight: 700, cursor: 'pointer' }}>Crear</button>
            </div>
          </div>
        </div>
        {/* Se quito "Estado del sistema": mostraba el estado de servicios que
            el administrador no puede accionar ("si algo falla, contacta a
            soporte"). Si de verdad se cae uno, se nota al usarlo. */}
        <p style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: 500 }}>
          ¿Buscas activar o desactivar sus correos de nuevas PQRS? Eso se configura en <Link href="/admin/cuenta" style={{ color: COLORS.navy, fontWeight: 700 }}>Mi cuenta</Link>.
        </p>
      </div>

      <Toast message={toast} />
    </AdminShell>
  );
}
