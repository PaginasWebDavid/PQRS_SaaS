'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { BrandLockup } from '@/components/shell/Logo';
import { COLORS, FONTS, RADIUS } from '@/lib/design/tokens';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 48,
  padding: '0 15px',
  border: `1.5px solid ${COLORS.inputBorder}`,
  borderRadius: RADIUS.input,
  fontSize: 14.5,
  fontFamily: 'inherit',
  fontWeight: 500,
  color: COLORS.textPrimary,
  background: COLORS.white,
};

export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', name: '', bloque: '', apto: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.bloque) return setError('Selecciona tu bloque.');
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        name: form.name,
        bloque: parseInt(form.bloque),
        apto: parseInt(form.apto),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'No se pudo crear la cuenta.');
      setLoading(false);
      return;
    }
    const result = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError('Cuenta creada. Intenta iniciar sesion manualmente.');
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: COLORS.white,
        fontFamily: FONTS.sans,
        color: COLORS.textPrimary,
        padding: '48px 20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <Link href="/" style={{ display: 'inline-flex', marginBottom: 40 }}>
          <BrandLockup size={26} />
        </Link>

        <div
          style={{
            background: COLORS.white,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.card,
            padding: 32,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, fontFamily: FONTS.mono, letterSpacing: '0.12em', color: COLORS.textMuted, textTransform: 'uppercase', margin: 0 }}>
            Registro residente
          </p>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', margin: '10px 0 8px' }}>Crear cuenta</h1>
          <p style={{ fontSize: 14.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>
            Completa tus datos para radicar y consultar solicitudes.
          </p>

          {error ? (
            <div
              role="alert"
              style={{
                marginTop: 20,
                background: COLORS.dangerSoft,
                color: COLORS.danger,
                fontSize: 13,
                fontWeight: 700,
                padding: '12px 16px',
                borderRadius: 12,
              }}
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              style={inputStyle}
              placeholder="Nombre completo"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
            <input
              style={inputStyle}
              type="email"
              placeholder="Correo electronico"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              required
            />
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inputStyle, paddingRight: 48 }}
                type={showPassword ? 'text' : 'password'}
                placeholder="Contrasena"
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Mostrar contrasena"
                style={{
                  position: 'absolute',
                  right: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: COLORS.textMuted,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  display: 'flex',
                  cursor: 'pointer',
                }}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <select
                style={inputStyle}
                value={form.bloque}
                onChange={(e) => handleChange('bloque', e.target.value)}
                required
              >
                <option value="">Bloque</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    Bloque {n}
                  </option>
                ))}
              </select>
              <input
                style={inputStyle}
                type="number"
                min={1}
                placeholder="Apartamento"
                value={form.apto}
                onChange={(e) => handleChange('apto', e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: 50,
                background: COLORS.navy,
                color: COLORS.white,
                border: 'none',
                borderRadius: RADIUS.pill,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.9 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Crear cuenta'}
            </button>
          </form>

          <p style={{ marginTop: 24, textAlign: 'center', fontSize: 13, fontWeight: 500, color: COLORS.textSecondary }}>
            Ya tienes cuenta?{' '}
            <Link href="/auth/login" style={{ fontWeight: 700, color: COLORS.textPrimary }}>
              Inicia sesion
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
