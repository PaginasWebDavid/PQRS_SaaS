# Correo y notificaciones

Dos canales: notificaciones dentro de la plataforma y correo por Resend.

## Quien recibe que

| Evento | Va a |
|---|---|
| Nueva [[PQRS]] radicada | Los [[Admin]] **de ese conjunto**, activos, que lo tengan activado |
| Confirmacion de radicacion | El [[Residente]] que la creo |
| Caso abierto o cerrado | Quien creo el caso |
| Invitacion / acceso activado | El correo invitado |
| Comprobante o reserva revisada | El residente dueño de la solicitud |
| Respuesta de soporte | Quien abrio el ticket |
| **Ticket de soporte nuevo** | El operador, al canal de contacto publico |

El envio a varios destinatarios (nueva PQRS) filtra por conjunto, rol y cuenta activa.
Ver [[Seguridad y aislamiento]].

## Dos detalles que costaron encontrarse

**El remitente no tiene buzon.** Los correos salen de `notificaciones@` y nadie lee ahi.
Por eso todos llevan `Reply-To` al canal de contacto: sin eso, cuando un residente le da
"Responder" a una notificacion, el mensaje se perdia.

**Abrir un ticket no avisaba a nadie.** Se guardaba esperando a que alguien entrara al
panel a mirar. Ahora notifica por correo, y mas ahora que los [[Documentos legales]]
prometen responder reclamos en plazos con consecuencia legal.

## Al enviar desde codigo nuevo

`sendEmailSafe` cuando el fallo del correo no deba tumbar la operacion: es preferible
perder el aviso que perder el dato.

Codigo: `src/lib/email.ts`
