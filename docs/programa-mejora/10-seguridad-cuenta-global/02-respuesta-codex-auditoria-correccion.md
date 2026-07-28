# FASE 7A - INFORME DE SEGURIDAD DE CUENTA GLOBAL

## Estado

`IMPLEMENTADO CON RIESGOS`

La identidad global fue separada de cualquier contexto tenant para perfil, contrasena, recuperacion y avatar. Se agrego revocacion durable de sesiones mediante versionado y se mantuvo intacta la arquitectura multi-conjunto.

## 1. Vulnerabilidades encontradas

1. Los tokens de recuperacion se almacenaban en texto plano en `VerificationToken.token`.
2. El reset actualizaba la contrasena y eliminaba el token en operaciones separadas, permitiendo carreras y consumo inconsistente.
3. Dos consumos concurrentes podian observar el mismo token antes de eliminarlo.
4. Cambiar o restablecer la contrasena no revocaba JWT anteriores.
5. La ruta autenticada de cambio de contrasena dependia de acceso tenant y bloqueaba casos globales como SUPER_ADMIN o tenant suspendido.
6. La politica aceptaba contrasenas de solo seis caracteres y no limitaba correctamente el maximo compatible con bcrypt.
7. El perfil aceptaba `image` como URL enviada por el cliente y no aplicaba una whitelist completa.
8. Un PATCH parcial podia borrar el telefono por omision.
9. El avatar dependia del tenant seleccionado aunque es identidad global.
10. El path de avatar se derivaba de tenant y nombre del cliente, no exclusivamente del `userId` global.
11. Reemplazar avatar no compensaba un fallo DB posterior al upload y no limpiaba de forma segura el archivo anterior.
12. El DELETE de avatar solo desvinculaba DB y no limpiaba Storage.
13. El email de recuperacion interpolaba el nombre sin escape HTML explicito.
14. `AuditLog` de email duplicaba el correo completo del destinatario en metadata.
15. Los asuntos transaccionales no tenian una barrera central contra CRLF.
16. La UI afirmaba que el correo habia sido enviado aunque la respuesta publica solo puede ser condicional.
17. Los errores inesperados de varias rutas no estaban mapeados de forma uniforme.

## 2. Correcciones

- Token aleatorio criptografico de 32 bytes y persistencia exclusiva de SHA-256.
- Expiracion reducida a 30 minutos.
- Solicitud nueva invalida tokens anteriores del mismo usuario en una transaccion.
- Consumo del token, cambio de password, incremento de version, revocacion de sesiones y auditoria en una unica transaccion.
- CAS sobre token y hash anterior del password.
- `sessionVersion` y `passwordChangedAt` en `User`.
- Revalidacion de `sessionVersion` en cada callback JWT.
- Perfil con whitelist estricta y PATCH parcial real.
- Avatar global con path `users/{userId}/avatar-{uuid}.{extension}`.
- Validacion de MIME, firma binaria, extension, tamano y traversal.
- Compensacion del upload si falla DB o auditoria.
- Limpieza del avatar anterior solo si el path almacenado pertenece al usuario.
- Errores publicos en lista blanca y error generico para fallos inesperados.
- Auditoria de eventos de password y avatar sin password, hash, token ni bytes.

## 3. Perfil global

Permanecen en `User`:

- email;
- nombre;
- telefono;
- password;
- image;
- `isActive`;
- `sessionVersion`;
- `passwordChangedAt`.

`/api/me` no acepta `userId`, `tenantId`, `membershipId`, rol, estado, email, password, image, relaciones o timestamps. El email continua no editable porque no existe un flujo de verificacion de cambio.

Nombre y telefono usan NFKC, limites y validacion. El usuario solo modifica su propia identidad derivada de la sesion. Los datos residenciales siguen en la membresia seleccionada y no alteran el perfil global al cambiar de conjunto.

## 4. Cambio de contrasena

El flujo autenticado ahora:

