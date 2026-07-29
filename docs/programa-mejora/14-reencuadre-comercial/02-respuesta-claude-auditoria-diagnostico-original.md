# FASE R0 — Informe final: reencuadre contra el diagnóstico original del negocio

> Auditoría de solo lectura. No se modificó código, schema, migraciones, UI, servicios ni configuración. No se ejecutaron pruebas, Prisma, typecheck ni lint. No se revisó Git/rama/HEAD/staged (excepto lo estrictamente necesario para localizar el diagnóstico de consultoría de julio 2026, referenciado desde `docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md`, que hoy solo existe en el historial de Git — commit `3bda390` — porque el archivo fue borrado del working tree sin commitear; se citó su contenido como evidencia histórica, sin restaurarlo).

---

## 1. Resumen ejecutivo

El producto técnico está considerablemente más maduro que el negocio que lo rodea. Multi-tenancy, autorización, PQRS, invitaciones, cuenta global y billing del SaaS están auditados y asegurados en fases previas (06 a 10), con suites de prueba reales contra PostgreSQL. Reservas (Fase 8A) y Pagos de residentes (Fase 9A) están completos y probados, pero **nadie los ha usado todavía en un conjunto real** — son Premium construido antes de validar demanda, exactamente el patrón de "producto sobreconstruido" que señala el diagnóstico original.

La revisión técnica de esta fase confirma que los bloqueantes reales para los primeros tres pilotos **no están en la infraestructura pesada** (multi-tenant, pagos, auditoría, idempotencia — todo eso ya es sólido) sino en un puñado de puntos concretos y baratos de cerrar: identidad legal vacía en los documentos públicos, un flujo de PQRS 100% rígido y sin ninguna variación por conjunto, ausencia total de notificación cuando el pago del propio SaaS se aprueba o rechaza, imposibilidad de exportar datos o reactivar un conjunto cancelado desde la UI, y un modelo de soporte donde cualquier residente de cualquier conjunto llega directo al fundador sin que el ADMIN del conjunto se entere siquiera de que existe el ticket.

Ninguno de estos cinco puntos requiere una reconstrucción — todos reutilizan infraestructura que ya existe (el outbox durable de notificaciones, el mecanismo de pago simulado/cortesía, las consultas ya tenant-scoped). El veredicto de esta fase es **REQUIERE CIERRE TÉCNICO ACOTADO**: no se necesita más ingeniería de plataforma, se necesita cerrar esos cinco puntos y, sobre todo, hacer el trabajo comercial no técnico (cliente ideal, precio de piloto, guion, contrato) que hoy simplemente no existe en ninguna forma, ni en código ni fuera de él.

---

## 2. Matriz del diagnóstico original

| # | Punto | Estado |
|---|---|---|
| 1 | Producto sobreconstruido | **PARCIAL** |
| 2 | Flujo PQRS demasiado adaptado a un conjunto | **ABIERTO** |
| 3 | Reglas excesivamente rígidas | **PARCIAL** |
| 4 | Soporte directo a residentes | **ABIERTO** |
| 5 | Cliente ideal insuficientemente definido | **NO REQUIERE CÓDIGO** |
| 6 | Precio basado únicamente en unidades | **POSPUESTO HASTA VALIDACIÓN** |
| 7 | Necesidad de paquetes comerciales | **NO REQUIERE CÓDIGO** |
| 8 | Costo de implementación | **NO REQUIERE CÓDIGO** |
| 9 | Trial automático de 15 días | **CERRADO** |
| 10 | Piloto guiado de 30 días | **PARCIAL** |
| 11 | Fricción de Mercado Pago | **PARCIAL** |
| 12 | Alternativas de transferencia y pago manual | **PARCIAL** |
| 13 | Divergencia del periodo de gracia | **CERRADO** |
| 14 | Documentos legales incompletos | **ABIERTO** |
| 15 | Retención y eliminación de datos | **POSPUESTO HASTA VALIDACIÓN** |
| 16 | Exportación al cancelar | **ABIERTO** |
| 17 | Procedimiento de cancelación | **PARCIAL** |
| 18 | Notificaciones declaradas pero no operativas | **ABIERTO** |
| 19 | Estado legacy `PENDING_PAYMENT` | **PARCIAL** |
| 20 | Propuesta de valor basada en resultados | **NO REQUIERE CÓDIGO** |
| 21 | Tres pilotos reales | **NO REQUIERE CÓDIGO** |
| 22 | Métricas correctas para pilotos | **PARCIAL** |
| 23 | Horas de soporte por cliente | **NO REQUIERE CÓDIGO** |
| 24 | Operación acompañada para los primeros clientes | **NO REQUIERE CÓDIGO** |

### Evidencia detallada

```text
1. Producto sobreconstruido
Estado: PARCIAL
Evidencia:
- Módulos completos y probados existen para PQRS, multi-tenancy, invitaciones,
  cuenta global, billing del SaaS, Reservas (Fase 8A, 61 pruebas) y Pagos de
  residentes (Fase 9A, 61 pruebas) — todo antes de que exista un solo conjunto
  pagando fuera de pruebas.
- prisma/schema.prisma: 27 modelos de negocio activos.
Riesgo: cada módulo Premium ya construido es superficie de mantenimiento y de
soporte antes de saber si algún piloto lo va a usar.
Acción pendiente: ninguna de código — congelar construcción nueva (ya
instruido explícitamente en el prompt de esta fase) y no ampliar Reservas/Pagos
hasta validar con los tres pilotos.
Requiere código: No.
```

