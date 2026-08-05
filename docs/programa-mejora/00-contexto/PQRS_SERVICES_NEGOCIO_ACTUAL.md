# PQRS Services: contexto canónico de producto y negocio

**Última actualización:** 5 de agosto de 2026

**Estado:** documento vigente

**Marca:** PQRS Services

**Mercado inicial:** propiedad horizontal, principalmente conjuntos residenciales de Bogotá y Colombia

> Este documento es la fuente principal para entender qué vende PQRS Services, cómo funciona la aplicación y qué reglas operativas deben respetarse. Describe el estado real del repositorio. Cuando una política comercial todavía no está automatizada, se indica expresamente.

## 1. Resumen ejecutivo

PQRS Services es una plataforma web multi-conjunto para que una copropiedad gestione solicitudes de residentes, trazabilidad administrativa, reportes y, cuando se contratan, reservas de zonas comunes y pagos de residentes.

El servicio se vende directamente a cada conjunto. El proceso comercial esperado es:

1. Contacto y demostración.
2. Propuesta y definición de alcance.
3. Revisión y firma de una orden de servicio o contrato.
4. Activación del conjunto.
5. Invitación del ADMIN principal.
6. Configuración y onboarding.
7. Operación continua, soporte, cobro y renovación.

La duración contractual y la forma de pago son independientes. Un contrato puede durar uno o varios años y pagarse mensual manual, mensual automático o anual anticipado.

La plataforma comparte una infraestructura y una base de código, pero cada conjunto conserva aislamiento lógico de usuarios, PQRS, archivos, reservas, pagos y actividad.

## 2. Qué problema resuelve

La operación tradicional de un conjunto suele dispersar solicitudes entre WhatsApp, correo, llamadas y documentos. Eso dificulta saber qué se recibió, quién respondió, cuánto tardó, qué evidencia existe y qué puede supervisar el consejo.

PQRS Services centraliza:

- radicación y seguimiento de PQRS;
- categorías y flujos configurables;
- responsables, prioridades, notas, fases y cierre;
- evidencias privadas;
- notificaciones y correos transaccionales;
- reportes PDF y Excel;
- usuarios e invitaciones por conjunto;
- actividad y auditoría;
- reservas de zonas comunes como módulo opcional;
- cartera y pagos de residentes como módulo opcional;
- licencia, pagos del servicio y renovación;
- operación global de conjuntos desde SUPER_ADMIN.

## 3. Identidad del negocio

- **Nombre comercial:** PQRS Services.
- **Prestador:** persona natural identificada con los datos configurados en NEXT_PUBLIC_LEGAL_*.
- **Cliente:** la persona jurídica de propiedad horizontal o entidad identificada en la orden o contrato.
- **Usuario contratante:** el representante autorizado que firma o acepta la orden.
- **Usuarios de la plataforma:** ADMIN, CONSEJO y RESIDENTE invitados por un usuario autorizado.
- **Proveedor principal de pago en línea:** Wompi.
- **Infraestructura principal:** Vercel, Supabase PostgreSQL, Supabase Storage y Resend.

La invitación de una persona a la plataforma no la convierte automáticamente en representante contractual del conjunto. La obligación comercial nace de la propuesta, orden o contrato firmado por quien tenga facultades.

## 4. Modelo comercial aprobado

### 4.1 Precio

La tarifa de lista depende del número de unidades y del alcance contratado. Las reglas se guardan en base de datos y las administra SUPER_ADMIN; la landing consulta los rangos activos y no contiene precios escritos a mano.

No se cobra por usuario. El número de ADMIN, CONSEJO y RESIDENTE permitidos se rige por el alcance comercial y las políticas de invitación, no por una tarifa individual en la interfaz.

Los módulos RESERVATIONS y RESIDENT_PAYMENTS son add-ons con entitlement por conjunto. Pueden estar DISABLED, SETUP, ACTIVE o SUSPENDED.

### 4.2 Duración y periodos

