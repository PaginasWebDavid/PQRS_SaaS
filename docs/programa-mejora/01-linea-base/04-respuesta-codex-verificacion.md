Fase 0B: Verificación Independiente Corregida
1. Resumen Ejecutivo
Esta segunda revisión sí tomó como objeto el contenido actual de [02-respuesta-claude-diagnostico.md](C:/Users/d.hernandeza2/Documents/PQRS_Saas/docs/programa-mejora/01-linea-base/02-respuesta-claude-diagnostico.md), de 27.706 bytes.
El diagnóstico 0A es útil y acierta en gran parte de la arquitectura, aislamiento multi-tenant, trial, reglas PQRS, notificaciones y deuda técnica. Sin embargo, contiene errores relevantes que impiden aceptarlo sin correcciones:
Cuenta 37 APIs; existen 39.
Cuenta aproximadamente 29 archivos con autorización manual; existen 32.
Declara idempotente el webhook de pagos, pero repite el efecto de renovación.
Afirma que las URLs de Supabase nunca se exponen, pero /api/upload devuelve URL y path.
Afirma un retraso máximo de una hora en middleware sin que ese límite esté garantizado.
No identifica la renovación simulada disponible en la interfaz productiva.
No analiza carreras entre cron, webhooks y cambios de facturación.
No verifica legal ni la protección del último ADMIN.
Ejecutó 35 pruebas contra la base indicada por DATABASE_URL sin una protección contra producción.
Veredicto corregido: DIAGNÓSTICO CONFIABLE CON CORRECCIONES.
Es una buena línea base general, pero sus conclusiones sobre pagos, pruebas y Storage no deben usarse para aprobar producción.
2. Estado De Git
Estado actual:
Rama: master.
HEAD y origin/master: 3bda390.
48 archivos rastreados eliminados.
5.933 líneas documentales eliminadas.
docs/programa-mejora/ sin seguimiento.
No existen cambios de código fuente.
Los 48 documentos permanecen recuperables desde HEAD.
Archivos actuales de la nueva estructura:
Archivo	Tamaño
PQRS_SERVICES_NEGOCIO_ACTUAL.md	28.403 bytes
01-prompt-claude-diagnostico.md	5.273 bytes
02-respuesta-claude-diagnostico.md	27.706 bytes
03-prompt-codex-verificacion.md	12.314 bytes
04-respuesta-codex-verificacion.md	0 bytes

