import { Role } from "@prisma/client";
import { Session } from "next-auth";

export function isSuperAdmin(role?: Role | string | null): boolean {
  return role === "SUPER_ADMIN";
}

export function assertSuperAdmin(session: Session | null): asserts session is Session {
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    throw new Error("Se requiere rol SUPER_ADMIN");
  }
}