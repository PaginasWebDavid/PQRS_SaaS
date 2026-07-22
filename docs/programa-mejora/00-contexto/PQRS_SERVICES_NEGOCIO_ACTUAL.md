# PQRS Services — Documentación del negocio

> Este documento describe cómo funciona el negocio HOY, tal como está construido en el código. No es una aspiración ni un plan — es un espejo del sistema real, para que cualquier decisión de producto o de negocio parta de hechos y no de suposiciones. Si algo cambia en el código, este documento debe actualizarse.

---

## 1. Qué es el negocio y quién lo usa

**PQRS Services** es una plataforma SaaS multi-conjunto (multi-tenant) para que conjuntos residenciales en Colombia gestionen PQRS (Peticiones, Quejas, Reclamos y Sugerencias) de sus residentes. Cada conjunto residencial es un **tenant** independiente: sus datos, usuarios y PQRS nunca se mezclan con los de otro conjunto.

Hay cuatro roles:

| Rol | Quién es | Para qué existe |
|---|---|---|
| **SUPER_ADMIN** | El dueño del negocio (una sola persona, sin equipo) | Opera la plataforma completa: crea conjuntos, cobra, fija precios, da soporte, ve analítica de todo el negocio |
| **ADMIN** | El administrador del conjunto residencial (cliente que paga) | Gestiona las PQRS de su conjunto, invita usuarios, paga la licencia |
| **CONSEJO** | El consejo de administración del conjunto (cliente, sin costo adicional) | Supervisa las PQRS y ve reportes — rol de solo lectura, no gestiona nada |
| **RESIDENTE** | Los residentes del conjunto (usuarios finales) | Radican PQRS y hacen seguimiento a las propias |

**No existe autorregistro.** Nadie puede crear una cuenta por su cuenta — todo acceso nace de una invitación (el Super Admin invita al primer ADMIN al crear el conjunto; el ADMIN invita a CONSEJO/RESIDENTE/otros ADMIN). La página `auth/registro` es informativa y solo explica esta regla.

---

## 2. Ciclo de vida de un conjunto (tenant)

Un conjunto pasa por estos estados exactos (`TenantStatus` / `SubscriptionStatus`, siempre sincronizados entre sí):

```
TRIAL → ACTIVE → GRACE_PERIOD → SUSPENDED → CANCELLED
                     ↑              ↓
                     └── (pago) ────┘
```

También existe `PENDING_PAYMENT`, heredado de una versión anterior del producto (ver más abajo, sección 10).

### 2.1 Nacimiento del conjunto — TRIAL

El Super Admin crea el conjunto desde su panel (Conjuntos → "+ Crear conjunto"), ingresando nombre, ciudad, número de unidades y los datos del primer ADMIN (nombre + correo). Al crearse:

- El tenant y su suscripción nacen en estado **`TRIAL`**, no en `PENDING_PAYMENT`.
- Se calcula el precio mensual según el número de unidades (ver sección 3).
- `trialEndsAt` y `currentPeriodEnd` se fijan en **hoy + 15 días** — el conjunto tiene acceso completo a la plataforma durante ese período **sin pagar nada**.
- Se envía automáticamente una invitación por correo al ADMIN para que active su cuenta.
- No se crea ningún pago; el trial es gratis de verdad.

Este comportamiento (trial real de 15 días) se implementó en esta sesión de trabajo — antes, los conjuntos nacían bloqueados (`PENDING_PAYMENT`) y debían pagar de inmediato para poder usar la plataforma.

### 2.2 De TRIAL a pago — el "Pagar ahora"

Desde **Licencias y pagos** (panel de ADMIN), el botón "Pagar ahora" crea una suscripción recurrente en Mercado Pago (Preapproval — cobro automático mensual) y redirige al ADMIN a la pasarela de pago.

