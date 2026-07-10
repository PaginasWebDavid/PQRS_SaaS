'use client';
import Link from 'next/link';
import { useState } from 'react';
import { BrandLockup } from '@/components/Logo';
import { COLORS, RADIUS } from '@/lib/tokens';

const NAV = [
  { href: '#producto', label: 'Producto' },
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#precios', label: 'Precios' },
  { href: '#faq', label: 'FAQ' },
];

const PAIN_POINTS = [
  'PQRS gestionadas por WhatsApp y correos sueltos',
  'Excel para hacer seguimiento manual',
  'Sin trazabilidad de quién respondió qué',
  'Evidencias perdidas entre chats',
  'Reportes armados a mano cada mes',
];

const BENEFITS = [
  { title: 'PQRS centralizadas', desc: 'Todas las solicitudes en un solo lugar, con estado y responsable claros.' },
  { title: 'Seguimiento por estado', desc: 'Radicada, en revisión, en proceso, terminada — sin ambigüedad.' },
  { title: 'Usuarios y roles', desc: 'Admin, Consejo y Residentes con permisos distintos y claros.' },
  { title: 'Reportes ejecutivos', desc: 'Listos para tu consejo de administración, sin armarlos a mano.' },
  { title: 'Historial completo', desc: 'Cada acción queda registrada con fecha y responsable.' },
  { title: 'Evidencias adjuntas', desc: 'Fotos y documentos directamente en cada solicitud.' },
];

const PRICING = [
  { range: '50 – 100 unidades', desc: 'Ideal para conjuntos pequeños.' },
  { range: '101 – 300 unidades', desc: 'El rango más común entre nuestros clientes.' },
  { range: '301 – 500 unidades', desc: 'Para conjuntos grandes con alto volumen de PQRS.' },
  { range: '501+ unidades', desc: 'Cotización personalizada para grandes operaciones.' },
];

const FAQS = [
  { q: '¿PQRS Services sirve para varios conjuntos?', a: 'Sí, cada conjunto administra su información de forma independiente.' },
  { q: '¿Los residentes necesitan instalar algo?', a: 'No. Acceden desde el navegador, en computador o celular.' },
  { q: '¿Puedo exportar reportes?', a: 'Sí, en Excel y PDF, con filtros por fecha y estado.' },
  { q: '¿Se pueden gestionar usuarios por rol?', a: 'Sí — Admin, Consejo y Residente, cada uno con permisos distintos.' },
  { q: '¿Cómo funcionan las licencias?', a: 'Por rango de unidades del conjunto, con renovación periódica.' },
];

