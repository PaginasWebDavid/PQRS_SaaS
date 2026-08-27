# PQRS Services

Plataforma web multi-conjunto para gestionar PQRS, trazabilidad administrativa, reportes y módulos operativos de propiedad horizontal.

PQRS Services reúne en una sola aplicación la experiencia de residentes, administración, consejo y operación de la plataforma. Cada conjunto comparte infraestructura y código, pero conserva aislamiento de datos, usuarios, archivos y procesos.

## Estado del proyecto

El producto incluye flujos funcionales de autenticación por invitación, gestión PQRS, reportes, licenciamiento, Wompi, notificaciones, auditoría, reservas y pagos de residentes.

Antes de una salida comercial definitiva deben completarse las variables de producción, validar webhooks y cron, revisar los documentos legales con abogado y contador, y ejecutar la verificación de release.

## Capacidades

| Área | Funcionalidad |
| --- | --- |
| PQRS | Radicación, categorías configurables, prioridad, responsable, primer contacto, fases, cierre, correcciones, evidencias e historial |
| Usuarios | Invitaciones individuales y masivas, membresías multi-conjunto, roles, activación y revocación |
| Reportes | Indicadores reales, filtros, comparativos y exportación PDF/Excel |
| Comunicaciones | Notificaciones internas, Resend, EmailLog y outbox idempotente para eventos económicos |
| Licencia SaaS | Estados de acceso, gracia, suspensión, pagos manuales, Wompi, mensualidad, anualidad y renovación automática |
| Operación comercial | Piloto guiado, precios, conversión, fundadores, implementación, referidos y add-ons |
| Reservas | Zonas comunes, disponibilidad, bloqueos, solicitudes, aprobación y cancelación |
| Pagos de residentes | Cargos, pagos, comprobantes, revisión, reversos, importación y cartera |
| Plataforma | Conjuntos, analítica, soporte, configuración segura, auditoría y exportación acotada |

Reservas y Pagos de residentes son módulos opcionales. Su acceso se controla con entitlements tanto en navegación como en layout, API y servicio.

## Roles

### SUPER_ADMIN

Opera PQRS Services como negocio:

- resumen global y KPIs;
- alta, búsqueda, detalle, suspensión, reactivación, cancelación y exportación de conjuntos;
- licencias, pagos, mora, cortesías y renovaciones;
- reglas de precio y topes;
- ficha comercial, pilotos, implementación, referidos y módulos contratados;
- analítica global;
- usuarios globales;
- auditoría;
- soporte;
- estado seguro de integraciones y configuración;
- perfil y contraseña.

### ADMIN

Administra únicamente su conjunto:

- dashboard operativo;
- ciclo completo de PQRS;
- usuarios e invitaciones;
- categorías y workflow;
- reportes PDF/Excel;
- actividad y soporte;
- licencia y pagos de PQRS Services;
- reservas, si están contratadas;
- cartera de residentes, si está contratada;
- configuración autorizada y cuenta personal.

ADMIN no puede crear SUPER_ADMIN, modificar precios globales ni consultar otro conjunto.

### CONSEJO

Supervisa su conjunto en modo lectura:

- PQRS, detalle, evidencias e historial;
- indicadores y exportaciones;
- actividad;
- reservas y cartera agregada cuando los módulos están activos;
- cuenta y soporte.

CONSEJO no crea, edita, cierra ni reasigna PQRS y no administra usuarios, licencia o configuración.

### RESIDENTE

Opera sobre su propia información:

- crea y sigue sus solicitudes;
- edita una PQRS mientras administración no haya iniciado gestión;
- consulta timeline, respuestas, evidencia y cierre;
- recibe y marca notificaciones;
- reserva zonas y cancela reservas propias cuando el módulo está activo;
- consulta cargos y carga comprobantes cuando Pagos está activo;
- gestiona perfil, avatar, contraseña y soporte.

Un residente no puede consultar solicitudes, reservas, pagos o archivos de otra membresía.

## Flujos principales

### Alta por invitación

1. SUPER_ADMIN crea el conjunto o confirma el hito comercial correspondiente.
2. Se invita al ADMIN principal.
3. ADMIN invita a otros usuarios de su conjunto, individualmente o por lote.
4. El destinatario abre el enlace, define contraseña y acepta la versión legal vigente.
5. El servidor consume el token una sola vez y crea o asocia la membresía con tenant y rol definidos.
6. ADMIN y RESIDENTE completan onboarding antes de entrar a su experiencia.

No existe autorregistro público.

### PQRS

1. RESIDENTE o ADMIN radica.
2. ADMIN confirma primer contacto y clasifica.
3. La solicitud entra en gestión.
4. ADMIN avanza el workflow y agrega notas o evidencia.
5. ADMIN cierra con resultado.
6. RESIDENTE y CONSEJO ven la trazabilidad permitida.
7. Los cambios generan historial, auditoría y comunicaciones.

