# PQRS Services

PQRS Services is a web application for residential communities to manage resident requests, administrative workflows, reports, and optional community services. It is designed for multiple communities sharing one application while keeping their records and access separate.

In this project, **PQRS** refers to resident requests, complaints, claims, and suggestions. The application was designed for Colombia: its current interface is primarily Spanish, reservation times use `America/Bogota`, and Wompi billing uses Colombian pesos. English localization and U.S.-specific requirements are future work, not current capabilities.

## Current capabilities

The repository implements the following workflows. Availability and successful operation in any particular deployment depend on its configuration and verification.

| Area | Implemented functionality |
| --- | --- |
| Resident requests | Submission, configurable categories, assignment, first contact, workflow stages, closure, evidence, corrections, and history. |
| Accounts and access | Individual and bulk invitations, password setup, community memberships, role-based access, and account management. |
| Reporting | Request indicators, filters, comparisons, and PDF and Excel exports. |
| Notifications | In-app notifications, email through Resend, and an outbox for selected billing events. |
| Platform billing | Subscription and access states, manual payments, Wompi checkout, monthly and annual terms, and automatic renewal support. |
| Community operations | Optional common-area reservations and optional resident charges, payments, receipts, and imports. |
| Platform administration | Community management, pricing rules, audit records, support, and integration status. |

Common-area reservations and resident payments are optional modules controlled by community entitlements. Resident payments track a community's charges and receipts; they are separate from payments for the PQRS Services subscription.

## Roles

- `SUPER_ADMIN`: manages communities, subscriptions, platform settings, support, and global audit information.
- `ADMIN`: manages the assigned community, its requests, users, reports, and enabled modules.
- `CONSEJO`: community board role with supervisory, read-oriented access.
- `RESIDENTE`: creates and follows their own requests and uses enabled resident services.

The interface and API enforce role and community boundaries; those controls should be verified in the target environment before launch.

## Technology

Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, NextAuth/Auth.js, Prisma 5, PostgreSQL, Supabase Storage, Resend, Wompi, ExcelJS, and jsPDF. The deployment is designed for Vercel. The repository does not by itself verify the current status of any hosted environment.

## Local setup

Requirements: Node.js 20.6 or later, npm, and a dedicated PostgreSQL database. A Supabase project and private Storage bucket are needed for file features; Resend and Wompi require separate credentials for their respective features. Vercel is used for the intended hosted deployment.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` (`copy .env.example .env` on Windows or `cp .env.example .env` on macOS/Linux), then configure the values for your own environment. Never commit credentials.
3. Review the target database and migrations, then run `npm run db:migrate:deploy` and `npx prisma generate` on the dedicated development database.
4. Start the application with `npm run dev -- -p 3002` and open `http://localhost:3002`.

See [.env.example](.env.example) for database, authentication, Supabase Storage, Resend, Wompi, cron, and legal-information variables. Service-role keys, private keys, webhook secrets, and `NEXTAUTH_SECRET` must remain server-side.

## Demo and database safety

Demo screenshots use fictional data, some generated with AI assistance, and do not depict real residents. This statement applies to the screenshots, not to the contents of any external database or deployment.

`npm run db:seed` creates or updates the initial community and accounts; it does not delete communities or requests, but it can change existing roles and memberships. Review [prisma/seed.ts](prisma/seed.ts) before use. It requires `CALLE_100_DEMO_PASSWORD`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD`.

`npm run db:seed:demo` resets the Calle 100 demo and is destructive. Use it only against a dedicated demo database, after reviewing [prisma/seed-demo.ts](prisma/seed-demo.ts). It requires matching `DATABASE_URL` and `DEMO_DATABASE_URL`, `DEMO_DATABASE_MODE=calle-100`, `CONFIRM_DEMO_RESET=CALLE_100_DEMO`, and a demo password. The declarations do not independently prove that the selected database is safe; verify the target first.

Use a separate protected database for integration tests. Never accept a production database reset or run `prisma db push` against production. Review migrations and backups before applying changes to any database containing data you need to keep.

## Verification and deployment

Useful checks are `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`. Integration tests require the protected test-database configuration described in [docs/TESTING.md](docs/TESTING.md).

For deployment, configure environment variables, apply reviewed migrations, and verify the application URL, Storage, Resend, Wompi webhook, and authorized cron. [SALIDA-A-PRODUCCION.md](SALIDA-A-PRODUCCION.md) is a historical operational checklist; its statements about hosted services and prior test results require fresh verification.

## Documentation and future work

See [ROADMAP.md](ROADMAP.md) for planned Premium capabilities, verification criteria, estimates, privacy considerations, and U.S. localization decisions. The [product and business context](docs/programa-mejora/00-contexto/PQRS_SERVICES_NEGOCIO_ACTUAL.md) and [documentation index](docs/README.md) contain additional historical context. Legal drafts in `docs/legal/contratos` are Colombia-specific and require qualified review before use.

## License

The project code is available under the [MIT License](LICENSE). Third-party dependencies and bundled assets may have separate licenses and notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and review their terms independently.
