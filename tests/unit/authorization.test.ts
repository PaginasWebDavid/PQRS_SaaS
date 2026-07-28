import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSameTenant,
  assertSessionClaimsCurrent,
  AuthorizationError,
  createAuthorizationService,
  getAuthorizationFailure,
  tenantScopedWhere,
  type AuthorizationMembershipRecord,
  type AuthorizationRepository,
  type AuthorizationSession,
} from "../../src/lib/authorization-core";
import { resolveSelectedMembership } from "../../src/lib/tenant-selection";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

type FakeUser = {
  id: string;
  globalRole: string;
  isActive: boolean;
  memberships: AuthorizationMembershipRecord[];
};
function membership(tenantId = TENANT_A, role = "ADMIN", overrides: Partial<AuthorizationMembershipRecord> = {}): AuthorizationMembershipRecord {
  return {
    id: `membership-${tenantId}`,
    tenantId,
    role,
    isActive: true,
    tenant: { id: tenantId, status: "ACTIVE", subscriptionStatus: "ACTIVE" },
    ...overrides,
  };
}
function fakeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return { id: "user-1", globalRole: "RESIDENTE", isActive: true, memberships: [membership()], ...overrides };
}
function session(overrides: Partial<NonNullable<AuthorizationSession["user"]>> = {}): AuthorizationSession {
  return { user: { id: "user-1", role: "ADMIN", tenantId: TENANT_A, selectedTenantId: TENANT_A, selectedMembershipId: "membership-tenant-a", isActive: true, ...overrides } };
}
function setup(initialUsers: FakeUser[] = [fakeUser()]) {
  const users = new Map(initialUsers.map((entry) => [entry.id, entry]));
  const tenantIds = new Set([TENANT_A, TENANT_B]);
  const repository: AuthorizationRepository = {
    async findUserById(userId, preferredTenantId) {
      const user = users.get(userId);
      if (!user) return null;
      const active = user.memberships.filter((entry) => entry.isActive).map((entry) => ({
        ...entry,
        tenantName: entry.tenant.id,
        role: entry.role as "ADMIN" | "CONSEJO" | "RESIDENTE",
      }));
      const selected = user.globalRole === "SUPER_ADMIN" ? null : resolveSelectedMembership(active, preferredTenantId);
      return { id: user.id, globalRole: user.globalRole, isActive: user.isActive, membership: selected };
    },
    async findTenantById(tenantId) {
      return tenantIds.has(tenantId) ? { id: tenantId, status: "ACTIVE" } : null;
    },
  };
  return { service: createAuthorizationService(repository), users };
}
async function rejectsCode(operation: () => Promise<unknown>, code: AuthorizationError["code"]) {
  await assert.rejects(operation, (error: unknown) => error instanceof AuthorizationError && error.code === code);
}
function throwsCode(operation: () => unknown, code: AuthorizationError["code"]) {
  assert.throws(operation, (error: unknown) => error instanceof AuthorizationError && error.code === code);
}

