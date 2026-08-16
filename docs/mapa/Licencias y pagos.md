# Licencias y pagos

Como cobra el negocio. Lo paga el [[Conjunto]] a traves de su [[Admin]]; el [[Residente]]
nunca paga la plataforma.

## Modalidades

- **Mensual manual** — el conjunto paga por el canal acordado y queda registrado.
- **Mensual automatica** — Wompi cobra cada mes a la tarjeta autorizada.
- **Anual anticipada** — doce meses por adelantado con 10 % de descuento.

El cobro recurrente **solo** se activa si el admin lo autoriza expresamente. Elegir anual
no autoriza debitos automaticos.

## Ciclo cuando falla un pago

Rechazo → **periodo de gracia** (nunca menos de 5 dias, el servicio sigue funcionando) →
suspension si sigue en mora. La suspension bloquea el acceso pero **no borra nada**.

## MRR y caja: no son lo mismo

Esta distincion ya causo confusion real y vale la pena tenerla clara.

| | Que responde | Como cuenta una anualidad de 540.000 |
|---|---|---|
| **MRR** | Cuanto vale la base de clientes al mes | 45.000 cada mes del año que cubre |
| **Caja** | Cuanto me pagaron este mes | 540.000 el dia que se cobro |

Las dos son correctas. Se muestran en tarjetas separadas justamente para no leer una
como la otra.

Ademas, la cobertura de una anualidad **empieza cuando termina el periodo ya pagado**, no
el dia del cobro. Por eso puede cobrarse en agosto y empezar a contar en septiembre.

## Registros manuales

El [[Super Admin]] puede anotar un pago sin cobrar nada. **Eso no es dinero recibido** y
se reporta aparte, nunca sumado a la caja.

Relacionado: [[Precios]] · [[Documentos legales]]
Codigo: `src/domains/billing/`
