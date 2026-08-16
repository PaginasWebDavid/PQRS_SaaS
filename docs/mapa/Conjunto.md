# Conjunto

Un conjunto residencial. En el codigo es `Tenant`, y es **la unidad de aislamiento**:
toda consulta lleva su identificador y ningun conjunto ve datos de otro.

## Como entra la gente

Nadie se registra por su cuenta. El [[Admin]] invita por correo y esa invitacion crea
una `TenantMembership`, que es lo que de verdad da acceso: une un usuario, un conjunto
y un rol.

Una misma persona puede pertenecer a varios conjuntos con rol distinto en cada uno.
Por eso el rol no vive en el usuario sino en la membresia, y por eso existe la pantalla
de seleccionar conjunto.

## Que lo define

El **numero de unidades** determina cuanto paga (ver [[Precios]]) y, por encima de 600,
obliga a cotizar a mano.

## Ciclo de vida

Prueba, activo, periodo de gracia, suspendido, cancelado. Los detalles de esas
transiciones estan en [[Licencias y pagos]].

Suspender bloquea el acceso pero **no borra informacion**. Al regularizar, el conjunto
encuentra todo intacto.

Relacionado: [[Seguridad y aislamiento]] · [[Super Admin]]
