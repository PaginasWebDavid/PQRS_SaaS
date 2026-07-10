import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { listNotificationsForUser, markAllNotificationsRead, markNotificationRead } from "@/domains/notifications/notification.service";

export async function GET() {
  const session = await auth();
  if (!session?.user || !session.user.tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const notifications = await listNotificationsForUser({ tenantId: getTenantIdFromSession(session), userId: session.user.id });
  return NextResponse.json(notifications);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !session.user.tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);
  const body = await req.json();
  try {
    if (body.all === true) {
      return NextResponse.json(await markAllNotificationsRead({ tenantId, userId: session.user.id }));
    }
    const notification = await markNotificationRead({ tenantId, userId: session.user.id, notificationId: String(body.id || "") });
    return NextResponse.json(notification);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo actualizar" }, { status: 400 });
  }
}
