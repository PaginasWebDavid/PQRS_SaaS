import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { updateManagedUser } from "@/domains/organizations/user-management.service";
import { mapUserManagementError } from "@/domains/organizations/user-management-error";
import { ensureInvitableRole } from "@/domains/organizations/invitation-security";
import { resolveUserManagementAccess } from "@/domains/organizations/user-management-access";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  let access;
  try {
    access = await resolveUserManagementAccess(
      session,
      req.nextUrl.searchParams.get("tenantId")
    );
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: params.id, tenantId: access.tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        bloque: true,
        apto: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const [pqrsTotal, pqrsTerminadas] = await Promise.all([
      prisma.pqrs.count({
        where: { tenantId: access.tenantId, creadoPorId: params.id },
      }),
      prisma.pqrs.count({
        where: {
          tenantId: access.tenantId,
          creadoPorId: params.id,
          estado: "TERMINADO",
        },
      }),
    ]);
    return NextResponse.json({ ...user, pqrsTotal, pqrsTerminadas });
  } catch {
    return NextResponse.json(
      { error: "No se pudo consultar el usuario" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  let access;
  try {
    access = await resolveUserManagementAccess(
      session,
      req.nextUrl.searchParams.get("tenantId")
    );
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (record.isActive !== undefined && typeof record.isActive !== "boolean") {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }

  let role;
  try {
    role =
      record.role === undefined ? undefined : ensureInvitableRole(record.role);
  } catch {
    return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  }

  try {
    const user = await updateManagedUser({
      tenantId: access.tenantId,
      actorUserId: access.actorUserId,
      targetUserId: params.id,
      role,
      isActive: record.isActive as boolean | undefined,
      bloque: optionalLocation(record.bloque),
      apto: optionalLocation(record.apto),
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(user);
  } catch (error) {
    const { status, message } = mapUserManagementError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  let access;
  try {
    access = await resolveUserManagementAccess(
      session,
      req.nextUrl.searchParams.get("tenantId")
    );
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  try {
    const user = await updateManagedUser({
      tenantId: access.tenantId,
      actorUserId: access.actorUserId,
      targetUserId: params.id,
      isActive: false,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(user);
  } catch (error) {
    const { status, message } = mapUserManagementError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

function optionalLocation(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return typeof value === "number" ? value : Number(String(value).trim());
}