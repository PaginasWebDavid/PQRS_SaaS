import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FileText, Clock, CheckCircle2, Shield } from "lucide-react";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(session.user.role === "RESIDENTE" ? "/pqrs" : "/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-6 py-20 bg-gradient-to-br from-green-950 via-green-900 to-green-800 text-white overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-white/5" />
        <div className="absolute bottom-[-30%] left-[-15%] w-[600px] h-[600px] rounded-full bg-white/5" />
        <div className="absolute top-[40%] left-[5%] w-[200px] h-[200px] rounded-full bg-green-500/10" />

        {/* Logo */}
        <div className="relative z-10 mb-8">
          <div className="bg-white rounded-3xl p-5 shadow-2xl shadow-black/30">
            <Image
              src="/logo.png"
              alt="Parque Residencial Calle 100"
              width={220}
              height={220}
              className="w-44 h-44 sm:w-56 sm:h-56 object-contain"
              priority
            />
          </div>
        </div>

        {/* Text */}
        <div className="relative z-10 text-center max-w-xl">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
            Sistema de Gestión
            <span className="block text-green-300 mt-1">PQRS</span>
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-green-100/90">
            Peticiones, Quejas, Reclamos y Sugerencias
          </p>
          <p className="mt-2 text-sm text-green-200/60">
            Parque Residencial Calle 100 P.H. — Bogotá, Colombia
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="relative z-10 flex flex-col sm:flex-row gap-4 mt-10 w-full max-w-sm sm:max-w-md">
          <Link
            href="/auth/login"
            className="flex-1 text-center rounded-2xl bg-white text-green-900 font-bold text-lg py-4 px-8 shadow-lg hover:bg-green-50 hover:shadow-xl hover:scale-[1.02] transition-all duration-200"
          >
            Iniciar Sesión
          </Link>
          <Link
            href="/auth/registro"
            className="flex-1 text-center rounded-2xl border-2 border-white/70 text-white font-bold text-lg py-4 px-8 hover:bg-white/10 hover:border-white hover:scale-[1.02] transition-all duration-200"
          >
            Registrarse
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-4">
            ¿Cómo funciona?
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-lg mx-auto">
            Gestione sus solicitudes de forma sencilla y rápida desde cualquier dispositivo
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<FileText className="h-10 w-10" />}
              title="Radique"
              description="Envíe su solicitud de forma fácil con solo unos clics"
            />
            <FeatureCard
              icon={<Clock className="h-10 w-10" />}
              title="Seguimiento"
              description="Consulte el estado de su caso en cualquier momento"
            />
            <FeatureCard
              icon={<CheckCircle2 className="h-10 w-10" />}
              title="Respuesta"
              description="Reciba notificación por correo cuando su caso sea resuelto"
            />
            <FeatureCard
              icon={<Shield className="h-10 w-10" />}
              title="Seguro"
              description="Sus datos están protegidos y su solicitud es confidencial"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-green-950 text-green-100/60 py-8 px-6 text-center text-sm">
        <p className="font-medium text-green-100/80">
          Conjunto Parque Residencial Calle 100 P.H.
        </p>
        <p className="mt-1">Bogotá, Colombia</p>
        <p className="mt-2 text-green-200/40">
          © {new Date().getFullYear()} — Todos los derechos reservados
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-100 text-green-700 mb-4">
        {icon}
      </div>
      <h3 className="font-bold text-lg text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}