### Pago de la licencia

1. ADMIN abre Licencias y pagos.
2. Elige mensual o anual anticipado.
3. El servidor recalcula el precio; el cliente no controla el monto.
4. Wompi recibe una referencia e integridad firmadas.
5. El webhook valida firma, referencia, monto, moneda y estado.
6. Solo un pago APPROVED aplica cobertura.
7. Un rechazo queda visible como REJECTED.
8. La renovación automática usa una fuente tokenizada y un cron autorizado.

El plan anual cobra doce meses con 10 % de descuento. La periodicidad de cobro no reemplaza el plazo del contrato comercial.

### Módulos opcionales

- Reservas: RESIDENTE solicita, ADMIN revisa y CONSEJO consulta.
- Pagos de residentes: ADMIN gestiona cartera, RESIDENTE consulta y aporta comprobantes, CONSEJO ve agregados.

No deben confundirse Pagos de residentes y Licencias y pagos: el primero corresponde a la cartera del conjunto y el segundo a la suscripción de PQRS Services.

## Arquitectura

| Componente | Tecnología |
| --- | --- |
| Aplicación | Next.js 14 App Router |
| Lenguaje | TypeScript |
| UI | React 18, Tailwind CSS y componentes propios |
| Autenticación | NextAuth/Auth.js con credenciales y JWT |
| API | Route Handlers de Next.js |
| Dominio | Servicios por área en src/domains |
| ORM | Prisma 5 |
| Datos | Supabase PostgreSQL |
| Archivos | Supabase Storage privado |
| Email | Resend |
| Pagos | Wompi y transferencias manuales confirmadas |
| Reportes | ExcelJS, jsPDF y jspdf-autotable |
| Hosting | Vercel |

### Estructura

    prisma/
      migrations/        Migraciones aditivas
      schema.prisma      Modelo de datos
      seed.ts            Usuario inicial y datos controlados
    src/
      app/               Páginas y Route Handlers
      components/        Shells, UI y componentes comerciales
      domains/           Reglas de negocio y acceso a datos
      lib/               Auth, autorización, diseño, email, Storage y utilidades
    tests/
      unit/              Pruebas puras y de wiring
      *.test.ts          Integración PostgreSQL
    docs/
      programa-mejora/   Contexto canónico y evidencia histórica
      legal/             Borradores contractuales
    scripts/             Runner de pruebas y utilidades controladas

## Seguridad

- tenant y rol resueltos desde sesión y membresía activa;
- autorización centralizada y validación adicional en cada dominio;
- cookie firmada para selección multi-conjunto;
- contraseñas con bcrypt;
- tokens de invitación y recuperación guardados como hash;
- sessionVersion para revocación;
- Storage privado con validación de tenant, propietario y tipo real;
- firma de webhooks;
- idempotencia, locks y transacciones en efectos económicos;
- outbox durable para notificación y correo;
- auditoría con metadata saneada;
- RLS como defensa adicional en PostgreSQL;
- cabeceras contra clickjacking, MIME sniffing y filtración de referrer;
- secretos exclusivos de servidor.

Ocultar un botón no constituye autorización. Las APIs rechazan acceso cruzado por URL, query, cuerpo o ID manipulado.

## Requisitos

- Node.js 20.6 o superior;
- npm;
- PostgreSQL/Supabase;
- proyecto Supabase con bucket privado;
- cuenta Resend;
- comercio Wompi;
- proyecto Vercel para producción.

## Desarrollo local

1. Instalar dependencias:

       npm install

2. Crear el entorno local:

       copy .env.example .env

3. Completar las variables requeridas sin copiar credenciales a documentación o commits.

4. Aplicar migraciones y generar Prisma Client:

       npm run db:migrate:deploy
       npx prisma generate

5. Iniciar en el puerto acordado para desarrollo:

       npm run dev -- -p 3002

6. Abrir:

       http://localhost:3002

## Variables de entorno

La plantilla completa vive en [.env.example](.env.example). Grupos principales:

- base de datos: DATABASE_URL y DIRECT_URL;
- Auth.js: NEXTAUTH_SECRET, NEXTAUTH_URL y APP_URL;
- seed: SUPER_ADMIN_EMAIL y SUPER_ADMIN_PASSWORD;
- Storage: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_STORAGE_BUCKET;
- correo: RESEND_API_KEY y RESEND_FROM_EMAIL;
- Wompi Sandbox y Producción;
- cron: CRON_SECRET;
- identidad legal pública: NEXT_PUBLIC_LEGAL_*.

DATABASE_URL usa el pooler transaccional en Vercel. DIRECT_URL usa conexión directa para migraciones.

