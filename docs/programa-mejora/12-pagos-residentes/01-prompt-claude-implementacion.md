# FASE 9A — PAGOS DE ADMINISTRACIÓN, IMPORTACIONES Y COMPROBANTES

Guarda este prompt en:

`docs/programa-mejora/12-pagos-residentes/01-prompt-claude-implementacion.md`

Guarda el informe final en:

`docs/programa-mejora/12-pagos-residentes/02-respuesta-claude-implementacion.md`

No hagas commit ni inicies otro módulo.

---

Implementa y asegura el módulo de pagos internos de propiedad horizontal:

* obligaciones o cuotas por apartamento;
* estados de cuenta;
* importación mediante Excel;
* historial;
* saldos;
* comprobantes de pago;
* revisión administrativa;
* privacidad financiera por residente;
* notificaciones relacionadas.

**No modifiques el billing del SaaS**, Mercado Pago, suscripciones, webhooks ni cron de mora del tenant. Este módulo corresponde exclusivamente a pagos entre residentes y su conjunto.

## Forma de trabajo

* Inspecciona solamente pagos de residentes y dependencias directas.
* Conserva la UI y reglas existentes cuando sean claras.
* Corrige directamente los defectos encontrados.
* Usa la membresía y el tenant seleccionados como fuente de autorización.
* Ejecuta pruebas focalizadas durante el desarrollo.
* Typecheck y lint una vez al final.
* Ejecuta la suite completa una sola vez si agregas migración o cambios transversales.
* No repitas automáticamente una suite fallida.
* No revises HEAD, rama o historial.
* No hagas commit.

# 1. Política de acceso

## ADMIN

Dentro de su tenant puede:

* importar obligaciones y pagos;
* consultar todos los apartamentos del conjunto;
* revisar comprobantes;
* actualizar estados mediante operaciones explícitas;
* corregir registros según la política existente;
* consultar errores y resultados de importaciones.

## RESIDENTE

Solo puede:

* consultar información financiera correspondiente a su propia membresía, apartamento o unidad;
* ver su saldo e historial;
* cargar comprobantes para obligaciones propias;
* consultar el estado de sus comprobantes.

No puede:

* consultar apartamentos ajenos;
* falsificar bloque, apartamento, membresía, tenant o usuario;
* modificar valor, periodo, saldo o estado administrativo;
* aprobar su propio comprobante.

## CONSEJO

Conserva la política existente. Si no hay una regla explícita:

* puede acceder únicamente a información agregada del conjunto;
* no puede consultar saldos, comprobantes o movimientos identificables de residentes.

## SUPER_ADMIN

No opera información financiera residencial mediante tenant implícito. Cualquier acceso excepcional debe usar target explícito y validado, solo si ya existe esa política.

# 2. Identidad de apartamento o unidad

Determina cómo representa actualmente el sistema:

* apartamento;
* bloque;
* unidad;
* inmueble;
* propiedad.

No confíes únicamente en textos enviados por el cliente.

Toda obligación y comprobante debe vincularse inequívocamente a:

* tenant;
* unidad o identidad residencial;
* membresía cuando corresponda;
* periodo;
* actor que ejecutó la operación.

Un usuario con membresías en varios conjuntos solo puede ver la información del tenant seleccionado.

Si el proyecto todavía no tiene un modelo estable de unidad, crea la estructura mínima necesaria sin duplicar datos arbitrariamente.

# 3. Modelo y persistencia

Reutiliza modelos existentes si son correctos. El resultado debe representar de forma equivalente:

## Obligación o estado de cuenta

```text
ResidentCharge
- id
- tenantId
- unitId o identidad residencial
- period
- concept
- amount
- dueDate
- status
- source
- importBatchId
- createdAt
- updatedAt
```

## Pago o movimiento

```text
ResidentPayment
- id
- tenantId
- chargeId
- unitId
- amount
- paidAt
- reference
- status
- source
- createdAt
- updatedAt
```

## Comprobante

