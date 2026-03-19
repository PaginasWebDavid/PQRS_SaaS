import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se envió ningún archivo" }, { status: 400 });
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "El archivo no puede superar 5MB" },
      { status: 400 }
    );
  }

  const blob = await put(`evidencias/${Date.now()}-${file.name}`, file, {
    access: "public",
  });

  return NextResponse.json({
    url: blob.url,
    nombre: file.name,
  });
}
