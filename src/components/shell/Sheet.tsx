'use client';
import { useEffect, useRef, useState } from 'react';
import { COLORS, RADIUS } from '@/lib/design/tokens';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable || panel)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

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
        ref={panelRef}
        className="apl-sheet"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth, margin: isMobile ? 'auto auto 0' : 'auto',
          background: '#FFFFFF',
          borderRadius: isMobile ? RADIUS.sheetMobile : RADIUS.sheetDesktop,
          padding: isMobile ? '28px 24px calc(28px + env(safe-area-inset-bottom))' : '30px 26px',
          maxHeight: isMobile ? '92vh' : '86vh', overflowY: 'auto',
          outline: 'none',
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

