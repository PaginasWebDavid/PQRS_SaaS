'use client';

import { ChangeEvent, useState } from 'react';

type Role = 'admin' | 'consejo' | 'residente';
type PendingInvite = { email: string; role: string; roleKey: Role };

const Logo = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: 'block' }} aria-hidden="true">
    <path d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z" fill="#122545" />
    <path d="M40 62l17 17 31-34" fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const roleLabel: Record<Role, string> = { admin: 'Admin', consejo: 'Consejo', residente: 'Residente' };
const roleColors: Record<Role, { background: string; color: string }> = {
  admin: { background: '#EAEEF6', color: '#122545' },
  consejo: { background: '#FBF3DF', color: '#8A5A00' },
  residente: { background: '#ECF6EF', color: '#1A6B3A' },
};

export default function PqrsAdminOnboardingPage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('Parque Residencial Calle 100');
  const [city, setCity] = useState('Bogotá');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('admin');
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  const next = () => setStep((value) => Math.min(3, value + 1));
  const addInvite = () => {
    if (!inviteEmail.trim()) return;
    setPendingInvites((items) => [...items, { email: inviteEmail.trim(), role: roleLabel[inviteRole], roleKey: inviteRole }]);
    setInviteEmail('');
  };

  return (
    <>
      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #ffffff; }
        ::selection { background: #eaeef6; color: #122545; }
        a { color: #122545; text-decoration: none; }
        @keyframes apl-up { from { opacity:0; transform: translateY(18px); } to { opacity:1; transform: translateY(0); } }
        input:focus { outline: none; border-color: #122545 !important; box-shadow: 0 0 0 3.5px rgba(18,37,69,.12); }
      `}</style>
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
            {[0, 1, 2, 3].map((index) => <div key={index} style={{ width: index === step ? 20 : 7, height: 7, borderRadius: 999, background: index === step ? '#122545' : '#E8E8ED', transition: 'width 250ms' }} />)}
          </div>

          <div key={step} style={{ animation: 'apl-up 400ms cubic-bezier(.2,.7,.2,1) both' }}>
            {step === 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ margin: '0 auto 20px', width: 'fit-content' }}><Logo /></div>
                <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Bienvenida, Ana</h1>
                <p style={{ fontSize: 14, color: '#6E6E73', fontWeight: 500, lineHeight: 1.6, margin: '0 0 30px' }}>En 3 pasos cortos dejamos tu conjunto listo para operar en PQRS Services.</p>
                <button type="button" onClick={next} style={primaryButton}>Comenzar</button>
              </div>
            )}

            {step === 1 && (
              <div>
                <Eyebrow>PASO 1 DE 3</Eyebrow>
                <h1 style={stepTitle}>Confirma los datos de tu conjunto</h1>
                <p style={stepCopy}>Puedes editarlos después desde Configuración.</p>
                <Field label="Nombre del conjunto"><input value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} style={inputStyle} /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 26 }}>
                  <Field label="Ciudad"><input value={city} onChange={(e: ChangeEvent<HTMLInputElement>) => setCity(e.target.value)} style={inputStyle} /></Field>
                  <Field label="Unidades"><input value="312" readOnly style={{ ...inputStyle, background: '#F5F5F7', color: '#8E8E93' }} /></Field>
                </div>
                <button type="button" onClick={next} style={primaryButton}>Continuar</button>
              </div>
            )}

            {step === 2 && (
              <div>
                <Eyebrow>PASO 2 DE 3</Eyebrow>
                <h1 style={stepTitle}>Invita a tu equipo</h1>
                <p style={{ ...stepCopy, marginBottom: 20 }}>Puedes agregar más personas después desde Invitaciones. Esto es opcional.</p>
                <Field label="Correo"><input value={inviteEmail} onChange={(e: ChangeEvent<HTMLInputElement>) => setInviteEmail(e.target.value)} placeholder="nombre@correo.com" style={inputStyle} /></Field>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                  {(Object.keys(roleLabel) as Role[]).map((role) => <button key={role} type="button" onClick={() => setInviteRole(role)} style={{ border: 0, fontSize: 12, fontWeight: inviteRole === role ? 700 : 600, color: inviteRole === role ? '#FFFFFF' : '#1D1D1F', background: inviteRole === role ? '#122545' : '#F5F5F7', padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: "'Manrope',sans-serif" }}>{roleLabel[role]}</button>)}
                </div>
                <button type="button" onClick={addInvite} style={{ width: '100%', textAlign: 'center', border: '1.5px solid #E8E8ED', color: '#1D1D1F', background: '#FFFFFF', fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: 999, cursor: 'pointer', marginBottom: 18, fontFamily: "'Manrope',sans-serif" }}>+ Agregar a la lista</button>
                {pendingInvites.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>{pendingInvites.map((invite, index) => <div key={`${invite.email}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F5F5F7', borderRadius: 10, padding: '10px 14px' }}><span style={{ fontSize: 12.5, fontWeight: 600 }}>{invite.email}</span><span style={{ ...roleColors[invite.roleKey], fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, whiteSpace: 'nowrap' }}>{invite.role}</span></div>)}</div>}
                <button type="button" onClick={next} style={{ ...primaryButton, marginBottom: 10 }}>Continuar</button>
                <button type="button" onClick={next} style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#8E8E93', cursor: 'pointer', fontFamily: "'Manrope',sans-serif" }}>Omitir por ahora</button>
              </div>
            )}

            {step === 3 && (
              <div style={{ textAlign: 'center' }}>
                <Eyebrow>PASO 3 DE 3</Eyebrow>
                <h1 style={{ ...stepTitle, marginBottom: 20 }}>Así se gestiona una PQRS</h1>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 24 }}>{[1,2,3,4,5].map((n) => <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: 70 }}><div style={{ width: 26, height: 26, borderRadius: 999, background: '#EAEEF6', color: '#122545', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, margin: '0 auto' }}>{n}</div></div>)}</div>
                <p style={{ fontSize: 13, color: '#4A4A48', fontWeight: 600, margin: '0 0 4px' }}>Radicada → Recibida → En revisión → En proceso → Terminada</p>
                <p style={{ fontSize: 13, color: '#6E6E73', fontWeight: 500, margin: '0 0 30px', lineHeight: 1.6 }}>Cada PQRS avanza por estas fases. Tú decides cuándo pasar a la siguiente y puedes dejar notas internas del equipo.</p>
                <a href="/dashboard/admin" style={{ ...primaryButton, display: 'block' }}>Ir a mi dashboard</a>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11.5, color: '#8E8E93', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>{children}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>{label}</label>{children}</div>; }
const primaryButton: React.CSSProperties = { width: '100%', border: 0, background: '#122545', color: '#FFFFFF', textAlign: 'center', fontSize: 14.5, fontWeight: 700, padding: '13px 0', borderRadius: 999, cursor: 'pointer', fontFamily: "'Manrope',sans-serif" };
const stepTitle: React.CSSProperties = { fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' };
const stepCopy: React.CSSProperties = { fontSize: 13.5, color: '#6E6E73', fontWeight: 500, margin: '0 0 24px' };
const inputStyle: React.CSSProperties = { width: '100%', height: 44, padding: '0 14px', border: '1.5px solid #E8E8ED', borderRadius: 11, fontSize: 13.5, fontFamily: "'Manrope',sans-serif", marginBottom: 14 };
