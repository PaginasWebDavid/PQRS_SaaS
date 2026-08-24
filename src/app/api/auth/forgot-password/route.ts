import { NextRequest, NextResponse } from "next/server";
import { createPasswordResetRequest } from "@/domains/account/account.service";
import {
  escapeAccountEmailHtml,
  getConfiguredApplicationOrigin,
} from "@/domains/account/account-security";
import { renderEmailLayout, sendEmailSafe } from "@/lib/email";
import { LIMITES, ipDeCabeceras, registrarIntento } from "@/lib/rate-limit";

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

    // Cada solicitud atendida envia un correo real: tiene costo y sirve para
    // inundar el buzon de un tercero. Se limita por destinatario y por IP.
    //
    // Al agotarse el limite se devuelve la MISMA respuesta generica de siempre,
    // no un 429: responder distinto convertiria este punto en un oraculo para
    // averiguar que correos estan registrados.
    const ip = ipDeCabeceras(req.headers);
    const destinatario = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (destinatario) {
      const porDestinatario = await registrarIntento(
        `correo:destinatario:${destinatario}`,
        LIMITES.correoPorDestinatario.maximo,
        LIMITES.correoPorDestinatario.ventanaSegundos
      );
      if (!porDestinatario.permitido) return NextResponse.json(PUBLIC_RESPONSE);
    }
    const porIp = await registrarIntento(
      `correo:ip:${ip}`,
      LIMITES.correoPorIp.maximo,
      LIMITES.correoPorIp.ventanaSegundos
    );
    if (!porIp.permitido) return NextResponse.json(PUBLIC_RESPONSE);

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