1. exige sesion activa;
2. funciona como operacion global, sin depender de licencia o tenant;
3. exige password actual;
4. compara con bcrypt;
5. exige nueva password y confirmacion;
6. exige minimo 8 caracteres;
7. limita a 128 caracteres y 72 bytes UTF-8 para evitar truncamiento de bcrypt;
8. no aplica trim;
9. rechaza reutilizar el password actual;
10. usa bcrypt con coste 10, consistente con el proyecto;
11. actualiza mediante CAS en transaccion;
12. incrementa `sessionVersion` y elimina sesiones DB;
13. exige iniciar sesion nuevamente.

## 5. Recuperacion y reset

La respuesta publica es identica para cuenta activa existente, inexistente, inactiva o input no utilizable.

- El email se normaliza con NFKC, trim y minusculas.
- La API nunca devuelve token ni URL.
- El origen se toma solo de `APP_URL` o `NEXTAUTH_URL` configurados.
- Produccion exige HTTPS; HTTP solo se admite para localhost fuera de produccion.
- El nombre se escapa antes de interpolarlo en HTML.
- El token solo aparece en el enlace enviado al destinatario.
- `EmailLog` y `AuditLog` no almacenan el token ni la URL.
- Una cuenta inactiva no recibe token ni puede consumir uno anterior.
- El reset no reactiva la cuenta y no modifica membresias.
- El correo se envia fuera de la transaccion DB.
- Un fallo conocido del proveedor no se presenta como exito confirmado; la UI usa lenguaje condicional.

## 6. Tokens y concurrencia

`VerificationToken.token` conserva el nombre legacy de la columna, pero ahora contiene solamente SHA-256 del token crudo.

Se verifico con PostgreSQL real:

- un solo uso;
- expiracion;
- invalidacion por nueva solicitud;
- dos resets concurrentes con exactamente un ganador;
- rollback que restaura el token si falla despues del claim;
- CAS del password para evitar sobrescribir un cambio concurrente;
- revocacion de sesiones en el mismo commit.

Los tokens plaintext historicos dejan de ser validos al desplegar esta version. Es un efecto de seguridad intencional.

## 7. Avatar y Storage

Politica conservada: avatar publico en el bucket configurado. La URL es publica, pero la escritura y eliminacion usan exclusivamente service role en servidor.

Controles implementados:

- owner derivado de `session.user.id`;
- independencia del tenant seleccionado;
- no se acepta bucket, path, userId o URL desde el cliente;
- JPG/JPEG, PNG y WEBP exclusivamente;
- firma binaria obligatoria;
- extension coherente con MIME;
- maximo 2 MiB;
- nombre original no entra en el path final;
- path sin email, tenant, bloque o apartamento;
- upload primero, commit DB/auditoria despues y limpieza del anterior al final;
- si DB/auditoria falla, se intenta eliminar el upload nuevo;
- DELETE usa exclusivamente la URL almacenada y valida ownership antes de Storage;
- una URL historica o externa se desvincula sin intentar borrar un path arbitrario;
- errores del proveedor se reducen a codigos internos y respuesta generica.

## 8. Cuenta inactiva y sesiones

`User.isActive = false` bloquea login, perfil, avatar, cambio de password, selector de tenant, notificaciones y operaciones tenant mediante revalidacion DB.

La politica adoptada para recuperacion es bloqueo completo: cambiar password no reactiva automaticamente una cuenta global inactiva.

`sessionVersion` se copia al JWT al iniciar sesion y se compara con DB en callbacks posteriores. Cambio o reset incrementa la version, por lo que JWT anteriores quedan invalidos. Tambien se eliminan filas de `Session` por compatibilidad con cualquier estrategia persistida.

Los JWT emitidos antes de esta migracion no tienen `sessionVersion` y fallan cerrados; los usuarios deberan iniciar sesion una vez despues del despliegue.

## 9. Emails y privacidad

- Nombre dinamico escapado.
- Asunto limitado a 200 caracteres y sin CRLF.
- Enlace basado solo en origen configurado.
- Token ausente de respuestas, logs DB y auditoria.
- `AuditLog` de email ya no duplica el destinatario completo en metadata.
- `EmailLog.recipient` se conserva porque forma parte del registro operacional del correo.
- Errores de Resend permanecen sanitizados.
- No hay reenvio automatico ante resultado ambiguo.

