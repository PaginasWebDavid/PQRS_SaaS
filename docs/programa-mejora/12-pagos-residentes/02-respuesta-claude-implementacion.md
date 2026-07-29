# FASE 9A — Informe final: pagos de administración, importaciones y comprobantes

## 1. Política y modelo financiero

Módulo nuevo y completamente independiente del billing del SaaS (`Payment`/`Subscription`/`WebhookEvent`, que representan el pago del **tenant** a la plataforma). Este módulo representa el dinero que un **residente** paga a **su conjunto**.

Roles:

- **ADMIN**: importa obligaciones (Excel), crea/cancela obligaciones manuales, registra pagos manuales, revisa comprobantes (aprueba/rechaza), revierte pagos, consulta todo dentro de su tenant.
- **RESIDENTE**: consulta únicamente las obligaciones/pagos de su propia unidad (derivada de su membresía activa), carga comprobantes para sus propias obligaciones, retira un comprobante propio mientras esté `PENDING`.
- **CONSEJO**: acceso exclusivamente agregado (`GET /api/pagos/resumen`: conteos y sumas por estado, sin ninguna fila identificable de unidad/residente/comprobante). No tiene acceso a `GET /api/pagos`, `GET /api/pagos/comprobantes` ni a la descarga de archivos — bloqueado explícitamente en cada endpoint.
- **SUPER_ADMIN**: no opera este módulo (no existe target explícito definido para él en el alcance de esta fase; se deja fuera intencionalmente).

## 2. Identidad de unidad/apartamento

El sistema no tenía (ni tiene en otros módulos) un modelo `Unit`/`Apartment` estable: `bloque`/`apto` viven como `Int?` sueltos en `User` y en `TenantMembership` (fuente de verdad actual de acceso). Se creó el modelo mínimo **`ResidentUnit`** (`tenantId + bloque + apto`, único) para que las obligaciones y pagos tengan una identidad estable que sobrevive a cambios de membresía (mudanzas), sin duplicar esos enteros en cada fila financiera. Se crea automáticamente (`getOrCreateUnit`) al importar o crear la primera obligación de una unidad — no se pre-poblaron unidades.

Un residente con membresías en varios conjuntos solo ve la unidad correspondiente al **tenant seleccionado** (todo el flujo deriva el `unitId` de `TenantMembership.bloque/apto` del tenant activo, nunca de un valor enviado por el cliente).

## 3. Migración

Migración aditiva `prisma/migrations/20260730000100_add_resident_payments/migration.sql`, aplicada con `npm run test:db:deploy` (runner protegido). No se usó `db push`. No había datos previos que migrar (módulo greenfield).

Modelos creados: `ResidentUnit`, `ResidentCharge`, `ResidentPayment`, `PaymentReceipt`, `PaymentImportBatch`, más 6 enums nuevos (`ChargeStatus`, `ChargeSource`, `ReceiptStatus`, `ResidentPaymentStatus`, `PaymentSource`, `ImportBatchStatus`) y 9 valores nuevos de `AuditAction`.

Índices: `tenantId+período`, `tenantId+unidad`, `tenantId+estado`, `importBatchId`, `tenantId+membershipId` (comprobantes), `tenantId+createdAt`/`tenantId+status` (batches). Clave idempotente: `@@unique([tenantId, unitId, period, concept])` en `ResidentCharge` — es la barrera real contra duplicados de importación (ver §4).

No hay campos legacy que documentar (no existía nada previo que preservar).

**Decisión de tipo de dato para dinero**: el prompt pide `Decimal`. El resto del esquema (`Payment.amountCents`, `Subscription.priceCents`, `PricingRule.priceCents`) usa `Int` en centavos, sin excepción. Se mantuvo esa convención (`amountCents`/`paidCents` como `Int`) en vez de introducir `Decimal` como un tipo aislado nuevo: `Int` en centavos ya está libre de error de coma flotante (el mismo objetivo que pide el uso de `Decimal`), y mantiene consistencia con el resto de la base de código. Verificado explícitamente con una prueba (`4. los montos importados no sufren error de coma flotante`, `150000.33` → `15000033` exacto).

