import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exportTenantData, TenantExportError } from "@/domains/platform/tenant-export.service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { buffer, fileName } = await exportTenantData({
      // El target siempre viene del path (explicito y validado contra la DB
      // dentro del servicio); nunca de un tenantId enviado por otra via.
      tenantId: params.id,
      actorUserId: session.user.id,
    });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof TenantExportError) {
      const status = error.code === "TENANT_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[platform/tenants/export] Error inesperado");
    return NextResponse.json({ error: "No se pudo generar la exportacion" }, { status: 500 });
  }
}