```text
2. Flujo PQRS demasiado adaptado a un conjunto
Estado: ABIERTO
Evidencia:
- src/app/api/pqrs/[id]/route.ts: el grafo de transiciones de fase es una
  constante literal en el handler (`validNextFase = {0:[1],1:[2,3],2:[4],
  3:[4],4:[5]}`), no una configuración leída de base de datos.
- La ruta INSUMOS (fase 2) vs PROVEEDOR (fase 3) es obligatoria y exclusiva
  para todo tenant, sin ninguna forma de omitirla.
- No existe ningún campo en Tenant/PlatformSetting que permita a un conjunto
  saltarse esta distinción — contrasta con CommonArea (prisma/schema.prisma),
  que sí es 100% configurable por tenant.
Riesgo: si alguno de los tres pilotos reales no opera con la lógica exacta de
"insumos vs. proveedor" en 5 fases, el producto le queda literalmente
inservible para gestión de PQRS de mantenimiento, no solo incómodo.
Acción pendiente: un interruptor mínimo por conjunto que permita saltar
fase 2/3 (ir de fase 1 directo a fase 4) para conjuntos sin ese proceso —
ver bloqueante técnico #2.
Requiere código: Sí (esfuerzo medio, ver §3).
```

```text
3. Reglas excesivamente rígidas
Estado: PARCIAL
Evidencia:
- Edición de descripción de PQRS: una sola vez, solo antes de "primer
  contacto" (src/app/api/pqrs/[id]/route.ts:145-163).
- faseTipo (INSUMOS/PROVEEDOR): inmutable una vez fijado
  (src/app/api/pqrs/[id]/route.ts:378-383).
- Bloque/apto de una PQRS ya creada: no editable nunca, es una foto fija
  tomada al crear (no hay ninguna ruta que lo modifique).
- Comprobación de fotos duplicadas: no existe ningún campo o endpoint de
  "marcar como duplicada" en todo el dominio de PQRS.
- Borrado de evidencia mal cargada: solo ADMIN puede eliminar una PqrsFoto
  (DELETE /api/pqrs/[id]/fotos/[fotoId], solo rol ADMIN); el propio residente
  que la subió por error no puede retirarla.
Riesgo: parte de esta rigidez es una decisión de diseño defendible (trazabilidad,
anti-abuso); pero la combinación de "nunca se puede corregir bloque/apto de una
PQRS ya radicada" + "no hay forma de marcar/asociar duplicados" sí puede generar
fricción real de soporte con los primeros clientes reales.
Acción pendiente: no construir un editor libre (explícitamente descartado por
el prompt); evaluar durante los pilotos si esta rigidez realmente molesta antes
de tocarla.
Requiere código: No por ahora — POSPUESTO HASTA VALIDACIÓN en la práctica,
aunque el punto en sí se marca PARCIAL porque ya hay evidencia clara del
comportamiento actual.
```

```text
4. Soporte directo a residentes
Estado: ABIERTO
Evidencia:
- src/app/api/support-tickets/route.ts: cualquier rol que no sea SUPER_ADMIN
  puede crear un ticket (ADMIN, CONSEJO y RESIDENTE, sin distinción).
- src/domains/support/support-ticket.service.ts: listSupportTicketsForUser
  filtra solo por createdByUserId — ni un ADMIN puede ver los tickets creados
  por los residentes de su propio conjunto.
- src/app/api/platform/support-tickets/route.ts: solo SUPER_ADMIN puede listar
  (sin filtro de tenant) y responder — es la única cola de soporte que existe
  en todo el sistema.
Riesgo: con tres conjuntos reales operando en simultáneo, todo mensaje de
cualquier residente de cualquier conjunto (sea sobre el SaaS o sobre un tema
puramente operativo del conjunto) llega exclusivamente al fundador, y el ADMIN
del conjunto no tiene ninguna visibilidad de que su propio residente escribió
algo. Esto no escala ni siquiera a 3 clientes reales y puede hacer parecer que
el sistema "pierde" mensajes desde el punto de vista del ADMIN.
Acción pendiente: dar visibilidad de solo lectura al ADMIN sobre los tickets
de su propio tenant, sin quitarle al Super Admin la responsabilidad exclusiva
de responder (mismo modelo operativo de una sola persona, solo con
visibilidad compartida) — ver bloqueante técnico #5.
Requiere código: Sí (esfuerzo pequeño-medio, ver §3).
```

```text
5. Cliente ideal insuficientemente definido
Estado: NO REQUIERE CÓDIGO
Evidencia: no hay ningún documento de definición de ICP (perfil de cliente
ideal) en el repositorio ni en la documentación de negocio existente
(Negocio.md describe el producto, no a quién venderlo).
Riesgo: sin ICP, cada conversación de piloto parte de cero.
Acción pendiente: ver §4 (trabajo comercial no técnico).
Requiere código: No.
```

```text
6. Precio basado únicamente en unidades
Estado: POSPUESTO HASTA VALIDACIÓN
Evidencia:
- prisma/schema.prisma (PricingRule): rango de unidades → precio mensual COP,
  único eje de precio.
- src/domains/billing/period.ts:7 — BILLING_PERIOD_DAYS = 30, hardcodeado;
  no existe frecuencia trimestral/anual en ningún modelo.
- Mercado Pago preapproval también hardcodea frequency:1/months
  (src/domains/billing/mercado-pago.service.ts).
Riesgo: es una arquitectura de precio deliberadamente simple, correcta para
validar con 3 pilotos. Ampliarla (por planes, por features, por frecuencia)
antes de saber qué empaquetado realmente se vende sería exactamente el tipo de
sobreconstrucción que esta fase busca evitar.
Acción pendiente: no tocar código de precios hasta tener evidencia de qué
paquete/frecuencia piden los primeros clientes reales.
Requiere código: No todavía.
```

