# Flujos de PQRS Services

Cómo funciona el producto de punta a punta, tal como está hoy en el código.
Cada flujo dice quién hace qué, en qué pantalla, y qué pasa por dentro.

> Actualizado: 3 de agosto de 2026.
> Si cambias una regla en el código, actualiza este archivo.

## Índice

1. [Flujo comercial: piloto pagado y conjuntos fundadores](#1-flujo-comercial-piloto-pagado-y-conjuntos-fundadores)
2. [Flujo de licencia estándar (sin piloto)](#2-flujo-de-licencia-estándar-sin-piloto)
3. [Flujo de una PQRS](#3-flujo-de-una-pqrs)
4. [Flujo de acceso: invitaciones y onboarding](#4-flujo-de-acceso-invitaciones-y-onboarding)
5. [Roles y qué puede hacer cada uno](#5-roles-y-qué-puede-hacer-cada-uno)
6. [Módulos opcionales (alcance contratado)](#6-módulos-opcionales-alcance-contratado)
7. [Estado real hoy](#7-estado-real-hoy)

---

## 1. Flujo comercial: piloto pagado y conjuntos fundadores

Este es el flujo para vender con piloto. Empieza cuando alguien te contacta
por la landing y termina cuando el conjunto queda como cliente pagado.

### Paso 0 — Llega el interesado

La administradora entra a la landing (`/`) y hace clic en **"Solicitar una
demo"** o **"Agendar demo"**. Eso la lleva a la sección de contacto: tu correo
y tu teléfono. **No hay formulario que guarde nada en la base de datos** — el
primer contacto es por fuera (correo, WhatsApp, llamada).

> Consecuencia: no existe una bandeja de "leads" en la plataforma. Si quieres
> llevar registro de conversaciones antes de crear el conjunto, hoy toca por
> fuera.

### Paso 1 — Conversas y cotizas

Con el número de unidades del conjunto ya sabes el precio, porque las reglas
de precio lo determinan solo:

- **Precio del piloto**: pago único por 45 días de acceso.
- **Precio mensual posterior**: lo que pagaría cada mes si continúa.

Ambos salen de **Super Admin → Reglas de precio**, según el rango de unidades.
Puedes verlos al instante en el simulador de esa página.

**Excepción:** si el conjunto tiene **más de 600 unidades**, el sistema no
cotiza solo. Tienes que escribir el precio del piloto y el mensual a mano, y
además dejar un **motivo escrito** de la cotización manual (queda en auditoría).

### Paso 2 — Creas el conjunto

**Super Admin → Conjuntos → "+ Crear conjunto"**. Registras:

- Nombre, ciudad, dirección, número de unidades.
- Nombre, correo y teléfono de la administradora.
- **Tipo de implementación**: Estándar (se configura sola) o Asistida
  (la configuras tú, cobro único de **$250.000**).
- **Referido** (opcional): quién trajo al conjunto y bajo qué acuerdo.
- **Módulos opcionales**: Reservas y/o Pagos de residentes.

Al guardar, el sistema crea de una vez:

- El conjunto en estado **`PENDING_PAYMENT`** (falta primer pago).
- Su suscripción, con el precio mensual congelado.
- Su ficha comercial en estado **`PILOT_PENDING_PAYMENT`**.
- Las **categorías de PQRS iniciales**.
- Los módulos opcionales en `SETUP` o `DISABLED` según lo que marcaste.

> **La administradora todavía NO recibe invitación.** Se envía después, cuando
> confirmes el pago. Así nadie entra a la plataforma sin haber pagado.

### Paso 3 — Te pagan el piloto

El pago del piloto es **manual y por fuera** (transferencia). No pasa por
pasarela. Cuando llegue el dinero:

**Super Admin → Conjuntos → clic en el conjunto → "Confirmar pago del piloto"**.
Registras el **valor recibido** y la **referencia bancaria** (obligatoria).

En ese momento el sistema calcula y fija todo el calendario del piloto, contando
desde la fecha de pago:

| Hito | Cuándo |
|---|---|
| Empieza la preparación | el día del pago |
| Lanzamiento recomendado | día 7 |
| Evaluación | día 38 |
| Fecha límite de decisión | día 45 |
| Se acaba el acceso del piloto | día 45 |

Además, **aquí sí se envía la invitación** a la administradora, y la ficha pasa
a **`PILOT_PREPARATION`**.

### Paso 4 — Preparación (antes de arrancar)

Tienes 7 hitos que marcar en el detalle del conjunto:

1. Documentos aceptados
2. Base de residentes recibida
3. Categorías configuradas
4. **Administrador invitado** — se marca solo, no lo tocas
5. Capacitación completada
6. Prueba operativa aprobada
7. Comunicación de lanzamiento enviada

**Cinco son obligatorios para poder arrancar**: pago confirmado, administrador
invitado, categorías configuradas, capacitación y prueba operativa. Sin esos
cinco el botón "Iniciar piloto" falla.

Los otros dos (base de residentes, comunicación de lanzamiento) **no bloquean**,
pero si arrancas sin ellos —o si arrancas después del día 7— el sistema **te
exige escribir una justificación** que queda en auditoría.

### Paso 5 — Piloto activo (45 días)

Botón **"Iniciar piloto"** → estado **`PILOT_ACTIVE`**. El conjunto está usando
la plataforma de verdad.

Durante estos días el panel te muestra **Uso real**: días restantes, PQRS
creadas y cerradas, usuarios invitados vs. activados, tickets de soporte. Esa
es tu evidencia para la conversación de conversión.

### Paso 6 — Evaluación (día 38)

Botón **"Iniciar evaluación"** → estado **`PILOT_EVALUATION`**. Aquí puedes
registrar notas cualitativas y métricas manuales (minutos de soporte, reuniones,
solicitudes por fuera del sistema).

Es el momento de sentarte con la administradora a decidir.

### Paso 7 — La decisión

Tienes cuatro salidas:

**a) Convertir a mensual.** Registras el pago y la referencia. Puedes aplicar
un descuento comercial de **máximo 5 %**, que **obliga a escribir un motivo y
una vigencia**.

**b) Convertir a anual.** Se cobran 12 meses con **10 % de descuento**
automático. **No admite descuento comercial adicional** — el sistema lo rechaza.

**c) Extensión excepcional.** Le das entre 1 y 30 días más, con motivo escrito.

**d) Cerrar sin conversión.** Estado `NOT_CONVERTED`, con motivo.

### Paso 8 — Conjuntos fundadores (automático al convertir)

Al convertir, si **todavía quedan cupos de los 10**, el conjunto entra
**automáticamente** como fundador. No hay que marcarlo a mano.

Un fundador recibe:

- **Número de fundador** (#1 a #10).
- **Precio protegido 12 meses** desde que se le otorga.
- **Implementación sin costo** (aunque hubieras marcado Asistida).

El cupo se asigna con un candado a nivel de base de datos, así que **no se
pueden repartir 11 cupos** aunque dos conversiones ocurran al mismo tiempo.

Ves cuántos cupos quedan en **Reglas de precio → Condiciones del negocio** y en
el detalle de cada conjunto en piloto.

### Paso 9 — Comisión del referido (si aplica)

Si registraste un referido, su comisión pasa por estos estados:

| Estado | Significa |
|---|---|
| `PENDING_CONVERSION` | Esperando que el conjunto se convierta en cliente |
| `PENDING_PAYMENTS` | Convertido, pero faltan mensualidades para causarla |
| `ELIGIBLE` | Lista para pagarse (aparece el botón) |
| `PAID` | Ya pagada |
| `MANUAL_REVIEW` | Requiere que la revises tú (p. ej. conversión anual) |

Reglas: **el pago del piloto no cuenta** como primera mensualidad, y **una
cortesía tampoco vuelve elegible la comisión**.

### Resumen de estados comerciales

```
PILOT_PENDING_PAYMENT → PILOT_PREPARATION → PILOT_ACTIVE → PILOT_EVALUATION
                                                                 ├→ CONVERTED_MONTHLY
                                                                 ├→ CONVERTED_ANNUAL
                                                                 └→ NOT_CONVERTED

LEGACY_REVIEW = conjuntos creados antes de este modelo (sin flujo que seguir)
CANCELLED     = proceso comercial cancelado
```

---

## 2. Flujo de licencia estándar (sin piloto)

Independiente del flujo comercial, cada conjunto tiene un **estado de licencia**
que controla si puede entrar a la plataforma.

```
TRIAL (15 días) → ACTIVE → GRACE_PERIOD → SUSPENDED → CANCELLED
     o                ↑         (días configurables)      ↑
PENDING_PAYMENT ──────┘                                   │
                       └──────── Reactivar ───────────────┘
```

- **`TRIAL`**: 15 días de prueba.
- **`PENDING_PAYMENT`**: creado pero sin primer pago. **Bloquea el acceso.**
- **`ACTIVE`**: al día.
- **`GRACE_PERIOD`**: se venció y no ha pagado. Sigue con acceso. Los días de
  gracia se configuran en **Licencias y pagos**.
- **`SUSPENDED`**: se agotó la gracia. **Bloquea el acceso.**
- **`CANCELLED`**: cerrado. **Bloquea el acceso.**

Los estados que bloquean (`PENDING_PAYMENT`, `SUSPENDED`, `CANCELLED`) hacen
que al entrar solo se vea una pantalla explicando qué pasó y, si es admin, un
botón para pagar.

**El paso de vencido → mora → suspendido** lo hace el sistema solo. También
puedes forzarlo desde **Conjuntos → "Actualizar estados por mora"**.

**Cortesía:** desde el detalle del conjunto puedes regalar entre 1 y 90 días
sin cobrar (corre la fecha de vencimiento). Exige motivo y queda en auditoría.

---

## 3. Flujo de una PQRS

Es el producto en sí: lo que usa el conjunto día a día.

```
EN_ESPERA ──(primer contacto)──> EN_PROGRESO ──(cierre)──> TERMINADO
```

1. **Radicación.** Un residente (o el admin en su nombre) crea la solicitud.
   Nace en **`EN_ESPERA`** y **todavía no tiene número de radicación**.

2. **Primer contacto.** El admin la abre y confirma recepción: elige prioridad
   (Alta/Media/Baja) y escribe una nota. Ahí es cuando:
   - Se **genera el número de radicación**.
   - Pasa a **`EN_PROGRESO`**.
   - Se le **avisa al residente por correo**.

3. **Seguimiento.** Se agregan notas y evidencias (fotos/archivos) mientras se
   gestiona.

4. **Cierre.** Pasa a **`TERMINADO`** con nota de cierre.

**SLA:** hay un plazo de cierre configurable (Super Admin → Configuración) que
alimenta los reportes, las alertas de "vencidas" y el semáforo de cada caso.

**Corrección auditada:** un caso cerrado por error se puede corregir/reabrir,
pero queda registrado con motivo — no se borra el historial.

---

## 4. Flujo de acceso: invitaciones y onboarding

**Nadie se registra solo.** Todo el mundo entra por invitación.

1. Un admin invita por correo, eligiendo el rol.
2. Le llega un enlace con **token válido 72 horas**, de **un solo uso**.
3. Al aceptarlo, crea su contraseña.
4. Completa el onboarding de su rol:
   - **Admin**: datos del conjunto.
   - **Residente**: bloque y apartamento (**se puede corregir una sola vez**).
5. Entra a su panel.

Si se reenvía la invitación, **el token anterior se invalida**.

**Protección:** no se puede desactivar al último ADMIN activo de un conjunto.

---

## 5. Roles y qué puede hacer cada uno

| Rol | Para qué sirve |
|---|---|
| **SUPER_ADMIN** | Tú. Ve toda la plataforma: conjuntos, precios, licencias, pagos, analítica, auditoría, soporte, configuración. |
| **ADMIN** | Administra un conjunto: gestiona PQRS, invita usuarios, ve reportes, paga la licencia. |
| **ASISTENTE** | Apoya al admin en la gestión de PQRS, sin control de facturación ni usuarios. |
| **CONSEJO** | Supervisa: ve PQRS y reportes de su conjunto, sin poder administrarlo. |
| **RESIDENTE** | Radica sus PQRS y les hace seguimiento. Solo ve las suyas. |

Un mismo correo puede pertenecer a **varios conjuntos** con roles distintos;
en ese caso, al entrar elige con cuál trabajar.

---

## 6. Módulos opcionales (alcance contratado)

Además de la gestión de PQRS, hay dos módulos que se contratan aparte:

- **Reservas** — reserva de zonas comunes.
- **Pagos de residentes** — cobros y comprobantes de los residentes.

Se activan por conjunto desde el detalle. Si están desactivados, **el conjunto
ni siquiera ve el menú**, y el acceso directo por URL también falla.
Desactivar **no borra** los datos ya cargados.

---

## 7. Estado real hoy

Cosas ciertas hoy que conviene tener presentes:

- **Ningún conjunto actual está usando el flujo de piloto.** Todos están sin
  ficha comercial o en `LEGACY_REVIEW`. Toda la maquinaria de piloto,
  fundadores y conversión está construida y probada, pero **inerte**: se
  activa cuando vendas el primer conjunto con ese modelo.
- **Los 10 cupos de fundador están disponibles.**
- **No hay regla de precio para conjuntos de 601 o más unidades.** Un conjunto
  de ese tamaño no se puede cotizar automáticamente ni cobrar (arriba de 600 el
  sistema exige cotización manual, pero la tabla tampoco cubre ese rango).
- **El pago del piloto y la conversión son manuales** (transferencia +
  referencia). La pasarela solo se usa para la licencia mensual recurrente.
- **Hoy no ha entrado dinero por la pasarela.** Los $1.968.000 que figuran
  como pagos aprobados son todos *registros manuales sin cobro*: los generó
  el botón "Registrar pago" de Super Admin, que extiende la licencia 30 días
  y deja un pago marcado como `SIMULATED`. Sirve para reflejar una
  transferencia que recibiste por fuera, pero **no es plata que haya entrado
  por Mercado Pago**. En *Licencias y pagos → Pagos* se ven separados.
- **El MRR y "Recibido en \<mes\>" incluyen esos registros manuales** (solo
  excluyen cortesías). Si quieres que esas métricas cuenten únicamente el
  dinero real de la pasarela, hay que cambiarlo en el backend.
- **No hay registro de leads**: el primer contacto ocurre por fuera de la
  plataforma.
