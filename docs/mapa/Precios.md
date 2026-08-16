# Precios

El precio depende del numero de unidades del [[Conjunto]]. No se cobra por usuario: todos
los residentes y todo el equipo de administracion entran incluidos.

## Tramos

Hay reglas activas por rango de unidades, para plan mensual y para piloto. El precio por
unidad **baja** a medida que el conjunto crece: es un descuento por volumen.

Los montos vigentes viven en la base (`PricingRule`), no en el codigo. La landing publica
los **rangos pero no los montos** — decision comercial: el precio se da cotizando, no
regalandoselo a la competencia.

## Arriba de 600 unidades: se cotiza a mano

**No hay tarifa automatica por encima del ultimo tramo, y es deliberado.** Un conjunto de
1200 unidades no puede pagar lo mismo que uno de 601.

Al crear el conjunto con mas de 600 unidades, el formulario **exige** precio de piloto,
precio mensual y un motivo escrito. Queda registrado quien aprobo y cuando. Ese precio
acordado es el que cobra el sistema.

El simulador del [[Super Admin]] sugiere una banda (minimo, sugerido, maximo) derivada de
lo que sube la propia tabla en cada salto. Si se cambia un tramo, la banda se recalcula sola.

## Cuidado al cambiar la tabla

`validateCommercialPricingPolicy()` tiene la tabla esperada **escrita en el codigo** y
falla si aparece una regla sin tope o que cubra mas de 600 unidades. Cambiar precios
implica actualizar esa funcion.

Relacionado: [[Licencias y pagos]]
Codigo: `src/domains/commercial/`
