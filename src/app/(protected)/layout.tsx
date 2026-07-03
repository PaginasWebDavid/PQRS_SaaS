import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  getTenantAccessBlockedMessage,
  isTenantAccessBlocked,
  refreshTenantAccessForUser,
} from "@/domains/organizations/tenant.service";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  const accessUser = await refreshTenantAccessForUser(session.user);

  if (isTenantAccessBlocked(accessUser)) {
    return (
      <AppShell user={session.user}>
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Acceso restringido</p>
          <h1 className="mt-2 text-2xl font-bold">Licencia no operativa</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6">
            {getTenantAccessBlockedMessage(accessUser)}
          </p>
        </section>
      </AppShell>
    );
  }

  return <AppShell user={session.user}>{children}</AppShell>;
}