import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "La carga generica fue deshabilitada. Adjunta archivos desde una PQRS autorizada.",
    },
    { status: 410 }
  );
}
