# FASE C7A — AUDITORÍA DE ADAPTACIÓN COMERCIAL Y OPERATIVA

Fecha de revisión: 2026-07-29

Alcance: auditoría estática de documentación, modelo Prisma, servicios, APIs y
pantallas. No se modificó código, schema, migraciones ni configuración. No se
consultó ni modificó la base de datos. No se ejecutaron pruebas, Prisma,
typecheck, lint ni build.

## 1. Resumen ejecutivo

**Veredicto: `REQUIERE CAPA COMERCIAL MÍNIMA`.**

La aplicación está considerablemente mejor preparada como producto operativo
de PQRS que como sistema para ejecutar la oferta comercial aprobada. El núcleo
técnico ya permite:

- crear conjuntos e invitar a su administrador;
- aislar usuarios y datos por conjunto;
- administrar categorías y dos workflows de PQRS;
- gestionar casos, evidencias, correcciones, reportes y exportaciones;
- registrar suscripciones mensuales, pagos, mora, cortesías y auditoría;
- cobrar una suscripción recurrente mediante Mercado Pago;
- operar Reservas y Pagos de residentes como módulos funcionales.

Sin embargo, la oferta comercial vigente no puede representarse con fidelidad:

1. El alta de un conjunto crea un `TRIAL` gratuito de **15 días**, no un piloto
   guiado pago de 45 días.
2. No existe un concepto de piloto, sus fechas, su precio único, el precio
   posterior ni su decisión de conversión.
3. El seed de precios del repositorio conserva rangos anteriores
   (`$80.000/$120.000/$160.000/$220.000`) y el último rango es abierto desde
   201 unidades. Esto contradice la tarifa vigente y cobraría automáticamente
   a conjuntos de más de 600 unidades en vez de exigir cotización.
4. No se distingue pago de piloto, mensualidad, anualidad, implementación,
   transferencia manual o comisión. Usar cortesía o renovación simulada
   preserva acceso técnico, pero falsea el significado comercial.
5. Reservas y Pagos aparecen en la navegación de ADMIN, CONSEJO y RESIDENTE
   para todos los conjuntos. No existe habilitación por tenant ni contrato de
   add-on.
6. No existe una ficha comercial por conjunto para fundador, protección de
   tarifa, descuento, referido, implementación, próxima acción o fecha de
   decisión.

Estos problemas son P0 porque pueden cobrar un valor incorrecto, asignar fechas
incorrectas, mostrar módulos no contratados y perder compromisos comerciales.
No se corrigen con una hoja de cálculo: la hoja puede acompañar la operación,
pero no debe ser la autoridad que determine acceso, precio, vigencia o módulos
visibles.

La experiencia funcional por rol es en general utilizable:

| Rol | Evaluación | Motivo principal |
| --- | --- | --- |
| RESIDENTE | `ACEPTABLE CON ACOMPAÑAMIENTO` | Invitación, onboarding, PQRS y soporte son comprensibles; los add-ons no contratados introducen ruido. |
| ADMIN | `FÁCIL` para PQRS; `CONFUSO` para términos comerciales | Gestiona la operación normal sin fundador, pero solo ve licencia mensual y no sabe si está en piloto ni qué incluye. |
| CONSEJO | `FÁCIL` para consulta | Tiene lectura, filtros y exportaciones; también ve add-ons sin relación contractual. |
| SUPER_ADMIN / fundador | `BLOQUEANTE` para pilotos | Puede crear, cobrar, suspender y auditar, pero no puede ejecutar la oferta de 45 días sin reinterpretar estados y pagos. |

## 2. Documentos comerciales encontrados

### Vigentes

La decisión comercial más reciente y coherente está consolidada en
`docs/programa-mejora/17-comercial-pilotos/`:

| Documento | Estado | Contenido relevante |
| --- | --- | --- |
| `01-cliente-oferta-precios.md` | Vigente | Plan Gestión, tres pilotos pagos, primeros diez clientes fundadores. |
| `02-proceso-venta-activacion.md` | Vigente y principal | Tarifas, estados comerciales, descuentos, fundadores, referidos, pago, activación y salida. |
| `03-piloto-guiado-45-dias.md` | Vigente | Estructura 7 + 30 + 8 días, métricas, decisión y conversión. |
| `04-kit-comercial-pilotos.md` | Vigente | Mensajes, propuesta, objeciones y materiales de venta. |
| `05-preparacion-legal-operativa.md` | Vigente | Preparación legal, pagos reales y operación externa. |
| `06-decision-go-no-go.md` | Vacío | No contiene una decisión y no puede ser fuente de verdad. |

La política resultante es:

- único **Plan Gestión**;
- mensualidad: 1–100 `$119.000`, 101–200 `$159.000`, 201–400
  `$199.000`, 401–600 `$249.000`, más de 600 cotización;
- piloto pago de 45 días: 1–200 `$99.000`, 201–400 `$129.000`,
  401–600 `$159.000`, más de 600 cotización;
- primeros diez clientes pagos y convertidos: implementación asistida sin
  costo y precio protegido durante doce meses;
- anualidad anticipada con 10 % de descuento;
- descuento comercial máximo de 5 %, aprobado por fundador, con motivo y
  vigencia, no acumulable ni aplicable al piloto;
- referido: una mensualidad neta, causada después de conversión y segundo pago;
- implementación estándar sin costo; asistida por `$250.000` después de los
  primeros diez;
- Reservas y Pagos de residentes son add-ons.

### Históricos o reemplazados

- `docs/programa-mejora/14-reencuadre-comercial/02-respuesta-claude-auditoria-diagnostico-original.md`
  es un diagnóstico histórico. Habla de piloto de 30 días, considera no
  necesarios anualidad, descuentos y referidos, y clasifica Reservas/Pagos
  como “Premium”. Fue reemplazado por la decisión detallada de la carpeta 17.
