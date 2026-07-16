# Checklist de regresion SUPER_ADMIN

## Acceso y permisos

- [x] Sin sesion no accede a APIs ni pagina.
- [x] ADMIN y CONSEJO reciben 403 en APIs globales.
- [x] SUPER_ADMIN accede a pagina y APIs.
- [ ] Probar UI de rol no onboarded y onboarding completo para descartar redireccion previa al guard.

## Conjuntos y licencias

- [ ] Crear conjunto con datos validos y verificar tenant, suscripcion, invitacion y auditoria.
- [ ] Rechazar nombre/email/unidades invalidas y slug duplicado.
- [ ] Renovar PENDING_PAYMENT y confirmar acceso ADMIN.
- [ ] Suspender y confirmar bloqueo.
- [ ] Reactivar y confirmar desbloqueo.
- [ ] Cancelar y verificar coherencia de tenant/suscripcion/auditoria.
- [ ] Editar unidades y verificar nueva tarifa/snapshot segun politica aprobada.

## Precios, metricas y detalle

- [ ] Rechazar intervalos superpuestos y abiertos incompatibles.
- [ ] Verificar MRR contra suma de suscripciones activas.
- [ ] Verificar ingresos contra pagos aprobados del periodo.
- [ ] Verificar PQRS abiertas por conjunto contra estado no TERMINADO.
- [ ] Ver detalle real con usuarios, PQRS, pagos, licencia y actividad.

## Operacion transversal

- [x] Auditoria y soporte se conectan a datos reales.
- [ ] Paginar auditoria con valores limite y adversos.
- [ ] Paginar/buscar soporte.
- [ ] Responder soporte y verificar notificacion, EmailLog, audit log y persistencia tras refresh.
- [ ] Verificar que flags de soporte/email afectan los flujos previstos.

## Calidad y release

- [x] `npx prisma validate`.
- [x] `npx tsc --noEmit -p tsconfig.json`.
- [x] `npm test` (26/26).
- [ ] `npm run lint` sin errores.
- [ ] `npm run build` sin bloqueo de Prisma.
- [ ] Repetir medicion de endpoints en build de produccion/Vercel.
