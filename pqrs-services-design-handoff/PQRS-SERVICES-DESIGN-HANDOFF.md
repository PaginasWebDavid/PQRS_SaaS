# PQRS Services — Design Handoff

Paquete de activos y contexto para producir un video de marketing de 20–30
segundos para LinkedIn. Todo lo que hay aquí sale del producto real: código,
aplicación en producción y datos de demostración sintéticos.

Capturado el 17 de agosto de 2026 desde `https://www.pqrsservices.com`.

---

## 1. Qué es PQRS Services

Plataforma web para que la administración de un conjunto residencial reciba,
atienda, cierre y reporte las **PQRS** (peticiones, quejas, reclamos y
solicitudes) de sus residentes.

Es multi-conjunto: varios conjuntos comparten la misma aplicación pero su
información está completamente aislada. Cuatro roles con vistas distintas
—plataforma, administración, consejo y residente— y módulos opcionales de
reservas de zonas comunes y pagos de residentes.

Está en producción, con dominio propio, cobro por pasarela y documentos legales
publicados.

---

## 2. Público objetivo

- Administradores y administradoras de propiedad horizontal en Colombia
- Consejos de administración
- Empresas que administran varios conjuntos residenciales

Perfil real: profesionales que operan entre uno y cinco conjuntos, con las
solicitudes repartidas entre WhatsApp personal, correo y anotaciones en papel.

---

## 3. Problema que resuelve

**Concepto clave: «Centraliza lo que hoy vive entre WhatsApp, Excel y correo.»**

Tres dolores concretos:

1. Las solicitudes llegan por canales distintos y nunca están en un solo lugar.
2. Cuando un residente afirma que no le respondieron, **no hay con qué demostrar
   lo contrario**.
3. El informe para el consejo se arma a mano, buscando conversación por
   conversación.

El valor central no es eficiencia, es **respaldo**: evidencia con fecha, autor y
soporte de cada caso.

---

## 4. Flujo principal

Verificado contra el producto, no supuesto:

1. **El residente radica** desde el celular, sin instalar nada. Envía título,
   descripción y hasta **3 fotos**. No elige categoría ni prioridad.
2. **La administración recibe** la solicitud en su lista y por correo. El caso
   entra en estado *En espera*.
3. **La administración abre el caso y lo clasifica.** Al asignar categoría, el
   sistema decide el flujo: **simple** (abrir y cerrar) o **mantenimiento**
   (avanza por 5 fases). Se registra nota de primer contacto.
4. **Gestiona**: prioridad, responsable, avances por fase.
5. **Cierra con evidencia**: acción tomada y soporte del cierre, obligatorios.
6. **Queda trazable**: historial con fecha y autor de cada cambio, indicadores de
   tiempo de respuesta y exportación a Excel y PDF.

---

## 5. Identidad visual

Valores tomados de `src/app/globals.css` y `src/lib/design/tokens.ts`. **No
aproximar ni sustituir.**

| Elemento | Valor | Fuente en código | Uso |
|---|---|---|---|
| Azul de marca | `#122545` | `--navy` | Fondos oscuros, botones primarios, titulares, logo |
| Azul hover | `#0B1A33` | `--navy-hover` | Estado hover del botón primario |
| Azul suave | `#EAEEF6` | `--navy-soft` | Fondos de apoyo, etiquetas |
| Texto sobre azul | `#B7C1D6` | `--navy-muted` | Texto secundario sobre fondo azul |
| Texto sobre azul (2) | `#9FB1CE` | `--navy-text` | Barra lateral de plataforma |
| Texto principal | `#1D1D1F` | `--text-primary` | Titulares y cuerpo sobre claro |
| Texto secundario | `#6E6E73` | `--text-secondary` | Descripciones, apoyo |
| Texto alterno | `#424245` | `--text-secondary-alt` | Cuerpo de documentos legales |
| Texto tenue | `#8E8E93` | `--text-muted` | Metadatos, notas al pie |
| Verde de éxito | `#1A6B3A` | `--status-success` | Estado terminado, montos recibidos |
| Verde suave | `#ECF6EF` | `--status-success-soft` | Fondo de etiqueta terminada |
| Ámbar de aviso | `#8A5A00` | `--status-warning` | Estado en espera, alertas |
| Ámbar suave | `#FBF3DF` | `--status-warning-soft` | Fondo de aviso |
| Rojo de alerta | `#B3261E` | `--status-danger` | Errores, alertas rojas |
| Rojo suave | `#FBEAEA` | `--status-danger-soft` | Fondo de alerta roja |
| Fondo general | `#FFFFFF` | `--background` | Lienzo de la aplicación |
| Fondo de tarjeta | `#F5F5F7` | `--surface-card-soft` | Tarjetas de indicadores |
| Barra lateral | `#FAFAFA` | `--surface-sidebar` | Menú de administración |
| Borde | `#E8E8ED` | `--input-border` | Bordes de campos y tarjetas |
| Borde suave | `rgba(0,0,0,0.06)` | `--border-soft` | Separadores |
| Gris neutro | `#E8E8ED` | `--neutral-soft` | Etiquetas neutras |
| Superposición | `rgba(0,0,0,0.35)` | `--overlay` | Fondo de hojas modales |