La relación con una migración documental es evidente, pero está incompleta. La recomendación segura es trasladar o conservar expresamente el contenido anterior antes de confirmar las eliminaciones. No debe hacerse un restore ni un commit masivo sin comparar ambos árboles.
3. Stack Y Arquitectura
Afirmaciones confirmadas:
Next.js 14.2.35.
TypeScript 5 con strict: true.
Prisma 5.22.
PostgreSQL.
NextAuth v5 beta con CredentialsProvider.
Sesiones JWT.
Monolito Next.js App Router.
Vercel.
Cron diario a las 07:00 UTC.
Mercado Pago, Resend y Supabase Storage mediante fetch.
Sin SDK oficial de esas tres integraciones.
Matiz: skipLibCheck: true reduce el alcance del chequeo estricto sobre dependencias.
4. Inventario Independiente De APIs
Existen 39 archivos route.ts, no 37.
Ruta	Métodos	Acceso	Tenant/ID	Resultado
/api/actividad	GET	ADMIN, CONSEJO	Tenant sesión	Correcto
/api/auth/[...nextauth]	GET, POST	Pública	No	Pública por diseño
/api/auth/change-password	POST	Autenticado	Tenant sesión	Edge case SUPER_ADMIN
/api/auth/forgot-password	POST	Pública	Email	Pública por diseño
/api/auth/register	POST	Pública	No	Siempre 403
/api/auth/reset-password	POST	Pública	Token	Política débil/inconsistente
/api/billing/checkout	POST	ADMIN	Tenant sesión	Correcto; permite recuperar licencia
/api/billing/mercado-pago/webhook	GET, POST	Pública	ID del proveedor	POST firmado; efectos no idempotentes
/api/cron/overdue-rules	GET	Secreto cron	Global	Global intencional
/api/dashboard/excel	GET	ADMIN, CONSEJO	Tenant sesión	Correcto
/api/dashboard	GET	ADMIN, CONSEJO	Tenant sesión	Correcto
/api/invitations/[id]/cancel	POST	ADMIN	ID + tenant	Correcto
/api/invitations/[id]/resend	POST	ADMIN	ID + tenant	Correcto
/api/invitations/accept	GET, POST	Pública	Token hasheado	Tenant derivado de invitación
/api/invitations/bulk	POST	ADMIN	Tenant sesión	Correcto
/api/invitations	GET, POST	ADMIN	Tenant sesión	Correcto
/api/me/avatar	POST, DELETE	Autenticado	Tenant en POST	DELETE omite guard de acceso
/api/me	GET, PATCH	Autenticado	Sesión	GET sobreexpone licencia
/api/notifications	GET, PATCH	Roles del conjunto	ID + tenant + usuario	Correcto
/api/onboarding	POST	ADMIN, RESIDENTE	Tenant sesión	Bypass de licencia deliberado
/api/platform/analytics	GET	SUPER_ADMIN	Global	Cross-tenant intencional
/api/platform/audit-log	GET	SUPER_ADMIN	Global	Cross-tenant intencional
/api/platform/general-settings	GET, POST	SUPER_ADMIN	Global	Correcto
/api/platform/settings	GET	SUPER_ADMIN	Global	Correcto
/api/platform/super-admin	GET, POST	SUPER_ADMIN	Tenant del body	Cross-tenant intencional
/api/platform/support-tickets	GET, POST	SUPER_ADMIN	Ticket global	Cross-tenant intencional
/api/platform/tenant-users	GET	SUPER_ADMIN	Tenant query	Cross-tenant intencional
/api/pqrs/[id]/evidencia	GET	A/C/R	ID + tenant + dueño	Correcto
/api/pqrs/[id]/fotos/[fotoId]	GET	A/C/R	IDs + tenant + relación	Correcto
/api/pqrs/[id]	GET, PATCH	GET A/C/R; PATCH A/R	ID + tenant + dueño	Carrera de edición
/api/pqrs	GET, POST	GET A/C/R; POST A/R	Tenant sesión	Correcto
/api/reportes/excel	GET	ADMIN, CONSEJO	Tenant sesión	Correcto
/api/reportes/pdf	GET	ADMIN, CONSEJO	Tenant sesión	Correcto
/api/reportes	GET	ADMIN, CONSEJO	Tenant sesión	Correcto
/api/support-tickets	GET, POST	Roles del conjunto	Tenant + creador	Categoría no restringida
/api/tenant	GET, PATCH	ADMIN	Tenant sesión	Correcto
/api/upload	POST	ADMIN	Tenant sesión	Expone URL y path
/api/users/[id]	GET, PATCH, DELETE	ADMIN	ID + tenant	Correcto
/api/users	GET, POST	ADMIN	Tenant sesión	Correcto

