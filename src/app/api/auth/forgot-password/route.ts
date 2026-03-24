import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
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
        to: email,
        subject: "Restablecer contraseña - Conjunto Parque Residencial Calle 100",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Restablecer contraseña</h2>
            <p>Hola <strong>${user.name}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente botón:</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${resetUrl}" style="display: inline-block; background-color: #15803d; color: white; font-weight: bold; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
                Restablecer contraseña
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.</p>
            <p style="color: #999; font-size: 12px;">Conjunto Parque Residencial Calle 100</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Error enviando email de reset:", emailError);
    }
  }

  return NextResponse.json({
    message: "Si el correo existe, recibirás un enlace para restablecer tu contraseña",
  });
}
