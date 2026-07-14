import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupportTicketCounts, listSupportTicketsForSuperAdmin, respondToSupportTicket } from "@/domains/support/support-ticket.service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const status = req.nextUrl.searchParams.get("status") || "all";
  const [tickets, counts] = await Promise.all([
    listSupportTicketsForSuperAdmin({ status }),
    getSupportTicketCounts(),
  ]);
  return NextResponse.json({ tickets, counts });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json();

  try {
    if (body.action === "respond") {
      if (!body.response?.trim()) {
        return NextResponse.json({ error: "Escribe una respuesta" }, { status: 400 });
      }
      const result = await respondToSupportTicket({
        actorUserId: session.user.id,
        ticketId: body.ticketId,
        response: body.response.trim(),
        close: Boolean(body.close),
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la acción";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
