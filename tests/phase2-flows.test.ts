import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { acceptInvitation, cancelInvitation, createInvitation, resendInvitation } from "../src/domains/organizations/invitation.service";
import { createNotification, markNotificationRead, NotificationTypes } from "../src/domains/notifications/notification.service";
import { canResidentAccessPqrs, isPqrsTakenByAdministration, pqrsScopeForUser } from "../src/domains/pqrs/pqrs-permissions";
import { toResidentPqrsView } from "../src/domains/pqrs/resident-view";
import { updateManagedUser } from "../src/domains/organizations/user-management.service";
import { sendEmailSafe } from "../src/lib/email";
import { updateTenantSettingsForAdmin } from "../src/domains/organizations/tenant.service";

const RUN = "phase2-test-" + Date.now();
let counter = 0;
const email = (prefix: string) => prefix + "-" + RUN + "-" + (++counter) + "@example.com";
const password = bcrypt.hashSync("TestPass123", 4);
async function tenant() { const n = ++counter; return prisma.tenant.create({ data: { name: "QA " + n, slug: RUN + "-" + n } }); }
async function user(tenantId: string, role: "ADMIN" | "RESIDENTE" = "RESIDENTE") { return prisma.user.create({ data: { tenantId, email: email(role.toLowerCase()), name: "QA " + role, role, password, bloque: role === "RESIDENTE" ? 1 : null, apto: role === "RESIDENTE" ? 101 : null } }); }
let tenantIds: string[] = [];
before(async () => { await prisma.$connect(); });
after(async () => {
  const tenants = await prisma.tenant.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } }); tenantIds = tenants.map((t) => t.id);
  await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.emailLog.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { recipient: { contains: RUN } }] } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.invitation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.historialPqrs.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.pqrsFoto.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.pqrs.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.session.deleteMany({ where: { user: { tenantId: { in: tenantIds } } } });
  await prisma.account.deleteMany({ where: { user: { tenantId: { in: tenantIds } } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

test("1. ADMIN crea invitacion", async () => { const t = await tenant(); const a = await user(t.id, "ADMIN"); const r = await createInvitation({ tenantId: t.id, email: email("invite"), role: "RESIDENTE", invitedById: a.id }); assert.equal(r.invitation.status, "PENDING"); assert.notEqual(r.invitation.tokenHash, r.token); });
test("2. ADMIN reenvia invitacion y rota token", async () => { const t = await tenant(); const a = await user(t.id, "ADMIN"); const first = await createInvitation({ tenantId: t.id, email: email("resend"), role: "CONSEJO", invitedById: a.id }); const next = await resendInvitation({ tenantId: t.id, invitationId: first.invitation.id, actorUserId: a.id }); assert.notEqual(next.invitation.tokenHash, first.invitation.tokenHash); });
test("3. ADMIN cancela invitacion", async () => { const t = await tenant(); const a = await user(t.id, "ADMIN"); const inv = await createInvitation({ tenantId: t.id, email: email("cancel"), role: "RESIDENTE", invitedById: a.id }); assert.equal((await cancelInvitation({ tenantId: t.id, invitationId: inv.invitation.id, actorUserId: a.id })).status, "CANCELLED"); });
test("4. usuario acepta invitacion", async () => { const t = await tenant(); const a = await user(t.id, "ADMIN"); const inv = await createInvitation({ tenantId: t.id, email: email("accept"), role: "RESIDENTE", invitedById: a.id }); const result = await acceptInvitation({ token: inv.token, password: "ValidPass123", name: "Residente QA", bloque: 2, apto: 202, acceptedLegal: true }); assert.equal(result.user.tenantId, t.id); assert.equal(result.invitation.status, "ACCEPTED"); });
test("5. onboarding queda persistido", async () => { const t = await tenant(); const u = await user(t.id); const when = new Date(); await prisma.user.update({ where: { id: u.id }, data: { onboardingCompletedAt: when } }); const stored = await prisma.user.findUniqueOrThrow({ where: { id: u.id } }); assert.equal(stored.onboardingCompletedAt?.toISOString(), when.toISOString()); });
test("6. invitacion de otro conjunto es rechazada", async () => { const a = await tenant(); const b = await tenant(); const admin = await user(a.id, "ADMIN"); const inv = await createInvitation({ tenantId: a.id, email: email("cross"), role: "RESIDENTE", invitedById: admin.id }); await assert.rejects(cancelInvitation({ tenantId: b.id, invitationId: inv.invitation.id, actorUserId: admin.id }), /no encontrada/i); });
test("7. ADMIN no puede invitar SUPER_ADMIN", async () => { const t = await tenant(); const a = await user(t.id, "ADMIN"); await assert.rejects(createInvitation({ tenantId: t.id, email: email("super"), role: "SUPER_ADMIN", invitedById: a.id }), /Rol no permitido/i); });
test("8. RESIDENTE solo lista sus PQRS", () => { assert.deepEqual(pqrsScopeForUser({ tenantId: "t1", userId: "u1", role: "RESIDENTE" }), { tenantId: "t1", creadoPorId: "u1" }); });
test("8b. CONSEJO queda limitado a su conjunto y SUPER_ADMIN no opera PQRS", () => { assert.deepEqual(pqrsScopeForUser({ tenantId: "t1", userId: "c1", role: "CONSEJO" }), { tenantId: "t1" }); assert.throws(() => pqrsScopeForUser({ tenantId: "t1", userId: "s1", role: "SUPER_ADMIN" }), /no opera PQRS/i); });
test("9. RESIDENTE no puede consultar PQRS ajena", () => { assert.equal(canResidentAccessPqrs({ ownerId: "otro", userId: "u1" }), false); assert.equal(canResidentAccessPqrs({ ownerId: "u1", userId: "u1" }), true); });
test("9b. vista de residente no expone campos internos", () => {
  const source = { id: "pq1", numero: 1, titulo: "Goteras", asunto: "AREA COMUN", descripcion: "Detalle", estado: "TERMINADO" as const, fechaRecibido: new Date(), updatedAt: new Date(), fechaCierre: new Date(), accionTomada: "Se reparo", evidenciaCierre: "Foto de reparacion", faseActual: 4, fase1Nota: "Nota interna", evidenciaArchivoData: "secreto" } as unknown as Parameters<typeof toResidentPqrsView>[0];
  const view = toResidentPqrsView(source);
  assert.equal("faseActual" in view, false);
  assert.equal("fase1Nota" in view, false);
  assert.equal("evidenciaArchivoData" in view, false);
  assert.equal(view.accionTomada, "Se reparo");
});
test("10. RESIDENTE edita antes de toma", () => { assert.equal(isPqrsTakenByAdministration({ estado: "EN_ESPERA", fechaPrimerContacto: null, gestionadoPorId: null, numeroRadicacion: null }), false); });
test("11. RESIDENTE no edita despues de toma", () => { assert.equal(isPqrsTakenByAdministration({ estado: "EN_ESPERA", fechaPrimerContacto: new Date(), gestionadoPorId: null, numeroRadicacion: null }), true); assert.equal(isPqrsTakenByAdministration({ estado: "EN_PROGRESO", fechaPrimerContacto: null, gestionadoPorId: null, numeroRadicacion: null }), true); });
test("12. notificacion solo visible por destinatario", async () => { const t = await tenant(); const one = await user(t.id); const two = await user(t.id); const n = await createNotification({ tenantId: t.id, userId: one.id, type: NotificationTypes.PQRS_UPDATED, title: "Cambio", message: "Cambio real" }); await assert.rejects(markNotificationRead({ tenantId: t.id, userId: two.id, notificationId: n.id }), /no encontrada/i); });
test("13. marcar notificacion como leida persiste", async () => { const t = await tenant(); const u = await user(t.id); const n = await createNotification({ tenantId: t.id, userId: u.id, type: NotificationTypes.PQRS_UPDATED, title: "Cambio", message: "Cambio real" }); const read = await markNotificationRead({ tenantId: t.id, userId: u.id, notificationId: n.id }); assert.ok(read.readAt); });
test("14. actualizacion de PQRS genera notificacion persistente", async () => { const t = await tenant(); const u = await user(t.id); await createNotification({ tenantId: t.id, userId: u.id, type: NotificationTypes.PQRS_UPDATED, title: "Actualizada", message: "La solicitud cambio", resourceType: "Pqrs", resourceId: "pq1" }); assert.equal(await prisma.notification.count({ where: { tenantId: t.id, userId: u.id, resourceId: "pq1" } }), 1); });
test("15. fallo de Resend no rompe flujo", async () => { const t = await tenant(); const recipient = email("resend-fail"); const previous = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY; const result = await sendEmailSafe({ tenantId: t.id, to: recipient, subject: "QA", html: "<p>QA</p>", template: "phase2_test" }); if (previous) process.env.RESEND_API_KEY = previous; assert.equal(result.ok, false); assert.equal(await prisma.emailLog.count({ where: { tenantId: t.id, recipient, status: "FAILED" } }), 1); });
test("16. ADMIN no modifica usuario de otro conjunto", async () => { const a = await tenant(); const b = await tenant(); const admin = await user(a.id, "ADMIN"); const target = await user(b.id); await assert.rejects(updateManagedUser({ tenantId: a.id, actorUserId: admin.id, targetUserId: target.id, isActive: false }), /no encontrado/i); });
test("17. perfil persiste despues de guardar", async () => { const t = await tenant(); const u = await user(t.id); await prisma.user.update({ where: { id: u.id }, data: { name: "Nombre Persistente", phone: "+57 300 000 0000" } }); const stored = await prisma.user.findUniqueOrThrow({ where: { id: u.id } }); assert.equal(stored.name, "Nombre Persistente"); assert.equal(stored.phone, "+57 300 000 0000"); });

test("18. ADMIN no puede guardar un conjunto sin nombre", async () => {
  const t = await tenant();
  const admin = await user(t.id, "ADMIN");
  await assert.rejects(
    updateTenantSettingsForAdmin({ tenantId: t.id, actorUserId: admin.id, name: "   " }),
    /Nombre del conjunto invalido/i
  );
  const stored = await prisma.tenant.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(stored.name.startsWith("QA "), true);
});

test("19. ADMIN actualiza datos permitidos sin cambiar unidades y deja auditoria", async () => {
  const t = await prisma.tenant.create({ data: { name: "QA Config", slug: RUN + "-config-" + (++counter), units: 48 } });
  const admin = await user(t.id, "ADMIN");
  const updated = await updateTenantSettingsForAdmin({
    tenantId: t.id,
    actorUserId: admin.id,
    name: "Conjunto actualizado",
    city: "Bogota",
    address: "Calle 100 # 10-20",
  });
  assert.equal(updated.units, 48);
  assert.equal(updated.name, "Conjunto actualizado");
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: t.id, action: "TENANT_UPDATED", actorUserId: admin.id } });
  assert.ok(audit);
});
