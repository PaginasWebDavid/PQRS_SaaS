import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "El acceso se activa únicamente mediante una invitación del administrador del conjunto." },
    { status: 403 },
  );
}
