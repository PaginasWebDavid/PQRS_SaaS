# Auditoría ADMIN: Pruebas y Riesgos

## Pruebas ejecutadas

- `npx tsc --noEmit`: pasa.
- `npm test`: pasa, **33/33** pruebas.
- `npm run lint`: pasa con advertencias preexistentes.
- `npx next build`: pasa; compilación, typecheck, páginas estáticas y rutas dinámicas generadas.
- `npm run build`: Prisma intentó regenerar el cliente, pero Windows devolvió `EPERM` al reemplazar `query_engine-windows.dll.node` porque había otro servidor Node ya abierto en 3000/3002. El build directo de Next pasó con el cliente Prisma existente.
- Recorrido browser ADMIN: las diez pantallas revisadas cargaron sin `404`, `Build Error` ni `Application error`.

## Riesgos pendientes priorizados

### Alta prioridad

1. **Paginación y límites de datos**: `/api/pqrs` devuelve toda la colección del conjunto y reportes trabajan con límites internos de 5.000/20.000 registros. En conjuntos grandes puede aumentar latencia y generar reportes incompletos.
2. **Trabajo dentro del request**: algunas mutaciones esperan auditoría, notificaciones, descarga de archivos y Resend antes de responder. Debe migrarse a una cola/outbox durable con reintentos.
3. **Atomicidad de auditoría**: varios handlers persisten el cambio y después registran auditoría. Si la segunda operación falla, queda una mutación sin evento.
4. **Pruebas de autorización HTTP**: existen pruebas de servicios, pero faltan pruebas de cada handler con sesiones ADMIN, CONSEJO y RESIDENTE y cuerpos/IDs manipulados.

### Media prioridad

1. Validar y rechazar explícitamente rangos de fechas que excedan el periodo máximo permitido; hoy algunos reportes dependen de límites internos.
2. Agregar cancelación/debounce en filtros de reportes y evitar recargas completas después de cada mutación de PQRS.
3. Implementar limpieza de archivos huérfanos cuando falla la transacción posterior al upload.
4. Escapar valores dinámicos antes de interpolarlos en HTML de correos.
5. Hacer consistente la cantidad de historial de pagos y mostrar un estado claro cuando no existe información.

### Baja prioridad

- Corregir advertencias de hooks e imágenes de `next/image`.
- Limpiar textos con codificación dañada existentes en varias pantallas.
- Añadir `loading`, vacío y error explícitos en cada tabla, no solo en el shell.

## Qué no se simuló

No se declaró como probado un pago real de Mercado Pago, la recepción de un webhook productivo, el envío a un dominio validado de Resend ni la descarga de un archivo de Supabase en producción. Esos recorridos requieren credenciales/URLs de staging y datos de prueba controlados.
