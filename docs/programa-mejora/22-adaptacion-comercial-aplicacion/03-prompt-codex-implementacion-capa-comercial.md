# FASE C7B — IMPLEMENTACIÓN DE LA CAPA COMERCIAL Y OPERATIVA PARA PILOTOS

Guarda este prompt exacto en:

`docs/programa-mejora/22-adaptacion-comercial-aplicacion/03-prompt-codex-implementacion-capa-comercial.md`

Guarda el informe final completo en:

`docs/programa-mejora/22-adaptacion-comercial-aplicacion/04-respuesta-codex-implementacion-capa-comercial.md`

## 1. Objetivo

Implementa la capa comercial mínima necesaria para que PQRS Services pueda:

1. crear un piloto pago de 45 días;
2. registrar correctamente su pago;
3. conservar el precio mensual posterior;
4. controlar fechas y hitos desde Super Admin;
5. impedir el uso de Reservas y Pagos cuando no están contratados;
6. distinguir estado comercial y estado técnico;
7. convertir el piloto a mensual o anual;
8. registrar fundadores, descuentos, implementación y referidos;
9. modificar decisiones comerciales mediante acciones auditadas;
10. operar el primer piloto sin editar código ni base de datos.

La implementación debe apoyarse en la infraestructura existente:

* `Tenant`;
* `Subscription`;
* `Payment`;
* `PricingRule`;
* `PlatformSetting`;
* `AuditLog`;
* outbox;
* autenticación y autorización central;
* Super Admin;
* exportación;
* cron y billing existentes.

No construyas un CRM.

No construyas facturación contable.

No agregues módulos.

No modifiques el núcleo funcional de PQRS salvo lo necesario para aplicar los entitlements.

No implementes envío bancario de comisiones.

No realices cobros ni envíes correos reales.

---

# 2. Documentos fuente

Lee:

```text
docs/programa-mejora/17-comercial-pilotos/
docs/programa-mejora/22-adaptacion-comercial-aplicacion/
```

La fuente comercial vigente establece:

## Plan Gestión mensual

| Unidades privadas |                Precio |
| ----------------: | --------------------: |
|             1–100 |              $119.000 |
|           101–200 |              $159.000 |
|           201–400 |              $199.000 |
|           401–600 |              $249.000 |
|        Más de 600 | Cotización individual |

## Piloto pago

| Unidades privadas |                Precio |
| ----------------: | --------------------: |
|             1–200 |               $99.000 |
|           201–400 |              $129.000 |
|           401–600 |              $159.000 |
|        Más de 600 | Cotización individual |

## Piloto

* 45 días calendario;
* hasta siete días de preparación;
* mínimo treinta días de uso real;
* evaluación y decisión durante la etapa final.

## Fundadores

* primeros diez clientes convertidos y pagos;
* implementación asistida sin costo;
* precio protegido durante doce meses;
* ordinal estable;
* el cupo no se libera automáticamente por cancelación.

## Anualidad

* pago anticipado;
* doce meses;
* 10 % de descuento;
* no acumulable con descuento comercial.

## Descuento comercial

* máximo 5 %;
* motivo obligatorio;
* aprobado por SUPER_ADMIN;
* no aplicable al piloto;
* no acumulable con anualidad.

## Add-ons

* Reservas;
* Pagos de residentes.

Deben estar desactivados salvo contratación explícita.

---

# 3. Reglas de arquitectura

## 3.1 Estado técnico y estado comercial

No reemplaces los estados técnicos actuales:

```text
PENDING_PAYMENT
TRIAL
ACTIVE
GRACE_PERIOD
SUSPENDED
CANCELLED
```

Continúan representando acceso y billing.

Crea una fuente separada para el estado comercial.

Estados comerciales mínimos:

```text
LEGACY_REVIEW
PILOT_PENDING_PAYMENT
PILOT_PREPARATION
PILOT_ACTIVE
PILOT_EVALUATION
CONVERTED_MONTHLY
CONVERTED_ANNUAL
NOT_CONVERTED
CANCELLED
```

No utilices `TRIAL` para representar un piloto pago.

Un piloto pago debe operar normalmente como:

```text
commercialStatus = PILOT_PREPARATION o PILOT_ACTIVE
subscriptionStatus = ACTIVE
```

## 3.2 Fuente de verdad

Implementa una relación 1:1 por tenant, con un nombre coherente con la arquitectura existente. Nombre sugerido:

`TenantCommercialProfile`

No uses `AuditLog` como estado vigente.

No dupliques:

* nombre del tenant;
* unidades;
* estado técnico;
* información que ya pertenece a `Subscription`.

## 3.3 Cambios aditivos

Las migraciones deben ser aditivas.

No elimines:

* pagos;
* suscripciones;
* tenants;
* estados existentes;
* reglas históricas;
* datos de Reservas o Pagos;
* auditoría.

---

# 4. Ficha comercial por tenant

Debe conservar como mínimo:

## Estado y piloto

* `tenantId`;
* `commercialStatus`;
* `pilotPreparationStartsAt`;
* `pilotLaunchAt`;
* `pilotRealUseStartsAt`;
* `pilotEvaluationAt`;
* `decisionDueAt`;
* `pilotAccessEndsAt`;
* `pilotPriceCents`;
* `postPilotListPriceCents`;
* `postPilotContractPriceCents`;
* moneda;
* `nextAction`;
* `nextActionDueAt`.

## Modalidad

* `billingMode`: `MONTHLY`, `ANNUAL` o null;
* fecha efectiva de conversión;
* fecha final del periodo contratado.

## Fundador

* `isFounderCustomer`;
* `founderNumber`;
* `founderGrantedAt`;
* `priceProtectedUntil`;
* `implementationFeeWaived`.

## Descuento

* porcentaje o basis points;
* precio de lista;
* precio efectivo;
* motivo;
* fecha de inicio;
* fecha final;
* aprobador.

## Implementación

Tipos mínimos:

```text
STANDARD
ASSISTED
FOUNDER_WAIVED
```

Registrar:

* tipo;
* tarifa;
* exoneración;
* fecha de inicio;
* fecha de finalización;
* estado general.

## Referido

Registrar de forma acotada:

* nombre o identificador;
* contacto opcional;
* tipo de acuerdo;
* estado de comisión;
* valor elegible;
* fecha de elegibilidad;
* fecha de pago manual.

No guardes información personal innecesaria.

## Checklist operativo

Debe existir una forma tipada de registrar al menos:

* documentos aceptados;
* pago del piloto confirmado;
* base de residentes recibida;
* categorías configuradas;
* capacitación realizada;
* smoke test aprobado;
* comunicación de lanzamiento enviada.

Puede implementarse mediante campos fechados o una entidad de checklist.

No uses un JSON sin validación como única fuente de verdad.

---

# 5. Migración y tenants existentes

Para tenants existentes:

* crea ficha comercial idempotente;
* usa `LEGACY_REVIEW`;
* no los clasifiques automáticamente como piloto o convertido;
* conserva su suscripción y acceso;
* no cambies precios contratados;
* no borres datos.

La migración debe poder ejecutarse con el runner protegido.

No uses `prisma db push`.

---

# 6. Reglas de precios

## 6.1 Rangos

Adapta `PricingRule` o crea una estructura igualmente clara para distinguir:

```text
MONTHLY
PILOT
```

Debe ser posible administrar ambos tipos desde Super Admin.

## 6.2 Reglas vigentes

Configura como estado reproducible:

### Mensual

```text
1–100       119000 COP
101–200     159000 COP
201–400     199000 COP
401–600     249000 COP
```

### Piloto

```text
1–200       99000 COP
201–400     129000 COP
401–600     159000 COP
```

No debe existir una regla automática abierta por encima de 600 unidades.

## 6.3 Más de 600 unidades

Debe requerir:

* precio manual del piloto;
* precio mensual posterior;
* motivo de cotización;
* aprobación de SUPER_ADMIN;
* auditoría.

No debe crear el tenant con un precio automático anterior.

## 6.4 Suscripciones existentes

Cambiar reglas globales:

* no modifica snapshots existentes;
* no cambia clientes fundadores;
* no cambia precios protegidos;
* no altera periodos ya pagos.

## 6.5 Entorno vivo