- `docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md` aporta
  contexto anterior, pero no debe prevalecer sobre la carpeta 17.
- El `TRIAL` técnico de 15 días presente en código no es una decisión comercial
  documentada vigente.

### Contradicciones que deben declararse expresamente

| Tema | Histórico/técnico | Vigente |
| --- | --- | --- |
| Duración | Trial 15 días; diagnóstico anterior 30 días | Piloto pago 45 días |
| Naturaleza | Prueba gratuita/cortesía | Implementación real pagada |
| Precio | Seed antiguo 80/120/160/220 | 119/159/199/249 |
| >600 unidades | Rango abierto desde 201 | Cotización individual |
| Add-ons | Premium genérico o visibles para todos | Reservas y Pagos contratables por separado |
| Anualidad | No necesaria/no soportada | 10 % por pago anticipado |
| Descuento | No definido | Máximo 5 %, controlado |
| Referidos | No aplicaba | Comisión tras segundo pago |

## 3. Experiencia por rol

### RESIDENTE — `ACEPTABLE CON ACOMPAÑAMIENTO`

Fortalezas verificadas por código:

- La invitación muestra el nombre real del conjunto y deja claro que rol y
  conjunto quedan asociados automáticamente.
- La cuenta nueva exige contraseña de al menos ocho caracteres, una letra y un
  número. La invitación contempla cuenta preexistente.
- El onboarding solicita la unidad residencial y entra al Centro de Estado.
- La creación de PQRS usa categorías activas del conjunto, no una lista global
  fija. El residente no necesita escoger un workflow técnico.
- Puede adjuntar evidencia, consultar estados e historial y usar recuperación
  de contraseña.
- La ayuda técnica se diferencia de una PQRS: el soporte de RESIDENTE restringe
  categorías a problemas técnicos, acceso y privacidad/seguridad.
- El layout utiliza shell móvil y navegación inferior.

Fricciones:

- “Reservas” y “Pagos” aparecen siempre en la navegación inferior aunque el
  conjunto solo haya contratado Plan Gestión.
- La aplicación expone varios conceptos a la vez en el Centro de Estado
  (PQRS, notificaciones, perfil, soporte y add-ons). En el primer piloto debe
  mostrarse solo lo contratado.
- El soporte sigue llegando a la plataforma central; el ADMIN puede ver los
  tickets del conjunto, pero debe mantenerse claro qué problema corresponde a
  administración y cuál a soporte técnico.
- La calidad móvil se infiere por el código responsivo; no se hizo una prueba
  visual o con dispositivo en esta auditoría.

### ADMIN — `FÁCIL` para operación, `CONFUSO` para la relación comercial

Fortalezas:

- Configura categorías, orden, estado activo y workflow `SIMPLE` o
  `MAINTENANCE`.
- Invita un usuario o carga un `.xlsx` con correos; ve creadas, fallidas y
  pendientes de envío.
- Gestiona responsables, primer contacto, fases, notas, correcciones, retiro de
  evidencia y cierre.
- El dashboard enlaza PQRS, usuarios, reportes y licencia.
- Los reportes tienen filtros, estados vacíos, Excel y PDF reales.
- Puede ver la licencia, historial de pagos, tarifa contratada, próxima
  renovación y cambios de precio pendientes.
- Puede operar el conjunto sin acudir al fundador para la gestión ordinaria.

Fricciones:

- La pantalla de licencia solo habla de mensualidad, factura y renovación. No
  presenta piloto, fecha de decisión, precio posterior, condición fundadora,
  anualidad ni add-ons.
- Durante un piloto, el ADMIN podría ver `TRIAL`, “licencia” o “pagar
  mensualidad” sin que esos términos coincidan con el acuerdo.
- Reservas y Pagos de residentes ocupan navegación principal aunque no estén
  contratados.
- Algunas páginas pasan nombres de presentación estáticos como “Ana Ruiz” al
  shell. Aunque los datos operativos sean reales, esa identidad visible puede
  restar confianza y debe verificarse en la futura revisión visual.
- El onboarding de ADMIN permite cambiar nombre y ciudad, pero no presenta un
  checklist comercial ni el alcance acordado.

### CONSEJO — `FÁCIL`

Fortalezas:

- Consulta PQRS, detalle, historial, evidencia, indicadores y actividad sin
  operar casos.
- Los reportes permiten filtros y exportación Excel/PDF.
- El lenguaje de ayuda explica que la gestión corresponde a la administración.

Fricciones:

- Reservas y Pagos están en la navegación de todos los consejos aunque no
  estén contratados.
- No hay una pantalla simple que explique el alcance activo del conjunto. Esto
  puede hacer que el Consejo interprete un módulo visible como incluido.
- La prueba de responsive es inferida, no ejecutada.

### SUPER_ADMIN / fundador — `BLOQUEANTE` para la oferta vigente

Fortalezas:

- Lista, busca, filtra, crea, edita, suspende, cancela y reactiva conjuntos.
- Administra rangos de precio, topes, gracia, integraciones y auditoría.
- Ve pagos, licencias, renovaciones, mora, MRR técnico y analytics.
- Puede otorgar cortesía de 1 a 90 días con motivo e idempotencia.
- Puede registrar una renovación simulada y auditable.
- Puede reenviar invitaciones y exportar datos de un conjunto.

Bloqueos:

- Crear conjunto activa automáticamente un trial de 15 días; el formulario no
  pregunta por pago, piloto, modalidad, precio acordado o fechas.
- La UI dice que generará una licencia “pendiente de pago”, mientras el backend
  crea una suscripción `TRIAL`. Es una contradicción visible.
- El flujo de progreso presenta cuatro pasos, pero el estado solo cambia de 1 a
  5 alrededor de una única petición. No refleja hitos persistidos.
