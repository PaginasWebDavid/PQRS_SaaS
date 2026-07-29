# FASE 8A — IMPLEMENTACIÓN SEGURA DE RESERVAS Y ZONAS COMUNES

Guarda este prompt en:

`docs/programa-mejora/11-reservas-zonas-comunes/01-prompt-claude-implementacion.md`

Guarda el informe final en:

`docs/programa-mejora/11-reservas-zonas-comunes/02-respuesta-claude-implementacion.md`

No hagas commit ni abras otro módulo.

---

Implementa y asegura completamente el módulo de:

* zonas comunes;
* disponibilidad;
* creación de reservas;
* aprobación y rechazo;
* cancelación;
* bloqueos de calendario;
* configuración por zona;
* historial;
* notificaciones relacionadas.

El sistema ya usa identidad global, membresías multi-conjunto y tenant seleccionado. Toda autorización debe derivarse de la membresía activa actual.

## Regla de trabajo

* Inspecciona solamente reservas, zonas comunes, navegación y dependencias directas.
* Conserva la experiencia visual y reglas existentes cuando estén claras.
* Corrige directamente cualquier defecto dentro del alcance.
* No reaudites autenticación, PQRS, billing, invitaciones o cuenta global.
* No hagas verificaciones repetidas de Git.
* Ejecuta pruebas focalizadas durante el trabajo.
* Typecheck y lint una vez al final.
* Suite completa una sola vez al final únicamente cuando las pruebas focalizadas estén verdes.
* No repitas automáticamente la suite.
* No hagas commit.

# 1. Alcance funcional

El producto contempla actualmente zonas como:

* kioscos;
* cancha multideportes;
* squash 1;
* squash 2;
* salón comunal.

No hardcodees estas zonas como únicas. Deben persistirse y configurarse por conjunto.

Cada conjunto debe poder tener:

* sus propias zonas;
* zonas activas o inactivas;
* horarios diferentes;
* duración mínima y máxima;
* número máximo de reservas por semana;
* días bloqueados;
* fechas especiales bloqueadas;
* reservas con aprobación automática o manual;
* instrucciones y reglas propias.

Revisa la UI existente y conecta los flujos actuales a persistencia real.

# 2. Modelo de datos

Revisa el schema existente y reutiliza los modelos adecuados.

El modelo final debe representar, de forma equivalente:

## Zona común

```text
CommonArea
- id
- tenantId
- name
- description
- isActive
- requiresApproval
- minDurationMinutes
- maxDurationMinutes
- maxReservationsPerWeek
- openingTime
- closingTime
- blockedWeekdays
- rules
- createdAt
- updatedAt
```

## Reserva

```text
Reservation
- id
- tenantId
- commonAreaId
- membershipId
- createdByUserId
- startAt
- endAt
- status
- notes
- reviewedByUserId
- reviewedAt
- rejectionReason
- cancelledAt
- cancelledByUserId
- createdAt
- updatedAt
```

## Bloqueo extraordinario

```text
CommonAreaBlock
- id
- tenantId
- commonAreaId
- startAt
- endAt
- reason
- createdByUserId
```

Adapta nombres y enums al schema real.

No mantengas datos de reservas únicamente en memoria.

## Relaciones obligatorias

Toda reserva debe quedar ligada a:

* tenant;
* zona común;
* membresía del residente;
* identidad global que ejecutó la acción.

No uses únicamente `userId` para representar pertenencia a un conjunto.

# 3. Migración

Si los modelos no existen o son incompletos:

* crea una migración Prisma aditiva;
* preserva datos actuales;
* no uses `prisma db push`;
* aplica la migración a la base de pruebas mediante el runner protegido;
* documenta cualquier dato legacy o transición pendiente.

No incluyas cambios destructivos innecesarios.

# 4. Zona horaria

La operación del producto es inicialmente en Colombia.

Usa:

```text
America/Bogota
```

Reglas:

* almacena instantes en UTC;
* interpreta horarios configurados según la zona horaria del conjunto;
* no uses la zona horaria local del servidor;
* no construyas fechas mezclando strings ambiguos;
* define claramente el inicio y fin de semana para los límites;
* considera reservas que crucen medianoche únicamente si la política existente lo permite.

