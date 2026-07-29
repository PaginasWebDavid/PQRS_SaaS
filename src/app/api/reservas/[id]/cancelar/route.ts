import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapReservationError } from "@/domains/reservations/reservation-security";
import { cancelReservation } from "@/domains/reservations/reservation.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  let identity;
  try {
    identity = await requireActiveTenantUser(session);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  if (identity.role !== "ADMIN" && identity.role !== "RESIDENTE") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  try {
    const reservation = await cancelReservation({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      actorRole: identity.role,
      membershipId: identity.role === "RESIDENTE" ? identity.membershipId : null,
      reservationId: params.id,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(reservation);
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