- El plazo se fija en la orden o contrato y puede ser de uno o varios años.
- Un contrato multianual se divide en periodos anuales de servicio.
- La periodicidad de pago no modifica el plazo.
- El precio del periodo anual en curso se respeta, salvo cambio solicitado de unidades o módulos, impuestos exigibles o acuerdo escrito.
- Una renovación automática del contrato debe quedar pactada expresamente.
- La no renovación se comunica con al menos 30 días calendario, salvo plazo diferente en la orden.

### 4.3 Modalidades de pago

1. **Mensual manual:** el conjunto transfiere o paga por el canal acordado y SUPER_ADMIN confirma el pago.
2. **Mensual automática:** el ADMIN registra y autoriza un medio de pago en Wompi; el cron genera cobros periódicos.
3. **Anual anticipada:** se pagan doce mensualidades con 10 % de descuento. Puede iniciarse mediante checkout Wompi o confirmación manual autorizada.

Revocar un medio de pago automático cambia el mecanismo de cobro, pero no termina el contrato.

### 4.4 Anualidad

La función annualTerms() calcula:

- valor de lista: tarifa mensual por 12;
- descuento: ANNUAL_DISCOUNT_BPS = 1000;
- valor efectivo: 90 % del valor anual de lista;
- cobertura: doce meses calendario.

El descuento anual no se acumula con descuentos comerciales sobre el mismo periodo. El webhook aprobado es quien aplica la cobertura; una redirección al checkout no activa por sí sola la licencia.

### 4.5 Terminación anticipada

La política pública vigente aplica estas reglas, sujetas a la orden firmada y revisión profesional:

- mensual con beneficio sustancial de permanencia expresamente pactado: compensación máxima igual al menor valor entre dos mensualidades netas y lo pendiente del periodo anual actual;
- si el beneficio o la compensación no aparecen expresamente en la orden, no se presumen;
- anual anticipado: los meses completos consumidos se reliquidan a tarifa mensual de lista y se reembolsan los meses completos no utilizados;
- no se acumula una segunda penalidad sobre una anualidad reliquidada;
- si PQRS Services incumple de forma grave y no subsana, no hay compensación y procede devolución proporcional de saldos no prestados;
- se respetan los derechos imperativos que resulten aplicables.

### 4.6 Pilotos

La aplicación soporta dos caminos que no deben ofrecerse como automáticos a todos:

- una prueba técnica de 15 días para altas directas;
- un piloto guiado pagado de 45 días con preparación, lanzamiento, evaluación y decisión.

La propuesta u orden debe indicar si existe prueba o piloto. La política legal no concede un trial universal.

### 4.7 Referidos

La regla comercial acordada para la persona que refiere conjuntos es:

- una comisión equivalente a una mensualidad neta por cada año completo contratado;
- un contrato de varios años no anticipa todas las comisiones;
- cada comisión futura se causa en el aniversario correspondiente si el contrato sigue vigente y ese periodo fue pagado;
- para pago mensual, la primera comisión se paga después del segundo pago aprobado;
- para pago anual, se paga cuando el ingreso esté firme y hayan pasado 30 días sin devolución;
- una renovación solo genera comisión si hubo participación material y documentada de la persona referidora;
- una renovación automática sin intervención no genera comisión nueva;
- la persona referidora no representa a PQRS Services ni puede prometer precios, descuentos o condiciones;
- debe revelar conflictos si llega a participar en la decisión de una copropiedad referida.

**Estado de automatización:** la base actual guarda una comisión y su estado por perfil comercial. El calendario de comisiones multianuales y por renovación todavía requiere control manual; no debe afirmarse que está automatizado.

## 5. Roles y límites

