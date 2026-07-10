'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogoMark } from '@/components/shell/Logo';
import { COLORS, RADIUS } from '@/lib/design/tokens';

export default function OnboardingConsejoPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
          {[0, 1].map((i) => <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? COLORS.navy : COLORS.neutralSoft, transition: 'width 250ms' }} />)}
        </div>

        <div key={step} className="apl-up" style={{ textAlign: 'center' }}>
          {step === 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}><LogoMark size={34} /></div>
              <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Bienvenida, Camila</h1>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 30px' }}>Tu acceso al Consejo de Administración de Parque Residencial Calle 100 ya está activo.</p>
              <button type="button" onClick={() => setStep(1)} style={{ width: '100%', border: 'none', background: COLORS.navy, color: '#FFFFFF', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' }}>Continuar</button>
            </>
          )}

          {step === 1 && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 20px' }}>Tu rol es de consulta</h1>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, textAlign: 'left' }}>
                {[
                  'Puedes ver el dashboard, PQRS, reportes, indicadores, actividad y documentos del conjunto.',
                  'No puedes crear, editar ni cerrar PQRS — eso lo hace la administración.',
                  'Toda la información aquí es de solo lectura, pensada para que prepares tus reuniones de consejo.',
                ].map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, background: COLORS.bgCard, borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i === 1 ? '✕' : '✓'}</div>
                    <span style={{ fontSize: 13, color: '#1D1D1F', fontWeight: 600, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => router.push('/consejo')} style={{ width: '100%', border: 'none', background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' }}>Ir a mi dashboard</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
