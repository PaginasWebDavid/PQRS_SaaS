'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { BrandLockup } from '@/components/shell/Logo';
import { COLORS, FONTS, RADIUS } from '@/lib/design/tokens';

const errorMessages: Record<string, string> = {
  Configuration: 'Hay un problema con la configuracion del servidor.',
  AccessDenied: 'No tienes permiso para acceder.',
  Verification: 'El enlace de verificacion expiro o ya fue utilizado.',
  Default: 'Ocurrio un error al intentar iniciar sesion.',
};

function PageShell({ children }: { children: React.ReactNode }) {
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
            textAlign: 'center',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const message = errorMessages[error || 'Default'] || errorMessages.Default;

  return (
    <PageShell>
      <p
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontFamily: FONTS.mono,
          letterSpacing: '0.12em',
          color: COLORS.textMuted,
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        Autenticacion
      </p>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', margin: '10px 0 8px' }}>
        Error de autenticacion
      </h1>
      <p style={{ fontSize: 14.5, color: COLORS.textSecondary, fontWeight: 500, margin: 0 }}>{message}</p>

      <Link
        href="/auth/login"
        style={{
          marginTop: 24,
          height: 50,
          background: COLORS.navy,
          color: COLORS.white,
          borderRadius: RADIUS.pill,
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
        }}
      >
        Intentar de nuevo
      </Link>
    </PageShell>
  );
}

export default function ErrorPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>Cargando...</h1>
        </PageShell>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