### Tipografía

| Familia | Pesos | Fuente en código | Uso |
|---|---|---|---|
| **Manrope** | 400, 500, 600, 700, 800 | `src/app/layout.tsx` (`next/font/google`) | Toda la interfaz |
| **JetBrains Mono** | 400, 500 | mismo archivo | Solo números de radicado e identificadores |

Jerarquías observadas: titular de sección `clamp(28px, 5vw, 40px)` peso 800 con
`letter-spacing -0.025em` y `line-height 1.1`; título de tarjeta 17–20 px peso
800; cuerpo 13,5–15 px peso 500; metadatos 11–12,5 px.

### Formas y sombras

| Elemento | Valor | Fuente |
|---|---|---|
| Radio de tarjeta | `18px` | `RADIUS.card` |
| Radio de tarjeta pequeña | `16px` | `RADIUS.cardSm` |
| Radio de indicador | `14px` | `RADIUS.stat` |
| Radio de campo | `12px` | `RADIUS.input` |
| Radio de control | `10px` | `RADIUS.control` |
| Píldora (botones, etiquetas) | `999px` | `RADIUS.pill` |
| Hoja modal (escritorio) | `22px` | `RADIUS.sheetDesktop` |
| Hoja modal (móvil) | `22px 22px 0 0` | `RADIUS.sheetMobile` |
| Sombra de tarjeta | `0 1px 4px rgba(0,0,0,0.04)` | inline en componentes |

### Botones y tarjetas

**Botón primario**: fondo `#122545`, texto blanco, peso 700, radio píldora,
alto ~42 px. **Botón secundario**: fondo blanco, borde `#E8E8ED`, texto
`#122545`. **Etiqueta de estado**: fondo suave del color del estado, texto en el
color fuerte, radio píldora, 11–12 px peso 700.

**Tarjeta de indicador**: fondo `#F5F5F7`, radio 14 px, etiqueta 11 px en
`#8E8E93` peso 700, cifra 20–26 px peso 800.

Sin degradados. Sin sombras marcadas. Sin bordes gruesos.

---

## 6. Logo y assets

| Archivo | Ruta en el repo | Notas |
|---|---|---|
| `logo.svg` | `public/logo.svg` | Logo principal, 128×128, burbuja de chat azul con chulo blanco |
| `icon.svg` | `src/app/icon.svg` | Favicon, mismo trazado |
| `hero-product-preview.png` | `public/marketing/hero-product-preview.png` | Imagen de producto usada en la landing |

Copias en `brand/` de esta carpeta.

**Bloque de marca**: logo + `PQRS` peso 800 color `#122545` + `Services` peso 500
color `#6E6E73`. Siempre en ese orden y con ese contraste de pesos.

No existen versiones alternativas del logo (ni monocroma, ni horizontal, ni
negativa). **No se deben inventar.** Si hace falta el logo sobre fondo azul, usar
el trazado del chulo en blanco sin la burbuja.

---

## 7. Screenshots

Todos en 1512×945 escritorio (densidad 2×) o 390×844 móvil (densidad 3×), sin
navegador, sin barras del sistema, sin texto superpuesto.

### 01-landing-hero.png
- **Pantalla**: landing pública, primera vista
- **Rol**: visitante
- **Qué muestra**: marca, titular y propuesta de valor
- **Mensaje**: existe un producto real y presentable
- **Datos**: ninguno, contenido estático
- **Recomendado**: **Sí**
- **Razón**: establece marca en el primer segundo del video

