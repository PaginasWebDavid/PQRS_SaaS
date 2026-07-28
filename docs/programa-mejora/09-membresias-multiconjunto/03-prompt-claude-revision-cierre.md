# FASE 6B — REVISIÓN FINAL Y CIERRE MULTI-CONJUNTO

Guarda este prompt en:

`docs/programa-mejora/09-membresias-multiconjunto/03-prompt-claude-revision-cierre.md`

Guarda el informe en:

`docs/programa-mejora/09-membresias-multiconjunto/04-respuesta-claude-revision-cierre.md`

## Regla

Revisa adversarialmente la implementación multi-conjunto.

* Corrige directamente defectos críticos, altos o medios.
* Si modificas código, pruebas, schema o migración: no hagas commit.
* Si no modificas nada, la suite completa final queda verde y no hay defectos medios o superiores: haz el commit en esta misma intervención.
* No abras otra fase.

## Eficiencia

* No revises rama, HEAD, historial ni staged al comenzar.
* Revisa únicamente el diff de Fase 6A y sus consumidores directos.
* No repitas pruebas focalizadas ya verdes salvo inconsistencia concreta.
* No ejecutes Prisma migrate nuevamente si la migración ya está aplicada en la base de pruebas.
* Typecheck/lint solo si modificas código.
* La suite completa sí debe ejecutarse una vez sobre el estado final, porque la última corrida integral fue 462/464 y las dos correcciones solo se validaron focalizadamente.
* No repitas la suite si queda verde.
* Si falla, corrige únicamente fallos reales relacionados y no hagas una segunda suite completa automática.

## Revisión prioritaria

### 1. Modelo y migración

Confirma:

* `TenantMembership` representa rol, estado y datos dependientes del tenant.
* `User` conserva identidad global.
* `@@unique([userId, tenantId])`.
* No puede existir membresía `SUPER_ADMIN`.
* El backfill:

  * crea una membresía por usuario tenant;
  * excluye SUPER_ADMIN;
  * copia correctamente rol, estado, ubicación, onboarding y preferencias;
  * no pierde datos;
  * es idempotente o tolerante a ejecución controlada;
  * no depende de columnas o valores que puedan ser `NULL` de forma inesperada.
* La migración aditiva puede desplegarse antes del código.
* No existe lógica nueva que escriba solo columnas legacy y olvide la membresía.

Busca específicamente escrituras restantes a:

```text
User.tenantId
User.role
User.bloque
User.apto
User.onboardingCompletedAt
User.notifyNewPqrsEmail
```

Distingue entre:

* compatibilidad deliberada;
* fuente de autorización incorrecta;
* escritura que pueda provocar divergencia.

### 2. Rol global y SUPER_ADMIN

Confirma que:

* SUPER_ADMIN continúa siendo identidad global.
* No recibe membresía automáticamente.
* El rol tenant siempre sale de `TenantMembership`.
* Los aliases legacy de sesión no permiten convertir un rol tenant en SUPER_ADMIN.
* Un usuario tenant no puede fabricar contexto global modificando cookie, JWT o body.
* El campo legacy `User.role` no vuelve a convertirse accidentalmente en fuente de autorización tenant.

### 3. Selección de tenant

Revisa:

* cookie `HttpOnly`;
* `Secure` en producción;
* `SameSite` apropiado;
* firma HMAC con secreto fuerte existente;
* comparación segura de firma;
* expiración;
* vinculación al `userId`;
* rechazo de cookie alterada, antigua o de otro usuario;
* no guardar rol confiable dentro de la cookie;
* POST protegido frente a CSRF según el mecanismo real de la aplicación;
* tenant ajeno e inexistente con respuesta opaca.

Reglas:

* una membresía activa: selección automática;
* múltiples membresías: selección explícita;
* selección inválida: falla cerrada;
* membresía desactivada: revocación en el siguiente request;
* rol cambiado: efecto en el siguiente request.

### 4. Autorización común

Confirma que las APIs sensibles reconstruyen desde DB:

```text
userId
membershipId
tenantId
role
User.isActive
TenantMembership.isActive
tenant/licencia
```

Revisa que:

* `requireActiveTenantUser`;
* `requireTenantRole`;
* `tenantScopedWhere`;
* `assertSameTenant`;

usen la membresía seleccionada y no `User.tenantId` o `User.role`.

El middleware puede usar claims únicamente para navegación.

### 5. Invitaciones

Verifica ambos caminos:

#### Email nuevo

* crea User;
* crea Membership;
* acepta invitación;
* todo atómico;
* password y datos globales correctos.

#### Email existente

