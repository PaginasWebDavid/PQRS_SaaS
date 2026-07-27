import { NextRequest, NextResponse } from "next/server";
import { applyOverdueLicenseRules, isCronAuthorizationValid } from "@/domains/billing/billing.service";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!isCronAuthorizationValid(secret, authHeader)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await applyOverdueLicenseRules(null);
  return NextResponse.json(result);
}
