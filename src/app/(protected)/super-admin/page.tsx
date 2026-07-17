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
  { header: 'CUENTA' },
  { key: 'cuenta', label: 'Mi cuenta' },
];

type TenantGroup = 'active' | 'trial' | 'pending_payment' | 'grace' | 'suspended' | 'cancelled';
type Tenant = {
  id: string; name: string; city: string; units: number; plan: string; group: TenantGroup;
  adminName: string; adminEmail: string; adminPhone: string; startDate: string;
  pqrsTotal: number; pqrsOpen: number; licenseEnd: string; paymentStatus: 'al_dia' | 'mora'; moraDays: number;
  trialDaysLeft: number | null;
};

type ApiTenant = {
  id: string;
  name: string;
  city?: string | null;
  units?: number | null;
  status?: string | null;
  createdAt?: string | null;
  users?: { name?: string | null; email?: string | null }[];
  subscription?: { status?: string | null; unitsSnapshot?: number | null; currentPeriodEnd?: string | null; trialEndsAt?: string | null } | null;
  _count?: { users?: number; pqrs?: number };
};

type ApiPricingRule = { id: string; minUnits: number; maxUnits: number | null; priceCents: number; currency: string; isActive: boolean };
type ApiAuditLog = {
  action: string;
  targetType: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown> | null;
  actor?: { name?: string | null; email?: string | null } | null;
  createdAt: string;
};
type BillingOverview = {
  monthlyRevenueCents: number;
  totalRevenueCents: number;
  monthlyApprovedPayments: number;
  pendingPayments: number;
  upcomingRenewals: number;
  activeLicenses: number;
  mrrGrowthPercent: number | null;
  churnThisMonth: number;
  avgPqrsCloseTimeDays: number | null;
};
type ApiPayment = { id: string; tenantName: string; amountCents: number; currency: string; status: string; provider: string; createdAt: string };
type IntegrationStatus = { connected: boolean };
type IntegrationsFull = {
  resend: { connected: boolean; fromEmailConfigured: boolean };
  supabaseStorage: { connected: boolean };
  mercadoPago: { connected: boolean; webhookSecretConfigured: boolean };
};
type GeneralSettings = { platformName: string; pqrsCloseSlaDays: number; supportTicketsEnabled: boolean; transactionalEmailEnabled: boolean };

type AnalyticsData = {
  mrrTrend: { month: string; revenueCents: number }[];
  newTenantsTrend: { month: string; count: number }[];
  closeTimeTrend: { month: string; avgDays: number | null }[];
  closeTimeBuckets: { label: string; count: number; percent: number }[];
  backlogAging: { label: string; count: number }[];
  pqrsByType: { tipo: string; count: number }[];
  atRiskTenants: { tenantId: string; name: string; moraDays: number }[];
  topTenantsByRevenue: { name: string; units: number; priceCents: number; currency: string }[];
  trialConversion: { converted: number; lost: number; ratePercent: number | null };
};

const PQRS_TYPE_LABEL: Record<string, string> = { PETICION: 'Petición', QUEJA: 'Queja', RECLAMO: 'Reclamo', SUGERENCIA: 'Sugerencia', SIN_CLASIFICAR: 'Sin clasificar' };

const MIN_PRICING_RULE_COP = 50000;
const MAX_PRICING_RULE_COP = 1000000;

type TenantUsersDetail = {
  id: string;
  name: string;
  users: { id: string; name: string; email: string; role: string; bloque: number | null; apto: number | null; isActive: boolean; createdAt: string }[];
} | null;

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Administrador', CONSEJO: 'Consejo', RESIDENTE: 'Residente' };
const ROLE_BADGE = (role: string) => {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return badgeStyle(COLORS.navySoft, COLORS.navy);
  if (role === 'CONSEJO') return badgeStyle(COLORS.successSoft, COLORS.success);
  return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
};

const AUDIT_CATEGORY_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'conjuntos', label: 'Conjuntos' },
  { key: 'facturacion', label: 'Facturación y pagos' },
  { key: 'administracion', label: 'Administración' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'pqrs', label: 'PQRS' },
  { key: 'notificaciones', label: 'Notificaciones' },
  { key: 'soporte', label: 'Soporte' },
];
type AuditCounts = { total: number; conjuntos: number; facturacion: number; administracion: number; usuarios: number; pqrs: number; notificaciones: number; soporte: number };
const AUDIT_PAGE_SIZE = 30;

type ApiSupportTicket = {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: 'ABIERTA' | 'RESPONDIDA' | 'CERRADA';
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  tenant: { name: string };
  createdBy: { name: string; email: string };
};
type SupportCounts = { abierta: number; respondida: number; cerrada: number; total: number };
const SUPPORT_CATEGORY_LABEL: Record<string, string> = { TECNICO: 'Técnico', FACTURACION: 'Facturación', CUENTA: 'Cuenta', OTRO: 'Otro' };
const SUPPORT_STATUS_LABEL: Record<string, string> = { ABIERTA: 'Abierta', RESPONDIDA: 'Respondida', CERRADA: 'Cerrada' };
const supportStatusBadge = (status: string) => status === 'ABIERTA' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : status === 'RESPONDIDA' ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);

const PAYMENT_STATUS_LABEL: Record<string, string> = { APPROVED: 'Aprobado', PENDING: 'Pendiente', REJECTED: 'Rechazado' };
const paymentBadge = (status: string) => status === 'APPROVED' ? badgeStyle(COLORS.successSoft, COLORS.success) : status === 'PENDING' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : badgeStyle(COLORS.dangerSoft, COLORS.danger);

const TENANT_BADGE: Record<TenantGroup, React.CSSProperties> = {
  active: badgeStyle(COLORS.successSoft, COLORS.success), trial: badgeStyle(COLORS.navySoft, COLORS.navy),
  pending_payment: badgeStyle(COLORS.warningSoft, COLORS.warning),
  grace: badgeStyle(COLORS.warningSoft, COLORS.warning),
  suspended: badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt), cancelled: badgeStyle(COLORS.dangerSoft, COLORS.danger),
};
const TENANT_LABEL: Record<TenantGroup, string> = { active: 'Activo', trial: 'Trial', pending_payment: 'Falta primer pago', grace: 'En mora', suspended: 'Suspendido', cancelled: 'Cancelado' };

const AUDIT_ICON_STYLE = { width: 26, height: 26, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1 } as const;

