# Integracion frontend, backend y persistencia

## Conectado y persistente

- Overview: `GET /api/platform/super-admin` -> Prisma/servicios.
- Crear conjunto: transaccion crea tenant, suscripcion y `AuditLog`; invitacion se crea despues (`tenant-admin.service.ts:120-197`).
- Reglas y topes: Prisma + `AuditLog`.
- Soporte: respuesta crea auditoria, notificacion y `EmailLog` mediante `sendEmailSafe` (`support-ticket.service.ts:94-119`).
- Configuracion: `PlatformSetting` y auditoria; secretos referenciados de forma segura.

## SA-001 - Persistencia inconsistente de estados

Las mutaciones persisten, pero en tablas incompatibles: renovar persiste ACTIVE solo en `Subscription`; suspender/reactivar persiste solo en `Tenant`. La persistencia no equivale a consistencia funcional.

## SA-003 - Persistencia incompleta de unidades

Guardar unidades actualiza tenant sin snapshot ni precio de suscripcion. Un refresh conserva la inconsistencia.

## SA-005 - Integracion de detalle no consumida

Existe `getTenantDetailForSuperAdmin`, con usuarios, pagos y PQRS, pero la UI no dispara `GET ?tenantId=...`. El boton Ver muestra datos locales reducidos.

## Emails e integraciones

Resend no bloquea el flujo y registra resultado. El estado "conectado" significa variables presentes, no prueba de conectividad; `lastVerifiedAt` es siempre `null` (`platform-setting.service.ts:82-101`). El boton de correo de prueba es la unica verificacion activa.
