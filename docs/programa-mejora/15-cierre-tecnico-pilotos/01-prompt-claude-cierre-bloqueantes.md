# FASE R1 — CIERRE TÉCNICO MÍNIMO PARA LOS PRIMEROS PILOTOS

Guarda este prompt en:

`docs/programa-mejora/15-cierre-tecnico-pilotos/01-prompt-claude-cierre-bloqueantes.md`

Guarda el informe en:

`docs/programa-mejora/15-cierre-tecnico-pilotos/02-respuesta-claude-cierre-bloqueantes.md`

No hagas commit ni inicies otro módulo.

---

Implementa exclusivamente los cuatro bloqueantes técnicos identificados en la auditoría comercial R0.

El objetivo no es ampliar el producto. Es dejarlo operable y confiable para tres pilotos acompañados.

## Eficiencia

* Inspecciona solo los archivos relacionados con los cuatro bloqueantes.
* No reaudites autenticación, membresías, reservas, pagos de residentes ni cuenta global.
* No construyas documentos, comunicados, directorio, planes o nuevas integraciones.
* Corrige directamente los defectos dentro del alcance.
* Ejecuta pruebas focalizadas.
* Typecheck y lint una vez al final.
* Suite completa una sola vez únicamente si los cambios transversales lo justifican.
* No hagas revisiones repetidas de Git.
* No hagas commit.

# BLOQUEANTE 1 — NOTIFICACIONES DEL PAGO DEL SaaS

## Objetivo

Cuando un pago de la licencia del conjunto sea aprobado o rechazado, el ADMIN debe recibir confirmación clara.

Esto se refiere exclusivamente al billing del SaaS:

* Mercado Pago;
* pagos simulados registrados por SUPER_ADMIN;
* renovaciones;
* activación o rechazo de licencia.

No confundir con pagos de residentes.

## Eventos

Implementa eventos equivalentes a:

```text
SAAS_PAYMENT_APPROVED
SAAS_PAYMENT_REJECTED
```

Puedes reutilizar nombres existentes si están correctamente definidos.

## Requisitos

* Usar el outbox durable existente.
* Crear el evento dentro de la misma transacción que confirma el efecto financiero cuando corresponda.
* No duplicar notificaciones por reintentos de webhook.
* In-app y email.
* Destinatarios:

  * ADMIN activos del tenant;
  * `User.isActive = true`;
  * `TenantMembership.isActive = true`.
* Email después del commit mediante el outbox.
* Contenido escapado.
* No incluir:

  * tokens;
  * datos completos del proveedor;
  * IDs internos innecesarios;
  * cuerpo de error de Mercado Pago;
  * información bancaria sensible.

## Pago aprobado

El mensaje debe confirmar:

* pago aprobado;
* licencia o periodo cubierto;
* fecha efectiva o próxima renovación cuando esté disponible.

No afirmar más de lo que el proveedor confirmó.

## Pago rechazado

Debe explicar de forma genérica:

* que el pago no pudo confirmarse;
* que revise el medio de pago o contacte a la administración comercial;
* qué ocurre con el acceso según la máquina de estados.

No exponer el mensaje crudo del proveedor.

## Caminos obligatorios

Verifica:

1. pago Mercado Pago aprobado;
2. pago Mercado Pago rechazado;
3. pago simulado aprobado por SUPER_ADMIN;
4. webhook duplicado no duplica notificación;
5. resultado ambiguo no se presenta como rechazado definitivo si la política actual usa otro estado.

# BLOQUEANTE 2 — FLUJO PQRS SIMPLE POR CONJUNTO

## Objetivo

Permitir dos plantillas limitadas:

### Flujo simple

```text
Recibida
→ Primer contacto
→ En gestión
→ Cerrada
```

### Flujo de mantenimiento

Conservar el flujo actual:

```text
Recibida
→ Primer contacto
→ Insumos o proveedor
→ Ejecución
→ Cerrada
```

No construyas un editor libre de workflows.

## Modelo

Agrega una configuración tenant-scoped equivalente a:

```text
pqrsWorkflowType:
- SIMPLE
- MAINTENANCE
```

O reutiliza una configuración existente si resulta adecuada.

Default de compatibilidad:

```text
MAINTENANCE
```

Así los conjuntos existentes conservan el comportamiento actual.

## Reglas

### SIMPLE

* Después del primer contacto se pasa a una fase genérica de gestión.
* No obliga a escoger INSUMOS o PROVEEDOR.
* Debe poder cerrarse después de la gestión.
* Historial y auditoría se conservan.

### MAINTENANCE

* Mantiene exactamente las transiciones actuales.
* INSUMOS/PROVEEDOR sigue siendo obligatorio donde corresponda.

## Administración

Permite que ADMIN configure la plantilla de su tenant mediante una operación explícita y validada.

No permitir:

* configuración cross-tenant;
* valor enviado por RESIDENTE o CONSEJO;
* modificar retrospectivamente el historial de PQRS cerradas;
* dejar una PQRS activa en una fase imposible.

Si cambiar el tipo con casos activos crea ambigüedad:

* bloquea el cambio mientras existan casos incompatibles; o
* conserva el workflow asignado al crear cada PQRS.

Prefiere guardar en cada PQRS el workflow efectivo con el que nació, si esto evita que un cambio global altere casos en curso.

## Compatibilidad

* PQRS existentes deben seguir funcionando.
* No modificar evidencias, propiedad, tenant o permisos.
* No flexibilizar todavía descripción, ubicación, duplicados o evidencias: esos puntos se validarán durante los pilotos.

# BLOQUEANTE 3 — VISIBILIDAD DE SOPORTE PARA ADMIN

## Objetivo

El fundador continúa siendo quien responde el soporte técnico del SaaS, pero el ADMIN debe poder ver los tickets creados por usuarios de su propio conjunto.

## Política

### RESIDENTE y CONSEJO

* Pueden crear tickets únicamente dentro de las categorías técnicas permitidas.
* Ven únicamente sus propios tickets.
* No pueden responder ni cerrar.

### ADMIN

* Puede crear tickets.
* Ve:

  * sus propios tickets;
  * tickets creados por miembros de su tenant.
* Solo lectura sobre tickets ajenos.
* No responde en nombre de PQRS Services.
* No cierra tickets del proveedor.
* Debe poder identificar cuándo un residente está usando soporte para un problema que debería ser una PQRS.

### SUPER_ADMIN

* Conserva la cola global.
* Puede responder y cerrar.
* Puede filtrar por tenant.

## Separación mínima de categorías

Distingue entre:

```text
TECHNICAL
ACCESS
PRIVACY_SECURITY
BILLING
```

Para RESIDENTE y CONSEJO no muestres categorías comerciales o administrativas que no les correspondan.

Añade un texto visible indicando:

> Los problemas operativos del conjunto, solicitudes de mantenimiento o reclamos a la administración deben registrarse como PQRS. Este canal es únicamente para problemas técnicos de la plataforma.

No construyas dos sistemas de soporte ni reasignes tickets al ADMIN.

## Seguridad

* Tenant derivado del servidor.
* ADMIN solo ve tickets de su tenant.
* ID cross-tenant opaco.
* Respuestas del soporte no exponen información de otros conjuntos.
* Adjuntos, si existen, siguen su autorización actual.
* Errores inesperados genéricos.

# BLOQUEANTE 4 — SALIDA, EXPORTACIÓN Y REACTIVACIÓN

## Exportación mínima

Implementa una exportación administrativa para la salida de un conjunto.

Debe estar disponible únicamente para SUPER_ADMIN con target explícito y validado.

Contenido mínimo:

### PQRS

* número;
* título;
* categoría;
* estado;
* fechas;
* bloque/apartamento cuando corresponda;
* creador mediante identificador administrativo necesario;
* historial de estados;
* referencias de evidencias, sin exponer secretos ni URLs públicas.

### Usuarios y membresías

* nombre;
* email;
* rol;
* estado de la membresía;
* bloque;
* apartamento;
* fecha de creación.

## Formato

Preferiblemente:

* archivo ZIP con CSV separados; o
* XLSX con hojas separadas.

Reutiliza dependencias existentes.

No agregues una dependencia nueva si CSV es suficiente.

## Privacidad