No asumas que la base desplegada contiene el seed.

Crea una validación o runbook que permita comprobar:

* reglas activas;
* solapamientos;
* rangos faltantes;
* reglas antiguas;
* diferencia frente a la política vigente.

No modifiques producción durante esta fase.

---

# 7. Concepto de pago

La aplicación debe distinguir como mínimo:

```text
PILOT
SUBSCRIPTION_MONTHLY
SUBSCRIPTION_ANNUAL
IMPLEMENTATION
COURTESY
```

Puedes extender `Payment` o crear una entidad de pago comercial cuando la semántica actual haga insegura la extensión.

La decisión debe conservar:

* tenant;
* suscripción cuando corresponda;
* concepto;
* proveedor;
* referencia externa o bancaria;
* valor de lista;
* descuento;
* valor efectivo;
* moneda;
* fecha;
* periodo cubierto;
* estado;
* actor;
* operationId;
* idempotencia semántica;
* auditoría.

Proveedor manual mínimo:

```text
MANUAL_TRANSFER
```

No guardes capturas o comprobantes binarios dentro de auditoría.

Puede guardarse una referencia acotada o metadata segura.

## 7.1 Analytics

Un pago `PILOT`:

* no suma MRR;
* no cuenta como mensualidad;
* no cuenta como segundo pago mensual;
* no se interpreta como anualidad;
* no se interpreta como cortesía.

Un pago `IMPLEMENTATION`:

* no suma MRR.

Una `COURTESY`:

* mantiene valor cero;
* continúa claramente separada de un pago.

Revisa todos los lectores, analytics, reportes y notificaciones que asumen que cualquier pago aprobado es mensualidad.

---

# 8. Flujo para crear un piloto

Adapta el flujo de Super Admin para crear un tenant piloto.

## 8.1 Paso 1 — Datos del conjunto

Solicitar:

* nombre;
* NIT si el modelo lo admite;
* ciudad;
* unidades;
* administrador;
* correo;
* teléfono solo si ya corresponde al modelo.

## 8.2 Paso 2 — Precios

Mostrar automáticamente:

* precio de piloto;
* precio mensual de lista;
* rango;
* moneda.

Para más de 600:

* solicitar cotización manual;
* motivo;
* aprobación explícita.

## 8.3 Paso 3 — Alcance

Registrar:

* implementación;
* referido;
* Reservas activadas o no;
* Pagos activados o no.

Los add-ons deben aparecer desactivados por defecto.

## 8.4 Paso 4 — Confirmación

Mostrar antes de crear:

* 45 días;
* precio de piloto;
* precio posterior;
* add-ons;
* implementación;
* próxima acción.

## 8.5 Resultado de la creación

Al crear:

* tenant técnico en `PENDING_PAYMENT`;
* suscripción en `PENDING_PAYMENT`;
* ficha comercial en `PILOT_PENDING_PAYMENT`;
* categorías inicializadas;
* precios congelados;
* add-ons configurados;
* auditoría creada.

No iniciar un trial de 15 días.

No activar acceso.

No afirmar que la invitación fue enviada.

No enviar invitación antes de confirmar el pago del piloto.

---

# 9. Confirmación del pago del piloto

Implementa una acción exclusiva de SUPER_ADMIN:

`Confirmar pago del piloto`

Debe solicitar:

* referencia;
* valor;
* fecha;
* proveedor;
* operationId;
* observación opcional.

El servidor debe:

1. comprobar tenant y estado;
2. comprobar precio esperado;
3. comprobar que no existe otro pago de piloto aprobado;
4. crear el pago `PILOT`;
5. activar técnicamente la suscripción;
6. establecer 45 días de acceso;
7. cambiar el estado comercial a `PILOT_PREPARATION`;
8. guardar las fechas iniciales;
9. marcar pago en checklist;
10. registrar auditoría;
11. preparar el envío de invitación mediante el mecanismo durable existente.

Todo dentro de una operación consistente.

## Fechas iniciales

Desde la confirmación:

* preparación inicia ese día;
* fecha límite recomendada de lanzamiento: hasta siete días;
* evaluación comienza aproximadamente en el día 38;
* decisión y acceso terminan en el día 45.

