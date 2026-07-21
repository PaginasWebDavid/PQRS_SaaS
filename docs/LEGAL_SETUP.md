# Legalizacion antes de publicar

La primera version de las paginas legales ya esta disponible en:

- `/legal`
- `/legal/terminos`
- `/legal/privacidad`
- `/legal/cookies`
- `/legal/pagos`

Antes de vender el servicio, completa estas variables publicas en el entorno de Vercel y en tu `.env` local:

```env
NEXT_PUBLIC_LEGAL_NAME="Nombre legal completo"
NEXT_PUBLIC_LEGAL_NIT="NIT o identificacion tributaria"
NEXT_PUBLIC_LEGAL_ADDRESS="Direccion de notificaciones"
NEXT_PUBLIC_LEGAL_CITY="Bogota, Colombia"
NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL="hola@pqrsservices.com"
NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL="privacidad@pqrsservices.com"
NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE="2026-07-21"
```

La pagina muestra un aviso visible mientras falten los datos de identidad. Esto evita publicar una politica que no identifique al responsable.

## Pendientes personales

- Actualizar el RUT y confirmar la actividad economica con un contador.
- Confirmar matricula mercantil si la actividad es habitual o profesional.
- Revisar facturacion electronica, renta, IVA, ICA y retenciones.
- Definir el contrato con cada conjunto.
- Definir el acuerdo de tratamiento de datos con cada conjunto.
- Revisar estos textos con un abogado colombiano.
- Configurar correo de soporte y privacidad sobre el dominio propio.
- Definir el procedimiento de solicitudes de datos, cancelacion y eliminacion.

Las paginas son una base de implementacion y no reemplazan la revision profesional ni completan obligaciones tributarias por si solas.