### 01b-landing-movil.png
- **Pantalla**: landing en móvil
- **Rol**: visitante
- **Qué muestra**: la landing responde bien en celular
- **Mensaje**: pensado para móvil
- **Datos**: ninguno
- **Recomendado**: No
- **Razón**: redundante con 01 en un video corto

### 02-landing-producto.png
- **Pantalla**: sección de producto de la landing
- **Rol**: visitante
- **Qué muestra**: vista de producto con lenguaje visual de la aplicación
- **Mensaje**: el producto se ve terminado
- **Datos**: contenido de la landing
- **Recomendado**: No
- **Razón**: las capturas reales del producto comunican más

### 03-landing-como-funciona.png
- **Pantalla**: sección «Operando en días, no en meses»
- **Rol**: visitante
- **Qué muestra**: los tres pasos de implementación
- **Mensaje**: se monta rápido
- **Datos**: contenido estático
- **Recomendado**: No
- **Razón**: habla de implementación, no del flujo de una PQRS, que es la historia del video

### 04-landing-precios.png
- **Pantalla**: sección de precios
- **Rol**: visitante
- **Qué muestra**: tramos por unidades con botón «Cotizar», **sin montos**
- **Mensaje**: hay modelo comercial claro
- **Datos**: tramos leídos de la base
- **Recomendado**: No
- **Razón**: el precio no es el argumento en LinkedIn

### 05-residente-inicio-movil.png
- **Pantalla**: inicio del residente, móvil
- **Rol**: residente
- **Qué muestra**: saludo, botón «Nueva solicitud», filtros y lista propia
- **Mensaje**: el residente entra y radica sin aprender nada
- **Datos**: María Fernanda Ríos (sintético)
- **Recomendado**: **Sí**
- **Razón**: abre la historia del lado del residente

### 06-residente-detalle-solicitud-movil.png
- **Pantalla**: detalle de una solicitud propia, móvil
- **Rol**: residente
- **Qué muestra**: estado y seguimiento visibles para el residente
- **Mensaje**: el residente sabe en qué va su caso
- **Datos**: sintéticos
- **Recomendado**: opcional
- **Razón**: refuerza transparencia, pero no es imprescindible en 25 segundos

### 07-residente-nueva-solicitud-movil.png
- **Pantalla**: hoja «Nueva solicitud», móvil
- **Rol**: residente
- **Qué muestra**: campos Título y Descripción, **«Adjuntar evidencias (0/3)»** y «Enviar solicitud»
- **Mensaje**: radicar toma segundos; solo tres campos
- **Datos**: formulario vacío, sin datos
- **Recomendado**: **Sí**
- **Razón**: es la prueba visual de «el residente radica desde el celular, sin instalar nada»

### 08-admin-dashboard.png
- **Pantalla**: inicio de administración
- **Rol**: administración
- **Qué muestra**: aviso de licencia, «5 PQRS necesitan primer contacto», indicadores (10 en proceso, 35 resueltas, 5,2 d de cierre, 17 usuarios de 350 unidades), PQRS recientes y actividad reciente
- **Mensaje**: producto operativo, con información para decidir
- **Datos**: sintéticos
- **Recomendado**: **Sí**
- **Razón**: la pantalla que más «producto real y en uso» comunica

### 09-admin-listado-pqrs.png
- **Pantalla**: listado de PQRS
- **Rol**: administración
- **Qué muestra**: radicado, título, categoría, residente y estado, con filtros y buscador
- **Mensaje**: todo centralizado en un solo lugar
- **Datos**: sintéticos
- **Recomendado**: opcional
- **Razón**: la captura 10 ya incluye la lista completa a la izquierda

### 10-admin-detalle-cerrada-con-evidencia.png
- **Pantalla**: listado + panel de detalle de un caso cerrado
- **Rol**: administración
- **Qué muestra**: radicado `PQRS-202608-0047`, estado *Terminada*, categoría, avance de fases, residente, ubicación, fechas, descripción y seguimiento con **primer contacto, acción tomada y evidencia de cierre**
- **Mensaje**: trazabilidad completa y cierre con soporte
- **Datos**: sintéticos
- **Recomendado**: **Sí — la captura más importante del paquete**
- **Razón**: resuelve en una sola imagen «gestiona», «cierra con evidencia» y «queda trazable»

