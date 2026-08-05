import Link from 'next/link';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { LEGAL_PATHS } from '@/lib/legal';

export default function LegalIndexPage() {
  return <LegalLayout title="Información legal" intro="Aquí encuentras las reglas generales de uso, tratamiento de datos y pagos de PQRS Services. Para cada conjunto se complementan con la propuesta, orden de servicio o contrato comercial firmado.">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      <LegalCard href={LEGAL_PATHS.terms} title="Términos y condiciones" text="Cómo se relacionan el contrato firmado, las cuentas, las responsabilidades, la vigencia y la terminación." />
      <LegalCard href={LEGAL_PATHS.privacy} title="Tratamiento de datos" text="Qué datos usamos, para qué los usamos, con quién se comparten y cómo ejercer tus derechos." />
      <LegalCard href={LEGAL_PATHS.cookies} title="Política de cookies" text="Qué tecnologías usa el sitio y cómo controlar las cookies no esenciales." />
      <LegalCard href={LEGAL_PATHS.payments} title="Pagos y cancelación" text="Pago mensual manual o automático, anualidad, renovación, mora y terminación anticipada." />
    </div>
  </LegalLayout>;
}

function LegalCard({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} style={{ display: 'block', color: '#1D1D1F', textDecoration: 'none', border: '1px solid #E8E8ED', borderRadius: 14, padding: 18 }}><div style={{ color: '#122545', fontSize: 15, fontWeight: 800, marginBottom: 7 }}>{title}</div><div style={{ color: '#6E6E73', fontSize: 13, lineHeight: 1.55, fontWeight: 500 }}>{text}</div></Link>;
}
