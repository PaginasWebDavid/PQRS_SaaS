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
  if (!["ADMIN", "CONSEJO"].includes(session.user.role)) {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);

  const params = req.nextUrl.searchParams;
  let period: ReturnType<typeof resolvePeriod>;
  try {
    period = resolvePeriod(params);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Periodo invalido" }, { status: 400 });
  }
  const { from, to, compareFrom, compareTo, granularity } = period;

  const estadoRaw = params.get("estado");
  const asunto = params.get("asunto");
  const prioridadRaw = params.get("prioridad");
  const bloqueRaw = params.get("bloque");
  const gestionadoPorId = params.get("gestionadoPorId");
  const cumplimientoRaw = params.get("cumplimiento");
  const estados: Estado[] = ["EN_ESPERA", "EN_PROGRESO", "TERMINADO"];
  const prioridades: Prioridad[] = ["ALTA", "MEDIA", "BAJA"];
  if (estadoRaw && !estados.includes(estadoRaw as Estado)) return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  if (prioridadRaw && !prioridades.includes(prioridadRaw as Prioridad)) return NextResponse.json({ error: "Prioridad invalida" }, { status: 400 });
  if (cumplimientoRaw && !["dentro", "fuera"].includes(cumplimientoRaw)) return NextResponse.json({ error: "Cumplimiento invalido" }, { status: 400 });
  const bloque = bloqueRaw ? Number(bloqueRaw) : null;
  if (bloqueRaw && (bloque === null || !Number.isInteger(bloque) || bloque < 1 || bloque > 999)) return NextResponse.json({ error: "Bloque invalido" }, { status: 400 });
  const estado = estadoRaw as Estado | null;
  const prioridad = prioridadRaw as Prioridad | null;
  const cumplimiento = cumplimientoRaw as "dentro" | "fuera" | null;

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
    bloque: bloque ?? undefined,
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
