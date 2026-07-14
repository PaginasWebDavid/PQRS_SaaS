import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { updateManagedUser } from "@/domains/organizations/user-management.service";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);

  const user = await prisma.user.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, name: true, email: true, role: true, bloque: true, apto: true, phone: true, isActive: true, createdAt: true },
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const [pqrsTotal, pqrsTerminadas] = await Promise.all([
    prisma.pqrs.count({ where: { tenantId, creadoPorId: params.id } }),
    prisma.pqrs.count({ where: { tenantId, creadoPorId: params.id, estado: "TERMINADO" } }),
  ]);

  return NextResponse.json({ ...user, pqrsTotal, pqrsTerminadas });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const body = await req.json();
  try {
    const user = await updateManagedUser({
      tenantId: getTenantIdFromSession(session), actorUserId: session.user.id, targetUserId: params.id,
      role: body.role ? String(body.role).toUpperCase() as Role : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      bloque: body.bloque === undefined ? undefined : body.bloque ? Number(body.bloque) : null,
      apto: body.apto === undefined ? undefined : body.apto ? Number(body.apto) : null,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar";
    return NextResponse.json({ error: message }, { status: message === "Usuario no encontrado" ? 404 : 400 });
  }
}
export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  try {
    const user = await updateManagedUser({ tenantId: getTenantIdFromSession(session), actorUserId: session.user.id, targetUserId: context.params.id, isActive: false, origin: "api" });
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo desactivar" }, { status: 400 });
  }
}
