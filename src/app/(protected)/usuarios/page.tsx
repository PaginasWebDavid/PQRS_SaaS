import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsuariosList } from "./usuarios-list";

export default async function UsuariosPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <UsuariosList currentUserId={session.user.id} />;
}
