import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';
// El porcentaje anual sale de la misma constante que usa el cobro, para que
// el contrato no pueda prometer un descuento distinto al que aplica el sistema.
import { ANNUAL_DISCOUNT_BPS, bpsToPercent } from '@/domains/commercial/commercial-policy.constants';
import {
  LEGAL_EARLY_TERMINATION_CAP_MONTHS,
  LEGAL_MIN_GRACE_DAYS,
  LEGAL_NON_RENEWAL_NOTICE_DAYS,
  LEGAL_PRICE_CHANGE_NOTICE_DAYS,
  LEGAL_TRIAL_DAYS,
  getLegalConfig,
} from '@/lib/legal';

export default function PaymentsPage() {
  const legal = getLegalConfig();

  return <LegalLayout
    title="Pagos, renovación y cancelación"
    intro="Estas reglas complementan la propuesta, orden de servicio o contrato firmado y separan el plazo contratado de la forma elegida para pagar."
  >
    <LegalSection title="1. Precio">
      <p>
        La tarifa depende del número de unidades y del alcance contratado. Se informa en la propuesta u orden de
        servicio antes de la firma y se refleja en <em>Licencias y pagos</em>. No se cobra un concepto que no haya sido
        informado y aceptado previamente.
      </p>
      <p>
        {legal.isVatResponsible
          ? 'Los precios mostrados no incluyen IVA, salvo indicación expresa. El impuesto se liquida y se discrimina en la factura conforme a la ley.'
          : 'A la fecha de vigencia de este documento el prestador no es responsable de IVA, por lo que el valor mostrado es el total a pagar. Si esa condición cambia, se informará antes de aplicar el impuesto.'}
      </p>
      <p>
        Si el conjunto solicita cambiar su número de unidades o módulos, la nueva tarifa aplica desde la fecha o el
        periodo acordado por escrito, nunca de forma retroactiva.
      </p>
    </LegalSection>

    <LegalSection title="2. Periodo de prueba">
      <p>
        Un conjunto tendrá prueba gratuita de <strong>{LEGAL_TRIAL_DAYS} días calendario</strong> únicamente cuando
        esa condición aparezca en su propuesta, orden o cuenta. La prueba no genera cobros automáticos y no constituye
        un derecho automático para todas las contrataciones.
      </p>
      <p>
        Cuando se acuerde un piloto pagado con duración, acompañamiento, alcance o implementación particular, esas
        condiciones se informan por escrito antes del cobro y prevalecen para ese conjunto.
      </p>
    </LegalSection>

    <LegalSection title="3. Modalidades de pago y renovación automática">
      <p>
        El plazo del contrato y la periodicidad del pago son conceptos distintos. El conjunto puede cumplir el precio
        contratado mediante una de estas modalidades, definida por escrito antes del primer cobro:
      </p>
      <LegalList items={[
        'Mensual manual: el conjunto realiza cada pago por el canal autorizado y la plataforma lo registra o concilia.',
        'Mensual automática: Wompi cobra cada mensualidad al medio de pago autorizado por el conjunto.',
        `Anual anticipada: se pagan doce (12) mensualidades por adelantado con un descuento del ${bpsToPercent(ANNUAL_DISCOUNT_BPS)} % sobre la tarifa mensual de lista y se obtiene cobertura por doce meses.`,
      ]} />
      <p>
        El cobro recurrente solo se activa cuando el ADMIN lo autoriza expresamente en la pantalla de Wompi. Elegir
        pago manual o anual anticipado no autoriza débitos automáticos. La plataforma no almacena el número completo ni
        el código de seguridad de la tarjeta.
      </p>
      <LegalList items={[
        'Quien elija cobro automático debe mantener un medio de pago válido y con fondos suficientes.',
        'La fecha del siguiente cobro se muestra siempre en la sección Licencias y pagos.',
        'En la modalidad anual se avisa al correo del administrador antes de la renovación, para que pueda decidir con tiempo.',
        'El conjunto puede revocar el cobro automático desde la plataforma. Desde ese momento deberá pagar por otro medio autorizado mientras el contrato siga vigente.',
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

    <LegalSection title="5. No renovación y terminación anticipada">
      <p>
        Para no renovar al vencimiento, el representante autorizado debe escribir a{' '}
        <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a> con al menos{' '}
        <strong>{LEGAL_NON_RENEWAL_NOTICE_DAYS} días calendario</strong> de anticipación, salvo que la orden de servicio
        establezca otro plazo. La solicitud debe identificar el conjunto y la fecha de terminación deseada.
      </p>
      <LegalList items={[
        'La no renovación o terminación confirmada detiene cobros posteriores a la fecha efectiva.',
        'Revocar el débito automático no termina el contrato ni elimina obligaciones ya causadas; solo cambia el mecanismo de cobro.',
        `Si el pago es mensual y la orden otorgó un beneficio económico sustancial a cambio de permanencia, la terminación anticipada sin causa podrá generar una compensación limitada al menor valor entre ${LEGAL_EARLY_TERMINATION_CAP_MONTHS} mensualidades netas y las mensualidades pendientes del periodo anual de servicio en curso. La compensación debe estar indicada expresamente en la orden; si no lo está, no se presume.`,
        'Cada año de un contrato multianual se trata como un periodo anual de servicio para calcular renovaciones, ajustes y una eventual terminación anticipada.',
        'Si la terminación se debe a un incumplimiento grave y no subsanado de PQRS Services, no se aplica compensación y procede el reembolso proporcional de saldos pagados no prestados.',
        'Al terminar, el conjunto dispone de 30 días calendario para solicitar la exportación de su información antes de su eliminación, sin perjuicio de los datos que deban conservarse por ley.',
      ]} />
      <p>
        Si a la relación le resulta aplicable el Estatuto del Consumidor, cualquier permanencia mínima deberá constar
        expresamente, estar asociada a una ventaja sustancial y respetar el límite de un año y las demás condiciones del
        artículo 41 de la Ley 1480 de 2011. Cuando la ley lo exija, se ofrecerá también una alternativa sin permanencia
        mínima para que el cliente pueda comparar.
      </p>
    </LegalSection>

    <LegalSection title="6. Retracto y reembolsos">
      <p>
        <strong>Retracto cuando resulte legalmente aplicable.</strong> El conjunto puede solicitarlo dentro de los{' '}
        <strong>cinco (5) días hábiles</strong> siguientes al primer pago, comunicándolo a{' '}
        <a href={`mailto:${legal.supportEmail}`} style={linkStyle}>{legal.supportEmail}</a>. En ese caso se reembolsa
        el valor que corresponda conforme a la ley, el inicio efectivo del servicio y las condiciones particulares
        aceptadas. Esta cláusula no reduce derechos irrenunciables que resulten aplicables.
      </p>
      <p>
        <strong>Reembolsos por falla del servicio.</strong> Si por causa atribuible a nosotros el servicio permanece
        indisponible de forma continua por más de <strong>72 horas</strong> dentro de un mismo periodo facturado,
        el conjunto puede solicitar el reembolso proporcional a los días afectados.
      </p>
      <p>
        <strong>Terminación de una anualidad pagada.</strong> El conjunto puede mantener el servicio hasta el final del
        periodo cubierto o solicitar el reembolso de los <strong>meses completos no utilizados</strong>. Para calcular
        el reembolso, los meses completos ya consumidos se liquidan a la tarifa mensual de lista y se resta ese valor
        del pago recibido. No se acumula una compensación adicional por terminación sobre este mismo periodo y nunca se
        exige más de lo ya pagado por la anualidad.
      </p>
      <p>
        Fuera de estos casos, los periodos mensuales ya iniciados no son reembolsables. Cualquier reembolso está sujeto
        a las reglas operativas de la pasarela de pagos.
      </p>
    </LegalSection>

    <LegalSection title="7. Comprobantes y facturación">
      <p>
        Cada pago aprobado queda registrado en la plataforma con su fecha, valor, medio de pago y referencia, y es
        consultable y descargable por el administrador desde <em>Licencias y pagos</em>. El PDF generado por la
        plataforma es un <strong>comprobante operativo del pago y no equivale a una factura electrónica ni a un
        documento tributario</strong>. Si la normativa exige un documento tributario, se expedirá por el mecanismo
        habilitado para ese fin y se remitirá al correo de facturación registrado.
      </p>
    </LegalSection>

    <LegalSection title="8. Cambios de tarifa">
      <p>
        Todo cambio de precio se comunica al correo del administrador con al menos{' '}
        <strong>{LEGAL_PRICE_CHANGE_NOTICE_DAYS} días calendario</strong> de anticipación y solo aplica desde el
        siguiente periodo anual de servicio. Si el conjunto no lo acepta, puede comunicar la no renovación antes de
        que entre en vigor, sin perder el periodo ya pagado. Un cambio de unidades, módulos, impuestos o un acuerdo
        escrito puede producir un ajuste distinto en la fecha pactada.
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

    <LegalSection title="10. Prevalencia de la orden de servicio">
      <p>
        La propuesta, orden de servicio o contrato firmado define las condiciones particulares del conjunto. Si existe
        una diferencia con esta política, prevalece ese documento respecto del plazo, precio, alcance, forma de pago,
        beneficios de permanencia y fechas expresamente negociadas. Ninguna pantalla de la plataforma modifica por sí
        sola una condición contractual firmada.
      </p>
    </LegalSection>
  </LegalLayout>;
}

const linkStyle = { color: '#122545', fontWeight: 700 } as const;
