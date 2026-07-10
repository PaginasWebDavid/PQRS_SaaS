import type { Metadata } from "next";
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