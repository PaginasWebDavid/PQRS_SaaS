import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';
import { getLegalConfig } from '@/lib/legal';

export default function PrivacyPage() {
  const legal = getLegalConfig();
  const prestador = legal.legalName || 'el prestador del servicio';
  const identificacion = legal.nit ? `${legal.idLabel} ${legal.nit}` : '';

  return <LegalLayout
    title="Política de tratamiento de datos"
    intro="Cómo PQRS Services trata los datos personales de administradores, consejeros, residentes y contactos de los conjuntos, conforme a la Ley 1581 de 2012 y el Decreto 1074 de 2015."
  >
    <LegalSection title="1. Quién responde por los datos">
      <p>
        Esta política distingue dos situaciones, porque las obligaciones legales son distintas en cada una:
      </p>
      <p>
        <strong>a) Datos de los residentes y usuarios del conjunto.</strong> El <strong>conjunto residencial es el
        Responsable del Tratamiento</strong>: es quien decide qué datos recoge, para qué y por cuánto tiempo, y quien
        debe contar con la autorización de los titulares. <strong>PQRS Services actúa como Encargado</strong> y solo
        trata esos datos siguiendo las instrucciones del conjunto, para prestar el servicio contratado. La sección 9
        de este documento es el acuerdo de encargo entre las dos partes.
      </p>
      <p>
        <strong>b) Datos del cliente y de la relación comercial.</strong> Para los datos de contacto del
        administrador, la facturación y el uso de la plataforma, <strong>{prestador}{identificacion ? ` (${identificacion})` : ''} es
        el Responsable</strong>, con domicilio en {legal.address ? `${legal.address}, ` : ''}{legal.city}.
      </p>
      <p>
        Canal para solicitudes de privacidad:{' '}
        <a href={`mailto:${legal.privacyEmail}`} style={linkStyle}>{legal.privacyEmail}</a>.
      </p>
    </LegalSection>

    <LegalSection title="2. Datos que tratamos">
      <LegalList items={[
        'Identificación y contacto: nombre, correo electrónico y teléfono cuando el conjunto lo registre.',
        'Datos de vivienda y rol: conjunto, bloque, apartamento y rol asignado dentro de la plataforma.',
        'Credenciales: la contraseña nunca se almacena en texto plano, sino como un valor derivado irreversible (bcrypt).',
        'Contenido de las PQRS: título, descripción, categoría, fotografías y evidencias, respuestas, estados e historial de gestión.',
        'Registros técnicos y de auditoría: fecha, hora, actor y acción de cada operación relevante, necesarios para seguridad y trazabilidad.',
        'Datos de contrato y pago del conjunto: plan, unidades, facturación y estado de la suscripción.',
      ]} />
      <p>
        <strong>No solicitamos intencionalmente datos sensibles</strong> (salud, biometría, origen étnico,
        convicciones) ni datos de niños, niñas y adolescentes, y esos datos están fuera del alcance autorizado del
        servicio. Tampoco almacenamos números completos de tarjetas: los datos de pago se procesan directamente en la
        pasarela y nunca pasan por nuestros servidores.
      </p>
      <p>
        El conjunto no debe cargar datos sensibles en las PQRS ni en las evidencias. Si lo hace, asume la
        responsabilidad como Responsable del Tratamiento.
      </p>
    </LegalSection>

    <LegalSection title="3. Para qué los usamos">
      <LegalList items={[
        'Crear y administrar cuentas, invitaciones y roles.',
        'Prestar el servicio de radicación, gestión y seguimiento de PQRS.',
        'Enviar notificaciones operativas y correos transaccionales del servicio.',
        'Atender soporte, seguridad, auditoría y prevención de fraude.',
        'Procesar pagos, renovaciones y obligaciones contables y tributarias.',
        'Cumplir obligaciones legales y atender solicitudes de los titulares y de las autoridades.',
      ]} />
      <p>
        <strong>No vendemos datos personales, no los cedemos a terceros con fines comerciales y no los usamos para
        publicidad ni para entrenar modelos de inteligencia artificial.</strong>
      </p>
    </LegalSection>

    <LegalSection title="4. Proveedores y transferencias internacionales">
      <p>
        Para operar la plataforma nos apoyamos en proveedores que actúan como subencargados y que solo pueden tratar
        la información necesaria para prestar su servicio:
      </p>
      <LegalList items={[
        'Supabase — base de datos y almacenamiento de archivos.',
        'Vercel — alojamiento y ejecución de la aplicación.',
        'Resend — envío de correos transaccionales.',
        'Wompi (Bancolombia) y, cuando corresponda, Mercado Pago — procesamiento de pagos.',
      ]} />
      <p>
        Algunos de estos proveedores operan servidores fuera de Colombia. Estas transferencias se amparan en la
        autorización del titular y en las obligaciones contractuales de seguridad y confidencialidad asumidas por cada
        proveedor, conforme al artículo 26 de la Ley 1581 de 2012. Publicaremos cualquier cambio en esta lista antes de
        que entre en vigor.
      </p>
    </LegalSection>

    <LegalSection title="5. Cuánto tiempo conservamos la información">
      <p>
        Conservamos la información mientras la cuenta o el contrato estén vigentes. Al terminar el contrato, el
        conjunto dispone de <strong>30 días calendario</strong> para solicitar la exportación de su información.
        Vencido ese plazo, procedemos a eliminarla o anonimizarla.
      </p>
      <p>
        Se exceptúan los registros que debemos conservar por mandato legal —en particular los soportes contables y
        tributarios, por el término que exija la ley— y los registros de auditoría estrictamente necesarios para
        acreditar el cumplimiento de esta política, que se conservan de forma disociada cuando es posible.
      </p>
    </LegalSection>

    <LegalSection title="6. Derechos de los titulares y plazos de respuesta">
      <p>
        Todo titular puede conocer, actualizar y rectificar sus datos; solicitar prueba de la autorización; ser
        informado sobre el uso dado a sus datos; presentar quejas ante la Superintendencia de Industria y Comercio; y
        revocar la autorización o solicitar la supresión cuando no exista un deber legal o contractual de conservarlos.
      </p>
      <p>Los plazos legales que cumplimos son:</p>
      <LegalList items={[
        'Consultas: se atienden en un máximo de diez (10) días hábiles, prorrogables por cinco (5) días hábiles más, informando el motivo de la prórroga.',
        'Reclamos: se atienden en un máximo de quince (15) días hábiles, prorrogables por ocho (8) días hábiles más, informando el motivo de la prórroga.',
      ]} />
      <p>
        Si el titular es residente de un conjunto, puede dirigir su solicitud al administrador (Responsable) o
        directamente a <a href={`mailto:${legal.privacyEmail}`} style={linkStyle}>{legal.privacyEmail}</a>. En este
        último caso la trasladaremos al conjunto y lo acompañaremos en su atención dentro de los plazos anteriores.
        La solicitud debe indicar nombre, correo, conjunto y una descripción clara del requerimiento.
      </p>
    </LegalSection>

    <LegalSection title="7. Medidas de seguridad">
      <p>Aplicamos, como mínimo, los siguientes controles:</p>
      <LegalList items={[
        'Contraseñas almacenadas mediante bcrypt, nunca en texto plano ni de forma reversible.',
        'Control de acceso por rol y aislamiento estricto de la información entre conjuntos.',
        'Archivos y evidencias en almacenamiento privado, sin acceso público, con validación del conjunto propietario en cada descarga.',
        'Validación del tipo real de cada archivo cargado, no solo de su extensión.',
        'Cifrado en tránsito mediante HTTPS en toda la aplicación.',
        'Registro de auditoría con actor, acción y fecha de las operaciones relevantes.',
        // Aqui decia "Copias de respaldo administradas por el proveedor de base
        // de datos". Se retiro porque era falso: el proyecto esta en el plan
        // gratuito de Supabase, que no genera copias de respaldo. Afirmar en una
        // politica de privacidad un control que no existe es exactamente el tipo
        // de declaracion que la SIC puede reprochar.
        //
        // RESTAURAR esta linea al pasar a un plan con respaldos automaticos, que
        // es lo que corresponde antes de operar con datos de conjuntos reales.
        'Acceso a la administración de la plataforma restringido a personal autorizado.',
      ]} />
      <p>
        Ningún servicio conectado a internet es absolutamente invulnerable. Estas medidas son razonables y
        proporcionales al riesgo, pero no constituyen una garantía de inviolabilidad.
      </p>
    </LegalSection>

    <LegalSection title="8. Incidentes de seguridad">
      <p>
        Si detectamos un incidente que afecte datos personales bajo nuestro tratamiento, informaremos al conjunto
        afectado <strong>sin dilación indebida</strong>, conforme a los plazos y deberes que resulten aplicables. Como
        objetivo operativo procuraremos emitir una comunicación inicial dentro de las 72 horas siguientes a su
        confirmación, cuando sea razonablemente posible, indicando qué ocurrió, qué información pudo verse comprometida
        y qué medidas se adoptaron.
      </p>
      <p>
        Como Encargado, apoyaremos al conjunto en el reporte del incidente a la Superintendencia de Industria y
        Comercio cuando la normativa lo exija. La obligación de reportar corresponde al Responsable.
      </p>
    </LegalSection>

    <LegalSection title="9. Acuerdo de encargo del tratamiento">
      <p>
        Esta sección constituye el acuerdo entre el conjunto (Responsable) y {prestador} (Encargado), y hace parte
        integral de los términos y condiciones. Como Encargado nos obligamos a:
      </p>
      <LegalList items={[
        'Tratar los datos únicamente conforme a las instrucciones del conjunto y para las finalidades del servicio contratado.',
        'No usar los datos para fines propios, comerciales, publicitarios o de entrenamiento de modelos.',
        'Guardar reserva sobre la información, obligación que subsiste después de terminado el contrato.',
        'Aplicar y mantener las medidas de seguridad descritas en la sección 7.',
        'Permitir al conjunto ejercer el control sobre su información y atender oportunamente las solicitudes de los titulares que se nos trasladen.',
        'Informar al conjunto los incidentes de seguridad en el plazo de la sección 8.',
        'Contratar subencargados solo bajo obligaciones de confidencialidad y seguridad equivalentes, e informar los cambios en la lista de la sección 4.',
        'Devolver o eliminar la información al terminar el contrato, en los términos de la sección 5.',
      ]} />
      <p>El conjunto, como Responsable, se obliga a:</p>
      <LegalList items={[
        'Obtener y conservar la autorización de tratamiento de los titulares cuya información cargue a la plataforma.',
        'Informar a sus residentes las finalidades del tratamiento y la existencia de esta política.',
        'Mantener actualizada la información y solicitar su corrección o supresión cuando corresponda.',
        'Atender las consultas y reclamos de sus titulares dentro de los plazos legales.',
        'No cargar datos sensibles ni datos de menores de edad en la plataforma.',
      ]} />
      <p>
        El incumplimiento de las obligaciones del Responsable no es imputable al Encargado. En particular, la ausencia
        de autorización de los titulares es responsabilidad exclusiva del conjunto.
      </p>
    </LegalSection>

    <LegalSection title="10. Registro Nacional de Bases de Datos">
      <p>
        La obligación de inscribir bases de datos en el Registro Nacional de Bases de Datos (RNBD) de la
        Superintendencia de Industria y Comercio recae sobre el Responsable del Tratamiento, en los casos y umbrales
        previstos por la normativa vigente. Cada conjunto debe verificar si le aplica según su naturaleza jurídica y su
        nivel de activos.
      </p>
    </LegalSection>

    <LegalSection title="11. Vigencia y cambios">
      <p>
        Esta política rige desde la fecha de vigencia indicada al inicio del documento. Los cambios relevantes se
        comunicarán al correo del administrador antes de su entrada en vigor y se publicará la nueva versión con su
        fecha. Las bases de datos tratadas bajo esta política tienen vigencia mientras dure la relación contractual y
        los plazos legales de conservación aplicables.
      </p>
    </LegalSection>
  </LegalLayout>;
}

const linkStyle = { color: '#122545', fontWeight: 700 } as const;
