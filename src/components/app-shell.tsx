"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Menu,
  X,
  LogOut,
  Lock,
  FileText,
  LayoutDashboard,
  Users,
  Plus,
  History,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "ADMIN" | "ASISTENTE" | "CONSEJO" | "RESIDENTE";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navByRole: Record<Role, NavItem[]> = {
  ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/pqrs", label: "PQRS", icon: FileText },
    { href: "/pqrs/nuevo", label: "Crear PQRS", icon: Plus },
    { href: "/historial", label: "Historial PQRS", icon: History },
    { href: "/reportes", label: "Reportes", icon: BarChart3 },
    { href: "/usuarios", label: "Usuarios", icon: Users },
  ],
  ASISTENTE: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/pqrs", label: "PQRS", icon: FileText },
    { href: "/historial", label: "Historial PQRS", icon: History },
  ],
  CONSEJO: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/pqrs", label: "PQRS", icon: FileText },
    { href: "/historial", label: "Historial PQRS", icon: History },
    { href: "/reportes", label: "Reportes", icon: BarChart3 },
  ],
  RESIDENTE: [
    { href: "/pqrs", label: "Mis PQRS", icon: FileText },
    { href: "/pqrs/nuevo", label: "Nueva Solicitud", icon: Plus },
  ],
};

interface AppShellProps {
  children: React.ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    role: Role;
    bloque?: number | null;
    apto?: number | null;
  };
}

export function AppShell({ children, user }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const navItems = navByRole[user.role] || navByRole.RESIDENTE;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 bg-green-800 px-4 shadow-md">
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>

        <div className="flex items-center gap-2">
          <div className="bg-white rounded-lg p-0.5 hidden sm:block">
            <Image
              src="/logo.png"
              alt="Logo"
              width={32}
              height={32}
              className="w-8 h-8 object-contain"
            />
          </div>
          <span className="font-bold text-white text-sm sm:text-base">
            PQRS Calle 100
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-white text-sm truncate max-w-[150px] sm:max-w-none">
              {user.name}
            </p>
            <p className="text-green-200/70 text-xs">
              {user.role === "RESIDENTE"
                ? "Residente"
                : user.role === "ADMIN"
                  ? "Administrador"
                  : user.role === "CONSEJO"
                    ? "Consejo"
                    : user.role}
              {user.bloque ? ` · T${user.bloque}-${user.apto}` : ""}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-sm border-2 border-green-600">
            {user.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-200",
          sidebarOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
      >
        <div className="absolute inset-0 bg-black/60" />
        <nav
          className={cn(
            "absolute inset-y-0 left-0 w-80 bg-white flex flex-col transition-transform duration-200 shadow-2xl",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar header */}
          <div className="flex h-16 items-center justify-between bg-green-800 px-5">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-lg p-0.5">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 object-contain"
                />
              </div>
              <span className="font-bold text-white">Menú</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex items-center justify-center w-10 h-10 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* User info */}
          <div className="px-5 py-4 bg-green-50 border-b border-green-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-lg">
                {user.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{user.name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
                {user.bloque && (
                  <p className="text-sm text-green-700 font-medium">
                    Torre {user.bloque} - Apto {user.apto}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Nav links */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/pqrs" &&
                    pathname.startsWith(item.href + "/")) ||
                  (item.href === "/pqrs" && pathname === "/pqrs");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium transition-all",
                      isActive
                        ? "bg-green-700 text-white shadow-md"
                        : "text-gray-600 hover:bg-green-50 hover:text-green-800"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sidebar footer */}
          <div className="border-t p-4 space-y-1">
            <Link
              href="/cambiar-contrasena"
              onClick={() => setSidebarOpen(false)}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Lock className="h-5 w-5" />
              Cambiar contraseña
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-base font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              Cerrar sesión
            </button>
          </div>
        </nav>
      </div>

      {/* Main content */}
      <main className="p-4 sm:p-6 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}
