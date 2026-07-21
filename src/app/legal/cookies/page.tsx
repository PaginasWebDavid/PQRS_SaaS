import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';

export default function CookiesPage() {
  return <LegalLayout title="Política de cookies" intro="Esta política explica qué tecnologías puede usar PQRS Services para mantener la sesión y proteger la plataforma.">
    <LegalSection title="1. Cookies esenciales"><p>La aplicación puede usar cookies estrictamente necesarias para mantener la sesión, recordar controles de seguridad y permitir la navegación autenticada. Si se bloquean, algunas funciones no podrán operar.</p></LegalSection>
    <LegalSection title="2. Cookies no esenciales"><p>Actualmente no debemos activar analítica, publicidad ni cookies de seguimiento sin informar previamente y obtener el consentimiento que corresponda. Si se incorporan, esta política se actualizará y se habilitará un control separado para aceptarlas o rechazarlas.</p></LegalSection>
    <LegalSection title="3. Cómo controlarlas"><LegalList items={['Puedes borrar o bloquear cookies desde la configuración de tu navegador.', 'Borrar cookies puede cerrar tu sesión y eliminar preferencias locales.', 'Las cookies de terceros pueden tener sus propias políticas y controles.']} /></LegalSection>
    <LegalSection title="4. Contacto"><p>Para preguntas sobre cookies o privacidad, contacta el canal indicado en la <a href="/legal/privacidad" style={linkStyle}>política de tratamiento de datos</a>.</p></LegalSection>
  </LegalLayout>;
}

const linkStyle = { color: '#122545', fontWeight: 700 } as const;
