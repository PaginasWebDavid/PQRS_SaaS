// PQRS Services — design tokens. Every value here is a CSS variable defined in
// src/app/globals.css (:root for light, .dark for dark mode). Do NOT hardcode
// a new hex value in this file or in consuming components — add the variable
// to globals.css first, then reference it here.

export const COLORS = {
  bg: 'hsl(var(--background))',
  bgSidebar: 'var(--surface-sidebar)',
  bgCard: 'var(--surface-card-soft)',
  border: 'hsl(var(--border))',
  borderSoft: 'var(--border-soft)',
  inputBorder: 'var(--input-border)',
  inputBorderStrong: 'var(--input-border-strong)',

  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textSecondaryAlt: 'var(--text-secondary-alt)',
  textMuted: 'var(--text-muted)',

  navy: 'var(--navy)',
  navyHover: 'var(--navy-hover)',
  navySoft: 'var(--navy-soft)',
  navyText: 'var(--navy-text)', // used on navy backgrounds (Super Admin sidebar)
  navyMuted: 'var(--navy-muted)',
  navyMuted2: 'var(--navy-muted-2)',

  success: 'var(--status-success)',
  successSoft: 'var(--status-success-soft)',
  warning: 'var(--status-warning)',
  warningSoft: 'var(--status-warning-soft)',
  danger: 'var(--status-danger)',
  dangerSoft: 'var(--status-danger-soft)',
  neutralSoft: 'var(--neutral-soft)',

  white: '#FFFFFF',
  overlay: 'var(--overlay)',
  toastBg: 'var(--toast-bg)',
} as const;

export const FONTS = {
  sans: "'Manrope', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

export const RADIUS = {
  card: 18,
  cardSm: 16,
  input: 12,
  pill: 999,
  sheetDesktop: 22,
  sheetMobile: '22px 22px 0 0',
};

// ---- shared style builders (mirrors the badge()/toggleStyle()/tabStyle() helpers
// that were duplicated inline across every .dc.html screen) ----

export function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 11px',
    borderRadius: RADIUS.pill,
    whiteSpace: 'nowrap',
    display: 'inline-block',
  };
}

export function tabStyle(active: boolean): React.CSSProperties {
  return active
    ? { fontSize: 12.5, fontWeight: 700, color: '#FFFFFF', background: '#1D1D1F', padding: '7px 14px', borderRadius: RADIUS.pill, cursor: 'pointer' }
    : { fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary, background: COLORS.bgCard, padding: '7px 14px', borderRadius: RADIUS.pill, cursor: 'pointer' };
}

export function chipStyle(active: boolean): React.CSSProperties {
  return active
    ? { fontSize: 12.5, fontWeight: 700, color: '#FFFFFF', background: COLORS.navy, padding: '9px 15px', borderRadius: RADIUS.pill, cursor: 'pointer' }
    : { fontSize: 12.5, fontWeight: 600, color: COLORS.textPrimary, background: COLORS.bgCard, padding: '9px 15px', borderRadius: RADIUS.pill, cursor: 'pointer' };
}

export function toggleTrackStyle(on: boolean): React.CSSProperties {
  return { width: 42, height: 25, borderRadius: RADIUS.pill, background: on ? COLORS.navy : COLORS.neutralSoft, cursor: 'pointer', padding: 2.5, transition: 'background 200ms' };
}
export function toggleDotStyle(on: boolean): React.CSSProperties {
  return { width: 20, height: 20, borderRadius: RADIUS.pill, background: '#FFFFFF', transition: 'transform 200ms', transform: `translateX(${on ? 17 : 0}px)` };
}

// PQRS status semantics (Radicada -> Recibida -> En revisión -> En proceso -> Terminada)
export function statusBadge(status: 'abierta' | 'revision' | 'proceso' | 'terminada'): React.CSSProperties {
  switch (status) {
    case 'abierta': return badgeStyle(COLORS.warningSoft, COLORS.warning);
    case 'revision': return badgeStyle(COLORS.neutralSoft, COLORS.textSecondaryAlt);
    case 'proceso': return badgeStyle(COLORS.navySoft, COLORS.navy);
    case 'terminada': return badgeStyle(COLORS.successSoft, COLORS.success);
  }
}

