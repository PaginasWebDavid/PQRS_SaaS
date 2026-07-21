'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useIsMobile } from '@/components/shell/Sheet';
import { LEGAL_PATHS, getLegalConfig } from '@/lib/legal';

export function LegalLayout({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const legal = getLegalConfig();
  const isMobile = useIsMobile();

  return (
    <main style={{ minHeight: '100vh', background: '#FFFFFF', color: '#1D1D1F', fontFamily: "'Manrope', sans-serif" }}>
      <header style={{ borderBottom: '1px solid #E8E8ED', background: '#FFFFFF' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
          <Link href="/" style={{ color: '#122545', textDecoration: 'none', fontWeight: 800, fontSize: 16 }}>
            PQRS <span style={{ color: '#6E6E73', fontWeight: 500 }}>Services</span>
          </Link>
          <Link href="/auth/login" style={{ color: '#122545', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Iniciar sesion</Link>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>
        {!legal.isComplete && (
          <div role="note" style={{ background: '#FBF3DF', color: '#8A5A00', border: '1px solid #E8D9AC', borderRadius: 12, padding: '12px 14px', fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, marginBottom: 28 }}>
            Este documento es una base de trabajo. Antes de publicar, completa la identidad legal, el NIT, la direccion y la fecha de vigencia en las variables de entorno, y valida el texto con un profesional en Colombia.
          </div>
        )}

        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 12, color: '#6E6E73', fontWeight: 700, marginBottom: 12 }}>PQRS SERVICES / INFORMACION LEGAL</div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.1, letterSpacing: '-0.025em', fontWeight: 800, margin: '0 0 14px' }}>{title}</h1>
          <p style={{ fontSize: 15, color: '#6E6E73', fontWeight: 500, lineHeight: 1.65, margin: '0 0 34px' }}>{intro}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 210px', gap: isMobile ? 24 : 42, alignItems: 'start' }}>
          <article style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.7, color: '#424245' }}>{children}</article>
          <nav aria-label="Documentos legales" style={isMobile
            ? { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 14, borderTop: '1px solid #E8E8ED', paddingTop: 16 }
            : { position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '1px solid #E8E8ED', paddingLeft: 18 }}>
            <Link href={LEGAL_PATHS.index} style={navStyle}>Indice legal</Link>
            <Link href={LEGAL_PATHS.terms} style={navStyle}>Terminos</Link>
            <Link href={LEGAL_PATHS.privacy} style={navStyle}>Privacidad</Link>
            <Link href={LEGAL_PATHS.cookies} style={navStyle}>Cookies</Link>
            <Link href={LEGAL_PATHS.payments} style={navStyle}>Pagos y cancelacion</Link>
          </nav>
        </div>
      </div>

      <footer style={{ borderTop: '1px solid #E8E8ED', background: '#FAFAFA' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px', display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', fontSize: 12, color: '#6E6E73' }}>
          <span>{legal.brandName} · {legal.city}</span>
          <a href={`mailto:${legal.supportEmail}`} style={{ color: '#122545', fontWeight: 700 }}>{legal.supportEmail}</a>
        </div>
      </footer>
    </main>
  );
}

const navStyle = { color: '#122545', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' } as const;

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ marginBottom: 30 }}><h2 style={{ color: '#1D1D1F', fontSize: 18, lineHeight: 1.25, fontWeight: 800, margin: '0 0 10px' }}>{title}</h2>{children}</section>;
}

export function LegalList({ items }: { items: string[] }) {
  return <ul style={{ margin: '8px 0 0', paddingLeft: 22 }}>{items.map((item) => <li key={item} style={{ marginBottom: 6 }}>{item}</li>)}</ul>;
}
