# FASE 0F — APROBACIÓN FINAL DEL AISLAMIENTO DE PRUEBAS

Actúa como revisor técnico final e independiente especializado en Node.js, TypeScript, Prisma, seguridad de entornos, variables de entorno, procesos hijos y aplicaciones Next.js desplegadas en Vercel.

Otro agente corrigió los bloqueantes encontrados en la protección del entorno de pruebas.

Tu responsabilidad es determinar si la Fase 0 puede cerrarse y si los cambios pueden ser confirmados en Git.

## Documentos de referencia

Lee:

* `docs/programa-mejora/01-linea-base/08-respuesta-codex-revision-seguridad-tests.md`
* `docs/programa-mejora/01-linea-base/10-respuesta-claude-correcciones-seguridad-tests.md`
* `docs/TESTING.md`

No confíes únicamente en esos informes. Revisa directamente el diff y el código actual.

## Objetivo

Confirmar que:

1. El comando oficial de pruebas no puede utilizar accidentalmente la base normal.
2. La ejecución directa habitual de tests queda bloqueada antes de crear Prisma.
3. Los comandos Prisma de test fuerzan únicamente variables de test.
4. El runtime normal de desarrollo, producción y build no queda bloqueado.
5. La solución es multiplataforma.
6. No se exponen secretos.
7. No existen rutas de falso éxito.
8. El diff está limitado al alcance aprobado.
9. Las correcciones no introducen riesgos superiores a los que solucionan.

## Modalidad obligatoria

Esta revisión es de solo lectura.

No debes:

* Modificar archivos.
* Crear parches.
* Ejecutar `npm test`.
* Ejecutar `npm run test:db:deploy`.
* Ejecutar `npm run test:db:push`.
* Ejecutar Prisma.
* Ejecutar migraciones.
* Ejecutar seeds.
* Abrir Prisma Studio.
* Conectarte a una base de datos.
* Ejecutar build.
* Levantar el servidor.
* Instalar dependencias.
* Modificar variables de entorno reales.
* Mostrar secretos.
* Hacer commit, restore, reset, checkout o push.
* Modificar los documentos eliminados previamente.

Puedes:

* Leer archivos.
* Usar búsquedas estáticas.
* Ejecutar `git status`.
* Ejecutar `git diff`.
* Ejecutar `npx tsc --noEmit`.
* Ejecutar `npm run lint`.
* Ejecutar únicamente las pruebas puras del módulo de seguridad, después de comprobar que no importan Prisma.
* Ejecutar escenarios que estén garantizados para abortar antes de Prisma.

## Primera acción

Inspecciona:

* `git status`
* `git diff --stat`
* El diff completo de:

  * `src/lib/prisma.ts`
  * `src/lib/testing/test-database-safety.ts`
  * `scripts/run-tests.ts`
  * `scripts/run-test-prisma.ts`
  * `tests/unit/test-database-safety.test.ts`
  * `package.json`
  * `.env.test.example`
  * `.gitignore`
  * `.nvmrc`
  * `docs/TESTING.md`

Confirma:

* Que no existen cambios accidentales en lógica de negocio.
* Que los 48 documentos eliminados previamente no fueron alterados por esta fase.
* Que los archivos eliminados de la implementación 0C eran únicamente archivos nuevos y no versionados reemplazados por la solución actual.

## Revisión 1 — Módulo compartido de seguridad

Revisa completamente:

`src/lib/testing/test-database-safety.ts`

Evalúa:

* Ausencia de imports de Prisma.
* Ausencia de efectos secundarios al importar.
* Canonicalización.
* Comparación de destinos.
* Reconocimiento de Supabase directo y pooler.
* Protocolos aceptados.
* Decodificación del nombre de base.
* Puertos.
* Credenciales.
* Parámetros.
* Allowlist.
* Heurística de nombres.
* Resolución de variables.
* Detección de contexto de pruebas.
* Evaluación previa a Prisma.
* Manejo seguro de errores.

Busca entradas maliciosas o extrañas que causen:

* Falso positivo.
* Falso negativo.
* Excepción inesperada.
* Exposición de secretos.
* Permiso de conexión insegura.
* Bloqueo de producción.

## Revisión 2 — Impacto sobre Prisma en producción

Revisa:

`src/lib/prisma.ts`

Reconstruye el comportamiento cuando:

### Desarrollo normal

* `NODE_ENV=development`
* Sin marca del runner.
* Sin `TEST_DATABASE_URL`.
* Con `DATABASE_URL` normal.

### Producción

* `NODE_ENV=production`
* Sin marca del runner.
* Con `DATABASE_URL`.
* Posiblemente con `DIRECT_URL`.

### Build de Next.js

* Importación estática de módulos.
* Evaluación durante compilación.
* Generación de páginas.
* Ejecución de scripts de build.

### Scripts administrativos

* Seed.
* Migraciones.
* Scripts ejecutados con `tsx`.
* Scripts que podrían usar `NODE_ENV=test` por motivos no relacionados.

### Test oficial

