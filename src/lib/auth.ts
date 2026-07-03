import { Role, SubscriptionStatus, TenantStatus } from "@prisma/client";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          bloque: user.bloque,
          apto: user.apto,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            role: true,
            tenantId: true,
            bloque: true,
            apto: true,
            tenant: {
              select: {
                status: true,
                subscription: { select: { status: true } },
              },
            },
          },
        });

        token.role = dbUser?.role;
        token.tenantId = dbUser?.tenantId;
        token.tenantStatus = dbUser?.tenant?.status ?? null;
        token.subscriptionStatus = dbUser?.tenant?.subscription?.status ?? null;
        token.bloque = dbUser?.bloque ?? null;
        token.apto = dbUser?.apto ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.tenantId = (token.tenantId as string | null | undefined) ?? null;
        session.user.tenantStatus = (token.tenantStatus as TenantStatus | null | undefined) ?? null;
        session.user.subscriptionStatus = (token.subscriptionStatus as SubscriptionStatus | null | undefined) ?? null;
        session.user.bloque = (token.bloque as number | null | undefined) ?? null;
        session.user.apto = (token.apto as number | null | undefined) ?? null;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
});