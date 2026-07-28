import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SELECTED_TENANT_COOKIE,
  signTenantSelection,
} from "@/lib/tenant-selection";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const tenantId =
    body && typeof body === "object" && !Array.isArray(body)
      ? String((body as Record<string, unknown>).tenantId ?? "").trim()
      : "";
  if (!tenantId) {
    return NextResponse.json(
      { error: "Conjunto no disponible" },
      { status: 404 }
    );
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, tenantId, isActive: true },
    select: {
      id: true,
      tenantId: true,
      role: true,
      onboardingCompletedAt: true,
      tenant: { select: { name: true } },
    },
  });
  if (!membership || membership.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Conjunto no disponible" },
      { status: 404 }
    );
  }

  const response = NextResponse.json({
    membership: {
      id: membership.id,
      tenantId: membership.tenantId,
      tenantName: membership.tenant.name,
      role: membership.role,
    },
    redirectTo: destinationFor(
      membership.role,
      Boolean(membership.onboardingCompletedAt)
    ),
  });
  response.cookies.set({
    name: SELECTED_TENANT_COOKIE,
    value: signTenantSelection(userId, tenantId),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

function destinationFor(role: string, onboardingCompleted: boolean) {
  if (!onboardingCompleted && role === "ADMIN") return "/onboarding/admin";
  if (!onboardingCompleted && role === "RESIDENTE") {
    return "/onboarding/residente";
  }
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "CONSEJO") return "/consejo";
  return "/residente";
}
