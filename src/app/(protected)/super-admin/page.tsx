'use client';
import { useEffect, useState } from 'react';
import { SuperAdminShell, NavGroup } from '@/components/shell/SuperAdminShell';
import { Sheet, CloseButton } from '@/components/shell/Sheet';
import { Toast, useToast } from '@/components/shell/Toast';
import { COLORS, RADIUS, badgeStyle, tabStyle, toggleTrackStyle, toggleDotStyle } from '@/lib/design/tokens';

const NAV_DEFS: { header?: string; key?: string; label?: string }[] = [
  { header: 'PLATAFORMA' },
  { key: 'resumen', label: 'Resumen' },
  { key: 'conjuntos', label: 'Conjuntos' },
  { key: 'financiero', label: 'Licencias y pagos' },
  { header: 'NEGOCIO' },
  { key: 'precios', label: 'Reglas de precio' },
  { key: 'analytics', label: 'Analytics' },
  { header: 'SISTEMA' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'auditoria', label: 'Auditoría' },
  { key: 'soporte', label: 'Soporte' },
  { key: 'config', label: 'Configuración' },
];

type TenantGroup = 'active' | 'trial' | 'suspended' | 'cancelled';
type Tenant = {
  id: string; name: string; city: string; units: number; plan: string; group: TenantGroup;
  adminName: string; adminEmail: string; adminPhone: string; startDate: string;
  pqrsTotal: number; pqrsOpen: number; licenseEnd: string; paymentStatus: 'al_dia' | 'mora'; moraDays: number;
};

type ApiTenant = {
  id: string;
  name: string;
  city?: string | null;
  units?: number | null;
  status?: string | null;
  createdAt?: string | null;
  users?: { name?: string | null; email?: string | null }[];
  subscription?: { status?: string | null; unitsSnapshot?: number | null; currentPeriodEnd?: string | null } | null;
  _count?: { users?: number; pqrs?: number };
};

type ApiPricingRule = { id: string; minUnits: number; maxUnits: number | null; priceCents: number; currency: string; isActive: boolean };
type ApiAuditLog = { action: string; targetType: string; createdAt: string };
type BillingOverview = { monthlyRevenueCents: number; pendingPayments: number; upcomingRenewals: number; activeLicenses: number };

const TENANT_BADGE: Record<TenantGroup, React.CSSProperties> = {
  active: badgeStyle(COLORS.successSoft, COLORS.success), trial: badgeStyle(COLORS.navySoft, COLORS.navy),
  suspended: badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt), cancelled: badgeStyle(COLORS.dangerSoft, COLORS.danger),
};
const TENANT_LABEL: Record<TenantGroup, string> = { active: 'Activo', trial: 'Trial', suspended: 'Suspendido', cancelled: 'Cancelado' };

const AUDIT_ICON_STYLE = { width: 26, height: 26, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1 } as const;