Nunca expongas SUPABASE_SERVICE_ROLE_KEY, llaves privadas de Wompi, secretos de eventos, RESEND_API_KEY o NEXTAUTH_SECRET.

## Base de datos

La base real no es desechable.

- producción usa npm run db:migrate:deploy;
- las migraciones deben ser aditivas y revisadas;
- nunca aceptar un reset propuesto por Prisma;
- nunca ejecutar prisma db push sobre Supabase productivo;
- hacer respaldo y confirmar el proyecto antes de migrar;
- usar exclusivamente la base protegida de pruebas para suites de integración.

## Scripts

| Comando | Uso |
| --- | --- |
| npm run dev | servidor local |
| npm run build | genera Prisma Client y compila Next.js |
| npm run start | sirve el build |
| npm run lint | ESLint |
| npm test | suite serializada |
| npm run release:check | valida Prisma y ejecuta build |
| npm run db:migrate | migración local controlada |
| npm run db:migrate:deploy | aplica migraciones existentes |
| npm run db:seed | crea o actualiza de forma idempotente el acceso inicial y el conjunto demo Calle 100, sin borrar datos |
| npm run db:seed:demo | reinicia los datos enriquecidos de Calle 100 solo en una base dedicada de demostración |
| npm run db:studio | Prisma Studio |

### Datos demo de Calle 100

`npm run db:seed` es seguro para usar en una base compartida: no elimina conjuntos, usuarios, PQRS ni pagos. Requiere `CALLE_100_DEMO_PASSWORD`, `SUPER_ADMIN_EMAIL` y `SUPER_ADMIN_PASSWORD`.

El reinicio completo del demo es destructivo y queda deliberadamente separado. Antes de ejecutarlo, configura una base exclusiva para demostración y declara las cuatro variables: `DATABASE_URL`, `DEMO_DATABASE_URL` (con el mismo valor de esa base exclusiva), `DEMO_DATABASE_MODE=calle-100` y `CONFIRM_DEMO_RESET=CALLE_100_DEMO`. Después ejecuta `npm run db:seed:demo`. Nunca uses este comando contra Supabase productivo.

Validación recomendada antes de release:

    npx prisma validate
    npx prisma generate
    npx tsc --noEmit
    npm run lint
    npm test
    npm run build

## Despliegue

1. Configurar todas las variables en Vercel para el entorno correcto.
2. Aplicar migraciones con migrate deploy.
3. Verificar dominio público en APP_URL y NEXTAUTH_URL.
4. Verificar dominio remitente de Resend.
5. Configurar en Wompi:

       https://TU-DOMINIO/api/billing/wompi/webhook

6. Confirmar CRON_SECRET y el cron diario definido en vercel.json.
7. Ejecutar release:check.
8. Probar login, invitación, evidencia privada, checkout aprobado/rechazado y renovación.

## Modelo comercial y legal

PQRS Services se contrata mediante propuesta, orden de servicio o contrato firmado. El plazo puede ser de uno o varios años y el pago puede ser mensual manual, mensual automático o anual anticipado con 10 % de descuento.

Las páginas públicas son:

- /legal/terminos;
- /legal/privacidad;
- /legal/cookies;
- /legal/pagos.

La versión legal actual es 3.0. Distingue el contrato firmado de la aceptación personal de una cuenta, regula no renovación y terminación anticipada, y aclara que el PDF descargable es un comprobante operativo, no una factura electrónica.

Los borradores contractuales están en docs/legal/contratos y requieren revisión de abogado colombiano y contador antes de firma o publicación.

## Documentación

- [Contexto canónico de producto y negocio](docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md)
- [Índice de documentación](docs/README.md)
- [Guía de pruebas](docs/TESTING.md)
- [Contrato marco, borrador](docs/legal/contratos/Contrato_marco_servicios_PQRS_Services_BORRADOR.docx)
- [Acuerdo de referidos, borrador](docs/legal/contratos/Acuerdo_referidos_gestion_comercial_BORRADOR.docx)

Los documentos de programa-mejora registran auditorías, decisiones y validaciones históricas. El contexto canónico y el código actual prevalecen cuando un documento antiguo describe una fase ya superada.

## Límites conocidos

- el contrato firmado y sus anexos no se almacenan todavía en un modelo contractual dedicado;
- las comisiones multianuales y por renovación se controlan manualmente;
- el PDF de pago no es facturación DIAN;
- la firma contractual ocurre fuera de la aplicación;
- la operación productiva depende de variables, webhooks, cron, respaldos y monitoreo correctamente configurados.

## Licencia y uso

Repositorio privado de PQRS Services. No se autoriza redistribución, reventa, sublicencia ni uso de la marca o del código fuera de los acuerdos aplicables.
