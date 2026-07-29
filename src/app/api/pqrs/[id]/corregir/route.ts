import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { correctPqrs, mapPqrsCorrectionError } from "@/domains/pqrs/pqrs-correction.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  const access = await getTenantAccessResponse(session);
  if (access) return access;
  const body = await req.json().catch(() => null);
  try {
    const result = await correctPqrs({
      tenantId: getTenantIdFromSession(session),
      pqrsId: params.id,
      actorUserId: session.user.id,
      actorRole: session.user.role,
      body,
      origin: req.headers.get("x-forwarded-for") ? "admin-pqrs-correction-http" : "admin-pqrs-correction",
    });
    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapPqrsCorrectionError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}