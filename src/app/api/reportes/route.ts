import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { getPqrsReportData, resolvePeriod, type Estado, type Prioridad } from "@/domains/pqrs/reportes.service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role === "RESIDENTE" || session.user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);

  const params = req.nextUrl.searchParams;
  const { from, to, compareFrom, compareTo, granularity } = resolvePeriod(params);

  const estado = params.get("estado") as Estado | null;
  const asunto = params.get("asunto");
  const prioridad = params.get("prioridad") as Prioridad | null;
  const bloque = params.get("bloque");
  const gestionadoPorId = params.get("gestionadoPorId");
  const cumplimiento = params.get("cumplimiento") as "dentro" | "fuera" | null;

  const data = await getPqrsReportData({
    tenantId,
    from,
    to,
    compareFrom,
    compareTo,
    granularity,
    estado: estado || undefined,
    asunto: asunto || undefined,
    prioridad: prioridad || undefined,
    bloque: bloque ? Number(bloque) : undefined,
    gestionadoPorId: gestionadoPorId || undefined,
    cumplimiento: cumplimiento || undefined,
  });

  const [staff, tenant, bloquesRaw] = await Promise.all([
    prisma.user.findMany({ where: { tenantId, role: { in: ["ADMIN", "CONSEJO"] }, isActive: true }, select: { id: true, name: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.pqrs.findMany({ where: { tenantId }, select: { bloque: true }, distinct: ["bloque"], orderBy: { bloque: "asc" } }),
  ]);
  const bloques = bloquesRaw.map((b) => b.bloque);

  await registerAuditLog({
    actorUserId: session.user.id,
    tenantId,
    action: AuditAction.REPORT_GENERATED,
    targetType: "PqrsReport",
    metadata: { from: from.toISOString(), to: to.toISOString() },
  }).catch(() => null);

  return NextResponse.json({ ...data, tenantName: tenant?.name || "Conjunto", staff, bloques });
}