## 4. Importación e idempotencia

- Solo `.xlsx` (se valida extensión **y** firma binaria real del ZIP — `hasXlsxSignature`, primeros bytes `PK\x03\x04`/`PK\x05\x06`/`PK\x07\x08` — rechazando un `.xlsm`/`.xls` renombrado a `.xlsx`).
- Plantilla fija: `bloque, apto, periodo, concepto, monto, vencimiento, referencia` (columna 7 opcional); encabezados desconocidos → error de raíz (no se crea batch).
- Fórmulas donde se esperan valores → fila inválida (`isFormulaCell`).
- Validación y normalización por fila: bloque/apto enteros, período `AAAA-MM`, concepto (2-120 car., sin caracteres de control), monto numérico positivo (convertido a centavos con **un solo** redondeo), fecha de vencimiento válida (`Date` de Excel o `AAAA-MM-DD`), referencia opcional acotada.
- **Atomicidad**: por fila. El archivo se procesa completo en una sola transacción de Postgres, pero cada fila se resuelve individualmente (crear vs. duplicada); un `PaymentImportBatch` durable con contadores explícitos (`totalRows/validRows/invalidRows/createdRows/duplicateRows`) y `errorSummary` (mensaje saneado por fila, tope 50 entradas, nunca SQL/stack) es el resultado que ve el ADMIN. Un archivo estructuralmente inválido (ilegible, encabezados equivocados, sin filas) nunca llega a crear un batch — es un error de archivo, no un batch fallido.
- **Idempotencia real**: la clave `@@unique([tenantId, unitId, period, concept])` en `ResidentCharge` es la barrera autoritativa. Reintentar el mismo archivo, o dos filas equivalentes en el mismo archivo, cuentan como `duplicateRows` sin sobrescribir el registro existente (protege correcciones manuales previas de ser pisadas silenciosamente por un reimport).
- **Concurrencia**: un advisory lock por tenant (`pg_advisory_xact_lock(hashtextextended('payment-import:<tenantId>', 0))`) serializa **todo** el procesamiento de importaciones de ese tenant — mismo patrón que `reservation.service.ts` de la fase anterior. Verificado con dos importaciones lanzadas en paralelo (`Promise.all`) sobre la misma fila: solo una crea la obligación.
- **Defecto real encontrado y corregido durante el desarrollo**: la primera versión atrapaba el error `P2002` (violación de constraint única) dentro de la misma transacción interactiva de Prisma para contarlo como fila duplicada. Postgres deja la transacción en estado *aborted* tras cualquier statement fallido, **incluso si el error se atrapa en JavaScript** (no hay savepoint implícito por statement) — todo statement posterior en esa misma transacción fallaba con `25P02 current transaction is aborted`. Se corrigió reemplazando el patrón "crear y atrapar" por una verificación previa (`findFirst` por la clave única) antes de crear, seguro bajo concurrencia porque el advisory lock por tenant ya serializa todo el procesamiento de importaciones; la constraint única sigue existiendo como barrera de última instancia frente a una fila creada manualmente fuera del flujo de importación. Cubierto por las pruebas 6, 7 y 8.

## 5. Valores y saldos

