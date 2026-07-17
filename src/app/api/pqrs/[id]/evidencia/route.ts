import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { downloadFromStorage } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);

  const pqrs = await prisma.pqrs.findFirst({
    where: { id: params.id, tenantId },
    select: {
      evidenciaArchivoData: true,
      evidenciaArchivoPath: true,
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

  if (!pqrs.evidenciaArchivoPath && !pqrs.evidenciaArchivoData) {
    return NextResponse.json({ error: "No hay archivo" }, { status: 404 });
  }

  let buffer: Buffer;
  if (pqrs.evidenciaArchivoPath) {
    buffer = await downloadFromStorage(pqrs.evidenciaArchivoPath);
  } else if (pqrs.evidenciaArchivoData) {
    const base64Data = pqrs.evidenciaArchivoData.replace(/^data:[^;]+;base64,/, "");
    buffer = Buffer.from(base64Data, "base64");
  } else {
    return NextResponse.json({ error: "El archivo legado ya no esta disponible" }, { status: 410 });
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
