# FASE 5B — REVISIÓN, CORRECCIÓN Y CIERRE DE USUARIOS E INVITACIONES

Guarda este prompt en:

`docs/programa-mejora/08-seguridad-usuarios-invitaciones/03-prompt-claude-revision-cierre.md`

Guarda el informe en:

`docs/programa-mejora/08-seguridad-usuarios-invitaciones/04-respuesta-claude-revision-cierre.md`

## Regla adaptativa

* Revisa adversarialmente el cambio completo.
* Corrige directamente cualquier defecto crítico, alto o medio.
* Si modificas código o pruebas: no hagas commit.
* Si no modificas código ni pruebas y apruebas: crea el commit en esta misma intervención.
* No revises otros módulos.

## Eficiencia máxima

* No revises HEAD, rama, historial o staged al comenzar.
* No ejecutes suite completa.
* No repitas pruebas ya verdes sin una razón concreta.
* Revisa primero el diff y las pruebas existentes.
* Si no modificas código, no repitas typecheck ni lint.
* Si modificas código:

  * ejecuta solo pruebas de usuarios/invitaciones afectadas;
  * typecheck y lint una sola vez.
* No ejecutes Prisma si schema no cambió.
* No uses informes repetitivos.

## Alcance

Revisa:

* rutas de usuarios;
* invitaciones individuales;
* bulk invite;
* aceptación;
* reenvío;
* cancelación;
* onboarding;
* primer ADMIN;
* emails relacionados;
* servicios y políticas añadidas;
* pruebas puras y PostgreSQL focalizadas.

Archivos principales:

```text
src/app/admin/invitaciones/page.tsx
src/app/api/invitations/route.ts
src/app/api/invitations/accept/route.ts
src/app/api/invitations/bulk/route.ts
src/app/api/invitations/[id]/resend/route.ts
src/app/api/invitations/[id]/cancel/route.ts
src/app/api/users/route.ts
src/app/api/users/[id]/route.ts
src/app/api/onboarding/route.ts
src/app/api/platform/super-admin/route.ts
src/domains/organizations/invitation.service.ts
src/domains/organizations/invitation-security.ts
src/domains/organizations/user-management-access.ts
src/domains/organizations/user-management-policy.ts
src/domains/organizations/user-management.service.ts
src/domains/organizations/user-management-error.ts
src/domains/platform/tenant-admin.service.ts
src/lib/email.ts
tests/unit/user-invitation-security.test.ts
tests/user-invitation-atomicity.test.ts
```

Lee los documentos 01 y 02 de esta fase.

## 1. Autorización

Confirma:

* ADMIN solo actúa en su tenant actual.
* SUPER_ADMIN exige target explícito y validado.
* CONSEJO y RESIDENTE quedan bloqueados.
* `tenantId` del cliente nunca concede acceso.
* `userId` e `invitationId` cross-tenant son opacos.
* usuarios e invitaciones se consultan y mutan con tenant efectivo;
* SUPER_ADMIN no puede crearse o promocionarse desde flujos tenant;
* las rutas usan la capa común de autorización.

## 2. Usuarios

Verifica:

* creación impone tenant desde servidor;
* PATCH no cambia tenant;
* roles permitidos solo ADMIN, CONSEJO y RESIDENTE;
* ubicación solo para RESIDENTE;
* mutaciones finales incluyen `id + tenantId`;
* auto-desactivación y auto-degradación protegidas;
* último ADMIN activo protegido dentro de transacción;
* un SUPER_ADMIN nunca puede modificarse desde ruta tenant;
* errores inesperados siguen siendo genéricos.

## 3. Normalización de email

Revisa la implementación real de:

* trim;
* NFKC;
* lowercase;
* dominio ASCII;
* longitud;
* formato;
* caracteres Unicode ambiguos.

Confirma que la misma normalización se usa en:

* creación;
* duplicados;
* aceptación;
* bulk;
* búsqueda de usuario existente;
* locks;
* comparación de email.

No deben existir dos normalizadores contradictorios.

## 4. Token

Confirma:

* 32 bytes aleatorios;
* hash SHA-256 almacenado;
* token completo solo en el enlace enviado;
* token/hash no aparecen en respuestas administrativas, logs, auditoría ni EmailLog;
* expiración obligatoria;
* cancelada y aceptada son terminales;
* reenvío rota token y expiración;
* token antiguo deja de funcionar;
* longitud del token de entrada está limitada;
* comparación usa hash estable.

Busca cualquier referencia que devuelva `invitationUrl`, `token`, `tokenHash` o URL privada.

## 5. Creación concurrente

Revisa el advisory lock:

* usa `$executeRaw`, no `$queryRaw`;
* clave de lock estable por `tenantId + email normalizado`;
* no permite SQL injection;
* se ejecuta dentro de la transacción;
* todas las rutas de creación pasan por el mismo servicio;
* dos creaciones simultáneas producen una única invitación pendiente;
* no existe otro camino activo que evite el lock.

Evalúa el riesgo de depender solo del servicio sin índice parcial.

## 6. Aceptación

Este es el punto más crítico.

Reconstruye el orden:

1. recibe token;
2. calcula hash;
3. bloquea/relee invitación;
4. valida estado y expiración;
5. reclama mediante CAS;
6. crea usuario;
7. actualiza invitación a ACCEPTED;
8. registra auditoría;
9. commit.

Confirma:

