import { NextResponse } from "next/server";
import {
  getTenantAccessBlockedMessage,
  isTenantAccessBlocked,
  refreshTenantAccessForUser,
} from "@/domains/organizations/tenant.service";
import type { Session } from "next-auth";

export async function getTenantAccessResponse(session: Session): Promise<NextResponse | null> {
  const user = await refreshTenantAccessForUser(session.user);

  if (!isTenantAccessBlocked(user)) return null;

  return NextResponse.json(
    { error: getTenantAccessBlockedMessage(user) },
    { status: 403 }
  );
}