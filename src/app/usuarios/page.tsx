import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function UsuariosAliasPage() {
  const session = await auth();
  if (session?.user?.role === "ADMIN") redirect("/admin/usuarios");
  redirect("/auth/error?error=AccessDenied");
}