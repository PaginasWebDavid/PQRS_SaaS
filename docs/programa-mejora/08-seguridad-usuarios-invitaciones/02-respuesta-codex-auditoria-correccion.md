# FASE 5A - Respuesta de auditoria y correccion

## 1. Vulnerabilidades

- Rutas administrativas confiaban parcialmente en rol y tenant del JWT.
- SUPER_ADMIN no tenia una superficie uniforme con target obligatorio.
- Respuestas de creacion y reenvio exponian `invitationUrl`, que contenia el token completo.
- Errores de dominio, Prisma y Resend podian propagarse sin una lista blanca comun.
- La creacion duplicada no estaba serializada.
- Aceptar un token antiguo podia competir con un reenvio porque el CAS no comparaba el `tokenHash` vigente.
- Cancelacion y reenvio hacian lectura y escritura separadas sin lock de fila.
- Los errores HTTP de Resend se guardaban con el cuerpo completo del proveedor.
- Emails dinamicos de invitacion y confirmacion no escapaban consistentemente nombre y conjunto.
- Bulk invite ignoraba filas invalidas, admitia hasta 500 destinatarios y no distinguia invitacion creada de correo enviado.
- Mutaciones de usuarios consultaban `id + tenantId`, pero escribian finalmente solo por `id`.
- Onboarding usaba claims de sesion y persistia tenant/usuario en operaciones separadas.

## 2. Correcciones

- Todas las rutas de usuarios e invitaciones usan la capa comun de autorizacion.
- ADMIN queda atado a su tenant; un target distinto se oculta como no encontrado.
- SUPER_ADMIN exige `tenantId` explicito y validado.
- CONSEJO y RESIDENTE quedan bloqueados de todas las operaciones administrativas.
- Se eliminaron tokens, hashes, URLs privadas, IDs del proveedor y errores internos de respuestas administrativas.
- Se agrego un mapper de errores por lista blanca y respuesta generica para fallos inesperados.
- Onboarding usa identidad vigente de base de datos y actualiza tenant, usuario y auditoria en una transaccion.

## 3. Matriz de permisos

| Rol | Listar | Invitar | Editar/activar/desactivar | Reenviar/cancelar |
| --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | Si, con target validado | Si, con target validado | Si, con target validado | Si, con target validado |
| `ADMIN` | Solo su tenant | Solo roles tenant | Solo su tenant | Solo su tenant |
| `CONSEJO` | No | No | No | No |
| `RESIDENTE` | No | No | No | No |

## 4. Seguridad de tokens

- Token aleatorio de 32 bytes con `crypto.randomBytes`.
- Solo el hash SHA-256 se almacena en `Invitation.tokenHash`.
- Longitud de entrada acotada.
- El token completo solo aparece en el enlace enviado al destinatario.
- No aparece en respuestas administrativas, auditoria, notificaciones ni EmailLog.
- Reenvio rota token y vencimiento; el token anterior deja de ser valido.
- Canceladas y aceptadas no pueden reactivarse.

## 5. Atomicidad y concurrencia

- Creacion usa `pg_advisory_xact_lock` por `tenantId + email normalizado`.
- Dos creaciones concurrentes producen una sola invitacion pendiente.
- Reenvio, cancelacion y aceptacion bloquean la fila con `FOR UPDATE`.
- Aceptacion reclama por `id + tokenHash + PENDING + expiresAt`.
- Usuario, estado ACCEPTED y AuditLog se crean en la misma transaccion.
- Un fallo de usuario revierte el claim y deja la invitacion PENDING.
- Dos aceptaciones concurrentes producen un usuario y un solo ACCEPTED.

## 6. Usuarios y roles

- Email normalizado con trim, NFKC, lowercase y dominio ASCII.
- La politica real sigue siendo email globalmente unico.
- Roles tenant permitidos: ADMIN, CONSEJO y RESIDENTE.
- SUPER_ADMIN nunca puede ser objetivo de invitacion o promocion tenant.
- PATCH no acepta cambio de tenant.
- Mutaciones escriben con `id + tenantId`.
- Auto-desactivacion y auto-degradacion de ADMIN quedan bloqueadas.
- El ultimo ADMIN activo queda protegido bajo locks transaccionales.
- Ubicacion solo se admite para RESIDENTE.
- Sesiones antiguas pierden permisos porque las rutas releen usuario, rol, actividad y tenant.

## 7. Bulk invite

