# FASE 5B — Revisión, corrección y cierre de usuarios e invitaciones

## 1. Defectos encontrados

Ninguno de severidad crítica, alta o media. La revisión adversarial del cambio completo (usuarios, invitaciones individuales, bulk, aceptación, reenvío, cancelación, onboarding, primer ADMIN, emails, servicios/políticas y pruebas) no encontró defecto explotable dentro del alcance. No se modificó código ni pruebas.

## 2. Correcciones

No aplican. No se cambió ningún archivo de código ni de pruebas.

## 3. Autorización y usuarios

- Todas las rutas de usuarios/invitaciones resuelven identidad con `resolveUserManagementAccess` → `requireAuthenticatedUser` (identidad de DB) + `managementTenantPolicy` + `requireTenantRole("ADMIN")` / `requireSuperAdminTenantTarget` (capa común de Fase 3).
- **ADMIN** queda atado a su tenant; un `tenantId` solicitado distinto → `RESOURCE_NOT_FOUND` (opaco). **SUPER_ADMIN** exige target explícito y validado en DB. **CONSEJO/RESIDENTE** → `FORBIDDEN` en `managementTenantPolicy`.
- `tenantId` del cliente solo actúa como target validado; nunca concede acceso. `userId`/`invitationId` cross-tenant son opacos (mismo 404 / "no encontrada").
- `updateManagedUser`: rol limitado a ADMIN/CONSEJO/RESIDENTE (SUPER_ADMIN objetivo → "Usuario no encontrado" indistinguible), `FOR UPDATE` sobre el objetivo y sobre los ADMIN activos, escritura `updateMany` con `id + tenantId` (count = 1), ubicación solo para RESIDENTE, auto-desactivación/auto-degradación y último ADMIN protegidos dentro de la transacción, errores por lista blanca (`mapUserManagementError`).
- Onboarding usa identidad de DB, no confía en tenant del cliente, es atómico (tenant + usuario + auditoría), no pisa `onboardingCompletedAt` previo y usa whitelist de campos.

## 4. Tokens y aceptación

- Token de 32 bytes (`crypto.randomBytes`, base64url); solo el **SHA-256** se persiste en `tokenHash`; el token completo aparece únicamente en el enlace del correo. Entrada acotada a 20–256 chars.
- **Ninguna respuesta administrativa devuelve `token`, `invitationUrl` ni `tokenHash`** — las rutas construyen un DTO `{id, email, role, status, expiresAt}` (+ `{sent}`), verificado además por la prueba 25 (chequeo estático del fuente de las rutas).
- Orden de aceptación: token → hash → `SELECT … FOR UPDATE` → relectura por `tokenHash` → validación de estado/expiración (precedencia USED > CANCELLED > EXPIRED) → CAS `updateMany {id, tokenHash, PENDING, expiresAt>now}` → crea/actualiza usuario → auditoría → commit. **Sin llamada de email dentro de la transacción.**
- Tenant y rol salen exclusivamente de la invitación. Fallo creando usuario → rollback (invitación queda PENDING; no hay ACCEPTED sin usuario ni usuario parcial). Un reenvío concurrente rota el `tokenHash`; el token viejo resuelve a `null` y da `INVALID_TOKEN` (no compite con el reenvío). Cancelada/usada/expirada no se aceptan.

## 5. Concurrencia

- Creación: `pg_advisory_xact_lock(hashtextextended(${lockKey},0))` con `$executeRaw` (retorno void) dentro de la transacción; clave estable `invitation:<tenantId>:<emailNormalizado>` parametrizada (sin inyección). Dos creaciones simultáneas → una sola invitación PENDING (prueba 12). Todas las rutas de creación pasan por `createInvitation`.
- Reenvío/cancelación/aceptación: bloqueo real de fila con `SELECT … FOR UPDATE` (`$queryRaw`, devuelve filas) + CAS por `tokenHash`/estado. Dos aceptaciones concurrentes → un usuario, un ACCEPTED (prueba 17).
- Correcta separación `$executeRaw` (advisory lock, void) vs `$queryRaw` (SELECT … FOR UPDATE, filas): confirmada la corrección final mencionada por Codex.

## 6. Bulk y onboarding

