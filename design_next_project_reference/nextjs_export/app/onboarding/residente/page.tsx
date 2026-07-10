'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogoMark } from '@/components/Logo';
import { COLORS, RADIUS } from '@/lib/tokens';

const TIPS = [
  'Toca "Nueva solicitud" y cuéntanos qué está pasando.',
  'Adjunta una foto si ayuda a explicar el problema.',
  'Haz seguimiento del estado en cualquier momento desde Mis PQRS.',
];

export default function OnboardingResidentePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('Diego Salazar');
  const [tower, setTower] = useState('Torre 2');
  const [apt, setApt] = useState('402');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? COLORS.navy : COLORS.neutralSoft, transition: 'width 250ms' }} />)}
        </div>

        <div key={step} className="apl-up">
          {step === 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}><LogoMark size={34} /></div>
              <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Hola, Diego 👋</h1>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 30px' }}>Bienvenido a PQRS Services, tu canal directo con la administración de Parque Residencial Calle 100.</p>
              <div onClick={() => setStep(1)} style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Comenzar</div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>PASO 1 DE 2</div>
              <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 20px' }}>Completa tu perfil</h1>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre completo</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 26 }}>
                <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Torre</label><input value={tower} onChange={(e) => setTower(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit' }} /></div>
                <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Apartamento</label><input value={apt} onChange={(e) => setApt(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit' }} /></div>
              </div>
              <div onClick={() => setStep(2)} style={{ background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Continuar</div>
            </div>
          )}

          {step === 2 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>PASO 2 DE 2</div>
              <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 22px' }}>¿Cómo creo una solicitud?</h1>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28, textAlign: 'left' }}>
                {TIPS.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, background: COLORS.bgCard, borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 999, background: COLORS.navy, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                    <span style={{ fontSize: 13, color: '#1D1D1F', fontWeight: 600, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
              <div onClick={() => router.push('/residente')} style={{ background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Ir a mi Centro de Estado</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
