'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BrandLockup } from '@/components/shell/Logo';
import { COLORS, RADIUS } from '@/lib/design/tokens';

export default function OlvidarContrasenaPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canRequest = Boolean(email.trim());

  async function submitRequest() {
    if (!canRequest || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) setError((await res.json()).error || 'No se pudo enviar el correo.');
      else setSent(true);
    } catch {
      setError('No se pudo enviar el correo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: COLORS.textPrimary, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380 }} className="apl-up">
        <Link href="/auth/login" style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
          <BrandLockup size={24} />
        </Link>

        {!sent ? (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px', textAlign: 'center' }}>Recupera tu acceso</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 28px', textAlign: 'center', lineHeight: 1.5 }}>
              Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.
            </p>
            {error ? (
              <p style={{ background: COLORS.dangerSoft, color: COLORS.danger, fontSize: 12.5, fontWeight: 700, borderRadius: RADIUS.input, padding: '10px 12px', marginBottom: 16 }}>
                {error}
              </p>
            ) : null}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
              style={{ width: '100%', height: 48, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: RADIUS.input, fontSize: 14.5, fontFamily: 'inherit', marginBottom: 22 }}
            />
            <div
              onClick={() => !loading && submitRequest()}
              style={{
                textAlign: 'center',
                background: canRequest && !loading ? COLORS.navy : COLORS.neutralSoft,
                color: canRequest && !loading ? '#FFFFFF' : COLORS.textMuted,
                fontSize: 14.5,
                fontWeight: 700,
                padding: '13px 0',
                borderRadius: RADIUS.pill,
                cursor: canRequest && !loading ? 'pointer' : 'default',
              }}
            >
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </div>
            <p style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500, marginTop: 24, textAlign: 'center' }}>
              <Link href="/auth/login" style={{ fontWeight: 700, color: COLORS.navy }}>← Volver a iniciar sesión</Link>
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div className="apl-up" style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>
              ✉
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Revisa tu correo</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 6px' }}>Enviamos un enlace para restablecer tu contraseña a</p>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 26px' }}>{email}</p>
            <Link href="/auth/login" style={{ display: 'block', background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, marginBottom: 14 }}>
              Volver al login
            </Link>
            <p style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: 500 }}>
              ¿No llegó? <span onClick={() => !loading && submitRequest()} style={{ fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Reenviar correo</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
