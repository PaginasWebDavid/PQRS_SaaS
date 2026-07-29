# FASE 9B — REVISIÓN ADVERSARIAL Y CIERRE DE PAGOS DE RESIDENTES

Guarda este prompt en:

`docs/programa-mejora/12-pagos-residentes/03-prompt-codex-revision-cierre.md`

Guarda el informe en:

`docs/programa-mejora/12-pagos-residentes/04-respuesta-codex-revision-cierre.md`

## Regla adaptativa

Revisa adversarialmente pagos de residentes, importaciones y comprobantes.

* Si no encuentras defectos críticos, altos o medios: aprueba y crea el commit.
* Si encuentras defectos acotados:

  * corrígelos directamente;
  * añade o ajusta únicamente las pruebas necesarias;
  * ejecuta solo las pruebas afectadas;
  * ejecuta Prisma validate, typecheck y lint una vez;
  * crea el commit si todo queda verde.
* Detente sin commit únicamente si existe:

  * defecto crítico;
  * problema estructural de modelo;
  * migración incorrecta que requiera rediseño;
  * cambio amplio no validable de forma focalizada.

No abras otro módulo.

## Eficiencia

* No revises rama, HEAD, historial ni staged al comenzar.
* No repitas la suite completa: ya quedó **638/638 verde**.
* No repitas pruebas, Prisma, typecheck o lint si no modificas código.
* Revisa solo el diff de Fase 9A y dependencias directas.
* No reaudites billing del SaaS, reservas, PQRS, invitaciones o autenticación.
* Informe final breve.

## Archivos principales

```text
prisma/schema.prisma
prisma/migrations/20260730000100_add_resident_payments/migration.sql

src/domains/payments/payment-security.ts
src/domains/payments/payment-excel.ts
src/domains/payments/payment.service.ts
src/domains/payments/payment-import.service.ts

src/app/api/pagos/route.ts
src/app/api/pagos/[id]/route.ts
src/app/api/pagos/[id]/cancelar/route.ts
src/app/api/pagos/[id]/pagos/route.ts
src/app/api/pagos/[id]/comprobantes/route.ts
src/app/api/pagos/movimientos/[id]/revertir/route.ts
src/app/api/pagos/comprobantes/route.ts
src/app/api/pagos/comprobantes/[id]/revisar/route.ts
src/app/api/pagos/comprobantes/[id]/retirar/route.ts
src/app/api/pagos/comprobantes/[id]/archivo/route.ts
src/app/api/pagos/importar/route.ts
src/app/api/pagos/importaciones/route.ts
src/app/api/pagos/importaciones/[id]/route.ts
src/app/api/pagos/resumen/route.ts

src/app/admin/pagos/page.tsx
src/app/residente/pagos/page.tsx
src/app/consejo/pagos/page.tsx

src/lib/storage.ts
src/domains/notifications/notification.service.ts

tests/unit/payment-security.test.ts
tests/unit/payment-excel.test.ts
tests/payment-integration.test.ts
```

Lee los documentos 01 y 02 de esta fase.

# 1. Separación respecto al billing SaaS

Confirma que el módulo residencial no modifica ni mezcla:

* `Payment` del SaaS;
* `Subscription`;
* webhooks;
* Mercado Pago;
* cron de mora del tenant;
* estados de licencia.

Verifica que nombres, servicios y rutas no provoquen imports ambiguos entre:

```text
ResidentPayment
vs.
Payment
```

# 2. Modelo de unidad y privacidad histórica

Revisa cuidadosamente `ResidentUnit`.

Confirma:

* unicidad por `tenantId + bloque + apto`;
* mismo bloque/apto permitido entre tenants;
* bloque y apartamento normalizados de forma consistente;
* una membresía sin ubicación válida no puede acceder a pagos;
* el cliente no puede seleccionar arbitrariamente una unidad.

Determina explícitamente la política de acceso histórico:

* una obligación pertenece a la unidad;
* un comprobante pertenece a la membresía que lo subió;
* un nuevo residente de la misma unidad puede o no ver obligaciones y pagos anteriores;
* nunca debe poder descargar comprobantes cargados por una membresía anterior.

Verifica que:

* los comprobantes se filtran por `membershipId` para RESIDENTE;
* las descargas también;
* pagos y referencias administrativas no expongan PII del residente anterior;
* cambiar `bloque/apto` de una membresía no le conceda acceso accidental a comprobantes históricos ajenos.

Si la política de historial por unidad es ambigua, conserva obligaciones y saldo por inmueble, pero mantén comprobantes estrictamente por membresía.

# 3. Dinero

Confirma que usar `Int` en centavos es consistente y seguro:

* no existe conversión con coma flotante después del parseo;
* no se usa `parseFloat` seguido de operaciones financieras repetidas;
* montos grandes no superan el rango de `Int` de PostgreSQL;
* se establece un máximo de monto razonable;
* `amountCents > 0`;
* `paidCents >= 0`;
* `paidCents <= amountCents` en todos los caminos;
* reversión nunca deja saldo negativo;
* sobrepago se rechaza.

