import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { HistorialList } from "./historial-list";

export default async function HistorialPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Solo ADMIN, CONSEJO y ASISTENTE pueden ver historial
  if (session.user.role === "RESIDENTE") {
    redirect("/pqrs");
  }

  return <HistorialList />;
}
