'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandLockup } from '@/components/shell/Logo';
import { useIsMobile } from '@/components/shell/Sheet';
import { COLORS, RADIUS, badgeStyle } from '@/lib/design/tokens';

type Details = { email: string; role: string; expiresAt: string; tenant: { name: string } };
const roleLabel: Record<string, string> = { ADMIN: 'Administrador', CONSEJO: 'Consejo', RESIDENTE: 'Residente' };

export default function InvitacionPage() {
  const isMobile = useIsMobile();
  const [token, setToken] = useState('');
  const [details, setDetails] = useState<Details | null>(null);
  const [state, setState] = useState<'loading' | 'form' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [bloque, setBloque] = useState('');
  const [apto, setApto] = useState('');
  const [legalAccepted, setLegalAccepted] = useState(false);

  useEffect(() => {
    const currentToken = new URLSearchParams(window.location.search).get('token') || '';
    setToken(currentToken);
    fetch('/api/invitations/accept?token=' + encodeURIComponent(currentToken), { cache: 'no-store' })
      .then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error); setDetails(body); setState('form'); })
      .catch((e) => { setError(e.message || 'Invitación inválida'); setState('error'); });
  }, []);

  async function accept() {
    if (!legalAccepted) return;
    setError('');
    const res = await fetch('/api/invitations/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name: fullName, password, bloque: bloque || null, apto: apto || null, acceptedLegal: true }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error || 'No se pudo aceptar la invitación'); return; }
    setState('done');
  }

  const resident = details?.role === 'RESIDENTE';
  const canSubmit = fullName.trim().length >= 2 && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && (!resident || (bloque && apto));

  const inputStyle: React.CSSProperties = { width: '100%', height: 46, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 14 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }} className="apl-up">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}><BrandLockup size={24} /></div>

        {state === 'loading' && (
          <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 13.5, fontWeight: 600 }}>Validando invitación…</div>
        )}

        {state === 'form' && details && (
          <div>
            <div style={{ background: COLORS.bgCard, borderRadius: 16, padding: '20px 22px', marginBottom: 26, textAlign: 'center' }}>
              <div style={{ fontSize: 13.5, color: COLORS.textSecondaryAlt, fontWeight: 600 }}>Has sido invitado a</div>
              <div style={{ fontSize: 16, fontWeight: 800, margin: '4px 0 8px' }}>{details.tenant.name}</div>
              <span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>{roleLabel[details.role] || details.role}</span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 20px', textAlign: 'center' }}>Crea tu contraseña para continuar</h1>

            <label style={labelStyle}>Nombre completo</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" style={inputStyle} />

            <label style={labelStyle}>Correo</label>
            <input value={details.email} disabled style={{ ...inputStyle, background: COLORS.bgCard, color: COLORS.textMuted }} />

            {resident && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Bloque</label>
                  <input inputMode="numeric" value={bloque} onChange={(e) => setBloque(e.target.value.replace(/\D/g, '').slice(0, 3))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Apartamento</label>
                  <input inputMode="numeric" value={apto} onChange={(e) => setApto(e.target.value.replace(/\D/g, '').slice(0, 6))} style={inputStyle} />
                </div>
              </div>
            )}

            <label style={labelStyle}>Crear contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caracteres, una letra y un número" style={{ ...inputStyle, marginBottom: 22 }} />

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.5, marginBottom: 18, cursor: 'pointer' }}>
              <input type="checkbox" checked={legalAccepted} onChange={(e) => setLegalAccepted(e.target.checked)} style={{ marginTop: 3, accentColor: COLORS.navy }} />
              <span>Acepto los <Link href="/legal/terminos" target="_blank" style={{ color: COLORS.navy, fontWeight: 700 }}>términos de uso</Link> y he leído la <Link href="/legal/privacidad" target="_blank" style={{ color: COLORS.navy, fontWeight: 700 }}>política de tratamiento de datos</Link>.</span>
            </label>

            {error && (
              <p role="alert" style={{ color: COLORS.warning, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{error}</p>
            )}

            <button
              onClick={accept}
              disabled={!canSubmit || !legalAccepted}
              style={{
                width: '100%',
                border: 0,
                textAlign: 'center',
                background: canSubmit && legalAccepted ? COLORS.navy : COLORS.neutralSoft,
                color: canSubmit && legalAccepted ? '#FFFFFF' : COLORS.textMuted,
                fontSize: 14.5,
                fontWeight: 700,
                padding: '13px 0',
                borderRadius: RADIUS.pill,
                cursor: canSubmit && legalAccepted ? 'pointer' : 'default',
              }}
            >
              Confirmar cuenta
            </button>
            <p style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, marginTop: 16, textAlign: 'center', lineHeight: 1.5 }}>
              La invitación queda asociada automáticamente a tu conjunto y rol.
            </p>
          </div>
        )}

        {state === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div className="apl-up" style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.successSoft, color: COLORS.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>✓</div>
            <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Cuenta creada</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px' }}>Tu acceso está listo. Inicia sesión para completar la bienvenida.</p>
            <Link href={'/auth/login?email=' + encodeURIComponent(details?.email || '')} style={{ display: 'block', background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill }}>
              Iniciar sesión
            </Link>
          </div>
        )}

        {state === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.warningSoft, color: COLORS.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>!</div>
            <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>No se puede usar esta invitación</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px' }}>{error}</p>
            <Link href="/auth/login" style={{ color: COLORS.navy, fontWeight: 700 }}>Ir al inicio de sesión</Link>
          </div>
        )}
      </div>
    </div>
  );
}