Revisa cómo se interpretan strings Excel como:

```text
150000
150000.33
150.000,33
150,000.33
```

No deben convertirse silenciosamente de forma ambigua. Los valores numéricos reales de Excel pueden aceptarse; strings ambiguos deben rechazarse.

# 4. Importación e idempotencia

Confirma:

* `.xlsx` real;
* `.xls`, `.xlsm` y archivos renombrados rechazados;
* encabezados exactos;
* fórmulas rechazadas;
* límite de bytes;
* límite de filas;
* errores por fila sanitizados;
* tenant, actor y unidad no provienen del archivo.

## Duplicados

Revisa la clave:

```text
tenantId + unitId + period + concept
```

Confirma que representa la política real. Determina si impediría legítimamente dos conceptos iguales separados en el mismo periodo.

No cambies la clave salvo que exista un defecto claro; documenta como decisión de producto si se necesita una referencia externa en la unicidad.

## Carreras obligatorias

Revisa:

### Importación vs importación

Dos importaciones iguales:

* una crea;
* otra cuenta duplicado;
* no abortan la transacción.

### Importación vs creación manual

Una importación y una creación manual concurrentes de la misma obligación:

* no deben provocar `25P02`;
* no deben duplicar;
* el batch debe terminar en un estado coherente.

El advisory lock de importación por tenant solo protege si la creación manual usa una coordinación compatible. Si no la usa, corrige mediante:

* lock común;
* `INSERT ... ON CONFLICT`;
* o estrategia equivalente que no deje la transacción abortada.

### Fila duplicada inesperada

La constraint única debe seguir siendo barrera final. Verifica que un `P2002` inesperado no sea atrapado dentro de una transacción ya abortada para continuar ejecutando statements.

### Fallo intermedio

Un error inesperado durante el batch no puede dejar:

* batch `COMPLETED` con conteos incorrectos;
* obligaciones creadas sin resultado durable;
* respuesta que afirme éxito total.

# 5. Obligaciones, pagos y saldo

Todos los caminos que cambian saldo deben compartir el lock de obligación:

* aprobación de comprobante;
* registro manual;
* reversión;
* cancelación de obligación;
* cualquier corrección financiera.

Verifica carreras:

### Aprobación vs pago manual

No pueden superar el saldo.

### Dos pagos manuales

No pueden provocar sobrepago.

### Aprobación vs cancelación

No puede quedar:

* obligación cancelada con pago recién aplicado;
* comprobante aprobado sin pago;
* pago aplicado a obligación cancelada.

### Reversión vs nuevo pago

Debe existir un único saldo final coherente.

### Doble reversión

Solo una puede cambiar el saldo.

Confirma que `ResidentCharge.paidCents` y `status` se actualizan en la misma transacción que `ResidentPayment`.

# 6. Comprobantes y Storage

Confirma:

* obligación propia;
* tenant propio;
* membership activa;
* cuenta global activa;
* archivo privado;
* path generado por servidor;
* path guardado exactamente igual al retornado por `uploadToStorage`;
* MIME, firma, extensión, tamaño, contenido y nombre validados;
* sin URL pública;
* descarga autenticada antes de Storage;
* RESIDENTE solo descarga su comprobante;
* ADMIN solo dentro del tenant;
* CONSEJO bloqueado.

## Carreras obligatorias

### Aprobación vs retiro

Un comprobante no puede terminar simultáneamente:

* `APPROVED`;
* `WITHDRAWN`.

Debe existir lock o CAS compatible.

Si gana la aprobación:

* no se elimina el archivo necesario para auditoría.

Si gana el retiro:

* no se crea pago.

### Aprobación vs rechazo

Un solo resultado y un solo pago como máximo.

### Doble retiro

No debe generar auditoría o notificación duplicada.

### Descarga vs retiro

Puede fallar de forma controlada, pero nunca servir un archivo de otro residente ni aceptar un path del cliente.

### Fallo DB después de upload

Debe compensar el objeto nuevo best-effort.

### Fallo Storage al retirar

Define y verifica el orden:

* no debe marcarse eliminado de manera engañosa si la política exige conservar el archivo;
* o debe registrar claramente cleanup pendiente.

No mantengas una transacción DB abierta durante Storage.

# 7. Revisión administrativa

Confirma:

* solo ADMIN del tenant;
* comprobante `PENDING`;
* obligación activa;
* saldo suficiente;
* monto positivo;
* tenant, unidad y charge coherentes;
* revisión usa CAS;
* pago, saldo, comprobante y auditoría son atómicos;
* `REJECTED`, `APPROVED` y `WITHDRAWN` son terminales salvo flujo explícito;
* razón de rechazo limitada;
* referencias sanitizadas;
* errores inesperados genéricos.

Revisa si el ADMIN puede introducir un monto arbitrario al aprobar. Debe estar limitado al saldo disponible y quedar auditado; la interfaz no debe sugerir que el monto fue extraído automáticamente del comprobante.

