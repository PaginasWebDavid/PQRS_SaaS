import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSameTenant,
  assertSessionClaimsCurrent,
  AuthorizationError,
  createAuthorizationService,
  getAuthorizationFailure,
  tenantScopedWhere,
  type AuthorizationRepository,
  type AuthorizationSession,
  type AuthorizationUserRecord,
} from "../../src/lib/authorization-core";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

function activeTenant(id: string) {
  return { id, status: "ACTIVE" as const };
}

function user(
  overrides: Partial<AuthorizationUserRecord> = {}
): AuthorizationUserRecord {
  const tenantId = overrides.tenantId === undefined ? TENANT_A : overrides.tenantId;
  return {
    id: "user-1",
    role: "ADMIN",
    tenantId,
    isActive: true,
    tenant: tenantId
      ? {
          id: tenantId,
          status: "ACTIVE",
          subscriptionStatus: "ACTIVE",
        }
      : null,
    ...overrides,
  };
}

function session(
  overrides: Partial<NonNullable<AuthorizationSession["user"]>> = {}
): AuthorizationSession {
  return {
    user: {
      id: "user-1",
      role: "ADMIN",
      tenantId: TENANT_A,
      ...overrides,
    },
  };
}

function setup(initialUsers: AuthorizationUserRecord[] = [user()]) {
  const users = new Map(initialUsers.map((entry) => [entry.id, entry]));
  const tenants = new Map([
    [TENANT_A, activeTenant(TENANT_A)],
    [TENANT_B, activeTenant(TENANT_B)],
  ]);
  const repository: AuthorizationRepository = {
    async findUserById(userId) {
      return users.get(userId) ?? null;
    },
    async findTenantById(tenantId) {
      return tenants.get(tenantId) ?? null;
    },
  };
  return { service: createAuthorizationService(repository), users, tenants };
}

async function rejectsCode(
  operation: () => Promise<unknown>,
  code: AuthorizationError["code"]
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof AuthorizationError);
    assert.equal(error.code, code);
    return true;
  });
}

function throwsCode(operation: () => unknown, code: AuthorizationError["code"]) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof AuthorizationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("1. usuario sin sesion falla UNAUTHENTICATED", async () => {
  const { service } = setup();
  await rejectsCode(() => service.requireAuthenticatedUser(null), "UNAUTHENTICATED");
});

test("2. usuario eliminado con JWT antiguo falla cerrado", async () => {
  const { service } = setup([]);
  await rejectsCode(
    () => service.requireAuthenticatedUser(session()),
    "UNAUTHENTICATED"
  );
});

test("3. usuario inactivo con sesion valida pierde acceso", async () => {
  const { service } = setup([user({ isActive: false })]);
  await rejectsCode(
    () => service.requireAuthenticatedUser(session()),
    "USER_INACTIVE"
  );
});

test("4. rol reducido despues del login no conserva ADMIN", async () => {
  const { service } = setup([user({ role: "CONSEJO" })]);
  await rejectsCode(
    () => service.requireTenantRole(session({ role: "ADMIN" }), "ADMIN"),
    "FORBIDDEN"
  );
});

test("5. cambio de tenant usa la base y rechaza el tenant antiguo", async () => {
  const { service } = setup([
    user({
      tenantId: TENANT_B,
      tenant: { id: TENANT_B, status: "ACTIVE", subscriptionStatus: "ACTIVE" },
    }),
  ]);
  const identity = await service.requireActiveTenantUser(
    session({ tenantId: TENANT_A })
  );
  assert.equal(identity.tenantId, TENANT_B);
  throwsCode(() => assertSameTenant(identity, TENANT_A), "RESOURCE_NOT_FOUND");
  assert.doesNotThrow(() => assertSameTenant(identity, TENANT_B));
});

test("6. usuario tenant sin tenant falla TENANT_REQUIRED", async () => {
  const { service } = setup([user({ tenantId: null, tenant: null })]);
  await rejectsCode(
    () => service.requireActiveTenantUser(session({ tenantId: null })),
    "TENANT_REQUIRED"
  );
});

test("7. SUPER_ADMIN activo funciona sin tenant", async () => {
  const { service } = setup([
    user({ role: "SUPER_ADMIN", tenantId: null, tenant: null }),
  ]);
  const identity = await service.requireSuperAdmin(
    session({ role: "SUPER_ADMIN", tenantId: null })
  );
  assert.equal(identity.role, "SUPER_ADMIN");
  assert.equal(identity.tenantId, null);
});

