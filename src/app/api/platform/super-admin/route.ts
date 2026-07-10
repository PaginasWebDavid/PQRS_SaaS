import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSuperAdminOverview } from "@/domains/platform/super-admin.service";
import { createTenantWithAdmin, updateTenantStatusForSuperAdmin } from "@/domains/platform/tenant-admin.service";

function requireSuperAdmin(role?: string) {
  return role === "SUPER_ADMIN";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !requireSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const data = await getSuperAdminOverview(tenantId);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !requireSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json();
  const action = body.action;
  if (action === "createTenant") {
    const result = await createTenantWithAdmin(session.user.id, {
      name: body.name,
      slug: body.slug || body.name,
      city: body.city,
      address: body.address,
      units: Number(body.units || 0),
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPhone: body.adminPhone,
    });
    return NextResponse.json(result, { status: 201 });
  }
  if (action === "updateTenantStatus") {
    const result = await updateTenantStatusForSuperAdmin(session.user.id, body.tenantId, body.status);
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
