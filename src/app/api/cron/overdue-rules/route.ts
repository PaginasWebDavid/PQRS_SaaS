import { NextRequest, NextResponse } from "next/server";
import { applyOverdueLicenseRules, isCronAuthorizationValid } from "@/domains/billing/billing.service";
import { runWompiAutomaticRenewals } from "@/domains/billing/wompi.service";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!isCronAuthorizationValid(secret, authHeader)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Primero se intenta el cobro que ya fue autorizado por el conjunto. Solo
  // despues se aplican las reglas de gracia/suspension, evitando que una
  // licencia vigente pierda acceso antes de que Wompi reciba su intento.
  const automaticRenewals = await runWompiAutomaticRenewals();
  const overdueRules = await applyOverdueLicenseRules(null);
  return NextResponse.json({ automaticRenewals, overdueRules });
}
