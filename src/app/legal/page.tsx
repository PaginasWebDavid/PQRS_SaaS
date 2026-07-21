import Link from 'next/link';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { LEGAL_PATHS } from '@/lib/legal';

export default function LegalIndexPage() {
  return <LegalLayout title="Informacion legal" intro="Aqui encuentras las reglas del servicio, el tratamiento de datos y las condiciones de pago de PQRS Services.">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      <LegalCard href={LEGAL_PATHS.terms} title="Terminos y condiciones" text="Como funciona el servicio, las cuentas, las responsabilidades y la terminacion." />
      <LegalCard href={LEGAL_PATHS.privacy} title="Tratamiento de datos" text="Que datos usamos, para que los usamos, con quien se comparten y como ejercer tus derechos." />
      <LegalCard href={LEGAL_PATHS.cookies} title="Politica de cookies" text="Que tecnologias usa el sitio y como controlar las cookies no esenciales." />
      <LegalCard href={LEGAL_PATHS.payments} title="Pagos y cancelacion" text="Cobro mensual, renovacion, fallos de pago, suspension y cancelacion." />
    </div>
  </LegalLayout>;
}

function LegalCard({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} style={{ display: 'block', color: '#1D1D1F', textDecoration: 'none', border: '1px solid #E8E8ED', borderRadius: 14, padding: 18 }}><div style={{ color: '#122545', fontSize: 15, fontWeight: 800, marginBottom: 7 }}>{title}</div><div style={{ color: '#6E6E73', fontSize: 13, lineHeight: 1.55, fontWeight: 500 }}>{text}</div></Link>;
}
