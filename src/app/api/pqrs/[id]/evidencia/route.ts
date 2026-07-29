import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { downloadFromStorage } from "@/lib/storage";
import { isRecord, pqrsResourceScopeForUser, safeDownloadFileName } from "@/domains/pqrs/pqrs-security";
import { mapPqrsEvidenceError, withdrawPqrsFileEvidence } from "@/domains/pqrs/pqrs-evidence.service";

type RouteContext = { params: { id: string } };

async function findEvidence(
  params: RouteContext["params"],
  identity: { tenantId: string; userId: string; role: "ADMIN" | "CONSEJO" | "RESIDENTE" }
) {
  return prisma.pqrs.findFirst({
    where: pqrsResourceScopeForUser({ id: params.id, ...identity }),
    select: {
      evidenciaArchivoData: true,
      evidenciaArchivoPath: true,
      evidenciaArchivoNombre: true,
      evidenciaArchivoTipo: true,
      evidenciaArchivoRetiradaAt: true,
    },
  });
}

async function handleGet(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const access = await getTenantAccessResponse(session);
  if (access) return access;
  const tenantId = getTenantIdFromSession(session);
  const pqrs = await findEvidence(params, {
    tenantId,
    userId: session.user.id,
    role: session.user.role as "ADMIN" | "CONSEJO" | "RESIDENTE",
  });
  if (!pqrs) return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  if (pqrs.evidenciaArchivoRetiradaAt || (!pqrs.evidenciaArchivoPath && !pqrs.evidenciaArchivoData)) {
    return NextResponse.json({ error: "No hay archivo" }, { status: 404 });
  }
  const buffer = pqrs.evidenciaArchivoPath
    ? await downloadFromStorage(pqrs.evidenciaArchivoPath, { tenantId, folders: ["evidencias"] })
    : Buffer.from(pqrs.evidenciaArchivoData!.replace(/^data:[^;]+;base64,/, ""), "base64");
  const filename = safeDownloadFileName(pqrs.evidenciaArchivoNombre, "evidencia");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": pqrs.evidenciaArchivoTipo || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function handleDelete(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  const access = await getTenantAccessResponse(session);
  if (access) return access;
  const body = await req.json().catch(() => null);
  if (!isRecord(body) || Object.keys(body).some((key) => key !== "reason")) {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  try {
    return NextResponse.json(await withdrawPqrsFileEvidence({
      tenantId: getTenantIdFromSession(session),
      pqrsId: params.id,
      actorUserId: session.user.id,
      actorRole: session.user.role,
      reason: body.reason,
    }));
  } catch (error) {
    const mapped = mapPqrsEvidenceError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  try { return await handleGet(req, context); }
  catch { console.error("[pqrs/evidencia/get] Error inesperado"); return NextResponse.json({ error: "No se pudo obtener la evidencia" }, { status: 500 }); }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try { return await handleDelete(req, context); }
  catch { console.error("[pqrs/evidencia/delete] Error inesperado"); return NextResponse.json({ error: "No se pudo retirar la evidencia" }, { status: 500 }); }
}