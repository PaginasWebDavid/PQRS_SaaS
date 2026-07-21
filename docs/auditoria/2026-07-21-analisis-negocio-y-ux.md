# Análisis de negocio, producto y UX — PQRS Services

**Fecha:** 2026-07-21
**Marco de referencia:** este análisis parte de una premisa explícita: **PQRS Services lo construye y opera una sola persona**, sin equipo ni presupuesto corporativo. Cada recomendación está filtrada por esa realidad — se descartó deliberadamente cualquier solución que exija procesos, roles o infraestructura que un operador único no pueda sostener. Donde el sistema ya toma la decisión simple y correcta, se dice explícitamente (para no generar trabajo arreglando lo que no está roto).

Todos los hallazgos se basan en el comportamiento real del código, documentado en detalle en [`Negocio.md`](../../Negocio.md).

---

## Cómo leer este documento

Cada hallazgo tiene 4 partes: **Problema** (qué pasa hoy), **Por qué importa** (la consecuencia concreta), **Impacto** (qué tan urgente es para un negocio de una persona) y **Solución práctica** (la opción más simple y sostenible).

**Orden de prioridad recomendado** (de mayor a menor relación esfuerzo/impacto):

1. Completar los datos legales de la empresa (§2.1) — 15 minutos, riesgo real.
2. Avisar por correo antes de que venza el trial/la gracia (§4.1) — infraestructura ya existe.
3. Unificar el período de gracia entre el cron y el webhook de Mercado Pago (§1.1).
4. Unificar las etiquetas de estado de licencia entre pantallas (§3.2).
5. Dar al Super Admin una forma simple de otorgar una extensión/cortesía sin pasar por Mercado Pago (§1.2).
6. Definir una política de reembolso/cancelación concreta en vez de remitir a "el contrato" (§2.2).
7. Evaluar un formulario público de "solicitar prueba gratis" para dejar de ser cuello de botella en cada alta (§3.1).
8. El resto son mejoras de consistencia/mantenimiento, sin urgencia.

---

## 1. Facturación y monetización

### 1.1 Dos fuentes de verdad para el período de gracia

**Problema:** el proceso automático que mueve conjuntos vencidos a "en gracia" (`applyOverdueLicenseRules`) lee el período de gracia desde una configuración del Super Admin (por defecto 5 días, editable desde el panel). Pero el webhook de Mercado Pago, cuando un pago falla o queda pendiente, usa un **valor de 5 días escrito directamente en el código**, sin leer esa misma configuración.

**Por qué importa:** si algún día decides cambiar el período de gracia global (por ejemplo, a 10 días, por una temporada de vacaciones o una promoción), la mitad del sistema respetará ese cambio y la otra mitad seguirá aplicando 5 días fijos. Un conjunto podría quedar suspendido antes de lo que tú mismo configuraste, sin que haya ningún error visible — simplemente dos partes del sistema no se enteraron del mismo cambio.

**Impacto:** medio-bajo hoy (mientras el valor configurado siga siendo 5, no se nota), pero es una **bomba de tiempo silenciosa**: el día que cambies ese número, aparecerá una inconsistencia que vas a tardar en diagnosticar porque no hay ningún error, solo un comportamiento distinto al esperado.

**Solución práctica:** que el webhook de Mercado Pago lea el mismo valor de configuración que ya usa el cron, en vez de tener su propia constante. Es un cambio de una línea (reemplazar el número fijo por una lectura a la misma configuración), no un rediseño.

---

### 1.2 No hay forma simple de dar una cortesía sin pasar por Mercado Pago

**Problema:** la única forma de reactivar un conjunto suspendido es que exista un pago **aprobado** con período vigente. No existe ningún botón para que tú, como dueño del negocio, extiendas manualmente un trial, perdones un mes, o le des una cortesía a un cliente sin tener que fabricar un pago simulado directamente en la base de datos.

**Por qué importa:** en un negocio de atención directa (que es justamente tu ventaja frente a competidores grandes), vas a querer resolver casos puntuales: un cliente que tuvo un problema real y merece una extensión, un conjunto nuevo que quieres dejar probar unos días más, un error tuyo al configurar precios que quieres corregir sin cobrar de más. Hoy, para cualquiera de esos casos, tendrías que manipular la base de datos a mano — algo lento, riesgoso (un error ahí puede romper otras cosas) y que no vas a poder hacer rápido cuando el cliente está esperando en el chat.

