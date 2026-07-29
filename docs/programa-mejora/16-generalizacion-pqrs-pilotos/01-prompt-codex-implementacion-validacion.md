# FASE R2A — GENERALIZACIÓN DE CATEGORÍAS Y CORRECCIÓN AUDITADA DE PQRS

Guarda este prompt exacto en:

`docs/programa-mejora/16-generalizacion-pqrs-pilotos/01-prompt-codex-implementacion-validacion.md`

Guarda el informe final completo en:

`docs/programa-mejora/16-generalizacion-pqrs-pilotos/02-respuesta-codex-implementacion-validacion.md`

No hagas commit.

No inicies otra fase.

## 1. Objetivo

Cerrar los dos riesgos técnicos principales identificados antes de incorporar el primer conjunto externo:

1. Las categorías/asuntos de PQRS todavía pueden estar demasiado adaptados al conjunto original.
2. Las reglas actuales impiden corregir errores humanos importantes sin procedimientos manuales o cambios directos en la base de datos.

Implementa exclusivamente:

* catálogo mínimo de categorías configurable por tenant;
* asignación de workflow por categoría;
* snapshot histórico de categoría y workflow;
* acción administrativa de corrección con motivo y auditoría;
* procedimiento seguro para retirar u ocultar evidencia sensible;
* pruebas de aislamiento y compatibilidad;
* ejecución integral de la suite una vez al final.

No construyas nuevos módulos.

## 2. Orden y alcance

Codex será el implementador de esta fase.

Debe:

* inspeccionar;
* diagnosticar;
* implementar;
* corregir;
* probar;
* documentar.

No debe hacer commit.

Después, Claude realizará la revisión adversarial independiente y decidirá el cierre y commit.

## 3. Restricciones contra sobreconstrucción

No implementes:

* editor visual libre de categorías;
* árbol ilimitado de categorías;
* subcategorías recursivas;
* constructor de workflows;
* nuevos workflows aparte de `SIMPLE` y `MAINTENANCE`;
* automatizaciones por categoría;
* formularios distintos por categoría;
* fusión avanzada de PQRS;
* etiquetas automáticas mediante IA;
* integración con WhatsApp;
* nuevos módulos;
* paywalls;
* planes comerciales;
* lógica de precios.

La solución debe ser limitada, segura y operable para tres pilotos.

## 4. Auditoría inicial del modelo actual

Antes de modificar, determina:

* cómo se representa actualmente la categoría o asunto de una PQRS;
* si existe enum, string, categoría y subtipo;
* qué categorías están hardcodeadas;
* dónde aparecen los subtipos específicos de humedad;
* qué pantallas y reportes dependen de esos valores;
* cómo se muestra la categoría en:

  * creación;
  * detalle;
  * listado;
  * dashboard;
  * reportes;
  * exportaciones;
  * correos;
  * notificaciones.

No elimines campos legacy sin una migración segura y evidencia de que ya no existen lectores.

## 5. Catálogo inicial

Cada tenant debe disponer de un catálogo mínimo basado en estas ocho categorías generales:

```text
CONVIVENCIA
SEGURIDAD_VIGILANCIA
ACCESOS_CORRESPONDENCIA
MANTENIMIENTO
ZONAS_COMUNES
CARTERA_PAGOS
ADMINISTRACION_CERTIFICADOS
OTROS
```

Etiquetas iniciales sugeridas:

```text
Convivencia
Seguridad y vigilancia
Accesos y correspondencia
Mantenimiento
Zonas comunes
Cartera y pagos
Administración y certificados
Otros
```

La clave interna debe ser estable.

La etiqueta visible puede modificarse por tenant sin alterar:

* históricos;
* relaciones;
* reportes anteriores;
* identificadores internos.

## 6. Configuración por tenant

Por cada categoría, ADMIN debe poder:

* activar o desactivar;
* cambiar la etiqueta visible;
* cambiar el orden;
* definir el workflow para nuevas PQRS:

  * `SIMPLE`;
  * `MAINTENANCE`.

El tenant puede tener hasta **tres categorías personalizadas** adicionales.

Una categoría personalizada debe tener:

