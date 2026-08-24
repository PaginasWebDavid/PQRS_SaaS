import { Role, SubscriptionStatus, TenantStatus } from "@prisma/client";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { getUserMembershipContext } from "@/lib/membership-context";
import {
  SELECTED_TENANT_COOKIE,
  verifyTenantSelection,
} from "@/lib/tenant-selection";
import { isSessionVersionCurrent, normalizeAccountEmail } from "@/domains/account/account-security";
import { LIMITES, ipDeCabeceras, limpiarIntentos, registrarIntento } from "@/lib/rate-limit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contrasena", type: "password" },
      },
      async authorize(credentials, request) {
        const email = normalizeAccountEmail(credentials?.email);
        const password = typeof credentials?.password === "string" ? credentials.password : null;
        if (!email || !password || password.length > 128) return null;

        // Se limita por las DOS claves a proposito. Solo por IP, quien tenga
        // muchas direcciones pasa igual; solo por correo, cualquiera puede
        // dejar fuera a un cliente suyo a base de fallar contra su cuenta.
        const ip = ipDeCabeceras(request?.headers ?? new Headers());
        const bucketCorreo = `login:correo:${email}`;
        const bucketIp = `login:ip:${ip}`;

        // Se registra ANTES de comparar la contrasena: asi un ataque no logra
        // que el servidor gaste bcrypt, que es deliberadamente costoso.
        const porCorreo = await registrarIntento(
          bucketCorreo,
          LIMITES.loginPorCorreo.maximo,
          LIMITES.loginPorCorreo.ventanaSegundos
        );
        if (!porCorreo.permitido) return null;

        const porIp = await registrarIntento(
          bucketIp,
          LIMITES.loginPorIp.maximo,
          LIMITES.loginPorIp.ventanaSegundos
        );
        if (!porIp.permitido) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.isActive) return null;
        if (!(await bcrypt.compare(password, user.password))) return null;

        // Entro bien: haber fallado antes no debe seguir contando en su contra.
        await limpiarIntentos(bucketCorreo);
        await limpiarIntentos(bucketIp);
        const hasAccess =
          user.role === "SUPER_ADMIN" ||
          (await prisma.tenantMembership.count({ where: { userId: user.id, isActive: true } })) > 0;
        if (!hasAccess) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          sessionVersion: user.sessionVersion,
        } as typeof user & { id: string };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion;
      }
      if (!token.id) return token;

      const userId = String(token.id);
      const selectedTenantId =
        readSelectedTenantCookie(userId) ??
        ((token.selectedTenantId as string | null | undefined) ?? null);
      const context = await getUserMembershipContext(userId, selectedTenantId);
      if (
        !context?.isActive ||
        !isSessionVersionCurrent(token.sessionVersion, context.sessionVersion)
      ) {
        return invalidateToken(token);
      }

      token.isActive = true;
      token.sessionVersion = context.sessionVersion;
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
      token.onboardingCompletedAt = membership?.onboardingCompletedAt?.toISOString() ?? null;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.role = (token.role as Role | null | undefined) ?? null;
        session.user.tenantId = (token.selectedTenantId as string | null | undefined) ?? null;
        session.user.selectedTenantId = session.user.tenantId;
        session.user.selectedMembershipId =
          (token.selectedMembershipId as string | null | undefined) ?? null;
        session.user.membershipCount = Number(token.membershipCount ?? 0);
        session.user.tenantStatus =
          (token.tenantStatus as TenantStatus | null | undefined) ?? null;
        session.user.subscriptionStatus =
          (token.subscriptionStatus as SubscriptionStatus | null | undefined) ?? null;
        session.user.bloque = (token.bloque as number | null | undefined) ?? null;
        session.user.apto = (token.apto as number | null | undefined) ?? null;
        session.user.isActive = token.isActive === true;
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : null;
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

function invalidateToken(token: JWT): JWT {
  token.isActive = false;
  token.role = null;
  token.tenantId = null;
  token.selectedTenantId = null;
  token.selectedMembershipId = null;
  token.membershipCount = 0;
  token.tenantStatus = null;
  token.subscriptionStatus = null;
  token.bloque = null;
  token.apto = null;
  token.onboardingCompletedAt = null;
  return token;
}

function readSelectedTenantCookie(userId: string) {
  try {
    return verifyTenantSelection(cookies().get(SELECTED_TENANT_COOKIE)?.value, userId);
  } catch {
    return null;
  }
}