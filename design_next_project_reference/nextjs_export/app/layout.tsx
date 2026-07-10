import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PQRS Services',
  description: 'Plataforma para administrar PQRS de conjuntos residenciales.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
