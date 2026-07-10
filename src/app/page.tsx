import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const scenes = [
  {
    icon: "💬",
    title: "La respuesta está en un chat de hace tres semanas.",
    desc: "Sin radicado formal, no hay forma de demostrar que se atendió a tiempo.",
  },
  {
    icon: "📊",
    title: "El informe del trimestre se arma a mano. Otra vez.",
    desc: "Horas buscando en correos y planillas lo que debería estar en un solo lugar.",
  },
  {
    icon: "📱",
    title: "La foto del arreglo quedó en el celular de alguien.",
    desc: "Y esa persona ya no trabaja en el conjunto. La evidencia se fue con ella.",
  },
];

const flowSteps = ["Radicada", "Recibida", "En revisión", "En proceso", "Terminada"];

const roles = [
  { initial: "A", title: "Administración", scope: "Opera: PQRS, usuarios, reportes, licencia" },
  { initial: "C", title: "Consejo", scope: "Supervisa: métricas e historial, solo lectura" },
  { initial: "R", title: "Residente", scope: "Consulta: radica y sigue sus solicitudes" },
];

const howSteps = [
  { num: "Paso 1", title: "Configuramos tu conjunto", desc: "Cargamos unidades, torres y tu equipo. Nosotros hacemos el montaje, incluida la migración de tu Excel." },
  { num: "Paso 2", title: "Invitas a los residentes", desc: "Cada residente recibe su acceso por correo. Sin instalar nada: funciona en el navegador." },
  { num: "Paso 3", title: "La primera PQRS entra ese mismo día", desc: "Desde ese momento, todo queda radicado, asignado y medido." },
];

const pricingTiers = [
  { label: "Conjuntos pequeños", range: "50–100", popular: false },
  { label: "El más común", range: "101–300", popular: true },
  { label: "Alto volumen", range: "301–500", popular: false },
  { label: "Gran escala", range: "501+", popular: false },
];

