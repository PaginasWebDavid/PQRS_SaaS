"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Menu,
  X,
  LogOut,
  FileText,
  LayoutDashboard,
  BarChart3,
  Users,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    { href: "/reportes", label: "Reportes", icon: BarChart3 },
    { href: "/usuarios", label: "Usuarios", icon: Users },
  ],
  ASISTENTE: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/pqrs", label: "PQRS", icon: FileText },
    { href: "/reportes", label: "Reportes", icon: BarChart3 },
  ],
  CONSEJO: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/pqrs", label: "PQRS", icon: FileText },
    { href: "/reportes", label: "Reportes", icon: BarChart3 },
  ],
  RESIDENTE: [
    { href: "/pqrs", label: "Mis PQRS", icon: FileText },
    { href: "/pqrs/nuevo", label: "Crear PQRS", icon: Plus },
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
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menú</span>
        </Button>
        <span className="font-semibold text-sm truncate">
          PQRS Calle 100
        </span>
        <div className="ml-auto text-right text-xs text-muted-foreground">
          <p className="font-medium text-foreground truncate">{user.name}</p>
          <p>
            {user.role}
            {user.bloque ? ` · T${user.bloque}` : ""}
            {user.apto ? `-${user.apto}` : ""}
          </p>
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
        <div className="absolute inset-0 bg-black/50" />
        <nav
          className={cn(
            "absolute inset-y-0 left-0 w-72 bg-background border-r flex flex-col transition-transform duration-200",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar header */}
          <div className="flex h-14 items-center justify-between border-b px-4">
            <span className="font-semibold">Menú</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Nav links */}
          <div className="flex-1 overflow-y-auto p-3">
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
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Sidebar footer */}
          <div className="border-t p-3">
            <div className="px-3 py-2 text-xs text-muted-foreground mb-2">
              <p className="font-medium text-foreground">{user.name}</p>
              <p>{user.email}</p>
              {user.bloque && (
                <p>
                  Torre {user.bloque}
                  {user.apto ? ` - Apto ${user.apto}` : ""}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground"
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        </nav>
      </div>

      {/* Main content */}
      <main className="p-4">{children}</main>
    </div>
  );
}