* ID estable;
* tenant;
* nombre visible;
* slug interno generado por servidor;
* orden;
* estado activo;
* workflow;
* indicador de categoría personalizada;
* actor y fechas de creación.

No permitir que el cliente envíe:

* tenantId efectivo;
* creador;
* slug definitivo;
* ID de otro tenant;
* workflow distinto a los dos permitidos.

## 7. Modelo sugerido

Adapta el diseño al schema real, pero el resultado debe representar algo equivalente a:

```text
PqrsCategory
- id
- tenantId
- canonicalKey nullable
- slug
- displayName
- isActive
- isCustom
- sortOrder
- workflowType
- createdByUserId
- createdAt
- updatedAt
```

Restricciones sugeridas:

```text
unique tenantId + slug
unique tenantId + canonicalKey cuando canonicalKey no sea null
index tenantId + isActive + sortOrder
```

Las categorías generales se crean de forma idempotente para cada tenant.

El límite de tres categorías personalizadas debe imponerse en servidor y ser seguro ante dos creaciones concurrentes.

Usa:

* advisory lock por tenant;
* transacción serializable;
* o garantía equivalente.

No confíes únicamente en:

```text
count
→ create
```

sin coordinación concurrente.

## 8. Relación con PQRS

Una PQRS nueva debe guardar:

* `categoryId`;
* etiqueta histórica o snapshot equivalente;
* `workflowType` efectivo.

El workflow efectivo debe derivarse de la categoría seleccionada en el servidor.

El cliente no puede imponerlo.

Cambiar posteriormente:

* el nombre de la categoría;
* su estado;
* su orden;
* su workflow;

no debe alterar la categoría visible ni el workflow de una PQRS histórica.

Si `Pqrs.workflowType` ya funciona como snapshot, reutilízalo.

Agrega únicamente lo mínimo necesario para conservar también la etiqueta histórica.

## 9. Compatibilidad con datos anteriores

La migración debe ser aditiva.

No uses `prisma db push`.

No elimines inmediatamente los campos anteriores de categoría, tipo o subtipo.

Estrategia preferida:

* agregar relación nueva nullable inicialmente;
* conservar los valores legacy como snapshot o respaldo;
* mapear categorías existentes cuando haya correspondencia segura;
* crear categorías legacy tenant-scoped cuando un valor histórico no pueda mapearse sin perder información;
* exigir la relación nueva para todas las PQRS creadas después de la migración.

Los subtipos históricos específicos de humedad deben continuar mostrándose correctamente en casos anteriores, pero no deben imponerse como categorías obligatorias a tenants nuevos.

Documenta cualquier campo legacy que permanezca temporalmente.

## 10. Creación de PQRS

La API debe devolver únicamente categorías:

* del tenant seleccionado;
* activas;
* ordenadas;
* visibles para creación.

Al crear:

* validar `categoryId + tenantId`;
* rechazar categoría inactiva;
* ignorar o rechazar tenant/workflow/label enviados por el cliente;
* copiar `displayName` como snapshot;
* copiar `workflowType`;
* preservar historial y auditoría existentes.

Un ID de categoría de otro tenant debe producir una respuesta opaca.

Una categoría desactivada:

* no puede usarse para nuevas PQRS;
* sigue apareciendo correctamente en PQRS históricas.

## 11. UI mínima

En configuración de ADMIN agrega una sección simple:

```text
Categorías de PQRS
```

Debe permitir:

* activar/desactivar;
* renombrar;
* ordenar;
* elegir SIMPLE o MAINTENANCE;
* crear hasta tres categorías personalizadas.

No construyas drag-and-drop si botones de orden o un campo numérico son suficientes.

La UI debe explicar:

* `SIMPLE`: solicitudes administrativas, convivencia, consultas o certificados;
* `MAINTENANCE`: casos que requieren inspección, insumos/proveedor y ejecución.

RESIDENTE debe ver únicamente las categorías activas.

CONSEJO y ADMIN deben seguir viendo correctamente categorías históricas desactivadas.

## 12. Corrección auditada de PQRS

Implementa una única acción administrativa explícita:

```text
Corregir caso
```

Ruta sugerida:

```text
POST /api/pqrs/[id]/corregir
```

O adapta una ruta existente si mantiene separación clara.

Solo ADMIN del tenant de la PQRS puede ejecutarla.

No debe ser un PATCH general libre.

## 13. Campos corregibles

La acción puede permitir, con whitelist estricta:

* categoría;
* bloque;
* apartamento;
* responsable administrativo;
* workflow;
* ruta `INSUMOS/PROVEEDOR`;
* fase o estado seleccionado incorrectamente.

No es obligatorio que todos los campos se modifiquen en una misma operación.

Debe existir al menos un cambio real.

No aceptar:

* tenant;
* creador original;
* timestamps;
* ID de auditoría;
* ID de otra membresía;
* path de Storage;
* campos financieros;
* contenido arbitrario fuera de la whitelist.

## 14. Motivo obligatorio

Toda corrección debe exigir:

```text
reason
```

Reglas:

* obligatorio;
* longitud mínima razonable;
* longitud máxima razonable;
* sin caracteres de control;
* no se guarda en logs técnicos;
* visible en el historial administrativo.

Ejemplos:

```text
Apartamento registrado incorrectamente.
Categoría seleccionada por error.
La gestión requiere proveedor y no compra directa.
Caso cerrado accidentalmente.
```

## 15. Validación de correcciones

### Categoría

* debe pertenecer al mismo tenant;
* puede estar activa;
* una categoría histórica inactiva solo puede mantenerse, no seleccionarse como nueva corrección salvo política explícita;
* actualizar `categoryId` y snapshot;
* no alterar otras PQRS.

### Bloque y apartamento

* normalizar según las reglas actuales;
* no modificar el perfil global o membresía del residente;
* la corrección afecta únicamente esa PQRS;
* conservar antes y después.

### Responsable

* debe ser una membresía activa del mismo tenant;
* debe tener un rol permitido;
* no aceptar un usuario global sin membresía válida.

### Workflow

Solo:

```text
SIMPLE
MAINTENANCE
```

Cambiar workflow debe validar la fase actual.

No puede dejar una PQRS en una fase imposible.

### Ruta INSUMOS/PROVEEDOR

Solo aplica a `MAINTENANCE`.

Debe poder corregirse administrativamente con motivo si se eligió la ruta incorrecta.

### Estado o fase

No permitir valores arbitrarios.

Debe existir una tabla explícita de fases válidas por workflow.

Si se corrige una PQRS cerrada:

* utilizar una acción explícita de reapertura;
* registrar la transición;
* no borrar la fecha o historial anterior silenciosamente;
* conservar que el caso estuvo cerrado y fue reabierto.

No sobrescribir simplemente el estado sin historial.

## 16. Atomicidad e idempotencia

La corrección debe ser atómica:

* validar recurso y tenant;
* validar todos los cambios;
* actualizar PQRS;
* crear historial;
* crear auditoría;
* conservar before/after técnico mínimo.

Si el cliente reintenta por un resultado de red ambiguo, no debe crear correcciones o auditorías duplicadas.

Usa un `operationId` estable o mecanismo idempotente equivalente.

No confíes en un doble clic de UI como única protección.

## 17. Auditoría

Registra:

* actor;
* tenant;
* PQRS;
* operación;
* campos modificados;
* valores anteriores y nuevos estrictamente necesarios;
* motivo;
* fecha.

No registrar:

* archivos;
* base64;
* URLs firmadas;
* tokens;
* contenido completo de evidencia;
* datos sensibles innecesarios;
* stack;
* error de Prisma.

Si el sistema actual tiene `HistorialPqrs` y `AuditLog`, ambos deben quedar coherentes.

## 18. Evidencia sensible o incorrecta

Inspecciona el flujo actual de eliminación de evidencias.

Debe existir un procedimiento seguro para que ADMIN pueda retirar u ocultar una evidencia:

* del mismo tenant;
* asociada a la PQRS correcta;
* con motivo obligatorio;
* con auditoría;
* sin aceptar path desde el cliente;
* conservando metadata mínima de que existió y fue retirada;
* sin exponer el archivo después del retiro.

