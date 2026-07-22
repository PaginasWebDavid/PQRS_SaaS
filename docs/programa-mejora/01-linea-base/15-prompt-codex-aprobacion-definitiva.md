# FASE 0H — APROBACIÓN DEFINITIVA DEL AISLAMIENTO DE PRUEBAS

Actúa como revisor técnico final e independiente.

Esta revisión es deliberadamente limitada. No repitas la auditoría completa de las fases anteriores.

Debes verificar únicamente las correcciones de los hallazgos F0F-01 a F0F-05 y determinar si la Fase 0 puede cerrarse y confirmarse en Git.

## Documentos de referencia

Lee:

* `docs/programa-mejora/01-linea-base/12-respuesta-codex-aprobacion-final-seguridad-tests.md`
* `docs/programa-mejora/01-linea-base/14-respuesta-claude-correcciones-finales-seguridad-tests.md`
* `docs/TESTING.md`

La fuente de verdad es el código y el diff actual.

## Objetivo

Confirmar específicamente que:

1. `TEST_DIRECT_URL` solo puede apuntar al mismo destino o proyecto de pruebas que `TEST_DATABASE_URL`.
2. `TEST_DIRECT_URL` no puede coincidir con conexiones normales.
3. Supabase pooler y conexión directa del mismo proyecto de pruebas se reconocen correctamente.
4. La ejecución directa de un archivo `.test.*` se detecta como contexto de pruebas.
5. La marca del runner no cuenta por sí sola como contexto de pruebas.
6. Una ejecución directa sin marca queda bloqueada antes de `new PrismaClient()`.
7. El manejo de percent-encoding falla de forma controlada.
8. La documentación DNS coincide con el comportamiento real.
9. `package-lock.json` refleja `engines.node` sin otros cambios accidentales.
10. No existen regresiones críticas o altas.

## Modalidad obligatoria

Esta es una revisión de solo lectura.

No debes:

* Modificar archivos.
* Crear parches.
* Ejecutar `npm test`.
* Ejecutar Prisma.
* Ejecutar `test:db:deploy`.
* Ejecutar `test:db:push`.
* Ejecutar migraciones.
* Ejecutar seeds.
* Ejecutar build.
* Levantar el servidor.
* Conectarte a una base de datos o servicio externo.
* Instalar dependencias.
* Mostrar secretos.
* Hacer commit, restore, reset, checkout o push.
* Alterar los 48 documentos eliminados previamente.

Puedes ejecutar:

```bash
git status
git diff
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/test-database-safety.test.ts
```

También puedes ejecutar escenarios puros o garantizados para abortar antes de Prisma.

## Primera verificación — Alcance del diff

Confirma que los cambios finales se limitan a:

* `src/lib/testing/test-database-safety.ts`
* `scripts/run-test-prisma.ts`
* `tests/unit/test-database-safety.test.ts`
* `docs/TESTING.md`
* `package-lock.json`

Además de los archivos previamente aprobados de esta fase.

Confirma que no se modificó:

* Facturación.
* Webhooks.
* PQRS.
* Autenticación funcional.
* Storage.
* Soporte.
* Schema Prisma.
* Migraciones.
* Seed.
* Interfaz.

Confirma que los 48 documentos eliminados previamente siguen sin ser modificados ni restaurados.

## Verificación 1 — TEST_DIRECT_URL

Revisa completamente `resolveTestDirectUrl`.

Debe comprobarse que:

* Solo acepta `postgres:` o `postgresql:`.
* `TEST_DIRECT_URL` corresponde canónicamente a `TEST_DATABASE_URL`.
* Se permite Supabase pooler y directo del mismo proyecto.
* Se rechazan proyectos Supabase distintos.
* Se rechazan bases distintas en el mismo host.
* Se rechaza si coincide con `DATABASE_URL` normal.
* Se rechaza si coincide con `DIRECT_URL` normal.
* Credenciales o query parameters distintos no producen un falso rechazo si el destino de pruebas es el mismo.
* Los errores no exponen secretos.

Revisa también el fallback:

* Solo opera con `ALLOW_TEST_DIRECT_URL_FALLBACK=true`.
* Usa exclusivamente `TEST_DATABASE_URL`.
* Nunca hereda el `DIRECT_URL` normal.
* El resultado identifica que se utilizó fallback.

Determina si existe alguna configuración accidental razonable en la que `test:db:push` o `test:db:deploy` puedan alcanzar producción.

## Verificación 2 — Entry point de test

Revisa `isTestEntrypoint`, `isNodeTestContext` y `evaluatePrismaClientAccess`.

