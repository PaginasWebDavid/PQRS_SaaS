# Dashboard y analytics

## Fuentes reales

- KPIs de tenant/usuario/PQRS: `platform-stats.service.ts:3-23`.
- Billing: `billing.service.ts:199-269`.
- Graficas: `analytics.service.ts:20-156`.
- Actividad reciente: `AuditLog` real, ultimos 10 en `super-admin.service.ts:12-18`.

## SA-004 - KPIs financieros engañosos

`totalRevenueCents` es toda la historia de pagos aprobados pero se etiqueta "Ingresos MRR" (`page.tsx:811`). `monthlyRevenueCents` es pagos cobrados este mes y se usa como MRR lateral (`860`). Separar tres conceptos: MRR activo, ingresos cobrados del mes e ingresos historicos.

## SA-005 - PQRS abiertas por conjunto incorrectas

El dashboard global calcula abiertas correctamente como `total - closed` (`809`), pero detalle por conjunto usa total de PQRS como abiertas (`311,327,1787`).

## Observaciones de analytics

- Las series usan datos reales, pero cargan todos los pagos/PQRS de 6 meses y agrupan en memoria.
- `topTenantsByRevenue` ordena por `Subscription.priceCents`, que representa precio contratado, no ingresos pagados; el titulo debe reflejarlo.
- No hay filtro de fechas en UI/endpoint, pese a que las series usan seis meses fijos.
- Las zonas usan fecha local del servidor con `new Date`; documentar zona horaria de negocio para limites mensuales.