- Maximo 100 correos por archivo.
- Solo `.xlsx` de hasta 2 MB.
- Primera columna validada completamente; solo se permite un encabezado reconocido.
- Emails normalizados y deduplicados.
- Tenant por fila no se acepta.
- SUPER_ADMIN no es un rol seleccionable.
- Atomicidad parcial explicita: cada fila es independiente.
- Respuesta distingue creadas, pendientes de email y fallidas con mensajes sanitizados.

## 8. Emails y errores

- Nombre del conjunto, rol y nombre de usuario se escapan antes de entrar en HTML.
- Saltos de linea se eliminan del asunto.
- Resend no guarda el cuerpo textual de errores; solo estado HTTP o mensaje controlado.
- Un fallo conocido de email deja la invitacion creada pero marcada en la respuesta como `sent: false`.
- La UI ya no muestra "reenviada" cuando el correo quedo pendiente.
- No hay reintento automatico ante entrega ambigua; un reenvio manual rota el token.

## 9. Archivos modificados

- `src/app/admin/invitaciones/page.tsx`
- `src/app/api/invitations/route.ts`
- `src/app/api/invitations/accept/route.ts`
- `src/app/api/invitations/bulk/route.ts`
- `src/app/api/invitations/[id]/resend/route.ts`
- `src/app/api/invitations/[id]/cancel/route.ts`
- `src/app/api/users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/api/onboarding/route.ts`
- `src/app/api/platform/super-admin/route.ts`
- `src/domains/organizations/invitation.service.ts`
- `src/domains/organizations/invitation-security.ts`
- `src/domains/organizations/user-management-access.ts`
- `src/domains/organizations/user-management-policy.ts`
- `src/domains/organizations/user-management.service.ts`
- `src/domains/organizations/user-management-error.ts`
- `src/domains/platform/tenant-admin.service.ts`
- `src/lib/email.ts`
- `tests/unit/user-invitation-security.test.ts`
- `tests/user-invitation-atomicity.test.ts`
- Documentos 01 y 02 de esta fase.

No se modificaron schema, migraciones, paquetes, PQRS ni billing.

## 10. Pruebas especificas

- Pruebas puras: 14/14 aprobadas.
- Primera ejecucion directa: bloqueada correctamente por `spawn EPERM` y luego por el guard que exige runner seguro.
- Pruebas PostgreSQL focalizadas tras corregir el advisory lock: 43/44; la unica falla detecto precedencia incorrecta para un token vencido.
- Repeticion exclusiva del archivo afectado despues de corregir precedencia: 9/9 aprobadas.
- Los casos finales cubren permisos, normalizacion, duplicados, token valido/vencido/cancelado/usado, dos aceptaciones concurrentes, rollback, rol/tenant almacenados, reenvio, cancelacion cross-tenant, ultimo ADMIN y camino autorizado.

## 11. Typecheck y lint

- `npx tsc --noEmit`: aprobado en el estado final.
- `npm run lint`: aprobado sin warnings ni errores en el estado final.
- `git diff --check`: aprobado; solo avisos informativos LF/CRLF de Windows.

## 12. Suite completa

El runner seguro completo se ejecuto una vez con ventana suficiente. El resto de modulos avanzo correctamente, pero los tests de invitaciones fallaron antes de sus aserciones porque Prisma no podia deserializar el retorno `void` del advisory lock ejecutado con `$queryRaw`.

Se corrigio a `$executeRaw` y se repitieron unicamente los tres archivos afectados contra la misma base segura. Todos quedaron verdes despues de la correccion final de precedencia. No se repitio toda la suite para evitar otros ocho minutos de ejecucion sin evidencia adicional.

## 13. Riesgos restantes

- La unicidad concurrente depende de que toda creacion pase por `createInvitation`; no existe un indice parcial de PostgreSQL para PENDING.
- PostgreSQL y Resend no comparten una transaccion. Una invitacion puede persistir con email pendiente, estado que ahora se informa correctamente.
- Un reenvio puede completar y ser cancelado inmediatamente despues; el enlace enviado quedaria invalido, pero no concede acceso.
- La creacion de tenant y la invitacion de su primer ADMIN siguen siendo operaciones separadas; el SUPER_ADMIN recibe un fallo controlado si la invitacion no puede crearse.
- La politica global de email unico impide que una misma direccion pertenezca a dos conjuntos. Es coherente con el schema actual, pero debe confirmarse como decision de producto.

## 14. Estado

`IMPLEMENTADO CON RIESGOS`

No se hizo commit, push ni tags. No se inicio otro modulo.