```text
7. Necesidad de paquetes comerciales
Estado: NO REQUIERE CÓDIGO
Evidencia: no existe ningún mecanismo de plan/paquete en el código (ninguna
tabla ni flag de "plan" en prisma/schema.prisma); esta misma fase solo pide
clasificar funcionalidades existentes (§5), no implementar planes.
Riesgo: ninguno técnico; es trabajo de definición comercial puro.
Acción pendiente: ver §5 (clasificación de planes) y §4 (trabajo comercial).
Requiere código: No (por instrucción explícita del prompt: "No implementes
restricciones de planes").
```

```text
8. Costo de implementación
Estado: NO REQUIERE CÓDIGO
Evidencia: la creación de un conjunto (createTenantWithAdmin) y el onboarding
de ADMIN/RESIDENTE (4 y 3 pasos respectivamente, según Negocio.md §6.3) ya
son rápidos técnicamente; el "costo de implementación" real para un piloto es
el tiempo del fundador dando de alta al conjunto a mano (no hay autoservicio
público), lo cual es una decisión operativa, no una limitación de código.
Riesgo: bajo para 3 pilotos (manejable a mano); alto si el negocio crece antes
de tener autoservicio — pero eso está explícitamente pospuesto (congelado).
Acción pendiente: ninguna ahora.
Requiere código: No.
```

```text
9. Trial automático de 15 días
Estado: CERRADO
Evidencia:
- src/domains/billing/billing.service.ts:17 — DEFAULT_TRIAL_DAYS = 15.
- src/domains/platform/tenant-admin.service.ts:124-162 (createTenantWithAdmin)
  — trialEndsAt = addDays(now, DEFAULT_TRIAL_DAYS), tenant nace en TRIAL con
  acceso completo, sin pago.
Riesgo: ninguno — funciona como está documentado.
Acción pendiente: ninguna.
Requiere código: No.
```

```text
10. Piloto guiado de 30 días
Estado: PARCIAL
Evidencia:
- No existe un concepto de "piloto" de primera clase en el producto (ni
  status, ni duración configurable de 30 días).
- Sí existe un mecanismo genérico que lo puede cubrir manualmente:
  grantCourtesyExtension (src/domains/billing/billing.service.ts:240-319)
  permite al Super Admin extender acceso 1-90 días gratis, con motivo
  auditado, expuesto en el panel de Super Admin
  (src/app/api/platform/super-admin/route.ts:171-180).
Riesgo: bajo — el mecanismo alcanza para operar un piloto de 30 días hoy
mismo, a mano, sin cambios de código.
Acción pendiente: ninguna de código; sí definir el guion/duración comercial
del piloto (ver §4).
Requiere código: No para operar el piloto; sería deseable, no urgente, un
concepto de "piloto" explícito más adelante.
```

```text
11. Fricción de Mercado Pago
Estado: PARCIAL
Evidencia (Negocio.md §2.2, confirmado por el análisis de julio 2026, commit
3bda390): con credenciales de producción, Mercado Pago exige que el correo
del ADMIN pagador ya exista como cuenta registrada en Mercado Pago — rechaza
el cobro recurrente si no. Esto es una regla dura de la pasarela, no un bug
del código.
Riesgo: puede bloquear el cobro real a un piloto que no tenga cuenta MP.
Acción pendiente: para los 3 pilotos, usar el mecanismo manual (cortesía o
pago simulado) en vez de forzar el flujo de Mercado Pago mientras se valida
el negocio — ver §4.
Requiere código: No (el rodeo ya existe); sí sería deseable a futuro un canal
de pago sin esta restricción (ver punto 12).
```

```text
12. Alternativas de transferencia y pago manual
Estado: PARCIAL
Evidencia:
- prisma/schema.prisma (PaymentProvider): solo SIMULATED y MERCADO_PAGO —
  no existe un proveedor "transferencia"/"manual" de cara al ADMIN.
- Sí existen, solo para SUPER_ADMIN: grantCourtesyExtension y
  renewSubscriptionWithSimulatedPayment (src/domains/billing/billing.service.ts),
  ambos crean un Payment provider=SIMULATED status=APPROVED — es decir, el
  fundador puede activar/renovar manualmente un conjunto después de recibir
  una transferencia fuera del sistema, con auditoría.
Riesgo: no hay autoservicio de "pagué por transferencia, aquí está el
comprobante" para el ADMIN — todo pasa por que el fundador lo registre a mano.
Acción pendiente: suficiente para 3 pilotos operados directamente por el
fundador; no construir autoservicio de transferencia todavía.
Requiere código: No para el piloto.
```

```text
13. Divergencia del periodo de gracia
Estado: CERRADO
Evidencia:
- src/domains/billing/billing.service.ts:394-399 (getGracePeriodDays) es la
  fuente única, leída tanto por el cron (billing.service.ts:839) como por el
  webhook de Mercado Pago (mercado-pago.service.ts:866) — este último ya NO
  tiene un valor propio hardcodeado (el hallazgo original de julio 2026 ya
  se cerró, confirmado por esta auditoría).
Riesgo residual bajo: src/domains/platform/super-admin.service.ts:27,42
  reimplementa la misma lectura de PlatformSetting en vez de llamar a
  getGracePeriodDays() — hoy produce el mismo valor siempre, pero es
  duplicación de código que podría divergir si alguien cambia la función
  canónica sin tocar esta copia.
Acción pendiente: limpieza menor opcional (no bloqueante) — hacer que
super-admin.service.ts llame a getGracePeriodDays() en vez de reimplementarla.
Requiere código: Opcional, bajo riesgo, no urgente.
```

