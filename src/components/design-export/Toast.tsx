'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { COLORS, RADIUS } from '@/lib/design-export/tokens';

export function useToast() {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { toast, showToast };
}

export function Toast({ message, bottom = 24 }: { message: string; bottom?: number }) {
  if (!message) return null;
  return (
    <div
      className="apl-sheet"
      style={{
        position: 'fixed', bottom, left: '50%', transform: 'translateX(-50%)',
        background: COLORS.toastBg, color: '#FFFFFF', fontSize: 13.5, fontWeight: 600,
        padding: '13px 24px', borderRadius: RADIUS.pill, zIndex: 300,
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}