Si `Tenant` ya tiene zona horaria, úsala. De lo contrario, utiliza `America/Bogota` como default persistido o centralizado.

# 5. Permisos

Determina la política existente y conserva el producto actual.

Como mínimo:

## RESIDENTE

Puede:

* listar zonas activas de su conjunto;
* consultar disponibilidad;
* crear reservas para su propia membresía;
* consultar sus propias reservas;
* cancelar sus propias reservas según la política vigente.

No puede:

* reservar para otra membresía;
* enviar tenant, membership o usuario efectivo;
* aprobar o rechazar;
* configurar zonas;
* ver reservas privadas de otros residentes;
* cambiar estado directamente.

## ADMIN

Puede, únicamente en su tenant:

* listar todas las reservas;
* crear o gestionar zonas;
* configurar reglas;
* crear bloqueos;
* aprobar;
* rechazar;
* cancelar administrativamente;
* consultar el calendario completo.

## CONSEJO

Conserva la política actual. Si no existe una regla explícita diferente:

* puede consultar calendario y zonas del conjunto;
* no puede configurar, aprobar, rechazar o cancelar reservas ajenas.

## SUPER_ADMIN

No opera reservas directamente salvo política preexistente.

Si necesita inspección, debe usar target explícito y validado. No debe utilizar un tenant implícito de sesión.

# 6. Aislamiento multi-tenant

Todas las consultas y mutaciones deben incluir el tenant autorizado.

No permitas operaciones únicamente por:

```text
where: { id }
```

Una reserva debe resolverse mediante un alcance equivalente a:

```text
id + tenantId
```

Para RESIDENTE, además:

```text
membershipId
```

Una zona, reserva o bloqueo:

* inexistente;
* de otro tenant;
* de otra membresía no visible;

debe producir una respuesta opaca y coherente.

El `tenantId`, `membershipId`, `createdByUserId`, rol y estado enviados por el cliente nunca conceden acceso.

# 7. Creación de reservas

El servidor debe imponer:

* tenant;
* membresía;
* creador;
* estado inicial;
* duración;
* zona;
* timestamps.

Valida:

1. zona existente, activa y del tenant;
2. membresía activa;
3. fecha futura;
4. inicio anterior al final;
5. duración mínima y máxima;
6. horario permitido;
7. día de semana habilitado;
8. ausencia de bloqueo extraordinario;
9. límite semanal;
10. ausencia de solapamiento;
11. campos de texto con límites;
12. reglas de anticipación existentes;
13. estado inicial:

* `PENDING` si requiere aprobación;
* `APPROVED` si es automática.

No confíes en el frontend para ninguna de estas reglas.

# 8. Prevención de doble reserva

Este es el punto más crítico.

Dos solicitudes concurrentes para la misma zona y horario no pueden crear dos reservas activas.

Considera como ocupantes, según el modelo real:

* `PENDING`;
* `APPROVED`.

No deben bloquear espacio:

* `REJECTED`;
* `CANCELLED`.

Usa semántica de intervalo:

```text
[startAt, endAt)
```

Así, una reserva que termina a las 10:00 permite otra que inicia a las 10:00.

La prevención debe ser segura en PostgreSQL real.

Puedes usar:

* constraint de exclusión PostgreSQL;
* advisory lock transaccional por zona y ventana;
* serialización y consulta de solapamientos dentro de transacción;
* otro mecanismo equivalente y demostrable.

No confíes únicamente en:

```text
consultar disponibilidad
→ después crear
```

porque tiene condición de carrera.

Si utilizas constraint SQL no representable completamente por Prisma:

* créalo en la migración;
* documenta su función;
* mapea el error a una respuesta pública controlada.

# 9. Límite semanal concurrente

`maxReservationsPerWeek` debe calcularse por:

* tenant;
* membresía;
* zona o conjunto según la regla existente;
* semana local del conjunto;
* estados que consumen cupo.

Dos solicitudes concurrentes no pueden superar el límite semanal.

Usa lock o serialización apropiada.

Documenta exactamente:

* cuándo empieza la semana;
* cuáles estados cuentan;
* si el límite es por zona o total.

