# FASE 3A — BASE DE AUTORIZACIÓN Y AISLAMIENTO MULTI-TENANT

## Documentación automática

Antes de trabajar:

1. Guarda este prompt completo en:

`docs/programa-mejora/06-seguridad-multitenant-base/01-prompt-codex-auditoria-correccion-autorizacion-base.md`

2. Al terminar, guarda el informe completo en:

`docs/programa-mejora/06-seguridad-multitenant-base/02-respuesta-codex-auditoria-correccion-autorizacion-base.md`

No hagas commit, push ni tags.

---

Actúa como ingeniero principal de seguridad para una aplicación Next.js, NextAuth, Prisma y PostgreSQL multi-tenant.

Debes:

1. Auditar la base de autenticación, autorización, roles y aislamiento por conjunto.
2. Corregir directamente cualquier defecto encontrado dentro del alcance.
3. Añadir pruebas de regresión específicas.
4. No limitarte a emitir recomendaciones.
5. No rediseñar módulos completos todavía.

## Objetivo

Garantizar que:

* ningún usuario pueda leer o modificar datos de otro conjunto;
* ningún rol pueda elevar sus permisos;
* un `tenantId` recibido desde cliente nunca sea fuente de autorización;
* SUPER_ADMIN, ADMIN, CONSEJO y RESIDENTE tengan límites explícitos;
* usuarios inactivos, conjuntos suspendidos y sesiones antiguas se manejen correctamente;
* rutas, server actions y servicios reutilicen una base común de autorización.

Esta fase cubre únicamente la **infraestructura común**. Los módulos se revisarán después uno por uno.

# Política obligatoria de eficiencia

Optimiza consumo de tokens, créditos y tiempo:

* Inspecciona solo archivos relacionados.
* No releas documentos de fases cerradas salvo que sean indispensables.
* No ejecutes la suite completa durante el desarrollo.
* Ejecuta únicamente pruebas específicas del módulo de autorización.
* No repitas una prueba que ya pasó sin cambios relacionados.
* Ejecuta typecheck y lint una sola vez, al final.
* Suite completa: máximo una vez al final de la subfase y solo si la infraestructura de pruebas está estable.
* Si la base remota falla por timeout ambiental, no repitas automáticamente.
* No ejecutes migraciones desde cero si schema no cambia.
* No hagas informes excesivamente largos: evidencia, correcciones, pruebas y riesgos.
* Si encuentras un error dentro del alcance y puedes corregirlo, corrígelo directamente.

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

* el commit del outbox ya es HEAD;
* no hay staged diff;
* no quedan cambios pendientes de fases anteriores;
* `.env`, `.env.test`, package files y migraciones están limpios.

Si hay cambios inesperados, no los modifiques y marca `BLOQUEADO`.

# 2. Inspección mínima obligatoria

Localiza e inspecciona únicamente:

* configuración de NextAuth;
* callbacks de sesión/JWT;
* tipos extendidos de `Session` y `User`;
* helpers actuales de autenticación;
* helpers de roles;
* helpers de tenant;
* Prisma client y servicios base;
* middleware, si existe;
* rutas o acciones representativas que muestren el patrón actual;
* pruebas existentes de auth, roles y tenant.

Busca globalmente:

```text
auth(
getServerSession
session.user
tenantId
role
SUPER_ADMIN
ADMIN
CONSEJO
RESIDENTE
isActive
licenseStatus
```

No audites todavía toda la lógica de PQRS, reservas, documentos o pagos de administración. Solo identifica cómo consumen la base común.

# 3. Diagnóstico

Determina:

1. Qué campos llegan realmente a la sesión.
2. De dónde sale `tenantId`.
3. De dónde sale `role`.
4. Si esos valores pueden quedar obsoletos.
5. Si el código confía en `tenantId` recibido por body, query o params.
6. Si existen helpers duplicados o contradictorios.
7. Si SUPER_ADMIN puede operar sin tenant.
8. Si ADMIN, CONSEJO y RESIDENTE están obligados a pertenecer a un tenant.
9. Qué ocurre con usuarios:

   * inactivos;
   * eliminados;
   * sin tenant;
   * con tenant suspendido;
   * con rol modificado después de iniciar sesión.
