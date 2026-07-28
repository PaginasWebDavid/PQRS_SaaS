import { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createInvitation } from "@/domains/organizations/invitation.service";
import { ensureInvitableRole, INVITABLE_TENANT_ROLES, mapInvitationError, publicInvitationEmailResult } from "@/domains/organizations/invitation-security";
import { resolveUserManagementAccess } from "@/domains/organizations/user-management-access";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";

export async function GET(req: NextRequest) {
  const session = await auth();
  let access;
  try {
    access = await resolveUserManagementAccess(session, req.nextUrl.searchParams.get("tenantId"));
  } catch (error) {
    const response = getAuthorizationErrorResponse(error); if (response) return response; throw error;
  }
  const role = req.nextUrl.searchParams.get("role");
  const search = req.nextUrl.searchParams.get("search")?.trim() || null;
  const status = req.nextUrl.searchParams.get("status");
  const bloqueRaw = req.nextUrl.searchParams.get("bloque");
  const pageParam = req.nextUrl.searchParams.get("page");
  const pageSizeParam = req.nextUrl.searchParams.get("pageSize");
  const paginated = pageParam !== null || pageSizeParam !== null;
  const page = pageParam ? Number(pageParam) : 1;
  const pageSize = pageSizeParam ? Number(pageSizeParam) : 25;
  if (role && !INVITABLE_TENANT_ROLES.includes(role as Role)) return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  if (status && !["active", "inactive"].includes(status)) return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  if (search && search.length > 160) return NextResponse.json({ error: "Busqueda invalida" }, { status: 400 });
  if (paginated && (!Number.isInteger(page) || page < 1 || page > 100000)) return NextResponse.json({ error: "Pagina invalida" }, { status: 400 });
  if (paginated && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) return NextResponse.json({ error: "Tamano de pagina invalido" }, { status: 400 });
  const bloque = bloqueRaw ? Number(bloqueRaw) : null;
  if (bloqueRaw && (!Number.isInteger(bloque) || (bloque as number) < 1 || (bloque as number) > 999)) return NextResponse.json({ error: "Bloque invalido" }, { status: 400 });

  const where: Prisma.TenantMembershipWhereInput = {
    tenantId: access.tenantId,
    ...(role ? { role: role as Role } : {}),
    ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
    ...(bloque !== null ? { bloque } : {}),
    ...(search ? { user: { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ] } } : {}),
  };
  try {
    const [memberships, total, blockRows] = await Promise.all([
      prisma.tenantMembership.findMany({
        where,
        select: {
          id: true, role: true, bloque: true, apto: true, isActive: true,
          onboardingCompletedAt: true, createdAt: true,
          user: { select: { id: true, name: true, email: true, phone: true, image: true, _count: { select: { pqrsCreated: true } } } },
        },
        orderBy: [{ isActive: "desc" }, { role: "asc" }, { user: { name: "asc" } }],
        ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      }),
      paginated ? prisma.tenantMembership.count({ where }) : Promise.resolve(0),
      role === "RESIDENTE" ? prisma.tenantMembership.findMany({
        where: { tenantId: access.tenantId, role: "RESIDENTE", bloque: { not: null } },
        select: { bloque: true }, distinct: ["bloque"],
      }) : Promise.resolve([]),
    ]);
    const data = memberships.map((membership) => ({
      ...membership.user,
      membershipId: membership.id,
      role: membership.role,
      bloque: membership.bloque,
      apto: membership.apto,
      isActive: membership.isActive,
      onboardingCompletedAt: membership.onboardingCompletedAt,
      createdAt: membership.createdAt,
    }));
    if (!paginated) return NextResponse.json(data);
    return NextResponse.json({
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      bloques: blockRows.map((row) => row.bloque).filter((value): value is number => value !== null).sort((a, b) => a - b),
    });
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar los usuarios" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  let access;
  try {
    access = await resolveUserManagementAccess(session, req.nextUrl.searchParams.get("tenantId"));
  } catch (error) {
    const response = getAuthorizationErrorResponse(error); if (response) return response; throw error;
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  try {
    const record = body as Record<string, unknown>;
    const result = await createInvitation({
      tenantId: access.tenantId,
      email: record.email as string,
      role: ensureInvitableRole(record.role ?? "RESIDENTE"),
      invitedById: access.actorUserId,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json({
      invitation: { id: result.invitation.id, email: result.invitation.email, role: result.invitation.role, status: result.invitation.status, expiresAt: result.invitation.expiresAt },
      email: publicInvitationEmailResult(result.emailResult),
    }, { status: 201 });
  } catch (error) {
    const mapped = mapInvitationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}