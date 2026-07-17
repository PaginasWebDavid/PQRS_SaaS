# Auditoría ADMIN: Resumen Ejecutivo

Fecha: 2026-07-16  
Alcance: rol `ADMIN` de un conjunto, desde autenticación hasta persistencia, permisos, correo, archivos, licencias y reportes.

## Diagnóstico

El ADMIN tiene una base funcional real: el dashboard, PQRS, usuarios, invitaciones, reportes, licencias, configuración y actividad consultan APIs y datos de Supabase. El aislamiento principal por `tenantId` está aplicado en los servicios y endpoints revisados.

La auditoría encontró riesgos importantes que impedían considerar el rol listo para producción:

- respuestas de usuarios e invitaciones podían exponer `tokenHash` y URLs portadoras de token;
- la aceptación de invitaciones podía competir consigo misma y, en casos límite, tocar cuentas existentes;
- los endpoints de archivos aceptaban rutas o URLs controladas por el cliente;
- el checkout podía construir una `back_url` inválida al recibir una URL absoluta;
- varios parámetros de PQRS y reportes aceptaban valores inválidos o truncados;
- Resend no tenía timeout explícito;
- las rutas heredadas `/admin`, `/dashboard`, `/pqrs`, `/reportes` y `/usuarios` podían terminar en 404 aunque el middleware las protegiera.

Los problemas críticos encontrados fueron corregidos y la regresión quedó en verde. Persisten riesgos de capacidad y operación que deben resolverse antes de afirmar que el módulo está listo para grandes volúmenes.

## Resultado

**Calificación actual del rol ADMIN: 6.5/10.**

La puntuación sube por la autenticación, aislamiento, persistencia y pruebas existentes. No sube más porque reportes y PQRS todavía cargan colecciones completas, las notificaciones/correos se ejecutan dentro de algunos requests y faltan pruebas de handler HTTP con sesiones reales.

## Decisión

El rol ADMIN puede continuar en entorno de pruebas. No debe declararse listo para producción masiva hasta cerrar los riesgos de `03-pruebas-y-riesgos.md`.
