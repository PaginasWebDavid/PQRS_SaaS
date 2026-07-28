# FASE 2U - Informe previsto de commit del outbox durable

## 1. Objetivo

Empaquetar en un unico commit local la subfase aprobada del outbox durable de notificaciones y emails, sin modificar implementacion, pruebas, schema, migracion ni documentos 01 a 10.

## 2. HEAD inicial

`b924f64 feat(billing): make overdue cron atomic and concurrency-safe`

No existe un commit posterior y el indice esta vacio antes del staging.

## 3. Verificacion del working tree

Los cambios pendientes corresponden exclusivamente al schema y migracion del outbox, cinco archivos de implementacion, tres archivos de pruebas y los documentos tecnicos 01 a 12 de esta carpeta. No se detectaron cambios inesperados ni archivos ajenos que impidan aislar el commit mediante staging explicito. `git diff --check` no presenta errores; solo advertencias historicas LF/CRLF.

## 4. Veredicto previo

`APROBADA CON CONDICION OPERATIVA`

La condicion no bloquea crear este commit local.

## 5. Condicion operativa

Este commit no declara el sistema listo para producción. Antes del despliegue se requiere una base de pruebas físicamente separada, una suite completa verde 359/359 en infraestructura estable y la aplicación controlada de la migración.

No se intentara resolver esa condicion durante esta fase.

## 6. Archivos autorizados

- Schema y migracion: `prisma/schema.prisma`; `prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql`.
- Implementacion: `src/domains/billing/billing.service.ts`; `src/domains/billing/billing-outbox-policy.ts`; `src/domains/billing/billing-outbox.service.ts`; `src/domains/notifications/notification.service.ts`; `src/lib/email.ts`.
- Pruebas: `tests/unit/billing-outbox-policy.test.ts`; `tests/billing-outbox-idempotency.test.ts`; `tests/billing-cron-atomicity.test.ts`.
- Documentacion: documentos 01 a 12 de `docs/programa-mejora/05-notificaciones-email-idempotencia/`.

## 7. Archivos excluidos

Se excluyen `.env`, `.env.test`, `package.json`, `package-lock.json`, migraciones historicas, documentos de otras fases, archivos generados, logs, dumps, capturas, resultados de pruebas, temporales, configuracion local y cambios ajenos.

## 8. Revision de secretos

La revision previa del conjunto autorizado no encontro contrasenas, connection strings, claves reales de Supabase, service-role keys, JWT secrets, `CRON_SECRET`, tokens de Mercado Pago, firmas HMAC, payloads reales ni contenido de `.env.test`. Solo se identificaron valores ficticios de Resend marcados para pruebas y correos de fixtures en dominios controlados. La inspeccion del staged diff debe confirmar nuevamente este resultado antes del commit.

## 9. Staging explicito planeado

```text
git add -- prisma/schema.prisma
git add -- prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql
git add -- src/domains/billing/billing.service.ts
git add -- src/domains/billing/billing-outbox-policy.ts
git add -- src/domains/billing/billing-outbox.service.ts
git add -- src/domains/notifications/notification.service.ts
git add -- src/lib/email.ts
git add -- tests/unit/billing-outbox-policy.test.ts
git add -- tests/billing-outbox-idempotency.test.ts
git add -- tests/billing-cron-atomicity.test.ts
git add -- docs/programa-mejora/05-notificaciones-email-idempotencia
```

No se usara staging global.

## 10. Mensaje exacto

`feat(billing): add durable notification outbox`

Se creara exactamente un commit local, sin amend.

## 11. No push

No se ejecutara `git push`.

## 12. No tags

No se crearan tags.

## 13. Nota sobre el hash final

El hash final se informa únicamente en la respuesta de la sesión para evitar modificar el commit que contiene este documento.