export default function DashboardSuperAdminPage() {
  const [nav, setNav] = useState('resumen');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filter, setFilter] = useState<'all' | TenantGroup>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPhase, setCreatePhase] = useState<'form' | 'progress' | 'done'>('form');
  const [createStep, setCreateStep] = useState(0);
  const [newName, setNewName] = useState(''); const [newCity, setNewCity] = useState(''); const [newUnits, setNewUnits] = useState('');
  const [newAdminName, setNewAdminName] = useState(''); const [newAdminEmail, setNewAdminEmail] = useState('');
  const [tiers, setTiers] = useState<{ id: string; from: string; to: string; price: string }[]>([]);
  const [finSubTab, setFinSubTab] = useState<'licencia' | 'pagos'>('licencia');
  const [auditLog, setAuditLog] = useState<{ icon: string; action: string; time: string }[]>([]);
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalTenants: 0, activeTenants: 0, suspendedTenants: 0, trialTenants: 0, totalUsers: 0, totalPqrs: 0, closedPqrs: 0 });
  const [billing, setBilling] = useState<BillingOverview | null>(null);

  const addAudit = (icon: string, action: string) => setAuditLog((l) => [{ icon, action, time: 'ahora' }, ...l]);

  const toTenantGroup = (status?: string | null): TenantGroup => {
    if (status === 'TRIAL') return 'trial';
    if (status === 'SUSPENDED') return 'suspended';
    if (status === 'CANCELLED') return 'cancelled';
    return 'active';
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatMoney = (cents: number, currency = 'COP') => new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);

  const mapTenant = (tenant: ApiTenant): Tenant => {
    const admin = tenant.users?.[0];
    const subscription = tenant.subscription;
    const units = Number(tenant.units || subscription?.unitsSnapshot || 0);
    const open = Number(tenant._count?.pqrs || 0);
    return {
      id: tenant.id,
      name: tenant.name,
      city: tenant.city || '-',
      units,
      plan: units <= 50 ? '1-50' : units <= 100 ? '51-100' : units <= 200 ? '101-200' : '201+',
      group: toTenantGroup(tenant.status),
      adminName: admin?.name || '-',
      adminEmail: admin?.email || '-',
      adminPhone: '-',
      startDate: formatDate(tenant.createdAt),
      pqrsTotal: Number(tenant._count?.pqrs || 0),
      pqrsOpen: open,
      licenseEnd: formatDate(subscription?.currentPeriodEnd),
      paymentStatus: subscription?.status === 'ACTIVE' || subscription?.status === 'TRIAL' ? 'al_dia' : 'mora',
      moraDays: 0,
    };
  };

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/platform/super-admin', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo cargar SUPER_ADMIN');
      const data = await response.json();
      setStats(data.stats);
      setBilling(data.billing);
      setTiers((data.pricingRules || []).map((rule: ApiPricingRule) => ({
        id: rule.id,
        from: String(rule.minUnits),
        to: rule.maxUnits ? String(rule.maxUnits) : '+',
        price: rule.isActive ? `${formatMoney(rule.priceCents, rule.currency)}/mes` : `${formatMoney(rule.priceCents, rule.currency)}/mes (inactiva)`,
      })));
      setTenants((data.tenants || []).map(mapTenant));
      setAuditLog((data.recentAuditLogs || []).map((entry: ApiAuditLog) => ({
        icon: 'A',
        action: `${entry.action} sobre ${entry.targetType}`,
        time: formatDate(entry.createdAt),
      })));
    } catch (error) {
      console.error(error);
      showToast('No se pudieron cargar los datos reales');
    } finally {
      setLoading(false);
    }
  };

  const updateTenantStatus = async (id: string, status: 'ACTIVE' | 'SUSPENDED') => {
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateTenantStatus', tenantId: id, status }),
    });
    if (!response.ok) {
      showToast('No se pudo actualizar el conjunto');
      return;
    }
    await fetchOverview();
    showToast(status === 'ACTIVE' ? 'Conjunto reactivado' : 'Conjunto suspendido');
  };

  useEffect(() => {
    void fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = tenants.find((t) => t.id === selectedId);
  const kpis = [
    { label: 'Total conjuntos', value: String(stats.totalTenants), color: '#1D1D1F' },
    { label: 'Activos', value: String(stats.activeTenants), color: COLORS.success },
    { label: 'Suspendidos', value: String(stats.suspendedTenants), color: COLORS.textSecondaryAlt },
    { label: 'Trial', value: String(stats.trialTenants), color: COLORS.navy },
    { label: 'Usuarios totales', value: String(stats.totalUsers), color: COLORS.navy },
    { label: 'PQRS abiertas', value: String(Math.max(0, stats.totalPqrs - stats.closedPqrs)), color: COLORS.warning },
    { label: 'PQRS totales', value: String(stats.totalPqrs), color: '#1D1D1F' },
    { label: 'Ingresos del mes', value: billing ? formatMoney(billing.monthlyRevenueCents) : '', color: COLORS.success },
    { label: 'Pagos pendientes', value: String(billing?.pendingPayments ?? 0), color: COLORS.warning },
    { label: 'Renovaciones próximas', value: String(billing?.upcomingRenewals ?? 0), color: COLORS.navy },
  ];
  const q = search.trim().toLowerCase();
  const filteredTenants = tenants.filter((t) => (filter === 'all' || t.group === filter) && (!q || t.name.toLowerCase().includes(q) || t.city.toLowerCase().includes(q)));

  const suspend = async (id: string) => { await updateTenantStatus(id, 'SUSPENDED'); };
  const reactivate = async (id: string) => { await updateTenantStatus(id, 'ACTIVE'); };
  const cancelTenant = async (id: string) => { await updateTenantStatus(id, 'SUSPENDED'); setConfirmingCancel(false); };

  const submitCreate = async () => {
    if (!newName.trim() || !newUnits || !newAdminEmail.trim()) return;
    setCreatePhase('progress');
    setCreateStep(1);
    try {
      const response = await fetch('/api/platform/super-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createTenant',
          name: newName,
          slug: newName,
          city: newCity,
          units: Number(newUnits),
          adminName: newAdminName || newAdminEmail,
          adminEmail: newAdminEmail,
        }),
      });
      if (!response.ok) throw new Error('No se pudo crear el conjunto');
      setCreateStep(5);
      await fetchOverview();
      setCreatePhase('done');
      showToast('Conjunto creado con datos reales');
    } catch (error) {
      console.error(error);
      setCreatePhase('form');
      showToast('No se pudo crear el conjunto');
    }
  };

  const createSteps = ['Creando el conjunto…', 'Creando el administrador…', 'Calculando la tarifa…', 'Generando la licencia (trial)…', 'Enviando invitación por correo…'];

  const navGroups: NavGroup[] = NAV_DEFS.map((n) => n.key ? { key: n.key, label: n.label, onClick: () => setNav(n.key!) } : { header: n.header });

  return (
    <SuperAdminShell navGroups={navGroups} activeKey={nav} mobileTitle="Plataforma">

      {nav === 'resumen' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Resumen de la plataforma</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 22px' }}>{loading ? 'Cargando datos reales...' : stats.totalTenants + ' conjuntos administrados'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 24 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 16 }}>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 9 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>Conjuntos recientes</span>
              <button type="button" onClick={() => setNav('conjuntos')} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12.5, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Ver todos ›</button>
            </div>
            {tenants.slice(0, 5).map((t) => (
              <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 14, padding: '14px 22px', cursor: 'pointer', background: 'none', border: 'none', borderBottom: `1px solid ${COLORS.borderSoft}`, borderRadius: 0, font: 'inherit', textAlign: 'left' }}>
                <span style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 56 }}>{t.units}</span>
                <span style={TENANT_BADGE[t.group]}>{TENANT_LABEL[t.group]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {nav === 'conjuntos' && (
        <div className="apl-up">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
            <div><h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Conjuntos</h1><p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: 0 }}>Administra, edita, suspende o cancela conjuntos</p></div>
            <button type="button" onClick={() => { setCreateOpen(true); setCreatePhase('form'); setNewName(''); setNewCity(''); setNewUnits(''); setNewAdminName(''); setNewAdminEmail(''); }} style={{ background: COLORS.navy, border: 'none', color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '10px 18px', borderRadius: RADIUS.pill, cursor: 'pointer', font: 'inherit' }}>+ Crear conjunto</button>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, ciudad o administrador…" style={{ width: '100%', maxWidth: 420, height: 40, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 10, fontSize: 13, fontFamily: 'inherit', marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {(['all', 'active', 'trial', 'suspended', 'cancelled'] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} style={{ ...tabStyle(filter === f), border: 'none', font: 'inherit', cursor: 'pointer' }}>{f === 'all' ? 'Todos' : TENANT_LABEL[f]}</button>)}
          </div>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {filteredTenants.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>Ningún conjunto coincide con esta búsqueda o filtro.</div>}
            {filteredTenants.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ flex: 1, minWidth: 150, fontSize: 13, fontWeight: 700 }}>{t.name}</span>
                <span style={{ width: 90, fontSize: 12, color: COLORS.textSecondary }}>{t.city}</span>
                <span style={{ width: 120, fontSize: 12, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.adminName}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 56 }}>{t.units}</span>
                <span style={{ width: 90, fontSize: 12, color: COLORS.textSecondary }}>{t.plan}</span>
                <span style={{ width: 90 }}><span style={TENANT_BADGE[t.group]}>{TENANT_LABEL[t.group]}</span></span>
                <span style={{ width: 170, display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
                  <button type="button" onClick={() => setSelectedId(t.id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Ver</button>
                  <button type="button" onClick={() => (t.group === 'suspended' ? reactivate(t.id) : suspend(t.id))} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 12, fontWeight: 700, color: t.group === 'suspended' ? COLORS.success : COLORS.warning, cursor: 'pointer' }}>{t.group === 'suspended' ? 'Reactivar' : 'Suspender'}</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nav === 'financiero' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Licencias y pagos</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 20px' }}>Estado de licencias e historial de cobro</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            <button type="button" onClick={() => setFinSubTab('licencia')} style={{ ...tabStyle(finSubTab === 'licencia'), border: 'none', font: 'inherit', cursor: 'pointer' }}>Licencia</button>
            <button type="button" onClick={() => setFinSubTab('pagos')} style={{ ...tabStyle(finSubTab === 'pagos'), border: 'none', font: 'inherit', cursor: 'pointer' }}>Pagos</button>
          </div>

          {finSubTab === 'licencia' && (
            <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
              {tenants.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
                  <span style={TENANT_BADGE[t.group]}>{TENANT_LABEL[t.group]}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 170 }}>{t.licenseEnd}</span>
                  {t.paymentStatus === 'mora' && <span style={badgeStyle(COLORS.warningSoft, COLORS.warning)}>Mora {t.moraDays}d</span>}
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <button type="button" onClick={() => { setTenants((ts) => ts.map((x) => x.id === t.id ? { ...x, paymentStatus: 'al_dia', moraDays: 0, group: x.group === 'suspended' ? 'active' : x.group, licenseEnd: '+30 días desde hoy' } : x)); showToast('Licencia renovada ✓'); addAudit('◆', 'Renovó una licencia'); }} style={{ border: 'none', font: 'inherit', fontSize: 12, fontWeight: 700, color: '#FFFFFF', background: COLORS.success, padding: '7px 13px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Renovar</button>
                    <button type="button" onClick={() => (t.group === 'suspended' ? reactivate(t.id) : suspend(t.id))} style={{ border: 'none', font: 'inherit', fontSize: 12, fontWeight: 700, color: '#1D1D1F', background: COLORS.neutralSoft, padding: '7px 13px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>{t.group === 'suspended' ? 'Reactivar' : 'Suspender'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {finSubTab === 'pagos' && (
            <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
              {[
                { conjunto: 'Torres del Prado', date: '05 jul', amount: '$2.100.000', method: 'PSE', status: 'Aprobado' },
                { conjunto: 'Parque Residencial Calle 100', date: '05 jul', amount: '$1.240.000', method: 'PSE', status: 'Aprobado' },
                { conjunto: 'Mirador de la Sabana', date: '01 jul', amount: '$1.100.000', method: 'PSE', status: 'Pendiente' },
                { conjunto: 'Alameda Real', date: '15 jun', amount: '$1.950.000', method: 'PSE', status: 'Rechazado' },
              ].map((tx, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <span style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 700 }}>{tx.conjunto}</span>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary, width: 80 }}>{tx.method}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 70 }}>{tx.date}</span>
                  <span style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 600, width: 100, textAlign: 'right' }}>{tx.amount}</span>
                  <span style={tx.status === 'Aprobado' ? badgeStyle(COLORS.successSoft, COLORS.success) : tx.status === 'Pendiente' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : badgeStyle(COLORS.dangerSoft, COLORS.danger)}>{tx.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {nav === 'precios' && (
        <div className="apl-up" style={{ maxWidth: 680 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 20px' }}>Reglas de precio</h1>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
            <div style={{ display: 'flex', padding: '0 16px 8px', fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700 }}>
              <span style={{ flex: 1 }}>DESDE</span><span style={{ flex: 1 }}>HASTA</span><span style={{ flex: 2 }}>PRECIO MENSUAL</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tiers.map((p) => (
                <div key={p.id} style={{ background: COLORS.bgCard, borderRadius: 11, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{p.from}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{p.to}</span>
                  <span style={{ flex: 2, fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 600 }}>{p.price}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 12 }}>Estos rangos alimentan el cálculo automático de precio al crear un conjunto nuevo. Edición inline: conectar a tu API de tarifas.</p>
        </div>
      )}

      {nav === 'analytics' && (
        <div className="apl-up" style={{ maxWidth: 900 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 20px' }}>Analytics</h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 20 }}>
            {[
              { title: 'PQRS por estado', subtitle: 'Distribución actual', data: [340, 210, 1900], labels: ['Abiertas', 'En proceso', 'Cerradas'], color: COLORS.navy },
              { title: 'Tiempo promedio de respuesta', subtitle: 'Días para cerrar, por mes', data: [3.1, 2.8, 2.6, 2.5, 2.3, 2.1], labels: ['Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul'], color: COLORS.warning },
              { title: 'Usuarios', subtitle: 'Registrados en toda la plataforma', data: [8200, 9100, 9800, 10600, 11500, 12400], labels: ['Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul'], color: '#4A6FA5' },
              { title: 'Ingresos', subtitle: 'MRR en millones de pesos', data: [142, 156, 149, 168, 172, 184], labels: ['Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul'], color: COLORS.success },
            ].map((c) => {
              const max = Math.max(...c.data);
              return (
                <div key={c.title} style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 18 }}>{c.subtitle}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 110 }}>
                    {c.data.map((v, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                        <div style={{ fontSize: 10, fontWeight: 700 }}>{v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}</div>
                        <div style={{ width: '100%', maxWidth: 28, height: `${Math.max(10, (v / max) * 100)}%`, background: c.color, borderRadius: '5px 5px 0 0' }} />
                        <div style={{ fontSize: 9.5, color: COLORS.textMuted }}>{c.labels[i]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {nav === 'usuarios' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 20px' }}>Usuarios</h1>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {tenants.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <div style={{ width: 32, height: 32, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{t.adminName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
                <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700 }}>{t.adminName}</span>
                <span style={{ fontSize: 12.5, color: COLORS.textSecondary, width: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>Admin</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nav === 'auditoria' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 20px' }}>Auditoría</h1>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {auditLog.length === 0
              ? <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>Aún no hay acciones registradas en esta sesión.</div>
              : auditLog.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <div style={AUDIT_ICON_STYLE}>{e.icon}</div>
                  <div><div style={{ fontSize: 13, fontWeight: 700 }}>{e.action}</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>Sofía Peña (Super Admin) · {e.time}</div></div>
                </div>
              ))}
          </div>
        </div>
      )}

      {nav === 'soporte' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 20px' }}>Centro de soporte</h1>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {[
              { subject: 'No puedo generar el reporte mensual', conjunto: 'Mirador de la Sabana', date: '07 jul', status: 'Abierta' },
              { subject: 'Duda sobre facturación de unidades nuevas', conjunto: 'Torres del Prado', date: '05 jul', status: 'Respondida' },
            ].map((tk, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ flex: 1, minWidth: 160 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{tk.subject}</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{tk.conjunto} · {tk.date}</div></span>
                <span style={tk.status === 'Abierta' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : badgeStyle(COLORS.navySoft, COLORS.navy)}>{tk.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nav === 'config' && (
        <div className="apl-up" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: 0 }}>Configuración</h1>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Branding</div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre de la plataforma</label>
            <input defaultValue="PQRS Services" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 14, fontFamily: 'inherit', background: '#FFFFFF' }} />
          </div>
          <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Feature flags</div>
            {['Adjuntar evidencias en PQRS', 'Auto-registro de residentes'].map((label) => {
              const on = true;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
                  <div style={toggleTrackStyle(on)}><div style={toggleDotStyle(on)} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create tenant sheet */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} maxWidth={480}>
        {createPhase === 'form' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Crear conjunto</h2>
              <CloseButton onClick={() => setCreateOpen(false)} />
            </div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>Se creará el conjunto, su administrador y la licencia automáticamente.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Nombre del conjunto</label><input value={newName} onChange={(e) => setNewName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit' }} /></div>
              <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Ciudad</label><input value={newCity} onChange={(e) => setNewCity(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit' }} /></div>
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Número de unidades</label>
            <input type="number" value={newUnits} onChange={(e) => setNewUnits(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 16 }} />
            <div style={{ borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 14, marginBottom: 6, fontSize: 12, color: COLORS.textMuted, fontWeight: 700 }}>ADMINISTRADOR PRINCIPAL</div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Nombre</label>
            <input value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Correo</label>
            <input value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 24 }} />
            <button type="button" onClick={submitCreate} disabled={!(newName.trim() && newUnits && newAdminEmail.trim())} style={{ width: '100%', border: 'none', font: 'inherit', textAlign: 'center', background: (newName.trim() && newUnits && newAdminEmail.trim()) ? COLORS.navy : COLORS.neutralSoft, color: (newName.trim() && newUnits && newAdminEmail.trim()) ? '#FFFFFF' : COLORS.textMuted, fontSize: 14.5, fontWeight: 700, padding: '14px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Crear conjunto</button>
          </>
        )}
        {createPhase === 'progress' && (
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 22px' }}>Creando &quot;{newName}&quot;…</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {createSteps.map((label, i) => {
                const done = i < createStep;
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 999, background: done ? COLORS.success : COLORS.neutralSoft, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{done ? '✓' : ''}</div>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: done ? '#1D1D1F' : '#B0B0B5' }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {createPhase === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, background: COLORS.successSoft, color: COLORS.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 18px' }}>✓</div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 8px' }}>Conjunto creado</h2>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 24px' }}>Se envió una invitación a {newAdminEmail} para activar su cuenta de administrador.</p>
            <button type="button" onClick={() => setCreateOpen(false)} style={{ width: '100%', border: 'none', font: 'inherit', background: COLORS.navy, color: '#FFFFFF', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Listo</button>
          </div>
        )}
      </Sheet>

      {/* Tenant detail sheet */}
      <Sheet open={!!selected} onClose={() => { setSelectedId(null); setConfirmingCancel(false); }} maxWidth={600}>
        {selected && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={TENANT_BADGE[selected.group]}>{TENANT_LABEL[selected.group]}</span>
              <CloseButton onClick={() => { setSelectedId(null); setConfirmingCancel(false); }} />
            </div>
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: '12px 0 4px' }}>{selected.name}</h2>
            <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: '0 0 20px' }}>{selected.city} · Cliente desde {selected.startDate}</p>

            {!confirmingCancel && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                <button type="button" onClick={() => (selected.group === 'suspended' ? reactivate(selected.id) : suspend(selected.id))} style={{ border: 'none', font: 'inherit', background: selected.group === 'suspended' ? COLORS.success : COLORS.navy, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '10px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>{selected.group === 'suspended' ? 'Reactivar conjunto' : 'Suspender conjunto'}</button>
                <button type="button" onClick={() => setConfirmingCancel(true)} style={{ background: 'none', font: 'inherit', border: `1.5px solid ${COLORS.warningSoft}`, color: COLORS.warning, fontSize: 12.5, fontWeight: 700, padding: '10px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Cancelar conjunto</button>
              </div>
            )}
            {confirmingCancel && (
              <div style={{ border: `1.5px solid #F3D9B1`, background: COLORS.warningSoft, borderRadius: 14, padding: 18, marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.warning, marginBottom: 6 }}>¿Cancelar este conjunto?</div>
                <div style={{ fontSize: 12.5, color: COLORS.warning, marginBottom: 14 }}>Esta acción no se puede deshacer.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => cancelTenant(selected.id)} style={{ border: 'none', font: 'inherit', background: COLORS.warning, color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Sí, cancelar</button>
                  <button type="button" onClick={() => setConfirmingCancel(false)} style={{ background: 'none', border: 'none', font: 'inherit', color: COLORS.warning, fontSize: 13, fontWeight: 700, padding: '10px 10px', cursor: 'pointer' }}>Volver</button>
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 10 }}>INFORMACIÓN GENERAL</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
              <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 12 }}><div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, marginBottom: 5 }}>UNIDADES</div><div style={{ fontSize: 15, fontWeight: 800 }}>{selected.units}</div></div>
              <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 12 }}><div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, marginBottom: 5 }}>PLAN</div><div style={{ fontSize: 15, fontWeight: 800 }}>{selected.plan}</div></div>
              <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 12 }}><div style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, marginBottom: 5 }}>PQRS ABIERTAS</div><div style={{ fontSize: 15, fontWeight: 800 }}>{selected.pqrsOpen}</div></div>
            </div>
            <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{selected.adminName}</div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{selected.adminEmail} · {selected.adminPhone}</div>
            </div>
          </>
        )}
      </Sheet>

      <Toast message={toast} />
    </SuperAdminShell>
  );
}
