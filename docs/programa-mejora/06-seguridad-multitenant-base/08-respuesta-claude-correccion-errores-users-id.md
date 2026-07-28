# FASE 3D — Corrección acotada del manejo de errores en `/api/users/[id]`

## 1. Defecto corregido

- **R-1 / F-1 (MEDIA):** PATCH y DELETE de `/api/users/[id]` reflejaban `error.message` directamente al cliente. Ante una excepción inesperada (Prisma, constraint, conectividad, infraestructura) esto filtraba mensajes internos (nombres de constraint, fragmentos SQL, rutas de archivo, host/puerto de la base). Ahora un error inesperado devuelve **HTTP 500 con un mensaje genérico** y cero detalle interno.
- **F-2 (BAJA):** DELETE respondía **400** para `"Usuario no encontrado"` (inexistente / cross-tenant / SUPER_ADMIN no administrable), incumpliendo el contrato 404. Ahora responde **404**, igual que PATCH, y sigue siendo indistinguible entre los tres casos.

## 2. Mapper implementado

Nuevo archivo puro `src/domains/organizations/user-management-error.ts`:

```ts
mapUserManagementError(error: unknown): { status: number; message: string }
```

- Mantiene una **lista blanca exacta** (`Map<string, number>`) de los mensajes de dominio que lanza `updateManagedUser`.
- Coincidencia **exacta** (nunca substring/prefijo): un mensaje de Prisma que contuviera por casualidad texto de dominio no puede promoverse a respuesta pública.
- Cualquier error fuera de la lista (incluido un valor no-`Error`) colapsa a `{ status: 500, message: "No se pudo procesar la solicitud" }` — sin stack, constraint, SQL, URL ni conexión.
- Reutilizado por PATCH y DELETE (una sola fuente de verdad).

No se modificó `updateManagedUser` (los mensajes de dominio ya eran correctos); solo se consumen desde el mapper.

## 3. Status finales

| Situación | Mensaje del cliente | Status |
| --- | --- | --- |
| `Usuario no encontrado` (inexistente / cross-tenant / SUPER_ADMIN no administrable) | `Usuario no encontrado` | **404** |
| `Rol invalido` | `Rol invalido` | 400 |
| `Bloque invalido` / `Apartamento invalido` | idéntico | 400 |
| `No puedes cambiar tu propio rol ni desactivar tu cuenta` | idéntico | 400 |
| `El conjunto debe conservar al menos un administrador activo` | idéntico | 400 |
| Error inesperado (Prisma / conexión / infra / bug) | `No se pudo procesar la solicitud` | **500** |

Indistinguibilidad preservada: los tres orígenes de `"Usuario no encontrado"` producen exactamente el mismo body y status (404), sin revelar existencia en otro tenant ni el carácter de SUPER_ADMIN.

## 4. Archivos modificados

- **Nuevo:** `src/domains/organizations/user-management-error.ts` — mapper puro.
- **Modificado:** `src/app/api/users/[id]/route.ts` — import del mapper; PATCH y DELETE usan `mapUserManagementError` en su `catch` (se eliminó el passthrough de `error.message` y el `status: 400` fijo de DELETE).
- **Nuevo:** `tests/unit/user-management-error.test.ts` — pruebas puras.
- Documentos 07 (este prompt) y 08 (este informe).

No se tocó autorización core, `updateManagedUser`, schema, migraciones, billing, middleware, UI, paquetes ni entorno. La ruta GET no cambia (su 404 de "Usuario no encontrado" ya era directo y correcto, y no invoca `updateManagedUser`).

## 5. Pruebas y resultados

`node --import tsx --test tests/unit/user-management-error.test.ts` → **9/9 PASS**, una ejecución, sin skip/fail/todo. Puras, sin servidor ni base de datos:

1. `Usuario no encontrado` → 404.
2. Cross-tenant → mismo resultado que inexistente.
3. SUPER_ADMIN no administrable → mismo resultado.
4. `Rol invalido` → 400.
5. Errores de dominio conocidos (último ADMIN, Bloque/Apartamento, auto-modificación) conservan su respuesta permitida.
6. Error de Prisma simulado (constraint + ruta de archivo) → 500 genérico, sin filtración.
7. Error de conexión simulado (host:puerto + URL) → 500 genérico, sin filtración.
8. El body de un error inesperado no contiene constraint / stack / URL / SQL / mensaje original; un valor no-`Error` tampoco filtra.
9. PATCH y DELETE usan el mismo mapper (verificación estática sobre el fuente de la ruta: ≥2 usos del mapper y ausencia de passthrough directo de `error.message`).

`authorization.test.ts` no se re-ejecutó (verde y sin cambios relacionados, por política de eficiencia).

## 6. Typecheck / lint

- `npx tsc --noEmit` → PASS (una ejecución).
- `npm run lint` → PASS, cero warnings/errores (una ejecución).
- Suite completa: **no** ejecutada. Prisma: **no** ejecutado. PostgreSQL remoto: **no** usado.

## 7. Riesgos restantes

- **R-4 (BAJA / proceso):** el comportamiento HTTP real de la ruta (404/400/500 sobre la transacción Prisma real) sigue validado por el mapper puro + verificación estática del wiring, no por una prueba de integración con servidor/DB. Recomendable una prueba de integración ligera de la ruta cuando exista base de pruebas separada, antes de producción. Sin cambio respecto a la fase anterior.
- **R-2 (BAJA):** doble lectura de DB por request migrado (callback JWT + revalidación). Aceptable; fuera de alcance.
- **R-3 (INFORMATIVA):** el middleware Edge sigue usando claims del JWT solo para navegación; la frontera real son las APIs.
- **Nota:** un body JSON malformado en PATCH (`req.json()` fuera del `try`) sigue produciendo el 500 genérico de Next, sin filtrar dominio; no se alteró para mantener el cambio mínimo.
- Los módulos no migrados (§ informe FASE 3B/3C) siguen pendientes; no afectan esta corrección.

## 8. Estado

**CORREGIDO.**

R-1/F-1 cerrado (sin passthrough de errores inesperados; 500 genérico) y F-2 cerrado (DELETE devuelve 404 para "Usuario no encontrado", indistinguible). Mapper puro compartido por PATCH y DELETE, con lista blanca exacta que impide convertir errores de Prisma en mensajes públicos. Pruebas 9/9, typecheck y lint verdes. No se modificó el core ni se amplió ningún módulo. Prompt guardado en el documento 07 y este informe en el 08. No se hizo commit, push ni tags; no se inició otro módulo.