* Marca del runner.
* `NODE_ENV=test`.
* `DATABASE_URL` reemplazada.
* `DIRECT_URL` eliminado o reemplazado.

### Test directo

* `npx tsx --test`.
* `node --import tsx --test`.
* IDE.
* `NODE_ENV=test` sin marca.

Confirma que la barrera ocurre antes de:

`new PrismaClient()`

Determina si existe alguna combinación habitual donde producción o desarrollo puedan ser bloqueados accidentalmente.

## Revisión 3 — Detección de contexto de test

Analiza `isNodeTestContext` o su equivalente.

Verifica:

* `process.argv`
* `process.execArgv`
* `NODE_ENV`
* Marca del runner
* Contexto de Node Test
* Procesos hijos
* IDE
* Tests importados directamente
* Scripts que usan la palabra `test` en una ruta o argumento

Busca falsos positivos como:

* Un archivo de producción ubicado en una carpeta con “test”.
* Un argumento de aplicación que contenga “--test” como parte de otro valor.
* `NODE_ENV=test` utilizado en un script que no sea suite de pruebas.
* Variables heredadas accidentalmente en Vercel.

Determina si la decisión fail-closed está correctamente limitada.

## Revisión 4 — Prioridad de variables

Confirma que la prioridad real sea:

1. Variables del proceso o CI.
2. `.env.test`.
3. `.env`.

Comprueba:

* Archivos ausentes.
* Archivos vacíos.
* Variables con string vacío.
* Espacios.
* Valores duplicados.
* Variables definidas como `undefined`.
* Mutación accidental de `process.env`.
* Variables del sistema que oculten deliberadamente `.env.test`.

Determina si esta prioridad es coherente con la documentación.

## Revisión 5 — Canonicalización

Comprueba estáticamente y mediante pruebas puras:

* `postgres://` frente a `postgresql://`.
* Host en mayúsculas.
* Puerto 5432 implícito y explícito.
* Query params diferentes.
* Credenciales diferentes.
* Nombre de base codificado.
* Slash final.
* Espacios.
* IPv4.
* IPv6, si la función pretende soportarlo.
* Supabase directo frente a pooler.
* Supabase session pooler frente a transaction pooler.
* Diferentes proyectos de Supabase.
* Base diferente en el mismo host.
* Protocolos no PostgreSQL.

Evalúa específicamente la afirmación:

“Ante ambigüedad, falla de forma conservadora.”

Confirma si el código realmente puede detectar una situación ambigua o si solamente documenta limitaciones.

No exijas resolver alias DNS arbitrarios, pero el informe debe describir con precisión lo que sí y no protege.

## Revisión 6 — Segunda barrera

Confirma que una marca del runner por sí sola no permita acceso.

Debe exigir simultáneamente:

* Contexto de test.
* Marca.
* `TEST_DATABASE_URL`.
* Confirmación explícita.
* Configuración válida.
* Coincidencia canónica entre `DATABASE_URL` y `TEST_DATABASE_URL`.

Busca formas de omitir cada condición.

Distingue entre:

* Bypass accidental realista.
* Bypass deliberado de un desarrollador con control total del proceso.
* Riesgo aceptable.
* Riesgo bloqueante.

## Revisión 7 — DIRECT_URL

Revisa:

* Cómo se construye el entorno del proceso hijo de tests.
* Si se elimina correctamente el `DIRECT_URL` normal.
* Si `TEST_DIRECT_URL` se valida.
* Si el fallback requiere autorización explícita.
* Si `DATABASE_URL` y `DIRECT_URL` podrían apuntar a proyectos distintos.
* Si se compara también la identidad de ambos destinos.
* Qué ocurre si `TEST_DIRECT_URL` está vacía.
* Qué ocurre si solo existe `DIRECT_URL` de producción.

Confirma que ningún comando oficial de test hereda silenciosamente el `DIRECT_URL` normal.

## Revisión 8 — Runner de pruebas

Revisa:

`scripts/run-tests.ts`

Confirma:

* No importa Prisma.
* El guard corre primero.
* Descubrimiento ordenado.
* Sin symlinks.
* Sin duplicados.
* Solo archivos esperados.
* Falla con cero tests.
* Uso de `process.execPath`.
* `shell: false`.
* Manejo de rutas con espacios.
* Propagación de errores.
* Manejo de señales.
* Manejo de `status: null`.
* Ausencia de falso éxito.
* Tamaño potencial de argumentos.

Confirma que incluye tanto pruebas puras como integración y que todas pasan por el mismo proceso protegido.

## Revisión 9 — Runner de Prisma

Revisa:

`scripts/run-test-prisma.ts`

Confirma:

* Allowlist cerrada.
* Solo acepta `deploy` y `push`.
* No permite argumentos adicionales inyectados.
* Resuelve el binario local correcto.
* No usa shell.
* No imprime secretos.
* Reutiliza el guard.
* Fuerza `DATABASE_URL`.
* Fuerza `DIRECT_URL`.
* Propaga errores.
* Falla ante operación desconocida.
* Falla ante configuración insegura.
* No permite que Prisma CLI herede la conexión normal.

