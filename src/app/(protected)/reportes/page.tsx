import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ReportesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Solo ADMIN y CONSEJO pueden ver reportes
  if (session.user.role === "RESIDENTE") {
    redirect("/pqrs");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Reportes</h1>
      <p className="text-muted-foreground">
        Aquí irán los reportes mensuales y la exportación a Excel.
      </p>
    </div>
  );
}
