# PQRS Services

Mapa del sistema. Cada nota es corta a proposito: sirve para entender como encaja
una pieza, no para documentarla al detalle. El detalle esta en el codigo.

Estas notas son el punto de partida tanto para una persona como para un agente.
Lo historico vive en `docs/programa-mejora/` y **no se enlaza desde aqui**: describe
fases ya superadas y leerlo como estado actual lleva a decisiones equivocadas.

## Quien usa la plataforma

- [[Super Admin]] — opera el negocio: conjuntos, licencias, precios, soporte
- [[Admin]] — administra un conjunto: atiende las PQRS y gestiona usuarios
- [[Consejo]] — supervisa: ve reportes e historial, solo lectura
- [[Residente]] — radica sus solicitudes y les hace seguimiento

## De que se compone

- [[Conjunto]] — la unidad de aislamiento; todo cuelga de aqui
- [[PQRS]] — el caso: desde que se radica hasta que se cierra
- [[Categorias y flujos]] — la categoria decide si el caso es simple o de 5 fases
- [[Licencias y pagos]] — como cobra el negocio
- [[Precios]] — cuanto se cobra y quien se cotiza a mano
- [[Correo y notificaciones]] — que se envia, a quien y cuando
- [[Seguridad y aislamiento]] — por que un conjunto nunca ve datos de otro
- [[Documentos legales]] — el contrato y el tratamiento de datos

## El recorrido del dinero

[[Residente]] no paga la plataforma. Paga el [[Conjunto]], a traves de su [[Admin]],
segun lo que definan los [[Precios]]. El [[Super Admin]] ve todo eso agregado en
[[Licencias y pagos]].
