import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { downloadFromStorage } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; fotoId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);

  const foto = await prisma.pqrsFoto.findFirst({
    where: { id: params.fotoId, tenantId },
    select: {
      data: true,
      url: true,
      storagePath: true,
      nombre: true,
      tipo: true,
      pqrs: { select: { id: true, creadoPorId: true } },
    },
  });

  if (!foto || foto.pqrs.id !== params.id) {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }

  if (session.user.role === "RESIDENTE" && foto.pqrs.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let buffer: Buffer;
  if (foto.storagePath) {
    buffer = await downloadFromStorage(foto.storagePath);
  } else if (foto.data) {
    const base64Data = foto.data.replace(/^data:[^;]+;base64,/, "");
    buffer = Buffer.from(base64Data, "base64");
  } else if (foto.url) {
    return NextResponse.json({ error: "La evidencia heredada ya no esta disponible" }, { status: 410 });
  } else {
    return NextResponse.json({ error: "No hay foto" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": foto.tipo,
      "Content-Disposition": `inline; filename="${foto.nombre}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
}
