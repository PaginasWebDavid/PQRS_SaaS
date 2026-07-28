import { Role } from "@prisma/client";
import { Session } from "next-auth";
import { isSuperAdminRole, requireSuperAdmin } from "@/lib/authorization";

export function isSuperAdmin(role?: Role | string | null): boolean {
  return isSuperAdminRole(role);
}

export async function assertSuperAdmin(session: Session | null) {
  return requireSuperAdmin(session);
}