No inventes una política diferente si la UI o modelo ya la define.

# 10. Aprobación y rechazo

Solo un rol autorizado puede revisar.

Garantiza transiciones válidas:

```text
PENDING → APPROVED
PENDING → REJECTED
PENDING → CANCELLED
APPROVED → CANCELLED
```

No permitas, salvo regla explícita:

```text
REJECTED → APPROVED
CANCELLED → APPROVED
```

La aprobación debe volver a verificar:

* que la zona continúa activa;
* que no existe bloqueo;
* que no hay solapamiento;
* que la reserva todavía está `PENDING`.

Dos administradores aprobando simultáneamente deben producir un solo resultado válido.

Guarda:

* actor;
* fecha;
* razón de rechazo cuando aplique;
* auditoría mínima.

# 11. Cancelación

Define y conserva la política existente.

Como mínimo:

* RESIDENTE cancela únicamente su reserva;
* ADMIN puede cancelar dentro de su tenant;
* cancelación es idempotente o devuelve un resultado controlado;
* una reserva ya terminada no se cancela como futura;
* no se elimina físicamente el historial;
* se conserva actor y fecha;
* cancelar libera el horario para futuras reservas.

No permitas que un residente cancele mediante un ID conocido de otra persona.

# 12. Bloqueos de calendario

ADMIN puede crear bloqueos por:

* mantenimiento;
* evento interno;
* cierre extraordinario;
* indisponibilidad.

Valida:

* tenant y zona;
* rango válido;
* motivo limitado;
* no aceptar actor o tenant desde cliente.

Define qué ocurre si el bloqueo cruza reservas existentes:

* rechazar el bloqueo;
* advertir y exigir confirmación;
* cancelar reservas afectadas;

según la política existente.

No canceles reservas silenciosamente.

# 13. Configuración de zonas

ADMIN puede configurar únicamente zonas de su tenant.

Usa whitelist estricta para:

* nombre;
* descripción;
* activo;
* requiere aprobación;
* duración;
* horario;
* límite semanal;
* días bloqueados;
* reglas.

Valida coherencia:

* mínimo ≤ máximo;
* apertura < cierre;
* límites positivos;
* weekdays válidos;
* nombre no vacío;
* zona inactiva no acepta nuevas reservas.

Cambiar configuración no debe alterar reservas históricas.

# 14. Disponibilidad

La API de disponibilidad debe:

* recibir zona y rango limitado;
* validar tenant;
* devolver únicamente información necesaria;
* no exponer nombres, apartamentos o datos personales de otros residentes;
* mostrar intervalos ocupados o libres según la UI;
* aplicar bloqueos;
* aplicar horario y días permitidos;
* limitar rangos excesivos para evitar abuso.

Un residente puede saber que un horario está ocupado, pero no necesariamente quién lo reservó.

# 15. Notificaciones

Usa la infraestructura durable existente cuando corresponda.

Eventos:

* reserva creada pendiente;
* reserva aprobada;
* reserva rechazada;
* reserva cancelada;
* bloqueo que afecte una reserva, si la política lo permite.

Garantiza:

* destinatarios del tenant correcto;
* `User.isActive` y `Membership.isActive`;
* idempotencia razonable;
* no duplicar correos por retry;
* contenido HTML escapado;
* no exponer notas administrativas o datos personales innecesarios;
* error de email no revierte una reserva ya confirmada.

No abras transacciones DB mientras se envía correo.

# 16. Auditoría

Registra acciones sensibles:

* creación;
* aprobación;
* rechazo;
* cancelación administrativa;
* cambio de configuración;
* creación/eliminación de bloqueo.

Registra únicamente:

* actor;
* tenant;
* recurso;
* transición;
* campos técnicos mínimos.

No guardes en metadata:

* notas completas;
* apartamento innecesario;
* teléfonos;
* correos;
* contenido privado.

# 17. Errores

Usa respuestas públicas controladas para:

* zona no encontrada;
* reserva no encontrada;
* horario no disponible;
* límite semanal alcanzado;
* configuración inválida;
* transición inválida;
* reserva no cancelable.

Errores inesperados deben ser genéricos.

