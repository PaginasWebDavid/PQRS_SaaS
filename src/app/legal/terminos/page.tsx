import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';
import {
  LEGAL_LIABILITY_CAP_MONTHS,
  LEGAL_NON_RENEWAL_NOTICE_DAYS,
  LEGAL_PRICE_CHANGE_NOTICE_DAYS,
  getLegalConfig,
} from '@/lib/legal';

export default function TermsPage() {
  const legal = getLegalConfig();
  const prestador = legal.legalName || 'el prestador del servicio';
  const identificacion = legal.nit ? `${legal.idLabel} ${legal.nit}` : '';

  return <LegalLayout
    title="Términos y condiciones"
    intro="Estas condiciones regulan el uso de PQRS Services y complementan la propuesta, orden de servicio o contrato comercial firmado con cada conjunto."
  >
    <LegalSection title="1. Quién presta el servicio">
      <p>
        El servicio se presta bajo la marca <strong>PQRS Services</strong>
        {legal.legalName ? <> por <strong>{legal.legalName}</strong></> : null}
        {identificacion ? <>, identificado con {identificacion}</> : null}
        {legal.address ? <>, con domicilio en {legal.address}, {legal.city}</> : <> ({legal.city})</>}.
      </p>
      <p>
        Contacto y notificaciones: <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a>
        {legal.phone ? <> · {legal.phone}</> : null}.
      </p>
    </LegalSection>

    <LegalSection title="2. Documentos contractuales y aceptación">
      <p>
        La relación comercial se perfecciona mediante la propuesta aceptada, orden de servicio o contrato firmado por
        el representante autorizado del conjunto. Ese documento particular identifica, como mínimo, el alcance, el
        precio, la duración, la modalidad de pago y la fecha de inicio. Estas condiciones generales y la política de
        pagos lo complementan.
      </p>
      <p>
        La aceptación de una invitación por un ADMIN, CONSEJO o RESIDENTE regula el uso personal de su cuenta, la
        confidencialidad y el tratamiento de sus datos, pero <strong>no convierte por sí sola a ese usuario en
        representante contractual del conjunto</strong>. Quien firme o acepte la orden en nombre del conjunto declara
        que cuenta con las facultades o autorizaciones necesarias.
      </p>
      <p>
        Podemos conservar como evidencia la firma, el mensaje de datos, la fecha, la hora, la identidad disponible y
        la versión aceptada. De acuerdo con la Ley 527 de 1999, no se negarán efectos jurídicos a una manifestación por
        el solo hecho de constar en un mensaje de datos, siempre que el método utilizado permita identificar a su autor
        y expresar su aprobación de forma confiable.
      </p>
      <p>
        Si existe una diferencia, la orden de servicio o contrato firmado prevalece sobre estas condiciones respecto
        de las condiciones comerciales particulares. Estas condiciones prevalecen respecto de las reglas generales de
        uso, seguridad y operación que no hayan sido modificadas expresamente por escrito.
      </p>
    </LegalSection>

    <LegalSection title="3. Qué incluye el servicio">
      <p>
        PQRS Services es una herramienta web para radicar, clasificar, atender, consultar y reportar peticiones,
        quejas, reclamos y solicitudes de un conjunto residencial. Incluye cuentas por rol, seguimiento de casos,
        evidencias, notificaciones por correo y reportes de gestión.
      </p>
      <p>
        El precio, el número de unidades contratadas, el plazo y los módulos incluidos constan en la orden de servicio
        o contrato. La sección <em>Licencias y pagos</em> permite consultar el estado operativo registrado en la
        plataforma; si existe una diferencia documental, debe reportarse para corregirla antes del siguiente cobro.
      </p>
    </LegalSection>

    <LegalSection title="4. Cuentas y acceso">
      <LegalList items={[
        'El administrador del conjunto invita a las personas autorizadas y les asigna su rol.',
        'Cada usuario debe proteger sus credenciales y avisar de inmediato si sospecha un acceso no autorizado.',
        'Las cuentas son personales e intransferibles; no deben compartirse entre varias personas.',
        'PQRS Services puede bloquear una cuenta de forma temporal ante un riesgo de seguridad comprobado o un incumplimiento grave de estas condiciones, informando al conjunto.',
        'Al terminar la relación laboral o el encargo de una persona, el conjunto debe desactivar su cuenta.',
      ]} />
    </LegalSection>

    <LegalSection title="5. Obligaciones del conjunto">
      <LegalList items={[
        'Definir quiénes acceden, con qué rol, y revisar periódicamente sus usuarios activos.',
        'Usar la plataforma únicamente para la gestión del conjunto y para fines lícitos.',
        'Mantener actualizados sus datos de contacto, de facturación y su información operativa.',
        'Contar con la autorización de tratamiento de datos de sus residentes y demás titulares cuya información cargue a la plataforma. Esta obligación es del conjunto y no de PQRS Services.',
        'Responder por el contenido que sus usuarios publiquen en las PQRS, incluidas fotografías y evidencias.',
        'Mantener un medio de pago vigente mientras la suscripción esté activa.',
      ]} />
    </LegalSection>

    <LegalSection title="6. Disponibilidad del servicio">
      <p>
        El servicio se presta a través de internet y se ofrece <em>en el estado en que se encuentra</em>. Hacemos un
        esfuerzo razonable y continuo por mantenerlo disponible, pero no garantizamos operación ininterrumpida ni
        ausencia total de errores.
      </p>
      <p>
        Puede haber interrupciones por mantenimiento programado, fallas de proveedores de infraestructura, cortes de
        conectividad o eventos de fuerza mayor. Cuando el mantenimiento sea programado y afecte el uso normal,
        avisaremos con antelación por correo. Salvo pacto expreso y escrito en contrario, este contrato no incluye un
        acuerdo de nivel de servicio (ANS) con porcentaje de disponibilidad garantizado.
      </p>
    </LegalSection>

    <LegalSection title="7. Precio, impuestos y cambios de tarifa">
      <p>
        La tarifa se informa en la propuesta u orden antes de contratar y depende del número de unidades y del alcance
        habilitado para el conjunto.
        {legal.isVatResponsible
          ? ' Los precios mostrados no incluyen IVA, salvo que se indique expresamente; el impuesto se liquida y se discrimina en la factura conforme a la ley.'
          : ' A la fecha de vigencia de este documento el prestador no es responsable de IVA, por lo que el precio mostrado es el valor total a pagar. Si esa condición cambia por disposición legal o por el volumen de operaciones, se informará antes de aplicar el impuesto.'}
      </p>
      <p>
        La tarifa pactada se mantiene durante el periodo anual de servicio en curso, salvo cambio solicitado en
        unidades o módulos, impuestos exigibles o acuerdo escrito entre las partes. Todo ajuste para una renovación se
        comunicará al correo del administrador con al menos <strong>{LEGAL_PRICE_CHANGE_NOTICE_DAYS} días
        calendario</strong> de anticipación y se aplicará desde el siguiente periodo anual, no retroactivamente. El
        conjunto puede comunicar su decisión de no renovar antes de que el nuevo precio entre en vigor.
      </p>
      <p>
        Las condiciones de cobro, periodo de gracia, suspensión, cancelación y reembolso están en la{' '}
        <a href="/legal/pagos" style={linkStyle}>política de pagos</a>, que hace parte integral de este contrato.
      </p>
    </LegalSection>

    <LegalSection title="8. Uso permitido">
      <LegalList items={[
        'No intentar acceder a la información de otro conjunto, de otro usuario ni a áreas no autorizadas de la plataforma.',
        'No cargar contenido ilegal, difamatorio, malicioso o que vulnere derechos de terceros.',
        'No realizar pruebas de seguridad, ingeniería inversa, automatizaciones ni extracciones masivas de datos sin autorización escrita.',
        'No usar el servicio para enviar comunicaciones comerciales no solicitadas.',
        'No revender, sublicenciar ni ceder el acceso a un tercero sin autorización escrita.',
      ]} />
      <p>El incumplimiento grave de esta sección permite suspender el acceso de forma inmediata.</p>
    </LegalSection>

    <LegalSection title="9. Propiedad intelectual">
      <p>
        El software, la marca, el diseño, la documentación y el código de PQRS Services son y seguirán siendo
        propiedad de {prestador}. El contrato otorga al conjunto una licencia de uso limitada, no exclusiva, revocable
        e intransferible, vigente mientras la suscripción esté al día.
      </p>
      <p>
        La información y los datos que el conjunto carga a la plataforma <strong>son del conjunto</strong>. No los
        vendemos, no los cedemos y no los usamos para fines distintos de prestar el servicio.
      </p>
    </LegalSection>

    <LegalSection title="10. Límite de responsabilidad">
      <p>
        En la medida permitida por la ley colombiana, la responsabilidad total de {prestador} frente al conjunto, por
        cualquier causa y durante toda la vigencia del contrato, se limita a{' '}
        <strong>las sumas efectivamente pagadas por el conjunto en los {LEGAL_LIABILITY_CAP_MONTHS} meses anteriores
        al hecho que origina la reclamación</strong>.
      </p>
      <p>No respondemos por:</p>
      <LegalList items={[
        'Lucro cesante, pérdida de oportunidad, daño reputacional ni perjuicios indirectos o imprevisibles.',
        'Decisiones que el conjunto, su administración o su consejo tomen con base en la información de la plataforma.',
        'El contenido que los usuarios del conjunto publiquen en las PQRS o en las evidencias.',
        'Fallas de proveedores externos de infraestructura, correo o pagos, más allá de gestionar razonablemente su solución.',
        'Pérdida de información causada por el uso indebido de las cuentas del conjunto o por la eliminación de datos hecha por sus propios usuarios.',
      ]} />
      <p>
        Este límite no aplica a los casos en que la ley no permite limitar la responsabilidad, en particular el dolo y
        la culpa grave.
      </p>
    </LegalSection>

    <LegalSection title="11. Protección de datos personales">
      <p>
        Para los datos personales de los residentes y demás titulares del conjunto, <strong>el conjunto actúa como
        Responsable del Tratamiento y PQRS Services como Encargado</strong>, en los términos de la Ley 1581 de 2012 y
        el Decreto 1074 de 2015. Las obligaciones de cada parte, las medidas de seguridad, la gestión de incidentes y
        la devolución o eliminación de la información están en la{' '}
        <a href="/legal/privacidad" style={linkStyle}>política de tratamiento de datos</a>, que incluye el acuerdo de
        encargo y hace parte integral de este contrato.
      </p>
    </LegalSection>

    <LegalSection title="12. Confidencialidad">
      <p>
        Cada parte se obliga a mantener reserva sobre la información no pública de la otra a la que acceda con ocasión
        del contrato, y a usarla solo para ejecutarlo. Esta obligación permanece vigente por dos años después de
        terminar la relación.
      </p>
    </LegalSection>

    <LegalSection title="13. Vigencia y terminación">
      <p>
        El contrato rige por el plazo indicado en la orden de servicio o contrato firmado. Puede ser de uno o varios
        años y, para efectos de precio, renovación y terminación, se organiza en periodos anuales de servicio. La
        periodicidad del cobro —mensual manual, mensual automática o anual anticipada— <strong>no modifica ni reduce
        el plazo contratado</strong>.
      </p>
      <p>
        La renovación automática del contrato solo opera si fue pactada expresamente. En caso contrario, las partes
        acordarán la renovación por escrito. Cuando exista renovación automática, cualquiera de las partes puede
        comunicar su decisión de no renovar con al menos <strong>{LEGAL_NON_RENEWAL_NOTICE_DAYS} días
        calendario</strong> de anticipación al vencimiento del periodo en curso, salvo que la orden establezca un plazo
        distinto.
      </p>
      <p>
        La terminación antes del vencimiento se rige por la <a href="/legal/pagos" style={linkStyle}>política de
        pagos</a>. Desactivar un cobro automático no termina por sí mismo el contrato ni extingue valores ya causados.
      </p>
      <p>
        Podemos terminar el contrato de forma anticipada por falta de pago sostenida o por incumplimiento grave de la
        sección 8, previo requerimiento y oportunidad razonable de subsanar cuando el incumplimiento sea corregible.
        Al terminar, el conjunto puede solicitar la exportación de su
        información dentro de los <strong>30 días calendario</strong> siguientes, después de los cuales procederemos a
        su eliminación conforme a la política de privacidad.
      </p>
    </LegalSection>

    <LegalSection title="14. Cambios en estas condiciones">
      <p>
        Podemos actualizar este documento por razones legales, de seguridad u operativas. Los cambios relevantes se
        comunicarán al correo del administrador con al menos {LEGAL_PRICE_CHANGE_NOTICE_DAYS} días calendario de
        anticipación y se publicará la nueva versión con su fecha de vigencia. Un cambio general no altera de forma
        retroactiva el precio, el plazo ni un beneficio comercial pactado para el periodo anual en curso. Cuando una
        modificación requiera aceptación expresa, se solicitará antes de aplicarla.
      </p>
    </LegalSection>

    <LegalSection title="15. Ley aplicable y solución de controversias">
      <p>
        Este contrato se rige por las leyes de la República de Colombia. Las partes intentarán resolver cualquier
        diferencia de forma directa dentro de los 30 días calendario siguientes a la comunicación escrita del
        reclamo. Si no se logra un acuerdo, la controversia se someterá a los jueces de la República competentes en{' '}
        {legal.city}.
      </p>
      <p>
        Para cualquier solicitud escribe a{' '}
        <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a>.
      </p>
    </LegalSection>
  </LegalLayout>;
}

const linkStyle = { color: '#122545', fontWeight: 700 } as const;
