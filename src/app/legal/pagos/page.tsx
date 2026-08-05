import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';
// El porcentaje anual sale de la misma constante que usa el cobro, para que
// el contrato no pueda prometer un descuento distinto al que aplica el sistema.
import { ANNUAL_DISCOUNT_BPS, bpsToPercent } from '@/domains/commercial/commercial-policy.constants';
import {
  LEGAL_MIN_GRACE_DAYS,
  LEGAL_PRICE_CHANGE_NOTICE_DAYS,
  LEGAL_TRIAL_DAYS,
  getLegalConfig,
} from '@/lib/legal';

export default function PaymentsPage() {
  const legal = getLegalConfig();

  return <LegalLayout
    title="Pagos, renovación y cancelación"
    intro="Las reglas de cobro del servicio. Este documento hace parte integral de los términos y condiciones y aplica a todo conjunto que contrate una suscripción."
  >
    <LegalSection title="1. Precio">
      <p>
        La tarifa depende del número de unidades del conjunto y se muestra antes de confirmar la suscripción, así como
        en la sección <em>Licencias y pagos</em> de la cuenta. Nunca se cobra un concepto que no haya sido informado
        previamente en pantalla.
      </p>
      <p>
        {legal.isVatResponsible
          ? 'Los precios mostrados no incluyen IVA, salvo indicación expresa. El impuesto se liquida y se discrimina en la factura conforme a la ley.'
          : 'A la fecha de vigencia de este documento el prestador no es responsable de IVA, por lo que el valor mostrado es el total a pagar. Si esa condición cambia, se informará antes de aplicar el impuesto.'}
      </p>
      <p>
        Si el conjunto cambia su número de unidades, la nueva tarifa aplica a partir del siguiente periodo de
        facturación, no de forma retroactiva.
      </p>
    </LegalSection>

    <LegalSection title="2. Periodo de prueba">
      <p>
        Los conjuntos nuevos cuentan con un periodo de prueba de <strong>{LEGAL_TRIAL_DAYS} días calendario</strong>{' '}
        sin costo y sin necesidad de registrar un medio de pago. Al terminar, el acceso se suspende salvo que se
        active una suscripción. Durante la prueba no se genera ningún cobro automático.
      </p>
      <p>
        Cuando se acuerde un plan piloto pagado con condiciones particulares —duración, acompañamiento o
        implementación asistida— esas condiciones se informan por escrito antes del cobro y prevalecen sobre esta
        sección para ese conjunto.
      </p>
    </LegalSection>

    <LegalSection title="3. Modalidades de pago y renovación automática">
      <p>
        El conjunto puede pagar en dos modalidades, que se acuerdan por escrito antes del primer cobro:
      </p>
      <LegalList items={[
        'Mensual: se cobra el valor vigente cada periodo de treinta (30) días.',
        `Anual: se cobran doce (12) meses por anticipado con un descuento del ${bpsToPercent(ANNUAL_DISCOUNT_BPS)} % sobre la tarifa de lista. La cobertura va desde el pago y por doce meses.`,
      ]} />
      <p>
        Al activar la suscripción, el conjunto autoriza el <strong>cobro automático recurrente</strong> del valor
        vigente, según la modalidad contratada, sobre el medio de pago registrado, hasta que solicite la cancelación.
        La autorización se otorga de forma expresa en la pantalla de configuración del pago automático.
      </p>
      <LegalList items={[
        'El conjunto debe mantener un medio de pago válido y con fondos suficientes.',
        'La fecha del siguiente cobro se muestra siempre en la sección Licencias y pagos.',
        'En la modalidad anual se avisa al correo del administrador antes de la renovación, para que pueda decidir con tiempo.',
        'El conjunto puede desactivar el cobro automático en cualquier momento desde esa misma sección, sin llamar ni escribir a nadie.',
        'El descuento anual no es acumulable con otros descuentos comerciales sobre el mismo periodo.',
        'Los datos de la tarjeta se procesan directamente en la pasarela de pagos y no se almacenan en nuestros servidores.',
      ]} />
    </LegalSection>

    <LegalSection title="4. Pago rechazado, periodo de gracia y suspensión">
      <p>
        Si un cobro es rechazado, se informa al administrador por correo y en la plataforma, con la causa reportada por
        la pasarela y la opción de actualizar el medio de pago.
      </p>
      <LegalList items={[
        `A partir del rechazo se abre un periodo de gracia no inferior a ${LEGAL_MIN_GRACE_DAYS} días calendario para regularizar la cuenta, durante el cual el servicio sigue funcionando con normalidad.`,
        'Si al terminar la gracia la cuenta sigue en mora, el acceso se suspende.',
        'La suspensión bloquea el acceso, pero no elimina la información del conjunto.',
        'Al regularizar el pago, el acceso se restablece con toda la información intacta.',
      ]} />
      <p>
        Podemos ampliar el periodo de gracia, nunca reducirlo por debajo de {LEGAL_MIN_GRACE_DAYS} días sin comunicarlo
        con {LEGAL_PRICE_CHANGE_NOTICE_DAYS} días calendario de anticipación.
      </p>
    </LegalSection>

    <LegalSection title="5. Cancelación">
      <p>
        El administrador puede cancelar en cualquier momento, sin penalidad y sin permanencia mínima, desde la sección{' '}
        <em>Licencias y pagos</em> o escribiendo a{' '}
        <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a> desde el correo registrado
        como administrador.
      </p>
      <LegalList items={[
        'La cancelación detiene las renovaciones futuras.',
        'El servicio permanece activo hasta el final del periodo ya pagado.',
        'No se reversan de forma automática los cobros de periodos ya iniciados, salvo los casos de la sección 6.',
        'Tras la cancelación, el conjunto dispone de 30 días calendario para solicitar la exportación de su información antes de su eliminación.',
      ]} />
    </LegalSection>

    <LegalSection title="6. Retracto y reembolsos">
      <p>
        <strong>Retracto.</strong> El conjunto puede retractarse de su primera suscripción dentro de los{' '}
        <strong>cinco (5) días hábiles</strong> siguientes al primer pago, comunicándolo a{' '}
        <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a>. En ese caso se reembolsa
        el 100% de lo pagado por ese periodo, por el mismo medio de pago, dentro de los treinta (30) días calendario
        siguientes, conforme al Estatuto del Consumidor.
      </p>
      <p>
        <strong>Reembolsos por falla del servicio.</strong> Si por causa atribuible a nosotros el servicio permanece
        indisponible de forma continua por más de <strong>72 horas</strong> dentro de un mismo periodo facturado,
        el conjunto puede solicitar el reembolso proporcional a los días afectados.
      </p>
      <p>
        <strong>Cancelación de un plan anual.</strong> Si el conjunto cancela antes de terminar los doce meses
        pagados, puede elegir entre mantener el servicio activo hasta el final del periodo ya pagado, o solicitar el
        reembolso de los <strong>meses completos no utilizados</strong>. En el segundo caso, los meses ya consumidos se
        liquidan a la tarifa mensual de lista, porque el descuento anual se otorga a cambio de la permanencia de doce
        meses. Nunca se cobra más de lo que el conjunto ya había pagado.
      </p>
      <p>
        Fuera de estos casos, los periodos mensuales ya iniciados no son reembolsables. Cualquier reembolso está sujeto
        a las reglas operativas de la pasarela de pagos.
      </p>
    </LegalSection>

    <LegalSection title="7. Comprobantes y facturación">
      <p>
        Cada pago aprobado queda registrado en la plataforma con su fecha, valor, medio de pago y referencia, y es
        consultable y descargable por el administrador desde <em>Licencias y pagos</em>. El documento tributario que
        corresponda se expide conforme a la normativa vigente y se remite al correo de facturación registrado.
      </p>
    </LegalSection>

    <LegalSection title="8. Cambios de tarifa">
      <p>
        Todo cambio de precio se comunica al correo del administrador con al menos{' '}
        <strong>{LEGAL_PRICE_CHANGE_NOTICE_DAYS} días calendario</strong> de anticipación y solo aplica desde el
        siguiente periodo. Si el conjunto no lo acepta, puede cancelar antes de que entre en vigor, sin penalidad y sin
        perder el periodo ya pagado.
      </p>
    </LegalSection>

    <LegalSection title="9. Reclamos sobre un cobro">
      <p>
        Para revisar un cobro, escribe a{' '}
        <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a> con el nombre del conjunto,
        la fecha, el valor y la referencia del pago. Respondemos dentro de los quince (15) días hábiles siguientes.
      </p>
      <p>
        <strong>Nunca envíes contraseñas, códigos de seguridad ni el número completo de una tarjeta.</strong> No te los
        vamos a pedir por ningún canal.
      </p>
    </LegalSection>
  </LegalLayout>;
}

const linkStyle = { color: '#122545', fontWeight: 700 } as const;
