# FASE 4A — AUDITORÍA Y CORRECCIÓN DE SEGURIDAD EN PQRS Y EVIDENCIAS

## Documentación

Guarda este prompt completo en:

`docs/programa-mejora/07-seguridad-pqrs-evidencias/01-prompt-codex-auditoria-correccion-pqrs.md`

Guarda el informe final en:

`docs/programa-mejora/07-seguridad-pqrs-evidencias/02-respuesta-codex-auditoria-correccion-pqrs.md`

No hagas commit, push ni tags.

---

Audita y corrige directamente la seguridad del módulo:

* PQRS.
* Detalle de PQRS.
* Comentarios y respuestas.
* Cambios de estado.
* Evidencias.
* Fotos.
* Archivos adjuntos.
* Upload, descarga y eliminación de archivos relacionados.

Usa la base común de autorización ya comprometida en:

`feat(auth): centralize tenant authorization`

## Eficiencia obligatoria

* Inspecciona únicamente archivos relacionados con PQRS y evidencias.
* No reabras billing, auth base ni módulos distintos.
* Si encuentras un defecto dentro del alcance, corrígelo directamente.
* No prepares análisis extensos antes de corregir.
* Ejecuta solo pruebas específicas durante el trabajo.
* No repitas pruebas verdes sin cambios relacionados.
* Typecheck y lint una sola vez al final.
* No ejecutes suite completa.
* No uses PostgreSQL remoto salvo que una garantía no pueda probarse de forma pura.
* No ejecutes Prisma si schema no cambia.
* No hagas build ni levantes servidor.
* Informe final breve y basado en evidencia.

# 1. Git

Ejecuta:

```text
git status --short
git log -3 --oneline
git diff --check
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD es el commit de autorización multi-tenant;
* working tree e índice limpios;
* no quedan cambios de fases anteriores;
* entorno, paquetes, schema y migraciones intactos.

Si aparecen cambios inesperados, no los modifiques y marca `BLOQUEADO`.

# 2. Localización

Busca únicamente referencias relacionadas con:

```text
pqrs
Pqrs
PQR
evidence
evidencia
attachment
archivo
photo
foto
upload
download
storage
signedUrl
bucket
comment
status
tenantId
resident
```

Inspecciona:

* rutas API y server actions;
* servicios y consultas Prisma;
* validadores;
* helpers de archivos;
* Supabase Storage;
* generación de URLs;
* componentes solo cuando envíen datos relevantes al backend;
* pruebas existentes.

No audites otros módulos.

# 3. Matriz real de permisos

Determina la política existente sin inventar reglas nuevas.

Como mínimo, verifica:

## SUPER_ADMIN

* Solo accede mediante un tenant objetivo explícito y validado.
* No usa un tenant ambiguo de la sesión.
* No obtiene acceso automático a archivos privados sin pasar por la política definida.

## ADMIN

* Puede operar únicamente dentro de su tenant.
* Puede leer, responder y cambiar estados según la política actual.
* No puede acceder a PQRS de otro conjunto mediante un ID conocido.

## CONSEJO

* Conserva exactamente los permisos actuales.
* No recibe permisos administrativos adicionales accidentalmente.
* Las operaciones de escritura deben estar explícitamente autorizadas.

## RESIDENTE

* Puede crear PQRS únicamente dentro de su tenant.
* Solo puede leer los PQRS propios, salvo regla explícita distinta.
* No puede cambiar propietario, tenant, estado administrativo ni campos protegidos.
* No puede acceder a evidencias de otro residente usando un ID o una URL.

Documenta la matriz final en forma compacta.

# 4. Garantías obligatorias

Corrige para garantizar:

1. Todas las operaciones revalidan identidad mediante la base común.
2. `tenantId` del cliente nunca concede acceso.
3. Todo recurso se consulta con tenant autorizado.
4. Un residente además se restringe por propietario cuando corresponda.
5. Ausente y cross-tenant devuelven el mismo resultado.
6. Un ID conocido de otro tenant no permite GET, PATCH, DELETE ni descarga.
7. Un ID de evidencia no permite saltarse la autorización del PQRS padre.
8. Los campos protegidos se filtran mediante whitelist.
9. Cambios de estado usan roles permitidos explícitos.
10. Comentarios/respuestas respetan tenant, rol y propiedad.
11. El AuditLog registra acciones sensibles sin guardar contenido o PII innecesaria.
12. Ninguna respuesta devuelve stack, errores Prisma, rutas internas o secretos.

# 5. Creación y actualización

Revisa especialmente:

* creación de PQRS;
* categoría;
* descripción;
* apartamento/unidad;
* usuario creador;
* tenant;
* estado inicial;
* asignación;
* prioridad;
* fechas;
* cierre y reapertura.

El servidor debe imponer:

* `tenantId`;
* `createdById`;
* estado inicial;
* campos administrativos;
* timestamps.

El cliente no puede decidir identidad, tenant o propietario.

PATCH debe usar una whitelist diferente según rol.

# 6. IDOR

Busca consultas como:

```text
where: { id }
findUnique({ where: { id } })
update({ where: { id } })
delete({ where: { id } })
```

Cuando el recurso sea tenant-scoped, reemplázalas por un patrón seguro:

```text
id + authorizedTenantId
```

Para RESIDENTE añade propiedad cuando corresponda.

No reveles si el recurso existe en otro tenant.

Corrige también relaciones indirectas:

* comentario → PQRS;
* evidencia → PQRS;
* archivo → evidencia/PQRS;
* notificación → PQRS.

# 7. Evidencias y archivos

Verifica:

* autorización antes del upload;
* autorización antes de generar URL de descarga;
* autorización antes de eliminar;
* bucket privado;
* URLs firmadas con expiración razonable;
* path derivado en servidor;
* path que incluya separación por tenant;
* nombre de archivo generado o sanitizado;
* extensión y MIME permitidos;
* tamaño máximo;
* prevención de `../`, rutas absolutas y claves arbitrarias;
* no confiar en bucket/path enviados por cliente;
* no devolver service-role key;
* cleanup si DB y Storage quedan parcialmente desincronizados;
* no sobrescribir archivos de otro tenant.

No implementes antivirus ni infraestructura externa en esta fase; documenta como riesgo si no existe.

# 8. Atomicidad y fallos

Cuando una operación combine DB y Storage:

* evita dejar una referencia DB a un archivo que no existe;
* evita borrar la fila antes de confirmar que la política de eliminación es correcta;
* registra y limpia archivos huérfanos cuando sea viable;
* no mantengas una transacción DB abierta durante una llamada de red a Storage.

Si no es posible atomicidad real entre DB y Storage, implementa una compensación clara y testeable.

# 9. Cambios permitidos

Puedes modificar únicamente:

* rutas, server actions y servicios de PQRS;
* servicios de evidencias/archivos;
* helpers de Storage usados por PQRS;
* validadores de PQRS;
* pruebas específicas;
* documentos 01 y 02.

Puedes reutilizar la capa común de autorización, pero no rediseñarla.

Schema/migración:

* solo si es imprescindible para cerrar un defecto real;
* una única migración aditiva;
* no usar `db push`;
* explicar por qué era inevitable.

No modificar billing, reservas, documentos generales, pagos, usuarios, invitaciones, UI global, paquetes ni entorno.

# 10. Pruebas específicas

Añade pruebas para los riesgos encontrados. Como mínimo:

1. ADMIN accede a PQRS de su tenant.
2. ADMIN no accede a otro tenant.
3. CONSEJO respeta sus permisos reales.
4. RESIDENTE crea PQRS propio.
5. RESIDENTE no falsifica tenant.
6. RESIDENTE no falsifica propietario.
7. RESIDENTE ve su PQRS.
8. RESIDENTE no ve PQRS ajeno.
9. ID conocido cross-tenant devuelve 404 indistinguible.
10. PATCH no cambia tenant.
11. PATCH no cambia creador.
12. Rol no autorizado no cambia estado.
13. Comentario propio/autorizado funciona.
14. Comentario cross-tenant falla.
15. Evidencia propia/autorizada funciona.
16. Evidencia de otro tenant falla.
17. Download exige autorización.
18. Delete exige autorización.
19. Path traversal rechazado.
20. MIME/extensión/tamaño inválidos rechazados.
21. Error inesperado no filtra detalles internos.
22. Camino autorizado sigue funcionando.

Usa pruebas puras para decisiones, validación y paths.

Usa integración solo si una consulta Prisma o comportamiento Storage no puede demostrarse de otra forma.

No uses `skip`.

# 11. Ejecución

Durante el trabajo ejecuta únicamente los archivos específicos creados o modificados.

Al final, una sola vez:

```text
npx tsc --noEmit
npm run lint
```

No ejecutes suite completa.

Si una prueba falla:

* analiza;
* corrige si es lógica;
* no reintentes automáticamente si es ambiental.

# 12. Informe final

Entrega un informe corto:

1. Estado inicial.
2. Archivos inspeccionados.
3. Matriz de permisos.
4. Vulnerabilidades encontradas.
5. Correcciones.
6. IDOR.
7. Creación/PATCH.
8. Comentarios.
9. Evidencias y Storage.
10. Errores y auditoría.
11. Archivos modificados.
12. Pruebas específicas.
13. Typecheck/lint.
14. Riesgos restantes.
15. Recomendación para Claude.
16. Estado:

* IMPLEMENTADO.
* IMPLEMENTADO CON RIESGOS.
* BLOQUEADO.

## Finalización

* Guarda el informe en el documento 02.
* No hagas commit.
* No hagas push.
* No crees tags.
* No inicies otro módulo.
* Detente después del informe.
