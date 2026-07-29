# FASE R1B - Revision adversarial, correccion y cierre

## Resultado

`CORREGIDO Y LISTO PARA COMMIT`

La implementacion R1 fue revisada de forma acotada y se corrigieron defectos pequenos y medios. No se encontro un defecto critico, una incompatibilidad estructural ni una migracion que requiriera rediseno.

## 1. Defectos encontrados

1. La extension de cortesia reutilizaba `SAAS_PAYMENT_APPROVED`, registraba proveedor `SIMULATED` y se mostraba como factura pagada, aunque no hubiera dinero.
2. Renovacion manual y cortesia no tenian una clave explicita de operacion; un reintento podia extender el periodo dos veces.
3. La UI de PQRS SIMPLE reutilizaba etiquetas de mantenimiento como "Inspeccion de campo", aunque su grafo `0 -> 1 -> 5` representa una gestion generica.
4. La exportacion XLSX eliminaba saltos de linea, pero no neutralizaba prefijos de formula (`=`, `+`, `-`, `@`, tabulador y retorno de carro).
5. Las categorias historicas de soporte no tenian una etiqueta compartida y legible en todas las vistas.
6. La vista ADMIN de ayuda tenia un render defectuoso del creador del ticket.
7. Las APIs de soporte devolvian mensajes internos sin lista blanca y el email de respuesta interpolaba HTML controlado por usuarios.
8. La UI permitia dobles clics y no conservaba la clave de una renovacion/cortesia ante un resultado de red ambiguo.

## 2. Correcciones

- Se agregaron `PaymentProvider.COURTESY` y `BillingOutboxEventType.COURTESY_EXTENSION_GRANTED` mediante una migracion aditiva.
- Cortesia usa contenido explicito de extension sin cobro y se excluye de ingresos/pagos aprobados.
- Renovacion manual y cortesia usan `operationId`, referencia externa estable y bloqueo transaccional por operacion.
- La interfaz conserva la misma clave durante reintentos ambiguos y bloquea dobles clics.
- ADMIN y SUPER_ADMIN distinguen `Mercado Pago`, `Pago manual` y `Cortesia`; la cortesia aparece como `Sin cobro`.
- Se centralizaron las etiquetas de fases PQRS y categorias de soporte.
- Se centralizo la neutralizacion de celdas y del nombre de archivo XLSX.
- Se escaparon nombre, asunto y respuesta en el HTML de soporte; fallos inesperados devuelven un 500 generico.

## 3. Pagos y cortesias

- `SAAS_PAYMENT_APPROVED` y `SAAS_PAYMENT_REJECTED` siguen usando outbox durable dentro de la transaccion economica.
- `PENDING` no genera rechazo definitivo.
- Solo se crean intenciones para ADMIN con usuario y membresia activos del tenant.
- Webhooks repetidos, pagos manuales repetidos y cortesias repetidas no duplican efectos ni filas por destinatario/canal.
- Una cortesia crea `COURTESY_EXTENSION_GRANTED`, nunca `SAAS_PAYMENT_APPROVED`.
- Reactivar un conjunto no crea pagos ni nuevas notificaciones economicas.

## 4. Workflow PQRS

- `MAINTENANCE` conserva `0 -> 1`, `1 -> 2|3`, `2|3 -> 4`, `4 -> 5`.
- `SIMPLE` conserva `0 -> 1 -> 5`; la fase 1 ahora se presenta inequívocamente como `En gestion` y la fase 5 como `Gestion completada`.
- Primer contacto permanece como accion separada anterior a la gestion.
- Los snapshots de casos existentes no cambian al modificar la configuracion del conjunto.
- ADMIN configura su tenant; el cliente no define el snapshot al crear la PQRS.

## 5. Soporte

- RESIDENTE y CONSEJO solo crean categorias tecnicas y ven sus propios tickets.
- ADMIN ve todos los tickets de su conjunto, identifica al creador, puede usar `BILLING` y permanece en solo lectura.
- SUPER_ADMIN conserva cola global, filtro por conjunto, respuesta y cierre.
- `TECNICO`, `FACTURACION`, `CUENTA` y `OTRO` siguen listandose con etiqueta legible. Se probo respuesta y cierre de una fila historica.

## 6. Exportacion

- La ruta sigue restringida a SUPER_ADMIN y obtiene el target exclusivamente del path.
- El archivo no incluye passwords, hashes, tokens, `sessionVersion`, rutas privadas, URLs firmadas, buckets ni auditoria completa.
- Todos los textos exportados controlables se neutralizan antes de escribir el XLSX.
- El nombre de archivo elimina CRLF y caracteres no permitidos.
- El conteo se verifica antes de cargar filas y el exceso devuelve error controlado.
- Se verifico que exportar un conjunto no incluya datos de otro.

## 7. Reactivacion

- SUSPENDED y CANCELLED pueden iniciar reactivacion desde la UI.
- El backend exige evidencia de acceso vigente y conserva la misma suscripcion.
- Se probaron: evidencia vigente, evidencia ausente, suscripcion ausente y cortesia expirada.
- Un fallo conserva `CANCELLED`; el exito limpia `cancelledAt` y registra `TENANT_REACTIVATED`.

## 8. Pruebas y validaciones

- Unitarias focales: 29 aprobadas (17 de outbox/contenido y 12 de workflow, soporte y exportacion).
- Integracion PostgreSQL R1: 29/29 aprobadas.
- `npx prisma generate`: correcto.
- Migracion aplicada mediante `npm run test:db:deploy`: correcta.
- `npx prisma validate`: correcto.
- `npx tsc --noEmit`: correcto.
- `npm run lint`: sin warnings ni errores.
- No se repitio la suite completa de 672 pruebas.

Las ejecuciones iniciales bloqueadas por `spawn EPERM` o por el guard antes de cargar tests no ejecutaron aserciones y se repitieron con el runner protegido.

## 9. Riesgos restantes

### Bloqueante de commit

Ninguno.

### Bloqueante de piloto

Ninguno dentro del alcance R1.

### Riesgo operacional aceptable

- La cola global de soporte pagina internamente a 100 filas y parte del filtrado sigue en cliente; es suficiente para tres pilotos, pero debe paginarse en backend al crecer.
- La exportacion es sincrona y limitada a 5.000 PQRS y 2.000 membresias; al superar ese volumen requiere exportacion asistida.
- Pago manual y cortesia dependen de una accion privilegiada de SUPER_ADMIN y de disciplina operativa sobre el motivo registrado.
- Las etiquetas visuales nuevas usan texto ASCII por compatibilidad con archivos que conservan contenido historico con codificacion inconsistente.

### Mejora posterior

- Mover exportaciones grandes a un job asincrono.
- Paginar soporte global en servidor.
- Normalizar de forma separada la codificacion historica de textos, fuera de esta fase.

## 10. Commit

Mensaje autorizado:

```text
feat(pilot): close critical readiness gaps
```

El hash final se informa en la respuesta de la sesion, porque este documento debe quedar incluido en el propio commit.