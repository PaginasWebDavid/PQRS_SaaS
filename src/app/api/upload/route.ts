import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { uploadToStorage } from "@/lib/storage";

export async function POST(req: NextRequest) {
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
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se enviÃ³ ningÃºn archivo" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json(
      { error: "El archivo no puede superar 2MB" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await uploadToStorage({
      tenantId,
      folder: "evidencias",
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      buffer,
    });

    return NextResponse.json({
      url: stored.url,
      path: stored.path,
      nombre: stored.fileName,
      tipo: stored.contentType,
      size: stored.size,
    });
  } catch (error) {
    console.error("Error subiendo evidencia:", error);
    return NextResponse.json(
      { error: "No se pudo subir el archivo" },
      { status: 500 }
    );
  }
}