import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapReservationError } from "@/domains/reservations/reservation-security";
import { reviewReservation } from "@/domains/reservations/reservation.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  const decision = record.decision;
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ error: "Decision invalida" }, { status: 400 });
  }
  try {
    const reservation = await reviewReservation({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      reservationId: params.id,
      decision,
      rejectionReason: record.rejectionReason,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(reservation);
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
