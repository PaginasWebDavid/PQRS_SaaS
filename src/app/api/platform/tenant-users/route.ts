import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantUsersForSuperAdmin } from "@/domains/platform/tenant-admin.service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
  }
  const data = await getTenantUsersForSuperAdmin(tenantId);
  return NextResponse.json(data);
}
