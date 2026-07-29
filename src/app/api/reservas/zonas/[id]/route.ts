import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser, requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapReservationError } from "@/domains/reservations/reservation-security";
import { getCommonAreaForTenant, updateCommonArea } from "@/domains/reservations/reservation.service";

type RouteContext = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  let identity;
  try {
    identity = await requireActiveTenantUser(session);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  try {
    const area = await getCommonAreaForTenant({ tenantId: identity.tenantId, commonAreaId: params.id });
    if (!area.isActive && identity.role !== "ADMIN") {
      return NextResponse.json({ error: "Zona comun no encontrada" }, { status: 404 });
    }
    return NextResponse.json(area);
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
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
  try {
    const area = await updateCommonArea({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      commonAreaId: params.id,
      patch: body,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(area);
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
