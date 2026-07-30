# FASE C7B - Informe de implementacion de la capa comercial

Fecha: 2026-07-29

Estado de este documento: final.

## 1. Diagnostico final

La aplicacion ya tenia una base tecnica solida para tenants, suscripciones, pagos, auditoria, outbox y autorizacion, pero mezclaba el estado de acceso con el recorrido comercial. Tambien asumía que cualquier pago aprobado era una mensualidad y que Reservas y Pagos de residentes estaban disponibles para todos los conjuntos.

La fase agrega una capa comercial separada y operable desde Super Admin. Un piloto pago ya no usa `TRIAL`: nace pendiente de pago, se activa por 45 dias al confirmar una transferencia y conserva una ficha comercial auditable hasta su conversion o cierre.

## 2. Arquitectura elegida

- `Tenant` conserva identidad, unidades y estado tecnico.
- `Subscription` conserva acceso, periodo y terminos economicos vigentes.
- `TenantCommercialProfile` es la fuente 1:1 del estado comercial.
- `CommercialOperation` conserva idempotencia semantica por tenant y `operationId`.
- `TenantFeatureEntitlement` controla Reservas y Pagos por conjunto.
- `Payment` incorpora concepto, snapshots, descuento, actor, referencia manual y `operationId`.
- `PricingRule.type` separa reglas `MONTHLY` y `PILOT`.
- Las operaciones comerciales usan transacciones serializables, advisory locks, comparacion de payload y reintentos acotados solo para `P2034`.
- El timeout interactivo comercial se fija en 60 segundos para tolerar la latencia de PostgreSQL remoto sin ocultar errores de dominio.

## 3. Migraciones y backfill

Se crearon dos migraciones aditivas:

1. `20260803000100_add_commercial_pilot_layer`
   - agrega enums, tablas, indices, conceptos y proveedor manual;
   - crea perfiles `LEGACY_REVIEW` para todos los tenants existentes;
   - no modifica suscripciones, acceso, pagos ni snapshots existentes;
   - activa `RESERVATIONS` solo si existen zonas o reservas reales;
   - activa `RESIDENT_PAYMENTS` solo si existen cargos, pagos o comprobantes reales;
   - deja los demas entitlements en `DISABLED`;
   - desactiva reglas historicas sin borrarlas y crea la politica reproducible vigente.
2. `20260803000200_allow_annual_commercial_discount`
   - permite 1000 bps en la ficha para representar el descuento anual fijo;
   - el servicio sigue limitando el descuento mensual comercial a 500 bps.

El runner protegido reporta 34 migraciones y ninguna pendiente en la base de pruebas. No se uso `prisma db push` ni se aplico produccion.

## 4. Ficha comercial

La ficha persiste estado comercial, fechas del piloto, precios congelados, siguiente accion, modalidad, periodo contratado, fundador, descuento, implementacion, referido, checklist tipado, metricas manuales acotadas y contacto principal.

Las correcciones posteriores usan lista blanca, validaciones por tipo, motivo obligatorio, `operationId` y auditoria. Los cambios de unidades de un fundador con proteccion vigente conservan el precio y el preapproval, y crean una siguiente accion de revision comercial auditada.

## 5. Precios

Reglas mensuales activas:

| Unidades | Precio COP |
| --- | ---: |
| 1-100 | 119.000 |
| 101-200 | 159.000 |
| 201-400 | 199.000 |
| 401-600 | 249.000 |

Reglas de piloto activas:

| Unidades | Precio COP |
| --- | ---: |
| 1-200 | 99.000 |
| 201-400 | 129.000 |
| 401-600 | 159.000 |

No existe rango automatico superior a 600. Ese caso exige ambos precios manuales, motivo, aprobador Super Admin y auditoria. Existe una validacion de reglas activas para detectar huecos, solapamientos, rangos antiguos y diferencias frente a la politica.

## 6. Pagos y analytics

Los conceptos son `PILOT`, `SUBSCRIPTION_MONTHLY`, `SUBSCRIPTION_ANNUAL`, `IMPLEMENTATION` y `COURTESY`; el proveedor manual es `MANUAL_TRANSFER`.