**Impacto:** medio. No bloquea el negocio hoy, pero cada vez que necesites hacer una excepción (y en atención al cliente uno a uno, vas a necesitarlo) vas a perder tiempo o vas a evitar hacerlo porque es incómodo — lo cual empeora la experiencia del cliente en el peor momento (cuando ya tuvo un problema).

**Solución práctica:** un botón simple en el detalle del conjunto, en el panel de Super Admin: "Otorgar cortesía / extender N días" que internamente registre un pago `APPROVED` marcado como cortesía (con tu usuario como autor, para que quede en la auditoría) y extienda el período. Es una función pequeña, reutiliza la lógica que ya existe para renovar, y te ahorra tener que tocar la base de datos manualmente cada vez.

---

## 2. Legal y riesgo contractual

### 2.1 Los datos de la empresa están vacíos en los documentos legales

**Problema:** los términos y condiciones y la política de privacidad se generan a partir de variables de entorno para razón social, NIT, dirección y fecha de vigencia — y hoy esas variables están vacías. Es decir, los documentos legales que ve cualquier cliente dicen, en la práctica, "(completar)" donde debería estar la identidad legal de quien presta el servicio.

**Por qué importa:** si en algún momento hay una disputa (un cliente que reclama un cobro, un problema de datos, un desacuerdo cualquiera), el primer lugar donde alguien va a mirar es "¿con quién estoy contratando exactamente?". Un documento legal sin la identidad de la contraparte es, en la práctica, casi papel mojado — no protege a nadie, ni a ti ni al cliente.

**Impacto:** **alto** en términos de riesgo, pero **trivial** en esfuerzo — es la mejor relación impacto/esfuerzo de todo este análisis. No es un problema de código: es rellenar unas variables de entorno con los datos reales de tu empresa (o tuyos, si operas como persona natural) y redesplegar. Quince minutos, cero riesgo técnico.

**Solución práctica:** completar esas variables de entorno con tus datos reales antes de que haya un solo cliente pagando de verdad (si ya lo hay, hacerlo ya). Si todavía no tienes una figura legal constituida (SAS, persona natural con RUT, etc.), vale la pena resolver eso primero — es una decisión de negocio, no técnica, pero condiciona qué se puede escribir aquí.

---

### 2.2 La política de pagos no define números concretos — todo remite "al contrato"

**Problema:** el documento público de pagos, renovación y cancelación no dice cuántos días de gracia hay, cuánto aviso se da antes de un cambio de precio, ni bajo qué condiciones exactas procede un reembolso. Todo eso queda remitido a "el contrato individual" — pero no existe evidencia de que exista un proceso real de firma de contrato por cliente; el cliente simplemente acepta los términos genéricos al aceptar su invitación.

**Por qué importa:** en la práctica, hoy **no existe ninguna política de reembolso o cancelación concreta** a la que puedas remitirte tú mismo si un cliente te reclama. Cuando eso pase (y va a pasar, tarde o temprano, con cualquier negocio de suscripción), vas a tener que improvisar la respuesta en el momento, lo cual es más difícil y más propenso a que termines cediendo más de lo que hubieras querido, o generando inconsistencia entre un cliente y otro (a uno le devuelves, a otro no, sin una regla escrita que lo justifique).

**Impacto:** medio-alto — no es urgente si aún no hay clientes pagando, pero se vuelve crítico en el momento en que el primer pago real ocurre.

**Solución práctica:** no se necesita un abogado ni un sistema de contratos individuales todavía. Basta con escribir en el propio documento de pagos una regla simple y estándar de la industria SaaS, por ejemplo: *"Los pagos ya procesados no son reembolsables; puedes cancelar la renovación automática en cualquier momento y no se te cobrará el siguiente ciclo; el servicio permanece activo hasta el fin del período ya pagado."* Esa sola frase, bien visible, te cubre en el 90% de los casos reales y es coherente con lo que ya haces técnicamente (desactivar auto-renovación no revierte el período vigente).