### 11-admin-reportes.png
- **Pantalla**: reportes de PQRS
- **Rol**: administración y consejo
- **Qué muestra**: 8 indicadores con comparativo contra el periodo anterior, centro de alertas rojas y amarillas, botones **Descargar Excel** y **Descargar PDF**
- **Mensaje**: el informe del consejo sale solo
- **Datos**: sintéticos
- **Recomendado**: **Sí**
- **Razón**: cierra el argumento de trazabilidad con números

### 12-admin-actividad.png
- **Pantalla**: registro de actividad
- **Rol**: administración
- **Qué muestra**: bitácora de acciones con autor y fecha
- **Mensaje**: hay auditoría
- **Datos**: sintéticos
- **Recomendado**: No
- **Razón**: visualmente plana; el mismo mensaje lo da mejor la 10

### 13-admin-licencias.png
- **Pantalla**: licencias y pagos del conjunto
- **Rol**: administración
- **Qué muestra**: estado de licencia, cobro automático e historial de pagos
- **Mensaje**: hay operación comercial montada
- **Datos**: sintéticos
- **Recomendado**: No
- **Razón**: hablar de cobro en una pieza de captación resta

### 14-admin-detalle-en-gestion-fases.png
- **Pantalla**: detalle de un caso de mantenimiento en curso
- **Rol**: administración
- **Qué muestra**: caso en fase intermedia del flujo de 5 fases
- **Mensaje**: los casos de obra se siguen por etapas
- **Datos**: sintéticos
- **Recomendado**: opcional
- **Razón**: buen apoyo para la escena de «gestiona» si se quiere mostrar el paso intermedio

### 15-admin-detalle-por-abrir.png
- **Pantalla**: detalle de un caso recién radicado
- **Rol**: administración
- **Qué muestra**: caso en espera con el botón **«Abrir caso»**
- **Mensaje**: la administración recibe y actúa
- **Datos**: sintéticos
- **Recomendado**: **Sí**
- **Razón**: es el eslabón «la administración recibe» y da contraste narrativo con la 10, que es el mismo caso ya cerrado

### 16-landing-cta.png
- **Pantalla**: cierre comercial de la landing
- **Rol**: visitante
- **Qué muestra**: llamado a solicitar demostración y datos de contacto
- **Mensaje**: hay a dónde escribir
- **Datos**: contacto real de la empresa
- **Recomendado**: **Sí**
- **Razón**: cierra el video con acción

---

## 8. Screenshots seleccionados para el video

Seis, en este orden:

1. `01-landing-hero.png`
2. `07-residente-nueva-solicitud-movil.png`
3. `15-admin-detalle-por-abrir.png`
4. `10-admin-detalle-cerrada-con-evidencia.png`
5. `11-admin-reportes.png`
6. `16-landing-cta.png`

Reservas por si alguna escena necesita apoyo: `05-residente-inicio-movil.png`,
`08-admin-dashboard.png`, `14-admin-detalle-en-gestion-fases.png`.

---

## 9. Narrativa visual recomendada

Una sola idea por escena. El hilo es **un caso concreto** —una fuga— desde que
un residente la reporta hasta que queda documentada.

**Escena 1 — La marca.** `01-landing-hero`. Se establece qué es esto y para
quién. Un latido, no más.

**Escena 2 — El residente reporta.** `07-residente-nueva-solicitud-movil`. En
vertical, en un celular. El gesto importante es el contador de evidencias:
comunica «con foto» sin decirlo.

**Escena 3 — La administración recibe.** `15-admin-detalle-por-abrir`. Cambio a
escritorio. El caso llegó y hay un botón que dice qué hacer. Aquí se siente el
paso del canal informal al proceso.

**Escena 4 — Se cierra con evidencia.** `10-admin-detalle-cerrada-con-evidencia`.
El momento de mayor peso. Es **el mismo caso** de la escena anterior, ahora
terminado, con primer contacto, acción tomada y evidencia. Que se lea la palabra
*Terminada*.

**Escena 5 — Todo queda trazable.** `11-admin-reportes`. Los números y la
exportación. Es la escena que le habla al consejo, no al residente.

**Escena 6 — Contacto.** `16-landing-cta`. Cierre con marca y forma de contactar.

