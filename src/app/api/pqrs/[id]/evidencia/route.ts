import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { deleteFromStorage, downloadFromStorage } from "@/lib/storage";
import { registerAuditLog } from "@/domains/platform/audit.service";
import {
  pqrsResourceScopeForUser,
  safeDownloadFileName,
} from "@/domains/pqrs/pqrs-security";

type RouteContext = { params: { id: string } };

async function findEvidence(
  params: RouteContext["params"],
  identity: { tenantId: string; userId: string; role: "ADMIN" | "CONSEJO" | "RESIDENTE" }
) {
  return prisma.pqrs.findFirst({
    where: pqrsResourceScopeForUser({
      id: params.id,
      tenantId: identity.tenantId,
      userId: identity.userId,
      role: identity.role,
    }),
    select: {
      evidenciaArchivoData: true,
      evidenciaArchivoPath: true,
      evidenciaArchivoNombre: true,
      evidenciaArchivoTipo: true,
    },
  });
}

async function handleGet(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const pqrs = await findEvidence(params, {
    tenantId,
    userId: session.user.id,
    role: session.user.role as "ADMIN" | "CONSEJO" | "RESIDENTE",
  });
  if (!pqrs) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }
  if (!pqrs.evidenciaArchivoPath && !pqrs.evidenciaArchivoData) {
    return NextResponse.json({ error: "No hay archivo" }, { status: 404 });
  }

  const buffer = pqrs.evidenciaArchivoPath
    ? await downloadFromStorage(pqrs.evidenciaArchivoPath, {
        tenantId,
        folders: ["evidencias"],
      })
    : Buffer.from(
        pqrs.evidenciaArchivoData!.replace(/^data:[^;]+;base64,/, ""),
        "base64"
      );
  const filename = safeDownloadFileName(
    pqrs.evidenciaArchivoNombre,
    "evidencia"
  );
  const contentType = pqrs.evidenciaArchivoTipo || "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function handleDelete(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const pqrs = await findEvidence(params, {
    tenantId,
    userId: session.user.id,
    role: "ADMIN",
  });
  if (!pqrs || (!pqrs.evidenciaArchivoPath && !pqrs.evidenciaArchivoData)) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }

  const cleared = await prisma.pqrs.updateMany({
    where: { id: params.id, tenantId },
    data: {
      evidenciaArchivoData: null,
      evidenciaArchivoUrl: null,
      evidenciaArchivoPath: null,
      evidenciaArchivoNombre: null,
      evidenciaArchivoTipo: null,
      evidenciaArchivoSize: null,
    },
  });
  if (cleared.count !== 1) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }

  if (pqrs.evidenciaArchivoPath) {
    try {
      await deleteFromStorage(pqrs.evidenciaArchivoPath, {
        tenantId,
        folders: ["evidencias"],
      });
    } catch {
      console.error("[pqrs/evidencia/delete] No se pudo limpiar el objeto huerfano");
    }
  }

  await registerAuditLog({
    actorUserId: session.user.id,
    tenantId,
    action: AuditAction.PQRS_UPDATED,
    targetType: "Pqrs",
    targetId: params.id,
    origin: req.headers.get("x-forwarded-for") || "api",
    metadata: { fields: ["evidenciaArchivo"], removed: true },
  });
  return NextResponse.json({ deleted: true });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    return await handleGet(req, context);
  } catch {
    console.error("[pqrs/evidencia/get] Error inesperado");
    return NextResponse.json(
      { error: "No se pudo obtener la evidencia" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    return await handleDelete(req, context);
  } catch {
    console.error("[pqrs/evidencia/delete] Error inesperado");
    return NextResponse.json(
      { error: "No se pudo eliminar la evidencia" },
      { status: 500 }
    );
  }
}