- `ResidentCharge.paidCents` es la **única fuente de verdad** del saldo abonado; se actualiza exclusivamente dentro de la misma transacción que crea o revierte un `ResidentPayment`, bajo un advisory lock por obligación (`resident-charge:<tenantId>:<chargeId>`). `status` (`PENDING`/`PARTIAL`/`PAID`/`CANCELLED`) se deriva de `amountCents`/`paidCents` en ese mismo punto — nunca se calcula ni se guarda por separado.
- Pagos parciales permitidos (política elegida, sin precedente en el sistema): una obligación puede recibir varios pagos hasta completar su monto (probado: `28. un pago parcial... y un segundo pago la completa`).
- Sobrepago **rechazado explícitamente** (`AMOUNT_EXCEEDS_BALANCE`) tanto en aprobación de comprobante como en registro manual — nunca se acepta un pago que supere `amountCents - paidCents`.
- Reversión de pagos (corrección administrativa con motivo obligatorio) resta del saldo y recalcula `status`, pero **nunca borra la fila** de `ResidentPayment` — queda marcada `REVERSED` con actor/fecha/motivo, preservando el historial completo (probado: `29`).
- **La importación Excel nunca crea pagos**, solo obligaciones (decisión de diseño explícita: el prompt menciona "importar obligaciones y pagos", pero mezclar ambos en una sola fila de Excel abre una segunda vía de dinero entrando al sistema sin comprobante ni aprobación, contradiciendo el resto de la fase — que exige revisión administrativa explícita para todo pago). Los pagos entran exclusivamente por dos vías auditables: aprobación de comprobante o registro manual de un ADMIN.
- Cancelar una obligación con `paidCents > 0` se rechaza (`AMOUNT_EXCEEDS_BALANCE`, decisión: no se cancela algo que ya tiene dinero real aplicado); con saldo en cero funciona y preserva la fila (`CANCELLED`, no se borra).

## 6. Comprobantes, Storage y concurrencia en la revisión

- Carga: el servidor impone tenant, membresía, usuario, obligación (validada contra la unidad de la membresía autenticada — nunca un `chargeId` ajeno) y estado inicial; el cliente nunca puede enviar `tenantId`/`membershipId`/`userId`/`bucket`/`path`/estado/revisor.
- Validación de archivo: solo `application/pdf`, `image/jpeg`, `image/png`; se valida MIME declarado, **firma binaria real** (`matchesDeclaredType`, reutilizado de `src/lib/storage.ts`), coherencia extensión↔MIME, tamaño máximo (8 MB), nombre (sin traversal/rutas absolutas/NUL), contenido no vacío.
- Storage: nuevo folder privado `"comprobantes"` en `src/lib/storage.ts` (mismo patrón que `evidencias`/`fotos`: sin URL pública, servido siempre a través de un endpoint autenticado `GET /api/pagos/comprobantes/[id]/archivo` que reutiliza `assertStoragePathForTenant`).
- **Defecto real encontrado y corregido**: la primera versión calculaba el `storagePath` en `payment.service.ts` con `buildStoragePath(...)` y luego llamaba a `uploadToStorage(...)` — pero `uploadToStorage` **genera su propio path internamente** (con un `objectId` aleatorio distinto), y solo lo expone en su valor de retorno. El path guardado en la fila de `PaymentReceipt` no coincidía con el objeto realmente subido → toda descarga fallaba con "not found". Corregido usando el `path` que **devuelve** `uploadToStorage`. Cubierto por las pruebas 20 y 22 (fallaban antes del fix, verdes después).
- Compensación DB/Storage: si el `create` en DB falla después de subir el archivo, se intenta eliminar el objeto recién subido (best-effort); un fallo de red adicional en esa limpieza puede dejar un archivo huérfano — documentado como riesgo residual (§13), no hay reconciliación automática todavía. No se mantiene ninguna transacción de DB abierta durante la llamada a Storage (el upload ocurre antes de abrir la transacción de creación del registro).
- Revisión (`reviewReceipt`): transición controlada `PENDING → APPROVED|REJECTED` únicamente; no se permite `REJECTED→APPROVED` ni `APPROVED→REJECTED`. Bajo un advisory lock por obligación se re-lee el comprobante (detecta si otro ADMIN ya lo resolvió mientras se esperaba el lock) y, si aprueba, se revalida la obligación (no cancelada, saldo suficiente) y se crea el pago + actualiza saldo + marca el comprobante `APPROVED`, todo atómico. Dos aprobaciones concurrentes sobre el mismo comprobante producen **un solo** pago (CAS vía `updateMany` con filtro `status: "PENDING"`; probado en el test 26 con `Promise.allSettled`).
- Retiro (`withdrawReceipt`): política elegida (no existía precedente) — el residente puede retirar su propio comprobante mientras esté `PENDING` (`WITHDRAWN`, distinto de `REJECTED` para conservar quién lo resolvió); se elimina también el archivo de Storage. Retirar dos veces, o retirar el de otro residente, falla de forma opaca.