El giro narrativo está entre la escena 3 y la 4: **el mismo radicado, dos
estados**. Si Claude Design respeta eso, el video demuestra el producto en vez de
describirlo.

---

## 10. Copy disponible

Verificado como coherente con el producto actual. **Usar literal.**

- «Centraliza lo que hoy vive entre WhatsApp, Excel y correo.»
- «Que nunca le vuelvan a decir que no respondió.»
- «El residente radica desde el celular.»
- «Sin instalar nada.»
- «La administración atiende y cierra con evidencia.»
- «Todo queda trazable.»
- «El informe del consejo sale solo.»
- «Agende una demostración sin compromiso.»
- «PQRS Services»
- «pqrsservices.com»

Reglas: **ni una palabra en inglés**; tratar de **usted**; sin precios; sin
superlativos ni cifras de clientes.

---

## 11. Restricciones para Claude Design

**No debe:**

- inventar interfaces ni pantallas que no estén en `screenshots/`
- modificar, recortar engañosamente ni recomponer los screenshots
- cambiar los colores de marca
- mostrar funcionalidades que no existen
- introducir dashboards, gráficas o cifras falsas
- usar personas generadas por IA
- usar material de archivo innecesario
- exagerar capacidades
- mostrar datos sensibles
- convertirlo en un comercial genérico de software

**Prioridades, en este orden:**

```
PRODUCTO REAL   >   MOCKUP
CLARIDAD        >   EFECTOS
CREDIBILIDAD    >   ESPECTÁCULO
```

Movimiento admisible: desplazamientos suaves, aparición de capas, transiciones
limpias entre capturas, resaltado de una zona real de la pantalla. Nada de
rotaciones 3D, destellos ni transiciones de plantilla.

---

## 12. Recomendación para video

**Duración: 26 segundos.** Formato cuadrado 1080×1080 o vertical 1080×1350;
LinkedIn favorece ambos en el móvil. **Sin audio indispensable**: se ve en
silencio, así que todo el mensaje va en texto.

| # | Tiempo | Screenshot | Texto en pantalla |
|---|---|---|---|
| 1 | 0–3 s | `01-landing-hero` | PQRS Services |
| 2 | 3–8 s | `07-residente-nueva-solicitud-movil` | El residente radica desde el celular. Sin instalar nada. |
| 3 | 8–13 s | `15-admin-detalle-por-abrir` | La administración recibe y abre el caso. |
| 4 | 13–19 s | `10-admin-detalle-cerrada-con-evidencia` | Se cierra con evidencia. Todo queda trazable. |
| 5 | 19–23 s | `11-admin-reportes` | El informe del consejo sale solo. |
| 6 | 23–26 s | `16-landing-cta` | Agende una demostración sin compromiso · pqrsservices.com |

Texto siempre en Manrope peso 800, sobre fondo `#122545` o sobre zona limpia de
la captura. Máximo una frase por escena.

---

## 13. Observaciones de la inspección

Cosas encontradas que conviene saber antes de producir.

**No existe una pantalla de «confirmación con número de radicado» capturable.**
El número se asigna al enviar el formulario, y capturarlo exigía crear una PQRS
real. No se hizo por la restricción de no modificar datos. El radicado sí se ve
en `10` y en `15`, que cumplen el mismo propósito narrativo.

**La etiqueta del listado cuenta lo cargado, no el total.** Dice «25 solicitudes
reales» habiendo 50, porque la lista pagina a 25. Es comportamiento existente del
producto. No afecta al video, pero si alguien amplía la captura, ahí está.

**Los textos de cierre de los datos demo no siempre corresponden al caso.** Por
ejemplo, un caso de «Filtro de la piscina requiere cambio» aparece cerrado con
«Se expidió el documento solicitado». Viene del sembrado de demostración, que
reparte los textos de cierre sin emparejarlos con la categoría. **En el video no
se alcanza a leer**, pero conviene corregirlo antes de una demostración en vivo.

**La dirección del conjunto de demostración es una dirección real** (`Calle 100 #
49-97`, tomada de los datos legales de la empresa al sembrar). No aparece en
ninguna de las capturas seleccionadas, pero sí en la pantalla de configuración.

**No hay versiones alternativas del logo.** Solo el SVG a color sobre claro.
