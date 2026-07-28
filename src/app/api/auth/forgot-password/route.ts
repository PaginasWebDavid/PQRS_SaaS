import { NextRequest, NextResponse } from "next/server";
import { createPasswordResetRequest } from "@/domains/account/account.service";
import {
  escapeAccountEmailHtml,
  getConfiguredApplicationOrigin,
} from "@/domains/account/account-security";
import { renderEmailLayout, sendEmailSafe } from "@/lib/email";

const PUBLIC_RESPONSE = {
  message: "Si el correo corresponde a una cuenta activa, recibiras un enlace para restablecer tu contrasena",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).email
      : null;

    let origin: string;
    try {
      origin = getConfiguredApplicationOrigin();
    } catch {
      return NextResponse.json(PUBLIC_RESPONSE);
    }

    const request = await createPasswordResetRequest(email);
    if (request.delivery) {
      const resetUrl = new URL("/auth/restablecer-contrasena", origin);
      resetUrl.searchParams.set("token", request.delivery.token);
      await sendEmailSafe({
        tenantId: null,
        template: "password_reset",
        to: request.delivery.recipient,
        subject: "Restablecer contrasena - PQRS Services",
        html: renderEmailLayout({
          accent: "navy",
          eyebrow: "Seguridad de tu cuenta",
          heading: "Restablecer tu contrasena",
          bodyHtml: `
            <p>Hola <strong>${escapeAccountEmailHtml(request.delivery.name)}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contrasena. Usa el boton para crear una nueva.</p>
          `,
          cta: { label: "Restablecer contrasena", url: resetUrl.toString() },
          footerNote: "Este enlace expira en 30 minutos. Si no solicitaste el cambio, ignora este correo.",
        }),
      });
    }
    return NextResponse.json(PUBLIC_RESPONSE);
  } catch {
    return NextResponse.json(PUBLIC_RESPONSE);
  }
}