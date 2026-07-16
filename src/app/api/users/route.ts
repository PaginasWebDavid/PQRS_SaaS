import { Role } from "@prisma/client";
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

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      ...(role && ALLOWED_ROLES.includes(role as Role) ? { role: role as Role } : {}),
      ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {}),
    },
    select: {
      id: true, name: true, email: true, role: true, bloque: true, apto: true, phone: true,
      image: true, isActive: true, onboardingCompletedAt: true, createdAt: true,
      _count: { select: { pqrsCreated: true } },
    },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
  });
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
      invitation: result.invitation,
      email: { sent: result.emailResult.ok, error: result.emailResult.ok ? null : result.emailResult.errorMessage },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo invitar" }, { status: 400 });
  }
}
