'use client';
import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { COLORS, RADIUS } from '@/lib/tokens';
import { BrandLockup } from './Logo';
import { useIsMobile } from './Sheet';

export type NavItem = { href: string; label: string; key: string };

export function AdminShell({
  navItems, activeKey, conjuntoName = 'Parque Residencial Calle 100', licenseActive = true,
  userName, userRole, initials, mobileTitle, children,
}: {
  navItems: NavItem[]; activeKey: string; conjuntoName?: string; licenseActive?: boolean;
  userName: string; userRole: string; initials: string; mobileTitle: string; children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {navItems.map((n) => (
        <Link
          key={n.key}
          href={n.href}
          onClick={onNavigate}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
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
    <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex' }}>
      {!isMobile && (
        <div style={{ width: 264, flexShrink: 0, borderRight: `1px solid ${COLORS.borderSoft}`, background: COLORS.bgSidebar, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '24px 18px' }}>
          <div style={{ padding: '0 8px 20px' }}><BrandLockup /></div>
          <div style={{ background: '#FFFFFF', border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 5 }}>CONJUNTO</div>
            <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>{conjuntoName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
              <div style={{ width: 7, height: 7, borderRadius: 999, background: licenseActive ? COLORS.success : COLORS.textMuted }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: licenseActive ? COLORS.success : COLORS.textMuted }}>{licenseActive ? 'Licencia activa' : 'Licencia suspendida'}</span>
            </div>
          </div>
          <NavLinks />
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', borderTop: `1px solid ${COLORS.borderSoft}` }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.2 }}>{userName}</div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>{userRole}</div>
            </div>
            <Link href="/login" style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted }}>Salir</Link>
          </div>
        </div>
      )}

      {isMobile && drawerOpen && (
        <>
          <div className="apl-fade" onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: COLORS.overlay, backdropFilter: 'blur(4px)', zIndex: 190 }} />
          <div className="apl-sheet" style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: 290, maxWidth: '84vw', background: '#FFFFFF', zIndex: 195, padding: '24px 18px', display: 'flex', flexDirection: 'column', boxShadow: '8px 0 40px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <BrandLockup size={21} />
              <div onClick={() => setDrawerOpen(false)} style={{ width: 30, height: 30, borderRadius: 999, background: COLORS.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, cursor: 'pointer', fontSize: 13 }}>✕</div>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <div style={{ marginTop: 'auto', borderTop: `1px solid ${COLORS.borderSoft}`, paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{initials}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 800 }}>{userName}</div><div style={{ fontSize: 11, color: COLORS.textMuted }}>{userRole}</div></div>
              <Link href="/login" style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted }}>Salir</Link>
            </div>
          </div>
        </>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px) saturate(1.8)', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <div style={{ padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div onClick={() => setDrawerOpen(true)} style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, cursor: 'pointer' }}>☰</div>
              <span style={{ fontWeight: 800, fontSize: 14.5 }}>{mobileTitle}</span>
              <div style={{ width: 32, height: 32, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{initials}</div>
            </div>
          </div>
        )}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '24px 20px 70px' : '40px 40px 90px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
