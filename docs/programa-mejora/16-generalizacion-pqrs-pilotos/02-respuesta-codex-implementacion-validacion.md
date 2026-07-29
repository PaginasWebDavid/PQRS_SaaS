# FASE R2A - Informe de implementacion y validacion

## 1. Diagnostico del modelo anterior

Antes de esta fase, la categoria se representaba principalmente mediante `Pqrs.asunto` (`String?`) y `Pqrs.subAsunto` (`String?`). `Pqrs.tipoPqrs` conserva el enum juridico PETICION/QUEJA/RECLAMO/SUGERENCIA y no sustituye la categoria operativa. El workflow se copiaba desde `Tenant.pqrsWorkflowType` a `Pqrs.workflowType`.

Los valores operativos estaban hardcodeados en formularios, listados, dashboard, reportes, Excel/PDF y correos. Entre ellos estaban `AREA COMUN`, `AREA PRIVADA`, `CONTABILIDAD`, `CONVIVENCIA` y los subtipos `HUMEDAD/CUBIERTA`, `HUMEDAD/DEPOSITO`, `HUMEDAD/VENTANAS`, `HUMEDAD/FACHADA` y `HUMEDAD/GARAJE`.

La evidencia principal podia quedar en `evidenciaArchivoData`, `evidenciaArchivoUrl` o `evidenciaArchivoPath`; las fotos usaban `PqrsFoto.data`, `url` o `storagePath`. El retiro anterior no preservaba de forma uniforme metadata, actor, motivo e historial.

## 2. Modelo de categorias

Se agrego `PqrsCategory` con:

- `id`, `tenantId`, `canonicalKey`, `slug` y `displayName`;
- `isActive`, `isCustom`, `sortOrder` y `workflowType`;
- `createdByUserId`, `createdAt` y `updatedAt`;
- unicidad por `tenantId + slug` y `tenantId + canonicalKey`;
- indice por `tenantId + isActive + sortOrder`.

Cada conjunto recibe de forma idempotente las ocho categorias canonicas requeridas. Las claves y slugs son estables; el nombre visible es configurable. `SIMPLE` y `MAINTENANCE` son los unicos workflows aceptados.

El limite de tres categorias personalizadas se impone con transaccion serializable y advisory lock por conjunto. Un conflicto serializable se presenta como 409 controlado; nunca permite exceder el limite.

## 3. Migracion y compatibilidad

Migracion aditiva:

`prisma/migrations/20260801000100_generalize_pqrs_categories/migration.sql`

La migracion:

- crea `PqrsCategory` y `PqrsCorrection`;
- agrega `Pqrs.categoryId` y `Pqrs.categorySnapshot`;
- agrega metadata de retiro de evidencia principal y fotos;
- crea las ocho categorias por cada conjunto existente;
- mapea valores legacy conocidos a categorias canonicas;
- crea categorias legacy inactivas y tenant-scoped para valores sin correspondencia segura;
- conserva el label historico en `categorySnapshot`;
- no elimina `asunto`, `subAsunto`, `tipoPqrs` ni `Tenant.pqrsWorkflowType`.

Campos legacy conservados temporalmente:

- `Pqrs.asunto`: respaldo para lectores y casos anteriores;
- `Pqrs.subAsunto`: conserva el detalle historico, incluidos casos de humedad;
- `Pqrs.tipoPqrs`: clasificacion juridica independiente;
- `Tenant.pqrsWorkflowType`: respaldo de compatibilidad para lectores antiguos.

La migracion se aplico con `npm run test:db:deploy`. No se uso `prisma db push`.

## 4. Configuracion por tenant

Se agrego la seccion `Categorias de PQRS` en configuracion ADMIN. Permite:

- activar o desactivar;
- renombrar la etiqueta visible;
- cambiar el orden;
- seleccionar SIMPLE o MAINTENANCE;
- crear hasta tres categorias personalizadas.

