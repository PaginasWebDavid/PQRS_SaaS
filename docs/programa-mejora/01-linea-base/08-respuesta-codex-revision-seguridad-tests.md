1. Resumen ejecutivo
La Fase 0D no puede aprobarse todavía. npm test incorpora una protección útil y falla de forma segura cuando falta configuración, pero aún existen rutas realistas para ejecutar pruebas contra una base incorrecta.
2. Estado de Git
Solo aparecen cambios propios de la Fase 0C en package.json, .gitignore, runner, guard, pruebas y documentación. Hay 48 documentos eliminados previamente que no modifiqué ni restauré.
No encontré cambios en src/, prisma/schema.prisma, migraciones ni lógica de negocio.
3. Secuencia de npm test
La secuencia efectiva es:
npm test → runner → carga .env → carga .env.test → guard → descubrimiento → proceso hijo → importación de tests → Prisma.
El guard sí se ejecuta antes de Prisma en esta ruta oficial: [run-tests.ts (line 28)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/scripts/run-tests.ts:28).
4. Prioridad de variables
La prioridad real es:
variables del sistema > .env > .env.test
Esto ocurre porque ambas llamadas a dotenv usan override: false. Por tanto, .env.test puede ser ignorado silenciosamente si una variable ya existe en .env o Vercel/terminal.
5. Formas de omitir el guard
Estas rutas no pasan por el runner:
npx tsx --test tests/phase1-infrastructure.test.ts
node --import tsx --test ...
Ejecutar tests desde el IDE.
Importar directamente un test de integración.
Un script futuro que invoque Prisma por su cuenta.
Esto hace que la protección dependa de recordar usar exclusivamente npm test.
6. Comparación de URLs
El guard compara cadenas recortadas, no destinos equivalentes: [test-database-guard.ts (line 65)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/tests/helpers/test-database-guard.ts:65).
La misma base podría pasar usando credenciales distintas, parámetros diferentes, mayúsculas, puerto explícito, alias DNS o conexión directa frente a pooler.
7. Heurística test
La comprobación /test/i es orientativa, no una garantía. Acepta falsos positivos como latest, contest o prod_test_backup, y rechaza bases legítimas llamadas qa, ci o sandbox.
TEST_DATABASE_ALLOW_ANY_NAME=true desactiva completamente esta barrera.
8. Secretos y errores
Los mensajes no exponen contraseña, URL completa, usuario, query string ni token. Solo muestran host y base cuando es necesario. Esta parte está correctamente resuelta.
9. Compatibilidad Node
Validado con Node v24.13.0. No existe engines, .nvmrc ni .node-version. El runner depende de node --import y del recorrido recursivo de readdirSync, por lo que recomiendo declarar Node 20 o superior.
10. Compatibilidad de plataforma
El proceso hijo usa argumentos estructurados, sin shell, por lo que funciona correctamente con espacios y rutas Windows/Linux/macOS. La documentación usa cp, que no es nativo de PowerShell.
11. Proceso hijo
spawnSync hereda la salida, fuerza DATABASE_URL, propaga códigos de error y convierte señales o estados nulos en fallo. No encontré una ruta de falso éxito.
12. Descubrimiento de tests
Encuentra recursivamente archivos .test.ts y excluye correctamente helpers. No ordena los archivos y podría incluir tests generados accidentalmente. Con cero tests falla correctamente.
13. Prisma y variables
Prisma consume DATABASE_URL y DIRECT_URL, no TEST_DATABASE_URL: [schema.prisma (line 7)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/prisma/schema.prisma:7).
El runner reemplaza DATABASE_URL, pero no elimina ni reemplaza DIRECT_URL. Las pruebas actuales no ejecutan Prisma CLI, aunque un test o script futuro podría hacerlo.
14. Aplicación normal
La aplicación productiva no importa el runner ni el guard. Desarrollo, build y producción continúan usando las variables normales. No encontré impacto accidental en runtime.
15. Calidad de las pruebas unitarias
Pasaron las 12 pruebas puras del guard usando la misma invocación del proceso hijo. Faltan casos sobre URLs equivalentes, prioridades de entorno, protocolos inválidos y ejecución directa sin runner.
16. Documentación
El riesgo más grave está en [TESTING.md (line 29)](C:/Users/d.hernandeza2/Documents/PQRS_Saas/docs/TESTING.md:29): recomienda ejecutar prisma migrate deploy o prisma db push “apuntando a TEST_DATABASE_URL”, pero Prisma no lee esa variable. Esa instrucción podría modificar la base normal mediante DATABASE_URL o DIRECT_URL.
17. Hallazgos clasificados
ID	Severidad	Hallazgo	Bloquea
F0D-01	Crítica	URLs equivalentes pueden evadir la comparación textual	Sí
F0D-02	Crítica	La instrucción Prisma puede apuntar a la base normal	Sí
F0D-03	Alta	IDE y comandos directos omiten completamente el guard	Sí
F0D-04	Alta	.env.test tiene menor prioridad que .env	Sí
F0D-05	Media	Versión de Node no declarada	No
F0D-06	Baja	Descubrimiento sin orden y documentación cp	No

18. Correcciones obligatorias
Comparar un destino canónico ignorando credenciales y parámetros irrelevantes.
Validar únicamente protocolos PostgreSQL.
Añadir una segunda barrera antes de crear PrismaClient, activada en contexto de pruebas.
Crear un comando protegido para migraciones de prueba que reemplace tanto DATABASE_URL como DIRECT_URL.
Definir explícitamente la prioridad de .env.test y probarla.
Cubrir ejecución directa, URLs equivalentes y overrides con pruebas.
19. Mejoras opcionales
Declarar "engines": { "node": ">=20" }, añadir .nvmrc, ordenar los tests y documentar comandos equivalentes para PowerShell.
20. Validaciones realizadas
Prueba pura del guard: 12/12 aprobadas.
Aborto con variables vacías: correcto, exit code 1 antes de Prisma.
npx tsc --noEmit: aprobado.
npm run lint: aprobado, sin advertencias.
No ejecuté integración, Prisma, migraciones, seeds, servidor, build ni conexiones de base de datos.
21. Veredicto
REQUIERE CORRECCIONES
La arquitectura central es recuperable y el runner oficial funciona, pero todavía no demuestra aislamiento fuerte. Las tres rutas bloqueantes son la comparación textual de URLs, el bypass mediante ejecución directa y la instrucción insegura para Prisma. No apliqué ninguna corrección ni modifiqué archivos.