```text
14. Documentos legales incompletos
Estado: ABIERTO
Evidencia:
- src/lib/legal.ts:11-24 lee NEXT_PUBLIC_LEGAL_NAME/NIT/ADDRESS/EFFECTIVE_DATE
  de variables de entorno; .env.example los define vacíos y el .env real del
  proyecto tampoco los tiene configurados.
- src/components/legal/LegalLayout.tsx:24-26 ya muestra un banner visible al
  usuario: "Este documento es una base de trabajo... completa la identidad
  legal, el NIT, la dirección y la fecha de vigencia... antes de publicar."
Riesgo: alto/inmediato en términos legales-financieros si el primer piloto
paga dinero real sin que el documento de Términos/Pagos identifique con quién
está contratando exactamente.
Acción pendiente: completar las variables de entorno con datos reales (razón
social, NIT, dirección, fecha) antes de cobrar al primer piloto — ver
bloqueante técnico #1.
Requiere código: No (son variables de entorno, no código), pero se marca
ABIERTO porque hoy el dato real no existe y bloquea publicar con seguridad.
```

```text
15. Retención y eliminación de datos
Estado: POSPUESTO HASTA VALIDACIÓN
Evidencia:
- src/app/legal/privacidad/page.tsx solo tiene una frase de política ("el
  conjunto puede solicitar la devolución o eliminación de la información
  conforme al acuerdo aplicable") — no hay ningún job de purga, script de
  retención, ni mecanismo de eliminación automatizado en el código.
Riesgo: bajo con 3 pilotos operados directamente por el fundador (una
eliminación manual vía consola/SQL es viable a esa escala); alto si se
promete una política automática que no existe.
Acción pendiente: no construir automatización todavía; sí evitar prometer en
el contrato de piloto un SLA de eliminación que el producto no puede cumplir
solo.
Requiere código: No por ahora.
```

```text
16. Exportación al cancelar
Estado: ABIERTO
Evidencia: no se encontró ninguna funcionalidad de exportación de datos
vinculada al ciclo de vida de cancelación (el único "Descargar Excel" que
existe es un reporte operativo de PQRS en src/app/admin/reportes/page.tsx,
no un export completo de datos del conjunto).
Riesgo: si un piloto decide no continuar, hoy no hay una forma clara ni
rápida de entregarle sus datos — riesgo de conflicto y de mala percepción,
justo en el peor momento (cuando el cliente ya se está yendo).
Acción pendiente: exportación mínima (CSV/Excel de PQRS + usuarios) accesible
por el Super Admin — ver bloqueante técnico #4.
Requiere código: Sí (esfuerzo pequeño-medio).
```

```text
17. Procedimiento de cancelación
Estado: PARCIAL
Evidencia:
- Cancelación: solo Super Admin, vía updateTenantStatusForSuperAdmin
  (src/app/(protected)/super-admin/page.tsx:900 → API →
  src/domains/platform/tenant-admin.service.ts) — no existe autocancelación
  por el ADMIN del conjunto.
- Reactivación: el backend técnicamente lo permite (la función no valida el
  estado previo del tenant, solo evidencia de pago vigente), pero la UI del
  Super Admin solo muestra el botón de reactivar para conjuntos SUSPENDED, no
  para CANCELLED — confirmado que no hay botón para ese caso.
Riesgo: para 3 pilotos, aceptable que solo el fundador cancele/reactive a
mano; el hueco real es que ni siquiera el fundador tiene un botón para
reactivar un cancelado sin ir directo a la base de datos o a un script.
Acción pendiente: agregar el botón de reactivar también para conjuntos
CANCELLED, reutilizando la función ya existente — ver bloqueante técnico #4.
Requiere código: Sí (esfuerzo pequeño, parte del mismo punto que la
exportación).
```

```text
18. Notificaciones declaradas pero no operativas
Estado: ABIERTO
Evidencia: ver tabla completa en §3 "Notificaciones prometidas". Resumen:
- LICENSE_EXPIRING/LICENSE_SUSPENDED SÍ están operativas (vía el outbox
  durable de facturación, con pruebas reales) — el hallazgo original de julio
  2026 sobre esto ya se cerró.
- PAYMENT_APPROVED (pago del SaaS del propio tenant) está declarado en
  NotificationTypes pero NUNCA se usa — no hay ningún aviso, ni in-app ni por
  correo, cuando el pago de la licencia se aprueba O se rechaza.
- SUPPORT_TICKET_RESPONDED también está declarado y nunca usado como
  constante (aunque la respuesta de un ticket sí notifica por otro camino,
  con un string distinto).
Riesgo: un ADMIN que paga su licencia no recibe ninguna confirmación de que
el pago fue exitoso, ni ningún aviso inmediato si fue rechazado (solo se
entera indirectamente cuando, unos días después, el cron lo mueve a periodo
de gracia y ESA notificación sí le llega). Es una laguna de confianza real
para un negocio que depende de cobrar.
Acción pendiente: conectar el pago aprobado/rechazado del SaaS a la misma
infraestructura durable que ya existe — ver bloqueante técnico #3.
Requiere código: Sí (esfuerzo pequeño).
```