No se encontró una acción administrativa protegida exclusivamente mediante ocultamiento visual.
5. Evaluación Del Diagnóstico 0A
ID	Afirmación 0A	Veredicto	Corrección o matiz	Confianza
A-01	Next.js 14.2.35 y arquitectura monolítica	CONFIRMADA	Sin corrección	Alta
A-02	TypeScript estricto	CONFIRMADA CON MATICES	skipLibCheck está habilitado	Alta
A-03	35/35 pruebas pasando	NO VERIFICABLE ESTÁTICAMENTE	Hay 35 declaraciones, pero no se preservó evidencia de ejecución	Alta
A-04	37 APIs	CONTRADICHA	Existen 39	Alta
A-05	Todas las APIs tienen protección justificada	CONFIRMADA CON MATICES	Públicas deliberadas y guards backend; hay inconsistencias de revocación	Alta
A-06	Aproximadamente 29 archivos duplican autorización	CONTRADICHA	32 llaman manualmente auth()	Alta
A-07	Más de 20 rutas usan guard de licencia	CONFIRMADA	Son 23	Alta
A-08	Solo SUPER_ADMIN está bajo (protected)	CONFIRMADA	Admin, Consejo y Residente dependen de middleware y API	Alta
A-09	Cambios de rol se reflejan al llamar auth()	CONFIRMADA CON MATICES	La ruta también debe comprobar isActive	Media
A-10	Middleware tiene máximo una hora de rezago	NO VERIFICABLE ESTÁTICAMENTE	No hay garantía demostrable de ese límite	Media
A-11	No existen omisiones de tenant	CONFIRMADA CON MATICES	Consultas correctas; Storage público queda fuera de ese control	Alta
A-12	Nunca se expone URL directa de Storage	CONTRADICHA	/api/upload devuelve URL y path	Alta
A-13	Último ADMIN protegido	NO CONFIRMADA EN 0A	Sí está protegido; 0A reconoció no revisarlo	Alta
A-14	Trial inicial de 15 días	CONFIRMADA	Tenant y Subscription nacen TRIAL	Alta
A-15	Se exige pago aprobado para activar	CONFIRMADA CON MATICES	La renovación simulada permite activación manual	Alta
A-16	Webhook idempotente por upsert	CONTRADICHA	Fila idempotente; efecto sobre periodo no	Alta
A-17	HMAC obligatorio y fail-closed	CONFIRMADA CON MATICES	Sin anti-replay ni control de frescura	Alta
A-18	Periodo de gracia unificado	CONFIRMADA	Cron y webhook usan getGracePeriodDays()	Alta
A-19	BILLING_PERIOD_DAYS duplicado	CONFIRMADA	Dos fuentes de 30 días	Alta
A-20	createInitialSubscriptionForTenant sin callers	CONFIRMADA	Código muerto e inconsistente	Alta
A-21	Cancelación webhook omite cancelledAt	CONFIRMADA	Debe corregirse	Alta
A-22	PQRS de tres estados y cinco fases	CONFIRMADA	Backend valida transiciones	Alta
A-23	Edición residente protegida por CAS	CONFIRMADA CON MATICES	No cubre carrera con toma del ADMIN	Alta
A-24	Plazos de fase solo en frontend	CONFIRMADA	Backend no conoce esos plazos	Alta
A-25	Mojibake en ruta PQRS	CONFIRMADA	Cinco líneas, cuatro llegan al usuario	Alta
A-26	PAYMENT_APPROVED sin caller	CONFIRMADA	Gap funcional	Alta
A-27	Notificaciones de licencia sí operan	CONFIRMADA	Cron las dispara	Alta
A-28	Sanitización protege metadata	CONFIRMADA CON MATICES	Solo claves de primer nivel y coincidencia exacta	Alta
A-29	Legal no verificado	CONFIRMADA	Fue una omisión reconocida	Alta
A-30	Reactivación exige pago vigente	CONFIRMADA CON MATICES	Excepto renovación simulada/cortesía manual	Alta

