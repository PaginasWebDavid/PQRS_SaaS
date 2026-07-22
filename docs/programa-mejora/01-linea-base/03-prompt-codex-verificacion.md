# FASE 0B — VERIFICACIÓN INDEPENDIENTE DEL DIAGNÓSTICO

Actúa como revisor técnico independiente, especialista en arquitectura SaaS multi-tenant, seguridad de aplicaciones, Next.js, Prisma, PostgreSQL y sistemas de facturación.

Debes verificar críticamente el diagnóstico producido previamente por otro agente.

El informe que debes revisar está en:

`docs/programa-mejora/01-linea-base/02-respuesta-claude-diagnostico.md`

El documento funcional de referencia está en:

`docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md`

## Objetivo

Determinar qué afirmaciones del diagnóstico anterior están:

* Confirmadas por el código.
* Parcialmente confirmadas.
* Incorrectas.
* Exageradas.
* Incompletas.
* No verificables mediante análisis estático.

No confíes en el informe anterior como fuente de verdad. La fuente de verdad es el repositorio.

## Modalidad obligatoria

Esta es una revisión exclusivamente de lectura.

No debes:

* Modificar archivos.
* Crear archivos.
* Corregir código.
* Aplicar parches.
* Instalar dependencias.
* Cambiar configuración.
* Ejecutar migraciones.
* Ejecutar seeds.
* Ejecutar pruebas que accedan a bases de datos.
* Ejecutar `npm test`.
* Ejecutar `npm run build`.
* Ejecutar `npm run release:check`.
* Levantar el servidor.
* Conectarte a Mercado Pago, Resend, Supabase Storage o cualquier servicio externo.
* Mostrar valores de variables de entorno.
* Hacer commits, ramas, resets, checkout, restore o push.
* Alterar el working tree.

Puedes usar comandos de solo lectura, búsquedas de texto e inspección estática.

Puedes ejecutar `git status`, `git diff`, `git log`, `git show`, búsquedas con `rg` o equivalentes y lectura de archivos.

Antes de cualquier comando, determina si podría escribir archivos o acceder a servicios externos. Si existe duda, no lo ejecutes.

## Alerta de seguridad de datos

El informe anterior indica que `npm test` utiliza directamente la base configurada en `DATABASE_URL`, porque no existe una `TEST_DATABASE_URL` independiente.

No ejecutes las pruebas.

Debes inspeccionar estáticamente:

* Cómo obtienen la conexión los tests.
* Qué datos crean.
* Qué datos eliminan.
* Qué pasaría si una prueba falla antes de ejecutar la limpieza.
* Si existe riesgo de que las pruebas operen contra producción.
* Qué controles faltan para impedirlo.

No reveles el contenido de `DATABASE_URL`.

## Verificaciones obligatorias

### 1. Estado real de Git

Verifica:

* Rama actual.
* Archivos modificados.
* Archivos eliminados.
* Archivos nuevos.
* Si los aproximadamente 45 documentos eliminados siguen presentes en `HEAD`.
* Si alguna eliminación parece estar relacionada con la migración hacia `docs/programa-mejora`.
* Si existen cambios de código además de cambios documentales.

No restaures ni confirmes ninguna eliminación.

Entrega una recomendación segura para resolver este estado posteriormente.

### 2. Stack y arquitectura

Confirma o contradice:

* Next.js 14.2.35.
* TypeScript estricto.
* Prisma con PostgreSQL.
* NextAuth v5 beta con CredentialsProvider.
* Repositorio monolítico.
* Integraciones externas mediante `fetch` sin SDK.
* Despliegue en Vercel.
* Cron diario.

### 3. Inventario de APIs

Verifica independientemente la afirmación de que existen 37 archivos `route.ts`.

Construye una tabla con:

* Ruta.
* Métodos HTTP.
* Roles permitidos.
* Necesidad de tenant.
* Guard utilizado.
* Servicio llamado.
* Si recibe identificadores controlados por el cliente.
* Si combina esos identificadores con `tenantId`.
* Riesgo aparente.

Debes identificar explícitamente cualquier ruta:

* Sin autenticación.
* Pública por diseño.
* Protegida únicamente por ocultamiento de interfaz.
* Que confíe en un ID recibido sin volver a verificar pertenencia.
* Que permita acciones cross-tenant intencionales.

### 4. Aislamiento multi-tenant

Intenta refutar la afirmación de que no existen omisiones de `tenantId`.

