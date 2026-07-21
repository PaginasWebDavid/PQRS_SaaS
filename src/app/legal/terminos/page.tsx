import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';
import { getLegalConfig } from '@/lib/legal';

export default function TermsPage() {
  const legal = getLegalConfig();
  return <LegalLayout title="Términos y condiciones" intro="Estas condiciones regulan el acceso y uso de PQRS Services por parte de los conjuntos residenciales y sus usuarios.">
    <LegalSection title="1. Identificación del prestador"><p>El servicio es operado bajo la marca PQRS Services. El nombre legal, NIT, dirección y fecha de vigencia deben completarse antes de publicar este documento.</p><p>Contacto: <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a>.</p></LegalSection>
    <LegalSection title="2. Objeto del servicio"><p>PQRS Services ofrece una herramienta web para radicar, organizar, atender, consultar y reportar peticiones, quejas, reclamos y solicitudes de conjuntos residenciales. El alcance exacto, el precio y los módulos contratados constan en la propuesta o contrato de cada conjunto.</p></LegalSection>
    <LegalSection title="3. Cuentas y acceso"><LegalList items={['El administrador del conjunto invita a las personas autorizadas y asigna su rol.', 'Cada usuario debe proteger sus credenciales y avisar si sospecha un acceso no autorizado.', 'Las cuentas son personales y no deben compartirse.', 'PQRS Services puede bloquear temporalmente una cuenta ante riesgo de seguridad o incumplimiento.']} /></LegalSection>
    <LegalSection title="4. Responsabilidades del conjunto"><LegalList items={['Definir quiénes pueden acceder y revisar periódicamente sus usuarios.', 'Usar la plataforma para fines relacionados con la gestión del conjunto.', 'Mantener actualizados sus datos de contacto y su información operativa.', 'Contar con las autorizaciones y bases legales necesarias para tratar los datos que cargue al servicio.']} /></LegalSection>
    <LegalSection title="5. Disponibilidad y soporte"><p>El servicio se presta mediante internet y puede presentar interrupciones por mantenimiento, fallas de proveedores o situaciones fuera del control razonable. Los niveles de soporte y disponibilidad aplicables son los definidos en el contrato de cada conjunto.</p></LegalSection>
    <LegalSection title="6. Pagos, renovación y terminación"><p>El conjunto paga la tarifa mensual informada antes de confirmar la suscripción. La renovación, los medios de pago, los periodos de gracia, la suspensión y la cancelación se describen en la política de pagos y en el contrato particular.</p></LegalSection>
    <LegalSection title="7. Uso permitido"><LegalList items={['No intentar acceder a información de otro conjunto o usuario.', 'No cargar contenido ilegal, malicioso o que vulnere derechos de terceros.', 'No realizar pruebas de seguridad, automatizaciones o extracciones masivas sin autorización.', 'No usar el servicio para enviar comunicaciones no solicitadas.']} /></LegalSection>
    <LegalSection title="8. Datos y confidencialidad"><p>El tratamiento de datos personales se rige por la política de privacidad y, para cada conjunto, por el acuerdo de tratamiento de datos correspondiente. Las obligaciones específicas de cada parte prevalecen según el contrato firmado.</p></LegalSection>
    <LegalSection title="9. Cambios y contacto"><p>Podemos actualizar estas condiciones para reflejar cambios legales o funcionales. Publicaremos la nueva versión y comunicaremos los cambios relevantes. Para preguntas o solicitudes, escribe a <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a>.</p></LegalSection>
  </LegalLayout>;
}

const linkStyle = { color: '#122545', fontWeight: 700 } as const;
