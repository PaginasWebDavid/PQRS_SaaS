# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm run dev                 # Next dev server
npm run build               # prisma generate && next build
npm run lint
npx tsc --noEmit            # typecheck (mas rapido que build para validar cambios)

npm test                    # suite completa (~30 min: la base de pruebas esta lejos)
npm test tests/unit/api-tenant-scoping.test.ts          # un solo archivo
npm test -- --name-pattern="aislamiento"                # por nombre de prueba

npm run test:db:deploy      # aplica migraciones a la base de PRUEBAS
npm run db:migrate:deploy   # aplica migraciones a la base apuntada por DATABASE_URL
npm run db:seed
```

## Pruebas: dos guardas que hay que conocer

**Nunca se corren contra produccion.** `scripts/run-tests.ts` resuelve el entorno con
prioridad `sistema > .env.test > .env` y `src/lib/testing/test-database-safety.ts` aborta
si la URL no es la de pruebas. Las pruebas **mutan datos**: crean y borran conjuntos,
usuarios y PQRS. Correrlas contra `DATABASE_URL` destruiria la base real.

**Solo una suite a la vez.** Hay un lock por workspace en el directorio temporal. Si dice
"Ya existe una suite en ejecucion (PID N)", se libera solo cuando ese proceso muere.

Requiere `.env.test` con `TEST_DATABASE_URL` y `TEST_DIRECT_URL`.

## Arquitectura

Next.js 14 App Router · NextAuth v5 (JWT) · Prisma + PostgreSQL (Supabase) · desplegado en Vercel.

**Las rutas de API son delgadas.** Resuelven identidad, validan entrada y delegan en
`src/domains/<dominio>/*.service.ts`, donde vive la logica y las transacciones. Al agregar
comportamiento, va en el servicio, no en la ruta.

### Multi-tenant: la regla que no se rompe

Cada conjunto es un `Tenant`; el acceso se modela con `TenantMembership` (un usuario puede
pertenecer a varios conjuntos con rol distinto en cada uno).

**El `tenantId` sale SIEMPRE de la sesion autenticada, nunca de la peticion.** El id del
recurso viene de la URL y el servicio cruza los dos. Los unicos resolvedores validos son:

- `requireActiveTenantUser(session)` — conjunto activo de la sesion
- `requireTenantRole(session, "ADMIN")` — ademas exige rol
- `resolveUserManagementAccess(session, requestedTenantId)` — acepta un tenant pedido pero
  lo **descarta** para un ADMIN normal; solo un SUPER_ADMIN puede apuntar a otro conjunto
- `requireSuperAdminTenantTarget(session, tenantId)`

`tests/unit/api-tenant-scoping.test.ts` recorre el arbol de rutas y **falla** si alguna ruta
dinamica nueva no usa uno de esos resolvedores. Si se agrega un resolvedor, hay que anadirlo
alli y verificar que contraste contra la sesion.

`src/middleware.ts` bloquea por prefijo de ruta segun el rol (`/super-admin`, `/admin`,
`/consejo`, `/residente`) y fuerza el onboarding y la seleccion de conjunto.

### Seguridad de la base

RLS activo en todas las tablas de `public`, sin politicas: el aislamiento real vive en la capa
de aplicacion y duplicarlo en SQL crearia dos fuentes de verdad. Prisma conecta como
`postgres`, que tiene `rolbypassrls`, asi que RLS no afecta a la app. Los roles `anon` y
`authenticated` de PostgREST estan revocados, incluido `TRUNCATE` — que **no** pasa por RLS.

`ALTER DEFAULT PRIVILEGES` cubre tablas futuras: no volver a concederles permisos.

### PQRS

La **categoria** determina el flujo: `PqrsCategory.workflowType` es `SIMPLE` o `MAINTENANCE`
(5 fases). El residente solo envia titulo, descripcion y hasta 3 fotos; **el admin clasifica
al abrir el caso**, y ese momento es el que fija el flujo. Las transiciones validas estan en
el dominio `pqrs`, no en la UI.

### Facturacion y capa comercial

Dos numeros distintos que no deben mezclarse:

- `monthlyRevenueCents` — **MRR**: reparte una anualidad entre 12 y cuenta por periodo cubierto
- `receivedThisMonthCents` — **caja**: por fecha de pago y valor completo, solo proveedores de
  `REAL_MONEY_PROVIDERS` (`src/lib/design/billing.ts`, fuente unica compartida con la UI)

`SIMULATED` es una anotacion manual del Super Admin, **no dinero recibido**; se reporta aparte.

**Arriba de 600 unidades no hay tarifa automatica.** Se cotiza a mano al crear el conjunto
(precio de piloto, precio mensual y motivo obligatorios) y `validateCommercialPricingPolicy()`
falla si existe una regla de precio sin tope o con `maxUnits > 600`. Esa funcion tiene la tabla
esperada escrita en el codigo: cambiar precios implica actualizarla.

### Integraciones

- **Resend** — `src/lib/email.ts`. Usar `sendEmailSafe` cuando el fallo del correo no deba
  tumbar la operacion. El `Reply-To` apunta al canal de contacto legal, porque el remitente
  (`notificaciones@`) no tiene buzon.
- **Wompi** — mensual y anual, cobro automatico y webhooks idempotentes.
- **Supabase Storage** — bucket privado. Las rutas son `{tenantId}/{carpeta}/{archivo}` y se
  validan en cada descarga; el tipo real del archivo se verifica por magic bytes.

### Documentos legales

`src/lib/legal.ts` centraliza la identidad (`NEXT_PUBLIC_LEGAL_*`) y los topes contractuales
que tambien viven en codigo (gracia minima, aviso de cambio de precio, tope de responsabilidad).
`LEGAL_DOCUMENT_VERSION` se guarda en `User.termsVersion` al aceptar una invitacion: **subirla
cuando el contenido cambie de forma material**, o el registro apuntara al texto equivocado.

Las afirmaciones de las politicas deben verificarse contra el codigo antes de escribirlas.

## Convenciones

- **La interfaz va 100% en espanol.** La operan administradoras de conjuntos en Colombia; no
  debe aparecer ni una palabra en ingles en texto visible.
- Los comentarios explican **por que**, no que hace el codigo, y estan en espanol sin tildes.
- Migraciones: verificar contra la base real dentro de una transaccion con rollback antes de
  aplicar cambios amplios de permisos o esquema.
