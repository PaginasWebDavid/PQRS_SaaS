'use client';
import { Sheet } from './Sheet';
import { COLORS, RADIUS } from '@/lib/design/tokens';

// En escritorio el detalle es la columna derecha, siempre visible.
// En celular esa columna cae debajo de TODA la lista, asi que con muchas
// solicitudes tocaba recorrer la pagina entera para leer la que acababas de
// tocar; ahi se abre encima, como panel, y se cierra con la X.
export function DetailPanel({
  isMobile,
  open,
  onClose,
  children,
}: {
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (isMobile) {
    return <Sheet open={open} onClose={onClose} maxWidth={560}>{children}</Sheet>;
  }
  return (
    <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: 22 }}>
      {children}
    </div>
  );
}
