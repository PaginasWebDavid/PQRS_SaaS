# FASE 8B — REVISIÓN ADVERSARIAL Y CIERRE DE RESERVAS

Guarda este prompt en:

`docs/programa-mejora/11-reservas-zonas-comunes/03-prompt-codex-revision-cierre.md`

Guarda el informe en:

`docs/programa-mejora/11-reservas-zonas-comunes/04-respuesta-codex-revision-cierre.md`

## Regla adaptativa

Revisa adversarialmente la implementación de reservas y zonas comunes.

* Si no encuentras defectos críticos, altos o medios: aprueba y crea el commit.
* Si encuentras un defecto pequeño o medio que pueda corregirse de forma acotada:

  * corrígelo directamente;
  * añade o ajusta la prueba focalizada;
  * ejecuta solo las pruebas afectadas;
  * typecheck y lint una vez;
  * crea el commit si queda verde.
* Detente sin commit únicamente ante:

  * defecto crítico;
  * cambio amplio de arquitectura;
  * migración incorrecta que requiera rediseño;
  * fallo que no pueda validarse de forma acotada.

No abras otro módulo.

## Eficiencia

* No revises HEAD, rama, historial ni staged al comenzar.
* No repitas la suite completa: ya está verde **571/571**.
* No repitas Prisma validate, typecheck, lint ni pruebas si no modificas código.
* Revisa solo el diff de Fase 8A y dependencias directas.
* No reaudites autenticación, cuenta global, invitaciones, PQRS o billing.
* Informe final breve.

## Archivos principales

Revisa:

```text id="tebx1q"
prisma/schema.prisma
prisma/migrations/20260729000100_add_reservations_common_areas/migration.sql

src/domains/reservations/reservation-time.ts
src/domains/reservations/reservation-security.ts
src/domains/reservations/reservation.service.ts

src/app/api/reservas/route.ts
src/app/api/reservas/[id]/route.ts
src/app/api/reservas/[id]/revisar/route.ts
src/app/api/reservas/[id]/cancelar/route.ts
src/app/api/reservas/zonas/route.ts
src/app/api/reservas/zonas/[id]/route.ts
src/app/api/reservas/zonas/[id]/disponibilidad/route.ts
src/app/api/reservas/zonas/[id]/bloqueos/route.ts

src/app/admin/reservas/page.tsx
src/app/consejo/reservas/page.tsx
src/app/residente/reservas/page.tsx

src/domains/notifications/notification.service.ts
src/lib/design/adminNav.ts
src/lib/design/consejoNav.ts
src/app/residente/page.tsx

tests/unit/reservation-time.test.ts
tests/unit/reservation-security.test.ts
tests/reservation-integration.test.ts
```

Lee los documentos 01 y 02 de esta fase.

# 1. Modelo y migración

Confirma:

* relaciones correctas con Tenant, User y TenantMembership;
* reserva ligada a tenant, zona, membresía y usuario creador;
* índices suficientes para consultas de agenda, tenant y membresía;
* estados correctamente representados;
* migración aditiva;
* `btree_gist` compatible con el PostgreSQL objetivo;
* constraint de exclusión correctamente condicionado a:

  * `PENDING`;
  * `APPROVED`;
* semántica `[startAt, endAt)`;
* reservas contiguas permitidas;
* `REJECTED` y `CANCELLED` fuera del constraint.

Revisa específicamente:

```sql id="yobh05"
tsrange("startAt", "endAt", '[)')
```

Confirma que coincide con el tipo real de las columnas creadas por Prisma y que no existe una conversión dependiente de la zona horaria de la sesión.

Confirma que el error `23P01` se reconoce de forma estable, sin depender únicamente de un mensaje localizado o frágil. Preferiblemente debe comprobarse mediante código Prisma/SQLSTATE disponible y usar el nombre del constraint solo como respaldo.

# 2. Autorización

Confirma:

* tenant, membership, actor y rol salen de la autorización común;
* RESIDENTE crea exclusivamente para su membresía seleccionada;
* ADMIN opera únicamente dentro de su tenant;
* CONSEJO solo lectura;
* SUPER_ADMIN no recupera contexto tenant implícito;
* body y query no pueden falsificar:

  * tenant;
  * membership;
  * creador;
  * estado;
  * revisor;
* recursos inexistentes, cross-tenant y cross-owner son opacos.

Verifica todas las rutas, no solo el servicio.

# 3. Concurrencia de agenda

Reconstruye las operaciones que toman el advisory lock.

La misma clave de lock por zona debe utilizarse en:

* creación de reserva;
* aprobación;
* creación de bloqueo;
* cualquier cambio que pueda afectar disponibilidad.

