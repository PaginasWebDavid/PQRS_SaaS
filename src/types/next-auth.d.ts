import { Role, SubscriptionStatus, TenantStatus } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
      tenantId: string | null;
      tenantStatus: TenantStatus | null;
      subscriptionStatus: SubscriptionStatus | null;
      bloque: number | null;
      apto: number | null;
      isActive: boolean;
      onboardingCompletedAt: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    tenantId?: string | null;
    tenantStatus?: TenantStatus | null;
    subscriptionStatus?: SubscriptionStatus | null;
    bloque?: number | null;
    apto?: number | null;
    isActive?: boolean;
    onboardingCompletedAt?: string | null;
  }
}
