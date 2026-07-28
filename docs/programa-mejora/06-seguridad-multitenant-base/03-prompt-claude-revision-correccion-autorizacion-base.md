# FASE 3B — REVISIÓN Y CORRECCIÓN DE LA BASE DE AUTORIZACIÓN MULTI-TENANT

## Documentación automática

Antes de revisar o modificar código:

1. Guarda este prompt completo en:

`docs/programa-mejora/06-seguridad-multitenant-base/03-prompt-claude-revision-correccion-autorizacion-base.md`

2. Al terminar, guarda el informe completo en:

`docs/programa-mejora/06-seguridad-multitenant-base/04-respuesta-claude-revision-correccion-autorizacion-base.md`

No modifiques los documentos 01 y 02.

No hagas commit, push ni tags.

---

Actúa como revisor e implementador correctivo de seguridad para una aplicación Next.js, NextAuth JWT, Prisma y PostgreSQL multi-tenant.

Codex implementó una capa común de autorización y migró dos rutas representativas.

Debes:

1. Revisar adversarialmente el código implementado.
2. Corregir directamente cualquier defecto crítico, alto o medio dentro del alcance.
3. Añadir únicamente las pruebas necesarias.
4. No auditar todavía todos los módulos.
5. No limitarte a emitir recomendaciones.
6. No hacer commit.

Después de esta fase, Codex realizará una revisión final de solo lectura.

# Política obligatoria de máxima eficiencia

* Revisa solo los archivos listados.
* No releas fases de billing ya cerradas.
* No ejecutes la suite completa durante el trabajo.
* Ejecuta únicamente las pruebas específicas de autorización.
* No repitas una prueba verde sin cambios relacionados.
* Typecheck y lint: máximo una vez al final.
* No ejecutes Prisma validate/generate si schema no cambia.
* No uses PostgreSQL real si el comportamiento puede demostrarse con repositorios inyectados.
* Usa integración real solo si una garantía depende de Prisma/PostgreSQL.
* Si aparece un timeout o error ambiental, no lo repitas automáticamente.
* Si encuentras un defecto dentro del alcance, corrígelo directamente.
* Informe breve: hallazgos, correcciones, pruebas y riesgos.

# 1. Estado inicial

Ejecuta:

```text
git status --short
git log -3 --oneline
git diff --check
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD es el commit del outbox:
  `2961225 feat(billing): add durable notification outbox`
* no hay staged diff;
* los cambios pendientes pertenecen únicamente a esta fase;
* schema, migraciones, billing, paquetes y entorno están intactos.

Si hay cambios inesperados, no los modifiques y marca `BLOQUEADO`.

# 2. Documentos y archivos obligatorios

Lee:

* `docs/programa-mejora/06-seguridad-multitenant-base/01-prompt-codex-auditoria-correccion-autorizacion-base.md`
* `docs/programa-mejora/06-seguridad-multitenant-base/02-respuesta-codex-auditoria-correccion-autorizacion-base.md`

Inspecciona completamente:

* `src/lib/authorization-core.ts`
* `src/lib/authorization.ts`
* `src/lib/authorization-response.ts`
* `src/lib/tenant-access-response.ts`
* `src/domains/organizations/tenant.service.ts`
* `src/domains/platform/permissions.ts`
* `src/app/api/platform/tenant-users/route.ts`
* `src/app/api/users/[id]/route.ts`
* `tests/unit/authorization.test.ts`

Inspecciona solo como contexto necesario:

* configuración NextAuth;
* callbacks JWT/session;
* tipos de Session/User;
* `getTenantIdFromSession`;
* middleware;
* servicio de usuarios llamado por `/api/users/[id]`.

# 3. Verificación de afirmaciones de Codex

Verifica:

1. Usuario eliminado falla cerrado.
2. Usuario inactivo falla cerrado.
3. Rol actual se obtiene de DB.
4. Tenant actual se obtiene de DB.
5. Rol reducido invalida permisos antiguos.
6. Cambio de tenant invalida el tenant antiguo.
7. SUPER_ADMIN puede existir sin tenant.
8. SUPER_ADMIN requiere target explícito.
9. ADMIN solo opera en su tenant.
10. CONSEJO y RESIDENTE no elevan permisos.
11. Tenant suspendido/cancelado bloquea según política.
12. Los inputs cliente no conceden autorización.
13. Recursos cross-tenant devuelven respuesta indistinguible.
14. Las dos rutas representativas usan la capa común.
15. No se filtran sesión, email, stack o errores Prisma.
16. Billing no fue modificado.

Para cada afirmación indica:

* confirmada;
* confirmada con matices;
* incorrecta;
* no demostrada.

# 4. Fuente de verdad y stale JWT

Este es el punto principal.

Confirma que los helpers usan del JWT únicamente una identidad mínima autenticada, normalmente:

```text
session.user.id
```

Rol, tenant, actividad y estados sensibles deben salir de la DB actual.

Revisa especialmente:

* qué ocurre si `session.user.id` falta;
* qué ocurre si el usuario ya no existe;
* si existe cualquier fallback a:

  * `session.user.role`;
  * `session.user.tenantId`;
  * `session.user.isActive`;
  * licencia antigua del JWT;
* si un error de DB produce acceso fail-open;
* si un rol desconocido puede convertirse en un rol válido por cast.

No permitas que una excepción de consulta reutilice claims antiguos.

# 5. `assertSessionClaimsCurrent`

Evalúa si rechazar una sesión cuando role/tenant del JWT no coinciden con DB es correcto.

Debe quedar una política inequívoca:

* la DB siempre decide permisos;
* una sesión con claims antiguos nunca conserva privilegios;
* si se rechaza por claims obsoletos, el error debe ser controlado;
* no debe crear un bucle permanente si el usuario únicamente cambió de rol o tenant;
* no debe depender del cliente para refrescar seguridad.

Si es más seguro usar directamente la identidad actual de DB y reservar el chequeo de claims para ciertos caminos, corrige el diseño.

No mantengas dos políticas contradictorias entre helpers.

# 6. Contratos comunes

Revisa:

* `requireAuthenticatedUser`
* `requireActiveTenantUser`
* `requireTenantRole`
* `requireSuperAdmin`
* `requireSuperAdminTenantTarget`
* `assertSameTenant`
* `tenantScopedWhere`
* `assertSessionClaimsCurrent`

Confirma:

* firmas claras;
* tipos estrictos;
* roles permitidos exhaustivos;
* errores estables;
* cero fallback ambiguo;
* responsabilidades no duplicadas;
* una sola consulta razonable por operación, evitando lecturas innecesarias;
* ningún helper acepta una identidad construida por el cliente.

Elimina duplicación peligrosa, pero evita rediseñar toda la aplicación.

# 7. Usuario y tenant

La identidad actual debe validar:

## Usuario

* existe;
* está activo;
* tiene rol reconocido.

## Roles tenant

ADMIN, CONSEJO y RESIDENTE deben:

* tener tenant;
* pertenecer realmente a ese tenant;
* encontrar tenant existente;
* cumplir política de estado y licencia.

## SUPER_ADMIN

Debe:

* poder existir sin tenant;
* estar activo;
* tener rol actual SUPER_ADMIN en DB;
* requerir target explícito para operar sobre un tenant;
* validar que el target existe;
* no usar tenant de sesión como fallback.

Comprueba qué sucede si un SUPER_ADMIN tiene accidentalmente `tenantId`.

# 8. Estado del tenant y suscripción

Verifica que la política implementada coincide con la existente.

Estados autorizados reportados:

* TRIAL.
* ACTIVE.
* GRACE_PERIOD.

Estados bloqueados:

* PENDING_PAYMENT.
* SUSPENDED.
* CANCELLED.

Determina:

* si se valida estado del Tenant;
* si se valida Subscription;
* qué ocurre si falta Subscription;
* qué ocurre si Tenant y Subscription se contradicen;
* si CONSEJO y RESIDENTE reciben la misma política;
* si SUPER_ADMIN conserva supervisión.

No reabras la lógica económica de billing.

Corrige solo inconsistencias de autorización.

# 9. Rutas representativas

## `/api/platform/tenant-users`

Confirma:

* `auth()` requerido;
* SUPER_ADMIN revalidado en DB;
* target tenant obligatorio;
* target validado;
* sin fallback;
* query no permite enumerar tenants;
* errores sin PII;
* parámetros inválidos controlados.

## `/api/users/[id]`

Confirma para GET, PATCH y DELETE:

* ADMIN actual revalidado;
* tenant deriva de identidad del servidor;
* `id` objetivo no concede acceso;
* búsqueda usa `id + tenantId`;
* PATCH no permite cambiar:

  * tenant;
  * rol a SUPER_ADMIN;
  * campos prohibidos;
* DELETE no puede eliminar usuario de otro tenant;
* no puede eliminar un SUPER_ADMIN mediante una ruta tenant;
* no revela si el ID existe en otro tenant;
* el servicio vuelve a validar tenant cuando corresponda.

Corrige cualquier IDOR o elevación encontrada.

# 10. Adaptador HTTP

Revisa `authorization-response.ts`.

Confirma mapeo coherente:

* UNAUTHENTICATED → 401.
* USER_INACTIVE → 403.
* TENANT_REQUIRED → 403.
* TENANT_INACTIVE → 403.
* FORBIDDEN → 403.
* RESOURCE_NOT_FOUND → 404.

El body debe:

* ser estable;
* no incluir stack;
* no incluir causa interna;
* no incluir email;
* no incluir datos Prisma;
* no distinguir recurso ausente de cross-tenant.

No conviertas errores internos inesperados en respuestas que revelen detalles.

# 11. Middleware

El middleware puede usar JWT para navegación, pero no es una frontera suficiente.

Confirma:

* ninguna corrección depende únicamente del middleware;
* APIs migradas revalidan en servidor;
* un claim antiguo puede como máximo mostrar una página que la API luego bloquea;
* no se agregó lógica DB incompatible con Edge.

No amplíes middleware salvo defecto directo.

# 12. Rendimiento

La revalidación por operación es necesaria, pero debe ser eficiente.

Revisa:

* consultas duplicadas a User/Tenant/Subscription;
* helper que consulta DB varias veces en la misma ruta;
* selección excesiva de campos;
* serialización innecesaria;
* lecturas repetidas entre `requireTenantRole` y `assertSessionClaimsCurrent`.

Corrige duplicación evidente usando una identidad ya resuelta.

No introduzcas caché de seguridad con claims obsoletos.

# 13. Pruebas

Revisa las 22 pruebas existentes.

Cada prueba debe ejecutar la decisión real, no duplicar manualmente su lógica.

Casos obligatorios:

1. Sin sesión.
2. Usuario eliminado.
3. Usuario inactivo.
4. Rol reducido.
5. Cambio de tenant.
6. Usuario tenant-role sin tenant.
7. SUPER_ADMIN sin tenant.
8. SUPER_ADMIN con target explícito.
9. SUPER_ADMIN con target inexistente.
10. ADMIN cross-tenant.
11. CONSEJO en acción ADMIN.
12. RESIDENTE en acción ADMIN.
13. Recurso propio.
14. Recurso cross-tenant.
15. tenantId falsificado.
16. Tenant suspendido.
17. Tenant cancelado.
18. Rol desconocido.
19. Error indistinguible cross-tenant.
20. Claims antiguos no prevalecen.
21. Camino permitido.
22. Fallo del repositorio/DB es fail-closed.

Añade pruebas solo si faltan garantías.

## Pruebas de rutas

Añade pruebas específicas ligeras para las dos rutas únicamente si el comportamiento no está demostrado por las pruebas actuales.

No levantes servidor.

No uses navegador.

Mockea `auth()` y repositorios de forma controlada si el patrón del proyecto lo permite.

Usa PostgreSQL real solo si necesitas demostrar una restricción o query que no pueda comprobarse de otra forma.

# 14. Archivos permitidos

Puedes modificar únicamente:

* los diez archivos de esta fase;
* el servicio de usuarios llamado por `/api/users/[id]`, si contiene un defecto directamente relacionado;
* pruebas específicas de autorización/rutas;
* documentos 03 y 04.

No modificar:

* schema;
* migraciones;
* billing;
* UI general;
* package files;
* `.env`;
* `.env.test`;
* módulos completos.

# 15. Ejecución eficiente

Durante la corrección ejecuta solo:

```text
node --import tsx --test tests/unit/authorization.test.ts
```

Y cualquier archivo nuevo específico de rutas, si lo creas.

Cuando todo esté estable, ejecuta una vez:

```text
npx tsc --noEmit
npm run lint
```

No ejecutes la suite completa.

No ejecutes Prisma.

No repitas una prueba verde sin cambios relacionados.

# 16. Criterios de aceptación

La fase queda corregida si:

1. Usuario eliminado falla cerrado.
2. Usuario inactivo falla cerrado.
3. DB prevalece sobre JWT.
4. No existen fallbacks a claims sensibles.
5. Rol reducido pierde privilegios.
6. Cambio de tenant invalida tenant anterior.
7. SUPER_ADMIN sin tenant funciona.
8. Target SUPER_ADMIN es explícito.
9. Roles tenant requieren tenant válido.
10. Tenant bloqueado niega acceso.
11. IDOR representativo queda cerrado.
12. PATCH no permite elevación.
13. DELETE no cruza tenant.
14. Errores no filtran existencia.
15. Revalidación es reutilizable.
16. No hay consultas duplicadas graves.
17. Pruebas específicas pasan.
18. Typecheck pasa.
19. Lint pasa.
20. Billing y entorno intactos.
21. No se hace commit.

# 17. Informe final

Entrega un informe técnico breve:

1. Estado inicial.
2. Verificación de Codex.
3. Hallazgos.
4. Correcciones.
5. Fuente de verdad.
6. Stale JWT.
7. Contratos.
8. SUPER_ADMIN.
9. Tenant roles.
10. Estados y licencia.
11. Rutas representativas.
12. IDOR y elevación.
13. Errores.
14. Rendimiento.
15. Archivos modificados.
16. Pruebas específicas.
17. Typecheck/lint.
18. Riesgos restantes.
19. Módulos pendientes.
20. Recomendación para Codex.
21. Estado:

* CORREGIDO.
* CORREGIDO CON RIESGOS.
* BLOQUEADO.

## Finalización

* Guarda el informe en:
  `docs/programa-mejora/06-seguridad-multitenant-base/04-respuesta-claude-revision-correccion-autorizacion-base.md`
* Confirma que el prompt quedó guardado en el documento 03.
* No hagas commit.
* No hagas push.
* No crees tags.
* No audites todavía otros módulos.
* Detente después del informe.