# 8. Registro manual y reversión

Confirma:

* solo ADMIN;
* tenant-scoped;
* obligación no cancelada;
* monto no supera saldo;
* referencia opcional validada;
* actor y origen `MANUAL`;
* reversión exige motivo;
* pago no se borra;
* doble reversión bloqueada;
* saldo y estado recalculados;
* auditoría sin PII o datos bancarios.

# 9. Privacidad e IDOR

Comprueba todas las rutas:

* obligación;
* pago;
* comprobante;
* batch;
* unidad;
* archivo.

Para RESIDENTE debe existir alcance por unidad o membresía según el recurso.

Confirma opacidad entre:

* inexistente;
* otro tenant;
* otra unidad;
* otra membresía.

CONSEJO solo puede recibir agregados.

El resumen no debe permitir inferir fácilmente una deuda individual en conjuntos o filtros de una sola unidad. No implementes privacidad diferencial; simplemente evita dimensiones identificables, filtros por unidad y filas individuales.

# 10. Notificaciones

Confirma:

* tenant correcto;
* cuenta y membresía activas;
* dedupe key estable;
* no duplicar en reintentos;
* envío después del commit;
* error de email no revierte dinero;
* contenido escapado;
* no incluir:

  * archivo;
  * referencia bancaria completa;
  * notas privadas;
  * información de otras unidades.

Revisa específicamente si aprobación/rechazo repetido podría emitir notificación aunque el CAS no haya modificado nada.

# 11. Auditoría

Confirma que registra:

* batch;
* obligación;
* carga;
* aprobación;
* rechazo;
* retiro;
* pago manual;
* reversión;
* cancelación.

No debe registrar:

* archivo;
* base64;
* URL firmada;
* path completo si no es necesario;
* número de cuenta;
* referencia bancaria completa;
* email;
* teléfono;
* errores del proveedor.

# 12. UI y contratos

Comprueba únicamente fallos funcionales:

* ADMIN puede importar, consultar y revisar;
* RESIDENTE ve solo su unidad;
* CONSEJO solo agregados;
* cambio de tenant limpia datos anteriores;
* estados y centavos se presentan como COP correctamente;
* no se muestran montos divididos o multiplicados por 100 incorrectamente;
* formularios no envían tenant, membership, estado o actor;
* descargas usan el endpoint autenticado;
* errores por fila son comprensibles y sanitizados.

No hagas rediseño visual.

# 13. Pruebas

Claude reportó:

```text
24 pruebas unitarias
37 pruebas PostgreSQL
638/638 suite completa
```

No las repitas si la evidencia y las aserciones son coherentes.

Añade pruebas focalizadas solo si falta alguna garantía, especialmente:

1. importación vs creación manual concurrentes;
2. aprobación vs pago manual concurrentes;
3. aprobación vs cancelación de obligación;
4. aprobación vs retiro del comprobante;
5. reversión vs nuevo pago;
6. doble reversión;
7. strings monetarios ambiguos;
8. residente nuevo en una unidad no descarga comprobantes de una membresía anterior.

Si modificas código:

```text
node --import tsx --test tests/unit/payment-security.test.ts tests/unit/payment-excel.test.ts
```

Ejecuta las pruebas PostgreSQL de pagos mediante el runner protegido.

Después, una vez:

```text
npx prisma validate
npx tsc --noEmit
npm run lint
```

No repitas la suite completa.

# 14. Riesgos

Clasifica:

* archivos huérfanos;
* identidad de unidad creada de forma perezosa;
* historial financiero visible por unidad;
* CONSEJO solo agregado;
* vencimientos retroactivos;
* importación sin pagos;
* dinero en `Int` centavos;
* emails best-effort.

Indica qué bloquea:

* commit;
* despliegue;
* decisión de producto.

# 15. Commit automático

Si el módulo queda correcto o corriges únicamente problemas acotados y las pruebas focalizadas quedan verdes:

1. Ejecuta una sola lista de archivos modificados.
2. Añade los archivos de Fase 9A, cualquier corrección y:

```text
docs/programa-mejora/12-pagos-residentes/
```

3. Revisa una vez el staged diff para:

   * secretos;
   * `.env`;
   * connection strings;
   * archivos Excel reales;
   * comprobantes reales;
   * datos personales;
   * cambios ajenos.
4. Crea:

```text
git commit -m "feat(payments): add secure resident payment management"
```

No ejecutes pruebas después del commit.

# 16. Informe final

Entrega:

1. Defectos encontrados.
2. Correcciones, si hubo.
3. Importación e idempotencia.
4. Dinero y consistencia de saldo.
5. Comprobantes y concurrencia.
6. Privacidad.
7. Pruebas revisadas o ejecutadas.
8. Riesgos.
9. Commit y hash.
10. Resultado:

* `APROBADO Y COMMIT CREADO`.
* `CORREGIDO Y COMMIT CREADO`.
* `BLOQUEADO`.

No inicies otro módulo.
