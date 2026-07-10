// PQRS Services — design tokens. Exact hex values used across every screen of the redesign.
// Do NOT invent new colors — every visual should pull from here.

export const COLORS = {
  bg: '#FFFFFF',
  bgSidebar: '#FAFAFA',
  bgCard: '#F5F5F7',
  border: 'rgba(0,0,0,0.07)',
  borderSoft: 'rgba(0,0,0,0.06)',
  inputBorder: '#E8E8ED',
  inputBorderStrong: '#C7C7CC',

  textPrimary: '#1D1D1F',
  textSecondary: '#6E6E73',
  textSecondaryAlt: '#424245',
  textMuted: '#8E8E93',

  navy: '#122545',
  navyHover: '#0B1A33',
  navySoft: '#EAEEF6',
  navyText: '#9FB1CE', // used on navy backgrounds (Super Admin sidebar)
  navyMuted: '#B7C1D6',
  navyMuted2: '#8FA1BF',

  success: '#1A6B3A',
  successSoft: '#ECF6EF',
  warning: '#8A5A00',
  warningSoft: '#FBF3DF',
  danger: '#B3261E',
  dangerSoft: '#FBEAEA',
  neutralSoft: '#E8E8ED',

  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.35)',
  toastBg: '#1D1D1F',
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
