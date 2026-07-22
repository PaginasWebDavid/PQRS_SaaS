# Pruebas: configuracion y aislamiento seguro

La suite de integracion (`tests/*.test.ts`) **crea y borra datos reales** en
PostgreSQL. Para que nunca pueda ejecutarse contra la base normal o de produccion
existen **dos barreras** que comparten una unica fuente de verdad
(`src/lib/testing/test-database-safety.ts`, un modulo puro sin Prisma):

1. **Runner oficial** (`scripts/run-tests.ts`): `npm test` pasa siempre por aqui.
   Resuelve variables, ejecuta el guard y solo entonces lanza la suite en un
   proceso hijo con `DATABASE_URL` apuntando a la base de pruebas.
2. **Segunda barrera** (`src/lib/prisma.ts`): justo antes de `new PrismaClient()`.
   Si detecta un contexto de Node Test (por ejemplo alguien corriendo
   `npx tsx --test archivo` a mano, o desde el IDE) sin haber pasado por el runner
   seguro, **lanza antes de conectar**. En runtime normal (app/dev/build/prod) no
   interfiere.

## Prioridad de variables

Se resuelven en este orden (gana el primero que exista):

1. Variables del **sistema / CI**.
2. `.env.test`.
3. `.env`.

Es decir, una variable en `.env` **no** oculta una declarada en `.env.test`, y el
entorno del sistema/CI siempre manda. El runner parsea ambos archivos en objetos
separados y los combina explicitamente (no muta `process.env` durante el calculo).

## Variables

| Variable | Obligatoria | Descripcion |
|---|---|---|
| `TEST_DATABASE_URL` | Si | Base de **pruebas** (pooler/normal). Destino distinto de `DATABASE_URL`. |
| `ALLOW_TEST_DATABASE_MUTATION` | Si | Debe ser exactamente `true`. Autoriza que las pruebas creen/borren datos. |
| `TEST_DIRECT_URL` | Solo para `test:db:*` | Conexion **directa** (no pooler) de la MISMA base o proyecto de pruebas. Se valida que corresponda al destino de `TEST_DATABASE_URL` y que **no** coincida con `DATABASE_URL`/`DIRECT_URL` normales. |
| `ALLOW_TEST_DIRECT_URL_FALLBACK` | No | `true` permite usar `TEST_DATABASE_URL` como `DIRECT_URL` si no defines `TEST_DIRECT_URL`. |
| `TEST_DATABASE_ALLOWED_TARGETS` | No | Allowlist explicita (`host/base` o `base`, separada por comas). Reemplaza la heuristica de nombre. |
| `TEST_DATABASE_ALLOW_ANY_NAME` | No | Bypass **deliberado** de la defensa secundaria de nombre. No es configuracion normal. |

`.env.test` esta ignorado por Git; `.env.test.example` (solo valores ficticios) si
se versiona. **Nunca copies credenciales reales al repositorio.**

## Configuracion (una vez)

1. Crea una base PostgreSQL **dedicada a pruebas**, distinta de la normal. Su
   nombre debe ser de pruebas (exacto: `test`, `qa`, `ci`, `sandbox`, `e2e`; o con
   afijo delimitado: `pqrs_test`, `test_pqrs`). Si usa otro nombre, define
   `TEST_DATABASE_ALLOWED_TARGETS`.

2. Copia el ejemplo:

   Bash / macOS / Linux:
   ```bash
   cp .env.test.example .env.test
   ```

   Windows PowerShell:
   ```powershell
   Copy-Item .env.test.example .env.test
   ```

3. Edita `.env.test` con tus valores reales de **pruebas**.

4. Aplica el esquema a la base de pruebas con los comandos protegidos (abajo).
   **No ejecutes `prisma migrate deploy` ni `prisma db push` a mano**: Prisma lee
   `DATABASE_URL`/`DIRECT_URL`, no `TEST_DATABASE_URL`, y a mano podrias apuntar a
   la base normal sin darte cuenta.

## Comandos oficiales

Ejecutar las pruebas:

```bash
npm test
```

Aplicar el esquema a la base de **pruebas** (pasan por el mismo guard y fuerzan
`DATABASE_URL` **y** `DIRECT_URL` al destino de pruebas):

```bash
npm run test:db:deploy   # prisma migrate deploy contra la base de pruebas
npm run test:db:push     # prisma db push contra la base de pruebas
```

Estos scripts solo permiten esas dos operaciones (allowlist estricta) y no
aceptan comandos Prisma arbitrarios.

