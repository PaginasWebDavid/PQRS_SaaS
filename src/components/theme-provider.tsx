"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Modo oscuro forzado a "light" por ahora: la mayoria de paginas (como
// /auth/login) aun tienen fondos y colores fijos en hex que no responden a
// las variables CSS nuevas, mientras que texto/paneles que si las usan
// (COLORS.navy, color heredado de body) ya cambian con el sistema. Activar
// "system" antes de auditar cada pagina produce una mezcla rota (fondo claro
// fijo + texto/paneles oscuros). Cuando cada superficie este migrada y
// verificada en ambos modos, volver a defaultTheme="system" + enableSystem.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" forcedTheme="light">
      {children}
    </NextThemesProvider>
  );
}
