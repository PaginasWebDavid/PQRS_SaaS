'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoMark } from '@/components/design-export/Logo';
import { COLORS, RADIUS, chipStyle } from '@/lib/design-export/tokens';

type Role = 'ADMIN' | 'ASISTENTE' | 'CONSEJO' | 'RESIDENTE';
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
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((d) => { if (d.user?.onboardingCompletedAt) return router.replace('/admin/dashboard'); setName(d.user?.name || ''); setTenantName(d.tenant?.name || ''); setCity(d.tenant?.city || ''); setUnits(d.tenant?.units || 0); }).catch(() => setError('No se pudieron cargar tus datos')); }, [router]);
  async function finish() {
    setSaving(true); setError('');
    const res = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, tenantName, city, inviteEmail: inviteEmail || null, inviteRole }) });
    const body = await res.json().catch(() => null); setSaving(false);
    if (!res.ok) return setError(body?.error || 'No se pudo finalizar');
    router.replace('/admin/dashboard'); router.refresh();
  }
  return <OnboardingFrame step={step}>
    {step === 0 && <Center><LogoMark size={34} /><h1>Bienvenido, {name.split(' ')[0] || 'Admin'}</h1><p>En tres pasos dejamos tu conjunto listo para gestionar solicitudes reales.</p><Primary onClick={() => setStep(1)}>Comenzar</Primary></Center>}
    {step === 1 && <div><Eyebrow>PASO 1 DE 3</Eyebrow><h1>Confirma los datos de tu conjunto</h1><p>El nombre y la ciudad se guardarán en el conjunto.</p><Label>Nombre del conjunto</Label><Input value={tenantName} onChange={setTenantName} /><Label>Ciudad</Label><Input value={city} onChange={setCity} /><Label>Unidades</Label><input value={units} disabled style={{ ...inputStyle, background: COLORS.bgCard, color: COLORS.textMuted }} /><Primary onClick={() => tenantName.trim() && setStep(2)}>Continuar</Primary></div>}
    {step === 2 && <div><Eyebrow>PASO 2 DE 3</Eyebrow><h1>Invita a tu primer usuario</h1><p>Es opcional. La invitación se enviará al finalizar.</p><Label>Correo</Label><Input value={inviteEmail} onChange={setInviteEmail} type="email" /><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>{(['ADMIN','ASISTENTE','CONSEJO','RESIDENTE'] as Role[]).map((r) => <button key={r} onClick={() => setInviteRole(r)} style={{ border: 0, ...chipStyle(inviteRole === r) }}>{r === 'ASISTENTE' ? 'Asistente' : r.charAt(0) + r.slice(1).toLowerCase()}</button>)}</div><Primary onClick={() => setStep(3)}>Continuar</Primary><button onClick={() => { setInviteEmail(''); setStep(3); }} style={skipStyle}>Omitir por ahora</button></div>}
    {step === 3 && <Center><Eyebrow>PASO 3 DE 3</Eyebrow><h1>Todo listo para operar</h1><p>Podrás crear PQRS, invitar usuarios y seguir cada cambio desde el dashboard.</p>{error && <ErrorText>{error}</ErrorText>}<Primary onClick={finish} disabled={saving}>{saving ? 'Guardando…' : 'Ir al dashboard'}</Primary></Center>}
  </OnboardingFrame>;
}
function OnboardingFrame({ step, children }: { step: number; children: React.ReactNode }) { return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Manrope, sans-serif' }}><div style={{ width: '100%', maxWidth: 460 }}><div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>{[0,1,2,3].map((i) => <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? COLORS.navy : COLORS.neutralSoft }} />)}</div><div className="apl-up">{children}</div></div></div>; }
function Center({ children }: { children: React.ReactNode }) { return <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>; }
function Eyebrow({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontWeight: 700 }}>{children}</div>; }
function Label({ children }: { children: React.ReactNode }) { return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, margin: '14px 0 7px' }}>{children}</label>; }
function Input({ value, onChange, type = 'text' }: { value: string; onChange: (v: string) => void; type?: string }) { return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />; }
function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) { return <button disabled={disabled} onClick={onClick} style={{ width: '100%', border: 0, background: COLORS.navy, color: '#FFF', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: RADIUS.pill, cursor: 'pointer', marginTop: 12 }}>{children}</button>; }
function ErrorText({ children }: { children: React.ReactNode }) { return <p style={{ color: COLORS.warning, fontWeight: 600 }}>{children}</p>; }
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid ' + COLORS.inputBorder, borderRadius: 11, fontSize: 13.5 };
const skipStyle: React.CSSProperties = { width: '100%', border: 0, background: 'none', color: COLORS.textMuted, fontWeight: 700, marginTop: 10, cursor: 'pointer' };
