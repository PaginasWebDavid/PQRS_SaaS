'use client';
import { ReactNode, useState } from 'react';
import { COLORS } from '@/lib/tokens';
import { LogoMark } from './Logo';
import { useIsMobile } from './Sheet';

export type BottomNavItem = { key: string; label: string; icon: string; onClick: () => void };

export function ResidentShell({
  activeKey, initials, greetingName, bottomNav, children,
}: { activeKey: string; initials: string; greetingName: string; bottomNav: BottomNavItem[]; children: ReactNode }) {
  const isMobile = useIsMobile(860);

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
            <div style={{ width: 32, height: 32, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{initials}</div>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{greetingName}</div>
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
              <div style={{ width: 30, height: 30, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{initials}</div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 640, margin: '0 auto', padding: isMobile ? '22px 20px 24px' : '40px 44px 60px' }}>
            {children}
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
