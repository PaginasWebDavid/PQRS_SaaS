import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantLicenseSummary } from "@/domains/billing/billing.service";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { getGeneralSettings } from "@/domains/platform/platform-setting.service";
import { getUserMembershipContext, publicMemberships } from "@/lib/membership-context";
import {
  AccountSecurityError,
  assertAllowedAccountPatchKeys,
  getAccountSecurityErrorResponse,
  parseGlobalProfilePatch,
} from "@/domains/account/account-security";
import { GLOBAL_USER_PUBLIC_SELECT } from "@/domains/account/account.service";

function genericError() {
  return NextResponse.json({ error: "No se pudo procesar la solicitud" }, { status: 500 });
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.isActive !== true) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const context = await getUserMembershipContext(session.user.id, session.user.selectedTenantId);
    if (!context?.isActive) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const globalUser = await prisma.user.findUnique({ where: { id: context.userId }, select: GLOBAL_USER_PUBLIC_SELECT });
    if (!globalUser) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const selected = context.selectedMembership;
    const tenant = selected ? await prisma.tenant.findUnique({
      where: { id: selected.tenantId },
      select: { id: true, name: true, slug: true, city: true, address: true, units: true, status: true },
    }) : null;
    const [licenseSummary, generalSettings] = await Promise.all([
      selected ? getTenantLicenseSummary(selected.tenantId) : Promise.resolve(null),
      getGeneralSettings(),
    ]);
    return NextResponse.json({
      user: {
        ...globalUser,
        role: context.isSuperAdmin ? "SUPER_ADMIN" : selected?.role ?? null,
        tenantId: selected?.tenantId ?? null,
        bloque: selected?.bloque ?? null,
        apto: selected?.apto ?? null,
        bloqueAptoEditado: selected?.bloqueAptoEditado ?? false,
        notifyNewPqrsEmail: selected?.notifyNewPqrsEmail ?? true,
        onboardingCompletedAt: selected?.onboardingCompletedAt ?? null,
      },
      tenant,
      memberships: publicMemberships(context),
      selectedTenantId: selected?.tenantId ?? null,
      selectedMembershipId: selected?.id ?? null,
      licenseSummary,
      pqrsCloseSlaDays: generalSettings.pqrsCloseSlaDays,
    });
  } catch {
    return genericError();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.isActive !== true) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const context = await getUserMembershipContext(session.user.id, session.user.selectedTenantId);
    if (!context?.isActive) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    const membership = context.selectedMembership;
    const body = await req.json().catch(() => null);
    assertAllowedAccountPatchKeys(body, ["bloque", "apto", "notifyNewPqrsEmail"]);
    const record = body as Record<string, unknown>;
    const globalPatch = parseGlobalProfilePatch(record);
    const hasLocation = record.bloque !== undefined || record.apto !== undefined;
    const hasNotificationPreference = record.notifyNewPqrsEmail !== undefined;

    if (hasLocation && membership?.role !== "RESIDENTE") throw new AccountSecurityError("INVALID_INPUT");
    if (hasNotificationPreference && membership?.role !== "ADMIN") throw new AccountSecurityError("INVALID_INPUT");
    if (hasLocation && (record.bloque === undefined || record.apto === undefined)) {
      throw new AccountSecurityError("INVALID_INPUT");
    }
    if (hasNotificationPreference && typeof record.notifyNewPqrsEmail !== "boolean") {
      throw new AccountSecurityError("INVALID_INPUT");
    }
    if (Object.keys(globalPatch).length === 0 && !hasLocation && !hasNotificationPreference) {
      throw new AccountSecurityError("INVALID_INPUT");
    }

    let bloque: number | null = membership?.bloque ?? null;
    let apto: number | null = membership?.apto ?? null;
    if (hasLocation) {
      bloque = Number(record.bloque);
      apto = Number(record.apto);
      if (!Number.isInteger(bloque) || bloque < 1 || bloque > 999) throw new AccountSecurityError("INVALID_INPUT");
      if (!Number.isInteger(apto) || apto < 1 || apto > 9999) throw new AccountSecurityError("INVALID_INPUT");
    }

    const user = await prisma.$transaction(async (tx) => {
      if (hasLocation && membership) {
        const changed = membership.bloque !== bloque || membership.apto !== apto;
        if (changed) {
          const claimed = await tx.tenantMembership.updateMany({
            where: { id: membership.id, userId: context.userId, isActive: true, bloqueAptoEditado: false },
            data: { bloque, apto, bloqueAptoEditado: true },
          });
          if (claimed.count !== 1) throw new AccountSecurityError("PROFILE_CONFLICT");
        }
      }
      if (hasNotificationPreference && membership) {
        const updated = await tx.tenantMembership.updateMany({
          where: { id: membership.id, userId: context.userId, isActive: true },
          data: { notifyNewPqrsEmail: record.notifyNewPqrsEmail as boolean },
        });
        if (updated.count !== 1) throw new AccountSecurityError("PROFILE_CONFLICT");
      }
      const updatedUser = Object.keys(globalPatch).length > 0
        ? await tx.user.update({ where: { id: context.userId }, data: globalPatch, select: GLOBAL_USER_PUBLIC_SELECT })
        : await tx.user.findUnique({ where: { id: context.userId }, select: GLOBAL_USER_PUBLIC_SELECT });
      if (!updatedUser?.isActive) throw new AccountSecurityError("ACCOUNT_UNAVAILABLE");
      await registerAuditLog({
        actorUserId: context.userId,
        tenantId: membership?.tenantId ?? null,
        action: AuditAction.PROFILE_UPDATED,
        targetType: "User",
        targetId: context.userId,
        origin: req.headers.get("x-forwarded-for") || "api",
        metadata: {
          globalFields: Object.keys(globalPatch),
          membershipFields: [hasLocation ? "location" : null, hasNotificationPreference ? "notificationPreference" : null].filter(Boolean),
          membershipId: membership?.id ?? null,
        },
      }, tx);
      return updatedUser;
    });

    const refreshedMembership = membership
      ? await prisma.tenantMembership.findUnique({
          where: { id: membership.id },
          select: { role: true, tenantId: true, bloque: true, apto: true, bloqueAptoEditado: true, notifyNewPqrsEmail: true, onboardingCompletedAt: true },
        })
      : null;
    return NextResponse.json({
      user: {
        ...user,
        role: context.isSuperAdmin ? "SUPER_ADMIN" : refreshedMembership?.role ?? null,
        tenantId: refreshedMembership?.tenantId ?? null,
        bloque: refreshedMembership?.bloque ?? null,
        apto: refreshedMembership?.apto ?? null,
        bloqueAptoEditado: refreshedMembership?.bloqueAptoEditado ?? false,
        notifyNewPqrsEmail: refreshedMembership?.notifyNewPqrsEmail ?? true,
        onboardingCompletedAt: refreshedMembership?.onboardingCompletedAt ?? null,
      },
    });
  } catch (error) {
    const known = getAccountSecurityErrorResponse(error);
    if (known) return NextResponse.json(known.body, { status: known.status });
    return genericError();
  }
}