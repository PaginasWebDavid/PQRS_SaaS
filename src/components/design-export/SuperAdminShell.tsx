'use client';
import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { COLORS } from '@/lib/design-export/tokens';
import { LogoMark } from './Logo';
import { useIsMobile } from './Sheet';

export type NavGroup = { header?: string; key?: string; href?: string; label?: string; onClick?: () => void };

export function SuperAdminShell({
  navGroups, activeKey, userName = 'Sofía Peña', mobileTitle, children,
}: { navGroups: NavGroup[]; activeKey: string; userName?: string; mobileTitle: string; children: ReactNode }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {navGroups.map((n, i) =>
        n.header ? (
          <div key={i} style={{ fontSize: 9.5, color: '#6C82A6', fontWeight: 700, letterSpacing: '0.07em', padding: '14px 10px 6px' }}>{n.header}</div>
        ) : (
          <div
            key={n.key}
            onClick={() => { n.onClick?.(); onNavigate?.(); }}
            style={{
              padding: '9px 10px', borderRadius: 9, fontSize: 13, cursor: 'pointer',
              fontWeight: n.key === activeKey ? 700 : 600,
              background: n.key === activeKey ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: n.key === activeKey ? '#FFFFFF' : '#B7C1D6',
            }}
          >
            {n.label}
          </div>
        )
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex' }}>
      {!isMobile && (
        <div style={{ width: 250, flexShrink: 0, background: COLORS.navy, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 20px' }}>
            <LogoMark size={22} color="#FFFFFF" check="#122545" />
            <span style={{ fontWeight: 800, fontSize: 14.5, letterSpacing: '-0.01em', color: '#FFFFFF' }}>PQRS <span style={{ fontWeight: 500, color: '#8FA1BF' }}>Services</span></span>
          </div>
          <div style={{ fontSize: 10, color: '#8FA1BF', fontWeight: 700, letterSpacing: '0.06em', padding: '0 8px 16px' }}>PANEL DE PLATAFORMA</div>
          <NavLinks />
          <div style={{ marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>SP</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF' }}>{userName}</div><div style={{ fontSize: 10.5, color: '#8FA1BF' }}>Super Admin</div></div>
              <Link href="/auth/login" style={{ fontSize: 11, fontWeight: 700, color: '#8FA1BF' }}>Salir</Link>
            </div>
          </div>
        </div>
      )}

      {isMobile && drawerOpen && (
        <>
          <div className="apl-fade" onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: COLORS.overlay, backdropFilter: 'blur(4px)', zIndex: 190 }} />
          <div className="apl-sheet" style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: 280, maxWidth: '84vw', background: COLORS.navy, zIndex: 195, padding: '24px 16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LogoMark size={21} color="#FFFFFF" check="#122545" />
                <span style={{ fontWeight: 800, fontSize: 14, color: '#FFFFFF' }}>PQRS <span style={{ fontWeight: 500, color: '#8FA1BF' }}>Services</span></span>
              </div>
              <div onClick={() => setDrawerOpen(false)} style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer', fontSize: 13 }}>✕</div>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>SP</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 800, color: '#FFFFFF' }}>{userName}</div><div style={{ fontSize: 11, color: '#8FA1BF' }}>Super Admin</div></div>
              <Link href="/auth/login" style={{ fontSize: 11.5, fontWeight: 700, color: '#8FA1BF' }}>Salir</Link>
            </div>
          </div>
        </>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px) saturate(1.8)', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <div style={{ padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div onClick={() => setDrawerOpen(true)} style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, cursor: 'pointer' }}>☰</div>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{mobileTitle}</span>
              <div style={{ width: 32, height: 32, borderRadius: 999, background: COLORS.navy, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>SP</div>
            </div>
          </div>
        )}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: isMobile ? '24px 20px 70px' : '36px 40px 90px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

