'use client';
import { ReactNode, useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { COLORS } from '@/lib/design/tokens';
import { LogoMark } from './Logo';
import { useIsMobile } from './Sheet';

function logout() {
  void signOut({ callbackUrl: '/auth/login' });
}

export type BottomNavItem = { key: string; label: string; icon: string; onClick: () => void };

const BLOCKING_STATUSES = ['PENDING_PAYMENT', 'SUSPENDED', 'CANCELLED'];

const BLOCKED_COPY: Record<string, { title: string; body: string }> = {
  PENDING_PAYMENT: {
    title: 'Tu conjunto no tiene el servicio activo',
    body: 'La administración de tu conjunto aún no completa el primer pago de la licencia. Pídele que active el servicio para poder radicar y ver tus solicitudes.',
  },
  SUSPENDED: {
    title: 'Servicio suspendido',
    body: 'La licencia de tu conjunto está suspendida por falta de pago. Contacta a la administración para reactivar el acceso.',
  },
  CANCELLED: {
    title: 'Servicio no disponible',
    body: 'La licencia de tu conjunto fue cancelada. Contacta a la administración de tu conjunto para más información.',
  },
};

function ResidentBlockedScreen({ status }: { status: string }) {
  const copy = BLOCKED_COPY[status] || BLOCKED_COPY.SUSPENDED;
  return (
    <div style={{ maxWidth: 420, margin: '60px auto 0', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.warningSoft, color: COLORS.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, margin: '0 auto 20px' }}>!</div>
      <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>{copy.title}</h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 10px' }}>{copy.body}</p>
      <p style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500, marginTop: 22 }}>
        ¿Necesitas ayuda?{' '}
        <a href="mailto:hola@pqrsservices.com" style={{ color: COLORS.navy, fontWeight: 700 }}>Escríbenos</a>.
      </p>
    </div>
  );
}

function ResidentErrorScreen() {
  return (
    <div style={{ maxWidth: 380, margin: '60px auto 0', textAlign: 'center' }}>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6 }}>No pudimos verificar tu sesión. Intenta recargar la página.</p>
    </div>
  );
}

function ShellLoadingScreen() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 34, height: 34, borderRadius: 999, border: `3px solid ${COLORS.borderSoft}`, borderTopColor: COLORS.navy, animation: 'apl-spin 800ms linear infinite' }} />
    </div>
  );
}

export function ResidentShell({
  activeKey, initials, greetingName, bottomNav, children,
}: { activeKey: string; initials: string; greetingName: string; bottomNav: BottomNavItem[]; children: ReactNode }) {
  const isMobile = useIsMobile(860);
  const [tenantStatus, setTenantStatus] = useState<string | null | undefined>(undefined);

  const [profileError, setProfileError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/me').then((res) => {
      if (res.status === 401) { logout(); return null; }
      if (!res.ok) throw new Error('profile');
      return res.json();
    }).then((data) => { if (alive && data) setTenantStatus(data?.tenant?.status ?? data?.licenseSummary?.status ?? null); })
      .catch(() => { if (alive) setProfileError(true); });
    return () => { alive = false; };
  }, []);

  const profileLoading = tenantStatus === undefined && !profileError;
  const blockedStatus = tenantStatus && BLOCKING_STATUSES.includes(tenantStatus) ? tenantStatus : null;

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex' }}>
      {!isMobile && (
        <div style={{ width: 250, flexShrink: 0, borderRight: `1px solid ${COLORS.borderSoft}`, background: COLORS.bgSidebar, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '22px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 20px' }}>
            <LogoMark size={22} />
            <span style={{ fontWeight: 800, fontSize: 14.5 }}>PQRS <span style={{ fontWeight: 500, color: COLORS.textSecondary }}>Services</span></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {bottomNav.map((n) => (
              <div key={n.key} onClick={n.onClick} style={{
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5,
                fontWeight: n.key === activeKey ? 700 : 600,
                background: n.key === activeKey ? COLORS.navySoft : 'transparent',
                color: n.key === activeKey ? COLORS.navy : COLORS.textSecondaryAlt,
              }}>{n.label}</div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${COLORS.borderSoft}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{initials}</div>
            <div style={{ fontSize: 12.5, fontWeight: 800, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{greetingName}</div>
            <button type="button" onClick={logout} style={{ border: 0, background: 'none', padding: 0, fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Salir</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px) saturate(1.8)', borderBottom: `1px solid ${COLORS.borderSoft}`, flexShrink: 0 }}>
            <div style={{ padding: '0 20px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LogoMark size={20} />
                <span style={{ fontWeight: 800, fontSize: 14 }}>PQRS <span style={{ fontWeight: 500, color: COLORS.textSecondary }}>Services</span></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{initials}</div>
                <button type="button" onClick={logout} style={{ border: 0, background: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: COLORS.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>Salir</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 640, margin: '0 auto', padding: isMobile ? '22px 20px 24px' : '40px 44px 60px' }}>
            {profileLoading ? <ShellLoadingScreen /> : profileError ? <ResidentErrorScreen /> : blockedStatus ? <ResidentBlockedScreen status={blockedStatus} /> : children}
          </div>
        </div>

        {isMobile && (
          <div style={{ position: 'sticky', bottom: 0, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px) saturate(1.8)', borderTop: `1px solid ${COLORS.borderSoft}`, display: 'flex', padding: '8px 6px calc(8px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
            {bottomNav.map((n) => (
              <div key={n.key} onClick={n.onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 0', cursor: 'pointer' }}>
                <span style={{ fontSize: 18, color: n.key === activeKey ? COLORS.navy : COLORS.textMuted }}>{n.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: n.key === activeKey ? COLORS.navy : COLORS.textMuted }}>{n.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

