'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandLockup } from '@/components/design-export/Logo';
import { COLORS, RADIUS, badgeStyle } from '@/lib/design-export/tokens';

type Details = { email: string; role: string; expiresAt: string; tenant: { name: string } };
const roleLabel: Record<string, string> = { ADMIN: 'Administrador', ASISTENTE: 'Asistente', CONSEJO: 'Consejo', RESIDENTE: 'Residente' };

export default function InvitacionPage() {
  const [token, setToken] = useState('');
  const [details, setDetails] = useState<Details | null>(null);
  const [state, setState] = useState<'loading' | 'form' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [bloque, setBloque] = useState('');
  const [apto, setApto] = useState('');

  useEffect(() => {
    const currentToken = new URLSearchParams(window.location.search).get("token") || "";
    setToken(currentToken);
    fetch('/api/invitations/accept?token=' + encodeURIComponent(currentToken), { cache: 'no-store' })
      .then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body.error); setDetails(body); setState('form'); })
      .catch((e) => { setError(e.message || 'Invitacion invalida'); setState('error'); });
  }, []);

  async function accept() {
    setError('');
    const res = await fetch('/api/invitations/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name: fullName, password, bloque: bloque || null, apto: apto || null }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error || 'No se pudo aceptar la invitaciÃƒÂ³n'); return; }
    setState('done');
  }

  const resident = details?.role === 'RESIDENTE';
  const canSubmit = fullName.trim().length >= 2 && password.length >= 8 && /[A-Za-z]/.test(password) && /d/.test(password) && (!resident || (bloque && apto));
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFF', fontFamily: 'Manrope, sans-serif', color: '#1D1D1F', padding: 24 }}>
    <div style={{ width: '100%', maxWidth: 400 }} className="apl-up">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}><BrandLockup size={24} /></div>
      {state === 'loading' && <div style={{ textAlign: 'center', color: COLORS.textMuted }}>Validando invitaciÃƒÂ³nÃ¢â‚¬Â¦</div>}
      {state === 'form' && details && <>
        <div style={{ background: COLORS.bgCard, borderRadius: 16, padding: '20px 22px', marginBottom: 26, textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, color: COLORS.textSecondaryAlt, fontWeight: 600 }}>Has sido invitado a</div>
          <div style={{ fontSize: 16, fontWeight: 800, margin: '4px 0 8px' }}>{details.tenant.name}</div>
          <span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>{roleLabel[details.role] || details.role}</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 20px', textAlign: 'center' }}>Crea tu contraseÃƒÂ±a para continuar</h1>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Nombre completo</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Correo</label>
        <input value={details.email} disabled style={{ ...inputStyle, background: COLORS.bgCard, color: COLORS.textMuted }} />
        {resident && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>Bloque</label><input inputMode="numeric" value={bloque} onChange={(e) => setBloque(e.target.value.replace(/D/g, '').slice(0, 3))} style={inputStyle} /></div>
          <div><label style={labelStyle}>Apartamento</label><input inputMode="numeric" value={apto} onChange={(e) => setApto(e.target.value.replace(/D/g, '').slice(0, 6))} style={inputStyle} /></div>
        </div>}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Crear contraseÃƒÂ±a</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caracteres, una letra y un nÃƒÂºmero" style={inputStyle} />
        {error && <p role="alert" style={{ color: COLORS.warning, fontSize: 13, fontWeight: 600 }}>{error}</p>}
        <button onClick={accept} disabled={!canSubmit} style={{ width: '100%', border: 0, textAlign: 'center', background: canSubmit ? COLORS.navy : COLORS.neutralSoft, color: canSubmit ? '#FFF' : COLORS.textMuted, fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill }}>Confirmar cuenta</button>
      </>}
      {state === 'done' && <div style={{ textAlign: 'center' }}><div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.successSoft, color: COLORS.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>Ã¢Å“â€œ</div><h1 style={{ fontSize: 21, fontWeight: 800 }}>Cuenta creada</h1><p style={{ color: COLORS.textSecondary }}>Tu acceso estÃƒÂ¡ listo. Inicia sesiÃƒÂ³n para completar la bienvenida.</p><Link href={'/auth/login?email=' + encodeURIComponent(details?.email || '')} style={{ display: 'block', background: COLORS.navy, color: '#FFF', padding: '13px 0', borderRadius: RADIUS.pill }}>Iniciar sesiÃƒÂ³n</Link></div>}
      {state === 'error' && <div style={{ textAlign: 'center' }}><div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.warningSoft, color: COLORS.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>!</div><h1 style={{ fontSize: 21, fontWeight: 800 }}>No se puede usar esta invitaciÃƒÂ³n</h1><p style={{ color: COLORS.textSecondary }}>{error}</p><Link href="/auth/login" style={{ color: COLORS.navy, fontWeight: 700 }}>Ir al inicio de sesiÃƒÂ³n</Link></div>}
    </div>
  </div>;
}
const inputStyle: React.CSSProperties = { width: '100%', height: 46, padding: '0 15px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 14 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 };
