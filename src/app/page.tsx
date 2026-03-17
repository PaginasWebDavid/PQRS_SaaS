import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(session.user.role === "RESIDENTE" ? "/pqrs" : "/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Parque Residencial Calle 100 P.H.
        </h1>
        <p className="text-muted-foreground">
          Sistema de Gestión de PQRS
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/auth/login"
          className="rounded-md bg-primary px-6 py-3 text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/auth/registro"
          className="rounded-md border border-input bg-background px-6 py-3 font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Registrarse
        </Link>
      </div>
    </main>
  );
}
