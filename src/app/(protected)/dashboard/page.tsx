import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Residentes no ven el dashboard, van directo a sus PQRS
  if (session.user.role === "RESIDENTE") {
    redirect("/pqrs");
  }

  return <DashboardView />;
}