| Rol | Alcance | Puede modificar | No puede |
| --- | --- | --- | --- |
| SUPER_ADMIN | Toda la plataforma | conjuntos, estado comercial, licencias, precios, pagos manuales, add-ons, soporte y configuración global | usar una membresía de tenant como sustituto de autorización |
| ADMIN | Su conjunto activo | PQRS, usuarios permitidos, invitaciones, configuración operativa, reservas y cartera si están contratadas | acceder a otro conjunto, crear SUPER_ADMIN, cambiar precios globales |
| CONSEJO | Su conjunto activo | su perfil y solicitudes de soporte permitidas | operar PQRS, usuarios, licencia, configuración, reservas o cartera |
| RESIDENTE | Su membresía y datos propios | sus PQRS editables, reservas propias, comprobantes y perfil | ver datos de otros residentes o módulos administrativos |

La interfaz oculta acciones no permitidas, pero la seguridad principal está en APIs y servicios. Los IDs enviados por el cliente no reemplazan el tenantId, membershipId ni el rol resueltos desde la sesión.

## 6. Acceso, invitaciones y membresías

No existe autorregistro público. /auth/registro informa que el acceso es por invitación.

Flujo:

1. SUPER_ADMIN crea el conjunto o confirma el hito comercial que habilita la invitación del ADMIN.
2. ADMIN invita por correo a otros ADMIN, CONSEJO o RESIDENTE de su conjunto.
3. También puede cargar un lote de invitaciones por archivo.
4. El servidor genera un token aleatorio y solo guarda su hash.
5. El correo incluye el nombre del conjunto y el enlace de aceptación.
6. El destinatario establece contraseña y acepta la versión legal vigente.
7. La invitación crea o asocia una membresía con tenant y rol ya definidos.
8. El token aceptado, cancelado o vencido no puede reutilizarse.

Un usuario puede pertenecer a varios conjuntos mediante TenantMembership. La selección activa se guarda en una cookie firmada y se verifica contra membresías activas. Cambios sensibles incrementan sessionVersion para invalidar sesiones anteriores.

## 7. Recorridos por rol

### 7.1 SUPER_ADMIN

#### Resumen

Presenta KPIs globales derivados del backend: conjuntos por estado, usuarios, PQRS, ingresos mensuales, pagos, renovaciones, alertas y actividad. No usa datos de muestra para las cifras operativas.

#### Conjuntos

Permite listar, buscar, filtrar, paginar, crear, abrir detalle, editar datos autorizados, suspender, reactivar, cancelar y exportar un conjunto. El detalle reúne suscripción, usuarios, PQRS, pagos, actividad, ficha comercial, piloto, implementación, referido y módulos contratados.

#### Licencias y pagos

Permite revisar cartera SaaS, pagos aprobados, pendientes y rechazados, vencimientos, mora y periodos. Incluye renovación manual, extensión de cortesía auditada y actualización de estados por mora. Una cortesía no se registra como ingreso.

#### Reglas de precio

Gestiona reglas mensuales y de piloto, topes y cobertura de rangos. El backend evita rangos activos superpuestos, precios inválidos y cambios que rompan la política.

#### Analítica

Calcula tendencias de ingresos, conjuntos, tiempos de cierre, PQRS, conversión de pilotos, riesgo y concentración de ingresos con datos persistidos.

#### Usuarios

Consulta usuarios globales por conjunto, rol y estado. Las acciones administrativas respetan membresías y no convierten un usuario de tenant en SUPER_ADMIN.

#### Auditoría

Consulta eventos persistidos con actor, tenant, acción, recurso, identificador, fecha y metadata acotada.

#### Soporte

Gestiona la cola global de tickets, responde y cierra solicitudes. ADMIN, CONSEJO y RESIDENTE solo ven el alcance permitido.

#### Configuración

Muestra configuración operativa, estado de integraciones, SLA y controles seguros. No expone secretos ni permite leer llaves privadas desde el navegador.

#### Mi cuenta

Gestiona perfil, avatar y contraseña de la cuenta global.

### 7.2 ADMIN

#### Inicio

Muestra métricas del conjunto seleccionado: PQRS nuevas, en gestión y cerradas, tiempos, usuarios, licencia, próxima renovación y actividad. Los accesos rápidos llevan a módulos reales.

#### PQRS

