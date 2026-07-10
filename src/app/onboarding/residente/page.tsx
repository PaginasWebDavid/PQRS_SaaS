'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/shell/Logo';
import { COLORS, RADIUS } from '@/lib/design/tokens';

const TIPS = [
  'Toca "Nueva solicitud" y cuéntanos qué está pasando.',
  'Adjunta una foto si ayuda a explicar el problema.',
  'Haz seguimiento del estado en cualquier momento desde Mis PQRS.',
];

export default function OnboardingResidentePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.onboardingCompletedAt) return router.replace('/residente');
        setName(d.user?.name || '');
        setPhone(d.user?.phone || '');
        setLocation(
          d.user?.bloque && d.user?.apto
            ? 'Bloque ' + d.user.bloque + ' · Apto ' + d.user.apto
            : 'Ubicación pendiente de asignación'
        );
      })
      .catch(() => setError('No se pudieron cargar tus datos'));
  }, [router]);

  async function finish() {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return setError(body?.error || 'No se pudo finalizar');
    router.replace('/residente');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? COLORS.navy : COLORS.neutralSoft, transition: 'width 250ms' }} />
          ))}
        </div>

        <div key={step} className="apl-up">
          {step === 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <LogoMark size={34} />
              </div>
              <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
                Hola, {name.split(' ')[0] || 'Residente'} 👋
              </h1>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 30px' }}>
                Bienvenido a PQRS Services, tu canal directo con la administración de tu conjunto.
              </p>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{ width: '100%', border: 0, background: COLORS.navy, color: '#FFFFFF', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}
              >
                Comenzar
              </button>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>PASO 1 DE 2</div>
              <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 20px' }}>Confirma tus datos</h1>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre completo</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }}
              />
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Teléfono</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }}
              />
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Ubicación</label>
              <input
                value={location}
                disabled
                style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: COLORS.bgCard, color: COLORS.textMuted, marginBottom: 8 }}
              />
              <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '0 0 26px' }}>La administración controla bloque y apartamento.</p>
              <button
                type="button"
                onClick={() => name.trim() && setStep(2)}
                style={{ width: '100%', border: 0, background: COLORS.navy, color: '#FFFFFF', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}
              >
                Continuar
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>PASO 2 DE 2</div>
              <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 22px' }}>¿Cómo creo una solicitud?</h1>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28, textAlign: 'left' }}>
                {TIPS.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, background: COLORS.bgCard, borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 999, background: COLORS.navy, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 13, color: '#1D1D1F', fontWeight: 600, lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
              {error && <p style={{ color: COLORS.warning, fontSize: 13, margin: '0 0 14px' }}>{error}</p>}
              <button
                type="button"
                onClick={finish}
                style={{ width: '100%', border: 0, background: COLORS.navy, color: '#FFFFFF', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}
              >
                Ir a mi Centro de Estado
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
