import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';

export default function CookiesPage() {
  return <LegalLayout title="Politica de cookies" intro="Esta politica explica que tecnologias puede usar PQRS Services para mantener la sesion y proteger la plataforma.">
    <LegalSection title="1. Cookies esenciales"><p>La aplicacion puede usar cookies estrictamente necesarias para mantener la sesion, recordar controles de seguridad y permitir la navegacion autenticada. Si se bloquean, algunas funciones no podran operar.</p></LegalSection>
    <LegalSection title="2. Cookies no esenciales"><p>Actualmente no debemos activar analitica, publicidad ni cookies de seguimiento sin informar previamente y obtener el consentimiento que corresponda. Si se incorporan, esta politica se actualizara y se habilitara un control separado para aceptarlas o rechazarlas.</p></LegalSection>
    <LegalSection title="3. Como controlarlas"><LegalList items={['Puedes borrar o bloquear cookies desde la configuracion de tu navegador.', 'Borrar cookies puede cerrar tu sesion y eliminar preferencias locales.', 'Las cookies de terceros pueden tener sus propias politicas y controles.']} /></LegalSection>
    <LegalSection title="4. Contacto"><p>Para preguntas sobre cookies o privacidad, contacta el canal indicado en la <a href="/legal/privacidad" style={linkStyle}>politica de tratamiento de datos</a>.</p></LegalSection>
  </LegalLayout>;
}

const linkStyle = { color: '#122545', fontWeight: 700 } as const;
