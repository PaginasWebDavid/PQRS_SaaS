# Admin

La administradora del [[Conjunto]]. Es quien de verdad opera el producto todos los dias,
y por quien se decide casi cada detalle de la interfaz: **cero friccion, nada en ingles**.

## Que hace

- Atiende las [[PQRS]]: abre el caso, lo clasifica, registra avances y lo cierra con evidencia.
- **Clasifica al abrir.** El [[Residente]] no elige categoria; ella si, y esa eleccion
  decide el flujo (ver [[Categorias y flujos]]).
- Invita usuarios y les asigna rol. Puede desactivar cuentas.
- Ve reportes del conjunto y los exporta a Excel o PDF.
- Gestiona la licencia del conjunto: paga, activa el cobro automatico, consulta
  comprobantes (ver [[Licencias y pagos]]).
- Configura categorias de PQRS propias y los datos del conjunto.

## Reglas que la protegen

No se puede desactivar al **ultimo Admin activo** de un conjunto: dejaria al conjunto
sin quien lo opere.

Si administra varios conjuntos, la plataforma solo actua sobre el que tiene activo en su
sesion, aunque la peticion diga otra cosa. Ver [[Seguridad y aislamiento]].

Pantallas: `src/app/admin/`
