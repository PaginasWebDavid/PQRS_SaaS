import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PqrsForm } from "./pqrs-form";

interface Props {
  searchParams: { tipo?: string };
}

export default async function NuevoPqrsPage({ searchParams }: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Solo ADMIN y RESIDENTE pueden crear PQRS
  if (session.user.role !== "ADMIN" && session.user.role !== "RESIDENTE") {
    redirect("/pqrs");
  }

  const tipoValidos = ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"];
  const tipo = tipoValidos.includes(searchParams.tipo || "")
    ? searchParams.tipo!
    : undefined;

  return (
    <PqrsForm
      role={session.user.role as "ADMIN" | "RESIDENTE"}
      userName={session.user.name}
      userBloque={session.user.bloque}
      userApto={session.user.apto}
      initialTipo={tipo}
    />
  );
}
