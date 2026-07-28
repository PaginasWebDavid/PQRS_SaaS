import { NextRequest, NextResponse } from "next/server";
import { resetGlobalPassword } from "@/domains/account/account.service";
import { getAccountSecurityErrorResponse } from "@/domains/account/account-security";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    const record = body as Record<string, unknown>;
    await resetGlobalPassword({
      token: record.token,
      newPassword: record.password,
      confirmPassword: record.confirmPassword,
      origin: "password-reset",
    });
    return NextResponse.json({ message: "Contrasena actualizada correctamente" });
  } catch (error) {
    const known = getAccountSecurityErrorResponse(error);
    if (known) return NextResponse.json(known.body, { status: known.status });
    return NextResponse.json({ error: "No se pudo restablecer la contrasena" }, { status: 500 });
  }
}