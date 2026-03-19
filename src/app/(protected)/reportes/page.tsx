import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ReportesView } from "./reportes-view";

export default async function ReportesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Solo ADMIN y CONSEJO pueden ver reportes
  if (session.user.role === "RESIDENTE") {
    redirect("/pqrs");
  }

  return <ReportesView />;
}