Reglas duras de Mercado Pago que **no son configurables por el negocio** (son requisitos de la pasarela, no bugs):
- Si la cuenta de Mercado Pago del negocio es real (token de producción `APP_USR-...`), el correo del pagador (el ADMIN) **debe corresponder a una cuenta ya registrada en Mercado Pago**. Mercado Pago rechaza el cobro recurrente si el pagador no existe como usuario suyo — esto es una limitación externa de su producto de "Suscripciones", no un error de la plataforma.
- El precio que se cobra es el vigente para el número de unidades del conjunto en ese momento.

Cuando Mercado Pago confirma un pago **aprobado** (vía webhook), recién ahí:
- La suscripción pasa a **`ACTIVE`**.
- El período vigente se extiende 30 días desde el mayor entre "hoy" y el fin del período anterior (así, pagar durante el trial no le "quita" días de trial ya corridos).
- El tenant nunca se marca `ACTIVE` solo porque Mercado Pago "autorizó" el cobro recurrente (`preapproval.status = authorized`) — eso solo significa que el pagador aceptó el cobro automático, no que ya se le cobró. Se exige al menos un `Payment` con `status: APPROVED` antes de activar.

### 2.3 Vencimiento — de ACTIVE/TRIAL a GRACE_PERIOD

Un proceso automático (`applyOverdueLicenseRules`, corrido por un cron) revisa todas las suscripciones y:

1. Si una suscripción `ACTIVE` o `TRIAL` tiene `currentPeriodEnd` ya vencido (pasó la fecha), pasa a **`GRACE_PERIOD`** con `graceEndsAt = hoy + días de gracia`.
2. Si una suscripción ya en `GRACE_PERIOD` tiene `graceEndsAt` vencido, pasa a **`SUSPENDED`**.

**Días de gracia por defecto: 5.** Este valor es **configurable por el Super Admin** desde Licencias y pagos → Licencia → "Período de gracia global" — cambia el comportamiento de este cron para *todos* los conjuntos a la vez.

> ⚠️ Ver hallazgo en el documento de consultoría: el webhook de Mercado Pago usa un valor de gracia **hardcodeado en 5 días**, separado del que configura el Super Admin — pueden divergir si el Super Admin cambia el valor global.

### 2.4 Reactivación

El Super Admin puede reactivar manualmente un conjunto suspendido, pero **solo si existe un pago `APPROVED` cuyo período todavía cubre la fecha de hoy** (`periodEnd >= ahora`). Un conjunto que pagó una vez, se atrasó y fue suspendido **no puede reactivarse gratis** solo por tener un pago viejo — se exige un pago vigente.

El ADMIN también puede "renovar" pagando de nuevo desde Licencias y pagos, lo cual dispara el mismo flujo de Mercado Pago.

### 2.5 Cancelación

El Super Admin puede cancelar un conjunto desde el panel de detalle del tenant (acción "Cancelar conjunto", con doble confirmación por ser irreversible desde la UI). Al cancelar: el tenant queda `CANCELLED`, se registra `cancelledAt`.

La política pública de cancelación (`legal/pagos`) dice que el ADMIN debe solicitarla "por el canal contractual" indicando conjunto, cuenta y fecha deseada — **hoy no existe un flujo de autoservicio para que el ADMIN cancele su propio conjunto**; solo el Super Admin puede hacerlo.

### 2.6 Qué bloquea el acceso y qué no

| Estado | ¿Bloquea el acceso? | Mensaje que ve el usuario |
|---|---|---|
| `TRIAL` | No | — |
| `ACTIVE` | No | — |
| `GRACE_PERIOD` | **No** — el conjunto sigue operando con normalidad mientras está en gracia | — |
| `PENDING_PAYMENT` | Sí | "Debes completar el pago de tu primera licencia para poder usar la plataforma." |
| `SUSPENDED` | Sí | "La licencia de esta copropiedad se encuentra suspendida. Contacta al equipo administrador para reactivar el servicio." |
| `CANCELLED` | Sí | "La licencia de esta copropiedad fue cancelada. Contacta al equipo administrador para reactivar el servicio." |
| Usuario desactivado (`isActive:false`) | Sí, para ese usuario puntual | "Tu cuenta se encuentra desactivada. Contacta al administrador de tu conjunto." |

