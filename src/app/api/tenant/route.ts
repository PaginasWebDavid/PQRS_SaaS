import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const body = await req.json();
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      city: typeof body.city === "string" ? body.city.trim() || null : undefined,
      address: typeof body.address === "string" ? body.address.trim() || null : undefined,
    },
    select: { id: true, name: true, slug: true, city: true, address: true, units: true, status: true },
  });
  return NextResponse.json(tenant);
}
