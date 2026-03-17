import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function UsuariosPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  // Solo ADMIN puede gestionar usuarios
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Usuarios</h1>
      <p className="text-muted-foreground">
        Aquí irá la gestión de usuarios (cambiar roles, ver residentes).
      </p>
    </div>
  );
}
