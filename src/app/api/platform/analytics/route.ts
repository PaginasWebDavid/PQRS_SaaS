import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlatformAnalytics } from "@/domains/platform/analytics.service";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const data = await getPlatformAnalytics();
  return NextResponse.json(data);
}
