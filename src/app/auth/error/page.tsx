"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    Configuration: "Hay un problema con la configuracion del servidor.",
    AccessDenied: "No tienes permiso para acceder.",
    Verification: "El enlace de verificacion expiro o ya fue utilizado.",
    Default: "Ocurrio un error al intentar iniciar sesion.",
  };

  const message = errorMessages[error || "Default"] || errorMessages.Default;

  return (
    <section className="w-full max-w-md border border-input bg-white p-6 text-center">
      <h1 className="text-2xl font-bold">Error de autenticacion</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Link
        href="/auth/login"
        className="mt-6 inline-flex h-11 items-center justify-center border border-primary px-4 text-sm font-medium"
      >
        Intentar de nuevo
      </Link>
    </section>
  );
}

export default function ErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-4">
      <Suspense
        fallback={
          <section className="w-full max-w-md border border-input bg-white p-6 text-center">
            <h1 className="text-2xl font-bold">Cargando...</h1>
          </section>
        }
      >
        <ErrorContent />
      </Suspense>
    </main>
  );
}