test("8. ADMIN no puede actuar sobre otro tenant", async () => {
  const { service } = setup();
  const identity = await service.requireTenantRole(session(), "ADMIN");
  throwsCode(() => assertSameTenant(identity, TENANT_B), "RESOURCE_NOT_FOUND");
});

test("9. CONSEJO no puede ejecutar una accion exclusiva de ADMIN", async () => {
  const { service } = setup([user({ role: "CONSEJO" })]);
  await rejectsCode(
    () => service.requireTenantRole(session({ role: "CONSEJO" }), "ADMIN"),
    "FORBIDDEN"
  );
});

test("10. RESIDENTE no puede ejecutar una accion administrativa", async () => {
  const { service } = setup([user({ role: "RESIDENTE" })]);
  await rejectsCode(
    () => service.requireTenantRole(session({ role: "RESIDENTE" }), "ADMIN"),
    "FORBIDDEN"
  );
});

test("11. un recurso propio produce un filtro tenant-scoped", async () => {
  const { service } = setup();
  const identity = await service.requireTenantRole(session(), "ADMIN");
  assert.deepEqual(tenantScopedWhere(identity, "resource-a"), {
    id: "resource-a",
    tenantId: TENANT_A,
  });
});

test("12. un ID de recurso de otro tenant se oculta como no encontrado", async () => {
  const { service } = setup();
  const identity = await service.requireTenantRole(session(), "ADMIN");
  throwsCode(() => assertSameTenant(identity, TENANT_B), "RESOURCE_NOT_FOUND");
});

test("13. tenantId falsificado por cliente no cambia el filtro autorizado", async () => {
  const { service } = setup();
  const identity = await service.requireTenantRole(session(), "ADMIN");
  const clientBody = { tenantId: TENANT_B, resourceId: "resource-a" };
  assert.deepEqual(tenantScopedWhere(identity, clientBody.resourceId), {
    id: "resource-a",
    tenantId: TENANT_A,
  });
  throwsCode(
    () => assertSameTenant(identity, clientBody.tenantId),
    "RESOURCE_NOT_FOUND"
  );
});

test("14. tenant suspendido falla TENANT_INACTIVE", async () => {
  const { service } = setup([
    user({
      tenant: {
        id: TENANT_A,
        status: "SUSPENDED",
        subscriptionStatus: "ACTIVE",
      },
    }),
  ]);
  await rejectsCode(
    () => service.requireActiveTenantUser(session()),
    "TENANT_INACTIVE"
  );
});

test("15. tenant cancelado falla TENANT_INACTIVE", async () => {
  const { service } = setup([
    user({
      tenant: {
        id: TENANT_A,
        status: "CANCELLED",
        subscriptionStatus: "CANCELLED",
      },
    }),
  ]);
  await rejectsCode(
    () => service.requireActiveTenantUser(session()),
    "TENANT_INACTIVE"
  );
});

test("16. rol invalido o no reconocido falla FORBIDDEN", async () => {
  const { service } = setup([user({ role: "OWNER" })]);
  await rejectsCode(
    () => service.requireAuthenticatedUser(session({ role: "OWNER" })),
    "FORBIDDEN"
  );
});

test("17. error cross-tenant no filtra si el recurso existe", async () => {
  const { service } = setup();
  const identity = await service.requireTenantRole(session(), "ADMIN");
  let crossTenantError: unknown;
  let missingResourceError: unknown;
  try {
    assertSameTenant(identity, TENANT_B);
  } catch (error) {
    crossTenantError = error;
  }
  try {
    assertSameTenant(identity, null);
  } catch (error) {
    missingResourceError = error;
  }
  assert.deepEqual(
    getAuthorizationFailure(crossTenantError),
    getAuthorizationFailure(missingResourceError)
  );
});

test("18. dos tenants generan filtros de recursos diferentes", async () => {
  const first = setup([user()]);
  const second = setup([
    user({
      id: "user-2",
      tenantId: TENANT_B,
      tenant: { id: TENANT_B, status: "ACTIVE", subscriptionStatus: "ACTIVE" },
    }),
  ]);
  const identityA = await first.service.requireTenantRole(session(), "ADMIN");
  const identityB = await second.service.requireTenantRole(
    session({ id: "user-2", tenantId: TENANT_B }),
    "ADMIN"
  );
  assert.notDeepEqual(
    tenantScopedWhere(identityA, "resource-a"),
    tenantScopedWhere(identityB, "resource-b")
  );
});