10. Si las consultas Prisma incluyen aislamiento por tenant.
11. Si existe riesgo de IDOR usando IDs de otro conjunto.
12. Si existen rutas fail-open.
13. Si los errores diferencian innecesariamente “existe pero no tienes permiso”.
14. Si los logs o respuestas filtran datos sensibles.

# 4. Contrato común esperado

Implementa o consolida una base común equivalente a:

```text
requireAuthenticatedUser()
requireActiveTenantUser()
requireTenantRole(...)
requireSuperAdmin()
assertSameTenant(...)
```

Adapta nombres al repositorio.

El contrato debe devolver una identidad autorizada obtenida en servidor, por ejemplo:

```text
{
  userId,
  role,
  tenantId,
  tenantStatus
}
```

## Reglas

### SUPER_ADMIN

* Puede existir sin `tenantId`.
* No debe convertirse automáticamente en usuario de un tenant.
* Para actuar sobre un conjunto debe recibir un target explícito y validado.
* No debe usar el tenant de la sesión como fallback ambiguo.

### ADMIN, CONSEJO y RESIDENTE

* Deben tener usuario activo.
* Deben pertenecer a un tenant.
* El tenant debe existir.
* Su acceso depende del estado de licencia según la política actual.
* Su rol se valida contra base de datos cuando la operación sea sensible.

### Fuente de verdad

* `userId` proviene de la sesión autenticada.
* Rol y tenant sensibles deben revalidarse en servidor.
* `tenantId` enviado por cliente solo puede ser un objetivo, nunca una prueba de autorización.
* Un ID de recurso debe resolverse y compararse contra el tenant autorizado.

# 5. Sesiones obsoletas

Corrige el comportamiento cuando, después de crear la sesión:

* el usuario se desactiva;
* cambia de rol;
* cambia de tenant;
* se elimina;
* el tenant se suspende o cancela.

Para operaciones protegidas:

* la base de datos actual debe prevalecer sobre claims antiguos;
* una sesión antigua no puede conservar permisos superiores;
* el acceso debe ser fail-closed.

No necesitas implementar revocación global de JWT si una revalidación común por operación resuelve el riesgo.

# 6. Aislamiento multi-tenant

Define helpers que eviten patrones inseguros como:

```text
where: { id: resourceId }
```

cuando el recurso pertenece a un tenant.

El patrón seguro debe ser equivalente a:

```text
where: {
  id: resourceId,
  tenantId: authorizedTenantId
}
```

o:

1. resolver el recurso;
2. comparar tenant;
3. negar sin revelar si pertenece a otro conjunto.

No cambies aún todos los módulos. Corrige:

* helpers comunes;
* servicios base;
* uno o dos usos representativos necesarios para demostrar el patrón.

Genera una lista de módulos que deberán migrarse después.

# 7. Roles

Crea una matriz explícita:

| Acción base | SUPER_ADMIN | ADMIN | CONSEJO | RESIDENTE |
| ----------- | ----------: | ----: | ------: | --------: |

Incluye como mínimo:

* entrar al panel global;
* operar dentro de un tenant;
* administrar usuarios;
* leer auditoría;
* actuar como residente;
* ejecutar acciones administrativas;
* acceder con tenant suspendido.

No inventes permisos funcionales detallados de módulos; usa las reglas existentes.

# 8. Errores

Usa errores controlados equivalentes a:

* `UNAUTHENTICATED`;
* `USER_INACTIVE`;
* `TENANT_REQUIRED`;
* `TENANT_INACTIVE`;
* `FORBIDDEN`;
* `RESOURCE_NOT_FOUND`.

Evita revelar si un recurso existe en otro tenant.

No expongas stack, sesión completa, email, tokens ni detalles Prisma.

# 9. Cambios permitidos

Puedes modificar únicamente lo necesario dentro de:

* configuración y helpers de auth;
* tipos de sesión;
* helpers de roles/tenant;
* servicios comunes de autorización;
* middleware, solo si realmente participa en seguridad;
* una o dos rutas/acciones representativas;
* pruebas de auth/autorización/tenant;
* documentos 01 y 02.

No modificar:

* schema o migraciones, salvo defecto imprescindible demostrado;
* billing ya cerrado;
* UI completa;
* módulos enteros;
* package files;
* `.env`;
* `.env.test`.

Si necesitas tocar schema, detente y documenta primero por qué no puede resolverse sin migración.

# 10. Pruebas específicas obligatorias

Añade pruebas para:

1. Usuario sin sesión.
2. Usuario eliminado con JWT antiguo.
3. Usuario inactivo con sesión válida.
4. Rol reducido después de iniciar sesión.
5. Cambio de tenant después de iniciar sesión.
6. Usuario normal sin tenant.
7. SUPER_ADMIN sin tenant.
8. ADMIN intentando actuar sobre otro tenant.
9. CONSEJO intentando acción exclusiva de ADMIN.
10. RESIDENTE intentando acción administrativa.
11. Recurso propio.
12. ID de recurso de otro tenant.
13. `tenantId` falsificado en body/query.
14. Tenant suspendido.
15. Tenant cancelado.
16. Rol inválido o no reconocido.
17. Error sin filtración de existencia cross-tenant.
18. Dos tenants con IDs de recursos distintos.
19. Helper no confía en claims antiguos.
20. Camino autorizado sigue funcionando.

Usa pruebas puras para matrices y decisiones cuando sea posible.

Usa PostgreSQL real solo donde sea necesario para demostrar aislamiento.

No uses `skip`.

# 11. Ejecución eficiente

Durante implementación ejecuta solo pruebas específicas, por ejemplo:

```text
node --import tsx --test tests/unit/*auth*.test.ts
node --import tsx --test tests/*authorization*.test.ts
```

Adapta las rutas reales.

Cuando estén verdes, ejecuta una sola vez:

```text
npx tsc --noEmit
npm run lint
```

Suite completa:

* máximo una vez;
* solo al final;
* únicamente si la base de pruebas está estable;
* si falla por el problema ambiental ya documentado, no repetir automáticamente;
* clasificar qué pruebas fallaron y si pertenecen al cambio.

No ejecutes Prisma validate/generate si schema no cambió.

# 12. Criterios de aceptación

La fase queda implementada si:

1. Existe un contrato común de autorización.
2. La base de datos prevalece sobre claims antiguos.
3. Roles están centralizados.
4. Tenant se obtiene y valida en servidor.
5. Inputs del cliente no conceden acceso.
6. SUPER_ADMIN sin tenant funciona correctamente.
7. Usuarios normales sin tenant fallan cerrados.
8. Usuario inactivo/eliminado pierde acceso.
9. Tenant suspendido/cancelado se maneja según política.
10. Existe un patrón seguro para recursos tenant-scoped.
11. Errores no filtran existencia cross-tenant.
12. Pruebas específicas pasan.
13. Typecheck pasa.
14. Lint pasa.
15. No se modifica billing.
16. No se modifica entorno.
17. No se hace commit.

# 13. Informe final

Entrega un informe breve pero suficiente:

1. Estado inicial.
2. Diagnóstico.
3. Vulnerabilidades encontradas.
4. Correcciones realizadas.
5. Contrato común.
6. Sesiones obsoletas.
7. SUPER_ADMIN.
8. Roles tenant.
9. Aislamiento.
10. Errores.
11. Archivos modificados.
12. Pruebas específicas.
13. Typecheck/lint.
14. Suite completa, solo si se ejecutó.
15. Riesgos restantes.
16. Módulos que deben migrarse después.
17. Recomendación para Claude.
18. Estado:

* IMPLEMENTADO.
* IMPLEMENTADO CON RIESGOS.
* BLOQUEADO.

## Finalización

* Guarda el informe en `02-respuesta-codex-auditoria-correccion-autorizacion-base.md`.
* No hagas commit.
* No hagas push.
* No crees tags.
* No audites todavía todos los módulos.
* Detente después del informe.
