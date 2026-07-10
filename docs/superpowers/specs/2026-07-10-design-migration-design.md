# Migración al diseño final (nextjs_export) — Diseño

## Contexto

El repo tiene, hoy, dos versiones del mismo sistema de diseño coexistiendo:

- La **versión vieja/actual**: `src/components/design-export/*` + `src/lib/design-export/{tokens.ts,adminNav.ts}`, usada por las páginas realmente vivas (`src/app/admin/*`, `residente`, `consejo`, `(protected)/super-admin`, `auth/*`, `onboarding/*`). Estas páginas están conectadas a los endpoints reales (`fetch` a `/api/*`, mutaciones, sesión de NextAuth) pero su UI es una versión más simple/temprana del diseño.
- La **versión nueva y definitiva**: carpeta `nextjs_export/` en la raíz del repo, agregada por el usuario. Es un export estático de Next.js (solo `next`, `react`, `react-dom` como dependencias) con el mismo sistema de componentes (`AdminShell`, `SuperAdminShell`, `ResidentShell`, `Sheet`, `Toast`, `Logo`, `tokens.ts`, `adminNav.ts`) pero con **datos de mentira hardcodeados** (arrays `METRICS`, `RECENT`, etc.) y sin ninguna llamada a API.

Objetivo: usar `nextjs_export` como el diseño final de la aplicación, reconectándolo a la lógica/backend que ya existe, y eliminar la versión vieja. El backend (Prisma, rutas `/api/*`, NextAuth, dominios en `src/domains/*`) no cambia — esto es exclusivamente una migración de capa de presentación.

## Decisiones ya tomadas con el usuario

1. **Ruta de login**: se mantiene `/auth/login` (no se adopta la ruta plana `/login` del ZIP). Se actualiza el contenido de esa página con el diseño nuevo, sin tocar `middleware.ts` ni la config de NextAuth.
2. **Páginas sin equivalente en el ZIP** (`auth/registro`, `auth/restablecer-contrasena`, `auth/error`, `registro/residente`): se adaptan a mano al estilo nuevo (mismos componentes/tokens), conservando su lógica actual intacta. No hay diseño de referencia para ellas.
3. **Nombres de carpeta definitivos**: el sistema de diseño se instala en `src/components/shell/` y `src/lib/design/`, reemplazando `src/components/design-export/` y `src/lib/design-export/` (que se eliminan al final). Se renombra porque, a partir de esta migración, deja de ser "de referencia" y pasa a ser el sistema definitivo.
4. **Alcance**: se migran las 19 páginas con equivalente 1:1 en el ZIP en una sola pasada (no por checkpoints intermedios con el usuario), pero internamente en capas para poder aislar errores de build rápido.

## Arquitectura / estructura de carpetas

Se mantiene `src/app` (Next.js ya usa `src/` en este proyecto; no se migra a `app/` en la raíz).

Instalación del sistema de diseño (paso único, antes de tocar ninguna página):

- `src/components/shell/{AdminShell,SuperAdminShell,ResidentShell,Sheet,Toast,Logo}.tsx` ← copiado/adaptado de `nextjs_export/components/*`
- `src/lib/design/{tokens.ts,adminNav.ts}` ← copiado/adaptado de `nextjs_export/lib/*`
- `public/logo.svg` ← reemplazado por el de `nextjs_export/public/logo.svg` si difiere
- `globals.css`: se funden los estilos del ZIP (fuentes, keyframes, resets) dentro del `globals.css` real del proyecto, sin romper Tailwind ni nada que ya dependa de él.

Todos los imports de `@/components/design-export/*` y `@/lib/design-export/*` en el código vivo se actualizan a `@/components/shell/*` y `@/lib/design/*` a medida que se migra cada página (no antes, para no dejar el build roto a medio camino).

## Estrategia de reconexión por página

Para cada una de las 19 páginas con equivalente en el ZIP, el patrón es siempre el mismo:

1. Partir del JSX/markup de `nextjs_export/app/<ruta>/page.tsx` (la fuente visual de verdad).
2. Localizar la página viva equivalente en `src/app/<ruta>/page.tsx` y extraer su lógica: qué endpoint(s) llama, qué hooks de estado usa, qué mutaciones dispara (crear PQRS, invitar usuario, exportar Excel, subir evidencia, etc.), cómo maneja sesión/rol.
3. Reemplazar los arrays hardcodeados del ZIP (`METRICS`, `RECENT`, listas de ejemplo) por los datos reales obtenidos de esa lógica, preservando los mismos endpoints y contratos de API existentes.
4. Si un elemento visual del ZIP requiere un dato que ningún endpoint expone hoy, se extiende el endpoint existente correspondiente (nunca se crea un endpoint paralelo). Esto se señala explícitamente durante la implementación si ocurre — no se asume de antemano.
5. Se conserva el comportamiento funcional actual (roles, redirecciones de `middleware.ts`, validaciones) — esto es una migración de UI, no una reescritura de reglas de negocio.

Páginas incluidas (19): `admin/{dashboard,pqrs,usuarios,invitaciones,reportes,licencias,actividad,configuracion,cuenta,ayuda}`, `residente`, `consejo`, `(protected)/super-admin` (ruta `/super-admin`), `onboarding/{admin,residente,consejo}`, `auth/login`, `recuperar-contrasena`, `invitacion`.

Páginas de adaptación manual (4, sin diseño en el ZIP): `auth/registro`, `auth/restablecer-contrasena`, `auth/error`, `registro/residente`. Se les aplican los componentes de `src/components/shell/` y los tokens de `src/lib/design/tokens.ts` a mano, manteniendo su estructura y lógica actuales.

## Rollout (capas, ejecutadas en una sola pasada)

1. Instalar el sistema de diseño base (sin tocar páginas).
2. Migrar auth/onboarding: `auth/login`, `recuperar-contrasena`, `invitacion`, `onboarding/{admin,residente,consejo}`.
3. Migrar las 10 páginas de `admin/*`.
4. Migrar `residente`, `consejo`, `super-admin`.
5. Adaptar a mano las 4 páginas sin diseño en el ZIP.
6. Limpieza final: borrar `src/components/design-export/`, `src/lib/design-export/`, y la carpeta de staging `nextjs_export/` en la raíz.

## Verificación

- Tras cada capa: `npx tsc --noEmit` y `npx next build` para aislar errores de compilación rápido en vez de acumularlos.
- Al finalizar todas las capas: levantar el dev server (skill `run`) y probar en navegador el flujo completo — login → dashboard admin → crear PQRS → ver reportes → vista residente → super-admin — comparando visualmente contra el ZIP y confirmando que los datos mostrados son reales (no los mocks).

## Riesgos conocidos

- Las páginas del ZIP tienen más UI que las viejas (modales, tabs, formularios con más campos — ej. `pqrs`: 176 líneas nuevas vs 66 viejas; `residente`: 242 vs 88). Es esperado; parte de esa UI puede necesitar datos que hoy ningún endpoint expone. Se resuelve extendiendo el endpoint existente correspondiente, señalándolo en el momento.
- `globals.css` del ZIP podría chocar con clases/utilidades Tailwind ya en uso — se revisa manualmente al fusionar, no se hace un merge automático ciego.

## Fuera de alcance

- No se modifica Prisma schema, rutas `/api/*`, NextAuth config, ni lógica de dominio en `src/domains/*`.
- No se reescriben reglas de negocio de PQRS, roles, ni flujo de licencias.
- No se introduce el sistema de tenants/multi-tenant (eso es un esfuerzo aparte, ver `docs/TARGET_ARCHITECTURE.md`).
