import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  if (!req.auth) {
    const signInUrl = new URL("/auth/login", req.url);
    signInUrl.searchParams.set("callbackUrl", req.url);
    return Response.redirect(signInUrl);
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  });
  const role = req.auth.user?.role || token?.role;
  const pathname = req.nextUrl.pathname;
  const onboardingCompletedAt = req.auth.user?.onboardingCompletedAt || token?.onboardingCompletedAt;

  if (!onboardingCompletedAt && role === "ADMIN" && !pathname.startsWith("/onboarding/admin")) {
    return Response.redirect(new URL("/onboarding/admin", req.url));
  }
  if (!onboardingCompletedAt && role === "RESIDENTE" && !pathname.startsWith("/onboarding/residente")) {
    return Response.redirect(new URL("/onboarding/residente", req.url));
  }
  if (onboardingCompletedAt && pathname.startsWith("/onboarding/")) {
    return Response.redirect(new URL(role === "ADMIN" ? "/admin/dashboard" : "/residente", req.url));
  }

  const deny = () => {
    const deniedUrl = new URL("/auth/error", req.url);
    deniedUrl.searchParams.set("error", "AccessDenied");
    return Response.redirect(deniedUrl);
  };

  if (pathname.startsWith("/super-admin") && role !== "SUPER_ADMIN") {
    return deny();
  }

  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return deny();
  }

  if (pathname.startsWith("/consejo") && role !== "CONSEJO") {
    return deny();
  }

  if (pathname.startsWith("/residente") && role !== "RESIDENTE") {
    return deny();
  }
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
    "/consejo/:path*",
    "/residente/:path*",
    "/pqrs/:path*",
    "/reportes/:path*",
    "/usuarios/:path*",
    "/super-admin/:path*",
    "/cambiar-contrasena/:path*",
  ],
};