## 7. Privacidad e IDOR

Todas las consultas de obligación/pago/comprobante/unidad exigen `tenantId` autorizado; para RESIDENTE se añade siempre el alcance de unidad (derivado de su membresía) o de `membershipId`. Cross-tenant, cross-resident e inexistente producen la misma respuesta opaca (`CHARGE_NOT_FOUND`/`RECEIPT_NOT_FOUND`, 404), verificado en los tests 1, 9, 11, 12, 14, 21, 22, 32. Las respuestas de RESIDENTE nunca incluyen archivos, nombres o notas de otros residentes (el propio modelo de datos ya impide el join fuera del alcance).

## 8. Notificaciones y auditoría

- Notificaciones (in-app + email donde aplica) para: comprobante recibido (a todos los ADMIN activos del tenant), comprobante aprobado/rechazado (al residente, con `dedupeKey` único), importación completada (al ADMIN que la subió, con conteos). Todas exigen `User.isActive` **y** `TenantMembership.isActive` (reutilizando `createNotificationIdempotent`), se envían fuera de cualquier transacción de DB, y un fallo de email nunca revierte la operación financiera ya confirmada (`sendEmailSafe`, best-effort). Contenido HTML escapado (`escapePaymentHtml`). Verificado en el test 34 que la notificación de aprobación llega al `tenantId`/`userId` correctos.
- Auditoría: `PAYMENT_IMPORT_BATCH_COMPLETED`, `RESIDENT_CHARGE_CREATED`, `RESIDENT_CHARGE_CANCELLED`, `PAYMENT_RECEIPT_UPLOADED/APPROVED/REJECTED/WITHDRAWN`, `RESIDENT_PAYMENT_RECORDED/REVERSED` — todas con metadata mínima (ids de recurso, período, conteos técnicos, transición); nunca se guarda el archivo, base64, número de cuenta, contenido del comprobante ni PII innecesaria.

## 9. UI

Módulo 100% nuevo (no había ninguna página de pagos previa). Se conectó a la navegación existente sin rediseñar el resto de la app:

- **ADMIN** (`/admin/pagos`, nueva entrada en `adminNav.ts`): tres pestañas — Obligaciones (crear/cancelar, filtrar por estado), Comprobantes (revisar, aprobar con monto/referencia o rechazar con motivo), Importar (subir `.xlsx`, ver resultado de cada batch con errores por fila).
- **RESIDENTE** (`/residente/pagos`, nueva entrada en el `bottomNav` de `/residente`, adición mínima de una línea): saldo total, lista de obligaciones con estado, carga de comprobante por obligación, lista de "mis comprobantes" con descarga y retiro.
- **CONSEJO** (`/consejo/pagos`, nueva entrada en `consejoNav.ts`): únicamente el resumen agregado (`/api/pagos/resumen`) — totales facturado/recaudado, conteo por estado, comprobantes pendientes — sin ninguna fila individual.
- Cambiar de tenant no mezcla datos: todas las consultas usan el `tenantId` de la membresía seleccionada, igual que el resto de la app.

## 10. Archivos modificados/creados

**Creados:**
- `prisma/migrations/20260730000100_add_resident_payments/migration.sql`
- `src/domains/payments/payment-security.ts`, `payment-excel.ts`, `payment.service.ts`, `payment-import.service.ts`
- `src/app/api/pagos/route.ts`, `[id]/route.ts`, `[id]/cancelar/route.ts`, `[id]/pagos/route.ts`, `[id]/comprobantes/route.ts`, `movimientos/[id]/revertir/route.ts`, `comprobantes/route.ts`, `comprobantes/[id]/revisar/route.ts`, `comprobantes/[id]/retirar/route.ts`, `comprobantes/[id]/archivo/route.ts`, `importar/route.ts`, `importaciones/route.ts`, `importaciones/[id]/route.ts`, `resumen/route.ts`
- `src/app/admin/pagos/page.tsx`, `src/app/residente/pagos/page.tsx`, `src/app/consejo/pagos/page.tsx`
- `tests/payment-integration.test.ts`, `tests/unit/payment-security.test.ts`, `tests/unit/payment-excel.test.ts`
- `docs/programa-mejora/12-pagos-residentes/01-prompt-claude-implementacion.md`, `02-respuesta-claude-implementacion.md`

