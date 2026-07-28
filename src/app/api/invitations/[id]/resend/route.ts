import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resendInvitation } from "@/domains/organizations/invitation.service";
import {
  mapInvitationError,
  publicInvitationEmailResult,
} from "@/domains/organizations/invitation-security";
import { resolveUserManagementAccess } from "@/domains/organizations/user-management-access";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  let access;
  try {
    access = await resolveUserManagementAccess(
      session,
      req.nextUrl.searchParams.get("tenantId")
    );
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  try {
    const result = await resendInvitation({
      tenantId: access.tenantId,
      invitationId: params.id,
      actorUserId: access.actorUserId,
      origin:
        req.headers.get("x-forwarded-for") ||
        req.headers.get("user-agent") ||
        "api",
    });
    return NextResponse.json({
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
      },
      email: publicInvitationEmailResult(result.emailResult),
    });
  } catch (error) {
    const mapped = mapInvitationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}