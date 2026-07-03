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
  LogOut,
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

export function AppShell({ children, user }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const navItems = navByRole[user.role] || navByRole.RESIDENTE;

  const nav = (
    <nav className="flex h-full flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <p className="text-sm font-semibold">PQRS SaaS</p>
        <p className="mt-1 text-xs text-gray-500">Plantilla funcional basica</p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/pqrs" && pathname.startsWith(item.href + "/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "block border border-transparent p-3 text-sm",
                isActive ? "border-gray-950 bg-white" : "hover:border-gray-300"
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              <span className="mt-1 block text-xs text-gray-500">{item.description}</span>
            </Link>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-gray-200 p-3">
        <Link href="/cambiar-contrasena" className="flex items-center gap-2 border border-gray-200 px-3 py-2 text-sm">
          <Lock className="h-4 w-4" />
          Cambiar clave
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          className="flex w-full items-center gap-2 border border-gray-200 px-3 py-2 text-left text-sm"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesion
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-white text-gray-950">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4">
        <button
          onClick={() => setSidebarOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center border border-gray-300 md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{roleLabel[user.role]}</p>
          <p className="truncate text-xs text-gray-500">
            {user.name || user.email || "Usuario"}
            {user.bloque ? ` · B${user.bloque}-${user.apto}` : ""}
          </p>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-3.5rem)] md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden md:block">{nav}</aside>
        <main className="mx-auto w-full max-w-6xl p-4 md:p-6">{children}</main>
      </div>

      <div
        className={cn("fixed inset-0 z-50 bg-white md:hidden", sidebarOpen ? "block" : "hidden")}
      >
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
          <span className="text-sm font-semibold">Menu</span>
          <button onClick={() => setSidebarOpen(false)} className="border border-gray-300 p-2" aria-label="Cerrar menu">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100vh-3.5rem)]">{nav}</div>
      </div>
    </div>
  );
}