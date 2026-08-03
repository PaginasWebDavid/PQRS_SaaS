'use client';
import { COLORS } from '@/lib/design/tokens';

// Circulo con "?" que explica al pasar el mouse o al recibir foco.
// Los estilos (.info-tip / .info-tip-bubble) viven en globals.css.
export function InfoTip({ text, label }: { text: string; label?: string }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={label ? `${label}: ${text}` : text} style={{ marginLeft: 5, verticalAlign: 'middle' }}>
      <span
        aria-hidden="true"
        style={{ width: 14, height: 14, borderRadius: 999, background: COLORS.neutralSoft, color: COLORS.textSecondaryAlt, fontSize: 9.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}
      >
        ?
      </span>
      <span className="info-tip-bubble">{text}</span>
    </span>
  );
}
