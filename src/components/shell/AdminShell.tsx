'use client';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { COLORS, RADIUS } from '@/lib/design/tokens';
import { BrandLockup } from './Logo';
import { useIsMobile } from './Sheet';
import { TenantSwitcher } from '@/components/TenantSwitcher';

function logout() {
  void signOut({ callbackUrl: '/auth/login' });
}

export type NavItem = { href: string; label: string; key: string };

export type AdminProfile = {
  user?: { name?: string | null; role?: string | null } | null;
  tenant?: { name?: string | null; status?: string | null; units?: number | null } | null;
  licenseSummary?: { status?: string | null; currentPeriodEnd?: string | null; priceCents?: number | null; unitsSnapshot?: number | null; nextPaymentDueDate?: string | null } | null;
  entitlements?: { reservations?: boolean; residentPayments?: boolean } | null;
};

const BLOCKING_STATUSES = ['PENDING_PAYMENT', 'SUSPENDED', 'CANCELLED'];

export function AdminShell({
  navItems, activeKey, mobileTitle, children, onProfile,
}: {
  navItems: NavItem[]; activeKey: string; conjuntoName?: string; licenseActive?: boolean;
  userName?: string; userRole?: string; initials?: string; mobileTitle: string; children: ReactNode;
  onProfile?: (profile: AdminProfile | null) => void;
}) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/me').then((res) => {
      if (res.status === 401) { logout(); return null; }
      if (!res.ok) throw new Error('profile');
      return res.json();
    }).then((data) => { if (alive && data) { setProfile(data); onProfile?.(data); } }).catch(() => { if (alive) setProfileError(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = profile?.user?.name || (profileError ? 'Cuenta no disponible' : 'Cargando…');
  const displayRole = profile?.user?.role ? roleLabel(profile.user.role) : (profileError ? 'ADMIN' : '');
  const displayTenant = profile?.tenant?.name || (profileError ? 'Conjunto no disponible' : 'Cargando…');
  const displayInitials = useMemo(() => initialsFor(displayName, '…'), [displayName]);
  const currentLicenseStatus = profile?.tenant?.status || profile?.licenseSummary?.status || null;
  const displayLicenseActive = currentLicenseStatus ? !BLOCKING_STATUSES.includes(currentLicenseStatus) : !profileError;
  const blockedStatus = currentLicenseStatus && BLOCKING_STATUSES.includes(currentLicenseStatus) ? currentLicenseStatus : null;
  const visibleNavItems = navItems.filter((item) => {
    if (item.key === 'reservas') return profile?.entitlements?.reservations === true;
    if (item.key === 'pagos') return profile?.entitlements?.residentPayments === true;
    return true;
  });

  async function payNow() {
    setPayLoading(true);
    setPayError('');
    try {
      const res = await fetch('/api/billing/wompi/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: `wompi_${crypto.randomUUID().replaceAll('-', '')}` }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.checkoutUrl) throw new Error(body?.error || 'No se pudo iniciar el pago');
      window.location.href = body.checkoutUrl;
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'No se pudo iniciar el pago');
      setPayLoading(false);
    }
  }

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {visibleNavItems.map((n) => (
        <Link
          key={n.key}
          href={n.href}
          onClick={onNavigate}
          aria-current={n.key === activeKey ? 'page' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: RADIUS.control,
            fontSize: 13.5, fontWeight: n.key === activeKey ? 700 : 600,
            background: n.key === activeKey ? COLORS.navySoft : 'transparent',
            color: n.key === activeKey ? COLORS.navy : COLORS.textSecondaryAlt,
          }}
        >
          {n.label}
        </Link>
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex' }}>
      {!isMobile && (
        <div style={{ width: 264, flexShrink: 0, borderRight: `1px solid ${COLORS.borderSoft}`, background: COLORS.bgSidebar, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '24px 18px' }}>
          <div style={{ padding: '0 8px 20px' }}><BrandLockup /></div>
          <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.borderSoft}`, borderRadius: RADIUS.stat, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 5 }}>CONJUNTO</div>
            <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>{displayTenant}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
              <div style={{ width: 7, height: 7, borderRadius: RADIUS.pill, background: displayLicenseActive ? COLORS.success : COLORS.textMuted }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: displayLicenseActive ? COLORS.success : COLORS.textMuted }}>{displayLicenseActive ? 'Licencia activa' : 'Licencia suspendida'}</span>
            </div>
            <TenantSwitcher />
          </div>
          <NavLinks />
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', borderTop: `1px solid ${COLORS.borderSoft}` }}>
            <div style={{ width: 34, height: 34, borderRadius: RADIUS.pill, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{displayInitials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.2 }}>{displayName}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>{displayRole}</div>
            </div>
            <button type="button" onClick={logout} style={{ border: 0, background: 'none', padding: 0, fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>Salir</button>
          </div>
        </div>
      )}

      {isMobile && drawerOpen && (
        <>
          <div className="apl-fade" onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: COLORS.overlay, backdropFilter: 'blur(4px)', zIndex: 190 }} />
          <div className="apl-sheet" style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: 290, maxWidth: '84vw', background: COLORS.bg, zIndex: 195, padding: '24px 18px', display: 'flex', flexDirection: 'column', boxShadow: '8px 0 40px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <BrandLockup size={21} />
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú" style={{ width: 30, height: 30, borderRadius: RADIUS.pill, background: COLORS.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, cursor: 'pointer', fontSize: 13, border: 'none', font: 'inherit' }}>✕</button>
            </div>
            <div style={{ marginBottom: 14 }}><TenantSwitcher /></div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <div style={{ marginTop: 'auto', borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: RADIUS.pill, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{displayInitials}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 800 }}>{displayName}</div><div style={{ fontSize: 11, color: COLORS.textMuted }}>{displayRole}</div></div>
              <button type="button" onClick={logout} style={{ border: 0, background: 'none', padding: 0, fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>Salir</button>
            </div>
          </div>
        </>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px) saturate(1.8)', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <div style={{ padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú" style={{ width: 34, height: 34, borderRadius: RADIUS.control, background: COLORS.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, cursor: 'pointer', border: 'none', font: 'inherit' }}>☰</button>
              <span style={{ fontWeight: 800, fontSize: 14.5 }}>{mobileTitle}</span>
              <div style={{ width: 32, height: 32, borderRadius: RADIUS.pill, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{displayInitials}</div>
            </div>
          </div>
        )}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '24px 20px 70px' : '40px 40px 90px' }}>
          {profile === null && !profileError ? (
            <ShellLoadingScreen />
          ) : blockedStatus ? (
            <BlockedScreen
              status={blockedStatus}
              role={profile?.user?.role || null}
              payLoading={payLoading}
              payError={payError}
              onPay={payNow}
            />
          ) : children}
        </div>
      </div>
    </div>
  );
}



const BLOCKED_COPY: Record<string, { title: string; body: string; canPay: boolean }> = {
  PENDING_PAYMENT: {
    title: 'Activa su licencia',
    body: 'Antes de usar PQRS Services, su conjunto debe completar el primer pago de la licencia.',
    canPay: true,
  },
  SUSPENDED: {
    title: 'Licencia suspendida',
    body: 'La licencia de este conjunto entró en suspensión por falta de pago. Realiza el pago para reactivar el acceso.',
    canPay: true,
  },
  CANCELLED: {
    title: 'Licencia cancelada',
    body: 'La licencia de este conjunto fue cancelada. Contacte al equipo de PQRS Services para reactivarla.',
    canPay: false,
  },
};

function BlockedScreen({
  status, role, payLoading, payError, onPay,
}: {
  status: string; role: string | null; payLoading: boolean; payError: string; onPay: () => void;
}) {
  const copy = BLOCKED_COPY[status] || BLOCKED_COPY.SUSPENDED;
  const isAdmin = role === 'ADMIN';
  return (
    <div style={{ maxWidth: 460, margin: '60px auto 0', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: RADIUS.pill, background: COLORS.warningSoft, color: COLORS.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, margin: '0 auto 20px' }}>!</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>{copy.title}</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 26px' }}>{copy.body}</p>
      {payError && <p style={{ color: COLORS.danger, fontWeight: 700, fontSize: 12.5, marginBottom: 14 }}>{payError}</p>}
      {copy.canPay && isAdmin && (
        <button
          type="button"
          onClick={onPay}
          disabled={payLoading}
          style={{ border: 0, background: COLORS.navy, color: COLORS.white, fontSize: 14, fontWeight: 700, padding: '13px 28px', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {payLoading ? 'Abriendo el portal de pagos…' : 'Pagar mensualidad'}
        </button>
      )}
      {copy.canPay && !isAdmin && (
        <p style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: 600 }}>Pida al administrador de su conjunto que complete el pago para continuar.</p>
      )}
      <p style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500, marginTop: 22 }}>
        ¿Problemas con el pago o con su licencia?{' '}
        <a href="mailto:hola@pqrsservices.com" style={{ color: COLORS.navy, fontWeight: 700 }}>Escríbanos</a>.
      </p>
    </div>
  );
}

function ShellLoadingScreen() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 34, height: 34, borderRadius: RADIUS.pill, border: `3px solid ${COLORS.borderSoft}`, borderTopColor: COLORS.navy, animation: 'apl-spin 800ms linear infinite' }} />
    </div>
  );
}

function initialsFor(name: string, fallback: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.map((p) => p[0]).slice(0, 2).join('').toUpperCase() : fallback;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Administradora',
    CONSEJO: 'Consejo',
    RESIDENTE: 'Residente',
  };
  return labels[role] || role;
}


