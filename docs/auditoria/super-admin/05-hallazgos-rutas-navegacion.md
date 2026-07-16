# Hallazgos de rutas y navegacion

## SA-007 - Parametros invalidos no tienen contrato HTTP seguro

- Severidad: Media.
- Evidencia: prueba HTTP autenticada `GET /api/platform/audit-log?category=all&take=-1&skip=-1` devolvio 500. El handler usa `Number()` y solo limita maximo, `audit-log/route.ts:10-17`; no restringe minimo ni enteros.
- Evidencia adicional: `GET /api/platform/tenant-users?tenantId=does-not-exist` devolvio 200 con `null`; el route delega sin traducir inexistencia a 404 (`tenant-users/route.ts:10-15`).
- Solucion: parsear con schema (`take: 1..100`, `skip: >=0`) y responder 400; devolver 404 para tenant inexistente.

## SA-016 - Modulos no poseen URL propia

- Severidad: Baja.
- Evidencia: sidebar define `key` y `setNav` en vez de `href` (`SuperAdminShell.tsx:13,29-49`; `page.tsx:857`).
- Impacto: no hay deep links, historial navegador ni acceso directo a Auditoria/Analytics/Soporte. No es 404, pero limita soporte y trazabilidad.

## Resultado de seguridad de rutas

- Sin sesion: `/super-admin` redirige a login y APIs responden 403.
- ADMIN y CONSEJO: todos los endpoints globales auditados respondieron 403.
- SUPER_ADMIN: todos respondieron 200.

No se detecto enlace muerto en los botones del panel; los hallazgos se concentran en contratos API invalidos y navegacion de una sola URL.
