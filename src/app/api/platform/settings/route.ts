import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIntegrationStatus, listSafePlatformSettings } from "@/domains/platform/platform-setting.service";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const [settings, integrations] = await Promise.all([listSafePlatformSettings(), getIntegrationStatus()]);
  return NextResponse.json({ settings, integrations });
}
