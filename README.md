# PQRS Services

Plataforma SaaS multi-tenant para administrar PQRS de conjuntos residenciales desde una unica base de codigo.

## Stack

- Next.js 14 App Router
- TypeScript
- Prisma
- Supabase PostgreSQL
- Supabase Storage
- NextAuth
- Resend
- Mercado Pago
- Vercel

## Desarrollo local

1. Instala dependencias:

```bash
npm install
```

2. Copia variables de entorno:

```bash
copy .env.example .env
```

3. Configura `.env` con Supabase, NextAuth, Storage, Resend y Mercado Pago.

4. Aplica migraciones y genera Prisma Client:

```bash
npx prisma migrate deploy
npx prisma generate
```

5. Ejecuta el proyecto:

```bash
npm run dev
```

## Scripts principales

```bash
npm run dev               # Desarrollo local
npm run build             # Prisma generate + build de Next.js
npm run release:check     # Validacion Prisma + build
npm run db:migrate        # Migracion local con Prisma migrate dev
npm run db:migrate:deploy # Migraciones para Supabase/Vercel
npm run db:seed           # Seed de super admin y datos base
```

## Produccion

La guia de despliegue esta en [docs/PRODUCTION.md](docs/PRODUCTION.md).

Resumen minimo para Vercel:

- Configurar `DATABASE_URL` con Transaction Pooler de Supabase.
- Configurar `DIRECT_URL` con Direct Connection de Supabase.
- Configurar `NEXTAUTH_URL` y `APP_URL` con el dominio final.
- Configurar Supabase Storage con bucket privado `pqrs-evidencias`.
- Configurar Resend con dominio verificado.
- Configurar Mercado Pago con token de produccion y webhook publico.
- Ejecutar `npm run db:migrate:deploy` antes o durante el release.
- Verificar `npm run release:check` antes de desplegar.

## Seguridad operativa

- `.env` no debe subirse al repositorio.
- `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` y `NEXTAUTH_SECRET` solo van en variables privadas del entorno.
- Los datos multi-tenant siempre se resuelven desde la sesion, no desde parametros enviados por el cliente.