6. Riesgo De Las Pruebas
El diagnóstico 0A reconoce que npm test usa la base configurada en DATABASE_URL, pero aun así ejecutó las pruebas.
Confirmado estáticamente:
No existe TEST_DATABASE_URL.
Los tests importan el singleton normal de Prisma.
No verifican NODE_ENV.
No validan host, proyecto o nombre de base.
Crean y eliminan información real.
La limpieza ocurre en after().
No existe finally.
No usan rollback global.
Una interrupción deja registros persistentes.
Modelos potencialmente contaminados:
Tenant.
User.
Invitation.
Notification.
EmailLog.
AuditLog.
Pqrs.
PqrsFoto.
HistorialPqrs.
Subscription.
Payment.
Session y Account.
Las eliminaciones están mayoritariamente acotadas por IDs y prefijos únicos, reduciendo el riesgo de borrar registros ajenos. Aun así, ejecutar esas pruebas contra producción puede contaminar métricas, auditoría y facturación.
Corrección al diagnóstico: que las pruebas hayan pasado no convierte el procedimiento en seguro. No deben volver a ejecutarse hasta aislar la base.
7. Autenticación Y Permisos
Confirmado:
Sesión JWT de 12 horas.
CredentialsProvider con bcrypt.
Login bloquea usuarios inactivos.
Callback JWT consulta Prisma.
Middleware restringe rutas por rol.
APIs del conjunto suelen refrescar usuario y licencia.
Problemas:
El middleware usa claims de cookie sin Prisma.
El límite de una hora no puede garantizarse.
Las APIs de SUPER_ADMIN verifican rol, pero no rechazan explícitamente isActive=false.
GET /api/me no llama getTenantAccessResponse.
DELETE /api/me/avatar tampoco.
GET /api/me entrega datos de facturación a CONSEJO y RESIDENTE.
Algunas rutas generales esperan tenant y producen errores para SUPER_ADMIN.
El bloqueo por licencia es autorización backend real en 23 rutas. La inconsistencia principal es de cobertura y experiencia, no una fuga generalizada.
8. Aislamiento Multi-Tenant
Se intentó refutar el aislamiento y no se encontró una omisión directa en:
PQRS por ID.
Fotos.
Evidencias.
Usuarios.
Invitaciones.
Notificaciones.
Auditoría.
Reportes.
Exportaciones.
Configuración.
Soporte del usuario.
La fotografía se busca por fotoId + tenantId y además se confirma que pertenece a la PQRS indicada en la URL.
Riesgos restantes:
Storage genera /object/public/.
/api/upload devuelve url y path.
Los UUID dificultan adivinación, pero no proporcionan autorización.
El acceso público efectivo depende de la configuración del bucket, no comprobable estáticamente.
SUPER_ADMIN realiza acciones globales intencionales usando IDs recibidos del cliente.
9. Protección Del Último ADMIN
La afirmación funcional sí está implementada en [user-management.service.ts (line 21)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/src/domains/organizations/user-management.service.ts:21).
Protecciones:
El ADMIN no puede desactivarse a sí mismo.
No puede quitarse su propio rol.
El objetivo se busca por id + tenantId.
Se ejecuta una transacción.
Se bloquean los ADMIN activos con FOR UPDATE.
Se cuenta dentro de la misma transacción.
Se rechaza dejar cero ADMIN activos.
Esto protege las rutas actuales frente a dos desactivaciones concurrentes.
Matiz: no existe un constraint o trigger PostgreSQL. Una escritura manual, migración o servicio futuro que no use esta función puede romper la regla.
10. Facturación
Flujo válido:
Trial de 15 días.
Estado inicial TRIAL.
Periodo de trial en currentPeriodEnd.
Pago aprobado necesario para activación automática.
Renovación desde el mayor entre hoy y fin vigente.
Gracia configurable.
Suspensión por cron.
Términos de precio/unidades programados.
PENDING_PAYMENT sigue siendo alcanzable.
Errores omitidos por 0A:
Pago duplicado: el upsert evita otra fila, pero vuelve a calcular y guardar un nuevo currentPeriodEnd.
Evento fuera de orden: un rechazo tardío puede degradar una suscripción activa.
Estados parciales: Payment, Subscription, Tenant y AuditLog se actualizan por separado.
Carrera con cron: el cron selecciona vencidos y actualiza después sin condición de versión/estado.
Renovación simulada: SUPER_ADMIN tiene un botón “Renovar” que crea un pago SIMULATED, APPROVED.
Proveedor antes que DB: el cambio de unidades actualiza Mercado Pago antes de la transacción local.
Cancelación incompleta: webhook no establece cancelledAt.
Código muerto peligroso: createInitialSubscriptionForTenant crea ACTIVE con pago simulado.
La renovación simulada puede servir como override operativo, pero hoy no está presentada como tal ni exige motivo. Puede alterar ingresos y acceso sin dinero real.
11. Webhook
La validación criptográfica está correctamente construida:
HMAC SHA-256.
data.id.
x-request-id.
ts.
timingSafeEqual.
Falla si falta secreto o firma.
Faltantes:
Validación de antigüedad de ts.
Ventana de replay.
Tabla o ledger de eventos.
Idempotencia de efectos.
Precedencia de estados.
Registro de tópicos desconocidos.
Transacción única.
Un tópico desconocido firmado devuelve 200. Un webhook sin dataId también devuelve una respuesta controlada 200. Los errores de firma devuelven 500 genérico.
Conclusión: HMAC obligatorio y fail-closed es correcto, pero la afirmación “webhook idempotente” es incorrecta.
12. PQRS Y Encoding
Confirmado:
Tres estados.
Cinco fases.
Rutas INSUMOS y PROVEEDOR.
faseTipo inmutable.
Notas obligatorias para avanzar.
Evidencia de cierre obligatoria.
Sin endpoint DELETE.
Scope del residente por creador.
Edición única mediante compare-and-swap.
Carrera no detectada por 0A:
Residente consulta que la PQRS sigue libre.
ADMIN registra primer contacto.
Residente ejecuta updateMany condicionado solo por id y editadoPorResidente=false.
La descripción puede actualizarse después de ser tomada.
El CAS debe incluir estado, responsable, primer contacto, tenant y propietario.
Encoding:
Línea 180: comentario corrupto.
Línea 208: “Asunto inválido”.
Línea 455: “Esta PQRS ya está cerrada”.
Línea 475: “acción tomada”.
Línea 507: “Asunto inválido”.
Es el único archivo con mojibake encontrado. Puede repararse sin alterar lógica.
13. Notificaciones Y Soporte
Notificaciones:
PAYMENT_APPROVED: declarada y nunca disparada.
LICENSE_EXPIRING: activa.
LICENSE_SUSPENDED: activa.
SUPPORT_TICKET_RESPONDED: usado mediante literal.
PQRS e invitaciones tienen callers reales.
Soporte:
Todos los roles del conjunto salvo SUPER_ADMIN pueden crear tickets.
Solo ven sus propios tickets.
SUPER_ADMIN ve, responde y cierra globalmente.
No hay notificación al SUPER_ADMIN cuando nace un ticket.
No hay antigüedad, SLA, asignación o escalamiento.
Solo se cargan 100 tickets globales.
Una nueva respuesta sobrescribe la anterior.
Se puede responder nuevamente a un ticket cerrado.
No hay límites máximos de asunto, mensaje o respuesta.
La categoría FACTURACIÓN está permitida por API a cualquier rol.
Para un negocio de una sola persona, la ausencia de alerta de ticket nuevo es un riesgo operativo más urgente que crear colas sofisticadas.
14. Legal
El diagnóstico 0A no revisó legal. La omisión está reconocida, pero era relevante para la línea base.
Hallazgos:
Términos dicen que identidad, NIT, dirección y vigencia deben completarse.
Privacidad dice que el responsable debe completarse.
Configurar las variables no reemplaza esos textos.
Retención descrita sin periodos concretos.
No hay flujo integral de exportación contractual.
No hay flujo técnico de eliminación.
Cancelación y reembolsos son solo declaraciones.
La aceptación registra fecha y versión 1.0.
No se conserva hash o copia inmutable del texto aceptado.
Estas páginas no deberían publicarse como documentos definitivos todavía.
15. Código Muerto Y Duplicaciones
Elemento	Clasificación
createInitialSubscriptionForTenant	Código muerto real
BILLING_PERIOD_DAYS duplicado	Duplicación con riesgo
Términos pendientes en dos servicios	Duplicación con riesgo
Categorías PQRS en varias capas	Duplicación con riesgo de divergencia
Fases y plazos frontend	Regla incompleta en backend
Guards manuales	Deuda arquitectónica real
Account y Session	Scaffolding actualmente sin uso aparente
VerificationToken	Sí utilizado
PENDING_PAYMENT	Estado heredado pero todavía operativo
Renovación simulada	Código alcanzable, no muerto

