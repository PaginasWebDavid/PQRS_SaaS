import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { deleteFromStorage, downloadFromStorage } from "@/lib/storage";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { safeDownloadFileName } from "@/domains/pqrs/pqrs-security";

type RouteContext = { params: { id: string; fotoId: string } };

async function handleGet(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const foto = await prisma.pqrsFoto.findFirst({
    where: {
      id: params.fotoId,
      pqrsId: params.id,
      tenantId,
      ...(session.user.role === "RESIDENTE"
        ? { pqrs: { creadoPorId: session.user.id } }
        : {}),
    },
    select: {
      data: true,
      url: true,
      storagePath: true,
      nombre: true,
      tipo: true,
    },
  });

  if (!foto) {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }

  let buffer: Buffer;
  if (foto.storagePath) {
    buffer = await downloadFromStorage(foto.storagePath, {
      tenantId,
      folders: ["fotos"],
    });
  } else if (foto.data) {
    buffer = Buffer.from(foto.data.replace(/^data:[^;]+;base64,/, ""), "base64");
  } else if (foto.url) {
    return NextResponse.json(
      { error: "La evidencia heredada ya no esta disponible" },
      { status: 410 }
    );
  } else {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }

  const filename = safeDownloadFileName(foto.nombre, "foto");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": foto.tipo,
      "Content-Disposition": `inline; filename="${filename}"`,
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
  const foto = await prisma.pqrsFoto.findFirst({
    where: { id: params.fotoId, pqrsId: params.id, tenantId },
    select: { id: true, storagePath: true },
  });
  if (!foto) {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }

  const deleted = await prisma.pqrsFoto.deleteMany({
    where: { id: foto.id, pqrsId: params.id, tenantId },
  });
  if (deleted.count !== 1) {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }

  if (foto.storagePath) {
    try {
      await deleteFromStorage(foto.storagePath, { tenantId, folders: ["fotos"] });
    } catch {
      console.error("[pqrs/foto/delete] No se pudo limpiar el objeto huerfano");
    }
  }

  await registerAuditLog({
    actorUserId: session.user.id,
    tenantId,
    action: AuditAction.PQRS_UPDATED,
    targetType: "Pqrs",
    targetId: params.id,
    origin: req.headers.get("x-forwarded-for") || "api",
    metadata: { fields: ["foto"], removed: true },
  });
  return NextResponse.json({ deleted: true });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    return await handleGet(req, context);
  } catch {
    console.error("[pqrs/foto/get] Error inesperado");
    return NextResponse.json({ error: "No se pudo obtener la foto" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    return await handleDelete(req, context);
  } catch {
    console.error("[pqrs/foto/delete] Error inesperado");
    return NextResponse.json({ error: "No se pudo eliminar la foto" }, { status: 500 });
  }
}