```text
PaymentReceipt
- id
- tenantId
- chargeId o paymentId
- membershipId
- uploadedByUserId
- storagePath
- originalFileName
- mimeType
- sizeBytes
- status
- reviewedByUserId
- reviewedAt
- rejectionReason
- createdAt
- updatedAt
```

## Importación

```text
PaymentImportBatch
- id
- tenantId
- uploadedByUserId
- fileName
- status
- totalRows
- validRows
- invalidRows
- createdRows
- duplicateRows
- createdAt
- completedAt
```

Adapta nombres al dominio real.

Usa `Decimal` para dinero. No uses `float`.

No mantengas saldos únicamente en memoria.

# 4. Migración

Si el modelo es inexistente o insuficiente:

* crea una migración Prisma aditiva;
* no uses `prisma db push`;
* preserva datos existentes;
* aplica la migración mediante el runner protegido;
* documenta cualquier campo legacy pendiente.

Incluye índices para:

* tenant + periodo;
* tenant + unidad;
* obligación;
* membresía;
* estado;
* batch de importación.

Define constraints o claves idempotentes para impedir duplicados reales.

# 5. Importación Excel

Revisa el flujo existente y hazlo seguro.

## Archivo

Acepta únicamente el formato necesario, preferiblemente:

* `.xlsx`;
* sin macros;
* tamaño máximo razonable;
* máximo de filas razonable;
* hoja y encabezados esperados;
* sin rutas, tenant o actor provenientes del archivo.

Rechaza:

* `.xlsm`;
* `.xls`;
* archivos renombrados;
* fórmulas donde se esperan valores;
* encabezados desconocidos críticos;
* filas totalmente ambiguas;
* montos no numéricos;
* fechas inválidas;
* periodos inválidos;
* valores negativos cuando no correspondan.

No agregues dependencias nuevas si el proyecto ya tiene lector de Excel.

## Validación

Normaliza y valida:

* bloque/apartamento o unidad;
* periodo;
* concepto;
* monto;
* fecha de vencimiento;
* referencia externa.

No conviertas silenciosamente valores ambiguos.

## Resultado

El administrador debe recibir:

* filas creadas;
* duplicadas;
* inválidas;
* errores sanitizados por fila;
* estado final del batch.

No devuelvas stack, SQL, constraints o errores internos.

# 6. Atomicidad e idempotencia de importación

Define claramente si la importación es:

* completamente atómica; o
* parcial por filas.

Prefiere un batch durable con resultado explícito.

Garantiza:

* reintentar el mismo archivo no duplica obligaciones;
* dos importaciones concurrentes no crean duplicados;
* la clave de duplicado incluye tenant y la identidad financiera real;
* un batch fallido no se presenta como completado;
* el administrador puede distinguir error de archivo, fila inválida y duplicado.

Usa transacción, constraint único, advisory lock o combinación equivalente.

No dependas únicamente de:

```text
buscar duplicado
→ crear registro
```

# 7. Valores y saldos

Define una fuente de verdad clara.

Evita almacenar simultáneamente saldos derivados en múltiples lugares sin mecanismo de consistencia.

Garantiza:

* montos en COP con `Decimal`;
* comparación y suma sin errores de coma flotante;
* saldo calculado de forma consistente;
* pagos parciales si la política existente los permite;
* sobrepago rechazado o tratado explícitamente;
* obligación pagada no vuelve a pendiente por una carrera;
* cancelaciones o correcciones mantienen historial;
* no se borra físicamente información financiera sensible sin política explícita.

No inventes contabilidad compleja que la UI no utiliza.

# 8. Comprobantes privados

## Carga

El residente solo puede cargar un comprobante asociado a una obligación propia.

El servidor debe imponer:

* tenant;
* membership;
* usuario;
* obligación;
* estado inicial;
* path;
* timestamps.

No aceptar desde cliente:

* tenantId;
* membershipId;
* userId;
* bucket;
* path;
* estado administrativo;
* revisor.

## Validación de archivo

Permite únicamente lo necesario, por ejemplo:

* PDF;
* JPG/JPEG;
* PNG.

Valida:

* MIME declarado;
* firma binaria real;
* extensión;
* tamaño máximo;
* nombre;
* traversal;
* rutas absolutas;
* NUL;
* contenido vacío.

## Storage

Los comprobantes deben ser privados.

Usa:

* endpoint autenticado que sirva el archivo; o
* URL firmada de corta duración.

No guardes ni devuelvas URL pública permanente.

El path debe derivarse en servidor e incluir separación por tenant y recurso, sin email, apartamento o PII visible.

# 9. Compensación DB/Storage

Garantiza:

* fallo de upload no crea fila DB;
* fallo DB después del upload intenta eliminar el archivo nuevo;
* reemplazo confirma la nueva referencia antes de limpiar la anterior;
* eliminación usa únicamente el path almacenado y validado;
* fallo de limpieza no expone detalles al cliente;
* no se mantiene una transacción DB abierta durante llamadas a Storage.

Un fallo adicional de red puede dejar un archivo huérfano; documenta reconciliación si no puede evitarse.

# 10. Revisión administrativa

Solo ADMIN del tenant puede:

* consultar el comprobante;
* aprobar;
* rechazar;
* registrar motivo;
* asociar el pago según la política real.

Transiciones controladas, por ejemplo:

```text
PENDING → APPROVED
PENDING → REJECTED
```

No permitas:

```text
REJECTED → APPROVED
APPROVED → REJECTED
```

salvo flujo explícito de corrección con auditoría.

Al aprobar:

* revalida obligación;
* revalida tenant y unidad;
* comprueba que el comprobante sigue pendiente;
* evita registrar dos pagos por dos aprobaciones concurrentes;
* actualiza pago, obligación, comprobante y auditoría atómicamente.

Dos administradores revisando simultáneamente deben producir un solo resultado.

# 11. Privacidad e IDOR

Todas las consultas deben incluir tenant autorizado.

Para RESIDENTE añade el alcance residencial o de membresía.

Un ID conocido de:

* obligación;
* pago;
* comprobante;
* import batch;
* unidad;

no puede permitir acceso cross-tenant o cross-resident.

Inexistente, cross-tenant y cross-owner deben ser opacos.

Las respuestas del residente no deben incluir:

* información de otros apartamentos;
* archivos ajenos;
* nombres de otros residentes;
* notas administrativas privadas;
* metadata interna de importación.

# 12. Descarga y eliminación

## Descarga

Debe exigir autorización antes de consultar Storage.

* ADMIN: comprobantes de su tenant.
* RESIDENTE: únicamente comprobantes propios.
* CONSEJO: bloqueado salvo política expresa.

No confíes en un path enviado por query.

## Eliminación

Define la política:

* residente puede retirar un comprobante pendiente propio; o
* únicamente ADMIN puede eliminar/rechazar.

Conserva la regla existente si está clara.

Nunca permitas eliminar un comprobante aprobado sin un flujo financiero explícito de reversión.

# 13. Notificaciones

Usa la infraestructura existente.

Eventos relevantes:

* comprobante recibido;
* comprobante aprobado;
* comprobante rechazado;
* importación completada con errores;
* obligación nueva, si la política actual lo requiere.

Garantiza:

* tenant correcto;
* usuario y membresía activos;
* deduplicación;
* contenido HTML escapado;
* no incluir saldos o información sensible innecesaria;
* envío después del commit;
* fallo de email no revierte la operación financiera.

# 14. Auditoría

Registra:

* importación;
* creación/corrección financiera administrativa;
* carga de comprobante;
* aprobación;
* rechazo;
* eliminación o reversión autorizada.

Metadata mínima:

* recurso;
* periodo;
* estado;
* batch;
* transición;
* conteos técnicos.

No guardes:

* archivo;
* base64;
* path firmado;
* número de cuenta;
* contenido completo del comprobante;
* email;
* teléfono;
* apartamento innecesario;
* errores del proveedor.

# 15. Errores públicos

Mapea mediante lista blanca:

* obligación no encontrada;
* comprobante no encontrado;
* archivo inválido;
* duplicado;
* importación inválida;
* transición inválida;
* monto inválido;
* acceso no permitido.

Errores inesperados devuelven respuesta genérica.

No expongas:

* Prisma;
* SQL;
* constraint;
* Storage;
* bucket;
* host;
* stack;
* connection string;
* contenido interno del Excel.

# 16. UI

Conecta la UI actual:

## ADMIN

* importar Excel;
* ver resultado del batch;
* consultar obligaciones y pagos;
* revisar comprobantes;
* filtrar por periodo, estado y unidad.

## RESIDENTE

* ver su saldo;
* ver obligaciones e historial;
* cargar comprobante;
* consultar estado;
* descargar su archivo.

## CONSEJO

Solo agregados o bloqueo completo según la política definida.

No rediseñes visualmente el módulo.

No mezcles información al cambiar de tenant.

# 17. Pruebas mínimas

Añade pruebas para:

1. ADMIN importa solo en su tenant.
2. RESIDENTE no importa.
3. CONSEJO no importa.
4. Archivo inválido rechazado.
5. Fórmula Excel rechazada.
6. Montos usan Decimal.
7. Fila con tenant falsificado no concede acceso.
8. Duplicado dentro del mismo batch.
9. Reintento del mismo batch no duplica.
10. Dos importaciones concurrentes no duplican.
11. Mismo identificador permitido en tenants distintos.
12. RESIDENTE ve solo su unidad.
13. Usuario multi-conjunto ve solo el tenant seleccionado.
14. ID cross-resident es opaco.
15. Comprobante propio válido.
16. Comprobante para obligación ajena falla.
17. Tenant/membership falsificados ignorados o rechazados.
18. MIME inválido.
19. Firma inválida.
20. Extensión inválida.
21. Tamaño excesivo.
22. Traversal o path arbitrario rechazado.
23. Descarga propia funciona.
24. Descarga ajena falla.
25. ADMIN descarga solo dentro del tenant.
26. Aprobación válida.
27. Rechazo válido.
28. Transición inválida.
29. Dos aprobaciones concurrentes producen un pago.
30. Fallo creando pago revierte aprobación.
31. Pago no supera saldo salvo política explícita.
32. Cuenta o membresía inactiva bloqueada.
33. Notificación usa tenant correcto.
34. Error inesperado genérico.
35. Importación parcial informa resultados correctamente.
36. Cambio de tenant no conserva datos anteriores.
37. Flujo completo:

    * ADMIN importa;
    * RESIDENTE consulta;
    * RESIDENTE carga comprobante;
    * ADMIN aprueba;
    * saldo e historial se actualizan.

Usa PostgreSQL real para:

* importación idempotente;
* constraints;
* concurrencia;
* aprobación;
* saldo;
* aislamiento multi-tenant.

# 18. Ejecución

Durante el desarrollo:

* ejecuta únicamente pruebas del módulo;
* no repitas pruebas verdes sin cambios.

Al final:

```text
npx prisma validate
npx tsc --noEmit
npm run lint
```

Si hubo migración y las pruebas focalizadas están verdes, ejecuta una sola vez la suite completa con el runner protegido.

Si falla:

* no la repitas automáticamente;
* corrige únicamente defectos reales;
* reejecuta solo los archivos afectados;
* informa el estado integral pendiente.

# 19. Informe final

Entrega:

1. Política y modelo financiero.
2. Migración.
3. Importación e idempotencia.
4. Valores y saldos.
5. Comprobantes y Storage.
6. Revisión y concurrencia.
7. Privacidad e IDOR.
8. Notificaciones y auditoría.
9. UI.
10. Archivos modificados.
11. Pruebas focalizadas.
12. Suite completa.
13. Riesgos restantes.
14. Estado:

* `IMPLEMENTADO`.
* `IMPLEMENTADO CON RIESGOS`.
* `BLOQUEADO`.

No hagas commit, push ni tags. No inicies otro módulo.