* tenant y rol salen exclusivamente de la invitación;
* dos aceptaciones concurrentes crean un usuario;
* fallo creando usuario revierte aceptación;
* una invitación vencida devuelve precedencia correcta;
* cancelada, usada y expirada no se aceptan;
* CAS compara el `tokenHash` vigente;
* token antiguo no compite con reenvío;
* email existente se maneja según política global;
* no queda usuario parcial;
* no queda invitación ACCEPTED sin usuario.

No debe haber llamada de email dentro de la transacción DB.

## 7. Reenvío y cancelación

Confirma que usan bloqueo real de fila y que:

* reenvío no revive ACCEPTED o CANCELLED;
* rota token y expiración;
* un token viejo queda inválido;
* cancelación cross-tenant falla;
* cancelación concurrente con aceptación tiene resultado seguro;
* reenvío concurrente con aceptación no concede dos accesos;
* email fallido se reporta como `sent:false`;
* resultado ambiguo no provoca reintento automático;
* token no aparece en respuesta administrativa.

## 8. Bulk invite

Confirma:

* límite 100;
* `.xlsx` y 2 MB;
* encabezado válido;
* primera columna correctamente interpretada;
* normalización y deduplicación;
* tenant por fila ignorado/rechazado;
* SUPER_ADMIN no permitido;
* atomicidad parcial explícita;
* una fila inválida no corrompe otras;
* respuesta diferencia:

  * creada;
  * email pendiente;
  * fallida;
* no filtra emails o errores más allá de lo necesario para el ADMIN autorizado;
* no produce 100 llamadas concurrentes sin límite razonable.

## 9. Onboarding

Confirma:

* identidad actual de DB;
* usuario y tenant correctos;
* no confía en tenant del cliente;
* actualizaciones de usuario, tenant y auditoría son atómicas;
* no permite onboarding de otro tenant;
* sesión antigua no conserva permisos;
* no duplica o pisa onboarding completado;
* campos permitidos usan whitelist.

## 10. Primer ADMIN y creación de tenant

Revisa la ruta SUPER_ADMIN:

* target y autorización correctos;
* tenant creado no recibe ADMIN incorrecto;
* si falla la invitación, el error es controlado;
* determina si puede quedar un tenant sin primer ADMIN;
* clasifica si esto es aceptable, requiere compensación o debe corregirse.

No rediseñes el onboarding comercial salvo defecto de seguridad o consistencia medio/alto.

## 11. Emails y Resend

Confirma:

* HTML dinámico escapado;
* subject sin CRLF;
* errores del proveedor sanitizados;
* no se guarda body completo;
* no se guarda token;
* no se presenta `sent:true` si el envío falló;
* no se presenta “reenviada” si quedó pendiente;
* una invitación persistida con email fallido sigue siendo recuperable mediante reenvío manual.

Verifica que cambios en `src/lib/email.ts` no rompan emails ajenos.

## 12. Pruebas

Revisa:

* `tests/unit/user-invitation-security.test.ts`
* `tests/user-invitation-atomicity.test.ts`

Confirma cobertura real de:

1. permisos por rol;
2. SUPER_ADMIN target;
3. normalización;
4. duplicados;
5. token válido;
6. expirado;
7. cancelado;
8. usado;
9. token anterior después de reenvío;
10. dos creaciones concurrentes;
11. dos aceptaciones concurrentes;
12. rollback al fallar usuario;
13. rol y tenant desde invitación;
14. reenvío;
15. cancelación cross-tenant;
16. último ADMIN;
17. bulk seguro;
18. errores sanitizados;
19. token ausente de respuestas;
20. camino autorizado.

Atención: la suite completa falló inicialmente por `$queryRaw`; confirma que la versión final usa `$executeRaw` y que las pruebas focalizadas cubren el código corregido.

Si detectas una garantía no probada pero el código parece correcto, añade únicamente la prueba faltante y no hagas commit.

## 13. Riesgos

Clasifica:

* ausencia de índice parcial PENDING;
* PostgreSQL/Resend sin transacción distribuida;
* cancelación inmediatamente después de reenvío;
* tenant sin primer ADMIN si falla invitación;
* email globalmente único;
* suite completa no repetida tras la última corrección.

Indica:

* bloquea commit;
* bloquea producción;
* decisión de producto pendiente.

## 14. Commit automático

Solo si:

* no modificas código ni pruebas;
* no queda defecto crítico, alto o medio;
* la corrección final de `$executeRaw` y precedencia está demostrada;
* los archivos focalizados están verdes según evidencia;
* no existen cambios ajenos.

Entonces:

1. Ejecuta una sola vez:

```text
git diff --name-only
```

2. Comprueba que solo aparecen archivos de esta fase.
3. Añade explícitamente los archivos listados en el informe de Codex y:

```text
docs/programa-mejora/08-seguridad-usuarios-invitaciones/
```

4. Revisa una vez el staged diff por secretos y tokens reales.
5. Crea:

```text
git commit -m "feat(auth): secure users and invitation lifecycle"
```

No ejecutes pruebas de nuevo.

## Informe breve

Incluye:

1. Defectos encontrados.
2. Correcciones, si hubo.
3. Autorización y usuarios.
4. Tokens y aceptación.
5. Concurrencia.
6. Bulk y onboarding.
7. Emails.
8. Pruebas.
9. Riesgos.
10. Resultado:

* `APROBADO Y COMMIT CREADO`.
* `CORREGIDO; REQUIERE REVISIÓN FINAL`.
* `BLOQUEADO`.

Si creas commit, informa el hash solo en la respuesta de sesión.
