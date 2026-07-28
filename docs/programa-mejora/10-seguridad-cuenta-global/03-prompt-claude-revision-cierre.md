# FASE 7B — REVISIÓN Y CIERRE DE SEGURIDAD DE CUENTA GLOBAL

Guarda este prompt en:

`docs/programa-mejora/10-seguridad-cuenta-global/03-prompt-claude-revision-cierre.md`

Guarda el informe en:

`docs/programa-mejora/10-seguridad-cuenta-global/04-respuesta-claude-revision-cierre.md`

## Regla adaptativa

Revisa adversarialmente la Fase 7A.

* Corrige directamente cualquier defecto crítico, alto o medio.
* Si modificas código, pruebas, schema o migración: no hagas commit.
* Si no modificas nada, no queda defecto medio o superior y la evidencia existente es suficiente: crea el commit en esta misma intervención.
* No abras otra fase.

## Eficiencia

* Revisa únicamente el diff de Fase 7A y sus consumidores directos.
* No revises rama, HEAD, historial ni staged al comenzar.
* No repitas la suite completa: ya quedó **508/508 verde** sobre el estado final.
* No repitas typecheck, lint, Prisma ni pruebas focalizadas si no modificas código.
* Si corriges algo:

  * ejecuta únicamente las pruebas afectadas;
  * luego Prisma validate, typecheck y lint una sola vez;
  * no repitas la suite completa automáticamente.
* No reaudites membresías, PQRS, invitaciones o billing.

## Archivos principales

```text
prisma/schema.prisma
prisma/migrations/20260728000200_add_global_account_security/migration.sql

src/domains/account/account-security.ts
src/domains/account/account.service.ts
src/domains/account/avatar.service.ts

src/lib/auth.ts
src/lib/membership-context.ts
src/lib/storage.ts
src/lib/email.ts
src/types/next-auth.d.ts
src/domains/platform/audit.service.ts

src/app/api/me/route.ts
src/app/api/me/avatar/route.ts
src/app/api/auth/change-password/route.ts
src/app/api/auth/forgot-password/route.ts
src/app/api/auth/reset-password/route.ts

src/app/cambiar-contrasena/page.tsx
src/app/auth/olvidar-contrasena/page.tsx
src/app/auth/restablecer-contrasena/page.tsx

tests/unit/account-security.test.ts
tests/unit/avatar-security.test.ts
tests/account-security-integration.test.ts
tests/account-avatar-integration.test.ts
```

Lee los documentos 01 y 02 de esta fase.

# 1. Migración y sesión

Confirma:

* `sessionVersion` tiene default seguro para usuarios existentes.
* `passwordChangedAt` es nullable o recibe backfill válido.
* La migración puede ejecutarse antes del código.
* No se pierden cuentas, contraseñas ni sesiones necesarias.
* JWT emitidos después del login reciben la versión actual.
* Cada request sensible compara la versión del JWT con la versión actual de DB.
* JWT sin versión fallan cerrados únicamente después del despliegue previsto.
* Cambio y reset incrementan exactamente una vez `sessionVersion`.
* Una sesión revocada no puede recuperar acceso cambiando tenant o reutilizando claims.
* Usuario inexistente o globalmente inactivo falla cerrado.

Verifica que el callback no provoque un ciclo donde una sesión válida quede invalidada antes de copiar la versión inicial.

# 2. Perfil global

Confirma que `/api/me`:

* deriva el usuario únicamente de la sesión;
* no acepta `userId`, tenant, membresía, rol o estado;
* usa whitelist estricta;
* no permite editar email, contraseña, avatar o `isActive`;
* distingue correctamente PATCH parcial:

  * campo omitido no se borra;
  * teléfono explícitamente vacío se trata según la política definida;
* normaliza nombre y teléfono sin alterar datos válidos;
* nunca devuelve password, hash, tokens, `sessionVersion` ni campos internos.

Comprueba que cambiar de conjunto no altera el perfil global.

# 3. Cambio de contraseña

Confirma:

* no depende de tenant, licencia o membresía;
* sí exige cuenta global activa;
* contraseña actual obligatoria y comparada de forma segura;
* nueva contraseña y confirmación coherentes;
* no se aplica `trim`;
* mínimo 8 caracteres;
* máximo 128 caracteres y máximo 72 bytes UTF-8 antes de bcrypt;
* una contraseña Unicode no se corta silenciosamente;
* reutilización de la contraseña actual se rechaza;
* actualización usa CAS sobre el hash anterior;
* incremento de versión, password y auditoría son atómicos;
* errores inesperados son genéricos;
* hash, stack y detalles de bcrypt no salen al cliente.

Verifica que una carrera entre dos cambios permita un resultado consistente y no pierda una actualización silenciosamente.

# 4. Recuperación y reset

Reconstruye el flujo completo.

## Solicitud

Confirma:

* email normalizado con el normalizador común;
* cuenta existente, inexistente, inactiva y entrada inválida tienen mismo status y body;
* no se devuelve token ni URL;
* token crudo de 32 bytes;
* DB guarda únicamente SHA-256;
* expiración de 30 minutos;
* una solicitud nueva invalida tokens anteriores;
* no se crea token para cuenta inactiva;
* correo se envía fuera de la transacción;
* origen solo usa `APP_URL` o `NEXTAUTH_URL`;
* producción exige HTTPS;
* no se construye URL desde `Host`, `Origin` o headers del cliente.

## Consumo

Confirma:

* token de entrada tiene longitud limitada;
* hash calculado de forma estable;
* token válido, estado de cuenta y expiración se revalidan dentro de la transacción;
* claim/consumo es atómico;
* password, `sessionVersion`, `passwordChangedAt`, eliminación del token y auditoría quedan en el mismo commit;
* dos consumos concurrentes producen un solo ganador;
* fallo actualizando password no consume el token;
* cambio concurrente de contraseña se detecta por CAS;
* reset no modifica membresías;
* reset no reactiva una cuenta inactiva;
* token histórico en texto plano deja de funcionar intencionalmente.

Busca cualquier respuesta, log, auditoría o EmailLog que pueda contener:

```text
token
resetUrl
VerificationToken.token
Authorization
```

El nombre legacy de la columna puede mantenerse, pero debe almacenar únicamente el hash.

# 5. Enumeración y tiempos

Evalúa específicamente el riesgo de timing:

* email existente activo ejecuta Resend;
* email inexistente o inactivo no lo ejecuta.

Determina si la diferencia permite enumeración práctica.

Clasifica correctamente:

* si es riesgo bajo/operacional: documenta rate limiting, WAF u outbox como condición de escala;
* si es explotable con precisión suficiente para ser medio: corrígelo dentro de esta fase.

No introduzcas una espera fija arbitraria ni una dependencia nueva sin justificarla.

# 6. Avatar y Storage

Confirma:

* identidad derivada del `userId` global;
* no depende del tenant seleccionado;
* path generado en servidor:

```text
users/{userId}/avatar-{uuid}.{extension}
```

* no acepta path, bucket, URL, userId o nombre de destino del cliente;
* formatos permitidos únicamente JPG/JPEG, PNG y WEBP;
* MIME, magic bytes y extensión deben coincidir;
* máximo 2 MiB;
* traversal, rutas absolutas, NUL y separadores rechazados;
* el nombre original no entra al path;
* upload ocurre antes de DB;
* fallo DB/auditoría elimina el archivo nuevo best-effort;
* archivo anterior solo se elimina después del commit exitoso;
* eliminación valida que la URL almacenada corresponde al path del usuario;
* URL externa o histórica se desvincula sin borrar objetos arbitrarios;
* no se mantiene una transacción DB durante llamadas de Storage;
* service-role key nunca llega al cliente;
* errores de Supabase son genéricos.

Comprueba el comportamiento cuando:

* dos reemplazos ocurren concurrentemente;
* dos DELETE ocurren concurrentemente;
* upload termina, pero otro request cambia el avatar antes del commit.

Clasifica si puede producir únicamente un archivo huérfano o si puede borrar el avatar vigente de otro request.

# 7. Cuenta inactiva

Confirma que `User.isActive = false` bloquea:

* login;
* perfil;
* avatar;
* cambio de contraseña autenticado;
* recuperación y reset;
* selector de tenant;
* APIs tenant;
* notificaciones.

No debe reactivarse por reset, login o cambio de tenant.

# 8. Emails y auditoría

Confirma:

* nombre escapado en HTML;
* asuntos centralmente limitados y sin CRLF;
* token solo aparece en el enlace enviado;
* token y URL no se guardan en `EmailLog` o `AuditLog`;
* errores de Resend están sanitizados;
* UI usa lenguaje condicional;
* no se afirma envío confirmado si el proveedor falló;
* auditoría no guarda password, hash, token, bytes, headers ni cuerpo del proveedor.

`EmailLog.recipient` puede conservar el destinatario por necesidad operacional, siempre que tenga acceso restringido y no se duplique innecesariamente en metadata.

Verifica que los cambios centrales de `email.ts` no rompan invitaciones u otros correos.

# 9. Pruebas

Confirma que las 44 pruebas focalizadas y la suite **508/508** cubren realmente:

1. whitelist de perfil;
2. PATCH parcial;
3. contraseña actual;
4. límites por caracteres y bytes;
5. CAS de cambio;
6. respuesta anti-enumeración;
7. token hasheado;
8. expiración;
9. invalidación de token anterior;
10. consumo único;
11. concurrencia;
12. rollback;
13. revocación de sesión;
14. cuenta inactiva;
15. avatar propio;
16. validación de MIME/firma/extensión/tamaño;
17. compensación;
18. path ownership;
19. eliminación segura;
20. usuario multi-conjunto con perfil global único.

No ejecutes pruebas salvo que detectes una inconsistencia concreta.

# 10. Riesgos

Clasifica:

* ausencia de rate limiting durable;
* diferencia temporal por Resend síncrono;
* bucket público no verificado;
* avatares históricos huérfanos;
* email no editable;
* JWT antiguos invalidados al desplegar;
* orden migración → código.

Indica qué bloquea:

* commit;
* despliegue inicial;
* operación a gran escala.

# 11. Commit automático

Solo si:

* no modificas código, pruebas, schema ni migración;
* no queda defecto crítico, alto o medio;
* la migración es segura;
* la evidencia 508/508 es coherente;
* no existen secretos reales en el diff.

Ejecuta una única lista de archivos modificados, añade los archivos de Fase 7A y:

`docs/programa-mejora/10-seguridad-cuenta-global/`

Revisa una vez el staged diff por secretos, tokens reales o archivos ajenos.

Crea:

```text
git commit -m "feat(auth): secure global account recovery and avatar"
```

No ejecutes pruebas después del commit.

# 12. Informe

Entrega:

1. Defectos encontrados.
2. Correcciones, si hubo.
3. Migración y sesiones.
4. Perfil y contraseña.
5. Recuperación y concurrencia.
6. Avatar y Storage.
7. Enumeración y riesgos operacionales.
8. Pruebas revisadas.
9. Resultado:

   * `APROBADO Y COMMIT CREADO`.
   * `CORREGIDO; REQUIERE REVISIÓN FINAL`.
   * `BLOQUEADO`.

Si creas commit, informa el hash solo en la respuesta de la sesión.
