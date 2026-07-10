"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  FileText,
  History,
  LayoutDashboard,
  Lock,
  Menu,
  Plus,
  Shield,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "SUPER_ADMIN" | "ADMIN" | "ASISTENTE" | "CONSEJO" | "RESIDENTE";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navByRole: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { href: "/super-admin", label: "Plataforma", description: "Tenants, licencias, pagos y auditoria", icon: Shield },
  ],
  ADMIN: [
    { href: "/dashboard", label: "Dashboard", description: "Indicadores y licencia", icon: LayoutDashboard },
    { href: "/pqrs", label: "PQRS", description: "Gestion y seguimiento", icon: FileText },
    { href: "/pqrs/nuevo", label: "Crear PQRS", description: "Radicacion manual", icon: Plus },
    { href: "/historial", label: "Historial", description: "Solicitudes cerradas", icon: History },
    { href: "/reportes", label: "Reportes", description: "Exportes y metricas", icon: BarChart3 },
    { href: "/usuarios", label: "Usuarios", description: "Roles y ubicaciones", icon: Users },
  ],
  ASISTENTE: [
    { href: "/dashboard", label: "Dashboard", description: "Indicadores operativos", icon: LayoutDashboard },
    { href: "/pqrs", label: "PQRS", description: "Consulta de solicitudes", icon: FileText },
    { href: "/historial", label: "Historial", description: "Seguimiento cerrado", icon: History },
  ],
  CONSEJO: [
    { href: "/dashboard", label: "Dashboard", description: "Vista de control", icon: LayoutDashboard },
    { href: "/pqrs", label: "PQRS", description: "Consulta de gestion", icon: FileText },
    { href: "/historial", label: "Historial", description: "Casos cerrados", icon: History },
    { href: "/reportes", label: "Reportes", description: "Auditoria y exportes", icon: BarChart3 },
  ],
  RESIDENTE: [
    { href: "/pqrs", label: "Mis PQRS", description: "Estado de solicitudes", icon: FileText },
    { href: "/pqrs/nuevo", label: "Crear PQRS", description: "Nueva solicitud", icon: Plus },
  ],
};

interface AppShellProps {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    role: Role;
    tenantId?: string | null;
    bloque?: number | null;
    apto?: number | null;
  };
}

const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Administrador",
  ASISTENTE: "Asistente",
  CONSEJO: "Consejo",
  RESIDENTE: "Residente",
};

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "U";
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell({ children, user }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const navItems = navByRole[user.role] || navByRole.RESIDENTE;

  const initials = getInitials(user.name, user.email);

  const nav = (
    <nav className="flex h-full flex-col bg-[#FAFAFA] p-4">
      <div className="flex items-center gap-2 px-2 pb-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
          P
        </span>
        <span className="text-sm font-extrabold tracking-tight">
          PQRS <span className="font-medium text-muted-foreground">Services</span>
        </span>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/pqrs" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors",
                isActive ? "bg-accent text-primary" : "text-[#424245] hover:bg-black/[0.04]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto space-y-1 border-t border-black/[0.06] pt-3">
        <Link
          href="/cambiar-contrasena"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[#424245] transition-colors hover:bg-black/[0.04]"
        >
          <Lock className="h-4 w-4 shrink-0" />
          Cambiar clave
        </Link>
        <div className="flex items-center gap-2.5 px-2 pt-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-primary">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-extrabold leading-tight">{user.name || user.email || "Usuario"}</p>
            <p className="truncate text-[11px] font-medium text-muted-foreground">{roleLabel[user.role]}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="text-[11.5px] font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-white text-[#1D1D1F]">
      <header className="sticky top-0 z-40 flex h-13 items-center gap-3 border-b border-black/[0.06] bg-white/80 px-4 backdrop-blur-xl backdrop-saturate-150 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#F5F5F7]"
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{roleLabel[user.role]}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-primary">
          {getInitials(user.name, user.email)}
        </span>
      </header>

      <div className="grid min-h-screen md:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden border-r border-black/[0.06] md:block">{nav}</aside>
        <main className="mx-auto w-full max-w-[1080px] px-5 py-6 md:px-10 md:py-10">{children}</main>
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-[190] bg-black/35 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)}>
          <div
            className="h-full w-[290px] max-w-[84vw] bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-end p-3">
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F5F7]"
                aria-label="Cerrar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[calc(100%-3.5rem)] px-1">{nav}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}