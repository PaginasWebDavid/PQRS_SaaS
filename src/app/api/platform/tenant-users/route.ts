import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantUsersForSuperAdmin } from "@/domains/platform/tenant-admin.service";
import { requireSuperAdminTenantTarget } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";

export async function GET(req: NextRequest) {
  const session = await auth();
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  try {
    const target = await requireSuperAdminTenantTarget(session, tenantId);
    const data = await getTenantUsersForSuperAdmin(target.targetTenantId);
    return NextResponse.json(data);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
