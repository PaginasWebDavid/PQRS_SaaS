import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  AVATAR_MAX_SIZE,
  AvatarValidationError,
  removeGlobalUserAvatar,
  replaceGlobalUserAvatar,
} from "@/domains/account/avatar.service";
import { getAccountSecurityErrorResponse } from "@/domains/account/account-security";

function invalidFile() {
  return NextResponse.json({ error: "Archivo de avatar invalido" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.isActive !== true) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File) || file.size < 12 || file.size > AVATAR_MAX_SIZE) return invalidFile();

    const result = await replaceGlobalUserAvatar({
      userId: session.user.id,
      fileName: file.name,
      contentType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      origin: "avatar-api",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AvatarValidationError) return invalidFile();
    const known = getAccountSecurityErrorResponse(error);
    if (known) return NextResponse.json(known.body, { status: known.status });
    return NextResponse.json({ error: "No se pudo actualizar el avatar" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.isActive !== true) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json(await removeGlobalUserAvatar({ userId: session.user.id, origin: "avatar-api" }));
  } catch (error) {
    const known = getAccountSecurityErrorResponse(error);
    if (known) return NextResponse.json(known.body, { status: known.status });
    return NextResponse.json({ error: "No se pudo eliminar el avatar" }, { status: 500 });
  }
}