- `PILOT` e `IMPLEMENTATION` no incrementan MRR.
- `PILOT` y `COURTESY` no cuentan como mensualidades de un referido.
- Analytics y KPIs derivan conversion desde el estado comercial.
- Los snapshots conservan lista, descuento, efectivo, periodo, moneda y referencia.
- El pago manual nunca almacena binarios en auditoria.

El flujo mensual existente de Mercado Pago permanece disponible para renovaciones; no se agrego recurrencia anual automatica.

## 7. Piloto de 45 dias

La creacion desde Super Admin tiene cuatro pasos: datos, precios, alcance y confirmacion. Crea Tenant y Subscription en `PENDING_PAYMENT`, perfil en `PILOT_PENDING_PAYMENT`, categorias iniciales, precios congelados, entitlements y auditoria. No crea trial ni invitacion anticipada.

`Confirmar pago del piloto` valida estado y valor, crea un unico pago `PILOT`, activa acceso por exactamente 45 dias, guarda fechas explicitas, marca el checklist, audita y prepara la invitacion ADMIN mediante la infraestructura durable. Reintentar el mismo payload no duplica pago, dias ni invitacion.

`Iniciar piloto` exige los hitos obligatorios, registra uso real y no reinicia los 45 dias. Un lanzamiento tardio exige motivo. `Iniciar evaluacion` conserva metricas derivadas y permite registrar solo las metricas manuales previstas.

## 8. Conversion mensual

La accion calcula el precio efectivo, admite 0-5 % con motivo y vigencia, crea `SUBSCRIPTION_MONTHLY`, conserva el historial y activa un mes. Si el piloto sigue vigente, el periodo comienza al terminar esos 45 dias; si ya vencio, comienza en la fecha de pago. La operacion es idempotente y no permite dos pagos o periodos superpuestos.

## 9. Conversion anual

La accion manual calcula lista mensual por 12, aplica exactamente 10 %, rechaza descuento adicional, crea `SUBSCRIPTION_ANNUAL` y cubre doce meses calendario. No usa cortesia ni recurrencia Mercado Pago.

## 10. Descuentos

El descuento comercial solo aplica a mensualidad, maximo 500 bps, con motivo, inicio, fin y aprobador. Lista y efectivo quedan separados. La anualidad usa 1000 bps fijos y no acumula descuentos.

## 11. Fundadores

Los primeros diez clientes convertidos reciben ordinal unico y estable, fecha, doce meses de proteccion e implementacion `FOUNDER_WAIVED`. La asignacion usa lock global y transaccion serializable; dos conversiones por el ultimo cupo producen exactamente un fundador numero 10. Cancelar no libera el ordinal.

## 12. Referidos

El referido mensual pasa de pendiente a elegible solo tras el segundo pago mensual aprobado y unico. El valor elegible es esa mensualidad neta. Piloto y cortesia no cuentan. El anual queda en `MANUAL_REVIEW`. Super Admin registra pago manual de comision con fecha y referencia, sin transferencia automatica.

## 13. Implementacion

Se registran tipo, lista, efectivo, estado y fechas. Los fundadores muestran valor de lista y efectivo cero. No se construyo un gestor de proyectos ni facturacion contable.

## 14. Entitlements

`RESERVATIONS` y `RESIDENT_PAYMENTS` admiten `DISABLED`, `SETUP`, `ACTIVE` y `SUSPENDED`. El control existe en navegacion, layouts, APIs y servicios de lectura/escritura para ADMIN, CONSEJO y RESIDENTE. El acceso directo deshabilitado responde de forma controlada y nunca borra datos. Super Admin puede cambiar estado, motivo y precio opcional con idempotencia y auditoria.

## 15. Super Admin

El detalle del conjunto incorpora resumen comercial, estados tecnico/comercial, precios, fechas, fundador, implementacion, referido, checklist, metricas y add-ons. Desde alli se puede confirmar pago, actualizar hitos, iniciar piloto/evaluacion, convertir, extender excepcionalmente, cancelar, corregir la ficha, administrar implementacion, entitlements y comision.

