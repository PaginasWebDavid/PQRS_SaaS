'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BrandLockup } from '@/components/shell/Logo';
import { COLORS, RADIUS } from '@/lib/design/tokens';

export default function CambiarContrasenaPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [focused, setFocused] = useState<'current' | 'new' | 'confirm' | null>(null);

  const canSubmit = Boolean(currentPassword && newPassword && confirmPassword);

  async function handleSubmit() {
    if (!canSubmit || loading) return;
    setError('');

    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al cambiar la contraseña');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  function inputStyle(field: 'current' | 'new' | 'confirm'): React.CSSProperties {
    return {
      width: '100%',
      height: 48,
      padding: '0 15px',
      border: `1.5px solid ${focused === field ? COLORS.navy : COLORS.inputBorder}`,
      borderRadius: RADIUS.input,
      fontSize: 14.5,
      fontFamily: 'inherit',
      marginBottom: 18,
      outline: 'none',
      boxShadow: focused === field ? '0 0 0 3.5px rgba(18,37,69,0.12)' : 'none',
    };
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FFFFFF',
        fontFamily: "'Manrope', sans-serif",
        color: COLORS.textPrimary,
        padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }} className="apl-up">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
          <BrandLockup size={24} />
        </div>

        {!success ? (
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px', textAlign: 'center' }}>
              Cambiar contraseña
            </h1>
            <p
              style={{
                fontSize: 13.5,
                color: COLORS.textSecondary,
                fontWeight: 500,
                margin: '0 0 28px',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              Escribe tu contraseña actual y elige una nueva.
            </p>

            {error ? (
              <p
                style={{
                  background: COLORS.dangerSoft,
                  color: COLORS.danger,
                  fontSize: 12.5,
                  fontWeight: 700,
                  borderRadius: RADIUS.input,
                  padding: '10px 12px',
                  marginBottom: 16,
                }}
              >
                {error}
              </p>
            ) : null}

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Contraseña actual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              onFocus={() => setFocused('current')}
              onBlur={() => setFocused(null)}
              placeholder="••••••••"
              style={inputStyle('current')}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onFocus={() => setFocused('new')}
              onBlur={() => setFocused(null)}
              placeholder="Mínimo 6 caracteres"
              style={inputStyle('new')}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onFocus={() => setFocused('confirm')}
              onBlur={() => setFocused(null)}
              placeholder="Repite la nueva contraseña"
              style={{ ...inputStyle('confirm'), marginBottom: 22 }}
            />

            <button
              type="submit"
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              style={{
                width: '100%',
                textAlign: 'center',
                background: canSubmit && !loading ? COLORS.navy : COLORS.neutralSoft,
                color: canSubmit && !loading ? '#FFFFFF' : COLORS.textMuted,
                fontSize: 14.5,
                fontWeight: 700,
                padding: '13px 0',
                borderRadius: RADIUS.pill,
                border: 'none',
                fontFamily: 'inherit',
                cursor: canSubmit && !loading ? 'pointer' : 'default',
              }}
            >
              {loading ? 'Guardando…' : 'Guardar cambios'}
            </button>

            <p style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500, marginTop: 24, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => router.back()}
                style={{
                  fontWeight: 700,
                  color: COLORS.navy,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  cursor: 'pointer',
                }}
              >
                ← Volver
              </button>
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div
              className="apl-up"
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                background: COLORS.successSoft,
                color: COLORS.success,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                margin: '0 auto 20px',
              }}
            >
              ✓
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Contraseña actualizada</h1>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500, margin: '0 0 26px' }}>
              Tu contraseña se actualizó correctamente.
            </p>
            <button
              type="button"
              onClick={() => router.back()}
              style={{
                display: 'block',
                width: '100%',
                background: COLORS.navy,
                color: '#FFFFFF',
                textAlign: 'center',
                fontSize: 14,
                fontWeight: 700,
                padding: '13px 0',
                borderRadius: RADIUS.pill,
                border: 'none',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Volver
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
