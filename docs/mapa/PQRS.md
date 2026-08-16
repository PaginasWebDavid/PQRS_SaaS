# PQRS

El caso: una peticion, queja, reclamo o solicitud. Es el objeto central del producto y
todo lo demas existe para sostenerlo.

## El recorrido

1. **Radica el [[Residente]]** — titulo, descripcion, hasta 3 fotos. Nada mas.
2. **Llega al [[Admin]]** — lo ve en su lista con numero, titulo, estado, residente y
   categoria. Recibe correo si tiene la notificacion activa.
3. **Abre el caso** — y en ese momento **le pone categoria**. Esa eleccion decide el
   flujo (ver [[Categorias y flujos]]). Tambien registra la nota de primer contacto.
4. **Avanza** — segun el flujo: un solo paso, o cinco fases.
5. **Cierra con evidencia** — accion tomada y soporte del cierre.

Cada paso queda en el historial y notifica al residente (ver [[Correo y notificaciones]]).

## Decisiones de diseno que importan

**Un solo boton por paso.** Antes habia dos ("corregir caso" y "confirmar recepcion") y
nadie sabia cual era cual. La regla es: en cada momento hay una sola accion obvia.

**La informacion basica no cambia al abrir el caso.** El numero, el titulo y el residente
se quedan donde estaban; si se movieran, el admin perderia la referencia de lo que estaba
mirando.

**El [[Consejo]] lo ve todo pero no lo toca.**

Codigo: `src/domains/pqrs/` · `src/app/admin/pqrs/`