**Modificados:**
- `prisma/schema.prisma` (modelos/enums nuevos + relaciones)
- `src/lib/storage.ts` (folder `"comprobantes"` añadido a `StorageFolder`)
- `src/domains/notifications/notification.service.ts` (4 tipos de notificación nuevos)
- `src/lib/design/adminNav.ts`, `src/lib/design/consejoNav.ts` (una entrada de navegación cada uno)
- `src/app/residente/page.tsx` (una entrada añadida al `bottomNav` existente, sin tocar el resto del archivo)

No se tocó billing del SaaS, Mercado Pago, suscripciones, webhooks, cron de mora, invitaciones, PQRS ni documentos.

## 11. Pruebas focalizadas

- **24 pruebas puras** (`tests/unit/payment-security.test.ts` 15, `tests/unit/payment-excel.test.ts` 9): validadores, normalizadores, lista blanca, mapeo de errores, escape HTML, parsing/validación de Excel (encabezados, fórmulas, fechas/montos inválidos, firma ZIP real).
- **37 pruebas de integración con PostgreSQL real** (`tests/payment-integration.test.ts`): las 37 exigidas por el prompt, adaptadas a las decisiones de diseño de esta fase (aislamiento multi-tenant, importación idempotente con reintento y concurrencia real, montos sin error de coma flotante, comprobantes con validación de archivo real, descarga/eliminación con Storage simulado (mismo patrón que `account-avatar-integration.test.ts`: DB real, Storage mockeado vía `fetch`), aprobación/rechazo con dos revisiones concurrentes reales, sobrepago rechazado, pago parcial, reversión con historial preservado, notificación con tenant correcto, flujo completo import→consulta→carga→aprobación→saldo). Todas verdes tras corregir los dos defectos reales descritos en §4 y §6.

## 12. Suite completa

Ejecutada una sola vez con el runner protegido (`npm test`):

```
tests 638 · pass 638 · fail 0 · cancelled 0 · skipped 0 · todo 0 · exit 0
```

(571 pruebas preexistentes de fases anteriores + 67 nuevas de esta fase, todas verdes; no hubo que repetir la suite).

## 13. Riesgos restantes

- **Archivo huérfano en Storage**: si el `create` del comprobante en DB falla *después* de un upload exitoso, se intenta borrar el objeto recién subido; un fallo de red adicional en ese borrado deja un archivo huérfano sin fila en DB. No hay job de reconciliación automática (mismo riesgo, sin mitigar, que ya existía en el patrón de `evidencias`/`avatares`).
- **CONSEJO sin acceso a comprobantes/detalle**: se interpretó "información agregada" de forma estricta (solo `/api/pagos/resumen`); si el negocio necesita que CONSEJO vea el listado de obligaciones (no solo el agregado), es un cambio de política explícito pendiente de definir.
- **Sin validación de "obligación futura" para el vencimiento**: a diferencia de reservas, no se exigió que `dueDate` sea futura al crear una obligación manual (permite registrar cuotas atrasadas retroactivamente a propósito); si esto no es deseado, requiere una regla adicional explícita.
- **Import Excel no soporta pagos, solo obligaciones** (decisión documentada en §5): si el negocio realmente necesita cargar masivamente pagos ya recibidos (no solo cuotas por cobrar), es un alcance adicional pendiente de definir con su propia idempotencia y su propia revisión.

## 14. Estado final

`IMPLEMENTADO`

No se hizo commit, push ni tags. No se inició otro módulo.