Guarda fechas explícitas.

No dependas únicamente de cálculos de UI.

## Idempotencia

Mismo operationId y mismo payload:

* no duplica pago;
* no extiende otros 45 días;
* no reenvía múltiples invitaciones de manera incoherente.

Mismo operationId con payload distinto:

* conflicto controlado.

---

# 10. Inicio del uso real

Implementa una acción:

`Iniciar piloto`

Debe mostrar el checklist.

Requisitos mínimos:

* pago confirmado;
* administrador invitado o activo;
* categorías configuradas;
* capacitación registrada;
* smoke test aprobado.

La base de residentes y la comunicación de lanzamiento deben mostrarse; si se permite continuar sin alguna, debe requerir motivo explícito.

La acción:

* registra `pilotLaunchAt`;
* registra `pilotRealUseStartsAt`;
* cambia a `PILOT_ACTIVE`;
* conserva `pilotAccessEndsAt`;
* no reinicia automáticamente los 45 días;
* registra auditoría.

Si el lanzamiento ocurre después del séptimo día:

* advertir;
* solicitar motivo;
* no extender acceso automáticamente.

---

# 11. Evaluación y decisión

La ficha debe mostrar:

* días totales restantes;
* días de uso real;
* fecha de evaluación;
* fecha de decisión;
* PQRS creadas;
* PQRS cerradas;
* primera PQRS;
* usuarios invitados;
* usuarios activados;
* tickets de soporte;
* siguiente acción.

Estas métricas deben derivarse cuando ya existen.

Permanecen manuales:

* minutos de soporte;
* solicitudes recibidas fuera;
* reuniones;
* objeciones;
* feedback cualitativo.

Debe permitirse registrarlas de forma simple, sin construir analítica avanzada.

Acción:

`Iniciar evaluación`

* cambia a `PILOT_EVALUATION`;
* registra fecha;
* solicita próxima acción y fecha;
* audita.

---

# 12. Conversión mensual

Implementa una acción explícita:

`Convertir a mensual`

Debe:

* mostrar precio mensual de lista;
* permitir descuento entre 0 y 5 %;
* exigir motivo si existe descuento;
* impedir descuento inválido;
* guardar precio efectivo;
* registrar modalidad mensual;
* crear o confirmar pago mensual;
* cubrir un periodo de treinta días;
* conservar el historial del piloto;
* cambiar a `CONVERTED_MONTHLY`;
* mantener o activar la suscripción;
* registrar auditoría.

## Inicio del periodo

Cuando se convierte antes de terminar el piloto:

* el periodo mensual debe comenzar al finalizar el acceso pagado del piloto;
* no debe cobrar dos periodos superpuestos.

Cuando el piloto ya terminó:

* el periodo comienza en la fecha efectiva de pago o reactivación.

## Mercado Pago

Conserva el flujo mensual existente.

No rompas:

* preapproval;
* webhooks;
* idempotencia;
* mora;
* suspensión;
* reactivación.

El contrato mensual efectivo debe poder utilizar el precio congelado de la ficha comercial.

---

# 13. Conversión anual

Implementa una acción explícita:

`Convertir a anual`

Para esta fase:

* el pago anual puede ser manual por transferencia;
* no implementes recurrencia anual automática de Mercado Pago.

Debe calcular:

```text
precio anual de lista = precio mensual de lista × 12
descuento anual = 10 %
precio efectivo = precio anual de lista × 0,90
```

Debe:

* impedir descuento comercial adicional;
* registrar precio de lista;
* registrar descuento;
* registrar pago `SUBSCRIPTION_ANNUAL`;
* cubrir doce meses calendario;
* cambiar a `CONVERTED_ANNUAL`;
* activar la suscripción;
* guardar próxima renovación;
* auditar.

No uses una cortesía de 365 días.

---

# 14. Descuentos

El descuento comercial:

* solo puede aplicarse a modalidad mensual;
* máximo 5 %;
* aprobado por SUPER_ADMIN;
* motivo obligatorio;
* inicio y fin definidos;
* conserva precio de lista;
* conserva precio efectivo;
* no se aplica al piloto;
* no se acumula con anualidad.

