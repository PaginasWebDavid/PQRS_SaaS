# FASE 8B - Revision adversarial y cierre de reservas

## Resultado

`CORREGIDO Y LISTO PARA COMMIT`

La revision se limito a reservas, zonas comunes, sus rutas, UI directa, pruebas y dependencias de notificaciones. No se abrieron otros modulos.

## Defectos encontrados y correcciones

1. **Horario dependiente del navegador y entrada ambigua.** La pantalla de residente construia `Date` desde `YYYY-MM-DDTHH:mm`, que usa la zona horaria del navegador, mientras el servidor aceptaba el mismo formato sin offset segun la zona del proceso. Se corrigio para convertir la hora civil elegida a UTC con `America/Bogota`, exigir ISO 8601 con `Z` u offset explicito en servidor y mostrar fechas siempre en Bogota en ADMIN, CONSEJO y RESIDENTE.
2. **Carrera entre desactivacion y creacion.** `updateCommonArea` no compartia el advisory lock de agenda. Una creacion podia validar una zona activa y confirmar despues de una desactivacion concurrente. Ahora toda actualizacion de zona toma el mismo lock `(tenantId, commonAreaId)`, relee la zona tenant-scoped dentro de la transaccion y calcula el patch desde ese estado actual.
3. **Mapeo fragil de exclusion PostgreSQL.** El reconocimiento de `23P01` dependia solo del mensaje. Ahora verifica `code`, `meta.code` y `cause` antes de conservar el texto/nombre de constraint como compatibilidad.
4. **Comentario de schema impreciso.** Se ajusto `tstzrange` a `tsrange`, consistente con la migracion y las columnas `TIMESTAMP(3)` de Prisma.

## Concurrencia y constraint

- `btree_gist` y `Reservation_no_overlap_excl` usan `tsrange(startAt, endAt, '[)')`, por lo que las reservas contiguas son validas y PENDING/APPROVED son los unicos estados ocupantes.
- Reserva, aprobacion, bloqueos y actualizacion de zona comparten advisory lock por tenant+zona dentro de transaccion.
- Se agregaron pruebas PostgreSQL para reserva-vs-bloqueo, aprobacion-vs-bloqueo, aprobacion-vs-cancelacion, desactivacion mientras espera el lock y frontera domingo/lunes.
- Los bloqueos entre si pueden solaparse deliberadamente: representan cierres administrativos acumulables. No pueden solaparse con reservas activas y no cancelan reservas en silencio.

## Permisos y aislamiento

Las rutas derivan tenant, membresia, actor y rol desde autorizacion comun. RESIDENTE crea y lee solo su membresia; ADMIN administra solo su tenant; CONSEJO es lectura; SUPER_ADMIN no recibe contexto tenant implicito. Los IDs cross-tenant/cross-owner son opacos.

## Notificaciones y auditoria

Las notificaciones usan destinatarios con usuario y membresia activos, dedupe estable y ejecucion despues del commit. La auditoria permanece dentro de la transaccion y su metadata conserva solo IDs, estado y campos tecnicos. El correo sigue siendo best-effort fuera de transaccion: no revierte una reserva, pero puede requerir reintento operativo si el proveedor falla.

## Pruebas y validaciones

- `tests/unit/reservation-time.test.ts` + `tests/unit/reservation-security.test.ts`: **24/24 PASS**.
- `tests/reservation-integration.test.ts`: **43/43 PASS** con PostgreSQL de pruebas protegido.
- `npx prisma validate`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS.
- No se repitio la suite integral previa de 571 pruebas, conforme al alcance de esta revision.

## Riesgos restantes

| Riesgo | Clasificacion | Impacto |
| --- | --- | --- |
| `America/Bogota` fija | Decision de producto, bajo | No bloquea commit ni despliegue actual; se requiere timezone por tenant si se expande fuera de Colombia. |
| ADMIN no reserva en nombre de residente | Decision de producto, bajo | No bloquea; requeriria seleccion explicita de membresia en una fase futura. |
| Bloqueo con reservas activas se rechaza | Decision de producto, bajo | No bloquea; evita cancelaciones silenciosas. |
| UI funcional con poco pulido | Producto, bajo | No bloquea seguridad ni despliegue. |
| Email best-effort sin outbox de correo | Operativo, medio | No bloquea commit; requiere monitoreo/reintento si se exige garantia de entrega. |
| `btree_gist` en produccion | Infraestructura, medio | No bloquea commit; el despliegue requiere aplicar la migracion en PostgreSQL con la extension habilitable. |
| Sin inyeccion de fallo Prisma/red real | Cobertura, bajo | No bloquea; los errores inesperados ya se generalizan y las reglas se probaron con PostgreSQL real. |

No se hizo commit, push ni tag desde este documento. El hash se informara solo despues de crear el commit local.