Las rutas usan el conjunto seleccionado en la sesion. Los servicios de escritura verifican ademas que el actor tenga una membresia ADMIN activa dentro de ese conjunto. RESIDENTE y CONSEJO no pueden configurar.

Rutas:

- `GET /api/pqrs/categories`: categorias activas para RESIDENTE; ADMIN/CONSEJO pueden solicitar historicas.
- `GET/POST/PATCH /api/tenant/pqrs-categories`: administracion del catalogo.

El servidor genera slug, ID, tenant efectivo y creador. Se rechazan claves extra como `tenantId`, `slug`, `canonicalKey`, `id` y `createdByUserId`.

## 5. Creacion de PQRS

La creacion recibe `categoryId`, resuelve una categoria activa del conjunto y copia en servidor:

- `categoryId`;
- `categorySnapshot = displayName`;
- `workflowType = category.workflowType`;
- `asunto = category.slug` como respaldo legacy.

El cliente no puede imponer `tenantId`, `workflowType` ni `categorySnapshot`. Una categoria inactiva o de otro conjunto devuelve una respuesta opaca. RESIDENTE solo recibe categorias activas y ordenadas.

Se mantuvo una traduccion transitoria y acotada de valores `asunto` legacy para clientes anteriores. La UI nueva usa `categoryId`.

## 6. Correccion auditada

Se implemento:

`POST /api/pqrs/[id]/corregir`

Solo una membresia ADMIN activa del conjunto puede ejecutarla. La whitelist admite:

- categoria;
- bloque y apartamento;
- responsable ADMIN activo del mismo conjunto;
- workflow SIMPLE/MAINTENANCE;
- fase valida;
- ruta INSUMOS/PROVEEDOR;
- reapertura explicita.

La operacion exige `reason` entre 10 y 500 caracteres, sin controles, y `operationId` UUID. Debe existir al menos un cambio real.

`PqrsCorrection`, `Pqrs`, `HistorialPqrs` y `AuditLog` se escriben dentro de una unica transaccion serializable. El advisory lock y la unicidad `tenantId + operationId` evitan duplicados. La reapertura conserva el cierre anterior en el before/after durable, registra la transicion TERMINADO a EN_PROGRESO y no borra silenciosamente el historial.

## 7. Retiro de evidencia

ADMIN puede retirar la evidencia principal o una foto con motivo obligatorio. El servicio:

1. valida rol, membresia, conjunto, PQRS y evidencia;
2. usa solo el path persistido;
3. elimina contenido, URL y path accesible;
4. conserva nombre, tipo, tamano, actor, motivo y fecha;
5. crea `HistorialPqrs` y `AuditLog` en la misma transaccion;
6. limpia Storage despues del commit y de forma best-effort.

Los endpoints de descarga rechazan evidencia retirada. Los errores de Storage no se exponen ni revierten el retiro logico. La auditoria no guarda base64, URL ni path.

Tambien se cubrio la evidencia principal legacy almacenada solo como URL: puede retirarse logicamente sin volver a exponerla.

## 8. Aislamiento multi-tenant

Se verifico con PostgreSQL real:

- categoria ajena no visible ni seleccionable;
- ADMIN no configura otro conjunto;
- ADMIN no corrige una PQRS ajena;
- responsable de otro conjunto no asignable;
- evidencia ajena no retirable;
- mismas claves, slugs y nombres permitidos entre conjuntos;
- reportes y exportaciones no mezclan PQRS;
- servicios de escritura exigen membresia ADMIN activa, ademas del rol.

Los recursos inexistentes y cross-tenant usan errores opacos.

## 9. Reportes y exportaciones

Se actualizaron listados, dashboard, reportes, Excel/PDF y exportacion de conjunto para preferir `categorySnapshot` y usar `asunto` solo como fallback legacy.

Los filtros nuevos usan `categoryId`. ADMIN y CONSEJO pueden seguir viendo categorias inactivas en historicos. Renombrar, desactivar o cambiar el workflow del catalogo no altera los casos anteriores.

No se agregaron reportes ni se redisenaron dashboards.