Toda edición posterior debe usar una acción auditada.

No permitir modificación directa de `Subscription.priceCents` sin conservar la razón comercial.

---

# 15. Clientes fundadores

Al convertir a mensual o anual:

* verifica transaccionalmente cuántos números fundadores fueron otorgados;
* máximo diez;
* asigna ordinal estable;
* evita duplicación por concurrencia;
* no depende únicamente de contar pagos;
* no libera automáticamente el número por cancelación;
* registra fecha;
* configura protección de precio por doce meses;
* marca implementación asistida sin costo cuando corresponda.

Puede utilizarse:

* transacción serializable;
* advisory lock;
* restricción de unicidad;
* operación idempotente.

Super Admin debe ver:

* condición fundadora;
* número;
* fecha;
* protección hasta;
* cupos restantes.

## Protección de precio

Durante el periodo protegido:

* cambios globales de `PricingRule` no alteran el precio contratado;
* cambios de unidades no deben aplicar silenciosamente una tarifa nueva;
* deben quedar como revisión pendiente o requerir override auditado.

---

# 16. Referidos y comisión

La ficha debe permitir registrar:

* referido;
* acuerdo general;
* excepción fundadora;
* comisión prometida;
* estado.

Estados sugeridos:

```text
NOT_APPLICABLE
PENDING_CONVERSION
PENDING_PAYMENTS
ELIGIBLE
PAID
MANUAL_REVIEW
CANCELLED
```

Para clientes mensuales:

* el pago del piloto no cuenta;
* después del segundo pago mensual aprobado y no duplicado, la comisión puede quedar `ELIGIBLE`;
* valor elegible: una mensualidad efectiva neta registrada;
* no pagar automáticamente;
* Super Admin marca `PAID` con fecha y referencia.

Para clientes anuales:

* deja `MANUAL_REVIEW`;
* no inventes una regla automática no aprobada.

Evita:

* doble causación;
* pago por piloto no convertido;
* pago por cortesía;
* conteo de reintentos;
* pérdida de la relación del referido.

---

# 17. Implementación

La ficha debe mostrar:

* tipo;
* tarifa;
* exoneración;
* estado;
* fechas;
* checklist.

Durante los primeros tres pilotos puede permanecer sin cobro separado.

Para fundadores:

* `FOUNDER_WAIVED`;
* valor de lista visible;
* valor efectivo cero;
* motivo automático y auditable.

No construyas un sistema de proyectos.

---

# 18. Entitlements de Reservas y Pagos

Implementa control por tenant.

Features mínimas:

```text
RESERVATIONS
RESIDENT_PAYMENTS
```

Estados:

```text
DISABLED
SETUP
ACTIVE
SUSPENDED
```

Debe registrar:

* tenant;
* feature;
* estado;
* fecha;
* actor;
* motivo;
* precio opcional;
* auditoría.

## Nuevos tenants

Ambos add-ons:

```text
DISABLED
```

salvo selección explícita de SUPER_ADMIN.

## Tenants existentes

La migración debe preservar operación:

* si existen datos reales del módulo para ese tenant, inicializar `ACTIVE`;
* si no existen datos, inicializar `DISABLED`;
* documentar la detección usada;
* no borrar datos.

## Aplicación

El entitlement debe comprobarse en:

* navegación;
* páginas;
* APIs;
* acciones de escritura;
* lectura de ADMIN;
* lectura de CONSEJO;
* lectura de RESIDENTE.

Ocultar únicamente el menú no es suficiente.

Cuando está desactivado:

* no mostrarlo;
* denegar acceso directo;
* no eliminar datos;
* usar respuesta controlada y sin detalle interno.

Debe existir control de Super Admin para:

* activar;
* colocar en configuración;
* suspender;
* desactivar;
* registrar motivo.

---

# 19. Super Admin

En el detalle del tenant agrega una sección claramente visible:

## Resumen comercial

* estado comercial;
* estado técnico;
* unidades;
* precio piloto;
* precio posterior;
* modalidad;
* días restantes;
* próxima acción;
* fecha de decisión.

## Preparación

* checklist;
* bloqueantes;
* acción siguiente.