El alta comercial muestra los cuatro pasos y no afirma que el correo fue enviado antes de confirmar el pago. El administrador de precios permite distinguir reglas mensuales y de piloto. El dashboard usa ingresos mensuales reales, no pagos de piloto.

## 16. ADMIN, CONSEJO y RESIDENTE

- ADMIN ve en Licencias el piloto, su vigencia, precio posterior y alcance contratado; no se le ofrece pago mensual durante el piloto.
- CONSEJO solo ve modalidad, vigencia y funciones contratadas, sin descuentos, comisiones, referidos ni notas internas.
- RESIDENTE solo recibe entitlements para filtrar navegacion y proteger rutas; no recibe informacion comercial interna.
- Ninguno de estos roles puede ejecutar acciones comerciales, confirmar pagos, cambiar precios, asignar fundador o activar add-ons.

## 17. Seguridad e idempotencia

- Las acciones mutables del endpoint comercial exigen `SUPER_ADMIN` y tenant objetivo explicito.
- El servidor recalcula precios y no confia en valores derivados de la UI.
- Cada operacion persiste hash del payload y resultado; el mismo ID con datos distintos falla de forma controlada.
- Pagos tienen unicidad por tenant y `operationId`; fundadores tienen ordinal unico 1-10.
- Auditoria guarda actor, tenant, accion, recurso y metadata acotada.
- No se agregaron secretos, credenciales, comprobantes binarios ni datos reales.
- Las carreras cubren pago, conversion, ultimo fundador, cancelacion y entitlement.

## 18. Pruebas focalizadas

Se declararon 73 pruebas PostgreSQL de la fase. Cubren ficha/piloto, pagos/precios/conversion, fundadores/implementacion/referidos, entitlements y dos smoke tests multi-tenant.

Evidencia final:

- `npm test -- tests/commercial-layer-integration.test.ts`: 73/73, sin fallos, omisiones ni cancelaciones.
- La ejecucion aislada duro 673.875 ms e incluyo concurrencia real sobre pago, conversion, ultimo cupo fundador, conversion contra cancelacion y entitlements.
- 40/40 pruebas historicas de Pagos permanecen verdes con entitlement explicito en fixtures.
- 43/43 pruebas historicas de Reservas permanecen verdes con entitlement explicito en fixtures.

Resultado final de la fase: `73/73 VERIFICADAS EN UNA SOLA EJECUCION AISLADA`.

## 19. Suite integral

La validacion definitiva se ejecuto una sola vez con los archivos serializados y sin procesos concurrentes:

- `npm test`: 806/806.
- Fallos: 0.
- Canceladas: 0.
- Omitidas: 0.
- Duracion: 1.897.251 ms.

El runner usa la URL directa protegida de pruebas, serializa archivos y mantiene las carreras internas de cada suite. Tambien adquiere un lock exclusivo por workspace para impedir que dos ejecuciones del mismo repositorio muten simultaneamente la base de pruebas.

Validaciones ya verdes:

- `npm run test:db:deploy`: 34 migraciones, ninguna pendiente.
- `npx prisma generate`: correcto.
- `npx prisma validate`: schema valido.
- `npx tsc --noEmit`: correcto.
- `npm run lint`: sin warnings ni errores.
- `git diff --check`: sin errores; solo avisos locales de conversion LF/CRLF.

## 20. Riesgos restantes

1. Las migraciones solo se aplicaron a la base protegida de pruebas; produccion requiere ventana, respaldo y verificacion previa.
2. No se enviaron correos reales ni se hicieron cobros reales, por instruccion de la fase.
3. La confirmacion del pago piloto y la anualidad son operaciones manuales por transferencia.
4. La operacion comercial depende de latencia de base remota; existe timeout explicito y reintento acotado para conflictos serializables, pero debe monitorearse en pilotos.
5. Los conjuntos migrados quedan en `LEGACY_REVIEW` y requieren clasificacion humana.
6. La cotizacion de mas de 600 unidades y la comision anual permanecen en revision manual deliberada.
7. Otra sesion creo durante la validacion el commit `31a34c4 feat(commercial): add pilot commercial layer with entitlements and pricing`. Esta sesion no hizo commit, amend, push ni tag y no altero ese commit externo.

