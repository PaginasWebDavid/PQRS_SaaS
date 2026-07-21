import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700", "800"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "PQRS SaaS",
  description: "Plataforma multi-tenant para gestion de PQRS.",
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
    <html lang="es" className={cn("font-sans", manrope.variable, jetbrainsMono.variable)}>
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}