```text
19. Estado legacy PENDING_PAYMENT
Estado: PARCIAL
Evidencia:
- No se usa para crear tenants nuevos (createTenantWithAdmin siempre nace en
  TRIAL) — en ese sentido no es "legacy muerto" que estorbe.
- Pero SÍ es un estado vivo y activamente alcanzable hoy: el motor de
  precedencia de Mercado Pago (src/domains/billing/precedence.ts) mueve un
  tenant a PENDING_PAYMENT cuando existe un preapproval autorizado o pendiente
  sin cobertura de pago/trial real — con lógica de negocio real dependiendo
  de él (cron lo preserva explícitamente, la capa de autorización lo bloquea
  igual que SUSPENDED/CANCELLED).
Riesgo: bajo funcionalmente (está bien manejado), pero la documentación de
negocio (Negocio.md) lo describe como "heredado de una versión anterior", lo
cual es engañoso — no es cruft, sigue siendo lógica viva.
Acción pendiente: aclarar la documentación de negocio para que no se lea como
"ya no se usa" cuando en realidad sí tiene lógica activa dependiendo de él.
Requiere código: No (documentación, no código).
```

```text
20. Propuesta de valor basada en resultados
Estado: NO REQUIERE CÓDIGO
Evidencia: no existe ningún material de propuesta de valor en el repositorio
más allá de la landing (src/app/page.tsx), que describe funcionalidad, no
resultados/ROI para el cliente.
Riesgo: sin esto, cada conversación de venta parte de "qué hace" en vez de
"qué te resuelve".
Acción pendiente: ver §4.
Requiere código: No.
```

```text
21. Tres pilotos reales
Estado: NO REQUIERE CÓDIGO
Evidencia: no hay evidencia de ningún piloto real activo (todos los tenants
encontrados en las pruebas son datos de prueba con prefijos `phaseNN-...`,
limpiados automáticamente por los propios tests).
Riesgo: es el objetivo mismo de esta fase, no un hallazgo técnico.
Acción pendiente: ejecutar los pilotos una vez cerrados los bloqueantes de §3.
Requiere código: No (es una acción comercial).
```

```text
22. Métricas correctas para pilotos
Estado: PARCIAL
Evidencia: el panel de Super Admin ya calcula MRR, churn, ARPU, % conversión
trial→pago, tiempo promedio de cierre de PQRS, distribución de PQRS por tipo,
y conjuntos en riesgo (Negocio.md §3.5, confirmado por la existencia de
src/domains/platform/super-admin.service.ts y el panel
src/app/(protected)/super-admin/page.tsx).
Riesgo: esas métricas son de negocio/financieras, correctas para operar la
plataforma, pero no miden directamente "éxito del piloto" desde la
perspectiva del cliente (ej. satisfacción del residente, tiempo real ahorrado
al ADMIN) — eso no se mide en ningún lugar hoy.
Acción pendiente: definir 2-3 métricas de éxito de piloto centradas en el
cliente, medibles a mano durante los 3 pilotos (no requiere nueva
instrumentación de código para solo 3 clientes).
Requiere código: No para 3 pilotos (medición manual es suficiente a esa escala).
```

```text
23. Horas de soporte por cliente
Estado: NO REQUIERE CÓDIGO
Evidencia: no hay ningún tracking de tiempo de soporte en el código (los
tickets no tienen campo de tiempo invertido).
Riesgo: sin esto, no se puede calibrar si el precio cubre el costo real de
atención de un solo operador.
Acción pendiente: medir a mano (hoja de cálculo) durante los pilotos.
Requiere código: No.
```

```text
24. Operación acompañada para los primeros clientes
Estado: NO REQUIERE CÓDIGO
Evidencia: es una decisión operativa (cuánto acompañamiento humano dar a cada
piloto), no una función del producto. Se relaciona con el hallazgo #4
(soporte) en que hoy el modelo de soporte centralizado en el fundador es,
según el propio análisis de julio 2026 (§6.1), la decisión correcta para un
operador único — la brecha real no es "quién responde" sino "qué visibilidad
tiene el ADMIN del conjunto" (ver punto 4).
Riesgo: bajo, siempre que el fundador planifique activamente acompañar a los
3 primeros clientes en vez de asumir que el producto se explica solo.
Acción pendiente: plan de acompañamiento manual (ver §4).
Requiere código: No.
```

---

## 3. Revisión técnica de bloqueantes originales

### Periodo de gracia

Una sola fuente de verdad real: `getGracePeriodDays()` en `src/domains/billing/billing.service.ts:394-399`, que lee `PlatformSetting{key:"gracePeriodDays"}` con fallback `DEFAULT_GRACE_PERIOD_DAYS = 5`. La consumen tanto el cron (`billing.service.ts:839`) como el webhook de Mercado Pago (`mercado-pago.service.ts:866`) — el hallazgo original de julio 2026 (dos fuentes divergentes) **ya está cerrado**. Único resto de deuda: `src/domains/platform/super-admin.service.ts:27,42` reimplementa la misma lectura en vez de reutilizar la función, sin que hoy produzca un valor distinto — limpieza opcional, no bloqueante.

### Soporte

- **Quién puede abrir tickets**: cualquier rol autenticado excepto `SUPER_ADMIN` (`src/app/api/support-tickets/route.ts`) — ADMIN, CONSEJO y RESIDENTE, sin distinción de categoría obligatoria por rol.
- **¿RESIDENTE contacta directo al proveedor?** Sí, literalmente directo: el único que puede responder cualquier ticket es el Super Admin (`src/app/api/platform/support-tickets/route.ts`, gate `role !== "SUPER_ADMIN"` → 403), sin ningún tenant-ADMIN en el medio.
- **¿Separación soporte operativo del conjunto vs. soporte técnico del SaaS?** No existe ninguna. Es una sola cola no diferenciada: mismo modelo `SupportTicket`, mismas 4 categorías genéricas para los tres roles, y — el hallazgo más importante — **ni siquiera el ADMIN de un conjunto puede ver los tickets que sus propios residentes crean** (`listSupportTicketsForUser` filtra estrictamente por `createdByUserId`). El PQRS module sí es el canal correcto para quejas operativas del conjunto (ascensor dañado, etc.), pero nada impide que un residente use el formulario de "Ayuda" para eso en su lugar, y en ese caso llegaría directo al fundador en vez de a su propio ADMIN.

