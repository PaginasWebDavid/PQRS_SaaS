import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { SessionProvider } from "@/components/session-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700", "800"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

// Esto es lo que ve un administrador en la pestaña del navegador y en Google.
// Antes decia "PQRS SaaS" y "plataforma multi-tenant": vocabulario interno de
// desarrollo que no significa nada para quien administra un conjunto.
export const metadata: Metadata = {
  title: {
    default: "PQRS Services · Gestión de PQRS para conjuntos residenciales",
    template: "%s · PQRS Services",
  },
  description:
    "Software para que la administración de un conjunto residencial reciba, atienda y cierre las PQRS de sus residentes con trazabilidad y reportes para el consejo.",
  applicationName: "PQRS Services",
  openGraph: {
    title: "PQRS Services · Gestión de PQRS para conjuntos residenciales",
    description:
      "Centraliza las solicitudes que hoy viven entre WhatsApp, Excel y correo. Cada una radicada, asignada y cerrada con evidencia.",
    locale: "es_CO",
    type: "website",
  },
};

// Sin esto, los navegadores moviles renderizan la pagina a un ancho virtual de ~980px
// y hacen zoom-out en vez de respetar el ancho real de pantalla, haciendo que cualquier
// layout responsive (isMobile, grids que colapsan, etc.) nunca se active de verdad.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={cn("font-sans", manrope.variable, jetbrainsMono.variable)} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}