El SUPER_ADMIN nunca queda bloqueado por estado de tenant (no pertenece a ningún tenant).

---

## 3. Precio y reglas de facturación

### 3.1 Cómo se calcula el precio de un conjunto

El precio mensual depende **únicamente del número de unidades** del conjunto, mediante **rangos de precio** (`PricingRule`) que administra el Super Admin desde "Reglas de precio":

- Cada regla define: unidades **desde**, unidades **hasta** (o "sin límite"), precio mensual en COP, y si está activa.
- Al calcular el precio de un conjunto, se busca la primera regla activa cuyo rango cubra el número de unidades.
- Si ninguna regla cubre esas unidades, la operación falla ("No hay regla de precio activa para N unidades") — **hay que mantener cobertura completa de rangos** (p. ej. sin un "hueco" entre 50 y 60 unidades) para no romper la creación de conjuntos o renovaciones.

**Reglas que se validan al crear/editar un rango de precio:**
- El precio debe estar dentro de los **topes globales** (por defecto COP 50.000 a COP 1.000.000 mensuales, configurables por el Super Admin en "Topes de precio").
- Los rangos activos **no pueden solaparse** entre sí.
- El precio debe ser **monotónico**: un conjunto con más unidades nunca puede pagar menos que uno con menos unidades (ni al revés). El sistema lo valida automáticamente al guardar un rango.
- Cambiar los topes globales de precio (mínimo/máximo) se rechaza si dejaría a alguna regla activa **fuera** de los nuevos topes — hay que ajustar o desactivar esa regla primero.

### 3.2 Cambios de unidades o de tarifa en un conjunto existente

Si el Super Admin edita un conjunto y cambia el número de unidades (lo que puede cambiar su precio), el cambio **no se cobra de inmediato**: queda "programado" (`pendingUnitsSnapshot`/`pendingPriceCents`) y **se aplica automáticamente en la siguiente renovación** (cuando `currentPeriodEnd` se cumpla). Si el conjunto tiene una suscripción activa en Mercado Pago, el monto del cobro recurrente ahí también se actualiza para que coincida.

### 3.3 Facturación recurrente (Mercado Pago)

- Cobro **mensual** automático (frecuencia: 1 mes) vía Mercado Pago Preapproval (suscripciones).
- Cada pago recibido por webhook es **idempotente**: si Mercado Pago reintenta la notificación del mismo pago, no se duplica (se identifica por `mercadoPagoPaymentId`, único en la base de datos).
- Un pago **aprobado** extiende el período 30 días y activa el conjunto; un pago **rechazado o pendiente** manda la suscripción a `GRACE_PERIOD` con sus 5 días de gracia (valor hardcodeado en esta ruta, ver 2.3).
- El ADMIN puede **desactivar la renovación automática** desde Licencias y pagos (cancela el cobro recurrente en Mercado Pago, pero no cambia el estado actual del conjunto — simplemente no se le volverá a cobrar automáticamente).

### 3.4 Qué ve y puede hacer el ADMIN (Licencias y pagos)

- Estado de la licencia, plan contratado, próxima fecha de renovación.
- Historial de pagos (filtrable: todas / pagadas / pendientes).
- Botón "Pagar ahora" (o "Renovar/actualizar el pago" si ya está vencido).
- Detalle de la próxima factura, incluida cualquier tarifa nueva ya programada para la siguiente renovación.
- Activar/desactivar la renovación automática.

### 3.5 Qué ve y puede hacer el Super Admin (financiero y precios)

