import { NextRequest, NextResponse } from "next/server";
import { acceptInvitation, inspectInvitation } from "@/domains/organizations/invitation.service";


export async function GET(req: NextRequest) {
  try {
    const result = await inspectInvitation(req.nextUrl.searchParams.get("token") || "");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invitacion invalida" }, { status: 400 });
  }
}
export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const result = await acceptInvitation({
      token: String(body.token || ""),
      password: String(body.password || ""),
      name: String(body.name || ""),
      bloque: body.bloque ? Number(body.bloque) : null,
      apto: body.apto ? Number(body.apto) : null,
      acceptedLegal: body.acceptedLegal === true,
      origin: req.headers.get("x-forwarded-for") || req.headers.get("user-agent") || "api",
    });

    return NextResponse.json({
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role },
      invitation: { id: result.invitation.id, status: result.invitation.status, acceptedAt: result.invitation.acceptedAt },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo aceptar la invitacion" }, { status: 400 });
  }
}