16. Hallazgos Nuevos O Corregidos
ID	Sev.	Área	Hallazgo	Recomendación	Fase
F0B-01	Alta	Pruebas	npm test puede usar producción	Base de pruebas obligatoria	Inmediata
F0B-02	Alta	Webhook	Pago duplicado repite renovación	Ledger e idempotencia de efecto	Billing
F0B-03	Alta	Webhook	Eventos fuera de orden degradan estado	Precedencia y reconciliación	Billing
F0B-04	Alta	Billing	Cron/webhook pueden pisarse	Updates condicionales y transacción	Billing
F0B-05	Alta	Billing	Renovación simulada activa acceso	Override explícito con motivo o eliminación	Billing
F0B-06	Alta	Archivos	URL pública y path expuestos	Bucket privado y URLs firmadas	Seguridad
F0B-07	Alta	Legal	Documentos aún contienen placeholders	Completar antes de publicación	Prelanzamiento
F0B-08	Media	Webhook	Sin protección replay	Validar ts y registrar event ID	Billing
F0B-09	Media	Billing	Cancelación omite cancelledAt	Sincronizar Tenant/Subscription	Billing
F0B-10	Media	Auth	Revocación SUPER_ADMIN incompleta	Comprobar isActive en plataforma	Seguridad
F0B-11	Media	PQRS	Carrera edición residente/ADMIN	Ampliar condición atómica	PQRS
F0B-12	Media	Billing	Proveedor actualizado antes de DB	Reconciliación durable	Billing
F0B-13	Media	Soporte	Sin alerta y respuestas destructivas	Notificar y conservar historial	Operación
F0B-14	Media	Auditoría	Sanitización superficial	Redacción recursiva	Seguridad
F0B-15	Media	Auth	Reset token plano y política de 6 caracteres	Hash, transacción y política común	Seguridad
F0B-16	Media	Permisos	/api/me expone facturación a todos	Respuesta por rol	Permisos
F0B-17	Baja	Encoding	Cuatro mensajes ilegibles	Sustituir literales UTF-8	Mantenimiento
F0B-18	Baja	Arquitectura	Conteos y guards duplicados	Centralización gradual	Refactor

