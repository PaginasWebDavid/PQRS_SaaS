'use client';
import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { COLORS } from '@/lib/design/tokens';
import { LogoMark } from './Logo';
import { useIsMobile } from './Sheet';

export type NavGroup = { header?: string; key?: string; href?: string; label?: string; onClick?: () => void };

export type MrrWidget = { amountCents: number; growthPercent: number | null } | null;

function formatMrr(cents: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100);
}

export function SuperAdminShell({
  navGroups, activeKey, userName = 'Sofía Peña', mobileTitle, children, mrrWidget, platformName = 'PQRS Services',
}: { navGroups: NavGroup[]; activeKey: string; userName?: string; mobileTitle: string; children: ReactNode; mrrWidget?: MrrWidget; platformName?: string }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [brandFirst, ...brandRest] = platformName.split(' ');
  const brandRestText = brandRest.join(' ');

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="no-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {navGroups.map((n, i) =>
        n.header ? (
          <div key={i} style={{ fontSize: 9.5, color: '#6C82A6', fontWeight: 700, letterSpacing: '0.07em', padding: '14px 10px 6px' }}>{n.header}</div>
        ) : (
          <button
            key={n.key}
            type="button"
            onClick={() => { n.onClick?.(); onNavigate?.(); }}
            style={{
              padding: '7px 10px', borderRadius: 9, fontSize: 13.25, cursor: 'pointer',
              fontWeight: n.key === activeKey ? 700 : 600,
              background: n.key === activeKey ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: n.key === activeKey ? '#FFFFFF' : '#B7C1D6',
              border: 'none', font: 'inherit', textAlign: 'left', width: '100%',
            }}
          >
            {n.label}
          </button>
        )
      )}
    </div>
  );

  const MrrCard = () => mrrWidget ? (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 13, margin: '0 0 14px' }}>
      <div style={{ fontSize: 10, color: '#8FA1BF', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 5 }}>MRR</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>{formatMrr(mrrWidget.amountCents)}</div>
      {mrrWidget.growthPercent != null && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: mrrWidget.growthPercent >= 0 ? '#5FD394' : '#F87171', marginTop: 3 }}>
          {mrrWidget.growthPercent >= 0 ? '+' : ''}{mrrWidget.growthPercent.toFixed(1)}% vs. mes anterior
        </div>
      )}
    </div>
  ) : null;

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex' }}>
      {!isMobile && (
        <div style={{ width: 250, flexShrink: 0, background: COLORS.navy, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 20px' }}>
            <LogoMark size={22} color="#FFFFFF" check="#122545" />
            <span style={{ fontWeight: 800, fontSize: 14.5, letterSpacing: '-0.01em', color: '#FFFFFF' }}>{brandFirst} {brandRestText && <span style={{ fontWeight: 500, color: '#8FA1BF' }}>{brandRestText}</span>}</span>
          </div>
          <NavLinks />
          <div style={{ marginTop: 'auto' }}>
            <MrrCard />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>SP</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF' }}>{userName}</div><div style={{ fontSize: 10.5, fontWeight: 500, color: '#8FA1BF' }}>Super Admin</div></div>
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
                <span style={{ fontWeight: 800, fontSize: 14, color: '#FFFFFF' }}>{brandFirst} {brandRestText && <span style={{ fontWeight: 500, color: '#8FA1BF' }}>{brandRestText}</span>}</span>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer', fontSize: 13, border: 'none', font: 'inherit' }}>✕</button>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <MrrCard />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>SP</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 800, color: '#FFFFFF' }}>{userName}</div><div style={{ fontSize: 11, fontWeight: 500, color: '#8FA1BF' }}>Super Admin</div></div>
              <Link href="/auth/login" style={{ fontSize: 11.5, fontWeight: 700, color: '#8FA1BF' }}>Salir</Link>
            </div>
          </div>
        </>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px) saturate(1.8)', borderBottom: `1px solid ${COLORS.borderSoft}` }}>
            <div style={{ padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => setDrawerOpen(true)} style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.bgCard, border: 'none', font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, cursor: 'pointer' }}>☰</button>
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