- Bulk: `.xlsx`, ≤2 MB, primera columna, encabezado reconocido, normalización + deduplicación, máximo 100, tenant por fila ignorado, SUPER_ADMIN no seleccionable, **procesamiento secuencial** (sin 100 llamadas concurrentes), atomicidad parcial explícita, respuesta diferencia `created` / `emailPending` / `failed[]` con mensajes por lista blanca (sin token ni detalle de infraestructura).
- Onboarding: atómico, identidad de DB, no duplica onboarding completado, whitelist de campos; la invitación opcional del primer residente es best-effort posterior con error mapeado.

## 7. Emails

- HTML dinámico escapado por los llamadores (`escapeInvitationHtml`); asunto sin CRLF (`replace(/[\r\n]+/g," ")`).
- Errores de Resend sanitizados: solo timeout, `Resend rechazo el correo (HTTP NNN)` (regex-validado, solo código) o mensaje genérico; **no se guarda el body del proveedor ni el token** en `EmailLog`.
- `publicInvitationEmailResult` expone únicamente `{ sent }`; nunca `sent:true` si el envío falló; la UI no muestra "reenviada" cuando quedó pendiente. Una invitación con email fallido persiste PENDING y es recuperable por reenvío manual (que rota el token). Los cambios en `email.ts` no alteran el camino de éxito de otros correos.

## 8. Pruebas

- `tests/unit/user-invitation-security.test.ts` (puras): política de tenant, SUPER_ADMIN target, SUPER_ADMIN no invitable, normalización Unicode/NFKC, bulk dedupe/validación, error genérico, ausencia de token/hash/URL en el fuente de las rutas, límites de credenciales/ubicación, camino autorizado.
- `tests/user-invitation-atomicity.test.ts` (PostgreSQL): último ADMIN, auto-desactivación, dos creaciones concurrentes, token válido/expirado/cancelado/usado, dos aceptaciones concurrentes, atomicidad usuario+token, rollback al fallar usuario, rol/tenant desde invitación, reenvío que rota e invalida el token viejo y no revive cancelada, cancelación cross-tenant, camino autorizado.
- Cobertura de los 20 casos obligatorios: completa (mapeo 1↔3, 2↔4, 3↔11, 4↔12, 5↔13, 6↔14, 7↔15, 8↔16, 9↔21, 10↔12, 11↔17, 12↔19, 13↔20, 14↔21, 15↔22, 16↔9, 17↔23, 18↔24, 19↔25, 20↔26).
- **Evidencia de verde:** ambos archivos están en disco y formaron parte de la corrida completa `416/416` (0 fallos) ejecutada contra el PostgreSQL real de pruebas en la sesión anterior; usan la versión final con `$executeRaw`. No se repitieron pruebas (política de eficiencia; sin cambios de código).

## 9. Riesgos

| Riesgo | Bloquea commit | Bloquea producción | Decisión de producto |
| --- | --- | --- | --- |
| Sin índice parcial PENDING (unicidad depende de que toda creación pase por `createInvitation` + advisory lock) | No | No (endurecible con índice parcial) | No |
| PostgreSQL/Resend sin transacción distribuida (invitación puede persistir con email pendiente; se informa `sent:false`, recuperable por reenvío) | No | No | No |
| Cancelación inmediatamente tras reenvío (el enlace enviado queda inválido; **no** concede acceso) | No | No | No |
| Tenant sin primer ADMIN si la invitación falla (error controlado; **recuperable**: el SUPER_ADMIN puede invitar vía `/api/invitations?tenantId=X`) | No | No (recuperable) | No |
| Email globalmente único (una dirección no puede pertenecer a dos conjuntos) | No | No | **Sí — confirmar como decisión de producto** |
| Suite completa no re-ejecutada tras la última corrección | No | No (cubierto por la corrida 416/416 que incluyó estos archivos) | No |

Ningún riesgo bloquea el commit ni la producción a nivel de código; el único punto abierto es la confirmación de negocio sobre el email globalmente único.

## 10. Resultado

`APROBADO Y COMMIT CREADO`.

La base de usuarios e invitaciones es sólida: autorización server-side con capa común, ADMIN por tenant, SUPER_ADMIN con target validado, CONSEJO/RESIDENTE bloqueados, tokens hasheados sin fuga en respuestas/logs/auditoría, aceptación atómica con CAS y rollback, concurrencia serializada por advisory lock + `FOR UPDATE`, bulk seguro secuencial, onboarding atómico, correos escapados y con errores sanitizados. No se modificó código ni pruebas; el commit local se crea en esta misma intervención. El hash se informa en la respuesta de la sesión.
