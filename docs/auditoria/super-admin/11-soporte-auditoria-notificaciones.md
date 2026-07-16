# Soporte, auditoria y notificaciones

## Soporte

`SupportTicket` es persistente. SUPER_ADMIN puede listar y responder. Una respuesta actualiza estado, registra audit log, crea notificacion interna y llama a Resend (`support-ticket.service.ts:68-121`). La autorizacion del handler es correcta (`support-tickets/route.ts:18-42`).

## Auditoria

`registerAuditLog()` centraliza actor, tenant, recurso, origen y metadata sanitizada (`audit.service.ts:124-150`). El panel carga categorias y paginas reales. Las categorias y filtros existen, pero el endpoint falla con paginacion invalida (SA-007).

## SA-017 - Soporte sin paginacion

- Severidad: Baja hoy, Media al escalar.
- Evidencia: `listSupportTicketsForSuperAdmin()` usa `take: 100` fijo (`support-ticket.service.ts:45-55`) sin `skip`, busqueda ni orden configurable.
- Impacto: el modulo se vuelve lento/incompleto con mas de 100 tickets.

## SA-018 - Registro de auditoria no atomico en algunos flujos

- Severidad: Media.
- Evidencia: crear tenant hace auditorias dentro de transaccion, pero invitacion/email ocurren despues (`tenant-admin.service.ts:120-197`). Si falla la invitacion, el tenant queda creado correctamente y solo la respuesta avisa; no existe un evento explicito de fallo de invitacion en ese catch.
- Solucion: registrar el resultado de invitacion/email de forma controlada y mostrar accion de reintento desde el contexto del conjunto.
