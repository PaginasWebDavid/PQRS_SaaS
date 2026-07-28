import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { updateManagedUser } from "@/domains/organizations/user-management.service";
import { mapUserManagementError } from "@/domains/organizations/user-management-error";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  let identity;
  try {
    identity = await requireTenantRole(session, "ADMIN");
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const tenantId = identity.tenantId;

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
  let identity;
  try {
    identity = await requireTenantRole(session, "ADMIN");
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const body = await req.json();
  try {
    const user = await updateManagedUser({
      tenantId: identity.tenantId, actorUserId: identity.userId, targetUserId: params.id,
      role: body.role ? String(body.role).toUpperCase() as Role : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      bloque: body.bloque === undefined ? undefined : body.bloque ? Number(body.bloque) : null,
      apto: body.apto === undefined ? undefined : body.apto ? Number(body.apto) : null,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(user);
  } catch (error) {
    const { status, message } = mapUserManagementError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  const session = await auth();
  let identity;
  try {
    identity = await requireTenantRole(session, "ADMIN");
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  try {
    const user = await updateManagedUser({ tenantId: identity.tenantId, actorUserId: identity.userId, targetUserId: context.params.id, isActive: false, origin: "api" });
    return NextResponse.json(user);
  } catch (error) {
    const { status, message } = mapUserManagementError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
