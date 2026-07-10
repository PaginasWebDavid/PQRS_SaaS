'use client';
import { useEffect, useState } from 'react';
import { COLORS, RADIUS } from '@/lib/design/tokens';

export function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isMobile;
}

export function Sheet({
  open, onClose, children, maxWidth = 480,
}: { open: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  const isMobile = useIsMobile();
  if (!open) return null;
  return (
    <div
      className="apl-fade"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: COLORS.overlay, backdropFilter: 'blur(4px)',
        zIndex: 200, display: 'flex', padding: isMobile ? 0 : 24, overflowY: 'auto',
      }}
    >
      <div
        className="apl-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth, margin: isMobile ? 'auto auto 0' : 'auto',
          background: '#FFFFFF',
          borderRadius: isMobile ? RADIUS.sheetMobile : RADIUS.sheetDesktop,
          padding: isMobile ? '28px 24px calc(28px + env(safe-area-inset-bottom))' : '30px 26px',
          maxHeight: isMobile ? '92vh' : '86vh', overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: RADIUS.pill, background: COLORS.bgCard,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted,
        cursor: 'pointer', fontSize: 13, flexShrink: 0,
      }}
    >
      ✕
    </div>
  );
}

