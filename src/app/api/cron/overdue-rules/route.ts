import { NextRequest, NextResponse } from "next/server";
import { applyOverdueLicenseRules } from "@/domains/billing/billing.service";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await applyOverdueLicenseRules(null);
  return NextResponse.json(result);
}