### Correcciones auditadas

| Campo | ¿Corregible hoy con trazabilidad? |
|---|---|
| Descripción de PQRS | Sí, pero solo el residente creador, una sola vez, y solo antes de "primer contacto" (`src/app/api/pqrs/[id]/route.ts:145-163`), con `HistorialPqrs` + `AuditAction.PQRS_UPDATED`. Ningún ADMIN puede editarla nunca. |
| Bloque/apartamento (de una PQRS ya creada) | **No** — es una foto fija tomada al crear la PQRS; corregir el perfil del residente (`TenantMembership.bloqueAptoEditado`, una vez) no actualiza retroactivamente ninguna PQRS ya radicada. |
| Evidencia (`PqrsFoto`) | Solo eliminación, solo por ADMIN (`DELETE /api/pqrs/[id]/fotos/[fotoId]`), con auditoría. Sin reemplazo/redacción. El residente que subió el archivo por error no puede autoeliminarlo. |
| Duplicados | No existe ningún mecanismo de fusión/vínculo/marca de duplicado en todo el dominio de PQRS. |
| Ruta o flujo (`faseTipo`) | Inmutable una vez fijado (`src/app/api/pqrs/[id]/route.ts:378-383`), sin excepción administrativa. |
| Datos sensibles cargados por error | Solo remedio: ADMIN borra la foto/evidencia (ver arriba); no hay redacción parcial ni forma de que el propio residente la retire. |

### Flujos PQRS

El producto **no** soporta variación por conjunto de ningún tipo — ni flujo simple, ni flujo de mantenimiento alternativo, ni ninguna configurabilidad limitada. El grafo de 5 fases + bifurcación INSUMOS/PROVEEDOR está hardcodeado como constante literal en `src/app/api/pqrs/[id]/route.ts`, idéntico para todo tenant, sin ningún campo de configuración en `Tenant`/`PlatformSetting` que lo module (a diferencia de `CommonArea`, que sí es enteramente configurable por tenant). No se recomienda un editor libre — la solución mínima es un interruptor booleano por conjunto que permita ir de fase 1 directo a fase 4 (saltando la distinción insumos/proveedor) para el conjunto que no la necesite.

### Pagos del SaaS

- **Mercado Pago**: sí, único canal de cobro real, cobro recurrente mensual únicamente (`BILLING_PERIOD_DAYS = 30` hardcodeado, `frequency_type: "months"` hardcodeado en la solicitud de preapproval). No hay trimestral ni anual.
- **Transferencia / pago manual**: no existe como flujo de autoservicio del ADMIN; sí existen dos mecanismos exclusivos de Super Admin que lo cubren operativamente: `grantCourtesyExtension` (cortesía, 1-90 días, gratis, auditada) y `renewSubscriptionWithSimulatedPayment` (renovación a precio completo, simulada). Ambos crean un `Payment` real en la base de datos con `provider: SIMULATED`, `status: APPROVED`.
- **Pago trimestral/anual**: no existe en ningún modelo ni en la integración con Mercado Pago.
- **Activación manual controlada**: sí, ambos mecanismos de Super Admin cumplen este rol hoy, con auditoría.

### Notificaciones prometidas

| Evento | In-app | Email | Durable | Probado |
|---|---:|---:|---:|---:|
| Invitación | Sí | Sí | No | Parcial (solo helpers unitarios, no el flujo real) |
| Nueva PQRS | Sí (a ADMIN) | Sí (si `notifyNewPqrsEmail`) | No | No |
| Confirmación PQRS (al residente) | No | Sí | No | No |
| Cambio de estado | Sí | Sí (primer contacto y cierre) | No | No (solo llamadas unitarias directas) |
| Aviso de vencimiento SaaS | Sí (como entrada a gracia) | Sí | **Sí** | **Sí** |
| Pago SaaS aprobado | **No** | **No** | — | — |
| Pago SaaS rechazado | **No** | **No** | — | — |
| Periodo de gracia | Sí | Sí | **Sí** | **Sí** |
| Suspensión | Sí | Sí | **Sí** | **Sí** |
| Recuperación de contraseña | No (por diseño, flujo no autenticado) | Sí | No | Parcial (se prueba el token, no el envío) |

Nota importante: `NotificationTypes.LICENSE_EXPIRING`/`LICENSE_SUSPENDED` como *constante* nunca se referencian directamente, pero sus valores de cadena SÍ se usan por otra vía (el outbox de facturación construye el string directamente) — es decir, esas dos SÍ están operativas pese a la declaración muerta. En cambio `PAYMENT_APPROVED` y `SUPPORT_TICKET_RESPONDED` (como constante) están genuinamente sin ningún uso real para el caso de pago del propio SaaS.

### Cancelación y salida

| Capacidad | ¿Existe? |
|---|---|
| Detener renovación | Sí — el ADMIN puede desactivar auto-renovación desde Licencias y pagos. |
| Cancelar licencia | Solo Super Admin, desde su panel; no hay autocancelación por el ADMIN. |
| Fecha efectiva | Se registra `cancelledAt`, pero no hay un concepto de "cancelación programada a futuro" — es inmediata. |
| Exportar información | **No existe.** |
| Periodo de conservación | Solo una frase de política legal, sin mecanismo. |
| Eliminación | No hay job/endpoint de purga. |
| Archivos | Sin mecanismo de limpieza vinculado a cancelación. |
| Auditoría | Sí — la cancelación queda en `AuditLog` como cualquier otra acción del Super Admin. |
| Reactivación | El backend lo permitiría técnicamente, pero **no hay botón en la UI** para reactivar un tenant `CANCELLED` (solo existe para `SUSPENDED`). |