- **Resumen financiero:** ingresos del mes (MRR), pagos aprobados, pagos pendientes, próximas renovaciones, conjuntos en mora, conjuntos suspendidos.
- **Analítica de negocio:** crecimiento de MRR, churn del mes, ingreso promedio por conjunto (ARPU), % de conversión de trial a pago, tiempo promedio de cierre de PQRS, distribución de PQRS por tipo, conjuntos en riesgo (en mora), concentración de ingresos (top conjuntos por tarifa).
- **Reglas de precio:** crear/editar/activar/desactivar rangos, y ajustar los topes globales.
- **Acciones sobre conjuntos:** suspender, reactivar, cancelar, y correr manualmente "Actualizar estados por mora" (el mismo proceso que corre el cron).
- **Configuración operativa:** período de gracia global, SLA de cierre de PQRS en días, estado de integraciones (Resend, Supabase Storage, Mercado Pago), y feature flags (soporte habilitado, envío automático de correos).

---

## 4. Máquina de estados de una PQRS

Una PQRS tiene solo tres estados posibles: **`EN_ESPERA`** (recién creada) → **`EN_PROGRESO`** (tomada por administración) → **`TERMINADO`** (cerrada). No existe un estado de "vencida" guardado en base de datos — es una condición calculada al vuelo (ver 4.5).

### 4.1 Creación

- Puede crearla un **ADMIN** (en nombre de cualquier residente, escribiendo nombre/bloque/apto a mano) o un **RESIDENTE** (para sí mismo). CONSEJO y SUPER_ADMIN no pueden crear PQRS.
- Categoría (asunto) es **obligatoria si la crea un residente**, opcional si la crea el ADMIN. Las 9 categorías válidas: Área común, Área privada, Contabilidad, Convivencia, y 5 subtipos de Humedad (Cubierta, Depósito, Ventanas, Fachada, Garaje).
- La descripción tiene un tope de **300 palabras**.
- El residente puede adjuntar hasta **3 fotos** (JPG/PNG/WEBP, máx. 1MB cada una) al crear.
- Al crearse, se notifica en la app a todos los ADMIN del conjunto, se envía correo de alerta a los ADMIN que tengan activado "avisarme por correo ante una nueva PQRS", y si la creó un residente, recibe un correo de confirmación.

### 4.2 Primer contacto (EN_ESPERA → EN_PROGRESO)

Acción de "Confirmar recepción" por parte de administración (ADMIN). Requiere:
- Categoría (si no se fijó al crear).
- Prioridad (Alta/Media/Baja).
- Una nota de primer contacto (obligatoria).

Al confirmarse: se genera el **número de radicación** (`AÑO-NNNN`, por ejemplo `2026-0042`), se registra quién la está gestionando, y se calcula cuántos días tardó el primer contacto. El residente recibe una notificación y un correo con su número de radicación.

**Este es el punto de no retorno para el residente**: a partir de aquí (o desde que se le asigna gestor o se le pone número de radicación) la PQRS se considera "tomada por administración" y el residente ya no puede editarla (ver 4.6).

### 4.3 Las 5 fases de gestión (mientras está EN_PROGRESO)

Una PQRS tomada avanza por hasta 5 fases con nombres y **tiempos objetivo en días hábiles**:

| Fase | Nombre | Días hábiles objetivo |
|---|---|---|
| 1 | Inspección de campo | 2 |
| 2 | Adquisición de insumos | 2 |
| 3 | Firma de contrato con proveedor | 15 |
| 4 | Ejecución | 5 |
| 5 | Terminado | 0 |

Desde la fase 1, el caso se bifurca en dos rutas exclusivas y **excluyentes entre sí**:
- **Ruta INSUMOS**: fase 1 → 2 → 4.
- **Ruta PROVEEDOR**: fase 1 → 3 → 4.

Una vez elegida una ruta (`faseTipo`), **no se puede cambiar** — es una decisión de una sola vez.