Si hoy el endpoint elimina físicamente la fila y pierde toda trazabilidad, corrígelo de forma mínima.

No es necesario permitir todavía que RESIDENTE elimine directamente.

Puede existir una opción visible:

```text
Retirar evidencia por información incorrecta o sensible
```

Storage:

* autorizar antes de borrar;
* usar únicamente path almacenado;
* limpieza best-effort;
* no mantener transacción DB abierta durante la llamada a Storage;
* no exponer errores del proveedor.

No construyas redacción parcial ni edición de imágenes.

## 19. Duplicados

No implementes fusión avanzada.

Puedes añadir únicamente una corrección administrativa opcional:

```text
Marcar como duplicada de otra PQRS
```

solo si puede realizarse de manera pequeña y segura.

Si requiere un rediseño, déjalo documentado para validación durante pilotos.

No bloquea esta fase.

## 20. Aislamiento multi-tenant

Prueba expresamente:

* categoría de otro tenant no visible;
* categoría de otro tenant no seleccionable;
* ADMIN no configura otro tenant;
* ADMIN no corrige PQRS de otro tenant;
* responsable de otro tenant no asignable;
* evidencia de otro tenant no retirable;
* un usuario multi-conjunto opera únicamente en el tenant seleccionado;
* mismos slugs o nombres permitidos entre tenants cuando corresponda.

Recursos inexistentes, cross-tenant o no autorizados deben producir respuestas opacas.

## 21. Reportes, exportaciones y notificaciones

Actualiza únicamente lo necesario para que:

* listados muestren el snapshot correcto;
* reportes agrupen categorías actuales sin perder históricos;
* exportación muestre la categoría histórica correcta;
* correos y notificaciones no dependan de enums hardcodeados;
* categorías desactivadas no desaparezcan de casos anteriores.

No agregues nuevos reportes.

No rediseñes dashboards.

## 22. Migración

Crea una migración aditiva.

Debe incluir, si aplica:

* modelo de categorías;
* relación desde PQRS;
* snapshot visible;
* registro durable de corrección o `operationId`;
* campos de retiro de evidencia.

Default y backfill deben conservar el comportamiento actual.

Aplica mediante:

```text
npm run test:db:deploy
```

No uses `prisma db push`.

Documenta:

* campos legacy conservados;
* backfill;
* categorías no mapeadas;
* estrategia de retiro posterior.

## 23. Pruebas mínimas de categorías

1. Se crean las ocho categorías iniciales por tenant.
2. La inicialización es idempotente.
3. Mismo catálogo permitido en tenants distintos.
4. ADMIN configura solo su tenant.
5. RESIDENTE no configura.
6. CONSEJO no configura.
7. Renombrar no cambia PQRS históricas.
8. Desactivar impide nuevas PQRS.
9. Desactivar no oculta históricos.
10. Workflow se deriva de categoría.
11. Cliente no falsifica workflow.
12. Categoría cross-tenant falla.
13. Se permite categoría personalizada.
14. Cuarta categoría personalizada falla.
15. Dos creaciones concurrentes no superan el límite.
16. Orden se conserva.
17. Label y slug se validan.
18. Valores legacy continúan visibles.
19. Reporte muestra categoría histórica.
20. Exportación muestra categoría histórica.

## 24. Pruebas mínimas de corrección

21. ADMIN corrige categoría con motivo.
22. ADMIN corrige bloque/apartamento.
23. ADMIN corrige responsable del mismo tenant.
24. Responsable de otro tenant falla.
25. ADMIN corrige ruta INSUMOS/PROVEEDOR.
26. Ruta no aplica a SIMPLE.
27. ADMIN corrige workflow compatible.
28. Workflow incompatible con fase falla.
29. Corrección de fase crea historial.
30. Reapertura conserva el cierre anterior.
31. Motivo ausente falla.
32. Campo no permitido falla.
33. PQRS cross-tenant falla de forma opaca.
34. Reintento con mismo operationId no duplica corrección.
35. AuditLog e HistorialPqrs quedan coherentes.
36. RESIDENTE no corrige.
37. CONSEJO no corrige.
38. Corrección no modifica membresía global.

