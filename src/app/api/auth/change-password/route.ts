import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { changeGlobalPassword } from "@/domains/account/account.service";
import { getAccountSecurityErrorResponse } from "@/domains/account/account-security";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.isActive !== true) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    const record = body as Record<string, unknown>;
    await changeGlobalPassword({
      userId: session.user.id,
      currentPassword: record.currentPassword,
      newPassword: record.newPassword,
      confirmPassword: record.confirmPassword,
      origin: "authenticated-api",
    });
    return NextResponse.json({
      message: "Contrasena actualizada correctamente",
      requiresReauthentication: true,
    });
  } catch (error) {
    const known = getAccountSecurityErrorResponse(error);
    if (known) return NextResponse.json(known.body, { status: known.status });
    return NextResponse.json({ error: "No se pudo cambiar la contrasena" }, { status: 500 });
  }
}