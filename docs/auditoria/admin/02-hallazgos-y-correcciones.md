# Auditoría ADMIN: Hallazgos y Correcciones

## Correcciones aplicadas

### Seguridad de invitaciones

- `src/domains/organizations/invitation.service.ts` valida correo, rechaza cuentas activas globales y rechaza cualquier `SUPER_ADMIN` existente.
- La aceptación reclama la invitación con una actualización condicional `PENDING + expiresAt`, evitando reutilización por carrera.
- `src/app/api/users/route.ts`, `src/app/api/invitations/route.ts` y resend devuelven solo campos seguros; nunca `tokenHash` ni URL portadora del token.

### Archivos y SSRF

- `src/app/api/pqrs/[id]/route.ts` ya no persiste `evidenciaArchivoUrl` ni `evidenciaArchivoPath` enviados por el navegador.
- Las rutas de descarga usan únicamente el `storagePath` generado por servidor o datos ya persistidos. Una URL legado sin almacenamiento interno se responde como no disponible, sin hacer `fetch` arbitrario.

### Validación y navegación

- `src/app/api/pqrs/route.ts` valida estados, asuntos, año, bloque, apartamento, número, descripción y ubicación.
- `src/app/api/reportes/route.ts` y `src/domains/pqrs/reportes.service.ts` validan periodo, granularidad, enums y bloque.
- Se agregaron páginas de redirección para rutas heredadas protegidas, evitando 404 de navegación.

### Facturación y disponibilidad

- `src/app/api/billing/checkout/route.ts` acepta una `backUrl` absoluta o relativa sin concatenarla de forma inválida.
- `src/domains/billing/mercado-pago.service.ts` limita la URL al origen de la aplicación y falla cerrado si falta el secreto de firma del webhook.
- Desactivar renovación automática ya no marca el estado local si Mercado Pago no confirma la cancelación.

### Correos y operación

- `src/lib/email.ts` añade timeout de 10 segundos para Resend y conserva el registro de fallo en `EmailLog`.
- La carga masiva de invitaciones rechaza archivos mayores de 2 MB.
- `src/domains/organizations/user-management.service.ts` impide desactivar o cambiar el rol del último ADMIN activo.
- `AdminShell` deja de usar nombre, conjunto y licencia falsos como fallback; muestra estados de carga/error y consulta `/api/me`.

## Cambios preexistentes integrados

El worktree ya contenía cambios del usuario/Claude sobre configuración y auditoría de tenant. Se conservaron y se verificaron junto con esta auditoría:

- `src/domains/organizations/tenant.service.ts`
- `src/app/api/tenant/route.ts`
- `src/app/admin/configuracion/page.tsx`
- `src/app/api/actividad/route.ts`
- `tests/phase2-flows.test.ts`
