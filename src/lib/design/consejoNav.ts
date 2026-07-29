import type { NavItem } from '@/components/shell/AdminShell';

export const CONSEJO_NAV: NavItem[] = [
  { key: 'pqrs', href: '/consejo', label: 'PQRS' },
  { key: 'reservas', href: '/consejo/reservas', label: 'Reservas' },
  { key: 'reportes', href: '/consejo/reportes', label: 'Reportes' },
  { key: 'actividad', href: '/consejo/actividad', label: 'Actividad' },
  { key: 'cuenta', href: '/consejo/cuenta', label: 'Mi cuenta' },
  { key: 'ayuda', href: '/consejo/ayuda', label: 'Ayuda' },
];
