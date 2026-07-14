# Produccion

Esta guia deja el checklist operativo para publicar PQRS Services en Vercel usando Supabase, Resend y Mercado Pago.

## 1. Variables de entorno

Configurar estas variables en Vercel Project Settings > Environment Variables para Production y Preview cuando aplique.

### Base de datos

- `DATABASE_URL`: URL de Supabase Transaction Pooler, puerto `6543`, con `pgbouncer=true&sslmode=require`. Es la URL que usa la aplicacion en runtime.
- `DIRECT_URL`: URL de Supabase Direct Connection, puerto `5432`, con `sslmode=require`. Es la URL que usa Prisma para migraciones.

### Autenticacion

- `NEXTAUTH_SECRET`: secreto unico del proyecto.
- `NEXTAUTH_URL`: dominio final, por ejemplo `https://app.tu-dominio.com`.
- `APP_URL`: mismo dominio final. Mercado Pago lo usa para back URLs.

### Super admin seed

- `SUPER_ADMIN_EMAIL`: correo del primer super admin.
- `SUPER_ADMIN_PASSWORD`: clave temporal fuerte. Cambiarla despues del primer acceso.

### Supabase Storage

- `SUPABASE_URL`: URL publica del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: secret key de servidor. Nunca exponer en cliente.
- `SUPABASE_STORAGE_BUCKET`: `pqrs-evidencias`.

### Resend

- `RESEND_API_KEY`: API key privada.
- `RESEND_FROM_EMAIL`: remitente con dominio verificado, por ejemplo `PQRS Services <notificaciones@tu-dominio.com>`.

### Mercado Pago

- `MERCADO_PAGO_ACCESS_TOKEN`: token de produccion `APP_USR-...` cuando el negocio este listo para cobrar real.
- `MERCADO_PAGO_WEBHOOK_SECRET`: secret signature del webhook. Requiere URL publica.

### Cron de mora

- `CRON_SECRET`: string aleatorio propio. Vercel lo agrega automaticamente como header `Authorization: Bearer <CRON_SECRET>` en las llamadas a cron **solo si la variable se llama exactamente asi**. Protege `/api/cron/overdue-rules`.

## 2. Supabase

1. Crear proyecto Supabase.
2. Copiar Connection string de Transaction Pooler para `DATABASE_URL`.
3. Copiar Direct Connection para `DIRECT_URL`.
4. Crear bucket `pqrs-evidencias` en Storage.
5. Mantener el bucket privado.
6. Usar `SUPABASE_SERVICE_ROLE_KEY` solo en servidor/Vercel.
7. Ejecutar migraciones:

```bash
npm run db:migrate:deploy
```

## 3. Resend

1. Comprar o conectar dominio.
2. Verificar DNS en Resend.
3. Crear API key.
4. Configurar `RESEND_FROM_EMAIL` con el dominio verificado.
5. Probar flujo de recuperacion de clave y notificaciones de PQRS.

Mientras no exista dominio verificado, los correos pueden fallar en produccion. No bloquear el deploy tecnico por esto si el release es privado, pero no activar clientes reales sin correo validado.

Ademas del dominio, el envio de correos solo ocurre si el flag `transactionalEmailEnabled` esta activo en Configuracion de la plataforma (Platform Settings). Confirmar que este encendido antes de anunciar — si no, invitaciones y confirmaciones no salen aunque Resend este bien configurado.

## 4. Mercado Pago

1. Completar datos de cuenta de Mercado Pago.
2. Usar token `TEST-...` para pruebas y `APP_USR-...` para produccion.
3. Confirmar que la cuenta tenga habilitado el producto **"Suscripciones" (preapproval)** — no todas las cuentas nuevas lo traen activo; si el primer intento de pago falla en la API, revisar esto primero con soporte de Mercado Pago.
4. Cuando exista dominio publico, configurar webhook:

```text
https://TU-DOMINIO.com/api/billing/mercado-pago/webhook
```

Eventos a activar: `Suscripciones` (preapproval) y `Pagos`.

5. Copiar el secret signature en `MERCADO_PAGO_WEBHOOK_SECRET`.
6. Validar el flujo real: un admin recien invitado paga desde `/admin/licencias` (o la pantalla de bloqueo), el webhook activa la suscripcion, y el cobro automatico (`auto_recurring`) se repite el mes siguiente sin intervencion.
7. Validar que el webhook actualice suscripcion, tenant y pagos.

## 5. Cron de mora (Vercel Cron)

- `vercel.json` define un cron diario que llama `/api/cron/overdue-rules` para pasar conjuntos vencidos a mora y luego a suspendido.
- En el plan **Hobby** de Vercel los cron jobs estan limitados a una ejecucion diaria (ya es lo configurado). Mas frecuencia requiere plan Pro.
- Verificar en Vercel > Project > Cron Jobs que aparece programado tras el primer deploy, y revisar el log de la primera corrida.
- Prueba manual: adelantar `currentPeriodEnd` de una suscripcion de prueba a una fecha pasada y confirmar que el cron la mueve a `GRACE_PERIOD` y despues a `SUSPENDED`.

## 6. Vercel

1. Importar `PaginasWebDavid/PQRS_SaaS` en Vercel.
2. Framework preset: Next.js.
3. Build command: `npm run build`.
4. Install command: `npm install`.
5. Output directory: dejar vacio/default.
6. Agregar variables de entorno.
7. Ejecutar deploy.
8. Si el deploy no ejecuta migraciones automaticamente, correr localmente:

```bash
npm run db:migrate:deploy
```

## 7. Checklist pre-release

Ejecutar antes de publicar:

```bash
npm run release:check
npm run db:migrate:deploy
```

Validar manualmente:

- Login super admin.
- Crear tenant.
- Crear usuario admin/residente.
- Login admin/residente.
- Crear PQRS.
- Subir foto/evidencia a Supabase Storage.
- Ver dashboard.
- Exportar reportes.
- Suspender tenant y confirmar bloqueo.
- Reactivar tenant.
- Crear suscripcion Mercado Pago.
- Probar webhook cuando exista URL publica.
- Probar correo cuando Resend tenga dominio verificado.
- Crear tenant nuevo y confirmar que el admin recibe correo de invitacion (no clave temporal).
- Completar onboarding sin pagar y confirmar que la pantalla de bloqueo "Activa tu licencia" aparece en todas las paginas admin.
- Pagar con Mercado Pago y confirmar que la licencia pasa a activa automaticamente.
- Desactivar renovacion automatica y confirmar que al vencer el periodo sin pago entra en mora.
- Confirmar que el cron de mora corre (ver seccion 5).

## 8. Estado actual de release

- Supabase PostgreSQL: listo si `DATABASE_URL` y `DIRECT_URL` apuntan al proyecto correcto.
- Supabase Storage: listo si existe bucket privado `pqrs-evidencias`.
- Mercado Pago: token configurado, webhook pendiente hasta tener dominio publico.
- Resend: pendiente hasta comprar/verificar dominio.
- Vercel: pendiente de conectar proyecto y cargar variables en el dashboard.