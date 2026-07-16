# Hallazgos de logica de negocio

## SA-001 - Estados de conjunto y suscripcion se desincronizan

- Severidad: Bloqueante. Ruta: Licencias y pagos / Conjuntos.
- Evidencia: `renewSubscriptionWithSimulatedPayment()` actualiza solo `Subscription.status = ACTIVE` en `src/domains/billing/billing.service.ts:153-178`; `updateTenantStatusForSuperAdmin()` actualiza solo `Tenant.status` en `src/domains/platform/tenant-admin.service.ts:205-211`.
- Contrato afectado: `isTenantAccessBlocked()` bloquea por ambos estados en `src/domains/organizations/tenant.service.ts:23-29`.
- Reproduccion: crear conjunto (`Tenant` y `Subscription` quedan `PENDING_PAYMENT`, lineas 120-141); renovar desde UI; suscripcion pasa a ACTIVE pero tenant conserva PENDING_PAYMENT y el ADMIN sigue bloqueado. Reactivar despues de suspension deja la suscripcion suspendida y tambien bloquea.
- Esperado: una transicion administrativa debe actualizar ambos estados atomicamente o tener una fuente unica de verdad.
- Solucion: centralizar `syncTenantStatusFromSubscription` y ejecutar una transaccion para renovar/suspender/reactivar/cancelar; agregar pruebas de acceso del ADMIN despues de cada transicion.

## SA-002 - Reglas de precio solapadas permitidas

- Severidad: Alta. Ruta: Reglas de precio.
- Evidencia: `assertValidPricingRule()` solo valida monotonia de precio, `billing.service.ts:365-391`; no calcula interseccion `[min,max]`. `calculatePriceForUnits()` usa `findFirst` ordenado por minimo (`49-58`).
- Reproduccion: con rango 1-100, crear 50-150 con precio no decreciente. Ambas reglas pasan y 75 toma la de menor minimo.
- Esperado: rechazar cualquier interseccion activa, incluido un rango abierto `maxUnits=null`.

## SA-003 - Editar unidades no recalcula licencia ni precio

- Severidad: Alta. Ruta: Editar conjunto.
- Evidencia: `updateTenantDetails()` modifica `Tenant.units` solamente (`236-260`). No actualiza `Subscription.unitsSnapshot` ni `priceCents`.
- Impacto: tarifa visible/calculada para futuros flujos puede no coincidir con la licencia cobrada.

## SA-004 - MRR no corresponde a su etiqueta

- Severidad: Alta. Ruta: Resumen.
- Evidencia: UI etiqueta `Ingresos MRR` con `billing.totalRevenueCents` (`page.tsx:811`), que en servicio es suma de todos los pagos aprobados (`billing.service.ts:231-262`). El widget lateral usa `monthlyRevenueCents` (`page.tsx:860`), que es cobro aprobado del mes, tampoco suma de precios recurrentes activos.
- Esperado: MRR = suma de `Subscription.priceCents` de licencias incluidas por politica; ingresos = pagos aprobados en periodo.

## SA-005 - Detalle del conjunto es un resumen incompleto y con cifras incorrectas

- Severidad: Alta. Ruta: Conjuntos > Ver detalle.
- Evidencia: el API admite `tenantId` y tiene `getTenantDetailForSuperAdmin()` (`super-admin.service.ts:7-44`, `tenant-admin.service.ts:47-92`), pero UI siempre llama overview sin parametro (`page.tsx:335-368`) y usa la fila de lista.
- Defectos: `pqrsOpen` se asigna a `_count.pqrs` total (`307-331`) y se presenta como "PQRS ABIERTAS" (`1787`); telefono queda fijo `'-'` (`324,1791`). No muestra usuarios, PQRS, pagos, actividad ni historial reales exigidos para el detalle.

## SA-015 - Validacion de entrada insuficiente en acciones globales

- Severidad: Media. Evidencia: route convierte valores con `Number(...)` sin esquema (`super-admin/route.ts:38-105`). Crear acepta unidades 0; `calculatePriceForUnits()` las normaliza a 1 (`billing.service.ts:49-69`) mientras guarda `Tenant.units=0` (`tenant-admin.service.ts:127`). `updateGraceDays` tampoco valida positivo en el backend global.
- Solucion: Zod por accion, limites y validacion de email/unicidad antes de la transaccion.