No devuelvas:

* Prisma;
* SQL;
* constraint;
* advisory lock;
* stack;
* connection string;
* host;
* rutas internas.

# 18. Compatibilidad con UI

Revisa las pantallas actuales de ADMIN, CONSEJO y RESIDENTE.

Conecta:

* listado de zonas;
* calendario;
* creación;
* mis reservas;
* aprobación/rechazo;
* cancelación;
* configuración.

No rediseñes visualmente el módulo.

Elimina estado en memoria únicamente cuando ya exista la persistencia equivalente.

No rompas navegación por rol ni selector de conjunto.

# 19. Cambios permitidos

Puedes modificar únicamente:

* modelos y migración de reservas;
* rutas API/server actions de reservas;
* servicios y políticas de reservas;
* componentes y páginas del módulo;
* notificaciones directas de reservas;
* auditoría directa;
* pruebas específicas;
* documentos 01 y 02.

No modifiques lógica de:

* cuenta global;
* invitaciones;
* PQRS;
* billing;
* pagos;
* documentos;
* paquetes, salvo necesidad crítica justificada.

# 20. Pruebas mínimas

Añade pruebas para:

1. zona de otro tenant no visible;
2. RESIDENTE lista zonas activas propias;
3. RESIDENTE crea para su membresía;
4. body no falsifica tenant;
5. body no falsifica membership o creador;
6. CONSEJO no crea;
7. ADMIN administra solo su tenant;
8. zona inactiva rechaza reserva;
9. fecha pasada rechazada;
10. duración mínima y máxima;
11. horario de apertura/cierre;
12. weekday bloqueado;
13. bloqueo extraordinario;
14. límite semanal;
15. dos reservas concurrentes solapadas → una gana;
16. reservas contiguas son permitidas;
17. cancelada no bloquea el horario;
18. rechazada no bloquea el horario;
19. `PENDING` sí bloquea;
20. aprobación válida;
21. dos aprobaciones concurrentes;
22. transición inválida;
23. RESIDENTE cancela la propia;
24. RESIDENTE no cancela ajena;
25. ADMIN cancela tenant-scoped;
26. cancelación libera horario;
27. bloqueo cross-tenant falla;
28. configuración usa whitelist;
29. disponibilidad no expone PII;
30. límite de rango de calendario;
31. notificación usa destinatario tenant correcto;
32. cuenta o membresía inactiva no recibe notificación;
33. error inesperado genérico;
34. usuario multi-conjunto reserva en el tenant seleccionado;
35. cambiar de tenant no mezcla reservas;
36. camino completo:

* residente crea;
* admin aprueba;
* residente consulta;
* residente cancela.

Usa PostgreSQL real para:

* solapamiento;
* concurrencia;
* límite semanal;
* aprobación;
* cancelación;
* constraints;
* aislamiento multi-tenant.

# 21. Ejecución

Durante el desarrollo:

* ejecuta solo pruebas del módulo;
* no repitas pruebas verdes sin cambios.

Al final:

```text
npx prisma validate
npx tsc --noEmit
npm run lint
```

Cuando:

* migración esté aplicada;
* pruebas focalizadas estén verdes;
* no existan fallos ambientales;

ejecuta una sola vez la suite completa con el runner protegido.

Si la suite falla:

* no la repitas automáticamente;
* corrige únicamente defectos reales;
* reejecuta solo los archivos afectados;
* informa que la suite integral no se repitió.

# 22. Informe final

Entrega:

1. Modelo y migración.
2. Permisos.
3. Aislamiento multi-tenant.
4. Reglas de creación.
5. Prevención de doble reserva.
6. Límite semanal.
7. Aprobación, rechazo y cancelación.
8. Bloqueos y configuración.
9. Disponibilidad.
10. Notificaciones y auditoría.
11. Compatibilidad con UI.
12. Archivos modificados.
13. Pruebas focalizadas.
14. Suite completa.
15. Riesgos restantes.
16. Estado:

* `IMPLEMENTADO`.
* `IMPLEMENTADO CON RIESGOS`.
* `BLOQUEADO`.

No hagas commit, push ni tags. No inicies otro módulo.
