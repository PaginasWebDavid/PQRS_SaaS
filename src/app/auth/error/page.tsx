"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    Configuration: "Hay un problema con la configuración del servidor.",
    AccessDenied: "No tienes permiso para acceder.",
    Verification: "El enlace de verificación expiró o ya fue utilizado.",
    Default: "Ocurrió un error al intentar iniciar sesión.",
  };

  const message = errorMessages[error || "Default"] || errorMessages.Default;

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <CardTitle className="text-2xl">Error de autenticación</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/auth/login">
          <Button>Intentar de nuevo</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function ErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-muted/40">
      <Suspense fallback={
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl">Cargando...</CardTitle>
          </CardHeader>
        </Card>
      }>
        <ErrorContent />
      </Suspense>
    </main>
  );
}