* Exportación tenant-scoped.
* No incluir:

  * password;
  * hashes;
  * tokens;
  * sessionVersion;
  * service-role key;
  * connection strings;
  * AuditLog completo;
  * mensajes de error internos.
* No incluir archivos binarios dentro del primer alcance.
* Para evidencias, incluir únicamente identificadores y nombres sanitizados.
* Auditar quién generó la exportación.

## Límites

* Evitar cargar volúmenes arbitrarios enteros en memoria si puede paginarse o transmitirse.
* Para los tres pilotos, una exportación sincrónica con límite razonable es aceptable.
* Si el tenant excede el límite, devolver un error controlado que indique exportación asistida.

## Reactivación

En el panel de SUPER_ADMIN:

* mostrar la acción de reactivación para tenants `CANCELLED`, además de `SUSPENDED`;
* reutilizar la operación backend existente;
* exigir evidencia vigente de pago o mecanismo manual autorizado según la política actual;
* registrar auditoría;
* no reactivar automáticamente solo por hacer clic;
* no borrar `cancelledAt` sin que la política existente lo contemple;
* no crear una suscripción duplicada.

# MIGRACIONES

Puedes crear una migración aditiva mínima únicamente para:

* tipo de workflow PQRS;
* workflow efectivo de la PQRS;
* categorías de soporte si el modelo requiere enum nuevo.

No uses `prisma db push`.

Aplica la migración mediante el runner protegido.

# PRUEBAS MÍNIMAS

## Pago SaaS

1. Pago aprobado crea evento durable.
2. Pago rechazado crea evento correcto.
3. Webhook duplicado no duplica.
4. ADMIN de otro tenant no recibe nada.
5. Cuenta o membresía inactiva no recibe.
6. Pago simulado también notifica.
7. Error del proveedor no se filtra.

## Flujo PQRS

8. Tenant MAINTENANCE conserva flujo actual.
9. Tenant SIMPLE no exige INSUMOS/PROVEEDOR.
10. SIMPLE permite gestión y cierre.
11. Workflow se deriva del tenant al crear.
12. Cambio de configuración no altera casos existentes.
13. RESIDENTE/CONSEJO no modifican configuración.
14. Configuración cross-tenant falla.
15. Transición inválida sigue bloqueada.
16. Historial y auditoría se preservan.

## Soporte

17. RESIDENTE crea ticket técnico.
18. ADMIN ve tickets de su tenant.
19. ADMIN no ve otro tenant.
20. ADMIN no responde tickets ajenos.
21. RESIDENTE solo ve propios.
22. SUPER_ADMIN conserva cola global.
23. Categoría inválida rechazada.
24. Mensaje operativo orienta a usar PQRS.

## Exportación y reactivación

25. SUPER_ADMIN exporta tenant objetivo.
26. Usuario tenant no exporta.
27. Export cross-tenant imposible.
28. Export no contiene password/hash/token.
29. PQRS y usuarios aparecen en secciones separadas.
30. Tenant CANCELLED puede reactivarse con condiciones válidas.
31. Reactivación inválida falla.
32. No se duplica suscripción.
33. Auditoría registra exportación y reactivación.

# EJECUCIÓN

Durante el trabajo:

* ejecuta solo pruebas focalizadas;
* no repitas archivos verdes sin cambios.

Al final:

```text
npx prisma validate
npx tsc --noEmit
npm run lint
```

Como existe posible migración y cambios en billing/PQRS/soporte, ejecuta una sola vez la suite completa cuando las pruebas focalizadas estén verdes.

Si falla:

* no repitas automáticamente;
* corrige solo fallos reales relacionados;
* reejecuta únicamente los archivos afectados;
* informa si la suite integral quedó pendiente.

# INFORME FINAL

Entrega:

1. Notificaciones de pago SaaS.
2. Workflow simple y mantenimiento.
3. Soporte visible para ADMIN.
4. Exportación y reactivación.
5. Modelo y migración.
6. Archivos modificados.
7. Pruebas focalizadas.
8. Suite completa.
9. Riesgos restantes.
10. Estado:

* `IMPLEMENTADO`;
* `IMPLEMENTADO CON RIESGOS`;
* `BLOQUEADO`.

No hagas commit.

No inicies otro módulo.
