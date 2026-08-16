# Documentos legales

Cuatro documentos publicos en `/legal`: terminos, privacidad, pagos y cookies. **Son el
contrato**, no un adorno: no hay otro documento firmado que los reemplace.

## Lo que protege al negocio

- **Limite de responsabilidad** topado a lo pagado en los ultimos meses, sin lucro cesante.
  Como el negocio se opera como persona natural, esta clausula es el unico escudo
  patrimonial que existe.
- **Ley colombiana y jurisdiccion** definida. Antes no habia ninguna.
- **Acuerdo de encargo** (Ley 1581): el [[Conjunto]] es Responsable del tratamiento y la
  plataforma es Encargado. Eso traslada al conjunto la carga de tener las autorizaciones
  de sus residentes.

## Plazos que corren de verdad

Consultas 10 dias habiles, reclamos 15, incidentes 72 horas, retracto 5 dias habiles,
gracia minima 5 dias, aviso de cambio de precio 30 dias.

No son texto decorativo: empiezan a contar cuando el cliente escribe. Por eso importa que
los tickets de soporte avisen (ver [[Correo y notificaciones]]).

## Dos reglas al tocarlos

**Nada que no se pueda verificar.** Las medidas de seguridad que afirma la politica se
comprobaron contra el codigo antes de escribirlas. Ya paso una vez que una linea afirmaba
copias de respaldo que no existian: hubo que retirarla.

**Subir `LEGAL_DOCUMENT_VERSION` cuando el contenido cambie de forma material.** Esa
version queda guardada en cada aceptacion como prueba de que texto acepto cada usuario; si
no se sube, el registro apunta al texto equivocado.

Los valores contractuales que tambien viven en codigo estan en `src/lib/legal.ts`, para que
el documento y el comportamiento no puedan divergir.

Relacionado: [[Licencias y pagos]] · [[Seguridad y aislamiento]]