const faqs = [
  { q: "¿Los residentes tienen que instalar una app?", a: "No. Todo funciona en el navegador del celular o del computador. El residente recibe un enlace, crea su cuenta y ya puede radicar." },
  { q: "¿Qué pasa con las PQRS que ya tenemos en Excel?", a: "Las migramos nosotros durante el montaje, para que el historial no se pierda." },
  { q: "¿Puedo exportar los reportes?", a: "Sí, en Excel y PDF, con filtros por fecha, estado y asunto. Listos para la reunión de consejo." },
  { q: "¿Quién puede ver la información del conjunto?", a: "Solo los usuarios de tu conjunto, según su rol. La información de cada cliente está aislada y protegida." },
  { q: "¿Cómo funciona el cobro?", a: "Una tarifa mensual por conjunto, según su número de unidades. Sin costos por usuario ni sorpresas." },
];

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(session.user.role === "SUPER_ADMIN" ? "/super-admin" : session.user.role === "RESIDENTE" ? "/pqrs" : "/dashboard");
  }

  return (
    <div className="min-h-screen bg-white text-foreground">
      {/* NAV */}
      <nav className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-13 max-w-5xl items-center justify-between gap-5 px-5">
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
              P
            </span>
            <span className="text-[15px] font-extrabold tracking-tight">
              PQRS <span className="font-medium text-muted-foreground">Services</span>
            </span>
          </div>
          <div className="hidden items-center gap-6 sm:flex">
            <Link href="#producto" className="text-[12.5px] font-medium text-[#424245] hover:text-foreground">Producto</Link>
            <Link href="#precios" className="text-[12.5px] font-medium text-[#424245] hover:text-foreground">Precios</Link>
            <Link href="#faq" className="text-[12.5px] font-medium text-[#424245] hover:text-foreground">Preguntas</Link>
            <Link href="/auth/login" className="text-[12.5px] font-medium text-[#424245] hover:text-foreground">Iniciar sesión</Link>
          </div>
          <Link href="/auth/login" className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            Iniciar sesión
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="px-5 pb-16 pt-20 text-center sm:pt-28">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center justify-center gap-2">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
              P
            </span>
            <span className="text-[15px] font-bold text-primary">PQRS Services</span>
          </div>
          <h1 className="mb-5 text-[38px] font-extrabold leading-[1.05] tracking-tight sm:text-[56px]">
            La gestión de tu conjunto,
            <br />
            finalmente en orden.
          </h1>
          <p className="mx-auto mb-7 max-w-lg text-[16.5px] font-medium leading-relaxed text-muted-foreground sm:text-[19px]">
            Toda solicitud queda radicada, asignada y cerrada con evidencia. Sin WhatsApp. Sin Excel. Sin correos perdidos.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <Link href="/auth/login" className="rounded-full bg-primary px-7 py-3 text-[15px] font-semibold text-primary-foreground hover:bg-primary/90">
              Iniciar sesión
            </Link>
            <Link href="#producto" className="inline-flex items-center gap-1.5 px-2.5 py-3 text-[15px] font-semibold text-primary">
              Conocer el producto <span className="text-[13px]">›</span>
            </Link>
          </div>
        </div>
      </section>

      {/* PROBLEMA */}
      <section className="bg-[#F5F5F7]">
        <div className="mx-auto max-w-2xl px-5 py-16 text-center sm:py-24">
          <h2 className="mb-4 text-[28px] font-extrabold leading-[1.12] tracking-tight sm:text-[38px]">
            Hoy las solicitudes llegan por seis canales distintos.
            <br />
            <span className="text-muted-foreground">Y no quedan en ninguno.</span>
          </h2>
          <p className="mx-auto max-w-lg text-[15.5px] font-medium leading-relaxed text-muted-foreground sm:text-[17px]">
            Un chat que se pierde, un Excel que nadie actualiza, un correo sin respuesta. Cuando el residente reclama o el consejo pide cuentas, no hay cómo demostrar la gestión.
          </p>
        </div>
        <div className="mx-auto max-w-5xl px-5 pb-16 sm:pb-24">
          <div className="grid gap-4 sm:grid-cols-3">
            {scenes.map((s) => (
              <div key={s.title} className="rounded-2xl bg-white p-7 shadow-sm">
                <div className="mb-4 text-2xl">{s.icon}</div>
                <p className="mb-2 text-[15px] font-bold leading-snug tracking-tight">{s.title}</p>
                <p className="text-[13.5px] font-medium leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTO */}
      <section id="producto">
        <div className="mx-auto max-w-2xl px-5 py-16 text-center sm:py-24">
          <div className="mb-3.5 text-[13px] font-bold text-primary">El producto</div>
          <h2 className="mb-4 text-[28px] font-extrabold leading-[1.12] tracking-tight sm:text-[38px]">
            Un solo flujo.
            <br />
            De la queja al cierre.
          </h2>
          <p className="mx-auto max-w-md text-[15.5px] font-medium leading-relaxed text-muted-foreground sm:text-[17px]">
            Cada solicitud entra con número de radicado, pasa por cinco estados definidos y termina con evidencia adjunta.
          </p>
        </div>

        <div className="mx-auto max-w-5xl px-5 pb-16 sm:pb-24">
          <div className="rounded-[20px] bg-primary p-7 text-white sm:rounded-3xl sm:p-10">
            <div className="mb-7 max-w-md">
              <h3 className="mb-3 text-2xl font-extrabold tracking-tight sm:text-[30px]">
                Cinco estados.
                <br />
                Ninguna zona gris.
              </h3>
              <p className="text-[15px] font-medium leading-relaxed text-primary-foreground/70">
                Radicada, recibida, en revisión, en proceso, terminada. Todos —administración, consejo y residente— ven el mismo estado, al mismo tiempo.
              </p>
            </div>
            <div className="flex items-center overflow-x-auto pb-1.5">
              {flowSteps.map((label, i) => {
                const isLast = i === flowSteps.length - 1;
                return (
                  <div key={label} className="flex min-w-[84px] flex-1 items-center">
                    <div className="flex shrink-0 flex-col gap-2">
                      <div
                        className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-[12.5px] font-bold ${
                          isLast ? "bg-success text-white" : "bg-white/10 text-white"
                        }`}
                      >
                        {isLast ? "✓" : i + 1}
                      </div>
                      <div className={`whitespace-nowrap text-xs font-semibold ${isLast ? "text-success" : "text-primary-foreground/70"}`}>
                        {label}
                      </div>
                    </div>
                    {!isLast && <div className="mx-3 mb-6 h-0.5 flex-1 rounded bg-white/20" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="bg-[#F5F5F7]">
        <div className="mx-auto max-w-2xl px-5 py-16 text-center sm:py-24">
          <div className="mb-3.5 text-[13px] font-bold text-primary">Cómo empieza</div>
          <h2 className="text-[28px] font-extrabold leading-[1.12] tracking-tight sm:text-[38px]">
            Operando en menos
            <br />
            de una semana.
          </h2>
        </div>
        <div className="mx-auto max-w-5xl px-5 pb-16 sm:pb-24">
          <div className="grid gap-4 sm:grid-cols-3">
            {howSteps.map((s) => (
              <div key={s.num} className="rounded-2xl bg-white p-7 shadow-sm">
                <div className="mb-3.5 text-[13px] font-bold text-primary">{s.num}</div>
                <h3 className="mb-2 text-[17px] font-extrabold tracking-tight">{s.title}</h3>
                <p className="text-[13.5px] font-medium leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARA CADA ROL */}
      <section className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
        <div className="mb-8 text-center">
          <h2 className="text-[28px] font-extrabold leading-[1.12] tracking-tight sm:text-[38px]">Cada quien ve lo suyo.</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] font-medium text-muted-foreground">
            Permisos claros, sin configurar nada.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          {roles.map((r) => (
            <div key={r.title} className="flex items-center gap-3 rounded-2xl bg-[#F5F5F7] px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-primary">
                {r.initial}
              </span>
              <div>
                <div className="text-[13.5px] font-bold">{r.title}</div>
                <div className="text-[12px] text-muted-foreground">{r.scope}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRECIOS */}
      <section id="precios">
        <div className="mx-auto max-w-2xl px-5 py-16 text-center sm:py-24">
          <div className="mb-3.5 text-[13px] font-bold text-primary">Precios</div>
          <h2 className="mb-4 text-[28px] font-extrabold leading-[1.12] tracking-tight sm:text-[38px]">
            Un precio por conjunto.
            <br />
            <span className="text-muted-foreground">Sin costos por usuario.</span>
          </h2>
          <p className="mx-auto max-w-md text-[15.5px] font-medium leading-relaxed text-muted-foreground sm:text-[17px]">
            La tarifa depende del número de unidades. Todos los residentes y todo el equipo de administración, incluidos.
          </p>
        </div>
        <div className="mx-auto max-w-5xl px-5 pb-16 sm:pb-24">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {pricingTiers.map((tier) => (
              <div
                key={tier.label}
                className={`flex flex-col rounded-2xl p-6 shadow-sm ${tier.popular ? "bg-primary text-white" : "bg-[#F5F5F7]"}`}
              >
                <div className={`mb-1.5 text-xs font-semibold ${tier.popular ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {tier.label}
                </div>
                <div className="text-2xl font-extrabold tracking-tight">{tier.range}</div>
                <div className={`mb-5 mt-1 text-xs font-medium ${tier.popular ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  unidades
                </div>
                <Link
                  href="/auth/login"
                  className={`mt-auto rounded-full py-2.5 text-center text-[13px] font-semibold ${
                    tier.popular ? "bg-white text-primary" : "bg-primary text-primary-foreground"
                  }`}
                >
                  Cotizar
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-[#F5F5F7]">
        <div className="mx-auto max-w-xl px-5 py-16 sm:py-24">
          <div className="mb-9 text-center">
            <div className="mb-3.5 text-[13px] font-bold text-primary">Preguntas frecuentes</div>
            <h2 className="text-[28px] font-extrabold leading-[1.12] tracking-tight sm:text-[38px]">
              Lo que siempre
              <br />
              nos preguntan.
            </h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {faqs.map((faq) => (
              <details key={faq.q} className="group rounded-2xl bg-white p-1 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-bold tracking-tight">
                  {faq.q}
                  <span className="shrink-0 text-lg font-normal text-muted-foreground transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="px-5 pb-5 text-sm font-medium leading-relaxed text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="mx-auto max-w-2xl px-5 py-24 text-center sm:py-36">
        <h2 className="mb-5 text-[32px] font-extrabold leading-[1.08] tracking-tight sm:text-[44px]">
          Tu próxima reunión de consejo,
          <br />
          <span className="text-muted-foreground">con las cuentas claras.</span>
        </h2>
        <p className="mx-auto mb-8 max-w-sm text-[15.5px] font-medium text-muted-foreground sm:text-[17px]">
          Agenda 30 minutos. Te mostramos la plataforma con casos reales de un conjunto como el tuyo.
        </p>
        <div className="flex flex-wrap justify-center gap-3.5">
          <a
            href="mailto:hola@pqrsservices.com?subject=Quiero%20una%20demo"
            className="rounded-full bg-primary px-7 py-3 text-[15px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Agendar una demo
          </a>
          <Link href="/auth/login" className="inline-flex items-center gap-1.5 px-2.5 py-3 text-[15px] font-semibold text-primary">
            Iniciar sesión <span className="text-[13px]">›</span>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-black/[0.08] bg-[#F5F5F7]">
        <div className="mx-auto max-w-5xl px-5 py-9">
          <div className="mb-7 flex flex-wrap items-start justify-between gap-8">
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <span className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-primary-foreground">
                  P
                </span>
                <span className="text-[13.5px] font-extrabold">
                  PQRS <span className="font-medium text-muted-foreground">Services</span>
                </span>
              </div>
              <p className="max-w-[240px] text-xs font-medium leading-relaxed text-muted-foreground">
                Software de gestión de PQRS para conjuntos residenciales y empresas administradoras.
              </p>
            </div>
            <div className="flex flex-wrap gap-10">
              <div className="flex flex-col gap-2">
                <div className="mb-0.5 text-[11.5px] font-bold">Producto</div>
                <Link href="#producto" className="text-xs font-medium text-muted-foreground hover:text-foreground">Funcionalidades</Link>
                <Link href="#precios" className="text-xs font-medium text-muted-foreground hover:text-foreground">Precios</Link>
                <Link href="/auth/login" className="text-xs font-medium text-muted-foreground hover:text-foreground">Iniciar sesión</Link>
              </div>
              <div className="flex flex-col gap-2">
                <div className="mb-0.5 text-[11.5px] font-bold">Legal</div>
                <span className="text-xs font-medium text-muted-foreground">Privacidad</span>
                <span className="text-xs font-medium text-muted-foreground">Términos</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2.5 border-t border-black/[0.08] pt-4">
            <span className="text-[11.5px] font-medium text-muted-foreground">© {new Date().getFullYear()} PQRS Services. Todos los derechos reservados.</span>
            <span className="text-[11.5px] font-medium text-muted-foreground">Hecho para propiedad horizontal</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