- La pantalla de finalización afirma que se envió la invitación incluso cuando
  el backend puede devolver `invitationSent: false`; solo el toast diferencia el
  fallo.
- El fundador debe recordar fuera del sistema preparación, lanzamiento,
  evaluación, decisión, fundador, referido, implementación y add-ons.
- Cortesía, pago simulado y pago recurrente son herramientas técnicas, no
  sustitutos válidos del piloto pagado ni del pago manual.

## 4. Flujo actual del fundador

| Paso real | Pantalla/acción actual | Registro | Falta | Riesgo |
| --- | --- | --- | --- | --- |
| Prospecto acepta | Fuera de la aplicación | Ninguno | Prospecto, aceptación, alcance, próxima acción | Se pierde el compromiso comercial |
| Se recibe pago de piloto | No hay acción específica | Puede forzarse como renovación simulada o no registrarse | Tipo PILOT, proveedor transferencia, comprobante, valor | Se mezcla con MRR o no queda evidencia |
| Se crea tenant | Super Admin → Crear conjunto | `Tenant`, `Subscription(TRIAL)`, categorías, auditoría, invitación | Datos comerciales y confirmación del pago | Acceso gratuito 15 días aunque el acuerdo sea pago 45 |
| Se asigna precio | Automático por `PricingRule` | Snapshot en `Subscription` | Preview, precio posterior aceptado, >600 cotización | Cobro equivocado |
| Se configura | Onboarding ADMIN y Configuración | Tenant, membresía, categorías | Checklist de implementación | El fundador no sabe qué está pendiente |
| Se importan usuarios | ADMIN → Invitaciones → `.xlsx` | Invitaciones, emails, auditoría | Estado agregado de preparación en Super Admin | Debe revisar otro rol o pedir confirmación |
| Se inicia piloto | No existe acción | El trial comenzó al crear tenant | Fecha de lanzamiento y uso real | Los 45 días empiezan antes de estar listo |
| Seguimiento | Analytics global + reportes por tenant | PQRS y usuarios | Soporte en minutos, fuera de plataforma, reuniones, riesgo | Seguimiento disperso |
| Conversión | Pagar mensualidad/renovación/reactivación | Pago y extensión mensual | Decisión comercial y modalidad | Un `ACTIVE` técnico se interpreta como convertido |
| Renovación | Mercado Pago o simulada | Pago, periodo, auditoría | Anualidad y protección fundadora | Solo ciclos de 30 días |
| Cancelación | Detalle de conjunto → Cancelar/exportar | Estado, fecha y auditoría | Motivo comercial y cierre del piloto | Estado técnico sin aprendizaje comercial |

No hay duplicación de `Subscription` al convertir en el mecanismo actual porque
`Subscription.tenantId` es único. El problema no es duplicar la fila: es perder
el significado del cambio. Un mismo registro pasa de `TRIAL` a `ACTIVE` sin
conservar que existió un piloto pago, sus hitos o la decisión adoptada.

## 5. Pilotos y fechas

### Comportamiento real

- `DEFAULT_TRIAL_DAYS = 15`.
- `createTenantWithAdmin` crea `Tenant.status = TRIAL` y
  `Subscription.status = TRIAL`.
- `currentPeriodStart` es la fecha de creación y `currentPeriodEnd` coincide con
  `trialEndsAt`.
- No existe duración editable en la UI ni una configuración de trial en
  `PlatformSetting`.
- La cortesía permite 1–90 días, pero empieza desde el vencimiento vigente o
  desde hoy y crea un `Payment` de valor cero con proveedor `COURTESY`.
- El cron interpreta vencimiento técnico, no hitos comerciales del piloto.

### Hitos requeridos

| Hito | Estado actual |
| --- | --- |
| Preparación | Inexistente |
| Lanzamiento | Inexistente |
| Inicio de uso real | Inexistente |
| Evaluación | Inexistente |
| Decisión | Inexistente |
| Fin de acceso técnico | Derivable de `Subscription.currentPeriodEnd`, pero hoy representa 15 días |
| Precio de piloto | Inexistente |
| Precio posterior | Solo puede inferirse del snapshot mensual, no consta como precio aceptado |
| Alertas | Existen alertas de licencia, no alertas de hitos de piloto |
| Conversión | Inferida erróneamente por estado de suscripción |

### Conclusión sobre cortesía

La cortesía **no es adecuada** para representar el piloto:

- registra valor cero;
- no prueba pago;
- no conserva tarifa de piloto;
- no distingue preparación, uso y evaluación;
- puede deformar conversión y analytics;
- comunica una excepción gratuita donde comercialmente hubo una venta.

Puede seguir existiendo para compensaciones reales, pero no debe reutilizarse
como piloto.

## 6. Precios y billing

### Precio mensual

`PricingRule` es un motor técnico útil:

- selecciona una regla activa por número de unidades;
- evita unidades no positivas;
- valida rangos superpuestos y monotonicidad de precios;
- permite crear, editar, activar, desactivar y eliminar reglas desde Super
  Admin;
- registra cambios en auditoría;
- guarda un snapshot de unidades, precio y moneda en `Subscription`;
- cambiar una regla no recalcula automáticamente suscripciones existentes;
- cambiar las unidades de un tenant calcula términos pendientes para la
  siguiente renovación y sincroniza Mercado Pago cuando aplica.

El repositorio, sin embargo, siembra:

| Rango del seed | Precio |
| --- | ---: |
| 1–50 | $80.000 |
| 51–100 | $120.000 |
| 101–200 | $160.000 |
| 201+ | $220.000 |

No coincide con la política vigente. Debido a que esta auditoría prohíbe
consultar la base de datos, no se puede afirmar qué reglas fueron editadas en
el entorno desplegado. Por tanto:

