import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';
import { getLegalConfig } from '@/lib/legal';

export default function CookiesPage() {
  const legal = getLegalConfig();

  return <LegalLayout
    title="Política de cookies"
    intro="Qué tecnologías usa PQRS Services para mantener tu sesión y proteger la plataforma."
  >
    <LegalSection title="1. Solo usamos cookies esenciales">
      <p>
        PQRS Services utiliza <strong>únicamente cookies estrictamente necesarias</strong> para el funcionamiento del
        servicio. Sirven para mantener la sesión iniciada, recordar el conjunto activo cuando un usuario pertenece a
        varios y aplicar controles de seguridad frente a accesos no autorizados.
      </p>
      <p>
        Estas cookies no requieren consentimiento previo porque sin ellas la plataforma no puede operar. Si las
        bloqueas, no podrás iniciar sesión.
      </p>
    </LegalSection>

    <LegalSection title="2. No usamos cookies de seguimiento">
      <p>
        A la fecha de vigencia de este documento <strong>no utilizamos analítica de terceros, publicidad, píxeles de
        seguimiento ni cookies de perfilamiento</strong>. No compartimos tu navegación con redes publicitarias ni
        vendemos información de uso.
      </p>
      <p>
        Si en el futuro incorporamos alguna de estas tecnologías, actualizaremos esta política antes de activarlas y
        habilitaremos un control separado para aceptarlas o rechazarlas, sin que ello afecte el acceso al servicio.
      </p>
    </LegalSection>

    <LegalSection title="3. Cómo controlarlas">
      <LegalList items={[
        'Puedes borrar o bloquear cookies desde la configuración de tu navegador.',
        'Borrar las cookies cierra tu sesión y elimina las preferencias guardadas en el equipo.',
        'Cerrar sesión desde la plataforma elimina la cookie de sesión de forma inmediata.',
      ]} />
    </LegalSection>

    <LegalSection title="4. Contacto">
      <p>
        Para preguntas sobre cookies o privacidad, escribe a{' '}
        <a href={`mailto:${legal.privacyEmail}`} style={linkStyle}>{legal.privacyEmail}</a> o consulta la{' '}
        <a href="/legal/privacidad" style={linkStyle}>política de tratamiento de datos</a>.
      </p>
    </LegalSection>
  </LegalLayout>;
}

const linkStyle = { color: '#122545', fontWeight: 700 } as const;
