FASE 0A — Diagnóstico y línea base del repositorio
Todo lo afirmado abajo proviene de lectura estática del código y de comandos no destructivos ejecutados en esta sesión (tsc, npm test, npm run lint, lectura de git status, schema.prisma, migraciones). Ningún archivo fue modificado, ninguna migración se aplicó, no se ejecutó db:seed/db:migrate/db:studio, no hubo commits.

1. Resumen ejecutivo
PQRS Services es una aplicación Next.js 14.2.35 monolítica (no monorepo) con Prisma/PostgreSQL, autenticación propia vía NextAuth v5-beta (CredentialsProvider), e integraciones artesanales (fetch directo, sin SDK) a Mercado Pago, Resend y Supabase Storage. El código está en buen estado objetivo: tsc --noEmit limpio, npm run lint sin warnings, 35/35 tests pasando. La arquitectura multi-tenant está bien defendida en las 37 rutas API revisadas (ninguna sin guard de sesión/rol; ninguna query de dominio con ID de cliente sin tenantId). La autorización por rol, sin embargo, está duplicada manualmente en ~29 archivos en vez de centralizada, y el bloqueo por licencia/tenant suspendido solo se aplica a nivel de página para /super-admin — el resto de roles solo lo sufren cuando llaman a la API. La facturación (trial 15 días, gracia configurable, renovación 30 días) tiene una fuente de verdad real y unificada para el período de gracia (contrario a lo que sugería la documentación previa), pero sí hay un número mágico (BILLING_PERIOD_DAYS = 30) duplicado literalmente en dos archivos, y una función completa (createInitialSubscriptionForTenant) que es código muerto. El módulo de soporte y la integración de Mercado Pago no tienen ningún test, y el único test que toca Resend nunca ejercita el camino de éxito real. Hay un problema de encoding real y verificado (mojibake) en varios mensajes de usuario dentro de pqrs/[id]/route.ts. El repositorio tiene ~45 archivos docs/*.md borrados en el working tree sin commitear, y una carpeta nueva sin trackear docs/programa-mejora/ que contiene el documento de negocio ya migrado — se reporta como hallazgo de higiene de Git, sin tocarlo.

2. Estado de Git
Rama actual: master, sincronizada con origin/master (sin commits locales pendientes de push detectados más allá de lo ya reportado en sesiones anteriores).
Working tree: ~45 archivos bajo docs/ aparecen como eliminados (D, no staged, no comiteados) — incluyen Negocio.md, docs/CODING_RULES.md, docs/KNOWN_ISSUES.md, docs/BILLING.md, docs/MULTITENANT.md, toda la carpeta docs/auditoria/, docs/TASKS/*, docs/superpowers/*, entre otros. Son recuperables vía git show HEAD:<ruta> (confirmado al recuperar docs/KNOWN_ISSUES.md para contrastar el hallazgo de mojibake).
Carpeta nueva sin trackear: docs/programa-mejora/ con 00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md (354 líneas, documento de negocio de una sesión anterior) y 01-linea-base/ (vacía — presumiblemente el destino esperado de este informe, pero no se creó ningún archivo ahí por instrucción explícita del usuario).
No se alteró ninguno de estos archivos ni carpetas durante esta sesión.
3. Stack y estructura
Aspecto	Detalle	Evidencia
Framework	Next.js 14.2.35, App Router	package.json
Lenguaje	TypeScript 5, strict: true	tsconfig.json:6
Gestor de paquetes	npm (hay package-lock.json; no hay pnpm/yarn lockfile)	raíz del repo
Base de datos	PostgreSQL (Supabase-hosted)	prisma/schema.prisma:6-8
ORM	Prisma ^5.22.0	package.json
Auth	NextAuth v5-beta, CredentialsProvider propio (bcrypt), JWT sessions	src/lib/auth.ts
Integraciones	Mercado Pago, Resend, Supabase Storage — todas vía fetch() HTTP directo, sin SDK oficial (ninguna está en package.json)	src/lib/email.ts, src/lib/storage.ts, src/domains/billing/mercado-pago.service.ts
Despliegue	Vercel; 1 cron (overdue-rules, diario 07:00 UTC)	vercel.json
Estructura	App única, no monorepo — src/app (rutas), src/domains (lógica de negocio por subdominio), src/lib (transversal), src/components (UI/shells)	listado de carpetas
4. Scripts disponibles
Script	Seguro en esta sesión	Nota
npm run lint	✅ Ejecutado — 0 warnings/errors	
npm test (tsx --test tests/**/*.test.ts)	✅ Ejecutado — 35/35 pasando	Corre contra la BD real apuntada por DATABASE_URL del .env (no hay TEST_DATABASE_URL separada), con limpieza propia por RUN_ID al final de cada archivo
npx tsc --noEmit	✅ Ejecutado — 0 errores	
npm run build / release:check	No ejecutado en esta sesión (corre prisma generate, no destructivo per se, pero se optó por no correrlo para no arriesgar side-effects no previstos)	Reportado como validación pendiente
npm run db:seed	❌ No ejecutado — escribe en la BD	Prohibido por instrucción
npm run db:migrate / db:migrate:deploy	❌ No ejecutado — aplica migraciones	Prohibido por instrucción
npm run db:studio	❌ No ejecutado — abre acceso interactivo a la BD	Prohibido por instrucción
npm run dev / start	No ejecutado — requeriría servidor vivo y probablemente conexión real a servicios externos	Reportado como validación pendiente
5. Mapa de arquitectura
Flujo de datos dominante: página 'use client' → fetch() a src/app/api/**/route.ts → valida sesión/rol/tenant (manualmente, repetido por archivo) → llama función en src/domains/**/*.service.ts → Prisma. No se usan Server Actions ni componentes servidor que toquen Prisma directamente desde la mayoría de páginas. El middleware (src/middleware.ts) opera en Edge sobre la cookie JWT cruda (getToken(), sin Prisma) y solo decide redirecciones por rol/onboarding/cuenta desactivada; el refresco real de role/tenant.status/subscription.status ocurre en el callback jwt() de NextAuth (src/lib/auth.ts:51-77), que sí re-consulta Prisma en cada auth() server-side.

