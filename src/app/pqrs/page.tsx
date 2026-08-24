import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function PqrsAliasPage() {
  const session = await auth();
  if (session?.user?.role === "ADMIN") redirect("/admin/pqrs");
  if (session?.user?.role === "RESIDENTE") redirect("/residente");
  // El consejo si tiene vista de PQRS: es su pantalla de inicio. Mandarlo a
  // "acceso denegado" desde un enlace viejo lo deja fuera de su propia seccion.
  if (session?.user?.role === "CONSEJO") redirect("/consejo");
  redirect("/auth/error?error=AccessDenied");
}