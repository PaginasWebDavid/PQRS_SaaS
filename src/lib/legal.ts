export const LEGAL_PATHS = {
  index: '/legal',
  terms: '/legal/terminos',
  privacy: '/legal/privacidad',
  cookies: '/legal/cookies',
  payments: '/legal/pagos',
} as const;

export const LEGAL_DOCUMENT_VERSION = '1.0';

export function getLegalConfig() {
  const legalName = process.env.NEXT_PUBLIC_LEGAL_NAME?.trim() || '';
  const nit = process.env.NEXT_PUBLIC_LEGAL_NIT?.trim() || '';
  const address = process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim() || '';
  const city = process.env.NEXT_PUBLIC_LEGAL_CITY?.trim() || 'Bogota, Colombia';
  const supportEmail = process.env.NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL?.trim() || 'hola@pqrsservices.com';
  const privacyEmail = process.env.NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL?.trim() || supportEmail;
  const effectiveDate = process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE?.trim() || '';

  return {
    brandName: 'PQRS Services', legalName, nit, address, city, supportEmail, privacyEmail, effectiveDate,
    isComplete: Boolean(legalName && nit && address && effectiveDate),
  };
}