### Prohibiciones

- No ejecutes `prisma migrate deploy` / `prisma db push` directamente "apuntando a
  `TEST_DATABASE_URL`": Prisma no lee esa variable.
- No ejecutes archivos de integracion directamente (`npx tsx --test tests/xxx.test.ts`,
  `node --test`, `npx tsx tests/xxx.test.ts` sin `--test`, o desde el IDE): la
  segunda barrera los aborta antes de Prisma.

### Seed y scripts administrativos

El seed (`npm run db:seed` / `prisma/seed.ts`) crea su propio `PrismaClient` y **no
pasa por esta barrera** (es comportamiento normal de administracion, no de pruebas).
Por eso:

- El seed **no debe usarse como mecanismo de preparacion de pruebas**.
- Los **unicos** comandos aprobados para preparar el esquema de una base de pruebas
  son `npm run test:db:deploy` y `npm run test:db:push`, que fuerzan `DATABASE_URL`
  y `DIRECT_URL` al destino de pruebas y pasan por el guard.

## Segunda barrera (detalle)

Antes de crear el cliente, `src/lib/prisma.ts` detecta el **contexto de pruebas de
forma independiente de la marca**, con cualquiera de estas senales: `--test` en
`execArgv`/`argv`, `NODE_ENV=test`, o un **entrypoint** (`process.argv[1]`) que sigue
el patron de archivos de prueba (`*.test.ts|tsx|js|mjs|cjs`). Esto cubre tambien
`npx tsx tests/x.test.ts` **sin** `--test`, que `node:test` ejecuta igual.

Si hay contexto de pruebas, exige simultaneamente: (a) la **marca** del runner
oficial (que por si sola NO cuenta como contexto), (b) `TEST_DATABASE_URL` y la
confirmacion de mutacion, (c) configuracion segura revalidada, y (d) que
`DATABASE_URL` coincida **canonicamente** con `TEST_DATABASE_URL`. Fuera de contexto
de pruebas, no hace nada (runtime normal intacto).

## Canonicalizacion de destinos: que detecta y que no

La comparacion de "misma base" usa una identidad canonica `host:puerto/base`
(protocolo normalizado, host en minusculas, puerto 5432 implicito=explicito, sin
credenciales ni query). **Detecta** como el mismo destino:

- `postgres://` vs `postgresql://`.
- Host en distinta capitalizacion.
- Puerto 5432 implicito vs explicito.
- Distinto orden de query params / distinta contraseña.
- Supabase pooler vs conexion directa **cuando** la ref de proyecto puede
  extraerse con seguridad del host (`db.<ref>.supabase.co`) o del usuario
  (`postgres.<ref>` en `*.pooler.supabase.com`).

**Limitacion — alias DNS no detectables:** dos hostnames distintos que apunten al
mismo servidor por DNS (alias, CNAME, IP vs. nombre, hosts personalizados) se
consideran **destinos diferentes**; el codigo **no** tiene un estado de "ambiguo"
ni "falla conservadoramente" en ese caso: simplemente no puede relacionarlos sin
conectarse a la base. Por eso, cuando uses hosts personalizados o alias, define una
**allowlist exacta** con `TEST_DATABASE_ALLOWED_TARGETS` para el destino de pruebas.

## Limpieza y residuos

Cada archivo usa un identificador unico por corrida (`RUN`/`RUN_ID` con marca de
tiempo) y limpia en un hook `after()` **acotado** a esos identificadores (sin
`deleteMany({})` global ni borrados por coincidencia amplia). Limitacion: una
terminacion abrupta (SIGKILL, corte de energia) antes del `after()` puede dejar
residuos etiquetados con ese `RUN` en la base de **pruebas**; se identifican y
borran despues, y no afectan datos reales por estar en una base dedicada.

## Configuracion para CI

Define en el entorno del runner de CI (no en archivos versionados):
`TEST_DATABASE_URL`, `ALLOW_TEST_DATABASE_MUTATION=true`, y `TEST_DIRECT_URL` si
CI aplica migraciones. Al tener mayor prioridad que los archivos, el sistema/CI
manda. Node requerido: **>=20.6** (ver `engines` en `package.json` y `.nvmrc`).

## Pruebas puras del sistema de seguridad

La logica (canonicalizacion, prioridad de variables, segunda barrera, secretos,
heuristica/allowlist) tiene pruebas puras que no abren conexiones:

```bash
npx tsx --test tests/unit/test-database-safety.test.ts
```