Comprueba los scripts correspondientes en `package.json`.

## Revisión 10 — Heurística y allowlist

Comprueba:

* `latest`.
* `contest`.
* `prod_test_backup`.
* `testing-production`.
* `pqrs_test`.
* `test_pqrs`.
* `pqrs-qa`.
* `sandbox`.
* `ci`.
* Host local.
* Host de Supabase.
* Allowlist exacta.
* Allowlist con espacios.
* Allowlist malformada.
* `TEST_DATABASE_ALLOW_ANY_NAME=true`.

Determina si la opción `ALLOW_ANY_NAME` está suficientemente marcada como bypass secundario deliberado y si aún conserva las barreras primarias.

## Revisión 11 — Compatibilidad de Node

Revisa:

* `engines.node`.
* `.nvmrc`.
* APIs utilizadas.
* Next.js.
* `tsx`.
* `node --import`.
* `node:test`.
* `readdirSync`.
* `createRequire`.
* `spawnSync`.

Determina si `>=20.6.0` es coherente o demasiado específico.

No uses internet. Basa la conclusión en el repositorio, tipos y ejecución local disponible.

Señala que la versión configurada en el dashboard de Vercel no puede confirmarse desde el repositorio si ese es el caso.

Determina si esto bloquea el commit o puede quedar como verificación operativa posterior.

## Revisión 12 — Pruebas puras

Lee y, si es seguro, ejecuta:

```bash
npx tsx --test tests/unit/test-database-safety.test.ts
```

Confirma:

* Número real de pruebas.
* Que no importa Prisma.
* Que no abre conexiones.
* Cobertura.
* Calidad de aserciones.
* Ausencia de dependencia del entorno real.
* Restauración de variables.
* Casos omitidos.

No agregues pruebas.

## Revisión 13 — Documentación

Compara `docs/TESTING.md` con el código.

Confirma que incluye:

* Prioridad de variables.
* Comandos oficiales.
* Prohibición de Prisma directo.
* PowerShell.
* Bash.
* CI.
* Node.
* Segunda barrera.
* Canonicalización.
* Limitaciones.
* Limpieza.
* Residuos.
* Allowlist.
* Bypasses explícitos.
* Protección de secretos.

Identifica cualquier instrucción que todavía pueda llevar a ejecutar un comando inseguro.

## Revisión 14 — Archivos de entorno

Revisa:

* `.env.test.example`.
* `.gitignore`.

Confirma:

* No hay secretos.
* `.env.test` está ignorado.
* El archivo de ejemplo es versionable.
* Variables coherentes con el código.
* Comentarios no ambiguos.
* No falta una variable obligatoria.
* No se recomienda reutilizar producción.

## Revisión 15 — Alcance del diff

Clasifica cada archivo modificado como:

* Necesario.
* Justificado.
* Prescindible.
* Fuera de alcance.

Verifica particularmente si modificar `src/lib/prisma.ts` está justificado por la segunda barrera.

Confirma que no se modificó:

* Facturación.
* Webhooks.
* PQRS.
* Storage.
* Autenticación funcional.
* Soporte.
* Schema.
* Migraciones.
* Interfaz.

## Validaciones permitidas

Puedes ejecutar:

```bash
npx tsc --noEmit
npm run lint
npx tsx --test tests/unit/test-database-safety.test.ts
```

También puedes ejecutar escenarios que aborten garantizadamente antes de Prisma.

No ejecutes ningún comando que pueda alcanzar una conexión.

## Clasificación de hallazgos

Para cada hallazgo utiliza:

* ID.
* Severidad: crítica, alta, media o baja.
* Archivo y símbolo.
* Comportamiento actual.
* Escenario.
* Impacto.
* Evidencia.
* Corrección.
* ¿Bloquea el cierre?: Sí/No.

## Criterios para aprobar

La fase puede aprobarse si:

* No existe un bypass accidental habitual del comando oficial o de Node Test.
* La aplicación normal no queda afectada.
* Los comandos Prisma de test no heredan variables normales.
* No se exponen secretos.
* No hay falso éxito.
* Los riesgos restantes requieren acciones deliberadas o acceso al código.
* Typecheck, lint y pruebas puras pasan.
* La documentación coincide con el código.
* No hay hallazgos críticos o altos abiertos.

## Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Runtime normal.
5. Detección de test.
6. Prioridad de variables.
7. Canonicalización.
8. Segunda barrera.
9. DIRECT_URL.
10. Runner de tests.
11. Runner Prisma.
12. Heurística y allowlist.
13. Compatibilidad Node.
14. Compatibilidad multiplataforma.
15. Pruebas puras.
16. Documentación.
17. Archivos de entorno.
18. Hallazgos.
19. Riesgos aceptados.
20. Verificación operativa pendiente.
21. Recomendación sobre commit.
22. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

Detente después del informe.

No modifiques nada.

No generes un parche.

No hagas commit.

No continúes con facturación.
