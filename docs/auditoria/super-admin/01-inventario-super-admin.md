# Inventario de SUPER_ADMIN

## Pagina y navegacion

| Elemento | Ubicacion | Datos/accion |
|---|---|---|
| Ruta principal | `src/app/(protected)/super-admin/page.tsx` | SPA cliente, 1.800 lineas aprox. |
| Guard de ruta | `src/middleware.ts:38-40` | Solo `SUPER_ADMIN`. |
| Guard de layout | `src/app/(protected)/layout.tsx:15-37` | Sesion y acceso de tenant; SUPER_ADMIN queda exento del bloqueo de tenant. |
| Shell | `src/components/shell/SuperAdminShell.tsx` | Navegacion interna y logout. |

La pagina usa pestañas internas, no rutas individuales: Resumen, Conjuntos, Licencias y pagos, Reglas de precio, Analytics, Usuarios, Auditoria, Soporte y Configuracion.

## APIs utilizadas

| API | Metodos | Uso |
|---|---|---|
| `/api/platform/super-admin` | GET, POST | Overview, conjuntos, licencias, precios, mora. |
| `/api/platform/analytics` | GET | Series y analitica. |
| `/api/platform/tenant-users` | GET | Usuarios de un conjunto elegido. |
| `/api/platform/audit-log` | GET | Auditoria paginada. |
| `/api/platform/support-tickets` | GET, POST | Bandeja y respuesta de soporte. |
| `/api/platform/general-settings` | GET, POST | Nombre, SLA, flags y correo de prueba. |
| `/api/platform/settings` | GET | Estado seguro de integraciones; no es consumida por la pagina actual. |

## Modelos y servicios

- Modelos: `Tenant`, `User`, `Subscription`, `Payment`, `PricingRule`, `AuditLog`, `PlatformSetting`, `SupportTicket`, `Invitation`, `Notification`, `EmailLog` en `prisma/schema.prisma`.
- Servicios: `tenant-admin.service.ts`, `super-admin.service.ts`, `platform-stats.service.ts`, `billing.service.ts`, `analytics.service.ts`, `audit.service.ts`, `support-ticket.service.ts`, `platform-setting.service.ts`.

## Flujo disponible

Crear conjunto -> crear suscripcion `PENDING_PAYMENT` -> crear invitacion ADMIN -> auditoria. El panel tambien permite editar/suspender/reactivar/cancelar conjunto, renovar con pago simulado, ejecutar mora, administrar reglas, consultar datos, responder soporte y configurar flags.

## Dependencias

NextAuth JWT, Prisma/PostgreSQL/Supabase, Resend, Mercado Pago, Supabase Storage. La sesion JWT vuelve a consultar el usuario en base de datos en `src/lib/auth.ts:51-78`.