## 10. Pruebas focalizadas

Archivo:

`tests/pqrs-category-correction-integration.test.ts`

Resultado final protegido:

- 47 pruebas;
- 47 aprobadas;
- 0 fallidas;
- 0 omitidas.

Incluye los 46 casos minimos solicitados: 20 de categorias, 18 de correccion y 8 de evidencia, mas un smoke integral.

## 11. Smoke test con dos tenants

El caso 47 crea dos conjuntos independientes y verifica:

- catalogos independientes con mismos slugs sin colision;
- usuarios y membresias separadas;
- PQRS en ambos conjuntos;
- evidencias independientes;
- correccion solo en el conjunto objetivo;
- historial asociado correctamente;
- reporte sin registros cruzados;
- XLSX sin PQRS del otro conjunto.

Resultado: APROBADO con PostgreSQL real en la base protegida de pruebas.

## 12. Suite integral

Ejecucion integral unica de la fase:

- total: 731;
- aprobadas: 728;
- fallidas: 3;
- las 3 fallas pertenecian al archivo R2A nuevo y eran aserciones defectuosas de prueba, no defectos productivos;
- las otras 728 pruebas del repositorio quedaron verdes.

Correcciones posteriores, solo en pruebas:

- la concurrencia ahora verifica el limite y los rechazos controlados, sin exigir que toda operacion simultanea complete sin reintento;
- ExcelJS se inspecciona por indice de columna, porque las claves no sobreviven al reabrir el XLSX;
- el smoke selecciona la misma categoria canonica en ambos conjuntos, sin depender del orden modificado por otra prueba.

Despues se ejecuto solo el archivo afectado con el mismo guard de base:

- 47/47 aprobadas.

No se repitio automaticamente la suite integral porque la correccion fue exclusivamente del archivo de pruebas y no modifico codigo transversal en ese punto, conforme a las instrucciones de ejecucion.

Validaciones finales:

- `npm run test:db:deploy`: aprobado; 31 migraciones, R2A aplicada.
- `npx prisma generate`: aprobado.
- `npx prisma validate`: aprobado.
- `npx tsc --noEmit`: aprobado.
- `npm run lint`: aprobado, sin warnings ni errores.
- `git diff --check`: sin errores de whitespace; solo avisos locales LF/CRLF.

## 13. Runbook de validacion externa

### PROBADO AUTOMATICAMENTE

- catalogos por conjunto;
- creacion y limite concurrente de categorias;
- snapshot historico;
- workflows derivados;
- correccion atomica e idempotente;
- reapertura auditada;
- retiro de evidencia y fallo simulado de Storage;
- reportes y XLSX;
- aislamiento entre dos conjuntos.

### PROBADO CON SIMULACION LOCAL

- fallo de Storage sin exponer detalle del proveedor;
- reintentos concurrentes y conflictos serializables;
- lectura historica de categorias legacy.

### PENDIENTE DE PRUEBA EXTERNA REAL

1. Invitacion real: usar un correo controlado, verificar remitente, conjunto, expiracion, creacion de contrasena y acceso al conjunto correcto.
2. Recuperacion de contrasena: solicitar correo real, usar el enlace una vez, confirmar expiracion/reutilizacion y revocacion de sesiones.
3. Nueva PQRS: radicar como residente externo y confirmar notificacion in-app y correo al ADMIN correcto.
4. Cambio de estado: actualizar como ADMIN y confirmar notificacion/correo al residente correcto.
5. Cierre: cerrar con evidencia y confirmar timeline, correo y persistencia despues de recargar.
6. Pago aprobado: ejecutar en sandbox/entorno autorizado, recibir webhook firmado y comprobar correo sin activar manualmente.
7. Pago rechazado: simular rechazo autorizado y verificar que no se presente como pago aprobado.
8. Cortesia: otorgar con operationId, confirmar una sola extension y comunicacion diferenciada de un pago.
9. Pago manual: registrar con evidencia y verificar auditoria, periodo y notificacion.
10. Mercado Pago real: usar credenciales y comprador de prueba separados, webhook HTTPS y confirmar preapproval, pago y renovacion.
11. Suspension: vencer el periodo en entorno controlado, ejecutar cron y confirmar acceso, notificacion y correo.
12. Reactivacion: aportar evidencia vigente, reactivar y confirmar acceso y auditoria sin duplicar suscripcion.

