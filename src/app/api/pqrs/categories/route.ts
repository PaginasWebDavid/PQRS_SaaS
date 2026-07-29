import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { listPqrsCategoriesForRead, mapPqrsCategoryError } from "@/domains/pqrs/pqrs-category.service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!session.user.role || session.user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }
  const access = await getTenantAccessResponse(session);
  if (access) return access;
  try {
    return NextResponse.json(await listPqrsCategoriesForRead({
      tenantId: getTenantIdFromSession(session),
      actorRole: session.user.role,
      includeInactive: req.nextUrl.searchParams.get("includeInactive") === "true",
    }));
  } catch (error) {
    const mapped = mapPqrsCategoryError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}