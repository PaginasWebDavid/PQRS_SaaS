# Plan de correccion priorizado

## Fase A - Bloqueantes y seguridad

1. SA-001: crear una transicion transaccional unica para estado Tenant/Subscription.
   - Archivos: `tenant-admin.service.ts`, `billing.service.ts`, `mercado-pago.service.ts`.
   - Criterio: renovar/reactivar/suspender/cancelar deja ambos estados coherentes y el ADMIN obtiene acceso esperado.
2. SA-002 y SA-015: validar acciones con Zod y rechazar intervalos superpuestos/unidades no positivas.
   - Archivos: `super-admin/route.ts`, `billing.service.ts`, nuevo schema de dominio si existe patron.
   - Pruebas: limites, infinito, solape, `NaN`, negativo, email invalido.

## Fase B - Integridad funcional

1. SA-003: al cambiar unidades, definir politica y actualizar snapshot/precio de suscripcion en transaccion.
2. SA-005: cargar detalle real por `tenantId`; mostrar conteo abierto filtrado, telefono real, usuarios, PQRS, licencia, pagos y actividad.
3. SA-004: corregir definiciones y etiquetas de MRR/ingreso/historico.
4. SA-006: crear consulta global paginada de usuarios con filtros por conjunto, rol y estado.
5. SA-007: validar paginacion y 404 para tenant inexistente.

## Fase C - Rendimiento

1. SA-010: mutaciones optimistas y revalidacion localizada; botones con pending.
2. SA-011: endpoints separados por modulo, cache/invalida datos estables, agregados en DB, paginacion de soporte/auditoria.
3. Instrumentar duracion de Prisma, `auth()` y servicios externos en Vercel antes/despues.

## Fase D - Consistencia y mantenibilidad

1. SA-008: pasar usuario real al shell, eliminar avatar/nombre hardcodeado.
2. SA-009: extraer submodulos del componente sin cambiar contratos.
3. SA-012: resolver lint y desbloquear build; liberar el proceso que mantiene bloqueado Prisma antes de rerun.
4. SA-013: reparar UTF-8 de archivos afectados.
5. SA-014: suite SUPER_ADMIN completa.

Orden recomendado: A1 -> A2 -> B1 -> B2 -> B3 -> C1 -> C2 -> D. Cada cambio debe incluir prueba de rol, persistencia y regresion del panel.
