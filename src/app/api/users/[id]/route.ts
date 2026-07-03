import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const { id } = await params;
  const body = await req.json();
  const { role, bloque, apto } = body;

  const validRoles = ["ADMIN", "ASISTENTE", "CONSEJO", "RESIDENTE"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  // Prevent admin from changing their own role
  if (id === session.user.id && role && role !== session.user.role) {
    return NextResponse.json(
      { error: "No puedes cambiar tu propio rol" },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (role) updateData.role = role;
  if (bloque !== undefined) updateData.bloque = bloque || null;
  if (apto !== undefined) updateData.apto = apto || null;

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      bloque: true,
      apto: true,
    },
  });

  return NextResponse.json(user);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json(
      { error: "No puedes eliminar tu propia cuenta" },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Check if user has PQRS in this tenant
  const pqrsCount = await prisma.pqrs.count({
    where: { tenantId, OR: [{ creadoPorId: id }, { gestionadoPorId: id }] },
  });

  if (pqrsCount > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: tiene ${pqrsCount} PQRS asociadas` },
      { status: 400 }
    );
  }

  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.account.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}