## 25. Pruebas mínimas de evidencia

39. ADMIN retira evidencia del tenant.
40. Evidencia cross-tenant falla.
41. Motivo obligatorio.
42. Evidencia retirada deja de descargarse.
43. Metadata de retiro permanece.
44. Path enviado por cliente se ignora o rechaza.
45. Fallo de Storage no expone detalles.
46. Auditoría registra el retiro sin contenido sensible.

## 26. Smoke test con dos tenants

Añade o ejecuta un smoke test automatizado con PostgreSQL real que cree dos tenants independientes y verifique al menos:

* categorías distintas;
* mismos nombres sin colisión;
* usuarios distintos;
* creación de PQRS;
* evidencias;
* corrección;
* historial;
* reporte;
* exportación;
* cero mezcla de datos.

No requiere navegador si el repositorio no tiene infraestructura E2E HTTP.

Usa los servicios reales y la base de pruebas protegida.

## 27. Validación externa

No envíes correos reales ni realices cobros reales sin autorización expresa.

Revisa el código y deja un runbook preciso para validar posteriormente:

1. invitación real;
2. recuperación de contraseña;
3. nueva PQRS;
4. cambio de estado;
5. cierre;
6. correo de pago aprobado;
7. correo de pago rechazado;
8. cortesía;
9. pago manual;
10. Mercado Pago real;
11. suspensión;
12. reactivación.

El informe debe distinguir:

```text
PROBADO AUTOMÁTICAMENTE
PROBADO CON SIMULACIÓN LOCAL
PENDIENTE DE PRUEBA EXTERNA REAL
```

No presentes una integración como validada en producción si no se ejecutó realmente.

## 28. Ejecución

Durante el desarrollo:

* ejecuta solo pruebas focalizadas;
* no repitas archivos verdes sin cambios;
* no revises HEAD, branch o historial al comenzar.

Al final:

```text
npx prisma generate
npx prisma validate
npx tsc --noEmit
npm run lint
```

Después ejecuta **una sola vez** la suite integral con el runner protegido.

Esto es obligatorio porque:

* la última suite completa se ejecutó antes de las correcciones finales de R1B;
* esta fase modifica el núcleo de PQRS;
* la crítica independiente exige una validación integral previa al piloto.

Si la suite falla:

* no la repitas automáticamente;
* corrige únicamente defectos reales;
* ejecuta primero los archivos afectados;
* repite la suite integral solo si la corrección modifica código transversal y es necesario demostrar el estado final;
* documenta claramente cualquier fallo ambiental.

## 29. Archivos permitidos

Puedes modificar:

* schema y migración relacionada;
* dominio PQRS;
* rutas de categorías y correcciones;
* configuración ADMIN;
* creación y detalle de PQRS;
* historial;
* auditoría directa;
* Storage directo de evidencias;
* reportes y exportación únicamente para compatibilidad;
* pruebas;
* documentación de esta fase.

No modifiques:

* reservas;
* pagos de residentes;
* billing, salvo una incompatibilidad directa demostrable;
* cuenta global;
* invitaciones;
* soporte;
* precios;
* planes;
* landing;
* otros módulos.

## 30. Informe final

Entrega:

1. Diagnóstico del modelo anterior.
2. Modelo de categorías.
3. Migración y compatibilidad.
4. Configuración por tenant.
5. Creación de PQRS.
6. Corrección auditada.
7. Retiro de evidencia.
8. Aislamiento multi-tenant.
9. Reportes y exportaciones.
10. Pruebas focalizadas.
11. Smoke test de dos tenants.
12. Suite integral.
13. Runbook de validación externa.
14. Riesgos restantes.
15. Archivos modificados.
16. Estado:

* `IMPLEMENTADO`;
* `IMPLEMENTADO CON RIESGOS`;
* `BLOQUEADO`.

No hagas commit.

No hagas push ni tags.

No inicies otra fase.

Respeta las reglas permanentes de carpetas, archivos, orden Codex/Claude, revisión independiente y commits definidas para este proyecto.
