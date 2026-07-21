import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderEmailLayout } from "@/lib/email";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json(
      { error: "El correo es requerido" },
      { status: 400 }
    );
  }

  // Always return success to avoid leaking whether email exists
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    // Delete any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    });

    // Create new token (1 hour expiry)
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/auth/restablecer-contrasena?token=${token}`;

    try {
      await sendEmail({
        tenantId: user.tenantId,
        template: "password_reset",
        to: email,
        subject: "Restablecer contraseña - PQRS Services",
        html: renderEmailLayout({
          accent: "navy",
          eyebrow: "Seguridad de tu cuenta",
          heading: "Restablecer tu contraseña",
          bodyHtml: `
            <p>Hola <strong>${user.name}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para crear una nueva.</p>
          `,
          cta: { label: "Restablecer contraseña", url: resetUrl },
          footerNote: "Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo — tu contraseña actual seguirá funcionando.",
        }),
      });
    } catch (emailError) {
      console.error("Error enviando email de reset:", emailError);
    }
  }

  return NextResponse.json({
    message: "Si el correo existe, recibirás un enlace para restablecer tu contraseña",
  });
}

