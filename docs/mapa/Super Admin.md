# Super Admin

El dueno del negocio. **No pertenece a ningun conjunto**: opera la plataforma entera.
Es el unico rol que puede apuntar a un [[Conjunto]] distinto del suyo, y eso pasa por
una validacion propia (`requireSuperAdminTenantTarget`).

## Que hace

- Crea conjuntos y define su precio. Arriba de 600 unidades el formulario **exige**
  precio acordado y motivo escrito (ver [[Precios]]).
- Ve [[Licencias y pagos]]: quien esta al dia, quien en mora, cuanto entro este mes.
- Define las reglas de precio y sus topes.
- Lleva el piloto comercial: activacion, evaluacion y conversion a cliente.
- Responde el soporte que le llega de los conjuntos.
- Consulta analitica global y auditoria.

## Lo que hay que tener claro

**MRR y caja no son lo mismo.** El MRR reparte una anualidad entre doce meses; la caja
es lo que entro por fecha de pago. Confundirlas fue un error real: se cobro una anualidad
y la tarjeta de "Recibido" no se movio. Ver [[Licencias y pagos]].

Los **registros manuales** que hace desde aqui no son dinero recibido, son anotaciones.
Se muestran aparte a proposito.

Pantalla: `src/app/(protected)/super-admin/`