## Piloto

* fechas;
* uso real;
* métricas disponibles;
* entradas manuales acotadas.

## Precios

* lista;
* efectivo;
* descuento;
* protección;
* > 600 cotización.

## Fundador

* número;
* cupos;
* protección;
* implementación exonerada.

## Referido

* acuerdo;
* estado;
* elegibilidad;
* pago manual.

## Alcance

* Plan Gestión;
* Reservas;
* Pagos de residentes.

## Decisión

Acciones permitidas según estado:

* confirmar pago;
* iniciar piloto;
* iniciar evaluación;
* convertir mensual;
* convertir anual;
* extensión excepcional;
* no convertir;
* cancelar.

No muestres acciones incompatibles.

---

# 20. Corrección comercial auditada

El usuario debe poder corregir desde Super Admin los datos esenciales sin editar la base.

Implementa una acción controlada, no edición libre de cualquier columna.

Debe permitir, según whitelist:

* fechas de piloto;
* precio pactado;
* próxima acción;
* tipo de implementación;
* datos de referido;
* fecha de decisión;
* modalidad antes de conversión;
* notas comerciales acotadas.

Debe exigir:

* motivo;
* operationId;
* validación del estado final;
* transacción;
* before/after;
* AuditLog;
* idempotencia semántica.

No permitir mediante esta acción:

* falsificar un pago;
* otorgar fundador por encima del límite;
* activar add-ons sin entitlement;
* alterar un tenant ajeno;
* modificar historial de pagos.

---

# 21. Pantallas de ADMIN y CONSEJO

## ADMIN

La pantalla de licencia o cuenta debe indicar correctamente:

* “Piloto guiado” cuando corresponda;
* fecha de finalización;
* precio posterior;
* modalidad después de convertir;
* alcance contratado;
* add-ons activos.

No debe mostrar:

* “prueba gratuita”;
* pago mensual pendiente durante un piloto ya pagado;
* módulos no contratados.

## CONSEJO

Debe poder ver de forma sencilla:

* Plan Gestión activo;
* add-ons activos;
* condición de consulta;
* fecha general de vigencia cuando sea apropiado.

No debe ver:

* comisión;
* referido;
* descuentos internos;
* notas del fundador.

## RESIDENTE

Solo debe ver:

* funciones contratadas;
* información necesaria para usar el servicio.

---

# 22. Mensajes del alta

Corrige las contradicciones detectadas:

* no afirmar “licencia pendiente de pago” si se creó un trial;
* después de esta fase ya no debe crearse trial automático para pilotos;
* no afirmar que se envió invitación cuando `invitationSent = false`;
* mostrar claramente qué quedó pendiente;
* los pasos visuales deben reflejar hitos reales o eliminar la simulación de progreso.

No hagas un rediseño visual completo.

---

# 23. Analytics

Corrige cálculos para que:

* `TRIAL` técnico no se interprete automáticamente como piloto comercial;
* `ACTIVE` no implique conversión;
* pagos de piloto no sumen MRR;
* pagos anuales no sumen doce veces en un solo mes;
* cortesías no sean ingresos;
* implementación no sea MRR;
* conversión se derive del estado comercial;
* churn comercial y cancelación técnica no se confundan.

No construyas un sistema financiero nuevo.

Conserva métricas existentes cuando sigan siendo correctas.

---

# 24. Seguridad

Todas las acciones comerciales:

* solo SUPER_ADMIN;
* tenant objetivo explícito;
* validación de servidor;
* auditoría;
* operationId;
* idempotencia;
* comparación de payload en reintentos;
* errores genéricos;
* sin secretos;
* sin valores confiados desde cliente.

ADMIN, CONSEJO y RESIDENTE:

* solo leen información permitida;
* no modifican precio;
* no modifican descuento;
* no modifican condición fundadora;
* no activan add-ons;
* no confirman pagos.

---

# 25. Concurrencia

Prueba explícitamente:

* dos confirmaciones del mismo pago;
* dos conversiones simultáneas;
* dos asignaciones del último cupo fundador;
* conversión y cancelación simultáneas;
* cambio de unidades durante protección;
* activación simultánea de entitlement;
* mismo operationId con payload distinto.

