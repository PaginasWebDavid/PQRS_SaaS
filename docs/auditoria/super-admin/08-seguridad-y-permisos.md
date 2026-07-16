# Seguridad, permisos y aislamiento

## Pruebas ejecutadas

| Actor | Resultado en 6 APIs globales |
|---|---|
| Sin sesion | 403 en APIs; `/super-admin` 302 a login |
| ADMIN | 403 en overview, analytics, auditoria, usuarios tenant, soporte y settings; POST invalido tambien 403 |
| CONSEJO | 403 en las mismas APIs |
| SUPER_ADMIN | 200 en todas las lecturas y `/super-admin` |

La proteccion se aplica tanto en middleware (`src/middleware.ts:38-40`) como dentro de handlers (`src/app/api/platform/*`). No se hallo una elevacion directa de ADMIN/CONSEJO a APIs SUPER_ADMIN.

## Hallazgos

### SA-007 - Errores de parametros filtrables como 500

Un SUPER_ADMIN puede provocar 500 con paginacion negativa. No expone datos a otro rol, pero degrada disponibilidad y dificulta observabilidad. Validar entrada y responder 400.

### SA-015 - Acciones globales sin esquema de validacion

Los handlers confian en conversiones `Number()` y `Boolean()` de cuerpo. Aunque el rol se valida bien, un SUPER_ADMIN con cliente manipulado puede crear estados invalidos o inconsistentes. Aplicar Zod y listas de valores por accion.

## Secretos

`platform-setting.service.ts:27-29` rechaza secretos planos y `listSafePlatformSettings()` enmascara valores (`48-57`). `getIntegrationStatus()` solo informa presencia de variables (`82-101`). No se encontro exposicion de claves privadas en respuestas auditadas.

## Riesgo residual

Faltan pruebas automatizadas especificas de todas las acciones globales y de parametros maliciosos. La seguridad de rol es buena en los endpoints revisados; la integridad de las mutaciones es el riesgo mayor.
