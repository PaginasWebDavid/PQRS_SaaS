'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogoMark } from '@/components/Logo';
import { COLORS, RADIUS, badgeStyle, chipStyle } from '@/lib/tokens';

export default function OnboardingAdminPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('Parque Residencial Calle 100');
  const [city, setCity] = useState('Bogotá');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'consejo' | 'residente'>('admin');
  const [pending, setPending] = useState<{ email: string; role: string; style: React.CSSProperties }[]>([]);

  const addInvite = () => {
    if (!inviteEmail.trim()) return;
    const label = { admin: 'Admin', consejo: 'Consejo', residente: 'Residente' }[inviteRole];
    const style = inviteRole === 'admin' ? badgeStyle(COLORS.navySoft, COLORS.navy) : inviteRole === 'consejo' ? badgeStyle(COLORS.warningSoft, COLORS.warning) : badgeStyle(COLORS.successSoft, COLORS.success);
    setPending((p) => [...p, { email: inviteEmail, role: label, style }]);
    setInviteEmail('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? COLORS.navy : COLORS.neutralSoft, transition: 'width 250ms' }} />)}
        </div>

        <div key={step} className="apl-up">
          {step === 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}><LogoMark size={34} /></div>
              <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Bienvenida, Ana</h1>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, fontWeight: 500, lineHeight: 1.6, margin: '0 0 30px' }}>En 3 pasos cortos dejamos tu conjunto listo para operar en PQRS Services.</p>
              <div onClick={() => setStep(1)} style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Comenzar</div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>PASO 1 DE 3</div>
              <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Confirma los datos de tu conjunto</h1>
              <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 24px' }}>Puedes editarlos después desde Configuración.</p>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Nombre del conjunto</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 14 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 26 }}>
                <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Ciudad</label><input value={city} onChange={(e) => setCity(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit' }} /></div>
                <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Unidades</label><input value="312" disabled style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', background: COLORS.bgCard, color: COLORS.textMuted }} /></div>
              </div>
              <div onClick={() => setStep(2)} style={{ background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Continuar</div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>PASO 2 DE 3</div>
              <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Invita a tu equipo</h1>
              <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 20px' }}>Puedes agregar más personas después desde Invitaciones. Esto es opcional.</p>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>Correo</label>
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="nombre@correo.com" style={{ width: '100%', height: 44, padding: '0 14px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 11, fontSize: 13.5, fontFamily: 'inherit', marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {(['admin', 'consejo', 'residente'] as const).map((r) => (
                  <div key={r} onClick={() => setInviteRole(r)} style={chipStyle(inviteRole === r)}>{{ admin: 'Admin', consejo: 'Consejo', residente: 'Residente' }[r]}</div>
                ))}
              </div>
              <div onClick={addInvite} style={{ textAlign: 'center', border: `1.5px solid ${COLORS.inputBorder}`, color: '#1D1D1F', fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: RADIUS.pill, cursor: 'pointer', marginBottom: 18 }}>+ Agregar a la lista</div>
              {pending.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                  {pending.map((inv, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: COLORS.bgCard, borderRadius: 10, padding: '10px 14px' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{inv.email}</span>
                      <span style={inv.style}>{inv.role}</span>
                    </div>
                  ))}
                </div>
              )}
              <div onClick={() => setStep(3)} style={{ background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', marginBottom: 10 }}>Continuar</div>
              <div onClick={() => setStep(3)} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: COLORS.textMuted, cursor: 'pointer' }}>Omitir por ahora</div>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>PASO 3 DE 3</div>
              <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 20px' }}>Así se gestiona una PQRS</h1>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 24 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} style={{ width: 26, height: 26, borderRadius: 999, background: COLORS.navySoft, color: COLORS.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, margin: '0 4px' }}>{n}</div>
                ))}
              </div>
              <p style={{ fontSize: 13, color: COLORS.textSecondaryAlt, fontWeight: 600, margin: '0 0 4px' }}>Radicada → Recibida → En revisión → En proceso → Terminada</p>
              <p style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 30px', lineHeight: 1.6 }}>Cada PQRS avanza por estas fases. Tú decides cuándo pasar a la siguiente y puedes dejar notas internas del equipo.</p>
              <div onClick={() => router.push('/admin/dashboard')} style={{ background: COLORS.navy, color: '#FFFFFF', textAlign: 'center', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer' }}>Ir a mi dashboard</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
