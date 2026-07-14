import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { getGeneralSettings, getIntegrationStatus } from "@/domains/platform/platform-setting.service";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const [tenant, generalSettings, integrations] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, city: true, address: true, units: true, status: true, createdAt: true },
    }),
    getGeneralSettings(),
    getIntegrationStatus(),
  ]);

  return NextResponse.json({
    tenant,
    pqrsCloseSlaDays: generalSettings.pqrsCloseSlaDays,
    integrations: {
      correoTransaccional: generalSettings.transactionalEmailEnabled && integrations.resend.connected && integrations.resend.fromEmailConfigured,
      almacenamientoEvidencias: integrations.supabaseStorage.connected,
      pagos: integrations.mercadoPago.connected,
    },
  });
}

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