**Cada fase exige una nota antes de poder avanzar a la siguiente.** Un semáforo de color (verde/ámbar/rojo) indica si el caso va a tiempo, cerca del límite, o ya se pasó del tiempo objetivo de la fase.

### 4.4 Cierre (EN_PROGRESO → TERMINADO)

Requiere:
- No se puede cerrar sin haber pasado primero por "primer contacto" (no se puede saltar de EN_ESPERA directo a cerrada).
- "Acción tomada" es siempre obligatoria.
- Si el caso **no** completó las 5 fases, también es obligatorio explicar "¿Qué se hizo para cerrar?".
- **Evidencia de cierre obligatoria**: texto y/o un archivo (imagen o PDF, máx. 2MB).

Al cerrar: se notifica al residente y se le envía un correo con el número de radicación, la acción tomada y la evidencia adjunta (si es un archivo permitido).

### 4.5 Regla de "vencida" (SLA)

Una PQRS se considera vencida si:
- **Cerrada:** tardó **más** días de los que dicta el SLA configurado (el límite exacto cuenta como a tiempo, no como vencido).
- **Abierta:** ya lleva **más** días abiertos que el SLA, contados desde que se recibió.

El SLA (en días) lo configura el Super Admin (Configuración → "SLA de cierre de PQRS"). Esta regla es una sola función compartida en todo el sistema — reportes, analítica y alertas usan siempre el mismo cálculo, para que "vencida" signifique lo mismo en todas las pantallas.

### 4.6 Reglas de una sola vez / inmutabilidad

- **Edición del residente**: puede editar la descripción de su propia PQRS **una sola vez en la vida**, y solo mientras no haya sido tomada por administración. Una vez tomada, o una vez usada esa única edición, queda bloqueada.
- **Ruta de fase (`faseTipo`)**: una vez elegida INSUMOS o PROVEEDOR, no se puede cambiar.
- **Número de radicación y fecha de primer contacto**: se fijan una sola vez, al confirmar recepción.
- No existe forma de **borrar** una PQRS — no hay endpoint de eliminación.

### 4.7 Evidencia y archivos — dónde viven

Las fotos y archivos de evidencia se guardan en almacenamiento externo (Supabase Storage), nunca en la base de datos como texto/base64. **Ningún rol** (ni ADMIN ni CONSEJO) recibe jamás la URL directa del archivo desde la API — todo acceso pasa por rutas propias (`/fotos`, `/evidencia`) que verifican que quien pide el archivo pertenece al mismo conjunto y tiene permiso, antes de servirlo.

---

## 5. Matriz de permisos por rol

| Acción | SUPER_ADMIN | ADMIN | CONSEJO | RESIDENTE |
|---|---|---|---|---|
| Crear una PQRS | ❌ | ✅ (para cualquier residente) | ❌ | ✅ (solo para sí mismo) |
| Ver PQRS | ❌ (no opera PQRS de conjuntos) | ✅ Todas las del conjunto | ✅ Todas las del conjunto (solo lectura) | ✅ Solo las propias |
| Gestionar fases / cerrar PQRS | ❌ | ✅ | ❌ | ❌ (solo puede editar su propia descripción una vez) |
| Ver actividad/auditoría | — | ✅ Todas las categorías (PQRS, Usuarios, Licencia) | ✅ Solo categoría PQRS | ❌ |
| Invitar usuarios | ❌ (invita solo al primer ADMIN al crear el conjunto) | ✅ (ADMIN, CONSEJO o RESIDENTE) | ❌ | ❌ |
| Gestionar usuarios (rol, activar/desactivar) | ❌ | ✅ | ❌ | ❌ |
| Ver/editar reglas de precio | ✅ | ❌ | ❌ | ❌ |
| Suspender/reactivar/cancelar conjuntos | ✅ | ❌ | ❌ | ❌ |
| Crear tickets de soporte | ❌ | ✅ | ✅ | ✅ |
| Responder/cerrar tickets de soporte | ✅ (único rol que puede) | ❌ | ❌ | ❌ |
| Ver reportes/exportar Excel/PDF | — | ✅ | ✅ | ❌ |

