# Auditoría ADMIN: Matriz de Flujos

## Páginas verificadas

Se recorrieron con una sesión ADMIN válida en `http://localhost:3003`:

- `/admin/dashboard`
- `/admin/pqrs`
- `/admin/usuarios`
- `/admin/invitaciones`
- `/admin/reportes`
- `/admin/licencias`
- `/admin/configuracion`
- `/admin/actividad`
- `/admin/cuenta`
- `/admin/ayuda`

También se verificaron los alias `/admin`, `/dashboard`, `/dashboard/admin`, `/pqrs`, `/reportes` y `/usuarios`. El build reconoce las rutas y ya no quedan como destinos sin página.

## Estado de cada área

| Área | Resultado | Evidencia | Pendiente |
|---|---|---|---|
| Login y sesión | Funcional en recorrido | ADMIN llegó a `/admin/dashboard` | Agregar pruebas HTTP de expiración y acceso denegado |
| Dashboard | Real y tenant-scoped | Métricas y nombre de conjunto llegaron de Supabase | Evitar consultas anuales sin paginación |
| PQRS | CRUD y ciclo operativo conectados | Listado, filtros, detalle e historial disponibles | Concurrencia, paginación, colas y errores visibles en UI |
| Usuarios | Funcional y aislado | Servicio filtra por conjunto; se protege el último ADMIN | Agregar paginación y pruebas de permisos por handler |
| Invitaciones | Crear, reenviar, cancelar y aceptar reales | Token hasheado, expiración y auditoría | Outbox/reintentos y pruebas de carrera HTTP |
| Reportes | Datos reales y exportaciones existentes | Ruta `/api/reportes` validada y página carga | Los límites pueden truncar datos sin indicador suficiente |
| Licencias y pagos | Integración Mercado Pago real | Checkout genera init point; estado viene de DB | Probar webhook firmado en staging y no bloquear por estado ambiguo |
| Configuración | Campos permitidos persistentes | Actualización auditada en servicio tenant-scoped | Separar mejor configuración operativa de secretos |
| Actividad | Persistente | Actividad consulta registros reales | Auditoría posterior a mutación aún no es transaccional |
| Correos | Resend centralizado | `EmailLog` registra éxito, fallo y omisión | Falta cola durable y reintentos |
| Archivos | Storage y límites básicos | Upload de fotos/evidencia validado | Limpieza de huérfanos y migración de URLs legadas |

## Acciones no aceptadas

No se consideraron suficientes los botones visibles. La autorización se revisó en las rutas y servicios para impedir que un ADMIN:

- cambie el conjunto objetivo;
- consulte o modifique recursos de otro conjunto;
- cree un `SUPER_ADMIN`;
- modifique reglas de precio o unidades globales;
- acceda al panel global.

El patrón correcto observado es obtener el conjunto desde la sesión y volver a filtrar por `tenantId` en la consulta. Debe mantenerse en cada endpoint nuevo.
