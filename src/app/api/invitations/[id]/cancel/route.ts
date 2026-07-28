import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelInvitation } from "@/domains/organizations/invitation.service";
import { mapInvitationError } from "@/domains/organizations/invitation-security";
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
    const invitation = await cancelInvitation({
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
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    const mapped = mapInvitationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}