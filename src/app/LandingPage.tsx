"use client";

import React, { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';

type RevealId =
  | 'heroVisual'
  | 'problem'
  | 'problemCards'
  | 'product'
  | 'story1'
  | 'story2'
  | 'story3'
  | 'story4'
  | 'story5'
  | 'steps'
  | 'stepsCards'
  | 'pricing'
  | 'pricingCards'
  | 'faq'
  | 'cta';

const ALL_REVEAL_IDS: RevealId[] = [
  'heroVisual', 'problem', 'problemCards', 'product',
  'story1', 'story2', 'story3', 'story4', 'story5',
  'steps', 'stepsCards', 'pricing', 'pricingCards', 'faq', 'cta',
];

function Logo({ size = 23 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ display: 'block' }} aria-hidden="true">
      <path
        d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z"
        fill="#122545"
      />
      <path
        d="M40 62l17 17 31-34"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useIsMobile(breakpoint = 820) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < breakpoint);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [breakpoint]);

  return isMobile;
}

function useReveal() {
  const [revealed, setRevealed] = useState<Partial<Record<RevealId, boolean>>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);

  const revealAll = useCallback(() => {
    setRevealed(Object.fromEntries(ALL_REVEAL_IDS.map(id => [id, true])));
  }, []);

  useEffect(() => {
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof IntersectionObserver === 'undefined' || reducedMotion) {
      revealAll();
      return;
    }

    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const id = entry.target.getAttribute('data-reveal-id') as RevealId | null;
          if (!id) return;
          setRevealed(current => ({ ...current, [id]: true }));
          observerRef.current?.unobserve(entry.target);
        });
      },
      { threshold: 0.15 },
    );

    // Red de seguridad: si por lo que sea (captura automatizada sin scroll
    // real, un observer que nunca dispara, etc.) el contenido nunca se
    // revela por scroll, se muestra de todas formas en vez de quedar
    // invisible para siempre.
    const safetyTimer = window.setTimeout(revealAll, 2500);

    return () => {
      observerRef.current?.disconnect();
      window.clearTimeout(safetyTimer);
    };
  }, [revealAll]);

  const revealRef = useCallback(
    (id: RevealId) => (element: HTMLDivElement | null) => {
      if (!element) return;
      element.setAttribute('data-reveal-id', id);
      observerRef.current?.observe(element);
    },
    [],
  );

  const revealStyle = useCallback(
    (id: RevealId, delay = 0): CSSProperties => ({
      opacity: revealed[id] ? 1 : 0,
      transform: revealed[id] ? 'translateY(0) scale(1)' : 'translateY(34px) scale(0.985)',
      transition: `opacity 800ms cubic-bezier(.2,.7,.2,1) ${delay}ms, transform 800ms cubic-bezier(.2,.7,.2,1) ${delay}ms`,
    }),
    [revealed],
  );

  return { revealRef, revealStyle };
}

export type PricingTier = {
  label: string;
  range: string;
  price: string;
  popular: boolean;
};