**Nota importante sobre CONSEJO**: aunque técnicamente ve las mismas PQRS que el ADMIN (todo el conjunto, no solo las propias), el rol es **puramente de supervisión** — no puede crear, tomar, avanzar fases ni cerrar ninguna PQRS. La interfaz lo refuerza explícitamente ("Vista de solo lectura — la gestión de esta solicitud la realiza la administración").

---

## 6. Invitaciones y onboarding

### 6.1 Invitaciones

- Solo el **ADMIN** puede invitar, y solo dentro de su propio conjunto.
- Puede invitar a otro **ADMIN**, a **CONSEJO** o a **RESIDENTE**. Nunca puede invitar a un SUPER_ADMIN.
- El token de invitación **expira en 72 horas** y es de **un solo uso** (garantizado con una transacción atómica: si dos personas intentan usar el mismo enlace a la vez, solo una lo logra).
- **Reenviar una invitación rota el token anterior** — genera uno nuevo y reinicia las 72 horas. El enlace viejo deja de servir.
- Si el correo invitado ya pertenece a un usuario **activo** (de cualquier conjunto, no solo el propio), el sistema rechaza la invitación con un mensaje genérico ("Este correo ya pertenece a un usuario activo") — **deliberadamente no dice a qué conjunto pertenece**, para no filtrar información entre conjuntos distintos a un ADMIN curioso.
- Se puede invitar en lote (varios correos a la vez, mismo rol para todos), con un tope de 500 filas por archivo Excel y 2MB de tamaño de archivo.

### 6.2 Aceptar una invitación

Quien recibe el enlace crea su cuenta ahí mismo: nombre completo, contraseña (mínimo 8 caracteres, con al menos una letra y un número), y si es RESIDENTE, también bloque y apartamento. Debe aceptar explícitamente los términos y la política de privacidad (checkbox obligatorio) antes de poder crear la cuenta.

### 6.3 Onboarding (primeros pasos después de aceptar)

**ADMIN** (4 pasos): bienvenida → confirmar nombre y ciudad del conjunto (las unidades no son editables por el ADMIN, solo por el Super Admin) → invitar opcionalmente al primer usuario adicional (se puede omitir) → pantalla final "todo listo" que lleva al dashboard.

**RESIDENTE** (3 pasos): bienvenida → confirmar nombre completo, teléfono, bloque y apartamento (obligatorios para continuar) → tips de uso ("cómo crear una solicitud") → lleva al inicio de la app.

Ambos onboardings solo se muestran una vez; si ya se completaron, la app redirige directo al panel correspondiente.

---

## 7. Página por página

### 7.1 SUPER_ADMIN (el fundador)

Un único panel con navegación por secciones:

- **Resumen**: KPIs de la plataforma completa (conjuntos totales/activos/en prueba, usuarios, PQRS abiertas/cerradas), alertas de conjuntos en mora o con trial por vencer, conjuntos y actividad reciente, resumen ejecutivo (crecimiento MRR, churn, tiempo promedio de cierre).
- **Conjuntos**: tabla de todos los conjuntos con búsqueda/filtro, ver/editar/suspender-reactivar por fila, botón para crear un conjunto nuevo, y botón para correr manualmente el proceso de mora.
- **Licencias y pagos**: como se describió en 3.5 (licencia y pagos, con el ajuste global de días de gracia).
- **Reglas de precio**: como se describió en 3.1.
- **Analítica**: métricas de negocio detalladas (ver 3.5).
- **Usuarios**: selector de conjunto → lista de sus usuarios (solo lectura, no gestiona nada aquí — eso lo hace cada ADMIN en su propio conjunto).
- **Auditoría**: registro de toda la plataforma, filtrable por categoría (Conjuntos, Facturación, Administración, Usuarios, PQRS, Notificaciones, Soporte).
- **Soporte**: todos los tickets de todos los conjuntos, con posibilidad de responder y/o cerrar cada uno — el Super Admin es el único que atiende soporte.
- **Configuración**: nombre de marca, estado de integraciones (Resend/Supabase/Mercado Pago), SLA de cierre, y feature flags.
- **Mi cuenta**: datos personales y cambio de contraseña.

