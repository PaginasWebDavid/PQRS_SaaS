'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/shell/Logo';
import { COLORS, RADIUS, chipStyle } from '@/lib/design/tokens';

type Role = 'ADMIN' | 'CONSEJO' | 'RESIDENTE';

const roleLabel: Record<Role, string> = { ADMIN: 'Admin', CONSEJO: 'Consejo', RESIDENTE: 'Residente' };

export default function OnboardingAdminPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [city, setCity] = useState('');
  const [units, setUnits] = useState(0);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('RESIDENTE');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.onboardingCompletedAt) return router.replace('/admin/dashboard');
        setName(d.user?.name || '');
        setTenantName(d.tenant?.name || '');
        setCity(d.tenant?.city || '');
        setUnits(d.tenant?.units || 0);
      })
      .catch(() => setError('No se pudieron cargar tus datos'));
  }, [router]);

  async function finish() {
    setSaving(true);
    setError('');
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tenantName, city, inviteEmail: inviteEmail || null, inviteRole }),
    });
    const body = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) return setError(body?.error || 'No se pudo finalizar');
    router.replace('/admin/dashboard');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? COLORS.navy : COLORS.neutralSoft, transition: 'width 250ms' }} />
          ))}
        </div>

        <div key={step} className="apl-up">
          {step === 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}><LogoMark size={34} /></div>
              <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Bienvenido, {name.split(' ')[0] || 'Admin'}</h1>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 30px' }}>En tres pasos dejamos tu conjunto listo para gestionar solicitudes reales.</p>
              <button type="button" onClick={() => setStep(1)} style={primaryButton}>Comenzar</button>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={eyebrowStyle}>PASO 1 DE 3</div>
              <h1 style={stepTitle}>Confirma los datos de tu conjunto</h1>
              <p style={stepCopy}>El nombre y la ciudad se guardarán en el conjunto.</p>
              <label style={labelStyle}>Nombre del conjunto</label>
              <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 26 }}>
                <div>
                  <label style={labelStyle}>Ciudad</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Unidades</label>
                  <input value={units} disabled style={{ ...inputStyle, background: COLORS.bgCard, color: COLORS.textMuted }} />
                </div>
              </div>
              <button type="button" onClick={() => tenantName.trim() && setStep(2)} style={primaryButton}>Continuar</button>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={eyebrowStyle}>PASO 2 DE 3</div>
              <h1 style={stepTitle}>Invita a tu primer usuario</h1>
              <p style={{ ...stepCopy, marginBottom: 20 }}>Es opcional. La invitación se enviará al finalizar.</p>
              <label style={labelStyle}>Correo</label>
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="nombre@correo.com" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
                {(['ADMIN', 'CONSEJO', 'RESIDENTE'] as Role[]).map((r) => (
                  <button key={r} type="button" onClick={() => setInviteRole(r)} style={{ border: 0, ...chipStyle(inviteRole === r) }}>{roleLabel[r]}</button>
                ))}
              </div>
              <button type="button" onClick={() => setStep(3)} style={{ ...primaryButton, marginBottom: 10 }}>Continuar</button>
              <button type="button" onClick={() => { setInviteEmail(''); setStep(3); }} style={skipStyle}>Omitir por ahora</button>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center' }}>
              <div style={eyebrowStyle}>PASO 3 DE 3</div>
              <h1 style={{ ...stepTitle, marginBottom: 20 }}>Todo listo para operar</h1>
              <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 30px' }}>Podrás crear PQRS, invitar usuarios y seguir cada cambio desde el dashboard.</p>
              {error && <p style={{ color: COLORS.warning, fontWeight: 600, marginBottom: 16 }}>{error}</p>}
              <button type="button" onClick={finish} disabled={saving} style={primaryButton}>{saving ? 'Guardando…' : 'Ir al dashboard'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const eyebrowStyle: React.CSSProperties = { fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 };
const stepTitle: React.CSSProperties = { fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' };
const stepCopy: React.CSSProperties = { fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 24px' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 };
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit' };
const primaryButton: React.CSSProperties = { width: '100%', border: 0, background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit' };
const skipStyle: React.CSSProperties = { width: '100%', border: 0, background: 'none', color: COLORS.textMuted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
