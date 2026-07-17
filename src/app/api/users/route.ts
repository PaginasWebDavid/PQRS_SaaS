import { Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { createInvitation } from "@/domains/organizations/invitation.service";

const ALLOWED_ROLES: Role[] = ["ADMIN", "CONSEJO", "RESIDENTE"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);
  const role = req.nextUrl.searchParams.get("role");
  const search = req.nextUrl.searchParams.get("search");
  const status = req.nextUrl.searchParams.get("status");
  const bloqueRaw = req.nextUrl.searchParams.get("bloque");
  const pageParam = req.nextUrl.searchParams.get("page");
  const pageSizeParam = req.nextUrl.searchParams.get("pageSize");
  const paginated = pageParam !== null || pageSizeParam !== null;
  const page = pageParam ? Number(pageParam) : 1;
  const pageSize = pageSizeParam ? Number(pageSizeParam) : 25;
  if (paginated && (!Number.isInteger(page) || page < 1 || page > 100000)) return NextResponse.json({ error: "Pagina invalida" }, { status: 400 });
  if (paginated && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) return NextResponse.json({ error: "Tamano de pagina invalido" }, { status: 400 });
  const bloque = bloqueRaw ? Number(bloqueRaw) : null;
  if (bloqueRaw && (!Number.isInteger(Number(bloqueRaw)) || Number(bloqueRaw) < 1 || Number(bloqueRaw) > 999)) return NextResponse.json({ error: "Bloque invalido" }, { status: 400 });

  const where: Prisma.UserWhereInput = {
    tenantId,
    ...(role && ALLOWED_ROLES.includes(role as Role) ? { role: role as Role } : {}),
    ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
    ...(bloque !== null ? { bloque } : {}),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const usersQuery = {
    where,
    select: {
      id: true, name: true, email: true, role: true, bloque: true, apto: true, phone: true,
      image: true, isActive: true, onboardingCompletedAt: true, createdAt: true,
      _count: { select: { pqrsCreated: true } },
    },
    orderBy: [{ isActive: "desc" as const }, { role: "asc" as const }, { name: "asc" as const }],
    ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
  };
  const [users, total, blockRows] = await Promise.all([
    prisma.user.findMany(usersQuery),
    paginated ? prisma.user.count({ where }) : Promise.resolve(0),
    role === "RESIDENTE" ? prisma.user.findMany({ where: { tenantId, role: "RESIDENTE", bloque: { not: null } }, select: { bloque: true }, distinct: ["bloque"] }) : Promise.resolve([]),
  ]);
  if (paginated) {
    return NextResponse.json({
      data: users,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      bloques: blockRows.map((row) => row.bloque).filter((value): value is number => value !== null).sort((a, b) => a - b),
    });
  }
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);
  const body = await req.json();
  const role = String(body.role || "RESIDENTE").toUpperCase() as Role;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Rol no permitido" }, { status: 400 });
  try {
    const result = await createInvitation({
      tenantId, email: String(body.email || ""), role, invitedById: session.user.id,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json({
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
      },
      email: { sent: result.emailResult.ok, error: result.emailResult.ok ? null : result.emailResult.errorMessage },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo invitar" }, { status: 400 });
  }
}