6. Inventario de rutas
Públicas: /, /legal/* (4 páginas), sin protección (esperado).
Auth: /auth/login, /auth/registro (informativa, sin autorregistro real), /auth/olvidar-contrasena, /auth/restablecer-contrasena, /auth/error, /invitacion (token), /cambiar-contrasena (sí protegida por middleware). Existen aliases de compatibilidad (/login, /recuperar-contrasena, /registro/residente) que solo hacen redirect().
Alias de rol server-side (/dashboard, /admin, /pqrs, /reportes, /usuarios): cada uno reimplementa su propio if (session.user.role === X) redirect(...) — 5 archivos con el mismo patrón sin helper compartido.
Super Admin: única ruta dentro del route group (protected), con src/app/(protected)/layout.tsx que aplica bloqueo por licencia/tenant a nivel de página — el único rol que lo tiene a ese nivel.
Admin / Consejo / Residente: protegidas solo por middleware (rol), fuera de (protected) — no heredan el bloqueo de página por licencia; ese bloqueo solo llega vía las llamadas API individuales (getTenantAccessResponse).
APIs (37 archivos route.ts): todas revisadas; ninguna carece de guard de sesión/rol justificado. Rutas públicas por diseño: auth/register (deshabilitada a propósito, siempre 403), auth/forgot-password, auth/reset-password, invitations/accept, webhook de Mercado Pago, NextAuth handler.
Webhooks: POST /api/billing/mercado-pago/webhook — validación HMAC obligatoria (timingSafeEqual), falla cerrado si falta MERCADO_PAGO_WEBHOOK_SECRET.
Cron: GET /api/cron/overdue-rules — protegido por Authorization: Bearer <CRON_SECRET>, fail-closed si falta.
Archivos protegidos: /api/pqrs/[id]/evidencia, /api/pqrs/[id]/fotos/[fotoId] — proxy autenticado, nunca se expone URL directa de Supabase Storage al cliente.
Inconsistencias detectadas: (a) duplicación conceptual entre el flujo de reset de contraseña (VerificationToken, 1h, sin regla de complejidad de password) y el de invitaciones (Invitation, 72h, password 8+ con letra y número) — mismo propósito, políticas distintas; (b) el route group (protected) cubre solo super-admin, arquitectónicamente inconsistente con el resto.

7. Autenticación y permisos
Sesión JWT, maxAge: 12h, updateAge: 1h — decisión documentada en el propio código por la limitación de Prisma en Edge.
El callback jwt() re-lee role, tenantId, isActive, tenant.status, subscription.status en cada invocación server-side — cambios de rol/desactivación se reflejan de inmediato en cualquier página/API que llame auth(); solo el middleware (Edge, sin Prisma) puede operar con hasta 1h de rezago.
Cuentas desactivadas: bloqueadas tanto en authorize() (login) como en middleware (sesión activa) — doble candado.
No existe un requireRole()/withAuth() centralizado. 29 de 37 route.ts repiten manualmente session.user.role !== "X". El único guard reutilizado consistentemente es getTenantAccessResponse() (bloqueo por licencia, 20+ callers).
Invitaciones: token 256-bit, solo se persiste el hash SHA-256, expira en 72h, un solo uso garantizado por updateMany atómico + verificación de count, protegido contra fuga cross-tenant (mensaje genérico si el email ya existe en otro tenant).
Recuperación de contraseña: sí existe (no ausente) — forgot-password/reset-password vía VerificationToken, 1h de expiración, sin verificar isActive antes del reset (inconsistencia menor, impacto bajo porque el login sí lo valida después).
8. Aislamiento multi-tenant
Tenant se obtiene de session.user.tenantId (JWT), validado en cada request server-side vía refreshTenantAccessForUser (relee BD, no confía ciegamente en el JWT).
Revisión exhaustiva de queries con ID de cliente (pqrs/[id], users/[id], invitations/[id], fotos/evidencia): todas combinan el ID recibido con tenantId de sesión antes de tocar la fila. No se encontró ninguna omisión.
pqrsScopeForUser centraliza el where de listados de PQRS, incluyendo el bloqueo explícito de que SUPER_ADMIN no puede usar ese camino.
Operaciones cross-tenant intencionales (Super Admin: listar/crear/editar tenants, cron de mora, cortesías) están protegidas por requireSuperAdmin/role === "SUPER_ADMIN" consistentemente.
Pendiente de prueba manual (no ejecutado, solo señalado): IDOR directo contra pqrs/[id], evidencia, fotos/[fotoId], users/[id]; bypass de firma HMAC del webhook; replay/expiración del token de invitación.
9. Modelo de datos
Modelos principales: Tenant, User, AuditLog, SupportTicket, PricingRule (global, sin tenant), Subscription (1-1 con Tenant), Payment, Pqrs, PqrsFoto, HistorialPqrs, Invitation, Notification, EmailLog, PlatformSetting, más tablas estándar de NextAuth (Account, Session, VerificationToken, probablemente sin uso real dado que solo hay CredentialsProvider).

Datos sensibles bien tratados: User.password (hash bcrypt), Invitation.tokenHash (hash, nunca el token en claro), PlatformSetting.value para claves marcadas isSecret debe empezar con "env:" (nunca guarda el secreto real), validado en código.
Índices ricos por tenantId combinado con otros campos (estado, role, bloque+apto, etc.) en los modelos de mayor volumen (Pqrs, User).
Cascadas: PqrsFoto/HistorialPqrs con onDelete: Cascade desde Pqrs; AuditLog con onDelete: SetNull desde Tenant/User (preserva histórico tras borrado).
Migración más reciente (20260721000100_add_legal_acceptance) coincide exactamente con los campos de aceptación legal presentes hoy en el schema — sin drift detectado entre schema y migraciones.
10. Facturación y licencias
Trial: 15 días exactos, fuente única DEFAULT_TRIAL_DAYS en billing.service.ts, tenant nace en TRIAL (no PENDING_PAYMENT).
Código muerto confirmado: createInitialSubscriptionForTenant en billing.service.ts no tiene ningún caller en todo el repo — el flujo real de alta usa createTenantWithAdmin.
Preapproval de Mercado Pago: recurrencia mensual fija, exige al menos un Payment APPROVED antes de activar (no basta preapproval.status = authorized).
Webhook: idempotente por mercadoPagoPaymentId @unique + upsert; firma HMAC obligatoria y fail-closed.
Renovación: 30 días desde el mayor entre "hoy" y fin del período anterior — misma fórmula, pero constante BILLING_PERIOD_DAYS = 30 duplicada literalmente en billing.service.ts y mercado-pago.service.ts (mismo valor hoy, riesgo de divergencia si se edita solo uno).
Período de gracia: una sola fuente real hoy (getGracePeriodDays(), configurable vía PlatformSetting, default 5 días) — consumida de forma unificada en el cron y en ambos puntos del webhook de Mercado Pago. La documentación previa (PQRS_SERVICES_NEGOCIO_ACTUAL.md) advertía una posible divergencia que no se confirmó en el código actual — están unificados.
Reactivación: exige pago APPROVED con período vigente (periodEnd >= ahora), no basta un pago histórico — tanto en el camino automático como en el manual del Super Admin.
Cancelación: camino manual del Super Admin setea cancelledAt; camino vía webhook (Mercado Pago reporta preapproval cancelado) no lo setea explícitamente — inconsistencia menor entre ambos caminos.
Cambios de unidades/precio: se programan (pendingUnitsSnapshot/pendingPriceCents) y se resuelven en la siguiente renovación, con lógica de "resolver términos pendientes" duplicada (no compartida) entre billing.service.ts y mercado-pago.service.ts.
PENDING_PAYMENT: ya no se asigna al crear tenants; sobrevive como red de seguridad defensiva en el webhook (caso borde: preapproval autorizado sin pago real y trial ya vencido) y en manejo de UI.
11. Flujo de PQRS
Máquina de 3 estados (EN_ESPERA→EN_PROGRESO→TERMINADO), sin endpoint de borrado.
Creación: ADMIN (para cualquier residente) o RESIDENTE (para sí mismo); validación de magic-bytes en fotos (no solo extensión/MIME declarado).
Primer contacto: genera numeroRadicacion único, exige nota y categoría.
5 fases con nombres y días objetivo — pero la tabla de días objetivo (FASE_TARGET_DAYS) y el cálculo de días hábiles viven únicamente en el frontend (admin/pqrs/page.tsx), no en el backend ni en src/domains/pqrs; el backend solo persiste fechas de inicio de fase, sin validar ni conocer los plazos.
Rutas INSUMOS/PROVEEDOR: confirmado en backend que son mutuamente excluyentes e inmutables una vez elegido faseTipo — sin endpoint de reversión.
Cierre: tiempoRespuestaCierre se calcula en días calendario, mientras el semáforo de fases del frontend usa días hábiles — inconsistencia conceptual entre "SLA de cierre" y "objetivo de fase".
SLA/"vencida": función única y compartida (isVencida en src/domains/pqrs/sla.ts), consumida por reportes admin y consejo con el mismo slaDays configurable; la vista de residente calcula una fecha estimada por separado (mismo slaDays, lógica de fecha propia, sin exponer "vencida" al residente).
Edición del residente: una sola vez, protegida contra condición de carrera con patrón compare-and-swap (updateMany + verificación de count).
Duplicación de constantes de frontend: FASE_LABELS y la whitelist de 9 categorías de PQRS están repetidas literalmente en múltiples archivos de página (admin/consejo) y de nuevo en el backend, sin un módulo compartido único.
Hallazgo de encoding confirmado: src/app/api/pqrs/[id]/route.ts contiene comentarios/mensajes con mojibake severo (re-encoding UTF-8 corrupto en múltiples capas) — verificado directamente en línea 180 de ese archivo. No afecta lógica, sí legibilidad de mensajes que llegan a usuarios reales.
12. Integraciones externas
Integración	Variables (nombres)	Comportamiento si falta	Riesgos
PostgreSQL/Supabase	DATABASE_URL, DIRECT_URL	Error de conexión al primer query, sin reintentos	—
Supabase Storage	SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET (default silencioso)	Lanza error explícito si faltan las dos primeras	Sin reintentos, sin SDK oficial, cliente HTTP artesanal
Mercado Pago	MERCADO_PAGO_ACCESS_TOKEN, MERCADO_PAGO_WEBHOOK_SECRET, MERCADO_PAGO_TEST_PAYER_EMAIL (opcional), NEXTAUTH_URL/APP_URL	Falla duro (error explícito) si falta cualquiera de las obligatorias	Sin reintentos propios en creación de preapproval; se delega en el reintento de MP para el webhook
Resend	RESEND_API_KEY, RESEND_FROM_EMAIL (default)	Feature flag transactionalEmailEnabled puede desactivar el envío silenciosamente (pero registrado como SKIPPED en EmailLog); si falta la API key, error explícito + EmailLog FAILED	Timeout de 10s vía AbortController, sin reintentos
Vercel	CRON_SECRET	Cron rechaza (401) si falta o no coincide	—
NextAuth	NEXTAUTH_SECRET/AUTH_SECRET	—	—
13. Notificaciones y soporte
De 9 tipos declarados en NotificationTypes, PAYMENT_APPROVED no tiene ningún disparador en todo el codebase — confirmado por grep, código muerto/gap funcional real (el usuario no recibe notificación in-app cuando su pago se aprueba).
LICENSE_EXPIRING/LICENSE_SUSPENDED sí tienen disparador hoy (contrario a lo que decía la documentación de negocio previa) — confirmado en billing.service.ts dentro de applyOverdueLicenseRules.
SUPPORT_TICKET_RESPONDED se dispara con string literal en vez de la constante del enum — funciona igual pero rompe la garantía de tipo en compilación.
Soporte: solo el Super Admin responde/cierra tickets de todos los tenants — sin colas, sin SLA, sin alerta de "ticket sin respuesta hace X días" (el único cron existente es el de mora). Riesgo de cuello de botella operativo real a medida que crece la base de tenants, mitigado hoy solo por un contador visible en el panel.
14. Observabilidad y auditoría
AuditLog con sanitizeMetadata() que redacta automáticamente claves sensibles (password, token, secret, etc.) — verificado por test.
No hay logger estructurado — toda la observabilidad fuera de AuditLog/EmailLog son 11 usos de console.error en todo src/, sin persistencia garantizada más allá de los logs de Vercel.
Webhooks de Mercado Pago: solo quedan en AuditLog si la suscripción/pago ya existe localmente; un webhook para una entidad no encontrada o topic no soportado responde 200 sin dejar rastro persistente — no hay tabla tipo WebhookLog (a diferencia de EmailLog para Resend).
Errores tragados intencionalmente en fallos de email dentro de flujos de PQRS (para no bloquear el flujo principal) — comportamiento deliberado, pero deja al operador dependiente de EmailLog/logs de Vercel para notarlo.
No se encontraron tokens/contraseñas expuestos en console.error; sí un caso donde el cuerpo de error crudo de Mercado Pago (sin credenciales) se loguea completo.
15. Estado de pruebas y build
Framework: node:test nativo vía tsx, 3 archivos, 35 tests — todos pasando en esta sesión.
Son pruebas de integración a nivel de servicio de dominio contra la base real apuntada por .env (no hay TEST_DATABASE_URL), sin mocks (no hay jest.mock/sinon/nock en el proyecto) — no son E2E (no pasan por HTTP/middleware/auth).
Sin ningún test: mercado-pago.service.ts completo (creación de preapproval, webhook, validación HMAC), support-ticket.service.ts completo, lib/storage.ts (Supabase Storage), platform-setting.service.ts, platform-stats.service.ts/analytics.service.ts, y ninguna ruta HTTP (route.ts) se prueba directamente.
El único test que toca Resend fuerza el camino de fallo (borra RESEND_API_KEY) — nunca ejercita una llamada HTTP real ni el parseo de una respuesta exitosa.
npx tsc --noEmit: 0 errores. npm run lint: 0 warnings. npm test: 35/35, ~80s de duración total.
16. Diferencias entre documentación y código
Comparación de docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md contra el código real:

#	Afirmación del documento	Clasificación	Evidencia
1	Trial de 15 días, tenant nace en TRIAL no PENDING_PAYMENT	Confirmado	tenant-admin.service.ts / billing.service.ts
2	Mercado Pago exige payer real si el token es de producción	Confirmado	mercado-pago.service.ts
3	Se exige Payment APPROVED antes de activar, no basta authorized	Confirmado	mercado-pago.service.ts
4	Días de gracia: 5 por defecto, configurable, y "el webhook usa un valor hardcodeado separado que puede divergir"	Contradicho por el código actual — hoy el webhook consume la misma getGracePeriodDays() en ambos puntos; no se encontró constante propia divergente	mercado-pago.service.ts líneas con getGracePeriodDays()
5	Reactivación exige pago vigente, no basta uno histórico	Confirmado	tenant-admin.service.ts
6	Cambios de unidades/precio se programan para la siguiente renovación	Confirmado	tenant-admin.service.ts
7	Renovación mensual (30 días)	Confirmado, pero con matiz: la constante está duplicada en dos archivos con el mismo valor	billing.service.ts + mercado-pago.service.ts
8	Máquina de PQRS de 3 estados, 5 fases con días hábiles objetivo	Parcialmente confirmado: los días objetivo y el cálculo de días hábiles solo existen en el frontend, no en el backend	admin/pqrs/page.tsx
9	Rutas INSUMOS/PROVEEDOR mutuamente excluyentes e inmutables	Confirmado	pqrs/[id]/route.ts
10	SLA/"vencida" es una sola función compartida en todo el sistema	Confirmado, con matiz: la vista de residente usa una fecha estimada calculada aparte (mismo slaDays, lógica distinta, sin exponer "vencida")	src/domains/pqrs/sla.ts, residente/page.tsx
11	LICENSE_EXPIRING/LICENSE_SUSPENDED declarados sin disparador real	Contradicho por el código actual — sí tienen disparador hoy (posiblemente corregido en una sesión posterior a cuando se escribió el documento)	billing.service.ts
12	Datos legales (razón social, NIT, fecha) vacíos/placeholder	No verificable en esta sesión sin leer legal/* a fondo ni las env vars asociadas — no fue parte del alcance de los 3 agentes de esta ronda	—
13	Invitaciones: token 72h, un solo uso, protegido contra fuga cross-tenant	Confirmado	invitation.service.ts
14	Último ADMIN activo protegido	No verificado directamente en esta ronda (mencionado en el documento, no fue foco explícito de los agentes) — recomendado confirmar en próxima pasada	—
17. Tabla consolidada de riesgos
ID	Área	Archivo/ruta	Comportamiento actual	Esperado	Impacto	Probabilidad	Recomendación	Fase sugerida
R1	Auth/permisos	29 archivos src/app/api/**/route.ts	Chequeo de rol repetido manualmente por archivo	Guard centralizado (requireRole)	Medio — nuevo endpoint puede "olvidar" el chequeo	Media	Extraer helper compartido, migrar gradualmente	Refactor, no urgente
R2	Multi-tenant/UX	Rutas admin/, consejo/, residente/ fuera de (protected)	Tenant suspendido no bloquea el shell de página, solo las llamadas API	Bloqueo consistente a nivel de página para todos los roles	Bajo-Medio — confusión de UX, no fuga de datos	Media	Envolver esas rutas en un layout equivalente al de (protected)	Próxima iteración de UX
R3	Billing	billing.service.ts + mercado-pago.service.ts	BILLING_PERIOD_DAYS = 30 duplicado en dos archivos	Constante única importada	Bajo hoy (mismo valor), alto si diverge sin querer	Baja	Unificar en un solo import, igual que ya se hizo con gracia	Corrección rápida
R4	Billing	billing.service.ts	createInitialSubscriptionForTenant sin ningún caller	Eliminar o documentar como legado explícito	Bajo (código muerto, no ejecuta)	—	Borrar tras confirmar que nadie lo necesita	Limpieza
R5	PQRS	pqrs/[id]/route.ts	Mojibake severo en varios mensajes de usuario (confirmado línea 180)	Texto legible en español correcto	Medio — mensajes de error ilegibles para ADMIN/RESIDENTE en producción	Alta (ya está en producción)	Re-guardar el archivo con encoding UTF-8 correcto	Corrección rápida
R6	PQRS	admin/pqrs/page.tsx vs backend	Días objetivo de fase y cálculo de días hábiles solo en frontend	Constante compartida en src/domains/pqrs	Medio — backend no puede validar SLA de fase de forma independiente	Media	Mover FASE_TARGET_DAYS/lógica de días hábiles a un módulo de dominio compartido	Refactor
R7	Tests	mercado-pago.service.ts, support-ticket.service.ts, storage.ts	Sin ningún test	Cobertura mínima de camino feliz y de error	Alto — son las integraciones de negocio más críticas (cobro real, soporte, evidencias)	Media (bugs no detectados hasta producción)	Agregar tests de integración con mocks/fixtures, o al menos contra sandbox de MP	Prioritaria antes de tocar billing
R8	Observabilidad	Webhook de Mercado Pago	Eventos no reconocidos/entidad no encontrada no dejan rastro persistente	Registro tipo WebhookLog para todo evento entrante	Medio — dificulta diagnosticar webhooks fallidos en producción	Media	Agregar tabla/registro mínimo de todo webhook recibido, exitoso o no	Antes de escalar volumen de pagos
R9	Soporte	support-ticket.service.ts	Solo Super Admin atiende todo el soporte, sin alertas de antigüedad	Alerta de "ticket sin respuesta hace X días"	Medio — riesgo operativo de un solo operador	Alta a medida que crece	Notificación simple (cron + email) de tickets abiertos hace N días	Cuando el volumen de tenants crezca
R10	Auth	reset-password vs invitation	Políticas de expiración/complejidad de password distintas para el mismo propósito	Política unificada	Bajo	Baja	Unificar reglas de fuerza de contraseña entre ambos flujos	Limpieza
R11	Higiene de repo	docs/*	~45 archivos borrados sin commitear en working tree	Decisión explícita de mantener o eliminar formalmente	Bajo (no afecta runtime)	—	Confirmar con el usuario si la eliminación fue intencional antes de continuar el programa de mejora	Antes de Fase 0B
18. Archivos críticos del sistema
src/lib/auth.ts, src/middleware.ts, src/lib/tenant-access-response.ts, src/domains/organizations/tenant.service.ts, src/domains/billing/billing.service.ts, src/domains/billing/mercado-pago.service.ts, src/domains/pqrs/sla.ts, src/app/api/pqrs/[id]/route.ts, src/domains/organizations/invitation.service.ts, src/domains/platform/audit.service.ts, prisma/schema.prisma, vercel.json, src/app/api/cron/overdue-rules/route.ts, src/app/api/billing/mercado-pago/webhook/route.ts.

19. Validaciones que no pudieron ejecutarse
npm run build/release:check (no ejecutado por precaución, aunque no debería requerir escritura a servicios externos).
npm run dev / levantar el servidor real (requeriría entorno completo con credenciales reales).
Cualquier prueba contra Mercado Pago/Resend/Supabase Storage reales (sandbox o producción).
Pruebas ofensivas de IDOR/cross-tenant (explícitamente fuera de alcance, solo señaladas para una fase posterior).
Verificación directa de las páginas legales (legal/terminos, legal/privacidad, legal/cookies, legal/pagos) y sus variables de entorno de entidad legal — no cubierto por los 3 agentes de esta ronda.
Confirmación de la protección de "último ADMIN activo" — mencionada en la documentación previa, no verificada línea por línea en esta ronda.
db:seed/db:migrate*/db:studio — explícitamente no ejecutados.
20. Recomendación para la siguiente intervención
Antes de tocar código: aclarar con el usuario si el borrado sin commitear de ~45 archivos docs/* fue intencional (probablemente sí, como parte de la migración a docs/programa-mejora/), para poder cerrar ese estado de Git antes de avanzar. Como primeros arreglos de bajo riesgo y alto valor para una Fase 0B de corrección puntual (no incluida en esta sesión, que fue solo diagnóstico): (1) corregir el encoding de pqrs/[id]/route.ts (R5), (2) unificar BILLING_PERIOD_DAYS en una sola constante (R3), (3) eliminar createInitialSubscriptionForTenant si se confirma que no se usa (R4). Los ítems de mayor esfuerzo (centralizar requireRole, extender el bloqueo de licencia a todas las páginas, cubrir con tests Mercado Pago/soporte/storage) deberían planearse como iniciativas separadas, no como parte de un mismo lote, dado que este es un negocio operado por una sola persona y el orden de prioridad debe balancear riesgo real contra esfuerzo de mantenimiento.