'use client';

import type { ChangeEvent, CSSProperties, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';

type Highlight = {
  icon: string;
  title: string;
  desc: string;
};

const highlights: Highlight[] = [
  {
    icon: 'ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“',
    title: 'Trazabilidad total',
    desc: 'Cada solicitud con historial completo, fase por fase.',
  },
  {
    icon: 'ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¤',
    title: 'Reportes ejecutivos',
    desc: 'MÃƒÆ’Ã‚Â©tricas listas para tu consejo de administraciÃƒÆ’Ã‚Â³n.',
  },
  {
    icon: 'ÃƒÂ¢Ã¢â‚¬â€Ã‚Â·',
    title: 'Respuesta a tiempo',
    desc: 'Tiempos de cierre visibles para todo el equipo.',
  },
];

const fieldStyle: CSSProperties = {
  width: '100%',
  height: 48,
  padding: '0 15px',
  border: '1.5px solid #E8E8ED',
  borderRadius: 12,
  fontSize: 14.5,
  fontFamily: "'Manrope', sans-serif",
  fontWeight: 500,
  color: '#1D1D1F',
  background: '#FFFFFF',
  transition: 'border-color 150ms, box-shadow 150ms',
};

function Logo({ inverse = false, size = 26 }: { inverse?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: 'block' }} aria-hidden="true">
      <path
        d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z"
        fill={inverse ? '#FFFFFF' : '#122545'}
      />
      <path
        d="M40 62l17 17 31-34"
        fill="none"
        stroke={inverse ? '#122545' : '#FFFFFF'}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PqrsLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const invitedEmail = new URLSearchParams(window.location.search).get('email');
    if (invitedEmail) setEmail(invitedEmail);
    const checkBreakpoint = () => setIsMobile(window.innerWidth < 900);
    checkBreakpoint();
    window.addEventListener('resize', checkBreakpoint);
    return () => window.removeEventListener('resize', checkBreakpoint);
  }, []);

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
    setError(false);
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
    setError(false);
  };

  const routeByRole = (role?: string) => {
    if (role === 'SUPER_ADMIN') return '/super-admin';
    if (role === 'ADMIN') return '/admin/dashboard';
    if (role === 'ASISTENTE') return '/pqrs';
    if (role === 'CONSEJO') return '/consejo';
    if (role === 'RESIDENTE') return '/residente';
    return '/auth/login';
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      setError(true);
      return;
    }

    setSubmitting(true);
    setError(false);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setSubmitting(false);
      setError(true);
      return;
    }

    const me = await fetch('/api/me', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null);
    const role = me?.user?.role;
    if (!me?.user?.onboardingCompletedAt && role === 'ADMIN') window.location.href = '/onboarding/admin';
    else if (!me?.user?.onboardingCompletedAt && role === 'RESIDENTE') window.location.href = '/onboarding/residente';
    else window.location.href = routeByRole(role);
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
          background: #ffffff;
        }

        ::selection {
          background: #eaeef6;
          color: #122545;
        }

        a {
          color: #122545;
          text-decoration: none;
        }

        a:hover {
          color: #0b1a33;
        }

        input::placeholder {
          color: #8e8e93;
        }

        input:focus {
          outline: none;
          border-color: #122545 !important;
          box-shadow: 0 0 0 3.5px rgba(18, 37, 69, 0.12);
        }

        @keyframes apl-up {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes apl-float {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(16px, -20px) scale(1.05);
          }
        }

        .login-link-muted {
          transition: color 150ms;
        }

        .login-link-muted:hover {
          color: #1d1d1f !important;
        }

        .login-submit:hover:not(:disabled) {
          background: #0b1a33 !important;
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(18, 37, 69, 0.25);
        }

        .login-demo-link:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
        }
      `}</style>

      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1.05fr',
          background: '#FFFFFF',
          fontFamily: "'Manrope', sans-serif",
          color: '#1D1D1F',
        }}
      >
        <section
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? '36px 24px' : 48,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 380,
              animation: 'apl-up 600ms cubic-bezier(.2,.7,.2,1) both',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 44 }}>
              <Logo />
              <span style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: '-0.01em' }}>
                PQRS <span style={{ fontWeight: 500, color: '#6E6E73' }}>Services</span>
              </span>
            </div>

            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 8px' }}>
              Hola de nuevo.
            </h1>
            <p style={{ fontSize: 14.5, color: '#6E6E73', fontWeight: 500, margin: '0 0 32px' }}>
              Inicia sesiÃƒÆ’Ã‚Â³n para gestionar tu conjunto.
            </p>

            {error && (
              <div
                role="alert"
                style={{
                  background: '#FBF3DF',
                  color: '#8A5A00',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '12px 16px',
                  borderRadius: 12,
                  marginBottom: 20,
                }}
              >
                Correo o contraseÃƒÆ’Ã‚Â±a incorrectos.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="email" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
                  Correo electrÃƒÆ’Ã‚Â³nico
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="admin@tuconjunto.com"
                  autoComplete="email"
                  style={fieldStyle}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label htmlFor="password" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>
                  ContraseÃƒÆ’Ã‚Â±a
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢"
                  autoComplete="current-password"
                  style={{ ...fieldStyle, fontWeight: 400 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 26 }}>
                <a
                  href="/auth/olvidar-contrasena"
                  className="login-link-muted"
                  style={{ fontSize: 13, color: '#6E6E73', fontWeight: 600 }}
                >
                  Ãƒâ€šÃ‚Â¿Olvidaste tu contraseÃƒÆ’Ã‚Â±a?
                </a>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="login-submit"
                style={{
                  width: '100%',
                  height: 50,
                  background: '#122545',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 999,
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "'Manrope', sans-serif",
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.9 : 1,
                  transition: 'background 200ms, transform 200ms, box-shadow 200ms',
                }}
              >
                {submitting ? 'Iniciando sesiÃƒÆ’Ã‚Â³nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦' : 'Iniciar sesiÃƒÆ’Ã‚Â³n'}
              </button>
            </form>

            <p
              style={{
                fontSize: 13,
                color: '#8E8E93',
                fontWeight: 500,
                marginTop: 28,
                textAlign: 'center',
                lineHeight: 1.6,
              }}
            >
              Ãƒâ€šÃ‚Â¿Eres residente y necesitas crear una cuenta?
              <br />
              <a href="/auth/registro" style={{ fontWeight: 700 }}>
                RegÃƒÆ’Ã‚Â­strate como residente
              </a>
            </p>

            <p style={{ fontSize: 12, color: '#C7C7CC', fontWeight: 500, marginTop: 28, textAlign: 'center' }}>
              <a href="/" style={{ color: '#8E8E93', fontWeight: 600 }}>
                ÃƒÂ¢Ã¢â‚¬Â Ã‚Â Volver al sitio
              </a>
            </p>
          </div>
        </section>

        {!isMobile && (
          <aside
            style={{
              background: '#122545',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 60,
              borderRadius: 28,
              margin: '14px 14px 14px 0',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -100,
                right: -60,
                width: 360,
                height: 360,
                borderRadius: 999,
                background: 'radial-gradient(circle,rgba(255,255,255,0.09) 0%,rgba(255,255,255,0) 70%)',
                animation: 'apl-float 12s ease-in-out infinite',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: -80,
                left: -40,
                width: 280,
                height: 280,
                borderRadius: 999,
                background: 'radial-gradient(circle,rgba(95,211,148,0.14) 0%,rgba(95,211,148,0) 70%)',
                animation: 'apl-float 15s ease-in-out infinite reverse',
              }}
            />

            <div
              style={{
                position: 'relative',
                zIndex: 1,
                maxWidth: 400,
                animation: 'apl-up 700ms 120ms cubic-bezier(.2,.7,.2,1) both',
              }}
            >
              <div style={{ marginBottom: 26 }}>
                <Logo inverse size={40} />
              </div>

              <h2
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: '#FFFFFF',
                  lineHeight: 1.2,
                  margin: '0 0 14px',
                }}
              >
                Cada solicitud, bajo control.
              </h2>

              <p style={{ fontSize: 15, color: '#B7C1D6', fontWeight: 500, lineHeight: 1.6, margin: '0 0 40px' }}>
                Radica, atiende y cierra PQRS con trazabilidad completa. Tu conjunto siempre sabe en quÃƒÆ’Ã‚Â© va cada cosa.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {highlights.map((highlight) => (
                  <div
                    key={highlight.title}
                    style={{
                      display: 'flex',
                      gap: 13,
                      alignItems: 'center',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 14,
                      padding: '15px 17px',
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.12)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {highlight.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#FFFFFF' }}>{highlight.title}</div>
                      <div style={{ fontSize: 12.5, color: '#9FB1CE', fontWeight: 500, marginTop: 2 }}>{highlight.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </main>
    </>
  );
}