No se enviaron correos reales ni se realizaron cobros en esta fase.

## 14. Riesgos restantes

- `categoryId` permanece nullable por la estrategia aditiva; la API nueva lo exige, pero una escritura directa a DB todavia podria crear una PQRS legacy.
- `asunto`, `subAsunto`, `tipoPqrs` y `Tenant.pqrsWorkflowType` deben retirarse solo cuando no queden lectores legacy y exista una migracion posterior aprobada.
- Una creacion concurrente puede recibir 409 y requerir reintento; el limite nunca se excede.
- La limpieza fisica de Storage es best-effort. El archivo deja de ser accesible desde la aplicacion aunque el proveedor falle; se requiere observabilidad operacional para reintentos de limpieza.
- No existe E2E de navegador para la UI nueva; la cobertura de esta fase es de dominio, persistencia, aislamiento, reportes y exportacion.
- La migracion fue validada en la base de pruebas, no aplicada a produccion.
- Marcar duplicados se dejo fuera porque era opcional y no bloqueante.
- Las integraciones externas del runbook siguen pendientes de ejecucion real autorizada.

## 15. Archivos modificados

### Prisma

- `prisma/schema.prisma`
- `prisma/migrations/20260801000100_generalize_pqrs_categories/migration.sql`

### Dominio

- `src/domains/pqrs/pqrs-category-policy.ts`
- `src/domains/pqrs/pqrs-category.service.ts`
- `src/domains/pqrs/pqrs-correction-policy.ts`
- `src/domains/pqrs/pqrs-correction.service.ts`
- `src/domains/pqrs/pqrs-evidence.service.ts`
- `src/domains/pqrs/reportes.service.ts`
- `src/domains/pqrs/resident-view.ts`
- `src/domains/platform/tenant-admin.service.ts`
- `src/domains/platform/tenant-export.service.ts`

### APIs

- `src/app/api/pqrs/route.ts`
- `src/app/api/pqrs/[id]/route.ts`
- `src/app/api/pqrs/[id]/corregir/route.ts`
- `src/app/api/pqrs/[id]/evidencia/route.ts`
- `src/app/api/pqrs/[id]/fotos/[fotoId]/route.ts`
- `src/app/api/pqrs/categories/route.ts`
- `src/app/api/tenant/pqrs-categories/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/dashboard/excel/route.ts`
- `src/app/api/reportes/route.ts`
- `src/app/api/reportes/excel/route.ts`
- `src/app/api/reportes/pdf/route.ts`

### UI

- `src/app/admin/configuracion/page.tsx`
- `src/app/admin/pqrs/page.tsx`
- `src/app/admin/reportes/page.tsx`
- `src/app/residente/page.tsx`
- `src/app/consejo/page.tsx`
- `src/app/consejo/reportes/page.tsx`

### Pruebas y documentacion

- `tests/pqrs-category-correction-integration.test.ts`
- `docs/programa-mejora/16-generalizacion-pqrs-pilotos/01-prompt-codex-implementacion-validacion.md`
- `docs/programa-mejora/16-generalizacion-pqrs-pilotos/02-respuesta-codex-implementacion-validacion.md`

La carpeta no relacionada `docs/programa-mejora/14-reencuadre-comercial/` ya estaba presente y no fue modificada como parte de R2A.

## 16. Estado

`IMPLEMENTADO CON RIESGOS`

La funcionalidad de R2A esta implementada y validada en PostgreSQL de pruebas. Los riesgos restantes son la compatibilidad legacy deliberada, la ausencia de E2E de navegador y las pruebas externas reales pendientes. No se hizo commit, push ni tags. No se inicio otra fase.