17. Riesgos Descartados O Reducidos
No se encontró IDOR cross-tenant directo en las rutas revisadas.
Fotografías validan relación con la PQRS.
CONSEJO queda en lectura.
RESIDENTE queda limitado a sus PQRS.
Último ADMIN sí está protegido concurrentemente.
La licencia se comprueba en backend.
El secreto del webhook es obligatorio.
La gracia está centralizada.
Las notificaciones de mora están activas.
PENDING_PAYMENT no es código muerto.
No hay cambios actuales de código en el working tree.
18. Validaciones No Realizadas
Esta revisión no ejecutó:
npm test.
Typecheck.
Lint.
Build.
Servidor.
Migraciones.
Seeds.
Prisma contra base real.
Mercado Pago.
Resend.
Supabase Storage.
Navegación o peticiones HTTP.
Ataques IDOR.
Valores de variables de entorno.
No se modificó ningún archivo. [04-respuesta-codex-verificacion.md](C:/Users/d.hernandeza2/Documents/PQRS_Saas/docs/programa-mejora/01-linea-base/04-respuesta-codex-verificacion.md) permanece vacío porque la fase prohíbe crear o editar archivos.
19. Siguiente Paso Exacto
Antes de implementar mejoras funcionales:
Resolver la migración documental sin perder los 48 archivos de HEAD.
Añadir una base de pruebas separada y bloqueo fail-fast.
No volver a ejecutar npm test antes de ese aislamiento.
Corregir idempotencia, orden y atomicidad de Mercado Pago.
Revisar la renovación simulada.
Convertir Storage a privado.
Completar legal.
Después atender encoding, constantes y guards duplicados.
La prioridad propuesta por 0A de comenzar por encoding y constantes es demasiado baja frente al riesgo real de pruebas y facturación.
Veredicto
DIAGNÓSTICO CONFIABLE CON CORRECCIONES
El diagnóstico 0A aporta una línea base valiosa y muchas afirmaciones están confirmadas. No obstante, sus conclusiones sobre idempotencia, Storage y seguridad de las pruebas necesitan corrección antes de utilizarlo como base para aprobar producción.