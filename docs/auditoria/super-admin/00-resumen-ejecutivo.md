# Auditoria SUPER_ADMIN - Resumen ejecutivo

Fecha: 2026-07-15. Alcance: exclusivamente `/super-admin` y sus APIs globales. No se modifico codigo de producto.

## Estado general

**No listo para lanzamiento**. El panel renderiza, autentica y protege sus APIs, pero hay fallas de integridad en licencia/conjunto, reglas de precio y metricas comerciales que pueden producir accesos bloqueados despues de una renovacion, cobros ambiguos e indicadores equivocados.

Cobertura: 1 pagina SPA, 7 endpoints globales, 9 frentes de revision, 3 sesiones de rol, 26 pruebas existentes y validaciones de Prisma/TypeScript.

Hallazgos: 1 bloqueante, 4 altos, 6 medios, 4 bajos.

## Diez problemas prioritarios

1. **SA-001, bloqueante:** renovar, suspender o reactivar desde el panel no sincroniza `Tenant.status` y `Subscription.status`.
2. **SA-002, alta:** se permiten rangos de precio superpuestos; el calculo escoge arbitrariamente el rango de menor minimo.
3. **SA-003, alta:** editar unidades no recalcula ni actualiza la licencia/precio contratado.
4. **SA-004, alta:** el KPI rotulado MRR muestra ingreso historico total y el widget muestra cobro mensual, no MRR.
5. **SA-005, alta:** el detalle de conjunto no carga su endpoint de detalle; muestra PQRS abiertas equivocadas y telefono ficticio `-`.
6. **SA-006, media:** el modulo Usuarios no permite busqueda global ni filtros por rol/estado.
7. **SA-007, media:** paginacion invalida de auditoria genera HTTP 500; conjunto inexistente responde 200 con `null`.
8. **SA-008, media:** shell muestra por defecto `Sofia Pena` e iniciales `SP`, no la identidad de sesion.
9. **SA-010, media:** operaciones esperan una recarga completa de overview despues de cada mutacion; medicion local: 1.1-1.8 s por API.
10. **SA-012, media:** lint falla por tres imports sin usar; build no pudo completarse porque Prisma no puede reemplazar un binario bloqueado por un proceso local.

## Fortalezas verificadas

- Las APIs globales devolvieron 403 sin sesion, con ADMIN y con CONSEJO.
- SUPER_ADMIN obtuvo 200 en panel, overview, analytics, auditoria, usuarios de conjunto, soporte y configuracion general.
- Secretos no se devuelven por `platform/settings`; solo estado de configuracion.
- Auditoria, soporte, notificaciones y EmailLog usan servicios persistentes.
- Prisma valida y TypeScript compila. Las 26 pruebas existentes pasaron.

## Riesgo de lanzamiento

El mayor riesgo es comercial y operativo: un pago/renovacion manual puede dejar el conjunto en `PENDING_PAYMENT` o la suscripcion suspendida, por lo que el administrador sigue bloqueado aunque la interfaz confirme renovacion/reactivacion. El segundo riesgo es una tarifa ambigua por rangos solapados.

## Recomendacion

Ejecutar primero la Fase A del plan: sincronizacion transaccional de estados, validacion de rangos/unidades y pruebas de regresion para renovacion/reactivacion. No continuar con mejoras visuales antes de ello.
