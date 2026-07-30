import { NextRequest, NextResponse } from "next/server";
import type { ReservationStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser, requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapReservationError } from "@/domains/reservations/reservation-security";
import { createReservation, listReservationsForTenant } from "@/domains/reservations/reservation.service";

const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

export async function GET(req: NextRequest) {
  const session = await auth();
  let identity;
  try {
    identity = await requireActiveTenantUser(session);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }
  const commonAreaId = req.nextUrl.searchParams.get("commonAreaId") || undefined;
  const pageParam = req.nextUrl.searchParams.get("page");
  const pageSizeParam = req.nextUrl.searchParams.get("pageSize");
  const page = pageParam ? Number(pageParam) : 1;
  const pageSize = pageSizeParam ? Number(pageSizeParam) : 25;
  if (!Number.isInteger(page) || page < 1 || page > 100000) {
    return NextResponse.json({ error: "Pagina invalida" }, { status: 400 });
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return NextResponse.json({ error: "Tamano de pagina invalido" }, { status: 400 });
  }

  try {
    const result = await listReservationsForTenant({
      tenantId: identity.tenantId,
      // RESIDENTE solo ve sus propias reservas (por membresia); ADMIN y
      // CONSEJO ven el calendario completo del tenant.
      membershipId: identity.role === "RESIDENTE" ? identity.membershipId : undefined,
      commonAreaId,
      status: statusParam as ReservationStatus | undefined,
      page,
      pageSize,
    });
    return NextResponse.json({
      data: result.data,
      pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
    });
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  let identity;
  try {
    identity = await requireTenantRole(session, "RESIDENTE");
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
  try {
    const reservation = await createReservation({
      tenantId: identity.tenantId,
      membershipId: identity.membershipId,
      createdByUserId: identity.userId,
      commonAreaId: String(record.commonAreaId || ""),
      startAt: record.startAt,
      endAt: record.endAt,
      notes: record.notes,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(reservation, { status: 201 });
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
