import { NextRequest, NextResponse } from "next/server";
import { processWompiWebhook, WompiWebhookValidationError } from "@/domains/billing/wompi.service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  try {
    const result = await processWompiWebhook(payload, req.headers);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof WompiWebhookValidationError) return NextResponse.json({ error: "Webhook invalido" }, { status: 401 });
    console.error("[billing/wompi/webhook] processing failed");
    return NextResponse.json({ error: "No se pudo procesar el webhook" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, provider: "wompi" });
}