- la **configuración viva no quedó verificada**;
- el estado reproducible del repositorio es incorrecto;
- un despliegue nuevo nace con precios antiguos;
- un conjunto de más de 600 unidades recibe `$220.000` por la regla abierta, no
  una cotización individual.

Si se reemplaza el rango abierto por uno hasta 600, un alta de más de 600
fallaría con “No hay regla de precio activa”; tampoco existe flujo de
cotización u override.

No hay override por tenant con motivo, vigencia y auditoría. Cambiar una
`PricingRule` global no debe usarse para negociar una excepción individual.

### Precio del piloto

No existe:

- tabla o configuración para rangos de piloto;
- `paymentKind` o concepto equivalente;
- proveedor de transferencia bancaria/manual explícito;
- precio posterior aceptado;
- exclusión del pago de piloto frente a MRR o comisión;
- notificación específica de piloto pagado.

`Payment` exige `subscriptionId`, periodo y proveedor entre los valores
técnicos existentes. Una renovación simulada:

- queda `APPROVED`;
- extiende acceso;
- se suma como pago aprobado en analytics;
- parece mensualidad;
- no conserva que fue una transferencia por piloto.

### Mensualidad y Mercado Pago

La mensualidad sí tiene una implementación técnica coherente:

- ciclo de 30 días;
- snapshot de precio;
- preapproval de Mercado Pago;
- webhook e idempotencia;
- periodo de gracia, suspensión y reactivación;
- cambios pendientes de tarifa;
- outbox de notificaciones.

Esto sirve para continuidad mensual, no para piloto ni anualidad.

## 7. Fundadores

No existe equivalente persistido de:

- cliente fundador;
- número fundador;
- fecha de concesión;
- protección hasta;
- implementación exonerada;
- cupos restantes.

Tampoco existe una transición comercial que defina cuándo “pagó y continuó”.
Contar los primeros diez `Payment(APPROVED)` sería incorrecto porque incluiría:

- pagos de piloto;
- pagos simulados;
- cortesías;
- reactivaciones;
- reintentos históricos;
- pagos aprobados luego anulados o disputados.

La asignación estable requiere una operación transaccional al convertir, no un
cálculo dinámico por fecha. Debe conservar un ordinal inmutable y la evidencia
del evento que lo causó. Cancelar después no debería renumerar a los anteriores;
la política debe aclarar si libera o no un cupo. La recomendación para evitar
promesas cambiantes es **no liberar el número una vez otorgado**, salvo
corrección administrativa auditada.

Para los primeros tres pilotos puede seguirse el cupo manualmente, pero antes
del cuarto cliente debe quedar persistido y visible. La protección de precio sí
debe estar en la aplicación antes de aplicar una renovación que pudiera cambiar
la tarifa.

## 8. Descuentos y anualidad

### Anualidad

No está implementada:

- `BILLING_PERIOD_DAYS` es 30;
- Mercado Pago se configura para frecuencia mensual;
- `Subscription` no tiene modalidad o intervalo;
- no existe cálculo de 12 meses menos 10 %;
- la UI de ADMIN solo ofrece mensualidad;
- no hay pago manual anual ni próxima renovación anual.

Otorgar 365 días de cortesía sería comercial y contablemente incorrecto: valor
cero, sin descuento, sin modalidad y sin evidencia de pago.

Para los tres pilotos, la anualidad puede cobrarse por transferencia y
registrarse manualmente en la operación externa, pero la aplicación necesita
como mínimo conservar el pago, precio de lista, descuento, precio efectivo,
periodo y modalidad antes de activar doce meses.

### Descuento comercial

No hay campo ni servicio para:

- porcentaje;
- precio de lista y efectivo;
- motivo;
- fecha de inicio/fin;
- aprobador;
- límite de 5 %;
- no acumulación;
- exclusión del piloto.

Modificar `PricingRule` altera la oferta global. Cambiar directamente
`Subscription.priceCents` no tiene UI ni conserva el precio de lista. Otorgar
cortesía reduce el costo efectivo de forma opaca. Ninguno es un descuento
válido.

## 9. Referidos y comisiones

No existe registro de fuente, referido, acuerdo, base de cálculo, estado,
causación o pago de comisión.

El sistema sí dispone de piezas derivables:

- pagos aprobados e idempotentes;
- valor efectivamente registrado;
- orden temporal;
- estado de la suscripción;
- auditoría.

Pero no puede saber:

- cuál pago fue piloto;
- cuál fue primer o segundo pago mensual;
- si existió devolución/disputa completa;
- precio neto después de descuento e impuestos/costos;
- quién refirió;
- si la comisión ya se pagó.

Para tres pilotos, el pago bancario de la comisión debe permanecer manual. La
relación del referido y la regla de causación no deberían depender de memoria:
antes del cuarto cliente deben quedar en la ficha comercial o en un registro
simple de referido. La automatización contable de la comisión es P2.

## 10. Implementación

No se diferencia:

- `STANDARD`;
- `ASSISTED`;
- `FOUNDER_WAIVED`.

No se registra tarifa de `$250.000`, exoneración, pago, inicio/fin, horas ni
checklist comercial. El onboarding técnico de ADMIN tiene tres pasos y la
configuración de categorías es útil, pero no sustituye el checklist de
implementación que exige validar datos, capacitación, invitaciones y smoke
test.

Para tres pilotos pueden permanecer manuales:

- horas de limpieza;
- horas de capacitación;
- actas;
- archivo original y su autorización;
- tareas internas detalladas.

La aplicación sí debe conservar antes de conceder acceso:

- tipo de implementación prometida;
- si tiene costo o está exonerada;
- estado general del checklist;
- fecha de lanzamiento.

## 11. Add-ons

### Estado actual

- `ADMIN_NAV` incluye siempre `/admin/reservas` y `/admin/pagos`.
- `CONSEJO_NAV` incluye siempre `/consejo/reservas` y `/consejo/pagos`.
- La navegación de RESIDENTE incluye siempre `/residente/reservas` y
  `/residente/pagos`.