test("1. sesion ausente falla cerrada", async () => {
  await rejectsCode(() => setup().service.requireAuthenticatedUser(null), "UNAUTHENTICATED");
});
test("2. usuario eliminado invalida la sesion", async () => {
  await rejectsCode(() => setup([]).service.requireAuthenticatedUser(session()), "UNAUTHENTICATED");
});
test("3. cuenta global inactiva no accede", async () => {
  await rejectsCode(() => setup([fakeUser({ isActive: false })]).service.requireAuthenticatedUser(session()), "USER_INACTIVE");
});
test("4. una membresia activa se selecciona automaticamente", async () => {
  const identity = await setup().service.requireTenantRole(session({ tenantId: null, selectedTenantId: null }), "ADMIN");
  assert.equal(identity.membershipId, "membership-tenant-a");
});
test("5. varias membresias sin seleccion exigen tenant", async () => {
  const user = fakeUser({ memberships: [membership(TENANT_A), membership(TENANT_B, "RESIDENTE")] });
  await rejectsCode(() => setup([user]).service.requireAuthenticatedUser(session({ tenantId: null, selectedTenantId: null })), "TENANT_REQUIRED");
});
test("6. seleccion propia elige la membresia correcta", async () => {
  const user = fakeUser({ memberships: [membership(TENANT_A), membership(TENANT_B, "RESIDENTE")] });
  const identity = await setup([user]).service.requireTenantRole(session({ tenantId: TENANT_B, selectedTenantId: TENANT_B }), "RESIDENTE");
  assert.equal(identity.tenantId, TENANT_B);
});
test("7. tenant ajeno no enumera y falla como seleccion ausente", async () => {
  const user = fakeUser({ memberships: [membership(TENANT_A), membership(TENANT_B, "RESIDENTE")] });
  await rejectsCode(() => setup([user]).service.requireAuthenticatedUser(session({ tenantId: "tenant-foreign", selectedTenantId: "tenant-foreign" })), "TENANT_REQUIRED");
});
test("8. membresia inactiva no puede seleccionarse", async () => {
  const user = fakeUser({ memberships: [membership(TENANT_A, "ADMIN", { isActive: false }), membership(TENANT_B, "RESIDENTE")] });
  const identity = await setup([user]).service.requireTenantRole(session({ tenantId: TENANT_A, selectedTenantId: TENANT_A }), "RESIDENTE");
  assert.equal(identity.tenantId, TENANT_B);
});
test("9. el mismo usuario tiene rol diferente por tenant", async () => {
  const user = fakeUser({ memberships: [membership(TENANT_A, "ADMIN"), membership(TENANT_B, "RESIDENTE")] });
  const a = await setup([user]).service.requireTenantRole(session(), "ADMIN");
  const b = await setup([user]).service.requireTenantRole(session({ tenantId: TENANT_B, selectedTenantId: TENANT_B }), "RESIDENTE");
  assert.equal(a.role, "ADMIN"); assert.equal(b.role, "RESIDENTE");
});
test("10. desactivar membresia revoca acceso en el siguiente request", async () => {
  const user = fakeUser(); const context = setup([user]);
  await context.service.requireTenantRole(session(), "ADMIN");
  user.memberships[0].isActive = false;
  await rejectsCode(() => context.service.requireTenantRole(session(), "ADMIN"), "TENANT_REQUIRED");
});
test("11. cambio de rol en DB ignora claim ADMIN antiguo", async () => {
  const user = fakeUser(); const context = setup([user]); user.memberships[0].role = "CONSEJO";
  await rejectsCode(() => context.service.requireTenantRole(session({ role: "ADMIN" }), "ADMIN"), "FORBIDDEN");
});
test("12. rol promovido en DB no queda bloqueado por claim viejo", async () => {
  const user = fakeUser({ memberships: [membership(TENANT_A, "ADMIN")] });
  const identity = await setup([user]).service.requireTenantRole(session({ role: "CONSEJO" }), "ADMIN");
  assert.equal(identity.role, "ADMIN");
});
test("13. CONSEJO no ejecuta accion ADMIN", async () => {
  await rejectsCode(() => setup([fakeUser({ memberships: [membership(TENANT_A, "CONSEJO")] })]).service.requireTenantRole(session(), "ADMIN"), "FORBIDDEN");
});
test("14. RESIDENTE no ejecuta accion ADMIN", async () => {
  await rejectsCode(() => setup([fakeUser({ memberships: [membership(TENANT_A, "RESIDENTE")] })]).service.requireTenantRole(session(), "ADMIN"), "FORBIDDEN");
});
test("15. tenant suspendido bloquea membresia valida", async () => {
  const m = membership(TENANT_A, "ADMIN", { tenant: { id: TENANT_A, status: "SUSPENDED", subscriptionStatus: "ACTIVE" } });
  await rejectsCode(() => setup([fakeUser({ memberships: [m] })]).service.requireTenantRole(session(), "ADMIN"), "TENANT_INACTIVE");
});
test("16. suscripcion suspendida bloquea tenant activo", async () => {
  const m = membership(TENANT_A, "ADMIN", { tenant: { id: TENANT_A, status: "ACTIVE", subscriptionStatus: "SUSPENDED" } });
  await rejectsCode(() => setup([fakeUser({ memberships: [m] })]).service.requireTenantRole(session(), "ADMIN"), "TENANT_INACTIVE");
});
test("17. SUPER_ADMIN funciona sin membresia", async () => {
  const identity = await setup([fakeUser({ globalRole: "SUPER_ADMIN", memberships: [] })]).service.requireSuperAdmin(session({ tenantId: null, selectedTenantId: null, role: "SUPER_ADMIN" }));
  assert.equal(identity.membershipId, null);
});
test("18. SUPER_ADMIN ignora membresia accidental", async () => {
  const service = setup([fakeUser({ globalRole: "SUPER_ADMIN", memberships: [membership()] })]).service;
  await rejectsCode(() => service.requireActiveTenantUser(session({ role: "SUPER_ADMIN" })), "FORBIDDEN");
});
test("19. SUPER_ADMIN exige target explicito", async () => {
  const service = setup([fakeUser({ globalRole: "SUPER_ADMIN", memberships: [] })]).service;
  await rejectsCode(() => service.requireSuperAdminTenantTarget(session({ role: "SUPER_ADMIN", tenantId: null, selectedTenantId: null }), null), "TENANT_REQUIRED");
});
test("20. target global inexistente es opaco", async () => {
  const service = setup([fakeUser({ globalRole: "SUPER_ADMIN", memberships: [] })]).service;
  await rejectsCode(() => service.requireSuperAdminTenantTarget(session({ role: "SUPER_ADMIN", tenantId: null, selectedTenantId: null }), "missing"), "RESOURCE_NOT_FOUND");
});
test("21. assertSameTenant acepta recurso propio", async () => {
  const identity = await setup().service.requireTenantRole(session(), "ADMIN"); assert.doesNotThrow(() => assertSameTenant(identity, TENANT_A));
});
test("22. recurso ajeno e inexistente son indistinguibles", async () => {
  const identity = await setup().service.requireTenantRole(session(), "ADMIN"); let a; let b;
  try { assertSameTenant(identity, TENANT_B); } catch (error) { a = error; }
  try { assertSameTenant(identity, null); } catch (error) { b = error; }
  assert.deepEqual(getAuthorizationFailure(a), getAuthorizationFailure(b));
});
test("23. tenantScopedWhere usa tenant autorizado y no body", async () => {
  const identity = await setup().service.requireTenantRole(session(), "ADMIN");
  assert.deepEqual(tenantScopedWhere(identity, "resource-1"), { id: "resource-1", tenantId: TENANT_A });
});
test("24. claim de tenant distinto no concede acceso cruzado", async () => {
  const identity = await setup().service.requireTenantRole(session(), "ADMIN");
  throwsCode(() => assertSameTenant(identity, TENANT_B), "RESOURCE_NOT_FOUND");
});
test("25. seleccion invalida se reemplaza automaticamente si solo queda una membresia", async () => {
  const identity = await setup().service.requireTenantRole(session({ tenantId: TENANT_B, selectedTenantId: TENANT_B }), "ADMIN");
  assert.equal(identity.tenantId, TENANT_A);
});
test("26. usuario sin membresias activas no obtiene contexto tenant", async () => {
  await rejectsCode(() => setup([fakeUser({ memberships: [] })]).service.requireAuthenticatedUser(session({ tenantId: null, selectedTenantId: null })), "TENANT_REQUIRED");
});
test("27. fallo de repositorio no reutiliza claims", async () => {
  const repository: AuthorizationRepository = { async findUserById() { throw new Error("db unavailable"); }, async findTenantById() { throw new Error("db unavailable"); } };
  await assert.rejects(() => createAuthorizationService(repository).requireTenantRole(session(), "ADMIN"), /db unavailable/);
});
test("28. assert de claims solo compara la seleccion, no el rol obsoleto", async () => {
  const identity = await setup().service.requireTenantRole(session({ role: "CONSEJO" }), "ADMIN");
  assert.doesNotThrow(() => assertSessionClaimsCurrent(session({ role: "CONSEJO" }), identity));
});
// Tras cambiar o restablecer la contrasena el callback JWT invalida el token
// (isActive=false) pero conserva el id; la unica membresia activa no debe
// autoseleccionarse ni devolver acceso tenant.
test("29. una sesion revocada no conserva acceso tenant con una sola membresia", async () => {
  const revoked = session({ isActive: false, role: null, tenantId: null, selectedTenantId: null, selectedMembershipId: null });
  await rejectsCode(() => setup().service.requireTenantRole(revoked, "ADMIN"), "UNAUTHENTICATED");
  await rejectsCode(() => setup().service.requireAuthenticatedUser(revoked), "UNAUTHENTICATED");
});
test("30. una sesion revocada no conserva el contexto global de SUPER_ADMIN", async () => {
  const service = setup([fakeUser({ globalRole: "SUPER_ADMIN", memberships: [] })]).service;
  const revoked = session({ isActive: false, role: null, tenantId: null, selectedTenantId: null });
  await rejectsCode(() => service.requireSuperAdmin(revoked), "UNAUTHENTICATED");
  await rejectsCode(() => service.requireSuperAdminTenantTarget(revoked, TENANT_A), "UNAUTHENTICATED");
});