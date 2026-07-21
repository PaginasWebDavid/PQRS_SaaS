import { LegalLayout, LegalList, LegalSection } from '@/components/legal/LegalLayout';

export default function PaymentsPage() {
  return <LegalLayout title="Pagos, renovación y cancelación" intro="Estas son las reglas operativas que deben aparecer antes de que un conjunto confirme una suscripción mensual.">
    <LegalSection title="1. Precio y alcance"><p>El precio aplicable es el que se muestra en la propuesta comercial o en la pantalla de checkout antes del pago. Puede depender del número de unidades, los módulos contratados y las condiciones particulares del conjunto. No se debe cobrar un concepto que no haya sido informado previamente.</p></LegalSection>
    <LegalSection title="2. Cobro mensual"><p>Cuando el conjunto confirma una suscripción, el medio de pago autorizado procesa el cobro según la frecuencia y las condiciones mostradas. El conjunto debe mantener un medio de pago válido y autorizado.</p></LegalSection>
    <LegalSection title="3. Fallo de pago y suspensión"><LegalList items={['Un pago rechazado debe mostrar un mensaje claro y permitir actualizar el medio de pago.', 'Durante el periodo de gracia que figure en el contrato, el conjunto puede regularizar la cuenta.', 'Si la deuda continúa, el acceso puede suspenderse de acuerdo con el contrato.', 'La suspensión no autoriza a borrar arbitrariamente la información del conjunto.']} /></LegalSection>
    <LegalSection title="4. Cancelación"><p>El administrador puede solicitar la cancelación por el canal definido en su contrato. La solicitud debe indicar el conjunto, la cuenta administradora y la fecha deseada. La cancelación detiene renovaciones futuras, pero no necesariamente reversa cobros ya procesados.</p></LegalSection>
    <LegalSection title="5. Reembolsos y comprobantes"><p>Los reembolsos, ajustes y comprobantes se gestionan conforme al contrato, la normativa aplicable y las reglas del medio de pago. La plataforma debe entregar al cliente el comprobante o documento tributario que corresponda.</p></LegalSection>
    <LegalSection title="6. Soporte"><p>Para revisar un cobro, envía el nombre del conjunto, fecha, valor y referencia de pago al canal de soporte. Nunca envíes contraseñas, tokens ni datos completos de tarjetas.</p></LegalSection>
  </LegalLayout>;
}
