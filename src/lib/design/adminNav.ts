import type { NavItem } from '@/components/shell/AdminShell';

export const ADMIN_NAV: NavItem[] = [
  { key: 'dashboard', href: '/admin/dashboard', label: 'Inicio' },
  { key: 'pqrs', href: '/admin/pqrs', label: 'PQRS' },
  { key: 'usuarios', href: '/admin/usuarios', label: 'Usuarios' },
  { key: 'reportes', href: '/admin/reportes', label: 'Reportes' },
  { key: 'licencias', href: '/admin/licencias', label: 'Licencias y pagos' },
  { key: 'invitaciones', href: '/admin/invitaciones', label: 'Invitaciones' },
  { key: 'actividad', href: '/admin/actividad', label: 'Actividad' },
  { key: 'configuracion', href: '/admin/configuracion', label: 'Configuración' },
  { key: 'cuenta', href: '/admin/cuenta', label: 'Mi cuenta' },
  { key: 'ayuda', href: '/admin/ayuda', label: 'Ayuda' },
];

