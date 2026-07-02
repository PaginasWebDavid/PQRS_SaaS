import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; fotoId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantId = getTenantIdFromSession(session);

  const foto = await prisma.pqrsFoto.findFirst({
    where: { id: params.fotoId, tenantId },
    select: {
      data: true,
      nombre: true,
      tipo: true,
      pqrs: { select: { id: true, creadoPorId: true } },
    },
  });

  if (!foto || foto.pqrs.id !== params.id) {
    return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
  }

  // Residentes solo pueden ver fotos de sus propias PQRS
  if (session.user.role === "RESIDENTE" && foto.pqrs.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const base64Data = foto.data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": foto.tipo,
      "Content-Disposition": `inline; filename="${foto.nombre}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
}