---

## 3. Onboarding, activación y crecimiento

### 3.1 Cada conjunto nuevo depende de que tú lo crees a mano

**Problema:** no existe ningún formulario público para que un conjunto interesado inicie su propio trial. La única forma de que un conjunto entre a la plataforma es que tú, desde el panel de Super Admin, llenes su nombre, ciudad, unidades y el correo del administrador, y dispares la invitación.

**Por qué importa:** esto significa que **tu tiempo personal es el cuello de botella de cada venta nueva**. Hoy, con pocos clientes, es perfectamente manejable (incluso deseable: te obliga a conocer a cada cliente antes de que entre). Pero es el primer límite de crecimiento que vas a chocar si la demanda aumenta — cada conjunto interesado necesita que tú estés disponible para darlo de alta, en vez de poder probar el producto de inmediato cuando tiene el interés más alto (justo después de ver una demo o una landing page).

**Impacto:** bajo hoy, **alto a mediano plazo** — es exactamente el tipo de fricción que no se nota hasta que empieza a doler, y para entonces ya perdiste oportunidades de gente que se enfrió esperando respuesta.

**Solución práctica:** no hace falta un flujo de autoservicio completo con cobro automático de entrada (eso sí sería sobre-ingeniería para tu etapa actual). Basta con un formulario público simple ("Solicita tu prueba gratis de 15 días") que capture nombre del conjunto, ciudad, unidades aproximadas y el correo del administrador, y **automáticamente** cree el tenant en TRIAL y dispare la invitación — es decir, reutilizar exactamente la función que ya existe para esto (`createTenantWithAdmin`), solo que disparada por un formulario público en lugar de por ti manualmente. Con una protección anti-spam simple (un captcha básico o un límite de solicitudes por IP) es suficiente para tu escala actual.

---

## 4. Notificaciones y comunicación proactiva

### 4.1 El vencimiento del trial o de la gracia no avisa a nadie

**Problema:** en el código existen tipos de notificación declarados para "licencia por vencer" y "licencia suspendida" — pero no se encontró ningún punto del sistema que realmente los dispare. En la práctica, cuando un conjunto entra en período de gracia o queda suspendido, **nadie recibe un aviso proactivo**: el ADMIN se entera solo si entra por su cuenta a revisar "Licencias y pagos".

**Por qué importa:** este es, probablemente, el hallazgo con más impacto directo en tus ingresos de todo el análisis. Un administrador de conjunto normalmente no revisa la plataforma todos los días — si su pago falla (tarjeta vencida, fondos insuficientes) y nadie se lo dice, puede pasar el período de gracia completo sin que se entere, y terminar suspendido por una razón completamente evitable. Eso es un cliente molesto por algo que se pudo prevenir con un correo, y en el peor caso, un cliente que se cancela sin haber tenido intención real de irse.

**Impacto:** **alto**. Es plata que se puede estar perdiendo hoy mismo, en silencio, sin que aparezca como ningún error en ningún log.

**Solución práctica:** el trabajo pesado ya está hecho — el servicio de notificaciones y el envío de correos (Resend) ya existen y ya se usan para PQRS e invitaciones. Solo falta conectar dos puntos: cuando el proceso automático de mora mueva un conjunto a "en gracia", que dispare un correo al ADMIN ("tu pago no se procesó, tienes N días para regularizarlo"); y cuando lo suspenda, otro correo avisando que el servicio quedó suspendido y cómo reactivarlo. Es reutilizar infraestructura existente, no construir nada nuevo.

---

## 5. Consistencia entre pantallas

### 5.1 El mismo estado de licencia se llama distinto en dos pantallas

**Problema:** el estado `GRACE_PERIOD` de una suscripción se muestra como **"En mora"** en la página de Licencias del Admin, pero como **"Periodo de gracia"** en la función central que genera las etiquetas de estado (usada en otras partes del sistema, como reportes o el propio panel del Super Admin). Son dos textos distintos para exactamente el mismo estado.

**Por qué importa:** no es solo un detalle estético — es una fuente de confusión real de soporte. Si un administrador te escribe preguntando "¿por qué mi conjunto dice 'en mora' en una pantalla pero en el correo dice 'período de gracia'?", vas a tener que explicar que es lo mismo, lo cual erosiona un poco la confianza en que el sistema es preciso y cuidado.