### 7.2 ADMIN (cliente que administra el conjunto)

- **Dashboard**: saludo, métricas rápidas del conjunto, atajos.
- **PQRS**: lista con filtros por estado, buscador, y panel de detalle con toda la gestión descrita en la sección 4 (confirmar recepción, avanzar fases, cerrar).
- **Usuarios**: gestión de usuarios del conjunto (cambiar rol, activar/desactivar) — con la protección de que **siempre debe quedar al menos un ADMIN activo** (ver 10.3).
- **Invitaciones**: crear, reenviar, cancelar invitaciones.
- **Reportes**: tablero con KPIs, gráficos de tendencia, y exportación a Excel/PDF.
- **Licencias y pagos**: como en 3.4.
- **Actividad**: bitácora completa del conjunto (PQRS, Usuarios, Licencia).
- **Configuración**: datos del conjunto (nombre, ciudad, dirección) — no puede cambiar el número de unidades, eso lo controla el Super Admin.
- **Mi cuenta**: perfil, seguridad, y preferencia de notificación por correo ante nuevas PQRS.
- **Ayuda**: FAQ + formulario de soporte (categorías: Técnico, Facturación, Mi cuenta, Otro) + historial de sus propias solicitudes.

### 7.3 CONSEJO (supervisión, sin costo adicional)

Mismas pantallas que ADMIN en PQRS/Reportes/Actividad/Cuenta/Ayuda, pero **todo en modo solo lectura** y sin acceso a Usuarios, Invitaciones ni Licencias. La actividad solo muestra la categoría PQRS. El formulario de ayuda no ofrece la categoría "Facturación" (no le compete).

### 7.4 RESIDENTE (usuario final)

App simplificada, navegación inferior de 4 secciones:
- **Inicio**: crear una nueva solicitud, ver y filtrar las propias (Todas/Recibidas/En gestión/Resueltas), con seguimiento visual de 3 pasos (Radicada → Primer contacto → Resuelta) y fecha estimada de resolución (calculada con el SLA configurado).
- **Alertas**: notificaciones propias.
- **Perfil**: datos personales; **bloque y apartamento se pueden corregir una sola vez** (con confirmación explícita, ya que después queda bloqueado).
- **Ayuda**: formulario de soporte (siempre categoría "Otro") + historial propio.

---

## 8. Notificaciones, soporte y auditoría

### 8.1 Notificaciones (en la app)

Tipos que existen hoy: creación/actualización/cierre de PQRS, invitación recibida/aceptada, pago aprobado, licencia por vencer, licencia suspendida, y respuesta a un ticket de soporte.

En la práctica, las que sí se disparan activamente son las de **PQRS** (creación, avance de fase, cierre) y las de **invitaciones** (creada, aceptada). Ver en el documento de consultoría el hallazgo sobre las notificaciones de licencia, que están declaradas pero no se encontró que se disparen en ningún flujo real.

### 8.2 Soporte (tickets)

- Cualquier usuario que no sea SUPER_ADMIN puede crear un ticket (si la función está habilitada por feature flag).
- Categorías: Técnico, Facturación (solo visible para ADMIN), Mi cuenta, Otro.
- Estados: Abierta → Respondida / Cerrada.
- **Solo el Super Admin responde y cierra tickets** — coherente con ser una operación de una sola persona; no hay "agentes de soporte" ni cola de asignación.
- Al responder, se notifica y se envía correo a quien creó el ticket.