- Las páginas y APIs son funcionales; no son placeholders.
- Los únicos feature flags globales son soporte y correo transaccional.
- No existe flag por tenant para Reservas o Pagos.
- Super Admin no ve qué add-on contrató cada tenant.
- No existe precio, estado comercial, configuración pendiente o fecha de
  activación del add-on.

### Riesgo

Es P0: un usuario puede interpretar una función visible como parte del Plan
Gestión, usarla sin contrato y exigir soporte o continuidad. Ocultar solo el
menú no basta; las rutas y APIs también deben comprobar el entitlement.

### Solución mínima

Un entitlement por tenant y módulo, con:

- `feature`: `RESERVATIONS` o `RESIDENT_PAYMENTS`;
- estado `DISABLED`, `SETUP`, `ACTIVE`, `SUSPENDED`;
- fecha de activación/desactivación;
- actor y motivo;
- opcionalmente precio acordado y próxima revisión;
- chequeo central en navegación, páginas y APIs;
- desactivación que no elimine datos;
- auditoría.

No hace falta construir un catálogo completo de planes. Dos entitlements
explícitos son suficientes.

## 12. Decisiones desde Super Admin

### Antes del piloto

| Elemento | Disponibilidad |
| --- | --- |
| Documentos pendientes | No disponible; debe seguir manual por ahora |
| Pago de piloto pendiente | No disponible |
| Base de residentes pendiente | Solo inferible revisando invitaciones; no está en panel de tenant |
| Configuración pendiente | No disponible como checklist |
| Capacitación pendiente | No disponible; manual viable |
| Smoke test pendiente | No disponible |
| Fecha de lanzamiento | No disponible |

### Durante el piloto

| Elemento | Disponibilidad |
| --- | --- |
| Días restantes | Disponible solo para el trial técnico de 15 días |
| Días de uso real | No disponible |
| PQRS creadas | Disponible automáticamente por tenant |
| Adopción | Derivable de usuarios/PQRS, no presentada como métrica de piloto |
| Usuarios activados | Derivable de membresías/onboarding |
| Solicitudes fuera del sistema | Manual |
| Minutos de soporte | Manual |
| Fallos | Parcial en tickets; no consolidado por piloto |
| Próxima revisión | No disponible |
| Riesgo de no conversión | No disponible |

### Al terminar

| Elemento | Disponibilidad |
| --- | --- |
| Fecha de decisión | No disponible |
| Precio posterior | Snapshot técnico, no acuerdo comercial |
| Mensual/anual | Solo mensual |
| Descuento aplicable | No disponible |
| Fundador | No disponible |
| Referido | No disponible |
| Conversión | Analytics infiere desde `TRIAL` vencido y estado técnico; no es confiable |
| Cancelación | Disponible y auditada |
| Exportación | Disponible |

El analytics actual calcula conversión de trials vencidos contando `ACTIVE` o
`GRACE_PERIOD` como convertidos y `SUSPENDED` o `CANCELLED` como perdidos. Esa
métrica no representa la oferta: un piloto puede estar técnicamente activo sin
haber convertido y el pago del piloto no es mensualidad.

## 13. Fuente de verdad

No existe una ficha única. La fuente actual está fragmentada:

| Dato | Fuente actual | Calidad |
| --- | --- | --- |
| Unidades | `Tenant.units`; snapshot en `Subscription.unitsSnapshot` | Implementado; duplicación intencional por vigencia |
| Tarifa de lista | `PricingRule` | Parcial; reglas vivas mutables y seed desactualizado |
| Tarifa contratada | `Subscription.priceCents` | Implementado para mensualidad |
| Tipo de cliente | Ninguna | Ausente |
| Estado comercial | Ninguna | Ausente |
| Estado técnico | `Tenant.status` y `Subscription.status` | Implementado, con duplicación |
| Piloto | Ninguna; se usa `TRIAL` de forma ambigua | Bloqueante |
| Inicio y fin de piloto | Ninguna | Ausente |
| Precio de piloto | Ninguna | Ausente |
| Precio posterior | Inferible de `Subscription`, no aceptado | Parcial |
| Modalidad | Implícitamente mensual | Ausente como dato |
| Descuento | Ninguna | Ausente |
| Fundador | Ninguna | Ausente |
| Protección de precio | Ninguna | Ausente |
| Referido | Ninguna | Ausente |
| Comisión | Ninguna | Ausente |
| Implementación | Ninguna | Ausente |
| Add-ons | Presencia de módulos global, no entitlement | Bloqueante |
| Próxima acción | Ninguna | Ausente |
| Fecha de decisión | Ninguna | Ausente |

`AuditLog` es adecuado para historial, no para reconstruir el estado vigente.
`PlatformSetting` sirve para políticas globales, no para datos por tenant.
Metadata de auditoría no debe convertirse en la fuente de verdad consultable.

## 14. Estados técnicos y comerciales

Estados técnicos actuales:

```text
PENDING_PAYMENT
TRIAL
ACTIVE
GRACE_PERIOD
SUSPENDED
CANCELLED
```

Son apropiados para acceso y facturación, pero insuficientes para:

```text
PROSPECT
PILOT_PENDING
PILOT_ACTIVE
PILOT_EVALUATION
CONVERTED_MONTHLY
CONVERTED_ANNUAL
NOT_CONVERTED
CANCELLED
```

No deben reemplazarse unos por otros. Deben coexistir:

- estado técnico: si el tenant puede acceder y cuál es su situación de cobro;
- estado comercial: qué decisión o etapa contractual atraviesa.

Ejemplos:

- `PILOT_ACTIVE` + `ACTIVE`: piloto pago con acceso habilitado;
- `PILOT_EVALUATION` + `ACTIVE`: acceso vigente mientras se decide;
- `CONVERTED_ANNUAL` + `ACTIVE`: contrato anual al día;
- `NOT_CONVERTED` + `CANCELLED`: salida completada;
- `CONVERTED_MONTHLY` + `GRACE_PERIOD`: cliente convertido, actualmente en mora.

Usar `TRIAL` como piloto produce contradicciones porque hoy implica una prueba
gratuita automática de 15 días.

## 15. Métricas

| Métrica | Clasificación | Evidencia/fuente |
| --- | --- | --- |
| Primera PQRS | Derivable | `Pqrs.createdAt` mínimo por tenant |
| PQRS totales | Automática | Conteos por tenant |
| PQRS por semana | Derivable | `Pqrs.createdAt` |
| Casos cerrados | Automática | Estado y `fechaCierre` |
| Primer contacto | Automática/derivable | `fechaPrimerContacto` |
| Tiempo de cierre | Automática | `tiempoRespuestaCierre` y reportes |
| Usuarios invitados | Automática | `Invitation` |
| Usuarios activados | Derivable | invitación aceptada, membresía y onboarding |
| Administradores activos | Derivable | membresía activa por rol |
| Consejo activo | Derivable | membresía activa/onboarding |
| Correcciones | Automática/derivable | `PqrsCorrection` |
| Evidencias | Automática/derivable | fotos/evidencia y retiros |
| Tickets de soporte | Automática | `SupportTicket` |
| Minutos de soporte | Manual |
| Solicitudes fuera de plataforma | Manual |
| Reuniones | Manual |
| Objeciones | Manual |
| Decisión | Inexistente en producto |
| Adopción | Derivable, no consolidada |
| Conversión | Actual cálculo no confiable para piloto comercial |

Para tres pilotos no se justifica telemetría avanzada. Una hoja controlada puede
capturar minutos, reuniones, solicitudes externas y objeciones. Primera PQRS,
volumen, cierres, usuarios y evidencias deben derivarse del producto para evitar
reconteos manuales.

## 16. Matriz completa

### Reglas comerciales

| Regla | Documento | Código | UI | Automatizada | Manual viable | Falta |
| --- | --- | --- | --- | --- | --- | --- |
| Piloto 45 días | IMPLEMENTADO | BLOQUEANTE | BLOQUEANTE | No | No para acceso/fechas | Modelo, fechas, estado y transición |
| Precio piloto | IMPLEMENTADO | BLOQUEANTE | BLOQUEANTE | No | Solo cotización externa, no activación | Rangos y pago tipado |
| Precio mensual | IMPLEMENTADO | PARCIAL | IMPLEMENTADO | Sí | Sí, verificando reglas | Actualizar seed/DB y >600 |
| Fundadores | IMPLEMENTADO | SOLO DOCUMENTADO | SOLO DOCUMENTADO | No | Sí para 3; riesgoso al escalar | Asignación estable y cupos |
| Precio protegido | IMPLEMENTADO | BLOQUEANTE | BLOQUEANTE | No | No si billing recalcula | Vigencia y bloqueo de cambios |
| Implementación incluida | IMPLEMENTADO | SOLO DOCUMENTADO | SOLO DOCUMENTADO | No | Sí | Registro de promesa |
| Implementación asistida | IMPLEMENTADO | SOLO DOCUMENTADO | SOLO DOCUMENTADO | No | Sí para 3 | Tipo, tarifa y estado |
| Anualidad 10 % | IMPLEMENTADO | BLOQUEANTE | BLOQUEANTE | No | Parcial por transferencia | Modalidad, pago y periodo anual |
| Descuento máximo 5 % | IMPLEMENTADO | BLOQUEANTE | BLOQUEANTE | No | Parcial con control externo | Lista/efectivo, motivo, vigencia |
| No acumulación | IMPLEMENTADO | BLOQUEANTE | BLOQUEANTE | No | Riesgoso | Validación de exclusión |
| Referido | IMPLEMENTADO | SOLO DOCUMENTADO | SOLO DOCUMENTADO | No | Sí para 3 | Relación persistida |
| Comisión segundo pago | IMPLEMENTADO | BLOQUEANTE | BLOQUEANTE | No | Sí con conciliación manual | Causación e idempotencia |
| Add-on Reservas | IMPLEMENTADO | PARCIAL | BLOQUEANTE | No | No para control de acceso | Entitlement por tenant |
| Add-on Pagos | IMPLEMENTADO | PARCIAL | BLOQUEANTE | No | No para control de acceso | Entitlement por tenant |
| Conversión piloto | IMPLEMENTADO | BLOQUEANTE | BLOQUEANTE | Inferencia incorrecta | No | Decisión y transición explícitas |
| Cancelación | IMPLEMENTADO | IMPLEMENTADO | IMPLEMENTADO | Parcial | Sí | Motivo comercial/retención |
| Exportación | IMPLEMENTADO | IMPLEMENTADO | IMPLEMENTADO | Bajo demanda | Sí | Asociarla al cierre del piloto |
| Próxima acción | IMPLEMENTADO | SOLO DOCUMENTADO | SOLO DOCUMENTADO | No | Sí para 3 | Campo visible y fecha |
| Métricas piloto | IMPLEMENTADO | PARCIAL | PARCIAL | Algunas | Sí para métricas cualitativas | Vista consolidada |

### Capacidad de modificar reglas sin código

