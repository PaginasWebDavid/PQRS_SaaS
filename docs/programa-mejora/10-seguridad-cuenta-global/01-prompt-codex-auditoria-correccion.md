# FASE 7A — SEGURIDAD DE CUENTA GLOBAL, PERFIL, CONTRASEÑA Y AVATAR

Guarda este prompt en:

`docs/programa-mejora/10-seguridad-cuenta-global/01-prompt-codex-auditoria-correccion.md`

Guarda el informe en:

`docs/programa-mejora/10-seguridad-cuenta-global/02-respuesta-codex-auditoria-correccion.md`

No hagas commit.

---

Audita y corrige directamente la seguridad de la identidad global del usuario:

* perfil personal;
* cambio de contraseña;
* recuperación y restablecimiento de contraseña;
* avatar;
* estado global de la cuenta;
* cierre o revocación de sesiones, si existe;
* datos globales compartidos entre membresías.

La arquitectura multi-conjunto ya está comprometida y no debe rediseñarse.

## Eficiencia

* Revisa únicamente cuenta, perfil, contraseña, recuperación, avatar y helpers directos.
* No reaudites membresías, PQRS, billing, reportes ni invitaciones.
* Corrige directamente los defectos encontrados.
* Ejecuta solo pruebas focalizadas.
* No repitas pruebas verdes.
* Typecheck y lint una vez al final.
* No ejecutes suite completa salvo que cambies la mecánica central de sesión o autenticación.
* No revises HEAD, rama o staged.
* No elimines todavía columnas legacy de `User`.
* No hagas commit.

# 1. Modelo de identidad global

Confirma que estos datos pertenecen a `User` global:

* email;
* nombre;
* teléfono global;
* contraseña;
* imagen/avatar;
* `isActive`;
* campos de seguridad de cuenta.

Estos datos no deben duplicarse por membresía.

Confirma que estos datos no se modifican accidentalmente al cambiar de conjunto:

* contraseña;
* avatar;
* nombre;
* teléfono;
* email;
* estado global de la cuenta.

Los datos residenciales deben continuar en `TenantMembership`.

# 2. Perfil personal

Localiza las rutas y servicios reales de perfil, por ejemplo:

```text
/api/me
/api/profile
/api/me/avatar
```

Garantiza:

* el usuario solo consulta y modifica su propia identidad;
* no se acepta `userId` desde el cliente;
* no se acepta `tenantId`, `membershipId` ni rol;
* whitelist estricta de campos editables;
* límites de longitud;
* normalización de nombre y teléfono;
* bloqueo de propiedades como:

  * `role`;
  * `isActive`;
  * `password`;
  * `email`;
  * relaciones;
  * timestamps;
* errores inesperados genéricos;
* ninguna respuesta devuelve password hash, tokens o datos internos.

Decide según el producto actual si el email es editable. Si no existe un flujo de verificación seguro, debe permanecer no editable.

# 3. Cambio de contraseña autenticado

Garantiza:

1. usuario autenticado y activo;
2. contraseña actual obligatoria;
3. comparación segura con el hash actual;
4. nueva contraseña validada;
5. confirmación coherente;
6. hash con el algoritmo y coste estándar actual del proyecto;
7. nueva contraseña distinta de la actual;
8. actualización atómica;
9. respuesta genérica para contraseña actual incorrecta;
10. no exponer hash, sal, stack o detalles de librería.

Política mínima:

* longitud razonable;
* máximo de longitud para evitar abuso;
* no aplicar reglas artificiales innecesarias;
* permitir gestores de contraseñas;
* no hacer trim silencioso de la contraseña;
* rechazar valores extremadamente largos.

Revisa si después del cambio deben invalidarse sesiones previas.

Si el sistema no tiene versión de sesión o mecanismo de revocación, evalúa implementar un campo equivalente a:

```text
sessionVersion
passwordChangedAt
```

Solo crea migración si es necesaria para cerrar un riesgo real.

# 4. Recuperación de contraseña

Audita el flujo completo:

