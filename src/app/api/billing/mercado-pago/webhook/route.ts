import { NextRequest, NextResponse } from "next/server";
import { processMercadoPagoWebhook } from "@/domains/billing/mercado-pago.service";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const result = await processMercadoPagoWebhook({
      payload,
      headers: req.headers,
      dataIdFromQuery: req.nextUrl.searchParams.get("data.id") || req.nextUrl.searchParams.get("id"),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error procesando webhook Mercado Pago:", error);
    return NextResponse.json({ error: "No se pudo procesar webhook" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, provider: "mercado-pago" });
}