| Regla | UI | API | Base de datos | Código | Auditoría |
| --- | ---: | ---: | ---: | ---: | ---: |
| Precios mensuales | Sí | Sí | `PricingRule` | Sí | Sí |
| Rangos | Sí | Sí | `PricingRule` | Sí | Sí |
| Unidades | Sí, Super Admin | Sí | `Tenant` + pendiente en `Subscription` | Sí | Sí |
| Periodo de gracia | Sí | Sí | `PlatformSetting` | Sí | Sí |
| Duración de trial | No | No | Solo fechas de suscripción | Constante 15 | No |
| Fechas de acceso | Solo cortesía/renovación | Parcial | `Subscription` | Sí | Sí |
| Estado tenant | Sí | Sí | Tenant + Subscription | Sí | Sí |
| Pago manual | Simulado, no transferencia | Parcial | `Payment` | Parcial | Sí |
| Cortesía | Sí | Sí | `Payment` + `Subscription` | Sí | Sí |
| Add-ons | No | No | Sin entitlement | No | No |
| Categorías | ADMIN, no Super Admin central | Sí tenant-scoped | `PqrsCategory` | Sí | Sí |
| Workflows | ADMIN | Sí tenant-scoped | Categoría + snapshot PQRS | Sí | Sí |
| Descuento | No | No | No | No | No |
| Anualidad | No | No | No modalidad | No | No |
| Fundador | No | No | No | No | No |
| Referido | No | No | No | No | No |
| Comisión | No | No | No | No | No |
| Implementación | No | No | No | No | No |
| Fechas piloto | No | No | No | No | No |
| Precio posterior aceptado | No | No | Solo snapshot técnico | Parcial | Parcial |
| Fecha de decisión | No | No | No | No | No |
| Soporte habilitado | Sí, global | Sí | `PlatformSetting` | Sí | Sí |
| Retención | No como política configurable | Export/cancel parcial | `cancelledAt` | Parcial | Sí en cancelación |

### Seguridad comercial

- Las APIs de configuración de plataforma revisadas exigen `SUPER_ADMIN`.
- Las operaciones sensibles usan tenant objetivo explícito y auditoría.
- Precio y unidades se validan en servidor; no se confía solo en la UI.
- Renovaciones simuladas y cortesías tienen clave de operación e idempotencia.
- Reactivación exige evidencia vigente y es transaccional.
- Los secretos de integraciones no se exponen; la UI solo muestra estado.
- La futura ficha comercial debe conservar estas mismas reglas.
- Los entitlements de add-ons deben verificarse en backend; ocultar navegación
  sería insuficiente.
- ADMIN no debe poder enviar precio, descuento, condición fundadora o add-on
  como autoridad.
- Un tenant objetivo inexistente o cruzado debe responder de forma opaca,
  reutilizando la autorización central.

## 17. Brechas P0/P1/P2

### P0 — antes del primer piloto

1. **Piloto comercial explícito.** Persistir estado, precio pagado, precio
   posterior aceptado y fechas de preparación, lanzamiento, uso, evaluación y
   decisión. El acceso debe derivar de esta vigencia, no del trial automático.
2. **Pago de piloto/manual diferenciado.** Registrar transferencia o pago
   manual como pago real de piloto, sin sumarlo a MRR, mensualidad ni segundo
   pago de comisión.
3. **Tarifas vigentes y >600.** Alinear el estado reproducible y verificar el
   entorno vivo antes de cobrar. Más de 600 debe bloquear cobro automático y
   requerir cotización aprobada.
4. **Entitlements de Reservas y Pagos.** Ocultar y denegar rutas/APIs cuando no
   estén contratados, conservando datos históricos.
5. **Fuente comercial mínima por tenant.** Mostrar en un solo lugar precio,
   modalidad, piloto, estado, fechas, add-ons y próxima acción. Sin esto se
   pierden promesas esenciales.
6. **Separar estado técnico y comercial.** El analytics y las decisiones no
   deben interpretar `TRIAL/ACTIVE` como `PILOT/CONVERTED`.
7. **Protección del precio acordado.** Guardar precio posterior y evitar que una
   edición global cambie la promesa antes de convertir.

### P1 — antes del cuarto cliente

1. Asignación transaccional de los diez cupos fundadores.
2. `priceProtectedUntil` y exoneración de implementación visibles.
3. Modalidad anual con 10 %, pago anticipado y periodo exacto.
4. Descuento comercial máximo 5 %, motivo, vigencia, aprobador y no
   acumulación.
5. Referido y causación de comisión al segundo pago.
6. Tipo de implementación, tarifa y checklist resumido.
7. Panel operativo de piloto con días, métricas, riesgos y decisión.
8. Corrección de mensajes del alta: licencia pendiente/trial e invitación
   fallida.
9. Vista de alcance contratado para ADMIN y CONSEJO.

### P2 — después de validar

1. CRM completo de prospectos.
2. Forecasting y pipeline comercial.
3. Automatización bancaria de comisiones.
4. Facturación contable automatizada.
5. Instrumentación automática de minutos y reuniones.
6. Scoring de riesgo de conversión.
7. Catálogo general de planes/add-ons y pricing avanzado.
8. Portal de cotización autoservicio para más de 600 unidades.

## 18. Capa comercial mínima recomendada

### 18.1 Ficha comercial 1:1 por tenant

Conviene una entidad explícita y tipada, no reconstruir el estado desde
`AuditLog`. Nombre orientativo: `TenantCommercialProfile`.

Campos mínimos:

- `tenantId` único;
- `commercialStatus`;
- `pilotStatus`;
- `pilotPreparationStartsAt`;
- `pilotLaunchAt`;
- `pilotRealUseStartsAt`;
- `pilotEvaluationAt`;
- `decisionDueAt`;
- `pilotPriceCents`;
- `postPilotListPriceCents`;
- `postPilotContractPriceCents`;
- `billingMode` (`MONTHLY`/`ANNUAL`);
- `isFounderCustomer`, `founderNumber`, `founderGrantedAt`;
- `priceProtectedUntil`;
- descuento, motivo, inicio, fin y aprobador;
- implementación tipo, tarifa y exoneración;
- referido básico y estado de comisión;
- próxima acción y fecha;
- notas comerciales acotadas.

No es necesario guardar aquí unidades o estado técnico: ya viven en `Tenant` y
`Subscription`.

