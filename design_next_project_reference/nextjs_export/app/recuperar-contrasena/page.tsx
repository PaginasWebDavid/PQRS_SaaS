'use client';
import Link from 'next/link';
import { useState } from 'react';
import { BrandLockup, LogoMark } from '@/components/Logo';
import { COLORS, RADIUS } from '@/lib/tokens';

type Step = 'request' | 'sent' | 'reset' | 'done' | 'expired';

export default function RecuperarContrasenaPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');

  const canRequest = !!email.trim();
  const mismatch = pass1 && pass2 && pass1 !== pass2;
  const canReset = pass1.length >= 8 && pass1 === pass2;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380 }} className="apl-up">
        <Link href="/login" style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}><BrandLockup size={24} /></Link>

        {step === 'request' && (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px', textAlign: 'center' }}>Recupera tu acceso</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 28px', textAlign: 'center', lineHeight: 1.5 }}>Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.</p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Correo electrónico</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" style={{ width: '100%', height: 48, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14.5, fontFamily: 'inherit', marginBottom: 22 }} />
            <div onClick={() => canRequest && setStep('sent')} style={{ textAlign: 'center', background: canRequest ? COLORS.navy : COLORS.neutralSoft, color: canRequest ? '#FFFFFF' : COLORS.textMuted, fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: canRequest ? 'pointer' : 'default' }}>Enviar enlace</div>
            <p style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500, marginTop: 24, textAlign: 'center' }}><Link href="/login" style={{ fontWeight: 700, color: COLORS.navy }}>← Volver a iniciar sesión</Link></p>
          </div>
        )}

        {step === 'sent' && (
          <div style={{ textAlign: 'center' }}>
            <div className="apl-up" style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>✉</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Revisa tu correo</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 6px' }}>Enviamos un enlace para restablecer tu contraseña a</p>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 26px' }}>{email}</p>
            <div onClick={() => setStep('reset')} style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', marginBottom: 14 }}>Abrir enlace de ejemplo</div>
            <p style={{ fontSize: 12.5, color: COLORS.textMuted, fontWeight: 500 }}>¿No llegó? <span onClick={() => setStep('sent')} style={{ fontWeight: 700, color: COLORS.navy, cursor: 'pointer' }}>Reenviar correo</span></p>
          </div>
        )}

        {step === 'reset' && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px', textAlign: 'center' }}>Crea tu nueva contraseña</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px', textAlign: 'center' }}>Usa al menos 8 caracteres.</p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Nueva contraseña</label>
            <input type="password" value={pass1} onChange={(e) => setPass1(e.target.value)} placeholder="••••••••" style={{ width: '100%', height: 48, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14.5, fontFamily: 'inherit', marginBottom: 14 }} />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Confirmar contraseña</label>
            <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="••••••••" style={{ width: '100%', height: 48, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14.5, fontFamily: 'inherit', marginBottom: 8 }} />
            {mismatch ? <p style={{ fontSize: 12.5, color: COLORS.danger, fontWeight: 600, margin: '0 0 14px' }}>Las contraseñas no coinciden.</p> : <div style={{ marginBottom: 14 }} />}
            <div onClick={() => canReset && setStep('done')} style={{ textAlign: 'center', background: canReset ? COLORS.navy : COLORS.neutralSoft, color: canReset ? '#FFFFFF' : COLORS.textMuted, fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: canReset ? 'pointer' : 'default' }}>Guardar contraseña</div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div className="apl-up" style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.successSoft, color: COLORS.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>✓</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Contraseña actualizada</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px', lineHeight: 1.55 }}>Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <Link href="/login" style={{ display: 'block', background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill }}>Iniciar sesión</Link>
          </div>
        )}

        {step === 'expired' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.warningSoft, color: COLORS.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>!</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Este enlace venció</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px', lineHeight: 1.55 }}>Por seguridad, los enlaces de recuperación duran un tiempo limitado. Solicita uno nuevo.</p>
            <div onClick={() => setStep('request')} style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Solicitar nuevo enlace</div>
          </div>
        )}
      </div>
    </div>
  );
}
