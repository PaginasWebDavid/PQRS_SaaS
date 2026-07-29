-- R1B: una cortesia concede acceso, pero no representa un pago.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'COURTESY';
ALTER TYPE "BillingOutboxEventType" ADD VALUE IF NOT EXISTS 'COURTESY_EXTENSION_GRANTED';