El ADMIN puede:

- listar, buscar y filtrar solicitudes de su conjunto;
- crear una solicitud administrativa;
- abrir el detalle con historial y evidencias;
- confirmar el primer contacto;
- clasificar categoría, prioridad y responsable;
- avanzar por el workflow SIMPLE o MAINTENANCE;
- agregar notas y evidencia;
- cerrar con resultado y soporte;
- corregir campos auditables mediante el flujo autorizado.

Cada transición se valida en backend. El historial registra actor, estado anterior, estado posterior, nota y fecha. Las notificaciones al residente se generan a partir de eventos reales.

#### Usuarios

Lista usuarios del conjunto, permite consultar detalle, editar campos autorizados, activar o desactivar membresías y asignar roles permitidos. ADMIN no puede crear SUPER_ADMIN ni administrar un usuario fuera de su tenant.

#### Reservas

Solo aparece con RESERVATIONS activo. ADMIN crea y configura zonas, horarios, capacidad, reglas y bloqueos; revisa solicitudes y aprueba o rechaza. La base evita solapamientos de reservas aprobadas.

#### Pagos

Este módulo se refiere a **cartera de residentes**, no a la licencia de PQRS Services. Solo aparece con RESIDENT_PAYMENTS activo. ADMIN puede crear cargos, registrar pagos manuales, revisar comprobantes, importar movimientos, cancelar cargos y revertir movimientos con trazabilidad.

#### Reportes

Consulta indicadores de PQRS por periodo, estado, categoría, prioridad, responsable y tiempos. Genera exportaciones reales en Excel y PDF con los filtros aplicados.

#### Licencias y pagos

Este módulo sí corresponde al servicio PQRS Services. Muestra estado, vigencia, unidades, tarifa, historial, piloto o plan comercial, próxima renovación y documento descargable. Permite:

- iniciar checkout mensual o anual en Wompi;
- consultar el resultado de pago;
- configurar o revocar el medio para cobro automático;
- elegir anualidad con el ahorro calculado;
- descargar resumen, resultado o comprobante operativo.

El PDF interno no es factura electrónica ni documento tributario.

#### Invitaciones

Crea invitaciones individuales o masivas, consulta estados, reenvía pendientes y cancela. El tenant y rol se fijan antes de enviar el correo.

#### Actividad

Presenta eventos reales y persistidos del conjunto, con enlaces cuando el recurso sigue disponible.

#### Configuración

Permite actualizar nombre permitido, dirección, ciudad, contacto y preferencias operativas. También configura categorías y su workflow. No permite alterar unidades, precio, reglas globales o secretos.

#### Mi cuenta

Permite editar datos globales permitidos, avatar y contraseña. Bloque y apartamento pertenecen a la membresía del conjunto, no al perfil global.

#### Ayuda

Crea tickets de soporte y consulta su estado o respuesta. La categoría de facturación está disponible para ADMIN.

### 7.3 CONSEJO

CONSEJO es un rol de supervisión y lectura:

- **PQRS:** consulta listado, filtros, detalle, responsable, fases, historial y evidencias.
- **Reservas:** consulta zonas y reservas cuando el módulo está contratado; no aprueba, rechaza ni configura.
- **Pagos:** consulta información agregada de cartera cuando el módulo está contratado; no registra ni revierte movimientos.
- **Reportes:** consulta indicadores y descarga Excel o PDF.
- **Actividad:** ve actividad de su conjunto.
- **Mi cuenta:** administra su perfil y contraseña.
- **Ayuda:** crea y consulta tickets técnicos permitidos.

La ausencia de botones de escritura coincide con controles de autorización en backend. CONSEJO no puede crear, editar, cerrar o reasignar PQRS; tampoco invita usuarios ni modifica la licencia.

### 7.4 RESIDENTE

#### Inicio o Centro de Estado

Muestra únicamente solicitudes propias: activas, en gestión, resueltas y última actualización. Desde aquí se abre una nueva solicitud.

#### Nueva solicitud