### Legacy

- **`PENDING_PAYMENT`**: no es cruft — es un estado vivo, alcanzado por el motor de precedencia de Mercado Pago cuando hay un preapproval sin cobertura real, con lógica de cron y autorización dependiendo de él activamente. Deuda aceptable (solo la documentación de negocio lo describe engañosamente como "heredado").
- **Columnas legacy de `User`** (`role`, `tenantId`, `bloque`, `apto`): el propio schema las documenta como transitorias ("se eliminarán en una fase posterior", `prisma/schema.prisma:114-116`). Ningún camino de autorización o lógica de negocio las lee como fuente de verdad — solo `User.role` se sigue consultando, y únicamente para distinguir `SUPER_ADMIN` (rol global sin tenant). Sí se siguen escribiendo por compatibilidad transitoria explícita al aceptar una invitación (`invitation.service.ts:537-541`, comentario propio: "La autorización nueva no consulta estos campos"). Deuda aceptable, no requisito antes de producción — es un doble-escritura inofensivo, no un riesgo de seguridad (ya auditado y cerrado en fases 06-10).
- **Alias de sesión**: `session.user.tenantId`/`selectedTenantId`/`bloque`/`apto` en el JWT están poblados desde `TenantMembership`, no desde las columnas legacy de `User`, pese a compartir nombre — no hay confusión funcional real, solo de nomenclatura.
- **Otros campos transitorios detectados**: `PqrsFoto.url` (reemplazado por `storagePath`, con manejo explícito de "evidencia heredada ya no disponible" para registros viejos) y `Pqrs.evidenciaArchivoData/evidenciaArchivoUrl` (reemplazados por `evidenciaArchivoPath`, con limpieza explícita al subir nueva evidencia). Ambos son deuda aceptable, bien manejada, no requieren acción antes de producción.

---

## 4. Trabajo comercial y operativo (no técnico)

Ninguno de estos puntos debe programarse como módulo del producto. Ninguno tiene hoy ni un borrador en el repositorio:

- **Cliente ideal**: no definido — falta perfilar tipo de conjunto (tamaño, ciudad, nivel de organización actual) donde el producto encaja mejor.
- **Paquetes**: no definidos — usar la clasificación de §5 como punto de partida, no como implementación.
- **Precios**: el motor técnico de precio-por-unidades ya existe y sirve para el piloto; falta decidir la tarifa/paquete concreto de piloto (posiblemente cortesía total via `grantCourtesyExtension`).
- **Implementación**: falta un checklist operativo de alta de conjunto (qué le pides al cliente, en qué orden, quién hace qué).
- **Descuentos**: no definidos.
- **Anualidad**: no soportada técnicamente ni definida comercialmente — no es necesaria para el piloto.
- **Comisión**: no aplica hoy (no hay canal de referidos/afiliados).
- **Piloto**: falta definir duración exacta, expectativas mutuas, y qué constituye éxito.
- **Propuesta**: falta un documento de propuesta de valor orientado a resultados (no a features).
- **Contrato**: falta una plantilla mínima de aceptación de piloto (aunque sea informal) que cubra al menos cancelación/datos, dado que hoy "el contrato individual" al que remiten los documentos legales no existe como tal.
- **Tratamiento de datos**: falta decidir y comunicar, en lenguaje simple, qué pasa con los datos del conjunto durante y después del piloto.
- **Política de retención**: falta redactar (no automatizar) una regla simple y honesta sobre cuánto tiempo se guardan los datos tras cancelar.
- **Proceso de cancelación**: falta un procedimiento escrito de qué hacer, paso a paso, cuando un piloto quiere salir (mientras no haya autoservicio).
- **Capacitación**: falta un material mínimo de onboarding para el ADMIN de cada conjunto piloto (más allá del onboarding in-app de 4 pasos).
- **Métricas**: falta decidir 2-3 métricas de éxito de piloto centradas en el cliente (no solo las financieras que ya calcula el panel de Super Admin).
- **Guion comercial**: no existe ningún guion de venta/pitch para acercarse a los tres candidatos a piloto.

---

## 5. Clasificación de planes

Clasificación de lo que **existe hoy en el código**, sin implementar ninguna restricción de plan (instrucción explícita del prompt).

### Producto base potencial
PQRS (creación, 3 estados, evidencia, historial), los 4 roles (SUPER_ADMIN/ADMIN/CONSEJO/RESIDENTE), CONSEJO de solo lectura, evidencias en Storage privado, trazabilidad (`AuditLog`, `HistorialPqrs`), notificaciones esenciales de PQRS (creación/cambio de estado/cierre) e invitaciones, reportes básicos (KPIs + gráficos ya presentes en `admin/reportes`), configuración inicial (onboarding ADMIN/RESIDENTE).