1. solicitud por email;
2. respuesta pública;
3. creación del token;
4. almacenamiento;
5. envío;
6. validación;
7. restablecimiento;
8. invalidación;
9. revocación de sesiones.

Debe garantizar:

* respuesta indistinguible para email existente o inexistente;
* email normalizado con el normalizador común;
* token aleatorio criptográficamente seguro;
* solo hash del token almacenado;
* expiración corta y obligatoria;
* un solo uso;
* solicitud nueva invalida tokens anteriores según política;
* longitud de entrada limitada;
* token no aparece en logs, auditoría ni EmailLog;
* no se devuelve URL de recuperación desde API;
* no se filtra existencia de cuenta mediante tiempos o mensajes evidentes;
* una cuenta global inactiva no puede restablecer contraseña sin política explícita;
* el reset no depende del tenant seleccionado;
* el reset no cambia membresías;
* el cambio y consumo del token son atómicos;
* dos consumos concurrentes solo permiten uno;
* fallo al actualizar password no consume incorrectamente el token;
* sesión previa pierde validez si se implementa revocación.

No envíes correo dentro de una transacción DB.

# 5. Enumeración y abuso

Revisa:

* mensajes;
* status HTTP;
* tiempos aproximados;
* diferencias entre cuenta existente e inexistente;
* rate limiting disponible;
* múltiples solicitudes al mismo email;
* reenvío indiscriminado;
* fuerza bruta del token.

Si no existe rate limiting general:

* implementa una protección local mínima si el stack ya tiene infraestructura;
* de lo contrario documenta el riesgo operacional sin introducir dependencias nuevas.

No registres el email completo innecesariamente en logs de seguridad.

# 6. Avatar

Audita carga, reemplazo, lectura y eliminación.

Garantiza:

* solo el propietario puede modificar su avatar;
* el path se deriva del `userId` global en servidor;
* no depende del tenant seleccionado;
* no acepta bucket/path del cliente;
* nombre sanitizado;
* MIME permitido;
* firma binaria real;
* extensión coherente;
* tamaño máximo;
* traversal bloqueado;
* no sobrescribe archivos de otro usuario;
* no expone service-role key;
* reemplazo confirma el nuevo archivo antes de limpiar el anterior;
* fallo DB después de upload intenta compensar;
* eliminación no recibe path arbitrario;
* no mantiene una transacción DB abierta durante Storage;
* los errores de Storage son genéricos para el cliente.

## Privacidad del avatar

Determina la política actual:

* avatar público;
* avatar privado servido por endpoint;
* URL firmada.

Un avatar público puede ser aceptable si no contiene datos sensibles, pero:

* la URL no debe permitir listar bucket;
* el nombre no debe incluir email, tenant, bloque o apartamento;
* no debe existir acceso de escritura público.

No modifiques la política sin justificarlo.

# 7. Cuenta global inactiva

Confirma que `User.isActive = false` bloquea:

* login;
* APIs autenticadas;
* cambio de tenant;
* perfil;
* cambio de contraseña autenticado;
* notificaciones;
* operaciones tenant.

Determina la política de recuperación para una cuenta inactiva:

* bloqueada completamente; o
* recuperación permitida únicamente como mecanismo de reactivación explícita.

No reactives cuentas automáticamente al cambiar contraseña.

# 8. Sesiones y revocación

Revisa cómo NextAuth valida sesiones.

Garantiza:

* eliminación o desactivación global revoca acceso en el siguiente request sensible;
* cambio de contraseña no deja sesiones antiguas válidas indefinidamente si se implementa versión de sesión;
* cookies/JWT no conceden acceso por sí solos;
* la autorización sensible sigue consultando DB;
* sesión con usuario inexistente falla cerrada.

No rediseñes NextAuth si la revalidación actual ya cubre la revocación.

# 9. Emails

Confirma:

* HTML dinámico escapado;
* asunto sin CRLF;
* enlace usa origen permitido/configurado;
* no se construye desde `Host` no confiable;
* token solo aparece en el enlace enviado;
* token no se guarda en EmailLog;
* errores de proveedor sanitizados;
* no se informa éxito de envío si hubo fallo conocido;
* ante resultado ambiguo no se reenvía automáticamente.

