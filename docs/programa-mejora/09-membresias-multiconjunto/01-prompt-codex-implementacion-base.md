# FASE 6A — MEMBRESÍAS MULTI-CONJUNTO Y SELECCIÓN DE TENANT

Guarda este prompt en:

`docs/programa-mejora/09-membresias-multiconjunto/01-prompt-codex-implementacion-base.md`

Guarda el informe final en:

`docs/programa-mejora/09-membresias-multiconjunto/02-respuesta-codex-implementacion-base.md`

No hagas commit.

---

Implementa la arquitectura base para que un usuario pueda pertenecer a varios conjuntos utilizando el mismo email.

## Objetivo funcional

El modelo final debe permitir:

* un `User` global por email;
* múltiples membresías por usuario;
* un rol independiente en cada conjunto;
* una membresía activa seleccionada por sesión;
* cambio seguro entre conjuntos;
* invitaciones que agreguen membresías a usuarios existentes;
* aislamiento total por el conjunto seleccionado.

Ejemplo:

```text
maria@email.com
├── Conjunto A → ADMIN
├── Conjunto B → CONSEJO
└── Conjunto C → RESIDENTE
```

No dupliques usuarios para representar varios conjuntos.

## Eficiencia

* Inspecciona solo schema, autenticación, usuarios, invitaciones, onboarding y navegación necesaria para seleccionar conjunto.
* No reaudites PQRS, billing ni módulos ya cerrados.
* Corrige directamente dentro del alcance.
* Ejecuta pruebas específicas durante el desarrollo.
* Typecheck y lint una vez al final.
* Suite completa solo si el cambio final afecta transversalmente la autenticación.
* No hagas verificaciones repetidas de rama, HEAD o staged.
* No hagas commit.

# 1. Modelo objetivo

Implementa un modelo equivalente a:

```prisma
model TenantMembership {
  id        String   @id @default(uuid())
  userId    String
  tenantId  String
  role      UserRole
  isActive  Boolean  @default(true)

  bloque    String?
  apto      String?

  onboardingCompletedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@index([tenantId, role])
  @@index([userId, isActive])
}
```

Adapta nombres y relaciones al schema real.

## Separación correcta

### Datos globales del usuario

Deben permanecer en `User`:

* email;
* nombre;
* contraseña;
* imagen/avatar;
* teléfono global, si esa es la política actual;
* identidad y seguridad de la cuenta.

### Datos por conjunto

Deben vivir en la membresía:

* `tenantId`;
* rol;
* estado activo dentro del conjunto;
* bloque;
* apartamento;
* onboarding del conjunto;
* cualquier atributo residencial o administrativo dependiente del tenant.

No mantengas dos fuentes de verdad permanentes para rol o tenant.

# 2. Migración y backfill

Crea una migración Prisma aditiva y segura.

La migración debe:

1. Crear `TenantMembership`.
2. Crear una membresía para cada usuario tenant existente.
3. Copiar:

   * tenant;
   * rol;
   * estado;
   * bloque;
   * apartamento;
   * onboarding correspondiente.
4. No crear membresía para SUPER_ADMIN global salvo que exista una razón explícita.
5. Mantener temporalmente columnas antiguas únicamente si son necesarias para desplegar sin romper el sistema.
6. Evitar pérdida de usuarios o asociaciones.

No uses `prisma db push`.

Si mantienes columnas antiguas temporalmente:

* marca claramente que son compatibilidad transitoria;
* la lógica nueva no debe confiar en ellas;
* documenta cuándo podrán eliminarse.

# 3. Contexto de sesión

La sesión debe distinguir entre:

* identidad global;
* membresías disponibles;
* tenant actualmente seleccionado.

Contrato esperado:

```ts
{
  userId: string
  selectedTenantId: string | null
  selectedMembershipId: string | null
  role: UserRole | "SUPER_ADMIN"
}
```

La autorización real debe reconstruirse desde DB en cada request sensible.

No confíes únicamente en claims antiguos del JWT.

## Selección automática