* identifica la cuenta normalizando email de la misma forma;
* crea solo Membership;
* no cambia password, avatar, nombre ni otras membresías;
* no permite agregar una membresía a una cuenta global inactiva sin política explícita;
* no filtra que el email ya existe antes de validar el token;
* una membresía existente no consume indebidamente la invitación;
* dos aceptaciones concurrentes crean una sola membresía.

Confirma que token, CAS, locks, expiración, reenvío y cancelación siguen intactos.

### 6. Gestión de usuarios

Confirma:

* las rutas gestionan membresías del tenant, no la identidad global;
* se conserva `userId` en URL, pero la escritura resuelve `userId + tenantId`;
* cambiar rol afecta solo una membresía;
* desactivar membresía no desactiva `User`;
* último ADMIN se calcula por membresías activas;
* auto-desactivación y auto-degradación se aplican a la membresía actual;
* un usuario ADMIN en A y RESIDENTE en B funciona correctamente;
* SUPER_ADMIN target explícito continúa funcionando.

### 7. Onboarding

Confirma separación:

* nombre/teléfono globales → `User`;
* bloque/apto/onboarding tenant → `TenantMembership`;
* configuración del conjunto → `Tenant`.

Completar onboarding en A no puede modificar B.

### 8. Compatibilidad transversal

Revisa únicamente las modificaciones hechas en:

* PQRS;
* dashboard/actividad/reportes;
* notificaciones;
* billing outbox;
* Mercado Pago;
* login/middleware;
* perfil/cambio y recuperación de contraseña.

Confirma:

* aislamiento por membresía;
* destinatarios requieren `User.isActive` y `Membership.isActive`;
* no se mezclan destinatarios de varios conjuntos;
* billing no toma el tenant equivocado del usuario;
* recuperación de contraseña sigue siendo global por cuenta;
* ningún endpoint sensible confía en aliases legacy de sesión.

### 9. UI del selector

Confirma:

* solo muestra membresías activas;
* no aparece con una sola membresía;
* obliga a seleccionar con varias;
* muestra nombre y rol correctos;
* refresca sesión/contexto antes de navegar;
* no mezcla rutas o permisos del tenant anterior;
* manipular el frontend no concede acceso.

No hagas rediseño visual.

### 10. Pruebas

Revisa que las pruebas cubran realmente:

* backfill;
* SUPER_ADMIN sin membresía;
* una y varias membresías;
* selección válida/ajena/inactiva;
* cookie manipulada;
* rol diferente por tenant;
* revocación inmediata;
* gestión administrativa tenant-scoped;
* último ADMIN;
* invitación con email nuevo;
* invitación con email existente;
* aceptación concurrente;
* onboarding aislado;
* PQRS aislado;
* usuario global inactivo;
* destinatarios por membresía;
* camino legacy de un solo conjunto.

## Suite final obligatoria

Si no modificaste código durante la revisión, ejecuta una sola vez el runner seguro de suite completa sobre la DB de pruebas.

Resultado requerido para commit:

```text
0 fail
0 skipped
0 todo
exit code 0
```

El número total puede ser mayor a 464 si se agregaron pruebas, pero debe reportarse exactamente.

Si la suite falla:

* no la repitas automáticamente;
* clasifica cada fallo;
* corrige solo si es un defecto real dentro de esta fase;
* no hagas commit.

## Riesgos

Clasifica:

* columnas legacy coexistentes;
* divergencia durante transición;
* orden migración → código;
* middleware con claims de navegación;
* ausencia de E2E visual;
* scripts o consultas externas legacy.

Indica qué bloquea:

* commit;
* despliegue transitorio;
* eliminación posterior de columnas legacy.

## Commit automático

Solo si:

* no modificaste código ni pruebas;
* la suite completa final está verde;
* no queda defecto crítico, alto o medio;
* no hay secretos reales en el diff.

Añade los archivos de Fase 6A y:

`docs/programa-mejora/09-membresias-multiconjunto/`

Crea:

```text
git commit -m "feat(auth): add multi-tenant memberships"
```

No repitas pruebas después del commit.

## Informe

Entrega únicamente:

1. Defectos encontrados.
2. Correcciones, si hubo.
3. Migración y columnas legacy.
4. Selección y autorización.
5. Invitaciones y usuarios.
6. Compatibilidad transversal.
7. Suite completa final.
8. Riesgos.
9. Resultado:

   * `APROBADO Y COMMIT CREADO`.
   * `CORREGIDO; REQUIERE REVISIÓN FINAL`.
   * `BLOQUEADO`.

Si creas commit, informa el hash solo en la respuesta de sesión.