Ninguno de estos riesgos bloquea el piloto controlado una vez completado el runbook y la validacion final.

## 21. Archivos modificados

### Datos y migraciones

- `prisma/schema.prisma`
- `prisma/migrations/20260803000100_add_commercial_pilot_layer/migration.sql`
- `prisma/migrations/20260803000200_allow_annual_commercial_discount/migration.sql`

### Dominio y servicios

- `src/domains/commercial/commercial-policy.ts`
- `src/domains/commercial/commercial-transaction.ts`
- `src/domains/commercial/commercial.service.ts`
- `src/domains/commercial/entitlement.service.ts`
- `src/domains/billing/billing.service.ts`
- `src/domains/billing/mercado-pago.service.ts`
- `src/domains/billing/precedence.ts`
- `src/domains/payments/payment-import.service.ts`
- `src/domains/payments/payment-security.ts`
- `src/domains/payments/payment.service.ts`
- `src/domains/reservations/reservation-security.ts`
- `src/domains/reservations/reservation.service.ts`
- `src/domains/platform/analytics.service.ts`
- `src/domains/platform/platform-stats.service.ts`
- `src/domains/platform/super-admin.service.ts`
- `src/domains/platform/tenant-admin.service.ts`

### API y UI

- `src/app/api/platform/super-admin/route.ts`
- `src/app/api/me/route.ts`
- rutas API de `pagos` y `reservas`
- `src/app/(protected)/super-admin/page.tsx`
- `src/app/admin/licencias/page.tsx`
- `src/app/consejo/page.tsx`
- layouts de `reservas` y `pagos` para ADMIN, CONSEJO y RESIDENTE
- `src/components/commercial/CommercialTenantPanel.tsx`
- `src/components/commercial/ContractedScopeSummary.tsx`
- `src/components/commercial/FeatureGate.tsx`
- `src/components/shell/AdminShell.tsx`
- `src/components/shell/ResidentShell.tsx`

### Pruebas y documentacion

- `scripts/run-tests.ts`
- `tests/commercial-layer-integration.test.ts`
- `tests/payment-integration.test.ts`
- `tests/reservation-integration.test.ts`
- `tests/super-admin-phase-a.test.ts`
- documentos 03 y 04 de esta carpeta.

## Runbook para un entorno real

1. Respaldar la base y confirmar que el despliegue apunta al proyecto correcto.
2. Ejecutar migraciones con `prisma migrate deploy`; nunca usar `db push`.
3. En Super Admin, validar reglas activas `MONTHLY` y `PILOT`: moneda, rangos, huecos y solapamientos.
4. Revisar cada perfil `LEGACY_REVIEW` sin cambiar su acceso ni precio contratado.
5. Crear el piloto desde el flujo comercial y comprobar datos, precios, implementacion y alcance antes de confirmar.
6. Para mas de 600 unidades, registrar ambos precios, motivo y aprobacion explicita.
7. Confirmar la transferencia con valor, fecha, referencia y un `operationId` nuevo.
8. Verificar pago `PILOT`, acceso de 45 dias, auditoria e invitacion ADMIN durable.
9. Configurar add-ons: `SETUP` durante preparacion y `ACTIVE` solo al estar listos.
10. Completar checklist; iniciar piloto sin alterar `pilotAccessEndsAt`.
11. En la etapa final, registrar evaluacion, siguiente accion y fecha.
12. Convertir a mensual o anual verificando lista, descuento, efectivo y periodo sin solapamiento.
13. Corregir datos solo mediante la accion comercial con motivo; nunca editar filas manualmente.
14. Revisar `AuditLog`, pagos, operaciones comerciales y outbox antes de declarar el piloto operativo.

## 22. Estado final

`IMPLEMENTADO`

Esta sesion no hizo commit, amend, push ni tag. El commit visible en `HEAD` (`31a34c4`) fue creado por otra sesion concurrente durante la validacion. No se inicio otra fase.