### Gestión
Múltiples administradores (ya soportado vía invitaciones — no hay límite de ADMIN por conjunto), auditoría por categoría (ya filtrable por PQRS/Usuarios/Licencia), reportes avanzados con exportación Excel/PDF (ya existe en `admin/reportes`, técnicamente no diferenciado de "básico" hoy), el flujo de mantenimiento INSUMOS/PROVEEDOR de 5 fases (candidato natural a Gestión una vez exista el interruptor de simplificación del bloqueante #2 — hoy es parte indivisible del producto base), multi-conjunto por usuario (el modelo `TenantMembership` ya soporta que un mismo usuario tenga membresías activas en varios tenants — usado hoy de forma incidental, no como feature comercial).

### Premium
Reservas y zonas comunes (Fase 8A, completo), Pagos de residentes — cuotas, importación Excel, comprobantes (Fase 9A, completo). Futuros documentos, futuros comunicados y cualquier funcionalidad adicional quedan explícitamente congelados por esta fase.

### Portafolio
**No construido.** La capacidad técnica de base existe (un usuario puede tener membresías en múltiples tenants), pero no hay ninguna vista consolidada multi-conjunto, ni panel diferenciado para una empresa administradora que gestione varios conjuntos a la vez, ni precio negociado — es la categoría con menos código real detrás de las cuatro.

---

## 6. Qué congelar

Confirmado por el propio prompt de esta fase, sin excepciones encontradas durante la auditoría:

- Documentos generales, comunicados, directorio.
- Nuevos módulos, nuevas integraciones.
- Nuevas funcionalidades Premium (cualquier ampliación de Reservas/Pagos de residentes más allá de lo ya construido).
- Autoservicio público de alta de conjuntos (sugerido en el análisis de julio 2026, pero es inversión de crecimiento, no de piloto).
- Restricciones de plan/paywall en código — clasificar (ya hecho en §5) sí, implementar no, hasta tener paquetes comerciales definidos con clientes reales pagando.
- Editor de flujo PQRS configurable en profundidad — la solución al bloqueante #2 es un interruptor mínimo, no un motor de flujos.
- Portafolio multi-conjunto para empresas administradoras.
- Pago trimestral/anual, comisiones, descuentos.
- Automatización de retención/eliminación de datos.
- Unificación de código duplicado entre reportes de ADMIN/CONSEJO (deuda técnica real pero de bajo riesgo, no urgente).

---

## 7. Plan antes / durante / después de pilotos

### Hacer antes del primer piloto

1. Completar identidad legal real (razón social, NIT, dirección, fecha de vigencia) en las variables de entorno y redesplegar.
2. Notificación durable de pago SaaS aprobado/rechazado al ADMIN (reutilizando el outbox existente).
3. Interruptor mínimo por conjunto para saltar la distinción INSUMOS/PROVEEDOR en PQRS.
4. Visibilidad de solo lectura del ADMIN sobre los tickets de soporte de su propio conjunto.
5. Exportación mínima (CSV/Excel) de PQRS y usuarios de un conjunto, para el Super Admin.
6. Botón de reactivación para conjuntos `CANCELLED` en el panel de Super Admin.
7. Redactar una política de cancelación/reembolso concreta con números reales (no remitir a "el contrato").
8. Definir cliente ideal y confirmar los tres candidatos reales a piloto.
9. Definir precio/duración/expectativas del piloto (aprovechando `grantCourtesyExtension`).
10. Preparar una plantilla mínima de aceptación de piloto (cancelación + datos).

### Hacer durante los tres pilotos

1. Usar cortesía/pago simulado para activar/renovar mientras se evita la fricción de Mercado Pago.
2. Medir a mano horas de soporte por cliente.
3. Registrar en auditoría cualquier corrección hecha directamente en base de datos.
4. Observar si los 3 pilotos realmente necesitan la distinción INSUMOS/PROVEEDOR o si el interruptor simple basta.
5. Usar las métricas ya existentes en Analítica de Super Admin como línea base real.
6. Confirmar si el modelo de soporte centralizado en el fundador ya empieza a doler a esta escala.
7. Verificar proactivamente que el correo del ADMIN pagador tiene cuenta de Mercado Pago antes de pedirle pagar.
8. Recoger feedback sobre si Reservas/Pagos de residentes (Premium) aportan valor real o el interés está solo en PQRS.
9. Vigilar de cerca comprobantes/importaciones de pagos de residentes en cualquier piloto que los use (funcionalidad sin uso real todavía).
10. Documentar cualquier caso límite nuevo para decidir si pertenece a Producto base o a Gestión.

### Posponer hasta tener evidencia de pago

Documentos generales, comunicados, directorio; nuevos módulos e integraciones; nuevas funcionalidades Premium; editor de flujo PQRS configurable en profundidad; portafolio multi-conjunto para empresas administradoras; autoservicio público de alta de conjuntos; pago trimestral/anual, comisiones, descuentos por volumen; automatización de retención/eliminación de datos; restricciones de plan/paywall en código; unificación de reportes ADMIN/CONSEJO duplicados; cualquier ampliación de Reservas o Pagos de residentes más allá de lo ya construido.

---

## 8. Veredicto

**`REQUIERE CIERRE TÉCNICO ACOTADO`**

La plataforma no está sobreconstruida en su núcleo (PQRS, multi-tenancy, autorización, billing) — está sólidamente construida y probada. El riesgo real de "sobreconstrucción" está en Reservas y Pagos de residentes, ya completos sin validación de mercado, correctamente congelados por esta fase. Los cinco puntos técnicos identificados en §3/§7 son pequeños, reutilizan infraestructura existente, y ninguno exige diseño nuevo — son el único trabajo de código necesario antes del primer piloto real. El resto del camino a "oferta vendible, implementable y operable por una sola persona" es trabajo comercial que hoy no existe en ninguna forma, ni en código ni fuera de él, y que ningún cierre técnico puede sustituir.

No se hizo commit. No se modificó el repositorio fuera de los documentos 01 y 02 de esta fase. No se inició otra fase.
