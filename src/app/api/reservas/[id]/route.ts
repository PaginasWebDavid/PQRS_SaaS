import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapReservationError } from "@/domains/reservations/reservation-security";
import { getReservationForActor } from "@/domains/reservations/reservation.service";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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
    const reservation = await getReservationForActor({
      tenantId: identity.tenantId,
      membershipId: identity.role === "RESIDENTE" ? identity.membershipId : null,
      reservationId: params.id,
    });
    return NextResponse.json(reservation);
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