El residente selecciona categoría, ubicación, título o descripción y puede adjuntar evidencias válidas. Al guardar:

- se crea la PQRS dentro de su tenant y membresía;
- se asigna un identificador;
- se notifica a la administración;
- la nueva solicitud aparece sin recargar manualmente.

El residente puede editar mientras la administración no haya iniciado gestión, asignado responsable o radicado formalmente. La restricción se aplica en backend.

#### Detalle

Muestra estado, timeline, descripción, ubicación, evidencias, respuestas, fechas y resolución final. Una URL o ID de otra persona se rechaza.

#### Alertas

Lista notificaciones internas propias y permite marcarlas como leídas.

#### Reservas

Con RESERVATIONS activo, consulta disponibilidad, solicita una franja y cancela una reserva propia cuando las reglas lo permiten.

#### Pagos

Con RESIDENT_PAYMENTS activo, consulta cargos de su unidad, detalle, saldo y movimientos. Puede cargar comprobante y retirar uno propio todavía pendiente de revisión.

#### Perfil

Actualiza nombre, teléfono, avatar y datos permitidos. Un cambio de ubicación sensible se confirma y queda asociado a la membresía correspondiente.

#### Ayuda

Permite crear y consultar tickets técnicos propios.

## 8. Núcleo PQRS

### 8.1 Estados

- EN_ESPERA: solicitud recibida.
- EN_PROGRESO: administración confirmó recepción e inició gestión.
- TERMINADO: gestión cerrada.

La condición de vencimiento se calcula con el SLA; no reemplaza el estado persistido.

### 8.2 Workflows

- **SIMPLE:** primer contacto, gestión y cierre.
- **MAINTENANCE:** primer contacto y fases operativas de mantenimiento antes del cierre.

El conjunto configura categorías activas, orden y workflow. Cada PQRS conserva snapshots para que un cambio posterior de configuración no reescriba su historia.

### 8.3 Evidencias

Los archivos viven en un bucket privado de Supabase Storage. El servidor valida propietario, tenant, rol, tamaño, extensión y firma real del archivo antes de entregar o eliminar. No se publican URLs permanentes.

### 8.4 Reportes

Los reportes usan datos del tenant activo. Las exportaciones neutralizan contenido que podría convertirse en fórmula de Excel y registran auditoría.

## 9. Reservas

Reservas es un módulo opcional. Incluye:

- zonas comunes;
- horarios, duración, capacidad y reglas;
- consulta de disponibilidad;
- bloqueos administrativos;
- solicitud del residente;
- aprobación o rechazo por ADMIN;
- cancelación con permisos;
- historial y notificaciones.

API, servicio y layout verifican el entitlement. Ocultar el menú no es el único control.

## 10. Pagos de residentes

Este módulo opcional es independiente de la facturación SaaS. Modela:

- unidades residenciales;
- cargos y vencimientos;
- pagos y reversos;
- comprobantes privados;
- revisión o rechazo de soportes;
- importaciones conciliables;
- resumen de cartera.

ADMIN opera; CONSEJO supervisa agregados; RESIDENTE solo ve su unidad y sus comprobantes.

## 11. Licencia y facturación SaaS

### 11.1 Estados

Tenant y Subscription usan estados coordinados:

- TRIAL;
- PENDING_PAYMENT;
- ACTIVE;
- GRACE_PERIOD;
- SUSPENDED;
- CANCELLED.

TRIAL, ACTIVE y GRACE_PERIOD permiten operar mientras la vigencia sea válida. PENDING_PAYMENT, SUSPENDED y CANCELLED bloquean módulos del tenant, pero el ADMIN conserva el acceso necesario para regularizar un pago cuando corresponde.

### 11.2 Wompi

El flujo principal es:

1. ADMIN solicita checkout.
2. El servidor recalcula monto y modalidad.
3. Se crea Payment PENDING y una referencia única.
4. Wompi procesa el pago.
5. El webhook valida firma, referencia, monto, moneda y estado.
6. Un pago APPROVED aplica cobertura de forma transaccional e idempotente.
7. REJECTED queda visible como rechazado; PENDING no se convierte en rechazo definitivo.
8. El evento se audita y encola notificación/correo.

