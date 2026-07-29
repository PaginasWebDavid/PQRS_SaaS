import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser, requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapReservationError } from "@/domains/reservations/reservation-security";
import { createCommonAreaBlock, listCommonAreaBlocks } from "@/domains/reservations/reservation.service";

type RouteContext = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  let identity;
  try {
    // Lectura de bloqueos (parte del "calendario"): disponible para todo rol
    // tenant activo, no solo ADMIN. La creacion si queda restringida abajo.
    identity = await requireActiveTenantUser(session);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  try {
    const blocks = await listCommonAreaBlocks({ tenantId: identity.tenantId, commonAreaId: params.id });
    return NextResponse.json(blocks);
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  let identity;
  try {
    identity = await requireTenantRole(session, "ADMIN");
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const body = await req.json().catch(() => null);
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  try {
    const block = await createCommonAreaBlock({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      commonAreaId: params.id,
      startAt: record.startAt,
      endAt: record.endAt,
      reason: record.reason,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
