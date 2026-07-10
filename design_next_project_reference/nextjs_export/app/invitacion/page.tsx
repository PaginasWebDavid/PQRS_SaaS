'use client';
import Link from 'next/link';
import { useState } from 'react';
import { BrandLockup } from '@/components/Logo';
import { COLORS, RADIUS, badgeStyle } from '@/lib/tokens';

export default function InvitacionPage() {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [expiredDemo, setExpiredDemo] = useState(false);

  const canSubmit = !!fullName.trim() && password.length >= 8;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }} className="apl-up">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}><BrandLockup size={24} /></div>

        {step === 'form' && !expiredDemo && (
          <div>
            <div style={{ background: COLORS.bgCard, borderRadius: 16, padding: '20px 22px', marginBottom: 26, textAlign: 'center' }}>
              <div style={{ fontSize: 13.5, color: COLORS.textSecondaryAlt, fontWeight: 600 }}>Has sido invitado a</div>
              <div style={{ fontSize: 16, fontWeight: 800, margin: '4px 0 8px' }}>Parque Residencial Calle 100</div>
              <span style={badgeStyle(COLORS.navySoft, COLORS.navy)}>Administrador</span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 20px', textAlign: 'center' }}>Crea tu contraseña para continuar</h1>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Nombre completo</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" style={{ width: '100%', height: 46, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 14 }} />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Correo</label>
            <input value="ana.ruiz@parque100.com" disabled style={{ width: '100%', height: 46, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 14, background: COLORS.bgCard, color: COLORS.textMuted }} />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Crear contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" style={{ width: '100%', height: 46, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 22 }} />
            <div onClick={() => canSubmit && setStep('done')} style={{ textAlign: 'center', background: canSubmit ? COLORS.navy : COLORS.neutralSoft, color: canSubmit ? '#FFFFFF' : COLORS.textMuted, fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: canSubmit ? 'pointer' : 'default' }}>Confirmar cuenta</div>
            <p style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 500, marginTop: 16, textAlign: 'center', lineHeight: 1.5 }}>Al confirmar aceptas los términos de uso de PQRS Services.</p>
            <div onClick={() => setExpiredDemo(true)} style={{ textAlign: 'center', marginTop: 28, fontSize: 11.5, color: '#C7C7CC', fontWeight: 600, cursor: 'pointer' }}>Ver ejemplo: invitación vencida</div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div className="apl-up" style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.successSoft, color: COLORS.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>✓</div>
            <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Cuenta creada</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px' }}>Tu acceso a Parque Residencial Calle 100 está listo.</p>
            <Link href="/login" style={{ display: 'block', background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill }}>Iniciar sesión</Link>
          </div>
        )}

        {expiredDemo && step === 'form' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.warningSoft, color: COLORS.warning, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>!</div>
            <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Esta invitación venció</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px' }}>Pídele a tu administración que te envíe una nueva invitación.</p>
            <div onClick={() => setExpiredDemo(false)} style={{ border: `1.5px solid ${COLORS.inputBorder}`, color: '#1D1D1F', fontSize: 13.5, fontWeight: 700, padding: '12px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Ver ejemplo de invitación válida</div>
          </div>
        )}
      </div>
    </div>
  );
}
