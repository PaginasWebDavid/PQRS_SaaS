'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { COLORS, RADIUS } from '@/lib/design/tokens';

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
  const [rendered, setRendered] = useState(Boolean(message));
  const [closing, setClosing] = useState(false);
  const lastMessage = useRef(message);
  if (message) lastMessage.current = message;

  // Anima la salida antes de desmontar en vez de desaparecer de golpe
  // (AUDIT.md categoria 4/8: entrada y salida deben ser simetricas).
  useEffect(() => {
    if (message) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [message, rendered]);

  if (!rendered) return null;
  return (
    <div
      className={closing ? 'apl-fade-out' : 'apl-sheet'}
      style={{
        position: 'fixed', bottom, left: '50%', transform: 'translateX(-50%)',
        background: COLORS.toastBg, color: '#FFFFFF', fontSize: 13.5, fontWeight: 600,
        padding: '13px 24px', borderRadius: RADIUS.pill, zIndex: 300,
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
      }}
    >
      {lastMessage.current}
    </div>
  );
}
