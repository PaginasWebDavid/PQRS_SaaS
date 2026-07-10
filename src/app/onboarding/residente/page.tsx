'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/design-export/Logo';
import { COLORS, RADIUS } from '@/lib/design-export/tokens';

export default function OnboardingResidentePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((d) => { if (d.user?.onboardingCompletedAt) return router.replace('/residente'); setName(d.user?.name || ''); setPhone(d.user?.phone || ''); setLocation(d.user?.bloque && d.user?.apto ? 'Bloque ' + d.user.bloque + ' · Apto ' + d.user.apto : 'Ubicación pendiente de asignación'); }).catch(() => setError('No se pudieron cargar tus datos')); }, [router]);
  async function finish() { const res = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) }); const body = await res.json().catch(() => null); if (!res.ok) return setError(body?.error || 'No se pudo finalizar'); router.replace('/residente'); router.refresh(); }
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Manrope, sans-serif' }}><div style={{ width: '100%', maxWidth: 430 }}><div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>{[0,1,2].map((i) => <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? COLORS.navy : COLORS.neutralSoft }} />)}</div>
    {step === 0 && <Center><LogoMark size={34} /><h1>Bienvenido, {name.split(' ')[0] || 'Residente'}</h1><p>Desde aquí puedes crear y seguir tus solicitudes sin llamadas ni trámites adicionales.</p><Primary onClick={() => setStep(1)}>Comenzar</Primary></Center>}
    {step === 1 && <div><small style={{ color: COLORS.textMuted, fontWeight: 700 }}>PASO 1 DE 2</small><h1>Confirma tus datos</h1><Label>Nombre completo</Label><Input value={name} onChange={setName} /><Label>Teléfono</Label><Input value={phone} onChange={setPhone} /><Label>Ubicación</Label><input value={location} disabled style={{ ...inputStyle, background: COLORS.bgCard, color: COLORS.textMuted }} /><p style={{ fontSize: 12, color: COLORS.textMuted }}>La administración controla bloque y apartamento.</p><Primary onClick={() => name.trim() && setStep(2)}>Continuar</Primary></div>}
    {step === 2 && <Center><small style={{ color: COLORS.textMuted, fontWeight: 700 }}>PASO 2 DE 2</small><h1>Crea y sigue tus solicitudes</h1><p>Describe lo ocurrido, adjunta evidencias y consulta cada actualización desde tu Centro de Estado.</p>{error && <p style={{ color: COLORS.warning }}>{error}</p>}<Primary onClick={finish}>Ir al Centro de Estado</Primary></Center>}
  </div></div>;
}
function Center({ children }: { children: React.ReactNode }) { return <div className="apl-up" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>; }
function Label({ children }: { children: React.ReactNode }) { return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, margin: '14px 0 7px' }}>{children}</label>; }
function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) { return <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />; }
function Primary({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button onClick={onClick} style={{ width: '100%', border: 0, background: COLORS.navy, color: '#FFF', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', marginTop: 12 }}>{children}</button>; }
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 11, fontSize: 13.5 };
