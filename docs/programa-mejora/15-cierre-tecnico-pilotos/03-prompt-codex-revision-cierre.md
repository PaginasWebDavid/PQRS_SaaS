# FASE R1B — REVISIÓN ADVERSARIAL, CORRECCIÓN Y COMMIT

Guarda este prompt en:

`docs/programa-mejora/15-cierre-tecnico-pilotos/03-prompt-codex-revision-cierre.md`

Guarda el informe en:

`docs/programa-mejora/15-cierre-tecnico-pilotos/04-respuesta-codex-revision-cierre.md`

## Objetivo

Revisa únicamente la implementación de la Fase R1:

1. notificaciones de pagos del SaaS;
2. workflow PQRS SIMPLE/MAINTENANCE;
3. visibilidad de soporte para ADMIN;
4. exportación y reactivación de tenants.

No reaudites otros módulos.

## Regla adaptativa

* Si la implementación está correcta: aprueba y crea el commit.
* Si encuentras defectos pequeños o medios:

  * corrígelos directamente;
  * añade o ajusta pruebas focalizadas;
  * ejecuta únicamente las pruebas afectadas;
  * ejecuta Prisma validate, typecheck y lint una sola vez;
  * crea el commit si todo queda verde.
* Detente sin commit únicamente si encuentras:

  * defecto crítico;
  * migración incorrecta que requiera rediseño;
  * incompatibilidad estructural;
  * cambio amplio no validable de forma focalizada.

No inicies otra fase.

## Eficiencia

* No revises rama, HEAD o historial al comenzar.
* No repitas la suite completa: ya quedó **672/672 verde**.
* No repitas pruebas si no modificas código.
* No ejecutes Prisma, typecheck o lint si la revisión es solo lectura.
* Revisa únicamente el diff de R1 y dependencias directas.
* Informe breve.

## Archivos principales

```text
prisma/schema.prisma
prisma/migrations/20260731000100_add_pilot_readiness/migration.sql

src/domains/billing/billing-outbox-policy.ts
src/domains/billing/billing-outbox.service.ts
src/domains/billing/billing.service.ts
src/domains/billing/mercado-pago.service.ts

src/domains/pqrs/pqrs-workflow.service.ts
src/app/api/pqrs/route.ts
src/app/api/pqrs/[id]/route.ts
src/app/api/tenant/pqrs-workflow/route.ts
src/app/admin/configuracion/page.tsx

src/domains/support/support-ticket.service.ts
src/app/api/support-tickets/route.ts
src/app/api/platform/support-tickets/route.ts
src/app/admin/ayuda/page.tsx
src/app/consejo/ayuda/page.tsx
src/app/residente/page.tsx

src/domains/platform/tenant-export.service.ts
src/app/api/platform/tenants/[id]/export/route.ts
src/app/(protected)/super-admin/page.tsx

tests/pilot-readiness-integration.test.ts
tests/unit/pqrs-workflow.test.ts
tests/unit/support-ticket-categories.test.ts
```

Lee también los documentos 01 y 02 de esta fase.

# 1. Notificaciones del pago SaaS

Confirma que:

* `SAAS_PAYMENT_APPROVED` y `SAAS_PAYMENT_REJECTED` usan el outbox durable;
* el intent se crea dentro de la misma transacción que el efecto financiero;
* webhook duplicado no genera nuevas filas;
* `PENDING` o estado ambiguo no se comunica como rechazo definitivo;
* solo reciben ADMIN activos del tenant;
* usuarios o membresías inactivas no reciben;
* otro tenant no recibe;
* errores del proveedor no aparecen en contenido, metadata o email;
* el email se entrega después del commit;
* no existe un camino que aplique el pago pero omita el evento durable.

## Diferenciar pago y cortesía

Revisa específicamente:

```text
renewSubscriptionWithSimulatedPayment
grantCourtesyExtension
```

Una **cortesía** no es un pago.

No debe comunicar:

> Pago aprobado

si no hubo dinero.

Opciones válidas:

* evento separado como `COURTESY_EXTENSION_GRANTED`; o
* contenido específico basado en el origen del evento;
* no enviar notificación de pago y conservar únicamente una notificación de extensión de acceso.

Debe quedar claro para el ADMIN:

* pago manual registrado;
* pago Mercado Pago aprobado;
* cortesía otorgada.

No mezcles estos tres conceptos.

## Dedupe

Confirma que la clave basada en `payment.createdAt` es estable.

Revisa:

* precisión temporal;
* recreación accidental de `Payment`;
* múltiples ADMIN;
* IN_APP y EMAIL;
* pago simulado repetido;
* cortesía repetida.

Cada destinatario y canal debe tener una única intención por evento financiero real.

# 2. Pago rechazado y estado de acceso

Confirma que el mensaje:

* no afirma suspensión si el tenant todavía tiene cobertura;
* no afirma que el pago pueda reintentarse automáticamente si no es cierto;
* refleja el estado real sin exponer la máquina interna;
* no duplica una notificación posterior de gracia de manera contradictoria.

Es aceptable que el ADMIN reciba:

1. pago rechazado;
2. posteriormente, entrada a periodo de gracia;

pero los mensajes deben representar eventos distintos y coherentes.

# 3. Workflow PQRS

Confirma migración y snapshots:

* `Tenant.pqrsWorkflowType` default `MAINTENANCE`;
* `Pqrs.workflowType` default `MAINTENANCE`;
* casos antiguos mantienen comportamiento;
* casos nuevos copian el workflow efectivo del tenant;
* cambiar configuración no altera casos existentes;
* el cliente no puede falsificar `workflowType`;
* solo ADMIN del tenant puede configurar;
* cross-tenant es imposible.

## Flujo SIMPLE

El requerimiento funcional era:

```text
Recibida
→ Primer contacto
→ En gestión
→ Cerrada
```

Claude reporta:

```text
SIMPLE: 0 → 1 → 5
```

Revisa si esto realmente representa una fase visible de “En gestión”.

Si `faseActual = 1` significa únicamente “Primer contacto” y `5` significa cierre, el flujo estaría saltando la etapa de gestión solicitada.

Corrige de forma mínima si es necesario. Alternativas:

* reutilizar una fase existente como gestión genérica;
* introducir una fase simple compatible;
* ajustar la semántica y UI de forma inequívoca.

No agregues un editor libre.

## Flujo MAINTENANCE

Confirma que conserva exactamente:

```text
0 → 1
1 → 2 o 3
2 o 3 → 4
4 → 5
```

No debe degradarse el flujo existente.

## UI

Confirma que:

* ADMIN entiende las dos opciones;
* RESIDENTE y CONSEJO ven etiquetas coherentes;
* una PQRS SIMPLE no muestra controles de INSUMOS/PROVEEDOR;
* reportes y listados no muestran fases imposibles o etiquetas incorrectas;
* cambiar tenant refresca la configuración.

# 4. Soporte

Confirma:

## RESIDENTE y CONSEJO

* ven solo tickets propios;
* pueden crear únicamente:

  * `TECHNICAL`;
  * `ACCESS`;
  * `PRIVACY_SECURITY`;
* no usan `BILLING`;
* no responden;
* no cierran;
* el texto orienta correctamente las solicitudes operativas hacia PQRS.

## ADMIN

* ve todos los tickets del tenant;
* no ve otro tenant;
* puede identificar creador sin recibir PII innecesaria;
* no responde;
* no cierra;
* no puede cambiar estado mediante otra ruta;
* `BILLING` está permitido;
* IDs cross-tenant son opacos.

## SUPER_ADMIN

* conserva cola global;
* puede filtrar por tenant;
* responde y cierra;
* no pierde compatibilidad con categorías históricas.

## Categorías históricas

Confirma qué ocurre con tickets existentes:

```text
TECNICO
FACTURACION
CUENTA
OTRO
```

Deben seguir:

* listándose;
* mostrándose con etiqueta legible;
* respondiéndose;
* cerrándose.

No es obligatorio permitir crear nuevos tickets con categorías legacy.

# 5. Exportación

Confirma autorización:

* únicamente SUPER_ADMIN;
* tenant target explícito por path;
* tenant inexistente o no autorizado produce error controlado;
* ningún usuario tenant puede usar la ruta;
* no acepta tenant desde body o query como fuente de autoridad.

## Contenido

Confirma que no incluye:

* password;
* hash;
* tokens;
* sessionVersion;
* secretos;
* connection strings;
* URLs firmadas;
* storagePath;
* AuditLog completo;
* datos de otros tenants.

## Inyección de fórmulas en Excel

Revisa todos los valores controlados por usuarios o administradores:

* título;
* categoría libre;
* nombre;
* email;
* notas de historial;
* bloque/apartamento si se convierten a string;
* nombre de archivo;
* cualquier descripción.

Una celda que empiece con:

```text
=
+
-
@
\t
\r
```

puede interpretarse como fórmula al abrir Excel.

Implementa un sanitizador central para exportación, por ejemplo prefijando `'` cuando corresponda.

Añade pruebas con entradas como:

```text
=HYPERLINK("https://example.com")
+SUM(1,1)
@malicious
-CMD
```

El XLSX final debe contener texto, no fórmula.

## Content-Disposition

Confirma:

* nombre del archivo sanitizado;
* sin CRLF;
* sin caracteres inválidos;
* tipo MIME correcto.

## Límites

Confirma que:

* el conteo se valida antes de cargar todas las filas;
* superar el límite devuelve error público controlado;
* no se produce export parcial que parezca completa.

No es obligatorio crear miles de filas reales si la lógica puede probarse por servicio o helper.

# 6. Evidencias en exportación

Confirma que exportar referencias de evidencias no expone:

* path privado;
* URL firmada;
* bucket;
* ID que permita descargar sin autorización;
* nombres con PII innecesaria.

Un identificador interno o nombre sanitizado es suficiente.

# 7. Reactivación

Confirma:

* botón visible para `SUSPENDED` y `CANCELLED`;
* backend exige evidencia vigente;
* no se crea segunda Subscription;
* no se crea pago falso al reactivar;
* se usa la misma suscripción;
* `cancelledAt` se limpia únicamente al confirmar la reactivación;
* auditoría correcta;
* fallo deja el tenant cancelado;
* tenant de otro target no se modifica.

Revisa si un tenant CANCELLED con:

* pago expirado;
* cortesía expirada;
* suscripción ausente;
* pago vigente;

produce el resultado correcto en cada caso.

# 8. Notificaciones y reactivación

Confirma que reactivar un tenant:

* no dispara accidentalmente `SAAS_PAYMENT_APPROVED` sin pago nuevo;
* no duplica notificaciones de cortesía anteriores;
* no deja outbox en estado incoherente.

# 9. Pruebas

Claude reportó:

```text
7 pruebas unitarias
24 pruebas PostgreSQL
672/672 suite completa
```

No las repitas si la revisión es solo lectura.

Añade pruebas focalizadas únicamente si faltan garantías, especialmente:

1. cortesía no se comunica como pago;
2. SIMPLE contiene una etapa coherente de gestión;
3. fórmulas Excel se exportan como texto;
4. categorías históricas siguen visibles;
5. reactivación no genera notificación de pago;
6. exportación de otro tenant no mezcla datos;
7. pago simulado repetido no duplica eventos.

Si modificas código, ejecuta:

```text
node --import tsx --test \
  tests/unit/pqrs-workflow.test.ts \
  tests/unit/support-ticket-categories.test.ts
```

Ejecuta mediante el runner protegido únicamente las pruebas de integración R1 afectadas.

Después, una vez:

```text
npx prisma validate
npx tsc --noEmit
npm run lint
```

No repitas la suite completa.

# 10. Riesgos

Clasifica como:

* bloqueante de commit;
* bloqueante de piloto;
* riesgo operacional aceptable;
* mejora posterior.

Revisa especialmente:

* filtro client-side de soporte;
* límite de exportación;
* emails de pago rechazado;
* categorías legacy;
* workflow SIMPLE limitado;
* pagos simulados y cortesías.

# 11. Commit automático

Si la fase queda correcta o corriges problemas acotados:

1. Ejecuta una sola lista de archivos modificados.
2. Añade los archivos de R1, las correcciones y:

```text
docs/programa-mejora/15-cierre-tecnico-pilotos/
```

3. Revisa una vez el staged diff para confirmar:

   * sin `.env`;
   * sin secretos;
   * sin connection strings;
   * sin datos reales de clientes;
   * sin archivos ajenos.
4. Crea:

```text
git commit -m "feat(pilot): close critical readiness gaps"
```

No ejecutes pruebas después del commit.

# 12. Informe final

Entrega:

1. Defectos encontrados.
2. Correcciones.
3. Notificaciones de pagos y cortesías.
4. Workflow SIMPLE/MAINTENANCE.
5. Soporte.
6. Exportación y protección Excel.
7. Reactivación.
8. Pruebas revisadas o ejecutadas.
9. Riesgos.
10. Commit y hash.
11. Resultado:

* `APROBADO Y COMMIT CREADO`;
* `CORREGIDO Y COMMIT CREADO`;
* `BLOQUEADO`.

No inicies otra fase.
