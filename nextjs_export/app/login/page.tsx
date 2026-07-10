'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogoMark, BrandLockup } from '@/components/Logo';
import { COLORS, RADIUS } from '@/lib/tokens';
import { useIsMobile } from '@/components/Sheet';

const HIGHLIGHTS = [
  { icon: '✓', title: 'Trazabilidad total', desc: 'Cada solicitud con historial completo, fase por fase.' },
  { icon: '▤', title: 'Reportes ejecutivos', desc: 'Métricas listas para tu consejo de administración.' },
  { icon: '◷', title: 'Respuesta a tiempo', desc: 'Tiempos de cierre visibles para todo el equipo.' },
];

export default function LoginPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError(true); return; }
    setSubmitting(true);
    // TODO: reemplazar por llamada real a tu API de autenticación
    setTimeout(() => router.push('/admin/dashboard'), 500);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.05fr', background: '#FFFFFF', fontFamily: "'Manrope', sans-serif", color: '#1D1D1F' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '36px 24px' : 48 }}>
        <div style={{ width: '100%', maxWidth: 380 }} className="apl-up">
          <div style={{ marginBottom: 44 }}><BrandLockup size={26} /></div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 8px' }}>Hola de nuevo.</h1>
          <p style={{ fontSize: 14.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 32px' }}>Inicia sesión para gestionar tu conjunto.</p>

          {error && <div style={{ background: COLORS.warningSoft, color: COLORS.warning, fontSize: 13, fontWeight: 600, padding: '12px 16px', borderRadius: 12, marginBottom: 20 }}>Correo o contraseña incorrectos.</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(false); }} placeholder="admin@tuconjunto.com" style={{ width: '100%', height: 48, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14.5, fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Contraseña</label>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(false); }} placeholder="••••••••" style={{ width: '100%', height: 48, padding: '0 15px', border: `1.5px solid ${COLORS.inputBorder}`, borderRadius: 12, fontSize: 14.5, fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 26 }}>
              <Link href="/recuperar-contrasena" style={{ fontSize: 13, color: COLORS.textSecondary, fontWeight: 600 }}>¿Olvidaste tu contraseña?</Link>
            </div>
            <button type="submit" style={{ width: '100%', height: 50, background: COLORS.navy, color: '#FFFFFF', border: 'none', borderRadius: RADIUS.pill, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>
          </form>

          <p style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500, marginTop: 28, textAlign: 'center', lineHeight: 1.6 }}>
            ¿Eres residente y necesitas crear una cuenta?<br />
            <Link href="/invitacion" style={{ fontWeight: 700 }}>Regístrate como residente</Link>
          </p>

          <p style={{ fontSize: 12, color: '#C7C7CC', fontWeight: 500, marginTop: 28, textAlign: 'center' }}>
            <Link href="/" style={{ color: COLORS.textMuted, fontWeight: 600 }}>← Volver al sitio</Link>
          </p>
        </div>
      </div>

      {!isMobile && (
        <div style={{ background: COLORS.navy, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, borderRadius: 28, margin: '14px 14px 14px 0' }}>
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 400 }} className="apl-up">
            <LogoMark size={40} color="#FFFFFF" check={COLORS.navy} />
            <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.025em', color: '#FFFFFF', lineHeight: 1.2, margin: '26px 0 14px' }}>Cada solicitud, bajo control.</h2>
            <p style={{ fontSize: 15, color: COLORS.navyMuted, fontWeight: 500, lineHeight: 1.6, margin: '0 0 40px' }}>
              Radica, atiende y cierra PQRS con trazabilidad completa. Tu conjunto siempre sabe en qué va cada cosa.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {HIGHLIGHTS.map((h) => (
                <div key={h.title} style={{ display: 'flex', gap: 13, alignItems: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '15px 17px' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{h.icon}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#FFFFFF' }}>{h.title}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.navyText, fontWeight: 500, marginTop: 2 }}>{h.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
