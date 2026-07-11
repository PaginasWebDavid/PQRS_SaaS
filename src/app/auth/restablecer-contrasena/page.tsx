'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BrandLockup } from '@/components/shell/Logo';
import { COLORS, FONTS, RADIUS } from '@/lib/design/tokens';

const activeButton: React.CSSProperties = {
  textAlign: 'center',
  background: COLORS.navy,
  color: COLORS.white,
  fontSize: 14.5,
  fontWeight: 700,
  padding: '13px 0',
  borderRadius: RADIUS.pill,
  cursor: 'pointer',
  border: 'none',
  width: '100%',
  fontFamily: 'inherit',
};
const disabledButton: React.CSSProperties = { ...activeButton, background: COLORS.neutralSoft, color: COLORS.textMuted, cursor: 'default' };

export default function RestablecerContrasenaPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p style={{ textAlign: 'center', color: COLORS.textSecondary, fontWeight: 700 }}>Cargando…</p>
        </Shell>
      }
    >
      <ResetForm />
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style jsx global>{`
        body { margin: 0; background: ${COLORS.white}; }
        ::selection { background: ${COLORS.navySoft}; color: ${COLORS.navy}; }
        @keyframes apl-up { from { opacity:0; transform: translateY(18px); } to { opacity:1; transform: translateY(0); } }
        @keyframes apl-pop { from { opacity:0; transform: scale(0.85); } to { opacity:1; transform: scale(1); } }
        .reset-input:focus { outline: none; border-color: ${COLORS.navy} !important; box-shadow: 0 0 0 3.5px rgba(18,37,69,0.12); }
      `}</style>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.white, fontFamily: FONTS.sans, color: COLORS.textPrimary, padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380, animation: 'apl-up 500ms cubic-bezier(.2,.7,.2,1) both' }}>
          <Link href="/auth/login" style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
            <BrandLockup size={24} />
          </Link>
          {children}
        </div>
      </div>
    </>
  );
}

function ResetForm() {
  const token = useSearchParams().get('token');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(!token);
  const [error, setError] = useState('');
  const mismatch = Boolean(pass1 && pass2 && pass1 !== pass2);
  const canReset = pass1.length >= 8 && pass1 === pass2;

  async function submitReset() {
    if (!canReset || loading || !token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: pass1 }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo actualizar la contraseña.');
        if (res.status === 400 || res.status === 404) setExpired(true);
      } else {
        setDone(true);
      }
    } catch {
      setError('No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  if (expired) {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.warningSoft, color: COLORS.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>
            !
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Este enlace venció</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px', lineHeight: 1.55 }}>
            Por seguridad, los enlaces de recuperación duran un tiempo limitado. Solicita uno nuevo.
          </p>
          <Link href="/auth/olvidar-contrasena" style={{ display: 'block', background: COLORS.navy, color: COLORS.white, textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, textDecoration: 'none' }}>
            Solicitar nuevo enlace
          </Link>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.successSoft, color: COLORS.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px', animation: 'apl-pop 400ms cubic-bezier(.2,.7,.2,1) both' }}>
            ✓
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Contraseña actualizada</h1>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px', lineHeight: 1.55 }}>
            Ya puedes iniciar sesión con tu nueva contraseña.
          </p>
          <Link href="/auth/login" style={{ display: 'block', background: COLORS.navy, color: COLORS.white, textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, textDecoration: 'none' }}>
            Iniciar sesión
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px', textAlign: 'center' }}>Crea tu nueva contraseña</h1>
        <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px', textAlign: 'center' }}>Usa al menos 8 caracteres.</p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Nueva contraseña</label>
        <input
          className="reset-input"
          type="password"
          value={pass1}
          onChange={(e) => setPass1(e.target.value)}
          placeholder="••••••••"
          style={{ width: '100%', height: 48, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 14.5, fontFamily: 'inherit', marginBottom: 14 }}
        />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Confirmar contraseña</label>
        <input
          className="reset-input"
          type="password"
          value={pass2}
          onChange={(e) => setPass2(e.target.value)}
          placeholder="••••••••"
          style={{ width: '100%', height: 48, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 14.5, fontFamily: 'inherit', marginBottom: 8 }}
        />
        {mismatch ? <p style={{ fontSize: 12.5, color: COLORS.danger, fontWeight: 600, margin: '0 0 14px' }}>Las contraseñas no coinciden.</p> : <div style={{ marginBottom: 14 }} />}
        {error ? <p style={{ fontSize: 12.5, color: COLORS.danger, fontWeight: 600, margin: '0 0 14px' }}>{error}</p> : null}
        <button type="button" onClick={submitReset} disabled={!canReset || loading} style={canReset && !loading ? activeButton : disabledButton}>
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </div>
    </Shell>
  );
}
