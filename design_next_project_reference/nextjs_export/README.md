# PQRS Services — Next.js (App Router) export

Este es el mismo diseño de PQRS Services, ya convertido a componentes React/TypeScript reales para Next.js — no HTML de referencia, código funcional.

## Cómo usarlo

1. Copia el contenido de esta carpeta dentro de tu repo (o úsala como el repo si estás empezando de cero).
2. `npm install`
3. `npm run dev`
4. Abre `http://localhost:3000`

## Qué incluye

- **Landing** (`/`), **Login** (`/login`), **Recuperar contraseña** (`/recuperar-contrasena`), **Invitación** (`/invitacion`).
- **Onboarding**: `/onboarding/admin`, `/onboarding/residente`, `/onboarding/consejo`.
- **Rol Admin** (sidebar completo): `/admin/dashboard`, `/admin/pqrs`, `/admin/usuarios`, `/admin/invitaciones`, `/admin/reportes`, `/admin/licencias`, `/admin/actividad`, `/admin/configuracion`, `/admin/cuenta`, `/admin/ayuda`.
- **Rol Consejo** (solo lectura): `/consejo`.
- **Rol Residente** (Centro de Estado, bottom-nav en mobile): `/residente`.
- **Rol Super Admin** (panel de negocio con tabs): `/super-admin`.

## Qué es real y qué es mock

- **Real:** todo el diseño (colores, tipografía, layout, componentes, animaciones, responsive, sheets, toasts) y toda la interacción de UI (filtros, formularios, modales, toggles).
- **Mock:** los datos vienen de arrays hardcodeados en cada página (`useState(INITIAL_...)`). No hay llamadas a ningún backend — tal como pediste, para que tú conectes tu API real.
- **Sin auth real:** el login solo redirige tras 500ms; no valida contra ningún servidor. Reemplaza `handleSubmit` en `app/login/page.tsx` por tu llamada real, y agrega guardas de ruta (middleware de Next.js) antes de producción.

## Sistema de diseño

Todos los valores de color/tipografía/espaciado están centralizados en `lib/tokens.ts` — es la fuente de verdad. Los componentes de shell (sidebar/drawer/topbar) están en `components/AdminShell.tsx`, `components/SuperAdminShell.tsx` y `components/ResidentShell.tsx`, reutilizados por todas las páginas de su rol respectivo.

## Estructura

```
app/                      ← rutas (App Router)
components/                ← Shell (sidebar/drawer), Sheet (modal), Toast, Logo
lib/tokens.ts               ← colores, tipografía, radios, helpers de estilo (badge, tab, chip, toggle)
lib/adminNav.ts             ← items de navegación del rol Admin
public/logo.svg             ← logomark oficial
```

## Pendiente para producción (no es diseño, es integración)
1. Conectar cada página a tu API real (reemplazar los `useState(INITIAL_...)` por fetch/SWR/React Query).
2. Autenticación real + middleware de rutas protegidas por rol.
3. Subida real de archivos en evidencias de PQRS.
4. Exportes reales de Excel/PDF en Reportes.
5. El Dashboard Super Admin es la pantalla más grande — algunas interacciones profundas (editar tarifas inline, hilo de respuesta de tickets) están simplificadas a nivel de UI lista para conectar, no completamente interactivas — indícalo si quieres que profundice en alguna en particular.
