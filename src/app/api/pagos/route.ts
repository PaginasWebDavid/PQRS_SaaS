import { NextRequest, NextResponse } from "next/server";
import type { ChargeStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser, requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { createManualCharge, listChargesForTenant } from "@/domains/payments/payment.service";

const VALID_STATUSES = new Set(["PENDING", "PARTIAL", "PAID", "CANCELLED"]);

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
  if (identity.role === "CONSEJO") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }
  const period = req.nextUrl.searchParams.get("period") || undefined;
  const bloqueParam = req.nextUrl.searchParams.get("bloque");
  const aptoParam = req.nextUrl.searchParams.get("apto");

  try {
    const result = await listChargesForTenant({
      tenantId: identity.tenantId,
      // RESIDENTE solo ve las obligaciones de su propia unidad (por
      // membresia); ADMIN ve todo el tenant y puede filtrar por bloque/apto.
      membershipId: identity.role === "RESIDENTE" ? identity.membershipId : undefined,
      status: (statusParam as ChargeStatus) || undefined,
      period,
      bloque: identity.role === "ADMIN" && bloqueParam ? Number(bloqueParam) : undefined,
      apto: identity.role === "ADMIN" && aptoParam ? Number(aptoParam) : undefined,
    });
    return NextResponse.json({ data: result.data, total: result.total });
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar las obligaciones" }, { status: 500 });
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
    const charge = await createManualCharge({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      bloque: record.bloque,
      apto: record.apto,
      period: record.period,
      concept: record.concept,
      amountCents: record.amountCents,
      dueDate: record.dueDate,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(charge, { status: 201 });
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
