import { InvitationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createInvitation,
  listInvitationsForTenant,
} from "@/domains/organizations/invitation.service";
import {
  ensureInvitableRole,
  mapInvitationError,
  publicInvitationEmailResult,
} from "@/domains/organizations/invitation-security";
import { resolveUserManagementAccess } from "@/domains/organizations/user-management-access";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";

export async function GET(req: NextRequest) {
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

  const rawStatus = req.nextUrl.searchParams.get("status") || undefined;
  if (
    rawStatus &&
    !Object.values(InvitationStatus).includes(rawStatus as InvitationStatus)
  ) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }
  const status = rawStatus as InvitationStatus | undefined;
  const search = req.nextUrl.searchParams.get("search")?.trim() || undefined;
  if (search && search.length > 160) {
    return NextResponse.json({ error: "Busqueda invalida" }, { status: 400 });
  }
  const page = Number(req.nextUrl.searchParams.get("page") || "1");
  const pageSize = Number(req.nextUrl.searchParams.get("pageSize") || "25");
  if (!Number.isInteger(page) || page < 1 || page > 100000) {
    return NextResponse.json({ error: "Pagina invalida" }, { status: 400 });
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return NextResponse.json(
      { error: "Tamano de pagina invalido" },
      { status: 400 }
    );
  }

  try {
    const result = await listInvitationsForTenant({
      tenantId: access.tenantId,
      status,
      search,
      page,
      pageSize,
    });
    return NextResponse.json({
      data: result.data,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar las invitaciones" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

  try {
    const record = body as Record<string, unknown>;
    const result = await createInvitation({
      tenantId: access.tenantId,
      email: record.email as string,
      role: ensureInvitableRole(record.role ?? "RESIDENTE"),
      invitedById: access.actorUserId,
      origin:
        req.headers.get("x-forwarded-for") ||
        req.headers.get("user-agent") ||
        "api",
    });

    return NextResponse.json(
      {
        invitation: {
          id: result.invitation.id,
          email: result.invitation.email,
          role: result.invitation.role,
          status: result.invitation.status,
          expiresAt: result.invitation.expiresAt,
        },
        email: publicInvitationEmailResult(result.emailResult),
      },
      { status: 201 }
    );
  } catch (error) {
    const mapped = mapInvitationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}