Confirma que la clave:

* incluye tenant y zona;
* es estable;
* está parametrizada;
* no permite colisiones prácticas entre zonas;
* se toma dentro de una transacción.

## Carreras obligatorias

Verifica estas interacciones:

### Reserva vs reserva

Dos reservas solapadas concurrentes:

* una sola gana;
* constraint DB actúa como garantía final.

### Reserva vs bloqueo

Una creación de reserva concurrente con un bloqueo sobre el mismo horario:

* no pueden finalizar ambas activas;
* deben compartir el mismo lock o tener otra garantía DB equivalente.

### Aprobación vs bloqueo

Una aprobación concurrente con un bloqueo:

* no puede aprobarse una reserva sobre un bloqueo ya confirmado;
* no puede confirmarse un bloqueo sobre una reserva aprobada.

### Aprobación vs cancelación

Una aprobación y una cancelación concurrentes sobre la misma reserva:

* debe existir un único estado final válido;
* no deben quedar simultáneamente campos de aprobación y cancelación incoherentes;
* los CAS deben comprobar el estado esperado.

### Doble cancelación

Debe ser idempotente o producir un error controlado, sin doble notificación o auditoría contradictoria.

Si cualquiera de estas garantías no está cubierta, añade una prueba PostgreSQL focalizada y corrige.

# 4. Límite semanal

Confirma:

* dimensión real: membresía + zona;
* semana local: lunes a lunes en `America/Bogota`;
* estados contados: PENDING y APPROVED;
* CANCELLED y REJECTED no consumen cupo;
* advisory lock serializa conteo + creación;
* no existe un camino alternativo que inserte reservas sin tomar el lock.

Revisa los límites de fecha alrededor de:

* domingo/lunes;
* fin de mes;
* fin de año;
* instantes cercanos a medianoche UTC.

Bogotá no tiene horario de verano actualmente, pero la implementación no debe depender de la zona local del servidor.

# 5. Reglas de horario

Confirma:

* `openingTime` y `closingTime` tienen formato estricto;
* duración se calcula por instantes reales;
* reservas no cruzan medianoche;
* una reserva que termina exactamente al cierre es válida;
* una que comienza exactamente a la apertura es válida;
* días bloqueados usan consistentemente 0=domingo…6=sábado;
* fecha futura se compara con un reloj coherente;
* strings ambiguos del cliente no se convierten silenciosamente según la zona del servidor.

# 6. Configuración de zonas

Confirma whitelist y coherencia:

* nombre;
* descripción;
* estado;
* aprobación;
* duración mínima/máxima;
* horario;
* límite semanal;
* días bloqueados;
* reglas.

Revisa:

* nombres duplicados dentro del tenant;
* mismo nombre permitido entre tenants;
* error Prisma de unicidad mapeado de forma pública;
* desactivar una zona concurrentemente con una creación;
* cambiar reglas no altera reservas históricas;
* zona inactiva no acepta creación ni aprobación.

Una creación que inició antes de desactivar la zona no debe poder confirmar después sin revalidarla dentro de la transacción.

# 7. Aprobación y rechazo

Confirma:

* solo ADMIN;
* reserva resuelta con tenant;
* estado `PENDING` revalidado después del lock;
* aprobación vuelve a validar:

  * zona activa;
  * bloqueos;
  * solapamientos;
* rechazo exige razón cuando la política así lo establece;
* razón tiene límite;
* actor y fecha correctos;
* una segunda revisión no sobrescribe la primera;
* campos incompatibles quedan limpios:

  * una reserva rechazada no debe parecer aprobada;
  * una cancelada no debe conservar una transición administrativa incoherente.

# 8. Cancelación

Confirma:

* RESIDENTE solo cancela su reserva;
* ADMIN solo reservas del tenant;
* reserva pasada no cancelable;
* cancelación libera el constraint de solapamiento;
* no se borra historial;
* CAS evita sobrescribir una revisión concurrente;
* actor y fecha correctos;
* no se envían notificaciones duplicadas en reintentos;
* cross-owner y cross-tenant son opacos.

# 9. Bloqueos

Confirma:

* solo ADMIN;
* tenant y zona desde servidor;
* motivo y fechas limitados;
* bloqueo no cruza con reservas activas;
* consulta y creación ocurren bajo el mismo lock de agenda;
* dos bloqueos concurrentes:

  * define si pueden solaparse;
  * si no deben, añade garantía;
  * si pueden, documenta la decisión;
* no se cancelan reservas silenciosamente.

Revisa si existe eliminación de bloqueos. Si existe:

* tenant-scoped;
* auditable;
* sin borrar recursos ajenos.

Si no existe, no es necesario implementarla salvo que la UI la prometa.

