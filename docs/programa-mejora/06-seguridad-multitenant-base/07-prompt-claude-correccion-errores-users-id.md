# FASE 3D — CORRECCIÓN ACOTADA DEL MANEJO DE ERRORES EN `/api/users/[id]`

## Documentación

Guarda este prompt en:

`docs/programa-mejora/06-seguridad-multitenant-base/07-prompt-claude-correccion-errores-users-id.md`

Guarda el informe final en:

`docs/programa-mejora/06-seguridad-multitenant-base/08-respuesta-claude-correccion-errores-users-id.md`

No modifiques documentos 01–06. No hagas commit, push ni tags.

---

Corrige únicamente R-1/F-1 y F-2 en:

`src/app/api/users/[id]/route.ts`

Objetivo:

1. No reflejar `error.message` inesperados de Prisma, conectividad o infraestructura.
2. Mapear `"Usuario no encontrado"` a:

   * HTTP 404
   * body estable y genérico.
3. Mantener errores de dominio conocidos con su status correcto.
4. Cualquier error inesperado debe devolver:

   * HTTP 500
   * mensaje genérico;
   * sin stack, constraint, query, conexión ni detalles internos.
5. Mantener indistinguibles:

   * usuario inexistente;
   * usuario de otro tenant;
   * SUPER_ADMIN no administrable desde tenant.

## Eficiencia obligatoria

* Revisa solo:

  * `src/app/api/users/[id]/route.ts`
  * adaptadores actuales de errores;
  * servicio `updateManagedUser`;
  * pruebas específicas de autorización/ruta.
* Si ves el error, corrígelo directamente.
* No audites otros módulos.
* No ejecutes suite completa.
* No uses PostgreSQL remoto.
* No ejecutes Prisma.
* Ejecuta solo pruebas específicas.
* Typecheck y lint una vez al final.
* No repitas una prueba verde.

## Implementación

Prefiere una función pura y pequeña para mapear errores de gestión de usuarios, reutilizable por PATCH y DELETE.

Debe distinguir únicamente errores de dominio conocidos, por ejemplo:

* `"Usuario no encontrado"` → 404.
* `"Rol invalido"` → 400.
* `"No puedes modificar tu propio usuario"` o equivalentes → status coherente con contrato actual.
* protección del último ADMIN → status coherente.
* cualquier otro error → 500 genérico.

No uses coincidencias amplias que puedan convertir errores Prisma en mensajes públicos.

No devuelvas el mensaje original en errores desconocidos.

## Pruebas obligatorias

Añade pruebas ligeras, sin servidor ni DB, para:

1. Usuario no encontrado → 404.
2. Cross-tenant usa el mismo resultado.
3. SUPER_ADMIN no administrable usa el mismo resultado.
4. Rol inválido → 400.
5. Error de dominio conocido conserva respuesta permitida.
6. Error Prisma simulado → 500 genérico.
7. Error de conexión simulado → 500 genérico.
8. El body no contiene:

   * nombre de constraint;
   * stack;
   * URL;
   * SQL;
   * mensaje original inesperado.
9. PATCH y DELETE usan el mismo mapper.

Puedes crear un archivo puro pequeño si facilita probarlo.

## Archivos permitidos

* `src/app/api/users/[id]/route.ts`
* un helper nuevo de errores dentro del mismo dominio o `src/lib/`
* una prueba específica nueva o existente
* documentos 07 y 08

No modificar:

* autorización core;
* schema;
* migraciones;
* billing;
* middleware;
* UI;
* paquetes;
* entorno;
* otros módulos.

## Ejecución

Ejecuta solo las pruebas específicas creadas/modificadas.

Después, una sola vez:

```text
npx tsc --noEmit
npm run lint
```

No ejecutes suite completa.

## Informe breve

Incluye:

1. Defecto corregido.
2. Mapper implementado.
3. Status finales.
4. Archivos modificados.
5. Pruebas y resultados.
6. Typecheck/lint.
7. Riesgos restantes.
8. Estado:

   * CORREGIDO.
   * CORREGIDO CON RIESGOS.
   * BLOQUEADO.

## Finalización

* Guarda el informe en el documento 08.
* No hagas commit.
* No hagas push.
* No crees tags.
* No inicies otro módulo.
* Detente después del informe.
