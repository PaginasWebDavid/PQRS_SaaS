export function LogoMark({ size = 22, color = '#122545', check = '#FFFFFF' }: { size?: number; color?: string; check?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: 'block' }}>
      <path d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z" fill={color} />
      <path d="M40 62l17 17 31-34" fill="none" stroke={check} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ dark = true, size = 14.5 }: { dark?: boolean; size?: number }) {
  return (
    <span style={{ fontWeight: 800, fontSize: size, letterSpacing: '-0.01em', color: dark ? '#1D1D1F' : '#FFFFFF' }}>
      PQRS <span style={{ fontWeight: 500, color: dark ? '#6E6E73' : '#8FA1BF' }}>Services</span>
    </span>
  );
}

export function BrandLockup({ dark = true, size = 22 }: { dark?: boolean; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <LogoMark size={size} color={dark ? '#122545' : '#FFFFFF'} check={dark ? '#FFFFFF' : '#122545'} />
      <Wordmark dark={dark} size={size < 20 ? 13 : 14.5} />
    </div>
  );
}
