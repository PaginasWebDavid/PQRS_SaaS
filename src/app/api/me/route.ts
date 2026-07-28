import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantLicenseSummary } from "@/domains/billing/billing.service";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { getGeneralSettings } from "@/domains/platform/platform-setting.service";
import { getUserMembershipContext, publicMemberships } from "@/lib/membership-context";

const globalUserSelect = {
  id: true, name: true, email: true, phone: true, image: true, isActive: true,
  createdAt: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const context = await getUserMembershipContext(session.user.id, session.user.selectedTenantId);
  if (!context || !context.isActive) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 });
  const globalUser = await prisma.user.findUnique({ where: { id: context.userId }, select: globalUserSelect });
  if (!globalUser) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const selected = context.selectedMembership;
  const tenant = selected ? await prisma.tenant.findUnique({
    where: { id: selected.tenantId },
    select: { id: true, name: true, slug: true, city: true, address: true, units: true, status: true },
  }) : null;
  const [licenseSummary, generalSettings] = await Promise.all([
    selected ? getTenantLicenseSummary(selected.tenantId) : Promise.resolve(null),
    getGeneralSettings(),
  ]);
  return NextResponse.json({
    user: {
      ...globalUser,
      role: context.isSuperAdmin ? "SUPER_ADMIN" : selected?.role ?? null,
      tenantId: selected?.tenantId ?? null,
      bloque: selected?.bloque ?? null,
      apto: selected?.apto ?? null,
      onboardingCompletedAt: selected?.onboardingCompletedAt ?? null,
    },
    tenant,
    memberships: publicMemberships(context),
    selectedTenantId: selected?.tenantId ?? null,
    selectedMembershipId: selected?.id ?? null,
    licenseSummary,
    pqrsCloseSlaDays: generalSettings.pqrsCloseSlaDays,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const context = await getUserMembershipContext(session.user.id, session.user.selectedTenantId);
  if (!context || !context.isActive) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const membership = context.selectedMembership;
  if (!context.isSuperAdmin && !membership) {
    return NextResponse.json({ error: "Debes seleccionar un conjunto" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const name = String(record.name ?? "").trim();
  const phone = record.phone == null || record.phone === "" ? null : String(record.phone).trim();
  const image = record.image == null || record.image === "" ? null : String(record.image).trim();
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Nombre invalido" }, { status: 400 });
  if (phone && !/^[+0-9 ()-]{7,25}$/.test(phone)) return NextResponse.json({ error: "Telefono invalido" }, { status: 400 });
  if (image && (image.length > 2048 || !/^https?:\/\//i.test(image))) return NextResponse.json({ error: "Imagen invalida" }, { status: 400 });

  if (membership?.role === "RESIDENTE" && (record.bloque !== undefined || record.apto !== undefined)) {
    const bloque = Number(record.bloque);
    const apto = Number(record.apto);
    if (!Number.isInteger(bloque) || bloque < 1 || bloque > 999) return NextResponse.json({ error: "Bloque invalido" }, { status: 400 });
    if (!Number.isInteger(apto) || apto < 1 || apto > 9999) return NextResponse.json({ error: "Apartamento invalido" }, { status: 400 });
    const changed = membership.bloque !== bloque || membership.apto !== apto;
    if (changed) {
      const claimed = await prisma.tenantMembership.updateMany({
        where: { id: membership.id, userId: context.userId, isActive: true, bloqueAptoEditado: false },
        data: { bloque, apto, bloqueAptoEditado: true },
      });
      if (claimed.count !== 1) {
        return NextResponse.json({ error: "Ya corregiste tu bloque y apartamento una vez; contacta a la administracion para otro cambio" }, { status: 409 });
      }
    }
  }

  if (membership?.role === "ADMIN" && typeof record.notifyNewPqrsEmail === "boolean") {
    await prisma.tenantMembership.updateMany({
      where: { id: membership.id, userId: context.userId, isActive: true },
      data: { notifyNewPqrsEmail: record.notifyNewPqrsEmail },
    });
  }
  const user = await prisma.user.update({
    where: { id: context.userId },
    data: { name, phone, image },
    select: globalUserSelect,
  });
  await registerAuditLog({
    actorUserId: context.userId,
    tenantId: membership?.tenantId ?? null,
    action: AuditAction.PROFILE_UPDATED,
    targetType: "User",
    targetId: user.id,
    origin: req.headers.get("x-forwarded-for") || "api",
    metadata: { fields: ["name", "phone", "image"], membershipId: membership?.id ?? null },
  });
  return NextResponse.json({
    user: {
      ...user,
      role: context.isSuperAdmin ? "SUPER_ADMIN" : membership?.role ?? null,
      tenantId: membership?.tenantId ?? null,
      bloque: membership?.bloque ?? null,
      apto: membership?.apto ?? null,
      onboardingCompletedAt: membership?.onboardingCompletedAt ?? null,
    },
  });
}