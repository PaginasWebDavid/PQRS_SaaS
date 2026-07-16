# Matriz de paginas, rutas y APIs

| Ruta/API | Acceso | Resultado probado | Estado |
|---|---|---|---|
| `/super-admin` sin sesion | Ninguno | 302 a `/auth/login` | Correcta |
| `/super-admin` SUPER_ADMIN | SUPER_ADMIN | 200 | Correcta |
| `/super-admin` ADMIN | ADMIN | 302 a onboarding porque la cuenta de prueba no completo onboarding; APIs globales aun devolvieron 403 | Incompleta para diagnostico visual, no vulnerable |
| `/super-admin` CONSEJO | CONSEJO | No se obtuvo acceso; APIs globales devolvieron 403 | Correcta en API |
| `/api/platform/super-admin` | SUPER_ADMIN | GET 200, POST invalido 400 | Correcta con validacion incompleta |
| `/api/platform/analytics` | SUPER_ADMIN | 200; sin sesion/ADMIN/CONSEJO 403 | Correcta |
| `/api/platform/audit-log` | SUPER_ADMIN | 200; `take=-1&skip=-1` devuelve 500 | Invalida para parametros adversos (SA-007) |
| `/api/platform/tenant-users` | SUPER_ADMIN | 200; tenant inexistente devuelve `null` con 200 | Incompleta (SA-007) |
| `/api/platform/support-tickets` | SUPER_ADMIN | 200; POST ADMIN 403 | Correcta |
| `/api/platform/general-settings` | SUPER_ADMIN | 200; otros roles 403 | Correcta |
| `/api/platform/settings` | SUPER_ADMIN | Revision estatica: oculta valores secretos | Correcta |

## Navegacion interna

Los menus no cambian URL: `NAV_DEFS` y `setNav()` en `page.tsx:8-21,857`. Esto evita 404, pero impide enlaces profundos, volver/avanzar del navegador y bookmarks por modulo. Es una limitacion media de navegacion, no una ruta rota.

## Hallazgos de enlaces

No se encontraron enlaces de placeholder dentro de SUPER_ADMIN. Los botones de menu, acciones de conjunto, precios, soporte y configuracion llaman handlers reales. La ruta `GET ?tenantId=` existe pero la UI nunca la usa para el detalle (SA-005).