### 8.3 Auditoría

Cada acción relevante (creación de PQRS, cambios de estado de tenant, pagos, invitaciones, cambios de usuario, cambios de reglas de precio, etc.) queda registrada con quién la hizo, cuándo, y datos relevantes — visible por el ADMIN (su conjunto) y el Super Admin (toda la plataforma), cada uno con las categorías que le corresponden (ver matriz de permisos).

---

## 9. Documentos legales vigentes

La plataforma tiene 4 documentos legales publicados (`legal/terminos`, `legal/privacidad`, `legal/cookies`, `legal/pagos`), todos con versión `1.0`:

- **Términos y condiciones**: define el servicio, cuentas por invitación, responsabilidades del conjunto sobre los datos que sube, usos prohibidos (acceso cruzado entre conjuntos, contenido ilegal, scraping/pruebas de seguridad no autorizadas, spam). Remite pago/renovación/suspensión/cancelación a la política de pagos y "al contrato individual" — sin números propios aquí.
- **Política de datos**: el conjunto es el responsable del tratamiento; PQRS Services es el "encargado" (procesador técnico). Lista subencargados nombrados: **Supabase, Vercel, Resend y Mercado Pago** (algunos operan fuera de Colombia). No define un plazo fijo de retención en días.
- **Cookies**: declara únicamente cookies estrictamente necesarias (sesión/seguridad) — sin analítica ni publicidad activas hoy.
- **Pagos, renovación y cancelación**: el documento más operativo. Cobro mensual automático; ante un pago rechazado, "el período de gracia establecido en el contrato" permite regularizar antes de suspender; la cancelación detiene renovaciones futuras pero **no revierte cargos ya procesados**; reembolsos se manejan "según el contrato, la ley aplicable y las reglas del proveedor de pago".

> ⚠️ **Los datos de la entidad legal (razón social, NIT, dirección) y la fecha de vigencia están vacíos/placeholder en el código** (se llenan por variables de entorno que hoy no están configuradas con valores reales). Ver el documento de consultoría para el impacto de esto.

---

## 10. Casos límite y comportamientos especiales

1. **Reactivación de un conjunto suspendido**: exige un pago aprobado con período vigente — no basta un pago histórico.
2. **Webhook de Mercado Pago duplicado**: es idempotente por `mercadoPagoPaymentId`; un reintento no genera un segundo cobro ni una segunda extensión de período.
3. **Último ADMIN activo**: un conjunto siempre debe conservar al menos un ADMIN activo. Si se intenta desactivar o cambiar de rol al único ADMIN activo restante, la operación se rechaza. Esta verificación está protegida contra condiciones de carrera (dos solicitudes simultáneas no pueden dejar al conjunto sin ningún ADMIN).
4. **Un ADMIN no puede modificarse a sí mismo** para quitarse el rol de ADMIN ni desactivar su propia cuenta.
5. **Edición de residente**: una sola vez, solo antes de ser tomada por administración (sección 4.6).
6. **Corrección de bloque/apartamento del residente**: una sola vez, con confirmación explícita.
7. **Sesión y roles obsoletos**: si a un usuario le cambian el rol o lo desactivan, la sesión activa se refresca en la siguiente llamada a la API (la ventana de desfase es mínima); además, la sesión completa expira a las 12 horas como tope de seguridad.
8. **`PENDING_PAYMENT`**: estado heredado de la arquitectura anterior (antes del trial de 15 días). Ya no se usa para crear conjuntos nuevos, pero sigue existiendo en el enum y en conjuntos creados antes de este cambio.
9. **No hay endpoint para borrar una PQRS** — solo se cierra, nunca se elimina.
10. **Las fotos/evidencias nunca exponen su URL real** al cliente, para ningún rol — todo acceso pasa por rutas que verifican pertenencia al conjunto.