No deben producir:

* pagos duplicados;
* 11 fundadores;
* periodos superpuestos;
* doble comisión;
* acceso contradictorio;
* pérdida de auditoría.

---

# 26. Migraciones

Usa:

```text
npm run test:db:deploy
```

No uses:

```text
prisma db push
```

La migración debe:

* ser aditiva;
* preservar suscripciones;
* preservar pagos;
* crear perfiles legacy;
* crear entitlements;
* clasificar entitlements existentes de forma segura;
* agregar conceptos de pago con defaults compatibles;
* actualizar el estado reproducible de precios;
* conservar snapshots históricos.

Documenta cualquier decisión de backfill.

No apliques producción.

---

# 27. Pruebas mínimas

Crea pruebas focalizadas con PostgreSQL real.

Cobertura mínima:

## Piloto y ficha comercial — 18

* creación pendiente de pago;
* ausencia de trial automático;
* precios correctos;
* más de 600;
* pago;
* idempotencia;
* fechas;
* checklist;
* lanzamiento;
* evaluación;
* corrección;
* aislamiento.

## Pagos, precios y conversión — 18

* pago piloto fuera de MRR;
* mensual;
* anual;
* 10 %;
* descuento máximo;
* no acumulación;
* periodos sin solapamiento;
* snapshots;
* precios protegidos;
* analytics.

## Fundadores, implementación y referidos — 12

* máximo diez;
* concurrencia;
* ordinal;
* no liberación;
* exoneración;
* segundo pago mensual;
* no piloto;
* no cortesía;
* no doble comisión;
* anual en revisión manual.

## Entitlements — 14

* default disabled;
* activación;
* suspensión;
* navegación;
* APIs;
* roles;
* acceso directo;
* aislamiento;
* preservación de datos;
* backfill con y sin datos.

## Smoke integral con dos tenants — 2

Tenant A:

* Plan Gestión sin add-ons.

Tenant B:

* Plan Gestión con Reservas activadas y Pagos desactivados.

Verificar:

* precios;
* acceso;
* pagos;
* piloto;
* conversión;
* navegación;
* APIs;
* reportes;
* aislamiento.

Mínimo esperado:

`64 pruebas focalizadas`

No reduzcas cobertura para cumplir el número.

---

# 28. Validaciones finales

Después de corregir las pruebas focalizadas:

1. ejecuta una sola vez la suite integral;
2. corrige cualquier regresión;
3. vuelve a ejecutar la suite integral solo si modificaste código transversal después de esa ejecución.

Finalmente:

```text
npm run test:db:deploy
npx prisma generate
npx prisma validate
npx tsc --noEmit
npm run lint
git diff --check
```

No uses correos reales.

No uses credenciales reales.

No realices cobros reales.

---

# 29. Documentación

Actualiza:

```text
docs/programa-mejora/22-adaptacion-comercial-aplicacion/04-respuesta-codex-implementacion-capa-comercial.md
```

Incluye además un runbook para configurar el entorno real:

* verificar reglas mensuales;
* verificar reglas de piloto;
* activar perfil comercial;
* configurar add-ons;
* confirmar pago;
* iniciar piloto;
* convertir;
* corregir datos;
* revisar auditoría.

No pongas secretos ni datos reales.

---

# 30. Informe final

Entrega:

1. Diagnóstico final.
2. Arquitectura elegida.
3. Migraciones y backfill.
4. Ficha comercial.
5. Precios.
6. Pagos y analytics.
7. Piloto de 45 días.
8. Conversión mensual.
9. Conversión anual.
10. Descuentos.
11. Fundadores.
12. Referidos.
13. Implementación.
14. Entitlements.
15. Super Admin.
16. ADMIN, CONSEJO y RESIDENTE.
17. Seguridad e idempotencia.
18. Pruebas focalizadas.
19. Suite integral.
20. Riesgos restantes.
21. Archivos modificados.
22. Estado final:

* `IMPLEMENTADO`;
* `IMPLEMENTADO CON RIESGOS`;
* `BLOQUEADO`.

No hagas commit.

No hagas push.

No crees tags.

No inicies otra fase.