El cobro automático usa una fuente tokenizada de Wompi. El cron intenta renovaciones elegibles y no duplica pagos ante concurrencia o reintentos.

### 11.3 Mercado Pago

La integración histórica permanece en el código para compatibilidad, pero Wompi es el proveedor principal del negocio actual. No se debe iniciar una nueva venta en Mercado Pago salvo decisión operativa expresa.

### 11.4 Cron y mora

El cron de reglas vencidas aplica precedencia de estados, CAS y transacciones para evitar que dos ejecuciones dupliquen efectos. El cron de Wompi procesa cobros automáticos elegibles. Ambos requieren CRON_SECRET y observabilidad en Vercel.

### 11.5 Outbox

Los eventos económicos generan filas de outbox dentro de la misma transacción del cambio financiero. Los intentos de correo y notificación son idempotentes; un fallo de Resend no revierte el pago.

## 12. Arquitectura

| Capa | Tecnología |
| --- | --- |
| Frontend y servidor | Next.js 14 App Router |
| Lenguaje | TypeScript |
| Autenticación | NextAuth/Auth.js con credenciales y JWT |
| Dominio y API | Route Handlers y servicios por dominio |
| ORM | Prisma 5 |
| Base de datos | PostgreSQL en Supabase |
| Archivos | Supabase Storage privado |
| Correo | Resend |
| Pagos | Wompi; Mercado Pago legado |
| Despliegue | Vercel |
| Reportes | ExcelJS, jsPDF y jspdf-autotable |

Los dominios principales están en src/domains: account, billing, commercial, notifications, organizations, payments, platform, pqrs, reservations y support.

## 13. Seguridad y aislamiento

- autorización centralizada por sesión, rol, membresía y tenant;
- rutas protegidas por middleware y verificación adicional en servidor;
- selección multi-conjunto firmada;
- contraseñas con bcrypt;
- tokens de invitación y recuperación almacenados como hash;
- revocación de sesión mediante sessionVersion;
- consultas y mutaciones acotadas al tenant;
- reglas de propietario para PQRS, evidencias, reservas y comprobantes;
- service role y llaves privadas solo en servidor;
- webhooks con validación de firma;
- idempotencia y transacciones para efectos económicos;
- auditoría persistente con metadata saneada;
- RLS habilitado como defensa adicional en tablas públicas;
- respuestas de error sin stack, SQL, host o credenciales.

SUPER_ADMIN es global y no debe recibir un tenantId implícito desde el cliente. ADMIN, CONSEJO y RESIDENTE requieren una membresía activa.

## 14. Datos principales

- Tenant y TenantMembership: conjunto y pertenencia multi-conjunto.
- User, Account, Session y VerificationToken: identidad y sesión.
- Pqrs, PqrsFoto, HistorialPqrs, PqrsCategory y PqrsCorrection: solicitudes y trazabilidad.
- Invitation, Notification, EmailLog y BillingNotificationOutbox: acceso y comunicaciones.
- Subscription, Payment, WompiPaymentMethod y WebhookEvent: licencia y pagos SaaS.
- TenantCommercialProfile, CommercialOperation y TenantFeatureEntitlement: venta, piloto y alcance.
- CommonArea, Reservation y CommonAreaBlock: reservas.
- ResidentUnit, ResidentCharge, ResidentPayment, PaymentReceipt y PaymentImportBatch: cartera.
- SupportTicket: soporte.
- AuditLog y PlatformSetting: control global.

## 15. Documentos legales y contractuales

### 15.1 Públicos en la aplicación

- /legal/terminos
- /legal/privacidad
- /legal/cookies
- /legal/pagos

La versión vigente es 3.0. Los términos separan aceptación de uso y representación contractual; pagos distingue plazo y periodicidad; privacidad define al conjunto como Responsable y a PQRS Services como Encargado para datos operativos.

