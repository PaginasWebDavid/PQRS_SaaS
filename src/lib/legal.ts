export const LEGAL_PATHS = {
  index: '/legal',
  terms: '/legal/terminos',
  privacy: '/legal/privacidad',
  cookies: '/legal/cookies',
  payments: '/legal/pagos',
} as const;

// Version de los documentos legales. Se guarda en User.termsVersion /
// User.privacyVersion cuando alguien acepta una invitacion, asi que es la
// prueba de QUE texto acepto cada usuario. Subirla cuando el contenido cambie
// de forma material: si no, el registro de aceptacion apunta al texto viejo.
//   1.0 -> borrador inicial, delegaba todo a "el contrato" (nunca publicado).
//   2.0 -> documentos autosuficientes: limite de responsabilidad, ley
//          aplicable, reembolsos, y acuerdo de encargo de datos (Ley 1581).
//   2.1 -> modalidad de pago anual con descuento, y regla de reembolso al
//          cancelar una anualidad antes de cumplir los doce meses.
//   3.0 -> separa el plazo contractual de la periodicidad de cobro, reconoce
//          la orden/contrato firmado y regula no renovacion y salida anticipada.
export const LEGAL_DOCUMENT_VERSION = '3.0';

// Topes contractuales que tambien viven en codigo. Se declaran aca para que el
// texto legal y el comportamiento real no puedan divergir en silencio.
export const LEGAL_MIN_GRACE_DAYS = 5;
export const LEGAL_TRIAL_DAYS = 15;
export const LEGAL_PRICE_CHANGE_NOTICE_DAYS = 30;
export const LEGAL_LIABILITY_CAP_MONTHS = 3;
export const LEGAL_NON_RENEWAL_NOTICE_DAYS = 30;
export const LEGAL_EARLY_TERMINATION_CAP_MONTHS = 2;

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Acepta 'YYYY-MM-DD' y lo vuelve legible en espanol. Si llega cualquier otra
// cosa se devuelve tal cual: es preferible mostrar el valor crudo que romper
// una pagina publica por un formato inesperado.
function formatEffectiveDate(raw: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;
  const [, year, month, day] = match;
  const monthName = MONTHS_ES[Number(month) - 1];
  if (!monthName) return raw;
  return `${Number(day)} de ${monthName} de ${year}`;
}

export function getLegalConfig() {
  const legalName = process.env.NEXT_PUBLIC_LEGAL_NAME?.trim() || '';
  const idType = process.env.NEXT_PUBLIC_LEGAL_ID_TYPE?.trim().toUpperCase() === 'CC' ? 'CC' : 'NIT';
  const nit = process.env.NEXT_PUBLIC_LEGAL_NIT?.trim() || '';
  const address = process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim() || '';
  const city = process.env.NEXT_PUBLIC_LEGAL_CITY?.trim() || 'Bogotá, Colombia';
  const phone = process.env.NEXT_PUBLIC_LEGAL_PHONE?.trim() || '';
  const supportEmail = process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL?.trim() || 'hola@pqrsservices.com';
  const privacyEmail = process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL?.trim() || supportEmail;
  const effectiveDateRaw = process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE?.trim() || '';
  // Sale del RUT (casilla 53). Cambia como se redacta el IVA en la politica de
  // pagos, asi que se modela explicito en vez de asumir un caso.
  const isVatResponsible = process.env.NEXT_PUBLIC_LEGAL_VAT_STATUS?.trim().toLowerCase() === 'responsable';

  return {
    brandName: 'PQRS Services',
    legalName,
    idType,
    idLabel: idType === 'CC' ? 'C.C.' : 'NIT',
    nit,
    address,
    city,
    phone,
    supportEmail,
    privacyEmail,
    effectiveDate: effectiveDateRaw ? formatEffectiveDate(effectiveDateRaw) : '',
    isVatResponsible,
    isComplete: Boolean(legalName && nit && address && effectiveDateRaw),
  };
}
