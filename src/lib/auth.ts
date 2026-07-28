import { Role, SubscriptionStatus, TenantStatus } from "@prisma/client";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { getUserMembershipContext } from "@/lib/membership-context";
import {
  SELECTED_TENANT_COOKIE,
  verifyTenantSelection,
} from "@/lib/tenant-selection";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;
        if (!(await bcrypt.compare(String(credentials.password), user.password))) {
          return null;
        }
        const hasAccess =
          user.role === "SUPER_ADMIN" ||
          (await prisma.tenantMembership.count({
            where: { userId: user.id, isActive: true },
          })) > 0;
        if (!hasAccess) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      if (!token.id) return token;

      const userId = String(token.id);
      const selectedTenantId =
        readSelectedTenantCookie(userId) ??
        ((token.selectedTenantId as string | null | undefined) ?? null);
      const context = await getUserMembershipContext(userId, selectedTenantId);
      if (!context) {
        token.isActive = false;
        token.role = null;
        token.tenantId = null;
        token.selectedTenantId = null;
        token.selectedMembershipId = null;
        return token;
      }

      token.isActive = context.isActive;
      token.membershipCount = context.memberships.length;
      if (context.isSuperAdmin) {
        token.role = "SUPER_ADMIN";
        token.tenantId = null;
        token.selectedTenantId = null;
        token.selectedMembershipId = null;
        token.tenantStatus = null;
        token.subscriptionStatus = null;
        token.bloque = null;
        token.apto = null;
        token.onboardingCompletedAt = null;
        return token;
      }

      const membership = context.selectedMembership;
      token.role = membership?.role ?? null;
      token.tenantId = membership?.tenantId ?? null;
      token.selectedTenantId = membership?.tenantId ?? null;
      token.selectedMembershipId = membership?.id ?? null;
      token.tenantStatus = (membership?.tenantStatus as TenantStatus | undefined) ?? null;
      token.subscriptionStatus =
        (membership?.subscriptionStatus as SubscriptionStatus | undefined) ?? null;
      token.bloque = membership?.bloque ?? null;
      token.apto = membership?.apto ?? null;
      token.onboardingCompletedAt =
        membership?.onboardingCompletedAt?.toISOString() ?? null;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.role = (token.role as Role | null | undefined) ?? null;
        session.user.tenantId =
          (token.selectedTenantId as string | null | undefined) ?? null;
        session.user.selectedTenantId = session.user.tenantId;
        session.user.selectedMembershipId =
          (token.selectedMembershipId as string | null | undefined) ?? null;
        session.user.membershipCount = Number(token.membershipCount ?? 0);
        session.user.tenantStatus =
          (token.tenantStatus as TenantStatus | null | undefined) ?? null;
        session.user.subscriptionStatus =
          (token.subscriptionStatus as SubscriptionStatus | null | undefined) ??
          null;
        session.user.bloque = (token.bloque as number | null | undefined) ?? null;
        session.user.apto = (token.apto as number | null | undefined) ?? null;
        session.user.isActive = Boolean(token.isActive);
        session.user.onboardingCompletedAt =
          (token.onboardingCompletedAt as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60,
    updateAge: 60 * 60,
  },
});

function readSelectedTenantCookie(userId: string) {
  try {
    return verifyTenantSelection(
      cookies().get(SELECTED_TENANT_COOKIE)?.value,
      userId
    );
  } catch {
    return null;
  }
}