test("19. el helper no confia en un claim SUPER_ADMIN antiguo", async () => {
  const { service } = setup([user({ role: "RESIDENTE" })]);
  await rejectsCode(
    () =>
      service.requireSuperAdmin(
        session({ role: "SUPER_ADMIN", tenantId: null })
      ),
    "FORBIDDEN"
  );
});

test("20. el camino autorizado de ADMIN sigue funcionando", async () => {
  const { service } = setup();
  const identity = await service.requireTenantRole(session(), "ADMIN");
  assert.deepEqual(identity, {
    userId: "user-1",
    role: "ADMIN",
    tenantId: TENANT_A,
    tenantStatus: "ACTIVE",
    subscriptionStatus: "ACTIVE",
  });
  assert.doesNotThrow(() => assertSessionClaimsCurrent(session(), identity));
});

test("21. SUPER_ADMIN requiere un target explicito y existente", async () => {
  const { service } = setup([
    user({ role: "SUPER_ADMIN", tenantId: null, tenant: null }),
  ]);
  const superSession = session({ role: "SUPER_ADMIN", tenantId: null });
  await rejectsCode(
    () => service.requireSuperAdminTenantTarget(superSession, null),
    "TENANT_REQUIRED"
  );
  const target = await service.requireSuperAdminTenantTarget(
    superSession,
    TENANT_B
  );
  assert.equal(target.targetTenantId, TENANT_B);
});

test("22. una suscripcion suspendida bloquea aunque el tenant este ACTIVE", async () => {
  const { service } = setup([
    user({
      tenant: {
        id: TENANT_A,
        status: "ACTIVE",
        subscriptionStatus: "SUSPENDED",
      },
    }),
  ]);
  await rejectsCode(
    () => service.requireActiveTenantUser(session()),
    "TENANT_INACTIVE"
  );
});

test("23. SUPER_ADMIN con target inexistente falla RESOURCE_NOT_FOUND", async () => {
  const { service } = setup([
    user({ role: "SUPER_ADMIN", tenantId: null, tenant: null }),
  ]);
  await rejectsCode(
    () =>
      service.requireSuperAdminTenantTarget(
        session({ role: "SUPER_ADMIN", tenantId: null }),
        "tenant-inexistente"
      ),
    "RESOURCE_NOT_FOUND"
  );
});

test("24. SUPER_ADMIN con tenantId accidental no se convierte en usuario de tenant", async () => {
  const { service } = setup([
    user({
      role: "SUPER_ADMIN",
      tenantId: TENANT_A,
      tenant: { id: TENANT_A, status: "ACTIVE", subscriptionStatus: "ACTIVE" },
    }),
  ]);
  // No puede pasar por el gate de usuario de tenant...
  await rejectsCode(
    () => service.requireActiveTenantUser(session({ role: "SUPER_ADMIN" })),
    "FORBIDDEN"
  );
  // ...ni usar el filtro tenant-scoped como fallback ambiguo.
  const identity = await service.requireSuperAdmin(
    session({ role: "SUPER_ADMIN" })
  );
  throwsCode(() => tenantScopedWhere(identity, "resource-a"), "FORBIDDEN");
});

test("25. un claim de rol reducido en la sesion no bloquea al ADMIN real de la base", async () => {
  const { service } = setup([user({ role: "ADMIN" })]);
  // La sesion trae un claim viejo (CONSEJO) pero la base dice ADMIN: la base
  // prevalece en ambos sentidos y la operacion ADMIN procede sin bloqueo espurio.
  const identity = await service.requireTenantRole(
    session({ role: "CONSEJO" }),
    "ADMIN"
  );
  assert.equal(identity.role, "ADMIN");
});

test("26. un fallo del repositorio es fail-closed y no concede acceso", async () => {
  const failingRepository: AuthorizationRepository = {
    async findUserById() {
      throw new Error("db-unavailable");
    },
    async findTenantById() {
      throw new Error("db-unavailable");
    },
  };
  const service = createAuthorizationService(failingRepository);
  // La excepcion se propaga (se traduce a 500 en la ruta): nunca se reutilizan
  // claims antiguos del JWT para conceder acceso cuando la base falla.
  await assert.rejects(() => service.requireTenantRole(session(), "ADMIN"));
});
