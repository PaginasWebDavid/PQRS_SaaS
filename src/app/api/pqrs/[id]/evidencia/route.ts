import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { downloadFromStorage } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantId = getTenantIdFromSession(session);

  const pqrs = await prisma.pqrs.findFirst({
    where: { id: params.id, tenantId },
    select: {
      evidenciaArchivoData: true,
      evidenciaArchivoPath: true,
      evidenciaArchivoUrl: true,
      evidenciaArchivoNombre: true,
      evidenciaArchivoTipo: true,
      creadoPorId: true,
    },
  });

  if (!pqrs) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }

  if (session.user.role === "RESIDENTE" && pqrs.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!pqrs.evidenciaArchivoPath && !pqrs.evidenciaArchivoData && !pqrs.evidenciaArchivoUrl) {
    return NextResponse.json({ error: "No hay archivo" }, { status: 404 });
  }

  let buffer: Buffer;
  if (pqrs.evidenciaArchivoPath) {
    buffer = await downloadFromStorage(pqrs.evidenciaArchivoPath);
  } else if (pqrs.evidenciaArchivoData) {
    const base64Data = pqrs.evidenciaArchivoData.replace(/^data:[^;]+;base64,/, "");
    buffer = Buffer.from(base64Data, "base64");
  } else {
    const storageRes = await fetch(pqrs.evidenciaArchivoUrl as string);
    if (!storageRes.ok) {
      return NextResponse.json({ error: "No se pudo descargar el archivo" }, { status: 502 });
    }
    buffer = Buffer.from(await storageRes.arrayBuffer());
  }

  const filename = pqrs.evidenciaArchivoNombre || "evidencia";
  const contentType = pqrs.evidenciaArchivoTipo || "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
}