### 18.2 Pagos con concepto

Agregar un concepto inequívoco:

```text
PILOT
SUBSCRIPTION_MONTHLY
SUBSCRIPTION_ANNUAL
IMPLEMENTATION
```

Debe existir proveedor manual/transferencia y referencia de conciliación. Si
extender `Payment` fuerza semánticas incorrectas porque siempre exige una
suscripción y periodo recurrente, es preferible una entidad comercial de cobro
que luego active la suscripción mediante una operación auditada. La decisión
de diseño debe preservar:

- precio de lista;
- precio efectivo;
- descuento;
- concepto;
- periodo cubierto;
- proveedor;
- estado e idempotencia.

### 18.3 Entitlements por tenant

Entidad o relación simple para `RESERVATIONS` y `RESIDENT_PAYMENTS`, con estado
y auditoría. No usar un `PlatformSetting` global porque dos conjuntos pueden
contratar alcances distintos.

### 18.4 Configuración comercial global

`PlatformSetting` puede conservar valores de política:

- días y distribución por defecto del piloto;
- cantidad máxima de fundadores;
- descuento anual 10 %;
- descuento comercial máximo 5 %;
- tarifa de implementación asistida;
- reglas de piloto.

Los rangos mensuales continúan en `PricingRule`. El precio de piloto puede usar
una segunda clase de regla o una tabla pequeña con tipo `PILOT`; no debe
mezclarse con el precio mensual.

### 18.5 Panel operativo

En el detalle de conjunto de Super Admin:

- bloque “Comercial” con estado, piloto, precios y modalidad;
- bloque “Preparación” con checklist corto;
- bloque “Seguimiento” con métricas automáticas y cuatro entradas manuales;
- bloque “Decisión” con convertir mensual, convertir anual, extensión
  excepcional o no convertir;
- bloque “Alcance” con add-ons.

Cada acción debe validar en servidor, ser idempotente y escribir `AuditLog`.

### Reutilización de infraestructura

| Pieza existente | Reutilización |
| --- | --- |
| `Tenant` | Identidad, unidades y estado de acceso |
| `Subscription` | Términos técnicos vigentes y renovación |
| `Payment` | Pagos recurrentes; ampliar concepto solo si conserva semántica |
| `PricingRule` | Tarifa mensual de lista |
| `PlatformSetting` | Políticas globales no secretas |
| `AuditLog` | Historial de decisiones, nunca estado vigente |
| Outbox/notificaciones | Alertas de hitos, pago y decisión |
| Exportación tenant | Salida de piloto |
| Autorización central | Exclusividad SUPER_ADMIN |

## 19. Trabajo que debe permanecer manual

Durante los tres primeros pilotos:

- CRM de prospectos y conversaciones;
- actas y aprobación del Consejo;
- documentos legales, firma y aceptación comercial;
- cuenta de cobro/factura según obligación tributaria;
- conciliación inicial de transferencias;
- pago bancario de comisiones;
- limpieza de archivos de residentes;
- minutos de soporte;
- solicitudes recibidas por WhatsApp, correo o llamada;
- reuniones, objeciones y feedback cualitativo;
- horas detalladas de implementación;
- aprobación humana de descuentos y excepciones;
- cotización individual para más de 600 unidades;
- decisión sobre impuestos y costos de pasarela en comisión.

La aplicación debe controlar únicamente aquello cuyo error manual afecta:

| Control | Justificación |
| --- | --- |
| Acceso y vigencia | Evita habilitar antes del pago o cortar antes de 45 días |
| Precio acordado | Evita cobrar una tarifa distinta a la propuesta |
| Concepto del pago | Evita deformar MRR, comisión y renovación |
| Fechas de piloto | Evita empezar durante preparación o olvidar la decisión |
| Modalidad | Determina periodo, descuento y renovación |
| Add-ons | Evita mostrar o permitir módulos no contratados |
| Fundador/protección | Evita romper una promesa de doce meses |
| Descuento/no acumulación | Evita descuentos indebidos |
| Conversión/cancelación | Preserva historia y acceso correcto |
| Próxima acción | Evita olvidar hitos críticos |
| Auditoría | Permite explicar quién cambió un compromiso |

## 20. Veredicto

### Capacidad técnica del producto

**Alta.** PQRS, multi-tenancy, invitaciones, reportes, exportación, billing
mensual, Mercado Pago, auditoría y módulos adicionales tienen base real. No se
requiere reconstruir el producto.

### Capacidad operativa del fundador

**Media para administrar conjuntos; baja para ejecutar pilotos.** Puede crear,
configurar, invitar, suspender y revisar datos. No puede saber desde una sola
pantalla qué se vendió, qué se pagó, cuándo empezó el piloto o qué debe decidir.

### Cumplimiento de reglas comerciales

**Bajo.** La mayoría están solo documentadas. Los cuatro desajustes P0 más
graves son trial 15 vs piloto pago 45, seed de precios anterior, pagos sin
concepto comercial y add-ons globalmente visibles.

### Facilidad de uso

**Buena para RESIDENTE, ADMIN y CONSEJO dentro del núcleo PQRS; bloqueante para
SUPER_ADMIN en el ciclo comercial.**

### Resultado final

`REQUIERE CAPA COMERCIAL MÍNIMA`

No se recomienda iniciar un piloto cobrado usando el flujo actual como fuente
de verdad. Sí se recomienda implementar una fase corta y acotada con:

1. ficha comercial por tenant;
2. piloto pago de 45 días y sus hitos;
3. concepto de pago manual/piloto;
4. tarifas vigentes con cotización >600;
5. entitlements de Reservas y Pagos;
6. conversión explícita mensual/anual y auditoría.

El resto puede permanecer manual durante tres pilotos. Esta conclusión no
autoriza implementación en esta fase.