* SUPER_ADMIN conserva su contexto global.
* Usuario con cero membresías activas: sin acceso tenant.
* Usuario con una sola membresía activa: selección automática.
* Usuario con varias membresías:

  * usa el tenant previamente seleccionado si sigue siendo válido;
  * si no existe selección válida, exige seleccionar conjunto;
  * no elijas silenciosamente el primer tenant.

# 4. Cambio de conjunto

Implementa un endpoint seguro equivalente a:

```text
POST /api/me/tenant
```

Payload:

```json
{
  "tenantId": "..."
}
```

Debe:

1. autenticar al usuario;
2. consultar una membresía activa `{ userId, tenantId }`;
3. rechazar tenants ajenos;
4. guardar la selección mediante el mecanismo seguro compatible con NextAuth;
5. devolver únicamente contexto sanitizado;
6. no aceptar rol desde el cliente;
7. no modificar la membresía.

Un tenant inexistente y uno ajeno deben producir una respuesta opaca.

# 5. Capa común de autorización

Adapta la capa existente para que:

```ts
requireActiveTenantUser()
requireTenantRole(...)
tenantScopedWhere()
assertSameTenant()
```

usen la membresía seleccionada.

El contexto tenant autorizado debe devolver como mínimo:

```ts
{
  userId
  membershipId
  tenantId
  role
}
```

Todas las rutas ya migradas deben seguir funcionando sin leer directamente:

```ts
user.tenantId
user.role
user.activo
```

El acceso debe derivarse de la membresía actual.

No reescribas todos los módulos si la capa común puede conservar compatibilidad.

# 6. Usuarios administrativos

Las rutas administrativas deben listar y gestionar **membresías del tenant**, aunque la respuesta pueda seguir representando personas.

Garantiza:

* ADMIN solo gestiona membresías de su tenant seleccionado.
* SUPER_ADMIN usa target explícito.
* CONSEJO y RESIDENTE siguen bloqueados.
* Un usuario puede ser ADMIN en un tenant y RESIDENTE en otro.
* Desactivar una membresía no desactiva globalmente la cuenta.
* Modificar rol afecta solo esa membresía.
* Último ADMIN se calcula por membresías activas del tenant.
* Auto-desactivación y auto-degradación se evalúan sobre la membresía actual.
* No se elimina la identidad global cuando se remueve acceso a un conjunto.

## Identificador

Decide y documenta si las rutas administrativas usan:

* `userId` scoped por tenant; o
* `membershipId`.

Prefiere el cambio que minimice ruptura, pero todas las escrituras deben identificar inequívocamente la membresía del tenant.

# 7. Invitaciones

Adapta el flujo seguro ya implementado.

Al aceptar una invitación:

## Email nuevo

* crea `User`;
* crea `TenantMembership`;
* marca invitación como aceptada;
* todo dentro de una transacción.

## Email existente

* no devuelve “email ya registrado” únicamente por existir globalmente;
* verifica que todavía no tenga membresía en ese tenant;
* crea una nueva membresía para ese usuario;
* no modifica sus membresías previas;
* no cambia su contraseña, avatar o datos globales;
* marca invitación como aceptada atómicamente.

## Membresía ya existente

Debe producir un resultado controlado:

* no duplica membresía;
* no cambia el rol silenciosamente;
* no consume una invitación incorrectamente;
* no revela información innecesaria.

Conserva:

* token hasheado;
* un solo uso;
* expiración;
* cancelación;
* CAS;
* locks;
* reenvío seguro;
* token anterior inválido.

## Invitaciones duplicadas

La unicidad debe evaluarse por:

```text
tenantId + email normalizado + invitación PENDING
```

No por existencia global del email.

# 8. Onboarding

El onboarding tenant debe actualizar la membresía seleccionada:

* bloque;
* apartamento;
* estado de onboarding;
* datos dependientes del conjunto.

No debe sobrescribir onboarding de otro tenant.

Los datos globales de perfil pueden actualizar `User` cuando corresponda.

Separa claramente:

```text
perfil global
vs.
datos del conjunto
```

# 9. Selector de conjunto

Implementa una interfaz mínima y funcional para usuarios con varias membresías.

Debe:

* mostrar únicamente membresías activas;
* mostrar nombre del conjunto y rol;
* indicar el conjunto seleccionado;
* permitir cambiar de tenant;
* refrescar la sesión o navegación correctamente;
* no mostrar el selector cuando solo existe una membresía;
* no permitir modificar el tenant por manipulación del frontend.

No rediseñes toda la interfaz.

Ubícalo en un lugar común del dashboard o navegación autenticada.

# 10. Compatibilidad con módulos existentes

Comprueba especialmente:

* PQRS;
* usuarios e invitaciones;
* dashboard;
* navegación por rol;
* middleware;
* notificaciones.

No reaudites su lógica completa.

Solo corrige referencias directas incompatibles como:

```text
session.user.tenantId
session.user.role
user.tenantId
user.role
```

cuando deban usar la membresía seleccionada.

El middleware puede usar claims para navegación, pero las APIs deben revalidar DB.

# 11. Riesgos de seguridad

Verifica:

1. Cambiar el `tenantId` del body no concede acceso.
2. Una cookie o claim antiguo no conserva una membresía eliminada.
3. Desactivar una membresía revoca acceso inmediatamente.
4. Cambiar rol se refleja en el siguiente request sensible.
5. Seleccionar otro tenant no conserva permisos del anterior.
6. Un usuario multi-tenant no ve datos mezclados.
7. El mismo `userId` no rompe consultas que asumían tenant único.
8. SUPER_ADMIN no se convierte en membresía tenant accidentalmente.
9. El tenant seleccionado no puede pertenecer a otro usuario.
10. Errores no enumeran membresías.

# 12. Pruebas mínimas

Añade pruebas para:

1. Backfill de usuario tenant a membresía.
2. SUPER_ADMIN sin membresía.
3. Usuario con una membresía se selecciona automáticamente.
4. Usuario con múltiples membresías requiere selección válida.
5. Cambio a membresía propia.
6. Cambio a tenant ajeno falla.
7. Membresía inactiva no puede seleccionarse.
8. Rol diferente por tenant.
9. Desactivar membresía revoca acceso.
10. Cambio de rol se refleja sin depender de JWT antiguo.
11. ADMIN gestiona solo membresías de su tenant.
12. Último ADMIN por membresía.
13. Desactivar membresía no desactiva User global.
14. Invitación con email nuevo crea User + Membership.
15. Invitación con email existente crea solo Membership.
16. Invitación no duplica membresía existente.
17. Dos aceptaciones concurrentes crean una membresía.
18. Rol y tenant salen de invitación.
19. Onboarding modifica solo membresía seleccionada.
20. PQRS conserva aislamiento usando contexto de membresía.
21. Selector devuelve solo membresías activas.
22. Error inesperado genérico.
23. Camino de un usuario de un solo conjunto sigue funcionando.
24. Camino multi-conjunto funciona de extremo a extremo.

Usa PostgreSQL de pruebas para:

* migración/backfill;
* unicidad;
* aceptación concurrente;
* último ADMIN;
* revocación de membresía.

# 13. Ejecución

Durante el desarrollo:

* pruebas focalizadas únicamente;
* no repitas archivos verdes sin cambios.

Al final:

```text
npx prisma validate
npx tsc --noEmit
npm run lint
```

Ejecuta la suite completa una sola vez únicamente si:

* la migración fue aplicada correctamente en la DB de pruebas;
* las pruebas focalizadas están verdes;
* no quedan fallos ambientales.

No reintentes automáticamente la suite completa.

# 14. Informe final

Entrega:

1. Modelo implementado.
2. Migración y backfill.
3. Contexto de sesión.
4. Selección de tenant.
5. Autorización común.
6. Usuarios y membresías.
7. Invitaciones.
8. Onboarding.
9. Selector visual.
10. Compatibilidad con módulos existentes.
11. Archivos modificados.
12. Pruebas focalizadas.
13. Suite completa, solo si se ejecutó.
14. Riesgos restantes.
15. Columnas legacy pendientes de eliminar.
16. Estado:

* `IMPLEMENTADO`.
* `IMPLEMENTADO CON MIGRACIÓN TRANSITORIA`.
* `BLOQUEADO`.

No hagas commit ni inicies otra fase.