# 10. Auditoría y privacidad

AuditLog puede registrar:

* actor;
* tipo de acción;
* fecha;
* resultado técnico mínimo.

No debe registrar:

* contraseña;
* hash;
* token;
* URL con token;
* bytes del avatar;
* cuerpo completo del proveedor;
* headers de autorización.

Evita guardar PII innecesaria.

# 11. Errores

Usa una lista blanca de errores públicos para:

* contraseña actual incorrecta;
* contraseña inválida;
* token inválido o expirado;
* archivo inválido.

Todos los demás errores deben devolver respuesta genérica.

No devuelvas:

* Prisma;
* SQL;
* constraints;
* rutas;
* bucket;
* host;
* stack;
* mensajes de bcrypt/argon;
* detalles de Resend o Supabase.

# 12. Cambios permitidos

Puedes modificar únicamente:

* rutas y servicios de perfil;
* cambio, recuperación y reset de contraseña;
* autenticación directa relacionada;
* avatar y helpers de Storage usados por avatar;
* emails relacionados;
* pruebas específicas;
* una migración aditiva mínima si es imprescindible;
* documentos 01 y 02.

No modifiques:

* roles tenant;
* selección de conjunto;
* invitaciones;
* PQRS;
* billing;
* reservas;
* reportes;
* paquetes, salvo necesidad crítica y justificada.

No uses `prisma db push`.

# 13. Pruebas mínimas

Añade pruebas para:

1. perfil devuelve solo datos permitidos;
2. usuario no puede modificar otro usuario;
3. body no cambia rol, tenant, membresía o estado;
4. nombre y teléfono se validan;
5. cambio exige contraseña actual;
6. contraseña actual incorrecta produce error genérico;
7. nueva contraseña válida cambia el hash;
8. nueva contraseña igual se rechaza;
9. contraseña excesivamente larga se rechaza;
10. solicitud de recuperación no enumera cuentas;
11. token se almacena hasheado;
12. token válido permite reset;
13. token expirado falla;
14. token usado falla;
15. dos resets concurrentes permiten uno;
16. fallo al actualizar password revierte consumo;
17. reset no altera membresías;
18. cuenta inactiva respeta política;
19. token no aparece en logs o respuesta;
20. avatar propio funciona;
21. avatar ajeno no puede modificarse;
22. MIME inválido falla;
23. firma binaria inválida falla;
24. extensión inválida falla;
25. tamaño excesivo falla;
26. traversal/path arbitrario falla;
27. reemplazo compensa fallo DB;
28. eliminación solo usa path almacenado;
29. error inesperado es genérico;
30. camino de usuario multi-conjunto conserva perfil global único.

Usa PostgreSQL real solo para:

* consumo atómico de token;
* concurrencia;
* rollback;
* revocación de sesión si requiere persistencia.

# 14. Ejecución

Durante el trabajo:

* ejecuta únicamente pruebas focalizadas;
* no repitas archivos verdes sin cambios.

Al final:

```text
npx prisma validate
npx tsc --noEmit
npm run lint
```

Ejecuta la suite completa únicamente si:

* cambias auth/session central;
* agregas migración;
* o una corrección puede afectar transversalmente otros módulos.

Una sola ejecución. No la repitas automáticamente si falla.

# 15. Informe

Entrega:

1. Vulnerabilidades encontradas.
2. Correcciones.
3. Perfil global.
4. Cambio de contraseña.
5. Recuperación y reset.
6. Tokens y concurrencia.
7. Avatar y Storage.
8. Cuenta inactiva y sesiones.
9. Emails y privacidad.
10. Archivos modificados.
11. Pruebas focalizadas.
12. Typecheck/lint.
13. Suite completa, solo si se ejecutó.
14. Riesgos restantes.
15. Estado:

* `IMPLEMENTADO`.
* `IMPLEMENTADO CON RIESGOS`.
* `BLOQUEADO`.

No hagas commit ni inicies otra fase.