## 10. Archivos modificados

### Modelo y migracion

- `prisma/schema.prisma`
- `prisma/migrations/20260728000200_add_global_account_security/migration.sql`

### Cuenta y seguridad

- `src/domains/account/account-security.ts`
- `src/domains/account/account.service.ts`
- `src/domains/account/avatar.service.ts`
- `src/lib/auth.ts`
- `src/lib/membership-context.ts`
- `src/types/next-auth.d.ts`

### Perfil, password y avatar

- `src/app/api/me/route.ts`
- `src/app/api/me/avatar/route.ts`
- `src/app/api/auth/change-password/route.ts`
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/auth/reset-password/route.ts`
- `src/app/cambiar-contrasena/page.tsx`
- `src/app/auth/olvidar-contrasena/page.tsx`
- `src/app/auth/restablecer-contrasena/page.tsx`

### Helpers relacionados

- `src/lib/storage.ts`
- `src/lib/email.ts`
- `src/domains/platform/audit.service.ts`

### Pruebas

- `tests/unit/account-security.test.ts`
- `tests/unit/avatar-security.test.ts`
- `tests/account-security-integration.test.ts`
- `tests/account-avatar-integration.test.ts`

### Documentacion

- `docs/programa-mejora/10-seguridad-cuenta-global/01-prompt-codex-auditoria-correccion.md`
- `docs/programa-mejora/10-seguridad-cuenta-global/02-respuesta-codex-auditoria-correccion.md`

## 11. Pruebas focalizadas

- Seguridad pura de perfil/password/token/sesion/email: 15/15.
- Avatar unitario y Storage/DB: 17/17.
- Password/reset PostgreSQL: 12/12.
- Total focal conocido: 44/44.
- Migracion aplicada correctamente mediante `npm run test:db:deploy`.
- El guard rechazo correctamente una ejecucion Prisma directa sin runner; las pruebas fueron ejecutadas despues con el entorno protegido, sin desactivar la barrera.

## 12. Typecheck y lint

- `npx prisma validate`: correcto.
- `npx tsc --noEmit`: correcto.
- `npm run lint`: correcto, sin warnings ni errores.
- `git diff --check`: sin errores; solo avisos LF/CRLF de Windows.

## 13. Suite completa

Se ejecuto una sola vez porque hubo migracion y cambio central de sesion:

- total: 508;
- pasaron: 508;
- fallaron: 0;
- skipped/cancelled: 0.

No se repitio la suite.

## 14. Riesgos restantes

1. No existe rate limiting general durable. Un limite en memoria no seria confiable en Vercel/serverless; debe configurarse en edge/WAF o mediante un store compartido antes de alto trafico.
2. Aunque mensajes y status no enumeran cuentas, el envio sincrono a Resend puede producir diferencias de tiempo entre email existente e inexistente. Resolverlo completamente requiere cola/outbox para recuperacion o una capa edge de mitigacion.
3. Debe verificarse en Supabase que el bucket publico no permita listado ni escritura anonima. El codigo nunca expone service role y solo usa acceso privilegiado en servidor.
4. Avatares historicos con path tenant o URL externa se desvinculan pero pueden quedar como objetos huerfanos; limpiarlos requiere un inventario administrativo separado.
5. El email permanece no editable hasta implementar verificacion doble y proteccion contra account takeover.
6. El despliegue debe aplicar la migracion antes del codigo. Los usuarios con JWT antiguo tendran que autenticarse nuevamente.

Estos riesgos no bloquean el cierre tecnico de la fase, pero rate limiting y politicas RLS del bucket bloquean una afirmacion de proteccion operacional completa a gran escala.

## 15. Cierre

- No se eliminaron columnas legacy de `User`.
- No se modificaron roles tenant, selector, invitaciones, PQRS, billing, reservas, reportes ni paquetes.
- No se uso `prisma db push`.
- No se hizo commit.
- No se hizo push.
- No se crearon tags.
- No se inicio otra fase.

Estado final: `IMPLEMENTADO CON RIESGOS`.