import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pqrs = await prisma.pqrs.findUnique({
    where: { id: params.id },
    select: {
      evidenciaArchivoData: true,
      evidenciaArchivoNombre: true,
      evidenciaArchivoTipo: true,
      creadoPorId: true,
    },
  });

  if (!pqrs) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }

  // Residents can only download their own
  if (session.user.role === "RESIDENTE" && pqrs.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!pqrs.evidenciaArchivoData) {
    return NextResponse.json({ error: "No hay archivo" }, { status: 404 });
  }

  const buffer = Buffer.from(pqrs.evidenciaArchivoData, "base64");
  const filename = pqrs.evidenciaArchivoNombre || "evidencia";
  const contentType = pqrs.evidenciaArchivoTipo || "application/octet-stream";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
    },
  });
}
