import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { getTenantLicenseSummary } from "@/domains/billing/billing.service";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { registerAuditLog } from "@/domains/platform/audit.service";

const userSelect = {
  id: true, name: true, email: true, role: true, tenantId: true, bloque: true, apto: true,
  phone: true, image: true, isActive: true, onboardingCompletedAt: true, notifyNewPqrsEmail: true, createdAt: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!session.user.isActive) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 });

  const tenant = session.user.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { id: true, name: true, slug: true, city: true, address: true, units: true, status: true },
      })
    : null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: userSelect });
  const licenseSummary = session.user.tenantId ? await getTenantLicenseSummary(session.user.tenantId) : null;
  return NextResponse.json({ user, tenant, licenseSummary });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "RESIDENTE"].includes(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const phone = body.phone == null || body.phone === "" ? null : String(body.phone).trim();
  const image = body.image == null || body.image === "" ? null : String(body.image).trim();

  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Nombre invalido" }, { status: 400 });
  if (phone && !/^[+0-9 ()-]{7,25}$/.test(phone)) return NextResponse.json({ error: "Telefono invalido" }, { status: 400 });
  if (image && (image.length > 2048 || !/^https?:\/\//i.test(image))) return NextResponse.json({ error: "Imagen invalida" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name, phone, image,
      ...(session.user.role === "ADMIN" && typeof body.notifyNewPqrsEmail === "boolean" ? { notifyNewPqrsEmail: body.notifyNewPqrsEmail } : {}),
    },
    select: userSelect,
  });
  await registerAuditLog({
    actorUserId: session.user.id, tenantId, action: AuditAction.PROFILE_UPDATED,
    targetType: "User", targetId: user.id, origin: req.headers.get("x-forwarded-for") || "api",
    metadata: { fields: ["name", "phone", "image"] },
  });
  return NextResponse.json({ user });
}
