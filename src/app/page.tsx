import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const roles = [
  {
    name: "SUPER_ADMIN",
    modules: ["Panel de plataforma", "Tenants", "Licencias", "Pagos", "Auditoria"],
    actions: ["Crear conjunto", "Crear ADMIN", "Suspender/reactivar tenant", "Generar suscripcion Mercado Pago", "Ver actividad"],
  },
  {
    name: "ADMIN",
    modules: ["Dashboard", "PQRS", "Historial", "Reportes", "Usuarios", "Licencia"],
    actions: ["Crear PQRS manual", "Registrar primer contacto", "Gestionar fases", "Cerrar PQRS", "Exportar reportes", "Administrar usuarios"],
  },
  {
    name: "ASISTENTE",
    modules: ["Dashboard", "PQRS", "Historial"],
    actions: ["Consultar solicitudes", "Dar seguimiento operativo", "Ver historial de gestion"],
  },
  {
    name: "CONSEJO",
    modules: ["Dashboard", "PQRS", "Historial", "Reportes"],
    actions: ["Consultar gestion", "Revisar reportes", "Auditar avance sin modificar"],
  },
  {
    name: "RESIDENTE",
    modules: ["Mis PQRS", "Crear PQRS", "Cambio de clave"],
    actions: ["Radicar solicitud", "Adjuntar fotos", "Consultar estado", "Ver respuesta de cierre"],
  },
];

const flow = [
  "Radicacion por residente o ADMIN",
  "Estado inicial: En espera",
  "ADMIN asigna asunto y registra primer contacto",
  "Estado: En proceso",
  "Gestion por fases: inspeccion, insumos o proveedor, ejecucion, terminado",
  "Cierre con accion tomada y evidencia",
  "Notificacion al residente y paso a historial",
];

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(session.user.role === "SUPER_ADMIN" ? "/super-admin" : session.user.role === "RESIDENTE" ? "/pqrs" : "/dashboard");
  }

  return (
    <main className="min-h-screen bg-white text-foreground">
      <section className="mx-auto flex min-h-[70vh] max-w-5xl flex-col justify-center px-6 py-16">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Plantilla base</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">PQRS SaaS</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Base funcional multi-tenant para administrar PQRS, usuarios, reportes, licencias y cobros. Esta pantalla esta sin identidad visual para facilitar aplicar el diseno final despues.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/auth/login" className="border border-primary px-4 py-2 text-sm font-medium">
            Iniciar sesion
          </Link>
          <Link href="#roles" className="border border-input px-4 py-2 text-sm font-medium">
            Ver modulos por rol
          </Link>
        </div>
      </section>

      <section id="roles" className="border-t border-border px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold">Roles y modulos</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {roles.map((role) => (
              <article key={role.name} className="border border-border p-4">
                <h3 className="font-semibold">{role.name}</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Modulos</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-foreground">
                      {role.modules.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Acciones</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-foreground">
                      {role.actions.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold">Flujo PQRS implementado</h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-2">
            {flow.map((item, index) => (
              <li key={item} className="border border-border p-4 text-sm text-foreground">
                <span className="mr-2 font-mono text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}