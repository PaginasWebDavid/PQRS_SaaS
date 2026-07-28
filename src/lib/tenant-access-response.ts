import { NextResponse } from "next/server";
import {
  assertSessionClaimsCurrent,
  requireActiveTenantUser,
} from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import type { Session } from "next-auth";

export async function getTenantAccessResponse(session: Session): Promise<NextResponse | null> {
  try {
    const identity = await requireActiveTenantUser(session);
    assertSessionClaimsCurrent(session, identity);
    return null;
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
