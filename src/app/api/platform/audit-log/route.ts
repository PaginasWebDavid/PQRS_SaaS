import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuditCategoryCounts, getAuditLogPage } from "@/domains/platform/audit.service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const category = req.nextUrl.searchParams.get("category") || "all";
  const take = Math.min(100, Number(req.nextUrl.searchParams.get("take") || 30));
  const skip = Number(req.nextUrl.searchParams.get("skip") || 0);

  const [counts, page] = await Promise.all([
    getAuditCategoryCounts(),
    getAuditLogPage({ category, take, skip }),
  ]);

  return NextResponse.json({ counts, entries: page.entries, total: page.total });
}
