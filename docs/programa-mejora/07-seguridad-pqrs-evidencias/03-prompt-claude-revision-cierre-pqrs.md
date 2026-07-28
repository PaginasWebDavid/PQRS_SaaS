# FASE 4B — REVISIÓN, CORRECCIÓN Y CIERRE DE SEGURIDAD PQRS

Guarda este prompt en:

`docs/programa-mejora/07-seguridad-pqrs-evidencias/03-prompt-claude-revision-cierre-pqrs.md`

Guarda el informe en:

`docs/programa-mejora/07-seguridad-pqrs-evidencias/04-respuesta-claude-revision-cierre-pqrs.md`

Revisa adversarialmente la implementación de Codex para PQRS, fotos, evidencias y Storage.

## Regla de cierre

* Si no modificas código: aprueba y crea el commit local en esta misma intervención.
* Si corriges código o pruebas: no hagas commit; informa exactamente qué cambiaste para una revisión final corta de Codex.
* Corrige directamente cualquier defecto crítico, alto o medio.
* No abras otra fase.

## Eficiencia máxima

* No revises rama, HEAD ni historial.
* No ejecutes suite completa.
* No ejecutes Prisma si schema no cambia.
* No repitas pruebas, typecheck o lint que ya están verdes si no modificas código.
* Si modificas código:

  * ejecuta solo `tests/unit/pqrs-security.test.ts`;
  * después typecheck y lint una vez.
* No hagas análisis extensos antes de corregir.
* No revises billing, reservas, pagos u otros módulos.

## Archivos principales

Revisa:

* `src/app/api/pqrs/route.ts`
* `src/app/api/pqrs/[id]/route.ts`
* `src/app/api/pqrs/[id]/evidencia/route.ts`
* `src/app/api/pqrs/[id]/fotos/[fotoId]/route.ts`
* `src/app/api/upload/route.ts`
* `src/domains/pqrs/pqrs-permissions.ts`
* `src/domains/pqrs/pqrs-security.ts`
* `src/lib/storage.ts`
* `tests/unit/pqrs-security.test.ts`
* documentos 01 y 02 de esta fase.

Consulta otros archivos únicamente para comprobar consumidores de `/api/upload` y `storage.ts`.

## Verificaciones críticas

### Autorización

Confirma que todas las operaciones usan la identidad actual de servidor y la capa común comprometida.

Verifica:

* ADMIN: únicamente su tenant.
* CONSEJO: únicamente lectura permitida.
* RESIDENTE: únicamente sus PQRS.
* SUPER_ADMIN: confirma que negar todo acceso es realmente la política existente; no inventes esta restricción si antes tenía supervisión explícita.
* Tenant enviado por cliente nunca concede acceso.
* ID inexistente, cross-tenant y cross-owner producen el mismo 404.
* Fotos y evidencias heredan autorización del PQRS padre.

### Consultas y mutaciones

Busca dentro del alcance:

```text
findUnique({ where: { id } })
update({ where: { id } })
delete({ where: { id } })
```

Confirma que ninguna operación tenant-scoped depende solo del ID.

Verifica:

* creación impone tenant, creador y estado desde servidor;
* RESIDENTE no puede cambiar propietario, tenant, estado o campos administrativos;
* CONSEJO no puede escribir;
* ADMIN no puede actuar cross-tenant;
* estado y notas usan whitelist por rol;
* búsquedas y mutaciones secundarias incluyen PQRS padre y tenant.

### Upload genérico

Codex cambió `/api/upload` para responder `410`.

Antes de aprobar:

1. Busca todos sus consumidores.
2. Confirma si lo usan avatar, documentos, comprobantes u otros módulos.
3. Si es compartido, no aceptes romper esos flujos.
4. Limita o reemplaza únicamente el uso inseguro de PQRS.
5. Si no tiene consumidores válidos, el `410` es aceptable.

Este punto puede bloquear el commit.

### `storage.ts`

Comprueba que sus cambios no rompen otros módulos.

Verifica:

* bucket/path no vienen libremente del cliente;
* separación por tenant;
* nombres seguros;
* traversal bloqueado;
* MIME, firma, extensión y tamaño coherentes;
* bucket privado o URL firmada;
* no se crean URLs públicas;
* duración razonable de URLs firmadas;
* no se expone service-role key;
* las nuevas restricciones no invalidan usos legítimos ajenos.

### DB y Storage

Confirma que:

* no hay transacción DB abierta durante red;
* fallo de upload no crea referencia DB;
* fallo DB después de upload intenta compensar;
* reemplazo conserva el archivo anterior hasta confirmar la nueva referencia;
* limpieza fallida no expone detalles al cliente;
* eliminación no permite borrar paths arbitrarios.

### Emails y errores

Confirma:

* contenido dinámico escapado antes de HTML;
* errores inesperados devuelven respuesta genérica;
* no se exponen Prisma, SQL, paths, bucket, host o secretos;
* auditoría no guarda descripciones, archivos o PII innecesaria.

## Pruebas

Comprueba que las 22 pruebas ejercen la lógica real.

Deben cubrir:

* roles y propiedad;
* cross-tenant;
* tenant falsificado;
* propietario falsificado;
* PATCH protegido;
* notas/estado;
* foto/evidencia padre;
* descarga;
* eliminación;
* traversal;
* MIME;
* firma;
* extensión;
* tamaño;
* nombre;
* error genérico;
* camino autorizado.

Añade pruebas solo si falta una garantía o encuentras un defecto.

## Riesgos de producción

Clasifica:

* bucket privado no verificado;
* archivos históricos con URL/base64;
* ausencia de antivirus;
* falta de rate limiting;
* compensación best-effort;
* falta de integración con Supabase real.

Indica por separado:

* bloquea commit local;
* bloquea producción.

## Commit automático

Solo si no modificaste código ni pruebas y no queda defecto crítico, alto o medio:

1. Ejecuta una única vez:

```text
git diff --name-only
```

2. Confirma que solo aparecen archivos de esta fase.
3. Añade explícitamente:

```text
git add -- src/app/api/pqrs/route.ts
git add -- "src/app/api/pqrs/[id]/route.ts"
git add -- "src/app/api/pqrs/[id]/evidencia/route.ts"
git add -- "src/app/api/pqrs/[id]/fotos/[fotoId]/route.ts"
git add -- src/app/api/upload/route.ts
git add -- src/domains/pqrs/pqrs-permissions.ts
git add -- src/domains/pqrs/pqrs-security.ts
git add -- src/lib/storage.ts
git add -- tests/unit/pqrs-security.test.ts
git add -- docs/programa-mejora/07-seguridad-pqrs-evidencias
```

4. Revisa una vez el staged diff para secretos o archivos ajenos.
5. Crea:

```text
git commit -m "feat(pqrs): secure tenant data and evidence access"
```

Commit local únicamente.

## Informe breve

Incluye:

1. Defectos encontrados.
2. Correcciones, si hubo.
3. Autorización e IDOR.
4. Upload genérico y consumidores.
5. Impacto de `storage.ts`.
6. Archivos y compensación.
7. Pruebas ejecutadas, solo si aplicó.
8. Riesgos que bloquean producción.
9. Resultado:

   * `APROBADO Y COMMIT CREADO`.
   * `CORREGIDO; REQUIERE REVISIÓN FINAL`.
   * `BLOQUEADO`.

Si creas commit, informa el hash solo en la respuesta de la sesión, no modifiques el informe después.