export default function LandingPage() {
  const [faqOpen, setFaqOpen] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", color: '#1D1D1F', background: '#FFFFFF' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(250,250,247,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #E5E3DC' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <BrandLockup size={28} />
          <div style={{ display: 'none', gap: 28 }} className="landing-nav-desktop">
            {NAV.map((n) => <a key={n.href} href={n.href} style={{ color: '#4A4A48', fontSize: 14, fontWeight: 500 }}>{n.label}</a>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/login" style={{ color: '#111111', fontSize: 14, fontWeight: 600, padding: '9px 16px' }}>Iniciar sesión</Link>
            <a href="mailto:hola@pqrsservices.com?subject=Quiero%20una%20demo" style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 14, fontWeight: 600, padding: '10px 20px', borderRadius: RADIUS.pill, whiteSpace: 'nowrap' }}>Solicitar demo</a>
          </div>
        </div>
      </nav>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '90px 24px 60px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy, marginBottom: 18 }}>PQRS Services</div>
        <h1 style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 20px' }}>
          La forma moderna de gestionar PQRS en propiedad horizontal.
        </h1>
        <p style={{ fontSize: 17, color: '#4A4A48', fontWeight: 500, maxWidth: 640, margin: '0 auto 34px', lineHeight: 1.6 }}>
          Centraliza solicitudes, usuarios, reportes, evidencias y seguimiento operativo en una plataforma diseñada para administradores de conjuntos residenciales.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="mailto:hola@pqrsservices.com?subject=Quiero%20una%20demo" style={{ background: COLORS.navy, color: '#FFFFFF', fontSize: 15, fontWeight: 600, padding: '13px 30px', borderRadius: RADIUS.pill }}>Solicitar una demo</a>
          <a href="#funcionalidades" style={{ color: COLORS.navy, fontSize: 15, fontWeight: 600, padding: '13px 10px' }}>Ver funcionalidades ›</a>
        </div>
      </section>

      <section id="producto" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px 80px' }}>
        <div style={{ background: '#F3F1EA', border: '1px solid #E5E3DC', borderRadius: 20, padding: 24 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8A8A85', marginBottom: 12 }}>Dashboard — Parque Residencial Calle 100</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {['24 abiertas', '12 en proceso', '128 terminadas'].map((s) => (
                <div key={s} style={{ background: '#F5F5F7', borderRadius: 12, padding: 16, fontWeight: 700, fontSize: 14 }}>{s}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 20 }}>El problema de hoy</h2>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PAIN_POINTS.map((p) => (
            <li key={p} style={{ fontSize: 15.5, color: '#4A4A48', fontWeight: 500, borderBottom: '1px solid #E5E3DC', paddingBottom: 12 }}>{p}</li>
          ))}
        </ul>
      </section>

      <section id="funcionalidades" style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 28, textAlign: 'center' }}>Todo lo que necesitas para operar</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 16 }}>
          {BENEFITS.map((b) => (
            <div key={b.title} style={{ border: '1px solid #E5E3DC', borderRadius: 14, padding: 22 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{b.title}</div>
              <div style={{ fontSize: 13.5, color: '#4A4A48', lineHeight: 1.5 }}>{b.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="precios" style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8, textAlign: 'center' }}>Precios por unidades</h2>
        <p style={{ textAlign: 'center', color: '#8A8A85', marginBottom: 28 }}>El precio depende del número de unidades de tu conjunto.</p>
        <div style={{ border: '1px solid #E5E3DC', borderRadius: 12, overflow: 'hidden' }}>
          {PRICING.map((p) => (
            <div key={p.range} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E5E3DC', flexWrap: 'wrap', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{p.range}</span>
              <span style={{ color: '#4A4A48', fontSize: 14 }}>{p.desc}</span>
              <a href="mailto:hola@pqrsservices.com?subject=Cotizacion" style={{ border: '1px solid #B9B6AC', borderRadius: RADIUS.pill, padding: '8px 20px', fontSize: 13, fontWeight: 600, color: COLORS.navy }}>Solicitar cotización</a>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 24, textAlign: 'center' }}>Preguntas frecuentes</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FAQS.map((f, i) => (
            <div key={f.q} style={{ background: '#F3F1EA', borderRadius: 12, overflow: 'hidden' }}>
              <div onClick={() => setFaqOpen(faqOpen === i ? -1 : i)} style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 700, fontSize: 14.5 }}>
                {f.q}<span>{faqOpen === i ? '−' : '+'}</span>
              </div>
              {faqOpen === i && <p style={{ margin: 0, padding: '0 18px 16px', color: '#4A4A48', fontSize: 13.5, lineHeight: 1.6 }}>{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: COLORS.navy, padding: '70px 24px', textAlign: 'center' }}>
        <h2 style={{ color: '#FFFFFF', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 24px', maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>
          Empieza a gestionar tu conjunto con una plataforma diseñada para escalar.
        </h2>
        <a href="mailto:hola@pqrsservices.com?subject=Quiero%20una%20demo" style={{ background: '#FFFFFF', color: COLORS.navy, fontSize: 15, fontWeight: 700, padding: '14px 32px', borderRadius: RADIUS.pill }}>Solicitar una demo</a>
      </section>

      <footer style={{ padding: '48px 24px', textAlign: 'center', color: '#8A8A85', fontSize: 13 }}>
        <BrandLockup />
        <div style={{ marginTop: 16 }}>© {new Date().getFullYear()} PQRS Services</div>
      </footer>
    </div>
  );
}