Debe detectarse:

* `tests/example.test.ts`
* Una ruta anidada.
* Separadores Windows.
* Separadores POSIX.
* `.test.ts`
* `.test.tsx`
* `.test.js`
* `.test.mjs`
* `.test.cjs`

No debe detectarse únicamente por:

* `latest`
* `contest`
* Una carpeta llamada `testing`
* Un argumento secundario `.test.ts`
* Una ruta normal con la palabra `test` integrada en otro nombre

Confirma que:

* La marca del runner no forma parte de la detección del contexto.
* En un contexto de test se exige además la marca.
* Sin marca, Prisma queda bloqueado.
* Con marca pero configuración insegura, Prisma queda bloqueado.
* Con contexto, marca y configuración segura, se permite continuar.

Busca especialmente algún camino donde un archivo `.test.*` ejecutado directamente llegue a `new PrismaClient()` usando la base normal.

## Verificación 3 — Orden antes de Prisma

Revisa `src/lib/prisma.ts`.

Confirma que:

* La evaluación ocurre antes de `new PrismaClient()`.
* El runtime normal de desarrollo y producción sigue permitiéndose.
* Build normal no exige variables de pruebas.
* No se importan archivos de test desde producción.
* El módulo compartido no importa Prisma ni tiene efectos secundarios de conexión.

## Verificación 4 — Percent-encoding

Confirma que una URL con nombre de base mal codificado, por ejemplo `%ZZ`:

* Falla antes de cualquier conexión.
* Produce el error controlado del sistema.
* No deja escapar un `URIError`.
* No imprime la URL completa ni las credenciales.

## Verificación 5 — Documentación DNS

Comprueba que `docs/TESTING.md` ya no afirme que alias DNS desconocidos fallan de forma conservadora.

Debe explicar correctamente:

* Qué equivalencias sí se reconocen.
* Qué equivalencias DNS no pueden detectarse estáticamente.
* Cuándo debe utilizarse la allowlist.
* Que la allowlist debe describir destinos de pruebas, no producción.

## Verificación 6 — package-lock.json

Confirma que:

* La entrada raíz incluye `engines.node` igual a `package.json`.
* No se alteraron versiones.
* No se alteraron integridades.
* No se agregaron ni eliminaron dependencias.
* El JSON sigue siendo válido.

## Verificación 7 — Pruebas puras

Antes de ejecutarlas, confirma que:

`tests/unit/test-database-safety.test.ts`

no importa Prisma ni abre conexiones.

Después ejecuta:

```bash
npx tsx --test tests/unit/test-database-safety.test.ts
```

Confirma:

* Número real de casos.
* Resultado.
* Cobertura de `TEST_DIRECT_URL`.
* Cobertura de entrypoints.
* Cobertura de independencia entre contexto y marca.
* Cobertura de percent-encoding.
* Protección contra exposición de secretos.

## Verificación 8 — Validaciones generales

Ejecuta:

```bash
npx tsc --noEmit
npm run lint
```

No ejecutes ningún otro test.

## Criterios bloqueantes

La fase no puede aprobarse si encuentras que:

* `TEST_DIRECT_URL` puede apuntar a otra base.
* Una conexión normal puede pasar como `TEST_DIRECT_URL`.
* Un archivo `.test.*` directo no activa la barrera.
* La marca del runner autoriza por sí sola.
* La evaluación ocurre después de crear Prisma.
* Se exponen secretos.
* El runtime normal queda bloqueado.
* Existe un error de TypeScript o lint.
* Las pruebas puras fallan.
* Hay cambios funcionales fuera de alcance.

## Formato de hallazgos

Para cada hallazgo incluye:

* ID.
* Severidad.
* Archivo y símbolo.
* Comportamiento actual.
* Escenario.
* Impacto.
* Evidencia.
* Corrección recomendada.
* ¿Bloquea el cierre?: Sí/No.

No clasifiques como crítico un riesgo que requiera que un desarrollador modifique deliberadamente el código o falsifique todas las variables de seguridad.

## Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Revisión de `TEST_DIRECT_URL`.
5. Revisión de entrypoints.
6. Independencia entre contexto y marca.
7. Orden previo a Prisma.
8. Percent-encoding.
9. Documentación DNS.
10. `package-lock.json`.
11. Pruebas puras.
12. Typecheck y lint.
13. Hallazgos abiertos.
14. Riesgos aceptados.
15. Recomendación sobre commit.
16. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

Detente después del informe.

No modifiques nada.

No hagas commit.

No continúes con facturación.
