import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json(
      { error: "Token y contraseña son requeridos" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 }
    );
  }

  // Find the token
  const verificationToken = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!verificationToken) {
    return NextResponse.json(
      { error: "El enlace no es válido o ya fue utilizado" },
      { status: 400 }
    );
  }

  // Check expiry
  if (verificationToken.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { token },
    });
    return NextResponse.json(
      { error: "El enlace ha expirado. Solicita uno nuevo." },
      { status: 400 }
    );
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: verificationToken.identifier },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Usuario no encontrado" },
      { status: 400 }
    );
  }

  // Update password
  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  // Delete used token
  await prisma.verificationToken.delete({
    where: { token },
  });

  return NextResponse.json({
    message: "Contraseña actualizada correctamente",
  });
}
