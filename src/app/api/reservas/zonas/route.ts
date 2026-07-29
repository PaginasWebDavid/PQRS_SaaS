import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser, requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapReservationError } from "@/domains/reservations/reservation-security";
import { createCommonArea, listCommonAreasForTenant } from "@/domains/reservations/reservation.service";

export async function GET() {
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
    const areas = await listCommonAreasForTenant({
      tenantId: identity.tenantId,
      includeInactive: identity.role === "ADMIN",
    });
    return NextResponse.json(areas);
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar las zonas comunes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  try {
    const area = await createCommonArea({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      name: record.name,
      description: record.description,
      isActive: record.isActive,
      requiresApproval: record.requiresApproval,
      minDurationMinutes: record.minDurationMinutes,
      maxDurationMinutes: record.maxDurationMinutes,
      maxReservationsPerWeek: record.maxReservationsPerWeek,
      openingTime: record.openingTime,
      closingTime: record.closingTime,
      blockedWeekdays: record.blockedWeekdays,
      rules: record.rules,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(area, { status: 201 });
  } catch (error) {
    const mapped = mapReservationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