**Impacto:** bajo en gravedad, pero **acumulativo**: cada pantalla nueva que agregues con su propio mapa de etiquetas es una oportunidad más de que se desincronicen entre sí, y con el tiempo (y sin un catálogo central) esto tiende a empeorar, no a mejorar solo.

**Solución práctica:** usar una única función/diccionario de etiquetas de estado (la que ya existe centralizada) en absolutamente todas las pantallas, en vez de que cada página tenga su propia copia del mapa de textos. Es un cambio mecánico y de bajo riesgo — no cambia ningún comportamiento, solo asegura que todos lean del mismo lugar.

### 5.2 Los reportes de Admin y Consejo son casi el mismo código, duplicado

**Problema:** las páginas de reportes de ADMIN y de CONSEJO tienen prácticamente la misma estructura (los mismos KPIs, los mismos gráficos, las mismas dos tablas) implementadas dos veces de forma independiente, en dos archivos distintos.

**Por qué importa:** cualquier mejora futura a los reportes (un nuevo KPI, un cambio de fórmula, un ajuste visual) hay que hacerla y probarla dos veces, a mano, con el riesgo real de que se te olvide replicar el cambio en la segunda pantalla y las dos terminen mostrando cosas distintas para el mismo conjunto (de hecho, ya pasó una vez en esta base de código: la fórmula de "vencida" estuvo divergente entre estas dos pantallas hasta que se unificó).

**Impacto:** bajo urgencia hoy, pero es **deuda técnica que cobra interés** — cada mes que pasa sin unificarlo, cuesta un poco más arreglarlo, porque ambas copias siguen evolucionando por separado.

**Solución práctica:** no es urgente resolverlo ya, pero vale la pena hacerlo la próxima vez que toques cualquiera de las dos pantallas: extraer la parte común (los KPIs, los gráficos) a un componente compartido que ambas páginas usen, dejando solo las diferencias reales (que Consejo no tiene ciertas acciones) como la parte que sí varía.

---

## 6. Operación para una sola persona

### 6.1 Todo pasa por ti — y eso, hoy, es lo correcto

**Observación (no es un problema a arreglar):** la creación de conjuntos, la atención de soporte, la fijación de precios y las decisiones de suspender/reactivar están **centralizadas exclusivamente en el Super Admin** (tú). No hay roles intermedios, ni colas de trabajo, ni asignación entre "agentes." Para un negocio de una sola persona, esto es exactamente lo que debe ser — construir un sistema de roles de soporte, aprobaciones o turnos sería sobre-ingeniería pura hoy: complejidad que pagarías en tiempo de mantenimiento sin ningún beneficio real, porque no hay nadie más operando el negocio.

**Dónde sí vale la pena aligerar la carga (sin agregar estructura corporativa):** los dos hallazgos que si reducen tu carga operativa real sin añadir complejidad son los de las secciones 3.1 (autoservicio para nuevos conjuntos) y 4.1 (avisos automáticos de vencimiento) — ambos te sacan del camino crítico de tareas repetitivas (dar de alta, avisar vencimientos) para que tu tiempo se concentre en lo que de verdad requiere tu criterio: resolver casos particulares, hablar con clientes, y decidir precios.

---

## Lo que ya está bien resuelto (no lo toques)

Para que el esfuerzo se concentre en lo anterior y no se disperse "mejorando" cosas que ya funcionan:

- La validación de rangos de precio (sin solapes, monotonía, dentro de topes) ya es robusta y evita que termines con una tabla de precios contradictoria por error.
- La protección de "siempre debe quedar al menos un ADMIN activo" ya está resuelta de forma segura ante condiciones de carrera.
- La idempotencia de los pagos de Mercado Pago (un reintento de webhook no duplica cobros) ya está bien manejada.
- El manejo de archivos/evidencias (nunca exponer la URL real, validar el tipo de archivo por contenido y no solo por extensión) ya sigue buenas prácticas de seguridad sin complejidad innecesaria.
- La regla de "vencida"/SLA ya está unificada en un solo lugar del código, consumida igual por reportes y analítica.
