# FASE 5A — SEGURIDAD DE USUARIOS E INVITACIONES

Guarda este prompt en:

`docs/programa-mejora/08-seguridad-usuarios-invitaciones/01-prompt-codex-auditoria-correccion.md`

Guarda el informe en:

`docs/programa-mejora/08-seguridad-usuarios-invitaciones/02-respuesta-codex-auditoria-correccion.md`

No hagas commit.

---

Audita y corrige directamente:

* listado y creación de usuarios;
* edición, activación y desactivación;
* invitaciones individuales y masivas;
* reenvío y cancelación;
* validación y aceptación del token;
* onboarding derivado de invitaciones;
* asignación de tenant y rol;
* emails de invitación.

Usa la capa común de autorización ya comprometida.

## Eficiencia máxima

* Revisa solo usuarios, invitaciones y helpers directos.
* Corrige los defectos dentro del mismo trabajo.
* No revises PQRS, billing ni otros módulos.
* Durante el desarrollo ejecuta solo pruebas específicas.
* No repitas pruebas verdes.
* Typecheck y lint una sola vez al final.
* Suite completa solo una vez al final si hubo cambios amplios; la base de pruebas ya está separada.
* No ejecutes Prisma si schema no cambia.
* Informe breve, sin repetir estados de Git o historial.

## Permisos esperados

### SUPER_ADMIN

* Puede gestionar usuarios de un tenant únicamente con target explícito y validado.
* No usa tenant de sesión como fallback.
* Puede crear el primer ADMIN según la política existente.

### ADMIN

* Solo gestiona usuarios de su tenant.
* Puede invitar únicamente roles permitidos del tenant.
* Nunca puede crear o promover a SUPER_ADMIN.
* No puede modificar usuarios de otro conjunto.
* No puede eliminarse, degradarse o desactivarse violando las protecciones existentes.
* El tenant debe conservar al menos un ADMIN activo.

### CONSEJO y RESIDENTE

* No pueden listar, crear, editar, invitar, reenviar o cancelar usuarios.
* Pueden acceder únicamente a flujos personales explícitos.

## Riesgos obligatorios

Corrige:

1. IDOR por `userId` o `invitationId`.
2. `tenantId` falsificado en body, query o params.
3. Elevación a SUPER_ADMIN.
4. Cambio de tenant mediante PATCH.
5. Modificación de usuarios cross-tenant.
6. Enumeración de emails.
7. Invitaciones duplicadas.
8. Token reutilizable después de aceptar.
9. Token cancelado o expirado aceptable.
10. Aceptación concurrente del mismo token.
11. Usuario creado parcialmente si falla aceptación.
12. Invitación marcada aceptada sin usuario completo.
13. Email ya registrado en otro tenant.
14. Diferencias de mayúsculas, espacios o Unicode en email.
15. Reenvío que reactive tokens cancelados o aceptados.
16. Cancelación cross-tenant.
17. Bulk invite que permita roles o tenants arbitrarios.
18. Errores que filtren token, email, Prisma o existencia cross-tenant.
19. Tokens guardados o enviados de forma insegura.
20. Emails HTML con contenido sin escape.

## Invitaciones

Determina el flujo real y garantiza:

* token criptográficamente aleatorio;
* preferiblemente hash del token en DB, si el modelo actual lo permite;
* expiración obligatoria;
* un solo uso;
* cancelación irreversible;
* aceptación atómica;
* tenant y rol salen de la invitación guardada, no del cliente;
* email normalizado;
* usuario activo y tenant correcto;
* invitación aceptada y usuario creados en una sola transacción;
* dos aceptaciones concurrentes producen un solo usuario;
* reenvío crea una intención/token seguro según la política, sin revivir uno inválido;
* el token completo no aparece en logs, auditoría o respuestas administrativas.

Si el token actual se almacena en claro y corregirlo requiere schema:

* haz una migración aditiva mínima;
* no uses `db push`;
* preserva compatibilidad de invitaciones existentes o documenta una invalidación controlada.

## Usuarios

Verifica:

* consultas con `id + tenantId`;
* creación impone tenant desde servidor;
* whitelist estricta de campos;
* roles permitidos;
* email normalizado y único conforme a la política real;
* bloqueo de SUPER_ADMIN como objetivo tenant;
* protecciones de auto-modificación y último ADMIN;
* desactivación en lugar de borrado si esa es la política existente;
* sesiones antiguas pierden permisos mediante la capa común.

## Bulk invite

Debe:

* aplicar límites razonables;
* validar cada fila;
* no aceptar tenant por fila;
* no aceptar SUPER_ADMIN;
* deduplicar emails normalizados;
* devolver resultados sanitizados;
* evitar que una fila inválida deje el lote en estado ambiguo;
* definir claramente atomicidad total o parcial.

No rediseñes el producto: conserva la política existente y hazla segura.

## Emails

Confirma:

* token solo en el enlace necesario;
* no se guarda en logs;
* nombre, conjunto y contenido dinámico escapados;
* error de envío no expone secretos;
* no se marca invitación como enviada exitosamente si el resultado fue conocido como fallo;
* no se reenvía automáticamente ante resultado ambiguo, si aplica.

## Pruebas mínimas

Añade pruebas específicas para:

1. ADMIN lista su tenant.
2. ADMIN no lista otro tenant.
3. CONSEJO y RESIDENTE bloqueados.
4. SUPER_ADMIN exige target.
5. Crear usuario no acepta tenant del cliente.
6. No se puede crear SUPER_ADMIN.
7. PATCH cross-tenant falla.
8. PATCH no cambia tenant.
9. Último ADMIN protegido.
10. Auto-desactivación protegida.
11. Email normalizado.
12. Invitación duplicada.
13. Token válido.
14. Token expirado.
15. Token cancelado.
16. Token ya usado.
17. Dos aceptaciones concurrentes.
18. Aceptación crea usuario e invalida token atómicamente.
19. Fallo creando usuario revierte aceptación.
20. Rol y tenant vienen de la invitación.
21. Reenvío seguro.
22. Cancelación tenant-scoped.
23. Bulk invite rechaza SUPER_ADMIN y tenant arbitrario.
24. Error inesperado genérico.
25. Token no aparece en logs/respuestas.
26. Camino autorizado funciona.

Usa pruebas puras cuando sea posible y PostgreSQL real solo para atomicidad, unique y concurrencia.

## Ejecución

Durante el trabajo, ejecuta solo pruebas de usuarios/invitaciones.

Al final:

```text
npx tsc --noEmit
npm run lint
```

Si cambiaste schema o lógica transaccional importante, ejecuta una sola vez la suite completa. Si no, basta con pruebas específicas.

## Cierre

Entrega:

1. Vulnerabilidades.
2. Correcciones.
3. Matriz de permisos.
4. Seguridad de tokens.
5. Atomicidad y concurrencia.
6. Usuarios y roles.
7. Bulk invite.
8. Emails y errores.
9. Archivos modificados.
10. Pruebas específicas.
11. Typecheck/lint.
12. Suite completa, solo si se ejecutó.
13. Riesgos restantes.
14. Estado:

* IMPLEMENTADO.
* IMPLEMENTADO CON RIESGOS.
* BLOQUEADO.

No hagas commit, push ni tags. No inicies otro módulo.