export default function PqrsLandingPage({ pricingTiers: rawTiers }: { pricingTiers: PricingTier[] }) {
  const isMobile = useIsMobile();
  const { revealRef, revealStyle } = useReveal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    if (!isMobile) setMenuOpen(false);
  }, [isMobile]);

  const scenes = [
    {
      icon: '💬',
      title: 'La respuesta está en un chat de hace tres semanas.',
      desc: 'Sin radicado formal, no hay forma de demostrar que se atendió a tiempo.',
    },
    {
      icon: '📊',
      title: 'El informe del trimestre se arma a mano. Otra vez.',
      desc: 'Horas buscando en correos y planillas lo que debería estar en un solo lugar.',
    },
    {
      icon: '📱',
      title: 'La foto del arreglo quedó en el celular de alguien.',
      desc: 'Y esa persona ya no trabaja en el conjunto. La evidencia se fue con ella.',
    },
  ];

  const flowSteps = [
    { num: '1', label: 'Radicada' },
    { num: '2', label: 'Recibida' },
    { num: '3', label: 'En revisión' },
    { num: '4', label: 'En proceso' },
    { num: '✓', label: 'Terminada' },
  ].map((step, index, all) => ({
    ...step,
    bg: index === all.length - 1 ? '#5FD394' : 'rgba(255,255,255,0.12)',
    color: index === all.length - 1 ? '#122545' : '#FFFFFF',
    labelColor: index === all.length - 1 ? '#5FD394' : '#B7C1D6',
    showLine: index < all.length - 1,
  }));

  const chartBars = ['42%', '64%', '36%', '85%', '55%', '72%', '95%'];

  const roles = [
    {
      initial: 'A',
      bg: '#EAEEF6',
      color: '#122545',
      title: 'Administración',
      scope: 'Opera: PQRS, usuarios, reportes, licencia',
    },
    {
      initial: 'C',
      bg: '#FBF3DF',
      color: '#8A5A00',
      title: 'Consejo',
      scope: 'Supervisa: métricas e historial, solo lectura',
    },
    {
      initial: 'R',
      bg: '#ECF6EF',
      color: '#1A6B3A',
      title: 'Residente',
      scope: 'Consulta: radica y sigue sus solicitudes',
    },
  ];

  const howSteps = [
    {
      num: 'Paso 1',
      title: 'Configuramos tu conjunto',
      desc: 'Te acompañamos en el montaje y, si ya tienes información en Excel, te ayudamos a organizarla.',
    },
    {
      num: 'Paso 2',
      title: 'Invitas a los residentes',
      desc: 'Cada residente recibe su acceso por correo. Sin instalar nada: funciona en el navegador.',
    },
    {
      num: 'Paso 3',
      title: 'La primera PQRS entra ese mismo día',
      desc: 'Desde ese momento, todo queda radicado, asignado y medido.',
    },
  ];

  // Los tramos y los montos llegan desde page.tsx, que los lee de las reglas
  // de precio activas en la base. Antes estaban escritos a mano aqui y se
  // desactualizaron: la landing mostraba rangos que ya no existian.
  const pricingTiers = rawTiers.map(tier => ({
    ...tier,
    bg: tier.popular ? '#122545' : '#F5F5F7',
    textColor: tier.popular ? '#FFFFFF' : '#1D1D1F',
    mutedColor: tier.popular ? '#B7C1D6' : '#6E6E73',
    ctaBg: tier.popular ? '#FFFFFF' : '#122545',
    ctaColor: tier.popular ? '#122545' : '#FFFFFF',
  }));

  const faqs = [
    {
      q: '¿Los residentes tienen que instalar una app?',
      a: 'No. Todo funciona en el navegador del celular o del computador. El residente recibe un enlace, crea su cuenta y ya puede radicar.',
    },
    {
      q: '¿Qué pasa con las PQRS que ya tenemos en Excel?',
      a: 'Las cargamos durante el montaje para que no pierdas el historial. Lo que se puede migrar depende de cómo esté organizado tu archivo: lo revisamos contigo antes de empezar y te decimos con claridad qué entra y qué no.',
    },
    {
      q: '¿Puedo exportar los reportes?',
      a: 'Sí, en Excel y PDF, con filtros por fecha, estado y asunto. Listos para la reunión de consejo.',
    },
    {
      q: '¿Quién puede ver la información del conjunto?',
      a: 'Solo los usuarios de tu conjunto, según su rol. La información de cada cliente está aislada y protegida.',
    },
    {
      q: '¿Cómo funciona el cobro?',
      a: 'Una tarifa por conjunto según su número de unidades, sin cobros por usuario. Puedes pagarla mes a mes o de forma anual con 10% de descuento. Sin permanencia mínima: cancelas cuando quieras.',
    },
    {
      q: '¿Y si administro varios conjuntos?',
      a: 'Puedes gestionarlos desde una misma cuenta, cada uno con su información separada. Tenemos tarifas por portafolio.',
    },
  ];

  const sizes = {
    heroPadding: isMobile ? '64px 0 0' : '96px 0 0',
    kickerSize: isMobile ? 14 : 15,
    h1Size: isMobile ? 38 : 'clamp(48px, 5.8vw, 64px)',
    h2Size: isMobile ? 30 : 'clamp(34px, 4vw, 46px)',
    h3Size: isMobile ? 24 : 30,
    h3SizeSm: isMobile ? 21 : 24,
    heroSubSize: isMobile ? 16.5 : 19,
    bodySize: isMobile ? 15.5 : 17,
    ctaSize: isMobile ? 32 : 'clamp(36px, 4.6vw, 52px)',
    visualMargin: isMobile ? 52 : 76,
    visualRadius: isMobile ? 20 : 28,
    visualPad: isMobile ? 14 : 26,
    appBarPad: isMobile ? '12px 16px' : '13px 22px',
    appPad: isMobile ? 16 : 22,
    appCols: isMobile ? '1fr' : '1.1fr 0.9fr',
    appDivider: isMobile ? 'none' : '1px solid #F0F0F2',
    sectionPadding: isMobile ? '72px 22px 44px' : '110px 22px 56px',
    sectionBottom: isMobile ? 72 : 110,
    ctaPadding: isMobile ? '90px 22px' : '140px 22px',
    blockGap: isMobile ? 36 : 48,
    threeCols: isMobile ? '1fr' : 'repeat(3, 1fr)',
    twoCols: isMobile ? '1fr' : '1fr 1fr',
    fourCols: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
    cardRadius: isMobile ? 20 : 24,
    storyPad: isMobile ? '26px 24px' : 40,
    storyGap: isMobile ? 28 : 36,
    stepMinWidth: isMobile ? 84 : 'auto',
    footerGap: isMobile ? 32 : 56,
  } as const;

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { margin: 0; background: #FFFFFF; }
        ::selection { background: #EAEEF6; color: #122545; }
        a { color: #122545; }
        a:hover { color: #0B1A33; }
        @keyframes landing-reveal { from { opacity:0; transform: translateY(28px); } to { opacity:1; transform: translateY(0); } }
        @keyframes landing-feed { from { opacity:0; transform: translateY(-8px); } to { opacity:1; transform: translateY(0); } }
        .nav-link:hover { color:#1D1D1F !important; }
        .primary-pill:hover { background:#0B1A33 !important; transform:scale(1.03); }
        .soft-card:hover { transform:translateY(-4px); box-shadow:0 12px 32px rgba(0,0,0,0.08) !important; }
        .pricing-card:hover { transform:translateY(-4px); box-shadow:0 14px 36px rgba(0,0,0,0.1) !important; }
        .opacity-hover:hover { opacity:0.85; }
        .arrow-link:hover { gap:9px !important; }
        @media (prefers-reduced-motion: reduce) {
          @keyframes landing-reveal { from { opacity: 0; } to { opacity: 1; } }
          @keyframes landing-feed { from { opacity: 0; } to { opacity: 1; } }
          .primary-pill:hover, .soft-card:hover, .pricing-card:hover { transform: none !important; }
        }
      `}</style>

      <div
        style={{
          background: '#FFFFFF',
          color: '#1D1D1F',
          minHeight: '100vh',
          overflowX: 'hidden',
        }}
      >
        <nav
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 80,
            background: 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(20px) saturate(1.8)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              maxWidth: 1024,
              margin: '0 auto',
              padding: '0 22px',
              height: 52,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Logo />
              <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>
                PQRS <span style={{ fontWeight: 500, color: '#6E6E73' }}>Services</span>
              </span>
            </div>

            {!isMobile ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
                  {[
                    ['#producto', 'Producto'],
                    ['#como-funciona', 'Cómo funciona'],
                    ['#precios', 'Precios'],
                    ['#faq', 'Preguntas'],
                    ['/auth/login', 'Iniciar sesión'],
                  ].map(([href, label]) => (
                    <a
                      key={label}
                      href={href}
                      className="nav-link"
                      style={{
                        color: '#424245',
                        textDecoration: 'none',
                        fontSize: 12.5,
                        fontWeight: 500,
                        transition: 'color 200ms',
                      }}
                    >
                      {label}
                    </a>
                  ))}
                </div>
                <a
                  href="#demo"
                  style={{
                    background: '#122545',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '7px 16px',
                    borderRadius: 999,
                    flexShrink: 0,
                    transition: 'background 200ms',
                  }}
                  className="primary-pill"
                >
                  Solicitar demo
                </a>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setMenuOpen(value => !value)}
                aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
                style={{
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 17,
                  cursor: 'pointer',
                  border: 0,
                  background: 'transparent',
                  color: '#1D1D1F',
                }}
              >
                {menuOpen ? '✕' : '☰'}
              </button>
            )}
          </div>

          {menuOpen && isMobile && (
            <div
              style={{
                borderTop: '1px solid rgba(0,0,0,0.06)',
                padding: '12px 22px 22px',
                display: 'flex',
                flexDirection: 'column',
                background: '#FFFFFF',
              }}
            >
              {[
                ['#producto', 'Producto'],
                ['#como-funciona', 'Cómo funciona'],
                ['#precios', 'Precios'],
                ['#faq', 'Preguntas'],
              ].map(([href, label]) => (
                <a
                  key={label}
                  href={href}
                  onClick={closeMenu}
                  style={{
                    color: '#1D1D1F',
                    textDecoration: 'none',
                    fontSize: 15,
                    fontWeight: 600,
                    padding: '13px 2px',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  {label}
                </a>
              ))}
              <a
                href="/auth/login"
                style={{ color: '#1D1D1F', textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '15px 2px 6px' }}
              >
                Iniciar sesión
              </a>
              <a
                href="#demo"
                onClick={closeMenu}
                style={{
                  background: '#122545',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '13px 0',
                  borderRadius: 999,
                  textAlign: 'center',
                  marginTop: 12,
                }}
              >
                Agendar demo
              </a>
            </div>
          )}
        </nav>

        <section style={{ padding: sizes.heroPadding, textAlign: 'center' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                marginBottom: 18,
                animation: 'landing-reveal 800ms cubic-bezier(.2,.7,.2,1) both',
              }}
            >
              <Logo size={26} />
              <span style={{ fontSize: sizes.kickerSize, fontWeight: 700, color: '#122545' }}>PQRS Services</span>
            </div>
            <h1
              style={{
                fontSize: sizes.h1Size,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                margin: '0 0 22px',
                color: '#1D1D1F',
                animation: 'landing-reveal 800ms 80ms cubic-bezier(.2,.7,.2,1) both',
              }}
            >
              La gestión de tu conjunto,
              <br />
              finalmente en orden.
            </h1>
            <p
              style={{
                fontSize: sizes.heroSubSize,
                lineHeight: 1.5,
                fontWeight: 500,
                color: '#6E6E73',
                margin: '0 auto 30px',
                maxWidth: 560,
                animation: 'landing-reveal 800ms 160ms cubic-bezier(.2,.7,.2,1) both',
              }}
            >
              Centraliza las solicitudes que hoy viven repartidas entre WhatsApp, Excel y correo. Cada una queda radicada, asignada y cerrada con evidencia.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 14,
                justifyContent: 'center',
                flexWrap: 'wrap',
                animation: 'landing-reveal 800ms 240ms cubic-bezier(.2,.7,.2,1) both',
              }}
            >
              <a
                href="#demo"
                className="primary-pill"
                style={{
                  background: '#122545',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: 15,
                  fontWeight: 600,
                  padding: '13px 28px',
                  borderRadius: 999,
                  transition: 'background 200ms, transform 200ms',
                }}
              >
                Solicitar una demo
              </a>
              <a
                href="#producto"
                className="arrow-link"
                style={{
                  color: '#122545',
                  textDecoration: 'none',
                  fontSize: 15,
                  fontWeight: 600,
                  padding: '13px 10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'gap 200ms',
                }}
              >
                Conocer el producto <span style={{ fontSize: 13 }}>›</span>
              </a>
            </div>
          </div>

          <div
            ref={revealRef('heroVisual')}
            style={{
              maxWidth: 1024,
              margin: `${sizes.visualMargin}px auto 0`,
              padding: '0 22px',
              ...revealStyle('heroVisual'),
            }}
          >
            <div
              style={{
                background: '#F5F5F7',
                borderRadius: sizes.visualRadius,
                padding: sizes.visualPad,
                textAlign: 'left',
              }}
            >
              <div style={{ borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden', lineHeight: 0 }}>
                <Image
                  src="/marketing/hero-product-preview.png"
                  alt="Panel de administración de PQRS Services mostrando la lista de solicitudes de un conjunto y el detalle de una de ellas"
                  width={1280}
                  height={860}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        <section style={{ background: '#F5F5F7' }}>
          <div
            ref={revealRef('problem')}
            style={{ maxWidth: 800, margin: '0 auto', padding: sizes.sectionPadding, textAlign: 'center', ...revealStyle('problem') }}
          >
            <h2
              style={{
                fontSize: sizes.h2Size,
                fontWeight: 800,
                lineHeight: 1.12,
                letterSpacing: '-0.025em',
                margin: '0 0 18px',
              }}
            >
              Hoy las solicitudes llegan por varios canales distintos.
              <br />
              <span style={{ color: '#6E6E73' }}>Y no quedan en ninguno.</span>
            </h2>
            <p style={{ fontSize: sizes.bodySize, lineHeight: 1.6, fontWeight: 500, color: '#6E6E73', margin: '0 auto', maxWidth: 560 }}>
              Un chat que se pierde, un Excel que nadie actualiza, un correo sin respuesta. Cuando el residente reclama o el consejo pide cuentas, no hay cómo demostrar la gestión.
            </p>
          </div>
          <div
            ref={revealRef('problemCards')}
            style={{ maxWidth: 1024, margin: '0 auto', padding: `0 22px ${sizes.sectionBottom}px`, ...revealStyle('problemCards', 100) }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: sizes.threeCols, gap: 16 }}>
              {scenes.map(scene => (
                <div
                  key={scene.title}
                  className="soft-card"
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 18,
                    padding: '30px 28px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    transition: 'transform 300ms cubic-bezier(.2,.7,.2,1), box-shadow 300ms',
                  }}
                >
                  <div style={{ fontSize: 26, marginBottom: 16 }}>{scene.icon}</div>
                  <p style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{scene.title}</p>
                  <p style={{ fontSize: 13.5, color: '#6E6E73', fontWeight: 500, lineHeight: 1.55, margin: 0 }}>{scene.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="producto">
          <div style={{ maxWidth: 800, margin: '0 auto', padding: sizes.sectionPadding, textAlign: 'center' }}>
            <div ref={revealRef('product')} style={revealStyle('product')}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#122545', marginBottom: 14 }}>El producto</div>
              <h2 style={{ fontSize: sizes.h2Size, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', margin: '0 0 18px' }}>
                Un solo flujo.
                <br />
                De la solicitud al cierre.
              </h2>
              <p style={{ fontSize: sizes.bodySize, lineHeight: 1.6, fontWeight: 500, color: '#6E6E73', margin: '0 auto', maxWidth: 520 }}>
                Cada solicitud entra con número de radicado, pasa por cinco estados definidos y termina con evidencia adjunta.
              </p>
            </div>
          </div>

          <div style={{ maxWidth: 1024, margin: '0 auto', padding: `0 22px ${sizes.sectionBottom}px`, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              ref={revealRef('story1')}
              style={{
                background: '#122545',
                borderRadius: sizes.cardRadius,
                padding: sizes.storyPad,
                color: '#FFFFFF',
                ...revealStyle('story1'),
              }}
            >
              <div style={{ maxWidth: 480, marginBottom: sizes.storyGap }}>
                <h3 style={{ fontSize: sizes.h3Size, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
                  Cinco estados.
                  <br />
                  Ninguna zona gris.
                </h3>
                <p style={{ fontSize: 15, color: '#B7C1D6', fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
                  Radicada, recibida, en revisión, en proceso, terminada. Todos (administración, consejo y residente) ven el mismo estado, al mismo tiempo.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: 6 }}>
                {flowSteps.map(step => (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: sizes.stepMinWidth }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          background: step.bg,
                          color: step.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12.5,
                          fontWeight: 700,
                        }}
                      >
                        {step.num}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: step.labelColor, whiteSpace: 'nowrap' }}>{step.label}</div>
                    </div>
                    {step.showLine && <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.18)', margin: '0 12px 26px', borderRadius: 2 }} />}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: sizes.twoCols, gap: 16 }}>
              <div
                ref={revealRef('story2')}
                style={{ background: '#F5F5F7', borderRadius: sizes.cardRadius, padding: sizes.storyPad, ...revealStyle('story2') }}
              >
                <h3 style={{ fontSize: sizes.h3SizeSm, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>La evidencia vive en el caso.</h3>
                <p style={{ fontSize: 14.5, color: '#6E6E73', fontWeight: 500, lineHeight: 1.6, margin: '0 0 24px' }}>
                  La foto del daño y la del arreglo, juntas. No en el celular de alguien que un día se va.
                </p>
                <div style={{ background: '#FFFFFF', borderRadius: 14, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#6E6E73' }}>PQ-0228 · EVIDENCIAS</span>
                    <span style={{ background: '#ECF6EF', color: '#1A6B3A', fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>Terminada</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[0, 1].map(item => (
                      <div
                        key={item}
                        style={{
                          flex: 1,
                          aspectRatio: '1',
                          borderRadius: 9,
                          background: 'linear-gradient(135deg,#E8E8ED 0%,#D8D8DF 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 17,
                        }}
                      >
                        📷
                      </div>
                    ))}
                    <div
                      style={{
                        flex: 1,
                        aspectRatio: '1',
                        borderRadius: 9,
                        background: '#F5F5F7',
                        border: '1.5px dashed #C7C7CC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        color: '#8E8E93',
                      }}
                    >
                      ＋
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={revealRef('story3')}
                style={{ background: '#F5F5F7', borderRadius: sizes.cardRadius, padding: sizes.storyPad, ...revealStyle('story3', 100) }}
              >
                <h3 style={{ fontSize: sizes.h3SizeSm, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>El informe del consejo, en un clic.</h3>
                <p style={{ fontSize: 14.5, color: '#6E6E73', fontWeight: 500, lineHeight: 1.6, margin: '0 0 24px' }}>
                  Excel o PDF con filtros por fecha y estado. Lo que antes tomaba una tarde, ahora no toma nada.
                </p>
                <div style={{ background: '#FFFFFF', borderRadius: 14, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 64, marginBottom: 12 }}>
                    {chartBars.map((height, index) => (
                      <div key={index} style={{ flex: 1, height, background: '#122545', borderRadius: '4px 4px 0 0', opacity: 0.9 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#6E6E73', fontWeight: 600 }}>PQRS cerradas por semana</span>
                    <span style={{ fontSize: 11, color: '#122545', fontWeight: 700 }}>Exportar ↓</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: sizes.twoCols, gap: 16 }}>
              <div
                ref={revealRef('story4')}
                style={{ background: '#F5F5F7', borderRadius: sizes.cardRadius, padding: sizes.storyPad, ...revealStyle('story4') }}
              >
                <h3 style={{ fontSize: sizes.h3SizeSm, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>El residente se entera solo.</h3>
                <p style={{ fontSize: 14.5, color: '#6E6E73', fontWeight: 500, lineHeight: 1.6, margin: '0 0 24px' }}>
                  Un correo automático en cada cambio de estado. Menos llamadas preguntando “¿en qué va lo mío?”.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['✉️', '#EAEEF6', 'Tu PQRS pasó a “En proceso”', 'PQ-0231 · Fuga de agua en zona común', 1],
                    ['✅', '#ECF6EF', 'Tu PQRS fue cerrada', 'PQ-0224 · Con 2 evidencias adjuntas', 0.65],
                  ].map(([icon, bg, title, subtitle, opacity]) => (
                    <div
                      key={String(title)}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: 12,
                        padding: '13px 16px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        opacity: Number(opacity),
                      }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: String(bg), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                        {icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
                        <div style={{ fontSize: 10.5, color: '#8E8E93', marginTop: 1 }}>{subtitle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                ref={revealRef('story5')}
                style={{ background: '#F5F5F7', borderRadius: sizes.cardRadius, padding: sizes.storyPad, ...revealStyle('story5', 100) }}
              >
                <h3 style={{ fontSize: sizes.h3SizeSm, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Cada quien ve lo suyo.</h3>
                <p style={{ fontSize: 14.5, color: '#6E6E73', fontWeight: 500, lineHeight: 1.6, margin: '0 0 24px' }}>
                  Administración opera, el consejo supervisa, el residente consulta. Permisos claros, sin configurar nada.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {roles.map(role => (
                    <div
                      key={role.title}
                      style={{ background: '#FFFFFF', borderRadius: 12, padding: '13px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 11 }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          background: role.bg,
                          color: role.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {role.initial}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{role.title}</div>
                        <div style={{ fontSize: 10.5, color: '#8E8E93', marginTop: 1 }}>{role.scope}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona" style={{ background: '#F5F5F7' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', padding: sizes.sectionPadding, textAlign: 'center' }}>
            <div ref={revealRef('steps')} style={revealStyle('steps')}>
              <h2 style={{ fontSize: sizes.h2Size, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', margin: '0 0 18px' }}>
                Operando en días,
                <br />
                no en meses.
              </h2>
            </div>
          </div>
          <div
            ref={revealRef('stepsCards')}
            style={{ maxWidth: 1024, margin: '0 auto', padding: `0 22px ${sizes.sectionBottom}px`, ...revealStyle('stepsCards', 100) }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: sizes.threeCols, gap: 16 }}>
              {howSteps.map(step => (
                <div key={step.num} style={{ background: '#FFFFFF', borderRadius: 18, padding: '30px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#122545', marginBottom: 14 }}>{step.num}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 8px' }}>{step.title}</h3>
                  <p style={{ fontSize: 13.5, color: '#6E6E73', fontWeight: 500, lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="precios">
          <div style={{ maxWidth: 800, margin: '0 auto', padding: sizes.sectionPadding, textAlign: 'center' }}>
            <div ref={revealRef('pricing')} style={revealStyle('pricing')}>
              <h2 style={{ fontSize: sizes.h2Size, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', margin: '0 0 18px' }}>
                Un precio por conjunto.
                <br />
                <span style={{ color: '#6E6E73' }}>Sin costos por usuario.</span>
              </h2>
              <p style={{ fontSize: sizes.bodySize, lineHeight: 1.6, fontWeight: 500, color: '#6E6E73', margin: '0 auto', maxWidth: 480 }}>
                La tarifa depende del número de unidades. Todos los residentes y todo el equipo de administración, incluidos.
              </p>
            </div>
          </div>
          <div
            ref={revealRef('pricingCards')}
            style={{ maxWidth: 1024, margin: '0 auto', padding: `0 22px ${sizes.sectionBottom}px`, ...revealStyle('pricingCards', 100) }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: sizes.fourCols, gap: 14 }}>
              {pricingTiers.map(tier => (
                <div
                  key={tier.range}
                  className="pricing-card"
                  style={{
                    background: tier.bg,
                    color: tier.textColor,
                    borderRadius: 18,
                    padding: '28px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    transition: 'transform 300ms cubic-bezier(.2,.7,.2,1), box-shadow 300ms',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: tier.mutedColor, marginBottom: 6 }}>{tier.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{tier.price}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: tier.mutedColor, margin: '4px 0 22px' }}>
                    al mes · {tier.range} unidades
                  </div>
                  <a
                    href="#demo"
                    className="opacity-hover"
                    style={{
                      marginTop: 'auto',
                      textAlign: 'center',
                      textDecoration: 'none',
                      color: tier.ctaColor,
                      background: tier.ctaBg,
                      fontWeight: 600,
                      fontSize: 13,
                      borderRadius: 999,
                      padding: '10px 0',
                      transition: 'opacity 200ms',
                    }}
                  >
                    Cotizar
                  </a>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#6E6E73', fontWeight: 500, margin: '22px 0 0' }}>
              ¿Administras varios conjuntos?{' '}
              <a href="#demo" style={{ color: '#122545', fontWeight: 700, textDecoration: 'none' }}>
                Hablemos de una tarifa por portafolio ›
              </a>
            </p>
          </div>
        </section>

        <section id="faq" style={{ background: '#F5F5F7' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', padding: isMobile ? '72px 22px 72px' : '110px 22px 110px' }}>
            <div ref={revealRef('faq')} style={{ textAlign: 'center', marginBottom: sizes.blockGap, ...revealStyle('faq') }}>
              <h2 style={{ fontSize: sizes.h2Size, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.025em', margin: 0 }}>
                Lo que siempre
                <br />
                nos preguntan.
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {faqs.map((faq, index) => {
                const open = openFaq === index;
                return (
                  <div key={faq.q} style={{ background: '#FFFFFF', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(current => (current === index ? -1 : index))}
                      aria-expanded={open}
                      aria-controls={`faq-panel-${index}`}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 16,
                        padding: '19px 24px',
                        cursor: 'pointer',
                        border: 0,
                        background: 'transparent',
                        color: '#1D1D1F',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{faq.q}</span>
                      <span
                        style={{
                          fontSize: 19,
                          color: '#8E8E93',
                          flexShrink: 0,
                          fontWeight: 400,
                          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                          transition: 'transform 250ms cubic-bezier(.2,.7,.2,1)',
                        }}
                      >
                        ＋
                      </span>
                    </button>
                    {/* La respuesta se renderiza siempre y se colapsa con CSS.
                        Antes se montaba solo al abrir ({open && ...}), asi que
                        ninguna respuesta existia en el HTML servido y Google no
                        podia indexar el FAQ: justo las preguntas que escribe una
                        administradora al buscar. El truco de grid 0fr -> 1fr
                        anima la altura sin fijar un maximo a mano. */}
                    <div
                      id={`faq-panel-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateRows: open ? '1fr' : '0fr',
                        transition: 'grid-template-rows 250ms cubic-bezier(.2,.7,.2,1)',
                      }}
                    >
                      <div style={{ overflow: 'hidden' }}>
                        <p style={{ margin: 0, padding: '0 24px 20px', fontSize: 14, color: '#6E6E73', fontWeight: 500, lineHeight: 1.65 }}>{faq.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="demo">
          <div
            ref={revealRef('cta')}
            style={{ maxWidth: 800, margin: '0 auto', padding: sizes.ctaPadding, textAlign: 'center', ...revealStyle('cta') }}
          >
            <h2 style={{ fontSize: sizes.ctaSize, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', margin: '0 0 20px' }}>
              Tu próxima reunión de consejo,
              <br />
              <span style={{ color: '#6E6E73' }}>con las cuentas claras.</span>
            </h2>
            <p style={{ fontSize: sizes.bodySize, color: '#6E6E73', fontWeight: 500, margin: '0 auto 32px', maxWidth: 440 }}>
              Escríbenos y coordinamos 30 minutos. Te mostramos la plataforma funcionando con el escenario de un conjunto del tamaño del tuyo.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="mailto:hola@pqrsservices.com?subject=Quiero%20una%20demo"
                className="primary-pill"
                style={{
                  background: '#122545',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: 15,
                  fontWeight: 600,
                  padding: '13px 30px',
                  borderRadius: 999,
                  transition: 'background 200ms, transform 200ms',
                }}
              >
                Solicitar una demo
              </a>
              <a
                href="/auth/login"
                style={{ color: '#122545', textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '13px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Iniciar sesión <span style={{ fontSize: 13 }}>›</span>
              </a>
            </div>
            <div style={{ fontSize: 12.5, color: '#8E8E93', fontWeight: 500, marginTop: 18 }}>Sin compromiso · Te respondemos por correo para coordinar la fecha.</div>
          </div>
        </section>

        <footer style={{ borderTop: '1px solid rgba(0,0,0,0.08)', background: '#F5F5F7' }}>
          <div style={{ maxWidth: 1024, margin: '0 auto', padding: '36px 22px 30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap', marginBottom: 28 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                  <Logo size={19} />
                  <span style={{ fontWeight: 800, fontSize: 13.5 }}>
                    PQRS <span style={{ fontWeight: 500, color: '#6E6E73' }}>Services</span>
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#6E6E73', fontWeight: 500, lineHeight: 1.6, maxWidth: 240, margin: 0 }}>
                  Software de gestión de PQRS para conjuntos residenciales y empresas administradoras.
                </p>
              </div>
              <div style={{ display: 'flex', gap: sizes.footerGap, flexWrap: 'wrap' }}>
                {[
                  {
                    title: 'Producto',
                    links: [
                      ['#producto', 'Funcionalidades'],
                      ['#precios', 'Precios'],
                      ['/auth/login', 'Iniciar sesión'],
                    ],
                  },
                  {
                    title: 'Contacto',
                    // Un solo canal publico y monitoreado. Antes habia un
                    // correo personal y un celular personal aqui: no es el
                    // canal de una plataforma que administra datos de cientos
                    // de residentes, y expone al operador sin necesidad.
                    links: [
                      ['#demo', 'Solicitar demo'],
                      ['mailto:hola@pqrsservices.com', 'hola@pqrsservices.com'],
                    ],
                  },
                  {
                    title: 'Legal',
                    links: [
                      ['/legal/privacidad', 'Privacidad'],
                      ['/legal/terminos', 'Términos'],
                      ['/legal/cookies', 'Cookies'],
                      ['/legal/pagos', 'Pagos y cancelación'],
                    ],
                  },
                ].map(group => (
                  <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1D1D1F', marginBottom: 2 }}>{group.title}</div>
                    {group.links.map(([href, label]) => (
                      <a key={label} href={href} className="nav-link" style={{ fontSize: 12.5, color: '#6E6E73', fontWeight: 500, textDecoration: 'none' }}>
                        {label}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 11.5, color: '#8E8E93', fontWeight: 500 }}>© 2026 PQRS Services. Todos los derechos reservados.</span>
              <span style={{ fontSize: 11.5, color: '#8E8E93', fontWeight: 500 }}>Hecho para propiedad horizontal</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