### 15.2 Borradores internos

- docs/legal/contratos/Contrato_marco_servicios_PQRS_Services_BORRADOR.docx
- docs/legal/contratos/Acuerdo_referidos_gestion_comercial_BORRADOR.docx

Los dos archivos son borradores. No deben firmarse ni publicarse sin revisión de abogado colombiano y contador. Deben completarse con identidad del prestador, identificación del conjunto, representante, alcance, precio, plazo, forma de pago, impuestos y anexos.

### 15.3 Comprobantes

El PDF de Licencias y pagos es un comprobante operativo. No es factura electrónica ni documento tributario. La obligación tributaria y el mecanismo de facturación deben validarse con contador según RUT, responsabilidades y volumen real.

## 16. Operación antes de activar un conjunto

1. Verificar facultades del firmante.
2. Firmar orden o contrato y anexos aplicables.
3. Registrar plazo, precio, unidades, módulos y modalidad de pago.
4. Confirmar que los textos legales tienen identidad y fecha vigentes.
5. Crear el conjunto sin duplicarlo.
6. Configurar categorías y workflow.
7. Activar únicamente los entitlements vendidos.
8. Invitar al ADMIN principal.
9. Completar onboarding.
10. Probar correo, Storage y Wompi en el entorno correcto.
11. Confirmar webhook y cron.
12. Entregar canal de soporte y procedimiento de privacidad.

## 17. Variables y secretos

Las variables están documentadas en .env.example. Nunca deben aparecer en frontend, documentación pública, logs o commits:

- DATABASE_URL y DIRECT_URL;
- NEXTAUTH_SECRET;
- SUPABASE_SERVICE_ROLE_KEY;
- RESEND_API_KEY;
- llaves privadas, secretos de integridad y eventos de Wompi;
- tokens y secretos de Mercado Pago;
- CRON_SECRET.

Las variables NEXT_PUBLIC_LEGAL_* sí son públicas por diseño y deben contener exclusivamente información legal publicable.

## 18. Pruebas y despliegue

Comandos de referencia:

- npm test: suite serializada con base de prueba protegida;
- npx tsc --noEmit: typecheck;
- npm run lint: lint;
- npm run build: Prisma generate y build Next.js;
- npm run db:migrate:deploy: migraciones aditivas;
- npm run release:check: validación Prisma y build.

La base real contiene información que no debe resetearse. En producción se usa prisma migrate deploy; nunca se acepta un reset ni se usa db push sobre Supabase productivo.

## 19. Límites y trabajo manual vigente

La aplicación está funcional, pero estas capacidades no deben presentarse como automáticas:

1. No existe un modelo Contract u OrderService que persista todas las cláusulas y versiones firmadas.
2. La duración arbitraria de varios años vive en el contrato; contractedPeriodEndsAt representa el periodo comercial/cobertura registrado, no sustituye el documento firmado.
3. Las comisiones de referidos multianuales y por renovación se controlan manualmente.
4. La firma electrónica de contratos no se ejecuta dentro de la aplicación.
5. El comprobante PDF no sustituye facturación tributaria.
6. Los textos legales versión 3.0 requieren revisión profesional y un plan de comunicación o nueva aceptación para usuarios existentes.
7. Las condiciones reales de producción dependen de dominio de Resend, llaves Wompi, webhooks, cron, respaldo y monitoreo correctamente configurados.

## 20. Regla de mantenimiento

Este archivo se actualiza cuando cambie cualquiera de estos puntos:

- rol o permiso;
- pestaña o flujo;
- modelo comercial;
- proveedor de pago;
- estado o regla de licencia;
- módulo contratado;
- documento legal;
- arquitectura o despliegue;
- riesgo conocido que afecte una promesa comercial.

Los documentos de docs/programa-mejora son evidencia histórica. Si contradicen este contexto, prevalecen el código actual, las migraciones aplicadas y este documento actualizado.