Revisa especialmente:

* PQRS por ID.
* Fotografías.
* Evidencias.
* Usuarios por ID.
* Invitaciones por ID.
* Soporte.
* Notificaciones.
* Auditoría.
* Reportes.
* Exportaciones.
* Configuración del conjunto.
* Acciones de Super Admin.

Busca:

* `findUnique` por ID sin validación posterior.
* `update` o `delete` por ID global.
* Servicios que acepten `tenantId` desde el body.
* Consultas donde el tenant provenga del cliente en lugar de la sesión.
* URLs de almacenamiento expuestas.
* Acceso indirecto mediante relaciones.

No realices ataques ni solicitudes HTTP.

### 5. Autenticación y permisos

Confirma o contradice:

* Sesiones JWT de 12 horas.
* Refresco de rol y tenant desde Prisma.
* Posible desfase de hasta una hora en middleware.
* Bloqueo de usuarios desactivados.
* Duplicación manual de autorización en aproximadamente 29 rutas.
* Uso de `getTenantAccessResponse`.
* Diferencias entre el route group `(protected)` y las páginas de Admin, Consejo y Residente.

Verifica si el supuesto problema de bloqueo por licencia es:

* Solo una inconsistencia de experiencia de usuario.
* Una debilidad de autorización.
* Un riesgo de exposición de datos.
* O una interpretación incorrecta del agente anterior.

### 6. Protección del último administrador

El informe anterior no verificó esta afirmación.

Confirma detalladamente:

* Que siempre deba existir al menos un ADMIN activo.
* Que el administrador no pueda desactivarse a sí mismo.
* Que no pueda quitarse su propio rol.
* Que solicitudes concurrentes no puedan dejar el conjunto sin ADMIN.
* Si la protección está implementada en base de datos, transacción, bloqueo o lógica de aplicación.
* Qué casos límite siguen abiertos.

### 7. Facturación

Verifica de forma independiente:

* Creación del trial.
* Duración del trial.
* Estado inicial.
* Requisito de pago aprobado.
* Idempotencia.
* Renovación.
* Cálculo de fechas.
* Período de gracia.
* Suspensión.
* Reactivación.
* Cancelación.
* Cambios programados de precio y unidades.
* Desactivación de renovación.
* Uso residual de `PENDING_PAYMENT`.

Debes confirmar específicamente:

* Si `getGracePeriodDays()` es realmente la única fuente usada por cron y webhook.
* Si `BILLING_PERIOD_DAYS` está duplicado.
* Si la lógica de términos pendientes también está duplicada.
* Si `createInitialSubscriptionForTenant` no tiene callers.
* Si la cancelación vía webhook omite `cancelledAt`.
* Qué ocurre ante webhooks fuera de orden.
* Qué ocurre ante pagos duplicados.
* Qué ocurre ante pagos rechazados después de uno aprobado.
* Qué ocurre si el webhook llega durante una renovación concurrente.
* Si existen transacciones suficientes para evitar estados parciales.

No llames a Mercado Pago.

### 8. Firma del webhook

Verifica estáticamente:

* Construcción de la firma.
* Uso de HMAC.
* Algoritmo.
* Datos incluidos.
* Comparación segura.
* Comportamiento si faltan headers.
* Comportamiento si falta el secreto.
* Protección contra replay.
* Idempotencia.
* Registro de eventos desconocidos.
* Respuestas HTTP ante errores.

Determina si la afirmación “validación HMAC obligatoria y fail-closed” es completamente correcta o necesita matices.

### 9. Pruebas y riesgo de base de datos

Analiza todos los archivos de pruebas.

Documenta:

* Cómo se inicializa Prisma.
* Qué base utilizan.
* Si reconocen ambiente de test.
* Cómo crean identificadores únicos.
* Cómo limpian los datos.
* Si usan transacciones.
* Si la limpieza ocurre en `finally`.
* Qué sucede ante interrupción del proceso.
* Qué modelos podrían quedar contaminados.
* Si existe riesgo de borrar datos que no fueron creados por la prueba.
* Qué protección debería añadirse antes de volver a ejecutar `npm test`.

Propón una estrategia mínima para una base de pruebas separada, pero no la implementes.

### 10. PQRS

Confirma o contradice:

* Máquina de tres estados.
* Cinco fases.
* Rutas INSUMOS y PROVEEDOR.
* Inmutabilidad de `faseTipo`.
* Evidencia obligatoria.
* Edición única del residente.
* Cálculo de SLA.
* Días calendario frente a días hábiles.
* Constantes duplicadas entre frontend y backend.
* Plazos de fase solo presentes en frontend.
* Ausencia de endpoint de eliminación.

Identifica reglas que dependan exclusivamente del frontend y que puedan ser omitidas llamando directamente a la API.

### 11. Encoding

Revisa `src/app/api/pqrs/[id]/route.ts`.

Determina:

* Qué textos están corruptos.
* Si son comentarios o mensajes enviados al usuario.
* Si el problema se limita a ese archivo.
* Si hay más mojibake en el repositorio.
* Si corregir el archivo puede hacerse sin afectar lógica.

No lo corrijas.

### 12. Notificaciones

Confirma o contradice:

* `PAYMENT_APPROVED` declarado pero nunca disparado.
* `LICENSE_EXPIRING` y `LICENSE_SUSPENDED` sí disparados.
* Uso literal de `SUPPORT_TICKET_RESPONDED`.
* Notificaciones declaradas que no tengan callers.
* Correos enviados sin notificación interna equivalente.
* Notificaciones internas sin correo equivalente.

### 13. Soporte

Verifica:

* Quién puede crear tickets.
* Quién puede responder.
* Quién puede cerrar.
* Aislamiento por tenant.
* Visibilidad de categorías.
* Ausencia o presencia de alertas por antigüedad.
* Riesgo operativo para un único Super Admin.

Distingue problemas de código de decisiones de producto.

### 14. Legal

El informe anterior no verificó suficientemente las páginas legales.

Revisa:

* `legal/terminos`.
* `legal/privacidad`.
* `legal/cookies`.
* `legal/pagos`.
* Variables de entidad legal por nombre.
* Valores placeholder escritos directamente en el código.
* Comportamiento si las variables faltan.
* Retención de datos.
* Cancelación.
* Reembolsos.
* Exportación.
* Eliminación de información.

No muestres valores privados de variables.

### 15. Código muerto y duplicaciones

Verifica:

* `createInitialSubscriptionForTenant`.
* Constantes de facturación.
* Constantes de fases.
* Categorías de PQRS.
* Guards de rol.
* Lógica de términos pendientes.
* Modelos estándar de NextAuth potencialmente no utilizados.
* Estados heredados.

Distingue entre:

* Código realmente inalcanzable.
* Código defensivo.
* Código reservado para compatibilidad.
* Código duplicado con riesgo real.
* Duplicación estética sin impacto relevante.

## Evaluación del informe anterior

Crea una tabla para las principales afirmaciones del informe anterior con:

* ID.
* Afirmación.
* Veredicto.
* Evidencia.
* Nivel de confianza.
* Corrección o matiz necesario.

Usa estos veredictos:

* CONFIRMADA.
* CONFIRMADA CON MATICES.
* NO CONFIRMADA.
* CONTRADICHA.
* NO VERIFICABLE ESTÁTICAMENTE.

## Clasificación de hallazgos

Para cada hallazgo nuevo o corregido incluye:

* ID.
* Severidad: crítica, alta, media o baja.
* Área.
* Archivo y símbolo.
* Comportamiento actual.
* Riesgo.
* Evidencia.
* Recomendación.
* Fase sugerida.

No clasifiques como crítico un problema de estilo o mantenibilidad sin impacto demostrable.

## Formato final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Evaluación del diagnóstico anterior.
4. Riesgo de las pruebas contra `DATABASE_URL`.
5. Revisión de autenticación y permisos.
6. Revisión multi-tenant.
7. Protección del último ADMIN.
8. Revisión de facturación.
9. Revisión del webhook.
10. Revisión de PQRS.
11. Notificaciones y soporte.
12. Legal.
13. Código muerto y duplicaciones.
14. Hallazgos nuevos.
15. Riesgos descartados o reducidos.
16. Validaciones no realizadas.
17. Recomendación exacta para el siguiente paso.
18. Veredicto:

* DIAGNÓSTICO CONFIABLE.
* DIAGNÓSTICO CONFIABLE CON CORRECCIONES.
* DIAGNÓSTICO INSUFICIENTE.
* DIAGNÓSTICO NO CONFIABLE.

## Finalización

Detente después del informe.

No implementes ninguna corrección.

No generes un parche.

No pidas autorización para empezar a modificar.

No cambies el repositorio.
