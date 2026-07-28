import { NextRequest, NextResponse } from "next/server";
import {
  acceptInvitation,
  inspectInvitation,
} from "@/domains/organizations/invitation.service";
import { mapInvitationError } from "@/domains/organizations/invitation-security";

export async function GET(req: NextRequest) {
  try {
    const result = await inspectInvitation(
      req.nextUrl.searchParams.get("token") || ""
    );
    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapInvitationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;

  try {
    const result = await acceptInvitation({
      token: typeof record.token === "string" ? record.token : "",
      password: typeof record.password === "string" ? record.password : "",
      name: typeof record.name === "string" ? record.name : "",
      bloque: optionalNumber(record.bloque),
      apto: optionalNumber(record.apto),
      acceptedLegal: record.acceptedLegal === true,
      origin:
        req.headers.get("x-forwarded-for") ||
        req.headers.get("user-agent") ||
        "api",
    });

    return NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      invitation: {
        id: result.invitation.id,
        status: result.invitation.status,
        acceptedAt: result.invitation.acceptedAt,
      },
    });
  } catch (error) {
    const mapped = mapInvitationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "number" ? value : Number(String(value).trim());
}