# 10. Disponibilidad y privacidad

Confirma:

* rango máximo 62 días;
* zona tenant-scoped;
* ocupación incluye PENDING y APPROVED;
* bloqueos incluidos;
* respuestas no contienen:

  * membershipId;
  * userId;
  * nombre;
  * email;
  * apartamento;
  * notas;
* CONSEJO y RESIDENTE no reciben datos administrativos;
* rangos extremos no generan consultas excesivas;
* from/to inválidos producen error público.

# 11. Notificaciones

Confirma:

* destinatarios del tenant correcto;
* `User.isActive`;
* `TenantMembership.isActive`;
* dedupe key estable;
* creación pendiente no duplica notificación a ADMIN por retry;
* aprobación/rechazo/cancelación no produce email duplicado ante una mutación repetida;
* notificación ocurre después del commit;
* fallo de notificación no revierte la reserva;
* contenido HTML escapado;
* no se envían notas o razones sensibles innecesariamente.

Revisa especialmente si el correo es best-effort sin outbox:

* clasifica el riesgo;
* no rediseñes la infraestructura salvo que pueda provocar duplicados o pérdida grave dentro del flujo actual.

# 12. Auditoría

Confirma acciones y metadata:

* creación;
* aprobación;
* rechazo;
* cancelación;
* creación/edición de zona;
* creación de bloqueo.

No debe guardar:

* nota completa;
* motivo completo si contiene información privada;
* email;
* teléfono;
* apartamento;
* contenido de usuario.

El AuditLog debe quedar dentro de la misma transacción que la mutación principal cuando su ausencia afecte trazabilidad requerida.

# 13. UI y contrato API

Comprueba únicamente errores funcionales claros:

* ADMIN puede administrar zonas y reservas;
* CONSEJO solo lectura;
* RESIDENTE puede crear, ver y cancelar propias;
* la UI interpreta correctamente:

  * PENDING;
  * APPROVED;
  * REJECTED;
  * CANCELLED;
* fechas se muestran en hora Bogotá;
* cambio de tenant refresca datos y no conserva reservas anteriores;
* formularios no envían campos prohibidos;
* errores 409/400/404 se muestran de forma comprensible.

No hagas rediseño visual.

# 14. Pruebas

Claude reportó:

```text id="hw1x78"
24/24 unitarias
37/37 PostgreSQL
571/571 suite completa
```

No las repitas si el código y las aserciones son coherentes.

Añade pruebas focalizadas únicamente si falta una garantía, especialmente:

1. creación de reserva vs creación de bloqueo concurrentes;
2. aprobación vs bloqueo concurrentes;
3. aprobación vs cancelación concurrentes;
4. zona desactivada mientras una creación espera el lock;
5. error `23P01` correctamente mapeado;
6. límite semanal en frontera domingo/lunes.

Si modificas código:

* ejecuta solo los archivos de reservas afectados;
* después:

```text id="50odjs"
npx prisma validate
npx tsc --noEmit
npm run lint
```

No repitas la suite completa.

# 15. Riesgos

Clasifica:

* timezone fija `America/Bogota`;
* ADMIN sin reserva en nombre de residente;
* bloqueo rechazado si existen reservas;
* UI funcional con poco pulido;
* emails best-effort;
* extensión `btree_gist` en infraestructura de producción;
* ausencia de pruebas de fallos reales de red/Prisma.

Indica qué bloquea:

* commit;
* despliegue;
* decisión de producto.

# 16. Commit automático

Si el módulo queda correcto o corriges únicamente problemas acotados y las pruebas focalizadas quedan verdes:

1. Ejecuta una sola lista de archivos modificados.
2. Añade los archivos de Fase 8A, cualquier corrección de esta revisión y:

```text id="70wxfe"
docs/programa-mejora/11-reservas-zonas-comunes/
```

3. Revisa una vez el staged diff para:

   * secretos;
   * `.env`;
   * connection strings;
   * datos de prueba reales;
   * archivos ajenos.
4. Crea:

```text id="ogwm3z"
git commit -m "feat(reservations): add secure common-area booking"
```

No ejecutes pruebas después del commit.

# 17. Informe breve

Entrega:

1. Defectos encontrados.
2. Correcciones, si hubo.
3. Concurrencia y constraint.
4. Permisos y aislamiento.
5. Reglas de reservas.
6. Notificaciones y auditoría.
7. Pruebas revisadas o ejecutadas.
8. Riesgos.
9. Commit y hash.
10. Resultado:

* `APROBADO Y COMMIT CREADO`.
* `CORREGIDO Y COMMIT CREADO`.
* `BLOQUEADO`.

No inicies otro módulo.