function MiniBarChart({ data, color, formatValue }: { data: { label: string; value: number | null }[]; color: string; formatValue: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 110 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>{d.value != null ? formatValue(d.value) : '—'}</div>
          <div style={{ width: '100%', maxWidth: 28, height: `${d.value != null ? Math.max(6, (d.value / max) * 100) : 3}%`, background: d.value != null ? color : COLORS.neutralSoft, borderRadius: '5px 5px 0 0' }} />
          <div style={{ fontSize: 9.5, color: COLORS.textMuted }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

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
  const [tiers, setTiers] = useState<ApiPricingRule[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleMinUnits, setRuleMinUnits] = useState('');
  const [ruleMaxUnits, setRuleMaxUnits] = useState('');
  const [rulePrice, setRulePrice] = useState('');
  const [addingRule, setAddingRule] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [ruleConfirmStep, setRuleConfirmStep] = useState(false);
  const [finSubTab, setFinSubTab] = useState<'licencia' | 'pagos'>('licencia');
  const [conjuntosVisible, setConjuntosVisible] = useState(10);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState(''); const [editCity, setEditCity] = useState(''); const [editUnits, setEditUnits] = useState('');
  const [applyingOverdue, setApplyingOverdue] = useState(false);
  const [payments, setPayments] = useState<ApiPayment[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'APPROVED' | 'PENDING' | 'REJECTED'>('all');
  const [mercadoPago, setMercadoPago] = useState<IntegrationStatus | null>(null);
  const [integrationsFull, setIntegrationsFull] = useState<IntegrationsFull | null>(null);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({ platformName: 'PQRS Services', pqrsCloseSlaDays: 7, supportTicketsEnabled: true, transactionalEmailEnabled: true });
  const [platformNameInput, setPlatformNameInput] = useState('PQRS Services');
  const [slaDaysInput, setSlaDaysInput] = useState('7');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [graceDays, setGraceDays] = useState(5);
  const [graceDaysInput, setGraceDaysInput] = useState('5');
  const [pricingCapsMinCents, setPricingCapsMinCents] = useState(MIN_PRICING_RULE_COP * 100);
  const [pricingCapsMaxCents, setPricingCapsMaxCents] = useState(MAX_PRICING_RULE_COP * 100);
  const [capsMinInput, setCapsMinInput] = useState(String(MIN_PRICING_RULE_COP));
  const [capsMaxInput, setCapsMaxInput] = useState(String(MAX_PRICING_RULE_COP));
  const [capsError, setCapsError] = useState<string | null>(null);
  const [capsConfirmStep, setCapsConfirmStep] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [usersTenantId, setUsersTenantId] = useState<string | null>(null);
  const [usersTenantDetail, setUsersTenantDetail] = useState<TenantUsersDetail | null>(null);
  const [usersTenantLoading, setUsersTenantLoading] = useState(false);
  const [usersSearch, setUsersSearch] = useState('');
  const [auditCategory, setAuditCategory] = useState('all');
  const [auditCounts, setAuditCounts] = useState<AuditCounts | null>(null);
  const [auditEntries, setAuditEntries] = useState<ApiAuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [supportFilter, setSupportFilter] = useState('all');
  const [supportTickets, setSupportTickets] = useState<ApiSupportTicket[]>([]);
  const [supportCounts, setSupportCounts] = useState<SupportCounts | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [respondingTicket, setRespondingTicket] = useState<ApiSupportTicket | null>(null);
  const [responseText, setResponseText] = useState('');
  const [closeOnRespond, setCloseOnRespond] = useState(true);
  const [auditLog, setAuditLog] = useState<ApiAuditLog[]>([]);
  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalTenants: 0, activeTenants: 0, suspendedTenants: 0, trialTenants: 0, totalUsers: 0, totalPqrs: 0, closedPqrs: 0 });
  const [billing, setBilling] = useState<BillingOverview | null>(null);

  const toTenantGroup = (status?: string | null): TenantGroup => {
    if (status === 'PENDING_PAYMENT') return 'pending_payment';
    if (status === 'TRIAL') return 'trial';
    if (status === 'GRACE_PERIOD') return 'grace';
    if (status === 'SUSPENDED') return 'suspended';
    if (status === 'CANCELLED') return 'cancelled';
    return 'active';
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatMoney = (cents: number, currency = 'COP') => new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);

  const formatRelativeTime = (value: string) => {
    const diffMs = Date.now() - new Date(value).getTime();
    const minutes = Math.round(diffMs / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    if (days === 1) return 'ayer';
    if (days < 7) return `hace ${days} días`;
    return formatDate(value);
  };

  const humanizeAudit = (entry: ApiAuditLog): { text: string; color: string } => {
    const meta = entry.metadata || {};
    const tenantName = (meta.name as string | undefined)
      || tenants.find((t) => t.id === (entry.tenantId || (meta.tenantId as string | undefined)))?.name
      || (meta.slug as string | undefined)
      || 'un conjunto';
    switch (entry.action) {
      case 'TENANT_CREATED':
        return { text: `Se creó el conjunto "${tenantName}"`, color: COLORS.navy };
      case 'TENANT_REACTIVATED':
        return { text: `Se activó el conjunto "${tenantName}"`, color: COLORS.success };
      case 'TENANT_SUSPENDED':
        return { text: `Conjunto "${tenantName}" suspendido`, color: COLORS.warning };
      case 'TENANT_CANCELLED':
        return { text: `Conjunto "${tenantName}" cancelado`, color: COLORS.danger };
      case 'TENANT_UPDATED':
        return { text: `Se editó el conjunto "${tenantName}"`, color: COLORS.navy };
      case 'TENANT_OVERDUE_RULES_APPLIED': {
        const grace = Number(meta.movedToGracePeriod ?? 0);
        const suspended = Number(meta.movedToSuspended ?? 0);
        return { text: `Reglas de mora ejecutadas: ${grace} a mora, ${suspended} suspendidos`, color: COLORS.warning };
      }
      case 'SUBSCRIPTION_CREATED':
        return { text: `Nueva licencia creada — ${tenantName}`, color: COLORS.navy };
      case 'SUBSCRIPTION_RENEWED':
        return { text: `Pago de licencia confirmado — ${tenantName}`, color: COLORS.success };
      case 'MERCADO_PAGO_WEBHOOK_PROCESSED':
        return { text: `Pago procesado — ${tenantName}`, color: COLORS.success };
      case 'INVITATION_ACCEPTED':
        return { text: `Nuevo usuario registrado en ${tenantName}`, color: COLORS.navy };
      case 'PLATFORM_SETTING_CHANGED':
        return { text: 'Configuración de la plataforma actualizada', color: COLORS.textSecondaryAlt };
      case 'PRICING_RULE_CHANGED':
        return { text: 'Reglas de precio actualizadas', color: COLORS.textSecondaryAlt };
      case 'SUPPORT_TICKET_CREATED':
        return { text: `Nueva solicitud de soporte — ${tenantName}`, color: COLORS.navy };
      case 'SUPPORT_TICKET_RESPONDED':
        return { text: `Solicitud de soporte respondida — ${tenantName}`, color: COLORS.success };
      case 'SUPPORT_TICKET_CLOSED':
        return { text: `Solicitud de soporte cerrada — ${tenantName}`, color: COLORS.textSecondaryAlt };
      default:
        return { text: `${entry.action.replaceAll('_', ' ').toLowerCase()}${entry.targetType ? ` · ${entry.targetType}` : ''}`, color: COLORS.textMuted };
    }
  };

  const findPlanLabel = (units: number, rules: ApiPricingRule[]) => {
    const match = rules.find((r) => r.isActive && units >= r.minUnits && (r.maxUnits == null || units <= r.maxUnits));
    if (!match) return 'Sin plan';
    return match.maxUnits ? `${match.minUnits}-${match.maxUnits}` : `${match.minUnits}+`;
  };

  const mapTenant = (tenant: ApiTenant, rules: ApiPricingRule[]): Tenant => {
    const admin = tenant.users?.[0];
    const subscription = tenant.subscription;
    const units = Number(tenant.units || subscription?.unitsSnapshot || 0);
    const open = Number(tenant._count?.pqrs || 0);
    const group = toTenantGroup(tenant.status);
    const daysSince = (value?: string | null) => value ? Math.max(0, Math.ceil((Date.now() - new Date(value).getTime()) / 86400000)) : 0;
    const daysUntil = (value?: string | null) => value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86400000) : null;
    return {
      id: tenant.id,
      name: tenant.name,
      city: tenant.city || '-',
      units,
      plan: findPlanLabel(units, rules),
      group,
      adminName: admin?.name || '-',
      adminEmail: admin?.email || '-',
      adminPhone: '-',
      startDate: formatDate(tenant.createdAt),
      pqrsTotal: Number(tenant._count?.pqrs || 0),
      pqrsOpen: open,
      licenseEnd: formatDate(subscription?.currentPeriodEnd),
      paymentStatus: subscription?.status === 'ACTIVE' || subscription?.status === 'TRIAL' ? 'al_dia' : 'mora',
      moraDays: group === 'grace' ? daysSince(subscription?.currentPeriodEnd) : 0,
      trialDaysLeft: group === 'trial' ? daysUntil(subscription?.trialEndsAt) : null,
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
      setTiers(data.pricingRules || []);
      setTenants((data.tenants || []).map((t: ApiTenant) => mapTenant(t, data.pricingRules || [])));
      setAuditLog(data.recentAuditLogs || []);
      setPayments(data.recentPayments || []);
      setMercadoPago(data.integrations?.mercadoPago || null);
      setIntegrationsFull(data.integrations || null);
      if (data.generalSettings) {
        setGeneralSettings(data.generalSettings);
        setPlatformNameInput(data.generalSettings.platformName);
        setSlaDaysInput(String(data.generalSettings.pqrsCloseSlaDays));
      }
      setGraceDays(data.graceDays ?? 5);
      setGraceDaysInput(String(data.graceDays ?? 5));
      const minCents = data.pricingCaps?.minCents ?? MIN_PRICING_RULE_COP * 100;
      const maxCents = data.pricingCaps?.maxCents ?? MAX_PRICING_RULE_COP * 100;
      setPricingCapsMinCents(minCents);
      setPricingCapsMaxCents(maxCents);
      setCapsMinInput(String(minCents / 100));
      setCapsMaxInput(String(maxCents / 100));
    } catch (error) {
      console.error(error);
      showToast('No se pudieron cargar los datos reales');
    } finally {
      setLoading(false);
    }
  };

  const updateTenantStatus = async (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED') => {
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
    showToast(status === 'ACTIVE' ? 'Conjunto reactivado' : status === 'CANCELLED' ? 'Conjunto cancelado' : 'Conjunto suspendido');
  };

  const renewSubscription = async (id: string) => {
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'renewSubscription', tenantId: id }),
    });
    if (!response.ok) {
      showToast('No se pudo renovar la licencia');
      return;
    }
    await fetchOverview();
    showToast('Licencia renovada ✓');
  };

  const openEdit = (t: Tenant) => {
    setEditingTenant(t);
    setEditName(t.name);
    setEditCity(t.city === '-' ? '' : t.city);
    setEditUnits(String(t.units));
  };

  const submitEditTenant = async () => {
    if (!editingTenant || !editName.trim() || !editUnits) return;
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateTenant', tenantId: editingTenant.id, name: editName, city: editCity, units: Number(editUnits) }),
    });
    if (!response.ok) {
      showToast('No se pudo actualizar el conjunto');
      return;
    }
    setEditingTenant(null);
    await fetchOverview();
    showToast('Conjunto actualizado ✓');
  };

  const runOverdueRules = async () => {
    setApplyingOverdue(true);
    try {
      const response = await fetch('/api/platform/super-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'applyOverdueRules' }),
      });
      if (!response.ok) {
        showToast('No se pudo ejecutar la regla de mora');
        return;
      }
      const result = await response.json();
      await fetchOverview();
      showToast(`Regla aplicada: ${result.movedToGracePeriod} a mora, ${result.movedToSuspended} suspendidos`);
    } finally {
      setApplyingOverdue(false);
    }
  };

  const submitGraceDays = async () => {
    const value = Number(graceDaysInput);
    if (!Number.isFinite(value) || value <= 0) return;
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateGraceDays', graceDays: value }),
    });
    if (!response.ok) {
      showToast('No se pudo actualizar el período de gracia');
      return;
    }
    setGraceDays(value);
    showToast('Período de gracia actualizado ✓');
  };

  const generalSettingsPost = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/platform/general-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response;
  };

  const submitPlatformName = async () => {
    if (!platformNameInput.trim()) return;
    const response = await generalSettingsPost({ action: 'updatePlatformName', value: platformNameInput.trim() });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      showToast(body?.error || 'No se pudo actualizar el nombre');
      return;
    }
    setGeneralSettings((prev) => ({ ...prev, platformName: platformNameInput.trim() }));
    showToast('Nombre de la plataforma actualizado ✓');
  };

  const submitSlaDays = async () => {
    const days = Number(slaDaysInput);
    if (!Number.isFinite(days) || days <= 0) return;
    const response = await generalSettingsPost({ action: 'updateSlaDays', value: days });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      showToast(body?.error || 'No se pudo actualizar el SLA');
      return;
    }
    setGeneralSettings((prev) => ({ ...prev, pqrsCloseSlaDays: days }));
    showToast('SLA de cierre actualizado ✓ Ya se refleja en Analytics.');
  };

  const toggleFeatureFlag = async (key: 'supportTicketsEnabled' | 'transactionalEmailEnabled') => {
    const nextValue = !generalSettings[key];
    const response = await generalSettingsPost({ action: 'updateFeatureFlag', key, value: nextValue });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      showToast(body?.error || 'No se pudo actualizar la opción');
      return;
    }
    setGeneralSettings((prev) => ({ ...prev, [key]: nextValue }));
  };

  const sendTestEmail = async () => {
    setSendingTestEmail(true);
    try {
      const response = await generalSettingsPost({ action: 'sendTestEmail' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        showToast(body?.error || 'No se pudo enviar el correo de prueba');
        return;
      }
      showToast('Correo de prueba enviado ✓ Revisa tu bandeja de entrada.');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const validateCapsForm = (): string | null => {
    const minCop = Number(capsMinInput);
    const maxCop = Number(capsMaxInput);
    if (!capsMinInput || Number.isNaN(minCop) || minCop <= 0) return 'Ingresa un tope mínimo válido.';
    if (!capsMaxInput || Number.isNaN(maxCop)) return 'Ingresa un tope máximo válido.';
    if (maxCop <= minCop) return 'El tope máximo debe ser mayor que el tope mínimo.';
    return null;
  };

  const reviewCapsForm = () => {
    const error = validateCapsForm();
    if (error) {
      setCapsError(error);
      setCapsConfirmStep(false);
      return;
    }
    setCapsError(null);
    setCapsConfirmStep(true);
  };

  const cancelCapsForm = () => {
    setCapsMinInput(String(pricingCapsMinCents / 100));
    setCapsMaxInput(String(pricingCapsMaxCents / 100));
    setCapsError(null);
    setCapsConfirmStep(false);
  };

  const submitCaps = async () => {
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updatePricingCaps', minCop: Number(capsMinInput), maxCop: Number(capsMaxInput) }),
    });
    if (!response.ok) {
      setCapsConfirmStep(false);
      setCapsError(await parseApiError(response, 'No se pudieron actualizar los topes'));
      return;
    }
    setCapsConfirmStep(false);
    await fetchOverview();
    showToast('Topes de precio actualizados ✓');
  };

  const openAddRule = () => {
    setAddingRule(true);
    setEditingRuleId(null);
    setRuleMinUnits('');
    setRuleMaxUnits('');
    setRulePrice('');
    setRuleError(null);
    setRuleConfirmStep(false);
  };

  const openEditRule = (rule: ApiPricingRule) => {
    setEditingRuleId(rule.id);
    setAddingRule(false);
    setRuleMinUnits(String(rule.minUnits));
    setRuleMaxUnits(rule.maxUnits ? String(rule.maxUnits) : '');
    setRulePrice(String(rule.priceCents / 100));
    setRuleError(null);
    setRuleConfirmStep(false);
  };

  const cancelRuleForm = () => {
    setAddingRule(false);
    setEditingRuleId(null);
    setRuleError(null);
    setRuleConfirmStep(false);
  };

  const validateRuleForm = (): string | null => {
    const min = Number(ruleMinUnits);
    const max = ruleMaxUnits ? Number(ruleMaxUnits) : null;
    const price = Number(rulePrice);
    if (!ruleMinUnits || Number.isNaN(min)) return 'Ingresa el rango "desde".';
    if (!rulePrice || Number.isNaN(price)) return 'Ingresa el precio mensual.';
    const priceCentsForCapCheck = Math.round(price * 100);
    if (priceCentsForCapCheck < pricingCapsMinCents || priceCentsForCapCheck > pricingCapsMaxCents) {
      return `El precio debe estar entre ${formatMoney(pricingCapsMinCents)} y ${formatMoney(pricingCapsMaxCents)}.`;
    }
    if (max !== null && max <= min) return 'El rango "hasta" debe ser mayor que "desde".';

    const priceCents = Math.round(price * 100);
    const others = tiers.filter((t) => t.isActive && t.id !== editingRuleId);
    for (const other of others) {
      if (min > other.minUnits && priceCents < other.priceCents) {
        return `Un conjunto de más unidades no puede costar menos que el rango de ${other.minUnits}+ unidades (${formatMoney(other.priceCents)}).`;
      }
      if (min < other.minUnits && priceCents > other.priceCents) {
        return `Un conjunto de menos unidades no puede costar más que el rango de ${other.minUnits}+ unidades (${formatMoney(other.priceCents)}).`;
      }
    }
    return null;
  };

  const reviewRuleForm = () => {
    const error = validateRuleForm();
    if (error) {
      setRuleError(error);
      setRuleConfirmStep(false);
      return;
    }
    setRuleError(null);
    setRuleConfirmStep(true);
  };

  const parseApiError = async (response: Response, fallback: string) => {
    try {
      const body = await response.json();
      return typeof body?.error === 'string' ? body.error : fallback;
    } catch {
      return fallback;
    }
  };

  const submitNewRule = async () => {
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createPricingRule',
        minUnits: Number(ruleMinUnits),
        maxUnits: ruleMaxUnits ? Number(ruleMaxUnits) : null,
        priceCents: Math.round(Number(rulePrice) * 100),
      }),
    });
    if (!response.ok) {
      setRuleConfirmStep(false);
      setRuleError(await parseApiError(response, 'No se pudo crear la regla de precio'));
      return;
    }
    setAddingRule(false);
    setRuleConfirmStep(false);
    await fetchOverview();
    showToast('Regla de precio creada ✓');
  };

  const submitEditRule = async () => {
    if (!editingRuleId) return;
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updatePricingRule',
        ruleId: editingRuleId,
        minUnits: Number(ruleMinUnits),
        maxUnits: ruleMaxUnits ? Number(ruleMaxUnits) : null,
        priceCents: Math.round(Number(rulePrice) * 100),
      }),
    });
    if (!response.ok) {
      setRuleConfirmStep(false);
      setRuleError(await parseApiError(response, 'No se pudo actualizar la regla de precio'));
      return;
    }
    setEditingRuleId(null);
    setRuleConfirmStep(false);
    await fetchOverview();
    showToast('Regla de precio actualizada ✓');
  };

  const toggleRuleActive = async (rule: ApiPricingRule) => {
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updatePricingRule', ruleId: rule.id, isActive: !rule.isActive }),
    });
    if (!response.ok) {
      showToast(await parseApiError(response, 'No se pudo actualizar la regla de precio'));
      return;
    }
    await fetchOverview();
  };

  const deleteRule = async (ruleId: string) => {
    const response = await fetch('/api/platform/super-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deletePricingRule', ruleId }),
    });
    if (!response.ok) {
      showToast(await parseApiError(response, 'No se pudo eliminar la regla de precio'));
      return;
    }
    await fetchOverview();
    showToast('Regla de precio eliminada');
  };

  useEffect(() => {
    void fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nav !== 'analytics' || analytics || analyticsLoading) return;
    setAnalyticsLoading(true);
    fetch('/api/platform/analytics', { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('No se pudo cargar analytics'); return res.json(); })
      .then((data: AnalyticsData) => setAnalytics(data))
      .catch(() => showToast('No se pudieron cargar las analíticas'))
      .finally(() => setAnalyticsLoading(false));
  }, [nav, analytics, analyticsLoading, showToast]);

  useEffect(() => {
    if (nav !== 'cuenta') return;
    fetch('/api/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.user) return;
        setAccountName(data.user.name || '');
        setAccountEmail(data.user.email || '');
        setAccountCreatedAt(data.user.createdAt || null);
      })
      .catch(() => showToast('No se pudo cargar tu cuenta'));
  }, [nav, showToast]);

  async function saveAccount() {
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: accountName }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return showToast(body?.error || 'No se pudo guardar');
    showToast('Perfil actualizado');
  }

  useEffect(() => {
    if (!usersTenantId) { setUsersTenantDetail(null); return; }
    setUsersTenantLoading(true);
    fetch(`/api/platform/tenant-users?tenantId=${usersTenantId}`, { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('No se pudo cargar los usuarios'); return res.json(); })
      .then((data: TenantUsersDetail) => setUsersTenantDetail(data))
      .catch(() => showToast('No se pudieron cargar los usuarios del conjunto'))
      .finally(() => setUsersTenantLoading(false));
  }, [usersTenantId, showToast]);

  const fetchAuditPage = (category: string, skip: number) => {
    return fetch(`/api/platform/audit-log?category=${category}&take=${AUDIT_PAGE_SIZE}&skip=${skip}`, { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('No se pudo cargar la auditoría'); return res.json(); });
  };

  useEffect(() => {
    if (nav !== 'auditoria') return;
    setAuditLoading(true);
    fetchAuditPage(auditCategory, 0)
      .then((data: { counts: AuditCounts; entries: ApiAuditLog[]; total: number }) => {
        setAuditCounts(data.counts);
        setAuditEntries(data.entries);
        setAuditTotal(data.total);
      })
      .catch(() => showToast('No se pudo cargar la auditoría'))
      .finally(() => setAuditLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, auditCategory]);

  const loadMoreAudit = () => {
    setAuditLoadingMore(true);
    fetchAuditPage(auditCategory, auditEntries.length)
      .then((data: { counts: AuditCounts; entries: ApiAuditLog[]; total: number }) => {
        setAuditEntries((prev) => [...prev, ...data.entries]);
        setAuditTotal(data.total);
      })
      .catch(() => showToast('No se pudo cargar más auditoría'))
      .finally(() => setAuditLoadingMore(false));
  };

  const fetchSupportTickets = () => {
    setSupportLoading(true);
    fetch(`/api/platform/support-tickets?status=${supportFilter}`, { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('No se pudo cargar el soporte'); return res.json(); })
      .then((data: { tickets: ApiSupportTicket[]; counts: SupportCounts }) => {
        setSupportTickets(data.tickets);
        setSupportCounts(data.counts);
      })
      .catch(() => showToast('No se pudo cargar el centro de soporte'))
      .finally(() => setSupportLoading(false));
  };

  useEffect(() => {
    if (nav !== 'soporte') return;
    fetchSupportTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, supportFilter]);

  const openRespond = (ticket: ApiSupportTicket) => {
    setRespondingTicket(ticket);
    setResponseText(ticket.response || '');
    setCloseOnRespond(true);
  };

  const submitResponse = async () => {
    if (!respondingTicket || !responseText.trim()) return;
    const response = await fetch('/api/platform/support-tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'respond', ticketId: respondingTicket.id, response: responseText.trim(), close: closeOnRespond }),
    });
    if (!response.ok) {
      showToast(await parseApiError(response, 'No se pudo enviar la respuesta'));
      return;
    }
    setRespondingTicket(null);
    fetchSupportTickets();
    showToast('Respuesta enviada — el usuario recibirá una notificación y un correo ✓');
  };

  const selected = tenants.find((t) => t.id === selectedId);
  const alertTenants = tenants.filter((t) => t.group === 'grace' || t.group === 'trial' || t.group === 'pending_payment');
  const kpis = [
    { label: 'Total conjuntos', value: String(stats.totalTenants), color: '#1D1D1F' },
    { label: 'Activos', value: String(stats.activeTenants), color: COLORS.success },
    { label: 'Suspendidos', value: String(stats.suspendedTenants), color: COLORS.textSecondaryAlt },
    { label: 'Trial', value: String(stats.trialTenants), color: COLORS.navy },
    { label: 'Usuarios registrados', value: String(stats.totalUsers), color: COLORS.navy },
    { label: 'PQRS abiertas', value: String(Math.max(0, stats.totalPqrs - stats.closedPqrs)), color: COLORS.warning },
    { label: 'PQRS cerradas', value: String(stats.closedPqrs), color: COLORS.success },
    { label: 'Ingresos MRR', value: billing ? formatMoney(billing.totalRevenueCents) : '', color: COLORS.success },
    { label: 'Pagos recibidos (mes)', value: billing ? formatMoney(billing.monthlyRevenueCents) : '', color: COLORS.success },
    { label: 'Pagos pendientes', value: String(billing?.pendingPayments ?? 0), color: COLORS.warning },
    { label: 'Renovaciones próx.', value: String(billing?.upcomingRenewals ?? 0), color: COLORS.navy },
    { label: 'Alertas', value: String(alertTenants.length), color: alertTenants.length > 0 ? COLORS.warning : '#1D1D1F' },
  ];
  const q = search.trim().toLowerCase();
  const filteredTenants = tenants.filter((t) => (filter === 'all' || t.group === filter) && (!q || t.name.toLowerCase().includes(q) || t.city.toLowerCase().includes(q)));

  const suspend = async (id: string) => { await updateTenantStatus(id, 'SUSPENDED'); };
  const reactivate = async (id: string) => { await updateTenantStatus(id, 'ACTIVE'); };
  const cancelTenant = async (id: string) => { await updateTenantStatus(id, 'CANCELLED'); setConfirmingCancel(false); };

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
      const result = await response.json();
      setCreateStep(5);
      await fetchOverview();
      setCreatePhase('done');
      showToast(result.invitationSent ? 'Conjunto creado — invitación enviada al correo del admin' : 'Conjunto creado, pero no se pudo enviar el correo de invitación. Reenvíala desde Invitaciones.');
    } catch (error) {
      console.error(error);
      setCreatePhase('form');
      showToast('No se pudo crear el conjunto');
    }
  };

  const createSteps = ['Creando el conjunto…', 'Calculando la tarifa…', 'Generando la licencia (pendiente de pago)…', 'Enviando invitación por correo…'];

  const navGroups: NavGroup[] = NAV_DEFS.map((n) => n.key ? { key: n.key, label: n.label, onClick: () => setNav(n.key!) } : { header: n.header });

  return (
    <SuperAdminShell navGroups={navGroups} activeKey={nav} mobileTitle="Plataforma" mrrWidget={billing ? { amountCents: billing.monthlyRevenueCents, growthPercent: billing.mrrGrowthPercent } : null} platformName={generalSettings.platformName}>

      {nav === 'resumen' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Resumen de la plataforma</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 22px' }}>{loading ? 'Cargando datos reales...' : stats.totalTenants + ' conjuntos administrados'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 24 }}>
            {kpis.map((k) => (
              <div key={k.label} style={{ background: COLORS.bgCard, borderRadius: 16, padding: 15 }}>
                <div style={{ fontSize: 10.5, color: COLORS.textSecondary, fontWeight: 700, marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.015em', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: COLORS.warningSoft, borderRadius: 16, padding: '18px 20px', marginBottom: 24 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: COLORS.warning, marginBottom: 9 }}>Alertas importantes</div>
            {alertTenants.length === 0 ? (
              <div style={{ fontSize: 12.5, color: COLORS.warning }}>Sin alertas activas.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {alertTenants.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: COLORS.warning }}>
                      {t.group === 'grace'
                        ? `${t.name} está en mora hace ${t.moraDays} días`
                        : `${t.name} sigue en período de prueba${t.trialDaysLeft !== null ? (t.trialDaysLeft >= 0 ? ` (vence en ${t.trialDaysLeft}d)` : ' (venció)') : ''}`}
                    </span>
                    <button type="button" onClick={() => setSelectedId(t.id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 700, color: COLORS.warning, cursor: 'pointer' }}>Ver ›</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>Conjuntos recientes</span>
                  <button type="button" onClick={() => setNav('conjuntos')} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Ver todos ›</button>
                </div>
                {tenants.length === 0 ? (
                  <div style={{ padding: '40px 22px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>{loading ? 'Cargando conjuntos…' : 'Aún no hay conjuntos registrados.'}</div>
                ) : (
                  tenants.slice(0, 5).map((t) => (
                    <button key={t.id} type="button" onClick={() => setSelectedId(t.id)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 14, padding: '14px 22px', cursor: 'pointer', background: 'none', border: 'none', borderBottom: `1px solid ${COLORS.borderSoft}`, borderRadius: 0, font: 'inherit', textAlign: 'left' }}>
                      <span style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 56 }}>{t.units}</span>
                      <span style={TENANT_BADGE[t.group]}>{TENANT_LABEL[t.group]}</span>
                    </button>
                  ))
                )}
              </div>

              <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: '20px 22px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Actividad reciente</div>
                {auditLog.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>{loading ? 'Cargando actividad…' : 'Aún no hay actividad registrada.'}</div>
                ) : (
                  auditLog.slice(0, 5).map((entry, i, arr) => {
                    const { text, color } = humanizeAudit(entry);
                    return (
                      <div key={i} style={{ display: 'flex', gap: 11 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 8, height: 8, borderRadius: 999, background: color, marginTop: 5, flexShrink: 0 }} />
                          {i < arr.length - 1 && <div style={{ width: 1.5, flex: 1, background: COLORS.borderSoft, margin: '3px 0' }} />}
                        </div>
                        <div style={{ paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45 }}>{text}</div>
                          <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500, marginTop: 2 }}>{formatRelativeTime(entry.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: '20px 22px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 14 }}>Resumen ejecutivo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: COLORS.textSecondary, fontWeight: 500 }}>Crecimiento MRR (mensual)</span>
                    <span style={{ fontWeight: 800, color: billing?.mrrGrowthPercent == null ? COLORS.textMuted : billing.mrrGrowthPercent >= 0 ? COLORS.success : COLORS.danger }}>
                      {billing?.mrrGrowthPercent == null ? '—' : `${billing.mrrGrowthPercent >= 0 ? '+' : ''}${billing.mrrGrowthPercent.toFixed(1)}%`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: COLORS.textSecondary, fontWeight: 500 }}>Churn (conjuntos cancelados)</span>
                    <span style={{ fontWeight: 800 }}>{billing?.churnThisMonth ?? 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: COLORS.textSecondary, fontWeight: 500 }}>Tiempo prom. de cierre PQRS</span>
                    <span style={{ fontWeight: 800 }}>{billing?.avgPqrsCloseTimeDays == null ? '—' : `${billing.avgPqrsCloseTimeDays.toFixed(1)}d`}</span>
                  </div>
                </div>
              </div>

              <div style={{ background: COLORS.bgCard, borderRadius: 18, padding: '20px 22px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 12 }}>Accesos rápidos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button type="button" onClick={() => { setCreateOpen(true); setCreatePhase('form'); setNewName(''); setNewCity(''); setNewUnits(''); setNewAdminName(''); setNewAdminEmail(''); }} style={{ background: 'none', border: 'none', padding: '7px 0', font: 'inherit', fontSize: 11.5, fontWeight: 700, color: COLORS.navy, cursor: 'pointer', textAlign: 'left' }}>+ Crear conjunto</button>
                  <button type="button" onClick={() => setNav('precios')} style={{ background: 'none', border: 'none', padding: '7px 0', font: 'inherit', fontSize: 11.5, fontWeight: 700, color: COLORS.navy, cursor: 'pointer', textAlign: 'left' }}>Editar reglas de precio</button>
                  <button type="button" onClick={() => setNav('auditoria')} style={{ background: 'none', border: 'none', padding: '7px 0', font: 'inherit', fontSize: 11.5, fontWeight: 700, color: COLORS.navy, cursor: 'pointer', textAlign: 'left' }}>Ver auditoría</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {nav === 'conjuntos' && (
        <div className="apl-up">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
            <div><h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Conjuntos</h1><p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: 0 }}>Administra, edita, suspende o cancela conjuntos</p></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={runOverdueRules} disabled={applyingOverdue} style={{ border: `1.5px solid ${COLORS.inputBorder}`, background: 'none', color: '#1D1D1F', fontSize: 13, fontWeight: 700, padding: '11px 16px', borderRadius: RADIUS.pill, cursor: applyingOverdue ? 'default' : 'pointer', font: 'inherit' }}>{applyingOverdue ? 'Ejecutando…' : 'Ejecutar reglas de mora'}</button>
              <button type="button" onClick={() => { setCreateOpen(true); setCreatePhase('form'); setNewName(''); setNewCity(''); setNewUnits(''); setNewAdminName(''); setNewAdminEmail(''); }} style={{ background: COLORS.navy, border: 'none', color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '11px 16px', borderRadius: RADIUS.pill, cursor: 'pointer', font: 'inherit' }}>+ Crear conjunto</button>
            </div>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, ciudad o administrador…" style={{ width: '100%', maxWidth: 420, height: 40, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 10, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {(['all', 'active', 'trial', 'pending_payment', 'grace', 'suspended', 'cancelled'] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} style={{ ...tabStyle(filter === f), fontSize: 11.5, fontWeight: 700, border: 'none', font: 'inherit', cursor: 'pointer' }}>{f === 'all' ? 'Todos' : TENANT_LABEL[f]}</button>)}
          </div>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {filteredTenants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted, fontSize: 13.5 }}>Ningún conjunto coincide con esta búsqueda o filtro.</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 22px', background: '#FAFAFA', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.02em' }}>
                  <span style={{ flex: 1, minWidth: 150 }}>NOMBRE</span><span style={{ width: 90 }}>CIUDAD</span><span style={{ width: 120 }}>ADMINISTRADOR</span><span style={{ width: 56 }}>UNID.</span><span style={{ width: 90 }}>LICENCIA</span><span style={{ width: 90 }}>ESTADO</span><span style={{ width: 190, textAlign: 'right' }}>ACCIONES</span>
                </div>
                {filteredTenants.slice(0, conjuntosVisible).map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                    <span style={{ flex: 1, minWidth: 150, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span style={{ width: 90, fontSize: 12, color: COLORS.textSecondary }}>{t.city}</span>
                    <span style={{ width: 120, fontSize: 12, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.adminName}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 56 }}>{t.units}</span>
                    <span style={{ width: 90, fontSize: 12, color: COLORS.textSecondary }}>{t.plan}</span>
                    <span style={{ width: 90 }}><span style={TENANT_BADGE[t.group]}>{TENANT_LABEL[t.group]}</span></span>
                    <span style={{ width: 190, display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
                      <button type="button" onClick={() => setSelectedId(t.id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Ver</button>
                      <button type="button" onClick={() => openEdit(t)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Editar</button>
                      <button type="button" onClick={() => (t.group === 'suspended' ? reactivate(t.id) : suspend(t.id))} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11, fontWeight: 700, color: t.group === 'suspended' ? COLORS.success : COLORS.warning, cursor: 'pointer' }}>{t.group === 'suspended' ? 'Reactivar' : 'Suspender'}</button>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
          {filteredTenants.length > conjuntosVisible && (
            <button type="button" onClick={() => setConjuntosVisible((v) => v + 10)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', font: 'inherit', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: COLORS.navy, padding: '16px 0', cursor: 'pointer' }}>Cargar más conjuntos ({filteredTenants.length - conjuntosVisible} restantes)</button>
          )}
        </div>
      )}

      {nav === 'financiero' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Licencias y pagos</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 20px' }}>Estado de licencias e historial de cobro</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            <button type="button" onClick={() => setFinSubTab('licencia')} style={{ ...tabStyle(finSubTab === 'licencia'), fontSize: 11.5, fontWeight: 700, border: 'none', font: 'inherit', cursor: 'pointer' }}>Licencia</button>
            <button type="button" onClick={() => setFinSubTab('pagos')} style={{ ...tabStyle(finSubTab === 'pagos'), fontSize: 11.5, fontWeight: 700, border: 'none', font: 'inherit', cursor: 'pointer' }}>Pagos</button>
          </div>

          {finSubTab === 'licencia' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 15 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>Licencias activas</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{billing?.activeLicenses ?? 0}</div>
                </div>
                <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 15 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>En mora</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.warning }}>{tenants.filter((t) => t.group === 'grace').length}</div>
                </div>
                <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 15 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>Renovaciones próximas</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{billing?.upcomingRenewals ?? 0}</div>
                </div>
                <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 15 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>Suspendidos</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textSecondaryAlt }}>{tenants.filter((t) => t.group === 'suspended').length}</div>
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 18, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Período de gracia global</div>
                  <div style={{ fontSize: 11.5, color: COLORS.textSecondary }}>Días de gracia antes de suspender automáticamente una licencia vencida</div>
                </div>
                <input
                  type="number"
                  min={1}
                  value={graceDaysInput}
                  onChange={(e) => setGraceDaysInput(e.target.value)}
                  style={{ width: 70, height: 44, padding: '0 10px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 13.5, fontWeight: 500, font: 'inherit' }}
                />
                <button type="button" onClick={submitGraceDays} style={{ border: 'none', font: 'inherit', fontSize: 13, fontWeight: 700, color: '#FFFFFF', background: COLORS.navy, padding: '11px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Guardar</button>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>Actual: {graceDays} días</span>
              </div>

              <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
                {tenants.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
                    <span style={TENANT_BADGE[t.group]}>{TENANT_LABEL[t.group]}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 170 }}>{t.licenseEnd}</span>
                    {t.paymentStatus === 'mora' && <span style={badgeStyle(COLORS.warningSoft, COLORS.warning)}>Mora {t.moraDays}d</span>}
                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                      <button type="button" onClick={() => renewSubscription(t.id)} style={{ border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#FFFFFF', background: COLORS.success, padding: '9px 13px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Renovar</button>
                      <button type="button" onClick={() => (t.group === 'suspended' ? reactivate(t.id) : suspend(t.id))} style={{ border: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#1D1D1F', background: COLORS.neutralSoft, padding: '9px 13px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>{t.group === 'suspended' ? 'Reactivar' : 'Suspender'}</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {finSubTab === 'pagos' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 15 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>Pagos recibidos (mes)</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{billing ? formatMoney(billing.monthlyRevenueCents) : '—'}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{billing?.monthlyApprovedPayments ?? 0} pagos aprobados</div>
                </div>
                <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 15 }}>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>Pagos pendientes</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.warning }}>{billing?.pendingPayments ?? 0}</div>
                </div>
                <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>Mercado Pago</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{mercadoPago?.connected ? 'Conectado' : 'No conectado'}</div>
                  </div>
                  <span style={mercadoPago?.connected ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.dangerSoft, COLORS.danger)}>{mercadoPago?.connected ? 'Activo' : 'Inactivo'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {(['all', 'APPROVED', 'PENDING', 'REJECTED'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setPaymentFilter(f)} style={{ ...tabStyle(paymentFilter === f), fontSize: 11.5, fontWeight: 700, border: 'none', font: 'inherit', cursor: 'pointer' }}>
                    {f === 'all' ? 'Todos' : PAYMENT_STATUS_LABEL[f]}
                  </button>
                ))}
              </div>

              <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
                {payments.filter((p) => paymentFilter === 'all' || p.status === paymentFilter).length === 0 ? (
                  <div style={{ padding: '32px 22px', textAlign: 'center', fontSize: 12.5, color: COLORS.textMuted }}>No hay pagos para mostrar</div>
                ) : (
                  payments
                    .filter((p) => paymentFilter === 'all' || p.status === paymentFilter)
                    .map((tx) => (
                      <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, flexWrap: 'wrap' }}>
                        <span style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: 700 }}>{tx.tenantName}</span>
                        <span style={{ fontSize: 12, color: COLORS.textSecondary, width: 100 }}>{tx.provider}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: COLORS.textMuted, width: 90 }}>{new Date(tx.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
                        <span style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 600, width: 110, textAlign: 'right' }}>{formatMoney(tx.amountCents, tx.currency)}</span>
                        <span style={paymentBadge(tx.status)}>{PAYMENT_STATUS_LABEL[tx.status] || tx.status}</span>
                      </div>
                    ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {nav === 'precios' && (
        <div className="apl-up" style={{ maxWidth: 1000 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Reglas de precio</h1>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>Esto es lo que genuinamente se le cobra a cada conjunto según su número de unidades.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ display: 'flex', padding: '14px 22px', fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                <span style={{ flex: 1 }}>DESDE</span><span style={{ flex: 1 }}>HASTA</span><span style={{ flex: 2 }}>PRECIO MENSUAL</span><span style={{ width: 140 }} />
              </div>
              {tiers.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12.5, color: COLORS.textMuted }}>No hay reglas de precio configuradas</div>
              )}
              {[...tiers].sort((a, b) => a.minUnits - b.minUnits).map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, opacity: p.isActive ? 1 : 0.55 }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{p.minUnits}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{p.maxUnits ? p.maxUnits : 'Sin límite'}</span>
                  <span style={{ flex: 2, fontSize: 15, color: '#1D1D1F', fontWeight: 800 }}>
                    {formatMoney(p.priceCents, p.currency)}<span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted }}>/mes</span>{!p.isActive && <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}> · inactiva</span>}
                  </span>
                  <div style={{ width: 140, display: 'flex', gap: 12, justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button type="button" onClick={() => toggleRuleActive(p)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 700, color: p.isActive ? COLORS.warning : COLORS.success, cursor: 'pointer' }}>{p.isActive ? 'Desactivar' : 'Activar'}</button>
                    <button type="button" onClick={() => openEditRule(p)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Editar</button>
                    <button type="button" onClick={() => deleteRule(p.id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 700, color: COLORS.danger, cursor: 'pointer' }}>Eliminar</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={openAddRule} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'none', font: 'inherit', padding: '16px 22px', fontSize: 13, fontWeight: 700, color: COLORS.navy, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: COLORS.navySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>+</span>
                Agregar rango
              </button>
            </div>

            <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 4 }}>Topes de precio</div>
              <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 1.4 }}>Ninguna regla se puede guardar fuera de este rango. Ajusta esto solo si el negocio realmente cambió de escala.</div>

              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5 }}>Tope mínimo (COP)</label>
              <input type="number" value={capsMinInput} onChange={(e) => { setCapsMinInput(e.target.value); setCapsConfirmStep(false); }} style={{ width: '100%', height: 40, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 10, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', marginBottom: 12 }} />

              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, marginBottom: 5 }}>Tope máximo (COP)</label>
              <input type="number" value={capsMaxInput} onChange={(e) => { setCapsMaxInput(e.target.value); setCapsConfirmStep(false); }} style={{ width: '100%', height: 40, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 10, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', marginBottom: 14 }} />

              {capsError && (
                <div style={{ background: COLORS.dangerSoft, color: COLORS.danger, borderRadius: 10, padding: '10px 12px', fontSize: 11.5, fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>{capsError}</div>
              )}

              {!capsConfirmStep ? (
                <button type="button" onClick={reviewCapsForm} disabled={capsMinInput === String(pricingCapsMinCents / 100) && capsMaxInput === String(pricingCapsMaxCents / 100)} style={{ width: '100%', border: 'none', font: 'inherit', background: COLORS.navy, color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, cursor: 'pointer', opacity: (capsMinInput === String(pricingCapsMinCents / 100) && capsMaxInput === String(pricingCapsMaxCents / 100)) ? 0.5 : 1 }}>Actualizar topes</button>
              ) : (
                <div style={{ background: COLORS.warningSoft, border: '1px solid #F3D9B1', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 12, color: COLORS.warning, fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>
                    Esto cambia el rango permitido para TODAS las reglas de precio, presentes y futuras. ¿Confirmas?
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>{formatMoney(Number(capsMinInput) * 100)} — {formatMoney(Number(capsMaxInput) * 100)}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={cancelCapsForm} style={{ flex: 1, border: `1.5px solid ${COLORS.inputBorder}`, background: 'none', font: 'inherit', fontSize: 11.5, fontWeight: 700, padding: '9px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Cancelar</button>
                    <button type="button" onClick={submitCaps} style={{ flex: 1, border: 'none', background: COLORS.success, color: '#FFFFFF', font: 'inherit', fontSize: 11.5, fontWeight: 700, padding: '9px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Sí, confirmar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 12 }}>Un conjunto con más unidades nunca puede pagar menos que uno con menos unidades.</p>
        </div>
      )}

      {/* Pricing rule sheet: add / edit with hard caps + confirmation step */}
      <Sheet open={addingRule || !!editingRuleId} onClose={cancelRuleForm} maxWidth={440}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{ruleConfirmStep ? 'Confirmar precio' : editingRuleId ? 'Editar regla de precio' : 'Nueva regla de precio'}</h2>
          <CloseButton onClick={cancelRuleForm} />
        </div>

        {!ruleConfirmStep && (
          <>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>Define el rango de unidades y cuánto se le cobrará mensualmente a los conjuntos en ese rango.</p>

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Desde (unidades)</label>
            <input type="number" value={ruleMinUnits} onChange={(e) => setRuleMinUnits(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 14 }} />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Hasta (unidades)</label>
            <input type="number" placeholder="Vacío = sin límite superior" value={ruleMaxUnits} onChange={(e) => setRuleMaxUnits(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 14 }} />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Precio mensual (COP)</label>
            <input type="number" value={rulePrice} onChange={(e) => setRulePrice(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 6 }} />
            <p style={{ fontSize: 11.5, color: COLORS.textMuted, margin: '0 0 20px' }}>Entre {formatMoney(pricingCapsMinCents)} y {formatMoney(pricingCapsMaxCents)} — nunca se puede guardar fuera de este rango.</p>

            {ruleError && (
              <div style={{ background: COLORS.dangerSoft, border: `1px solid #F3C2C2`, color: COLORS.danger, borderRadius: 12, padding: '12px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 18, lineHeight: 1.4 }}>
                {ruleError}
              </div>
            )}

            <button type="button" onClick={reviewRuleForm} style={{ width: '100%', border: 'none', font: 'inherit', background: COLORS.navy, color: '#FFFFFF', fontSize: 14.5, fontWeight: 700, padding: '14px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Revisar y confirmar</button>
          </>
        )}

        {ruleConfirmStep && (
          <>
            <div style={{ background: COLORS.warningSoft, border: `1px solid #F3D9B1`, borderRadius: 14, padding: 18, marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: COLORS.warning, fontWeight: 700, marginBottom: 10 }}>Vas a cobrar esto de verdad:</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#1D1D1F', marginBottom: 4 }}>{formatMoney(Math.round(Number(rulePrice) * 100))}<span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textMuted }}>/mes</span></div>
              <div style={{ fontSize: 12.5, color: COLORS.textSecondary }}>A conjuntos de {ruleMinUnits} {ruleMaxUnits ? `a ${ruleMaxUnits}` : 'o más'} unidades</div>
            </div>
            <p style={{ fontSize: 12.5, color: COLORS.textSecondary, margin: '0 0 20px' }}>Confirma que este valor es el correcto antes de guardarlo. Se aplicará de inmediato al cálculo de precio de nuevos conjuntos.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setRuleConfirmStep(false)} style={{ flex: 1, border: `1.5px solid ${COLORS.inputBorder}`, font: 'inherit', background: 'none', color: '#1D1D1F', fontSize: 13.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Revisar de nuevo</button>
              <button type="button" onClick={editingRuleId ? submitEditRule : submitNewRule} style={{ flex: 1, border: 'none', font: 'inherit', background: COLORS.success, color: '#FFFFFF', fontSize: 13.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Sí, confirmar y guardar</button>
            </div>
          </>
        )}
      </Sheet>

      {nav === 'analytics' && (() => {
        const churnRatePercent = billing ? Math.round((billing.churnThisMonth / Math.max(1, stats.totalTenants)) * 1000) / 10 : null;
        const arpuCents = billing && billing.activeLicenses > 0 ? Math.round(billing.monthlyRevenueCents / billing.activeLicenses) : 0;
        const mrrUp = (billing?.mrrGrowthPercent ?? 0) >= 0;
        const insightCards = [
          {
            label: 'Crecimiento MRR',
            value: billing?.mrrGrowthPercent != null ? `${mrrUp ? '+' : ''}${billing.mrrGrowthPercent.toFixed(1)}%` : '—',
            color: billing?.mrrGrowthPercent == null ? COLORS.textMuted : mrrUp ? COLORS.success : COLORS.danger,
            note: billing?.mrrGrowthPercent == null
              ? 'Aún no hay suficiente historial para comparar meses.'
              : mrrUp
                ? 'Los ingresos crecen mes a mes: la base de clientes se está expandiendo.'
                : 'Los ingresos cayeron vs. el mes pasado. Revisa renovaciones y cancelaciones.',
          },
          {
            label: 'Churn del mes',
            value: churnRatePercent != null ? `${churnRatePercent}%` : '—',
            color: churnRatePercent == null ? COLORS.textMuted : churnRatePercent > 5 ? COLORS.danger : churnRatePercent > 0 ? COLORS.warning : COLORS.success,
            note: churnRatePercent && churnRatePercent > 5
              ? 'Churn alto: varios conjuntos se están yendo. Revisa la sección de riesgo abajo.'
              : churnRatePercent && churnRatePercent > 0
                ? 'Churn moderado, vale la pena entender por qué se fueron.'
                : 'Sin cancelaciones este mes — buena señal de retención.',
          },
          {
            label: 'Ingreso promedio por conjunto',
            value: formatMoney(arpuCents),
            color: '#1D1D1F',
            note: 'Cuánto paga en promedio cada licencia activa por mes. Útil para negociar precios y medir el impacto de subir tarifas.',
          },
          {
            label: 'Conversión de trial',
            value: analytics?.trialConversion.ratePercent != null ? `${analytics.trialConversion.ratePercent}%` : '—',
            color: analytics?.trialConversion.ratePercent == null ? COLORS.textMuted : analytics.trialConversion.ratePercent >= 60 ? COLORS.success : COLORS.warning,
            note: analytics
              ? `De los trials que ya vencieron, ${analytics.trialConversion.converted} se quedaron pagando y ${analytics.trialConversion.lost} se fueron.`
              : 'Cargando…',
          },
        ];

        return (
          <div className="apl-up" style={{ maxWidth: 1040 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Analítica de negocio</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 20px' }}>Qué está pasando con el negocio y qué hacer al respecto</p>

            {analyticsLoading && !analytics && (
              <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: COLORS.textMuted }}>Cargando analítica…</div>
            )}

            {analytics && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
                  {insightCards.map((c) => (
                    <div key={c.label} style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 16 }}>
                      <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 6 }}>{c.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: c.color, marginBottom: 8 }}>{c.value}</div>
                      <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.4 }}>{c.note}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginBottom: 20 }}>
                  <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Ingresos mensuales (MRR)</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 18 }}>Últimos 6 meses de pagos aprobados</div>
                    <MiniBarChart data={analytics.mrrTrend.map((m) => ({ label: m.month, value: m.revenueCents }))} color={COLORS.success} formatValue={(v) => formatMoney(v).replace('COP', '').trim()} />
                  </div>
                  <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Crecimiento de conjuntos</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 18 }}>Conjuntos nuevos por mes, últimos 6 meses</div>
                    <MiniBarChart data={analytics.newTenantsTrend.map((m) => ({ label: m.month, value: m.count }))} color={COLORS.navy} formatValue={(v) => String(v)} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
                  <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Tiempo de cierre de PQRS</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 18 }}>Promedio de días para cerrar un caso, por mes — la señal más directa de qué tan bien está funcionando el servicio</div>
                    <MiniBarChart data={analytics.closeTimeTrend.map((m) => ({ label: m.month, value: m.avgDays }))} color={COLORS.warning} formatValue={(v) => `${v}d`} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                      {analytics.closeTimeBuckets.map((b) => (
                        <div key={b.label} style={{ flex: 1, background: COLORS.bgCard, borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 16, fontWeight: 800 }}>{b.percent}%</div>
                          <div style={{ fontSize: 10.5, color: COLORS.textMuted }}>{b.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>PQRS sin resolver</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 }}>Casos abiertos ahora mismo, por antigüedad</div>
                    {analytics.backlogAging.map((b, i) => (
                      <div key={b.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondaryAlt }}>{b.label}</span>
                        <span style={badgeStyle(i === 2 && b.count > 0 ? COLORS.dangerSoft : COLORS.neutralSoft, i === 2 && b.count > 0 ? COLORS.danger : '#1D1D1F')}>{b.count}</span>
                      </div>
                    ))}
                    {analytics.backlogAging[2].count > 0 && (
                      <p style={{ fontSize: 11, color: COLORS.danger, marginTop: 12, lineHeight: 1.4 }}>
                        Hay casos abiertos por encima del SLA de cierre configurado. Eso suele traducirse en residentes frustrados y conjuntos que no renuevan.
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                  <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Conjuntos en riesgo</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 }}>En mora, ordenados por días de atraso — candidatos a contactar antes de perderlos</div>
                    {analytics.atRiskTenants.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: COLORS.textMuted, padding: '12px 0' }}>Ningún conjunto está en mora ahora mismo.</div>
                    ) : (
                      analytics.atRiskTenants.map((t) => (
                        <div key={t.tenantId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
                          <span style={badgeStyle(COLORS.warningSoft, COLORS.warning)}>{t.moraDays}d de mora</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Concentración de ingresos</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 }}>Conjuntos que más aportan — si uno se va, esto es lo que se pierde</div>
                    {analytics.topTenantsByRevenue.map((t) => (
                      <div key={t.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
                        <span style={{ fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 600 }}>{formatMoney(t.priceCents, t.currency)}/mes</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>De qué se quejan los residentes</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 }}>Distribución de PQRS por tipo, en toda la plataforma</div>
                  {analytics.pqrsByType.map((t) => {
                    const totalTypeCount = analytics.pqrsByType.reduce((acc, x) => acc + x.count, 0);
                    const pct = totalTypeCount > 0 ? Math.round((t.count / totalTypeCount) * 100) : 0;
                    return (
                      <div key={t.tipo} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span style={{ fontWeight: 700 }}>{PQRS_TYPE_LABEL[t.tipo] || t.tipo}</span>
                          <span style={{ color: COLORS.textMuted }}>{t.count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: COLORS.bgCard, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: COLORS.navy, borderRadius: 999 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {nav === 'usuarios' && (() => {
        const q = usersSearch.trim().toLowerCase();
        const filteredForUsers = tenants.filter((t) => !q || t.name.toLowerCase().includes(q) || t.city.toLowerCase().includes(q));
        return (
          <div className="apl-up">
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Usuarios</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 20px' }}>Elige un conjunto para ver quién tiene acceso y con qué rol</p>

            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
                <div style={{ padding: 14, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <input
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    placeholder="Buscar conjunto…"
                    style={{ width: '100%', height: 38, padding: '0 12px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 9, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ maxHeight: 560, overflowY: 'auto' }} className="no-scrollbar">
                  {filteredForUsers.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12.5, color: COLORS.textMuted }}>Sin resultados</div>
                  ) : (
                    filteredForUsers.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setUsersTenantId(t.id)}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 3, width: '100%', textAlign: 'left', padding: '12px 16px',
                          border: 'none', borderBottom: `1px solid ${COLORS.borderSoft}`, font: 'inherit', cursor: 'pointer',
                          background: usersTenantId === t.id ? COLORS.navySoft : 'none',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: usersTenantId === t.id ? COLORS.navy : '#1D1D1F' }}>{t.name}</span>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{t.city} · {t.units} unidades</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, minHeight: 300 }}>
                {!usersTenantId && (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>Selecciona un conjunto de la lista para ver sus usuarios.</div>
                )}
                {usersTenantId && usersTenantLoading && (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>Cargando usuarios…</div>
                )}
                {usersTenantId && !usersTenantLoading && usersTenantDetail && (
                  <>
                    <div style={{ padding: '18px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{usersTenantDetail.name}</div>
                        <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{usersTenantDetail.users.length} usuario{usersTenantDetail.users.length === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                    {usersTenantDetail.users.length === 0 ? (
                      <div style={{ padding: '48px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>Este conjunto todavía no tiene usuarios registrados.</div>
                    ) : (
                      usersTenantDetail.users.map((u) => (
                        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                          <div style={{ width: 32, height: 32, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                            {u.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                            <div style={{ fontSize: 11.5, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                          </div>
                          {u.role === 'RESIDENTE' && (u.bloque != null || u.apto != null) && (
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: COLORS.textMuted, width: 90 }}>Bl.{u.bloque ?? '-'} Apt.{u.apto ?? '-'}</span>
                          )}
                          <span style={ROLE_BADGE(u.role)}>{ROLE_LABEL[u.role] || u.role}</span>
                          {!u.isActive && <span style={badgeStyle(COLORS.dangerSoft, COLORS.danger)}>Inactivo</span>}
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {nav === 'auditoria' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Auditoría</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 18px' }}>Todo lo que ha pasado en la plataforma, organizado por tema</p>

          <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            {AUDIT_CATEGORY_TABS.map((tab) => {
              const count = tab.key === 'all' ? auditCounts?.total : auditCounts?.[tab.key as keyof AuditCounts];
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAuditCategory(tab.key)}
                  style={{ ...tabStyle(auditCategory === tab.key), fontSize: 11.5, fontWeight: 700, border: 'none', font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {tab.label}
                  {auditCounts && <span style={{ fontSize: 10, opacity: 0.7 }}>{count ?? 0}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {auditLoading && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>Cargando…</div>
            )}
            {!auditLoading && auditEntries.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>No hay acciones registradas en esta categoría.</div>
            )}
            {!auditLoading && auditEntries.map((entry, i) => {
              const { text } = humanizeAudit(entry);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 22px', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
                  <div style={AUDIT_ICON_STYLE}>{(entry.actor?.name || 'S')[0]}</div>
                  <div><div style={{ fontSize: 13, fontWeight: 700 }}>{text}</div><div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{entry.actor?.name || 'Sistema'} · {formatRelativeTime(entry.createdAt)}</div></div>
                </div>
              );
            })}
          </div>
          {!auditLoading && auditEntries.length < auditTotal && (
            <button type="button" onClick={loadMoreAudit} disabled={auditLoadingMore} style={{ display: 'block', width: '100%', background: 'none', border: 'none', font: 'inherit', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: COLORS.navy, padding: '16px 0', cursor: auditLoadingMore ? 'default' : 'pointer' }}>
              {auditLoadingMore ? 'Cargando…' : `Cargar más (${auditTotal - auditEntries.length} restantes)`}
            </button>
          )}
        </div>
      )}

      {nav === 'soporte' && (
        <div className="apl-up">
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Centro de soporte</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 18px' }}>Solicitudes reales enviadas por los administradores de cada conjunto desde su centro de ayuda</p>

          <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'Todas', count: supportCounts?.total },
              { key: 'ABIERTA', label: 'Abiertas', count: supportCounts?.abierta },
              { key: 'RESPONDIDA', label: 'Respondidas', count: supportCounts?.respondida },
              { key: 'CERRADA', label: 'Cerradas', count: supportCounts?.cerrada },
            ].map((tab) => (
              <button key={tab.key} type="button" onClick={() => setSupportFilter(tab.key)} style={{ ...tabStyle(supportFilter === tab.key), fontSize: 11.5, fontWeight: 700, border: 'none', font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {tab.label}{supportCounts && <span style={{ fontSize: 10, opacity: 0.7 }}>{tab.count ?? 0}</span>}
              </button>
            ))}
          </div>

          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, overflow: 'hidden' }}>
            {supportLoading && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>Cargando…</div>
            )}
            {!supportLoading && supportTickets.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5 }}>No hay solicitudes en esta categoría.</div>
            )}
            {!supportLoading && supportTickets.map((tk) => (
              <div key={tk.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 22px', borderBottom: `1px solid ${COLORS.borderSoft}`, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{tk.subject}</div>
                  <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{tk.tenant.name} · {tk.createdBy.name} · {formatRelativeTime(tk.createdAt)}</div>
                </span>
                <span style={badgeStyle(COLORS.neutralSoft, '#1D1D1F')}>{SUPPORT_CATEGORY_LABEL[tk.category] || tk.category}</span>
                <span style={supportStatusBadge(tk.status)}>{SUPPORT_STATUS_LABEL[tk.status]}</span>
                <button type="button" onClick={() => openRespond(tk)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11.5, fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>{tk.status === 'ABIERTA' ? 'Responder' : 'Ver'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Support ticket detail / response sheet */}
      <Sheet open={!!respondingTicket} onClose={() => setRespondingTicket(null)} maxWidth={520}>
        {respondingTicket && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{respondingTicket.subject}</h2>
              <CloseButton onClick={() => setRespondingTicket(null)} />
            </div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '0 0 16px' }}>
              {respondingTicket.tenant.name} · {respondingTicket.createdBy.name} ({respondingTicket.createdBy.email}) · {formatRelativeTime(respondingTicket.createdAt)}
            </p>
            <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 16, fontSize: 13, lineHeight: 1.5, marginBottom: 18, whiteSpace: 'pre-wrap' }}>{respondingTicket.message}</div>

            {respondingTicket.response && (
              <div style={{ background: COLORS.successSoft, borderRadius: 12, padding: 16, fontSize: 12.5, lineHeight: 1.5, marginBottom: 18, whiteSpace: 'pre-wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.success, marginBottom: 6 }}>Respuesta enviada {respondingTicket.respondedAt ? formatRelativeTime(respondingTicket.respondedAt) : ''}</div>
                {respondingTicket.response}
              </div>
            )}

            {respondingTicket.status !== 'CERRADA' && (
              <>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>{respondingTicket.response ? 'Actualizar respuesta' : 'Responder'}</label>
                <textarea value={responseText} onChange={(e) => setResponseText(e.target.value)} rows={5} placeholder="Escribe la solución o respuesta para este conjunto" style={{ width: '100%', padding: '12px 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 14, resize: 'vertical' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, marginBottom: 18, cursor: 'pointer' }}>
                  <input type="checkbox" checked={closeOnRespond} onChange={(e) => setCloseOnRespond(e.target.checked)} />
                  Cerrar esta solicitud al responder
                </label>
                <button type="button" disabled={!responseText.trim()} onClick={submitResponse} style={{ width: '100%', border: 'none', font: 'inherit', background: responseText.trim() ? COLORS.navy : COLORS.neutralSoft, color: responseText.trim() ? '#FFFFFF' : COLORS.textMuted, fontSize: 14.5, fontWeight: 700, padding: '14px 0', borderRadius: RADIUS.pill, cursor: responseText.trim() ? 'pointer' : 'default' }}>Enviar respuesta</button>
              </>
            )}
          </>
        )}
      </Sheet>

      {nav === 'config' && (
        <div className="apl-up" style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 4px' }}>Configuración</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: '0 0 4px' }}>Ajustes reales de la plataforma — cada opción aquí afecta el comportamiento del sistema.</p>

          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Branding</div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '0 0 16px' }}>Se refleja en el sidebar de este panel.</p>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre de la plataforma</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={platformNameInput} onChange={(e) => setPlatformNameInput(e.target.value)} style={{ flex: 1, height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 14, fontWeight: 500, fontFamily: 'inherit', background: '#FFFFFF' }} />
              <button type="button" onClick={submitPlatformName} disabled={!platformNameInput.trim() || platformNameInput.trim() === generalSettings.platformName} style={{ border: 'none', font: 'inherit', fontSize: 13, fontWeight: 700, color: '#FFFFFF', background: (platformNameInput.trim() && platformNameInput.trim() !== generalSettings.platformName) ? COLORS.navy : COLORS.neutralSoft, padding: '0 18px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Guardar</button>
            </div>
          </div>

          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Integraciones</div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '0 0 16px' }}>Estado real de los servicios externos, leído directamente de las variables de entorno configuradas.</p>
            {integrationsFull ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: COLORS.bgCard, borderRadius: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Resend (correo transaccional)</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{integrationsFull.resend.fromEmailConfigured ? 'Remitente configurado' : 'Falta configurar remitente'}</div>
                  </div>
                  <span style={integrationsFull.resend.connected ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.dangerSoft, COLORS.danger)}>{integrationsFull.resend.connected ? 'Conectado' : 'No conectado'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: COLORS.bgCard, borderRadius: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Supabase Storage (evidencias y archivos)</div>
                  <span style={integrationsFull.supabaseStorage.connected ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.dangerSoft, COLORS.danger)}>{integrationsFull.supabaseStorage.connected ? 'Conectado' : 'No conectado'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: COLORS.bgCard, borderRadius: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Mercado Pago (cobros)</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>{integrationsFull.mercadoPago.webhookSecretConfigured ? 'Webhook configurado' : 'Falta configurar webhook'}</div>
                  </div>
                  <span style={integrationsFull.mercadoPago.connected ? badgeStyle(COLORS.successSoft, COLORS.success) : badgeStyle(COLORS.dangerSoft, COLORS.danger)}>{integrationsFull.mercadoPago.connected ? 'Conectado' : 'No conectado'}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: COLORS.textMuted, marginBottom: 18 }}>Cargando…</div>
            )}
            <button type="button" onClick={sendTestEmail} disabled={sendingTestEmail} style={{ border: `1.5px solid ${COLORS.inputBorder}`, background: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '10px 16px', borderRadius: RADIUS.pill, cursor: sendingTestEmail ? 'default' : 'pointer' }}>{sendingTestEmail ? 'Enviando…' : 'Enviar correo de prueba a mi cuenta'}</button>
          </div>

          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Reglas operativas</div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '0 0 16px' }}>Define qué tan rápido se debe cerrar una PQRS. Esto alimenta directamente las gráficas y alertas de Analytics.</p>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>SLA de cierre de PQRS (días)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min={1} value={slaDaysInput} onChange={(e) => setSlaDaysInput(e.target.value)} style={{ width: 100, height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }} />
              <button type="button" onClick={submitSlaDays} disabled={!slaDaysInput || Number(slaDaysInput) === generalSettings.pqrsCloseSlaDays} style={{ border: 'none', font: 'inherit', fontSize: 13, fontWeight: 700, color: '#FFFFFF', background: (slaDaysInput && Number(slaDaysInput) !== generalSettings.pqrsCloseSlaDays) ? COLORS.navy : COLORS.neutralSoft, padding: '0 18px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Guardar</button>
            </div>
          </div>

          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Feature flags</div>
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '0 0 16px' }}>Interruptores reales — apagarlos cambia el comportamiento del sistema al instante.</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Centro de soporte habilitado</div>
                <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>Si está apagado, los administradores no pueden enviar nuevas solicitudes de soporte.</div>
              </div>
              <button type="button" onClick={() => toggleFeatureFlag('supportTicketsEnabled')} style={{ ...toggleTrackStyle(generalSettings.supportTicketsEnabled), border: 'none', cursor: 'pointer', flexShrink: 0 }}><div style={toggleDotStyle(generalSettings.supportTicketsEnabled)} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Envío automático de correos</div>
                <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>Si está apagado, invitaciones, respuestas de soporte y demás correos se registran pero no se envían (útil para pruebas).</div>
              </div>
              <button type="button" onClick={() => toggleFeatureFlag('transactionalEmailEnabled')} style={{ ...toggleTrackStyle(generalSettings.transactionalEmailEnabled), border: 'none', cursor: 'pointer', flexShrink: 0 }}><div style={toggleDotStyle(generalSettings.transactionalEmailEnabled)} /></button>
            </div>
          </div>
        </div>
      )}

      {nav === 'cuenta' && (
        <div className="apl-up" style={{ maxWidth: 560 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 18px' }}>Mi cuenta</h1>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Perfil</div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, margin: '0 0 7px' }}>Nombre completo</label>
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, margin: '0 0 7px' }}>Correo</label>
            <input value={accountEmail} disabled style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: COLORS.bgCard, color: COLORS.textMuted, marginBottom: 18 }} />
            <button type="button" onClick={saveAccount} disabled={!accountName.trim()} style={{ border: 'none', background: accountName.trim() ? COLORS.navy : COLORS.neutralSoft, color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '11px 22px', borderRadius: RADIUS.pill, cursor: accountName.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>Guardar cambios</button>
          </div>

          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Seguridad</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>ROL</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Super Admin</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700, marginBottom: 4 }}>MIEMBRO DESDE</div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{accountCreatedAt ? new Date(accountCreatedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</div>
              </div>
            </div>
            <a href="/cambiar-contrasena" style={{ display: 'inline-block', border: `1.5px solid ${COLORS.inputBorder}`, color: '#1D1D1F', fontSize: 13, fontWeight: 700, padding: '11px 20px', borderRadius: RADIUS.pill, textDecoration: 'none' }}>Cambiar contraseña</a>
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
              <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Nombre del conjunto</label><input value={newName} onChange={(e) => setNewName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit' }} /></div>
              <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Ciudad</label><input value={newCity} onChange={(e) => setNewCity(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit' }} /></div>
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Número de unidades</label>
            <input type="number" value={newUnits} onChange={(e) => setNewUnits(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 16 }} />
            <div style={{ borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 14, marginBottom: 6, fontSize: 12, color: COLORS.textMuted, fontWeight: 700 }}>ADMINISTRADOR PRINCIPAL</div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Nombre</label>
            <input value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 12 }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Correo</label>
            <input value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 24 }} />
            <button type="button" onClick={submitCreate} disabled={!(newName.trim() && newUnits && newAdminEmail.trim())} style={{ width: '100%', border: 'none', font: 'inherit', textAlign: 'center', background: (newName.trim() && newUnits && newAdminEmail.trim()) ? COLORS.navy : COLORS.neutralSoft, color: (newName.trim() && newUnits && newAdminEmail.trim()) ? '#FFFFFF' : COLORS.textMuted, fontSize: 13.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Crear conjunto</button>
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
            <button type="button" onClick={() => setCreateOpen(false)} style={{ width: '100%', border: 'none', font: 'inherit', background: COLORS.navy, color: '#FFFFFF', fontSize: 14.5, fontWeight: 700, padding: '14px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Listo</button>
          </div>
        )}
      </Sheet>

      {/* Edit tenant sheet */}
      <Sheet open={!!editingTenant} onClose={() => setEditingTenant(null)} maxWidth={440}>
        {editingTenant && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Editar conjunto</h2>
              <CloseButton onClick={() => setEditingTenant(null)} />
            </div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '0 0 20px' }}>Actualiza los datos básicos de este conjunto.</p>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Nombre del conjunto</label>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 12 }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Ciudad</label>
            <input value={editCity} onChange={(e) => setEditCity(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 12 }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Número de unidades</label>
            <input type="number" value={editUnits} onChange={(e) => setEditUnits(e.target.value)} style={{ width: '100%', height: 44, padding: '0 13px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', marginBottom: 24 }} />
            <button type="button" onClick={submitEditTenant} disabled={!(editName.trim() && editUnits)} style={{ width: '100%', border: 'none', font: 'inherit', textAlign: 'center', background: (editName.trim() && editUnits) ? COLORS.navy : COLORS.neutralSoft, color: (editName.trim() && editUnits) ? '#FFFFFF' : COLORS.textMuted, fontSize: 14.5, fontWeight: 700, padding: '14px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Guardar cambios</button>
          </>
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
                <button type="button" onClick={() => (selected.group === 'suspended' ? reactivate(selected.id) : suspend(selected.id))} style={{ border: 'none', font: 'inherit', background: selected.group === 'suspended' ? COLORS.success : COLORS.navy, color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '11px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>{selected.group === 'suspended' ? 'Reactivar conjunto' : 'Suspender conjunto'}</button>
                <button type="button" onClick={() => setConfirmingCancel(true)} style={{ background: 'none', font: 'inherit', border: `1.5px solid ${COLORS.warningSoft}`, color: COLORS.warning, fontSize: 13, fontWeight: 700, padding: '11px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Cancelar conjunto</button>
              </div>
            )}
            {confirmingCancel && (
              <div style={{ border: `1.5px solid #F3D9B1`, background: COLORS.warningSoft, borderRadius: 14, padding: 18, marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.warning, marginBottom: 6 }}>¿Cancelar este conjunto?</div>
                <div style={{ fontSize: 12.5, color: COLORS.warning, marginBottom: 14 }}>Esta acción no se puede deshacer.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => cancelTenant(selected.id)} style={{ border: 'none', font: 'inherit', background: COLORS.warning, color: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '11px 16px', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Sí, cancelar</button>
                  <button type="button" onClick={() => setConfirmingCancel(false)} style={{ background: 'none', border: 'none', font: 'inherit', color: COLORS.warning, fontSize: 13, fontWeight: 700, padding: '11px 12px', cursor: 'pointer' }}>Volver</button>
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
