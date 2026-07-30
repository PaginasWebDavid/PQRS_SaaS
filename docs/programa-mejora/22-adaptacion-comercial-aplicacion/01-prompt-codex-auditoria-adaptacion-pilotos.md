# FASE C7A — AUDITORÍA DE ADAPTACIÓN COMERCIAL Y OPERATIVA DE LA APLICACIÓN

Guarda este prompt exacto en:

`docs/programa-mejora/22-adaptacion-comercial-aplicacion/01-prompt-codex-auditoria-adaptacion-pilotos.md`

Guarda el informe final completo en:

`docs/programa-mejora/22-adaptacion-comercial-aplicacion/02-respuesta-codex-auditoria-adaptacion-pilotos.md`

## 1. Objetivo

Audita si la aplicación actual permite ejecutar realmente las decisiones comerciales y operativas definidas para los primeros pilotos.

No asumas que una regla está implementada porque aparece en un documento Markdown.

Debes comprobar:

* modelo de datos;
* servicios;
* APIs;
* Super Admin;
* interfaz del administrador;
* estados;
* billing;
* creación de tenants;
* configuración;
* reportes;
* pruebas existentes.

El objetivo es determinar qué está:

1. implementado y automatizado;
2. implementado, pero solo mediante una operación manual;
3. disponible únicamente desde base de datos o código;
4. documentado, pero no implementado;
5. innecesario de implementar para tres pilotos;
6. necesario antes del primer piloto.

Esta fase es exclusivamente de auditoría.

No modifiques código.

No crees migraciones.

No hagas commit.

No inicies otra fase.

---

# 2. Documentos comerciales que debes localizar

Busca dentro de:

`docs/programa-mejora/`

los documentos más recientes relacionados con:

* cliente ideal;
* oferta y precios;
* proceso de venta y activación;
* piloto guiado de 45 días;
* kit comercial;
* preparación legal y operativa;
* reencuadre comercial;
* críticas independientes del negocio.

El usuario indicó que consolidó varios documentos comerciales dentro de una misma carpeta.

No asumas rutas exactas si los nombres cambiaron.

En el informe enumera los archivos encontrados y determina cuál representa la decisión comercial vigente.

Si existen contradicciones, señálalas.

---

# 3. Decisión comercial vigente que debe auditarse

La política definida actualmente es:

## Oferta principal

`Plan Gestión`

Incluye:

* PQRS;
* residentes;
* varios administradores;
* consejo;
* categorías configurables;
* workflows SIMPLE y MAINTENANCE;
* evidencias;
* historial;
* correcciones auditadas;
* responsables;
* notificaciones esenciales;
* reportes;
* exportación;
* soporte técnico al administrador.

Reservas y Pagos de residentes quedan fuera de la oferta principal y deben tratarse como add-ons opcionales.

## Precio mensual

| Unidades privadas |        Precio mensual |
| ----------------: | --------------------: |
|             1–100 |              $119.000 |
|           101–200 |              $159.000 |
|           201–400 |              $199.000 |
|           401–600 |              $249.000 |
|        Más de 600 | Cotización individual |

## Piloto guiado

Duración total:

`45 días calendario`

Composición:

* hasta siete días de preparación;
* mínimo treinta días de uso real;
* evaluación y decisión final.

Precio:

| Unidades privadas |     Precio del piloto |
| ----------------: | --------------------: |
|             1–200 |               $99.000 |
|           201–400 |              $129.000 |
|           401–600 |              $159.000 |
|        Más de 600 | Cotización individual |

## Clientes fundadores

Los primeros diez clientes pagos reciben:

* implementación asistida sin costo;
* precio protegido durante doce meses;
* acompañamiento inicial;
* prioridad para entrevistas de producto.

No reciben un descuento permanente.

## Anualidad

* pago anticipado;
* 10 % de descuento;
* no acumulable con descuento comercial.

## Descuento comercial

* máximo 5 %;
* aprobado únicamente por el fundador;
* motivo obligatorio;
* duración definida;
* no acumulable con anualidad;
* no aplicable al piloto.

## Referidos

* registrar quién refirió al cliente;
* comisión equivalente a una mensualidad neta;
* se causa después de que el cliente convierta y complete su segundo pago mensual;
* no se paga por pilotos no convertidos;
* existe una posible excepción fundadora para la administradora inicial.

## Implementación

* estándar: $0;
* asistida: $250.000 después de los primeros diez clientes;
* los fundadores reciben implementación asistida sin costo.

## Add-ons

* Reservas;
* Pagos de residentes.

No deben incluirse automáticamente en Gestión.

---

# 4. Pregunta principal

Responde con evidencia:

> ¿La aplicación actual está realmente adaptada para operar esta política, o únicamente existen documentos comerciales que todavía dependen de memoria, Excel, cambios manuales o acceso directo a base de datos?

No respondas de forma general.

Comprueba cada regla.

---

# 5. Auditoría de facilidad de uso

Evalúa por separado:

## Residente

Comprueba si puede:

* aceptar invitación fácilmente;
* completar onboarding;
* identificar su conjunto;
* crear una PQRS sin entender terminología interna;
* seleccionar categorías claras;
* adjuntar evidencia;
* consultar estado;
* entender mensajes;
* recuperar contraseña;
* diferenciar PQRS de soporte técnico;
* usar la plataforma en móvil.

Identifica:

* pasos innecesarios;
* campos confusos;
* categorías ambiguas;
* términos técnicos;
* acciones sin explicación;
* estados que no coinciden con el lenguaje visible;
* problemas funcionales móviles visibles por código.

## Administrador

Comprueba si puede:

* configurar categorías;
* escoger workflows;
* crear o invitar usuarios;
* asignar responsables;
* corregir casos;
* retirar evidencia;
* consultar reportes;
* entender pendientes;
* saber qué debe atender hoy;
* distinguir PQRS nuevas, activas, vencidas o cerradas;
* administrar el conjunto sin acudir al fundador para operaciones normales.

## Consejo

Comprueba si puede:

* consultar sin modificar;
* entender indicadores;
* revisar evidencia;
* filtrar;
* exportar;
* comprender qué representa cada estado.

## Super Admin / fundador

Comprueba si puede operar los primeros pilotos sin:

* editar base de datos;
* modificar código;
* recordar fechas manualmente;
* recalcular valores en calculadora;
* revisar varios menús para una sola decisión;
* confundir cortesía, piloto, pago manual o suscripción.

Entrega una evaluación:

* `FÁCIL`;
* `ACEPTABLE CON ACOMPAÑAMIENTO`;
* `CONFUSO`;
* `BLOQUEANTE`.

---

# 6. Creación de un piloto de 45 días

Audita el flujo actual de creación de tenant y suscripción.

Confirma:

* duración automática actual del trial;
* si continúa siendo de 15 días;
* si puede establecerse una duración exacta de 45 días;
* si existe un concepto explícito de piloto;
* si el sistema distingue:

  * trial automático;
  * piloto pago;
  * cortesía;
  * mensualidad;
  * pago manual;
* si un piloto puede tener:

  * fecha de preparación;
  * fecha de lanzamiento;
  * inicio de uso real;
  * fecha de evaluación;
  * fecha de decisión;
  * precio del piloto;
  * precio posterior;
* si Super Admin puede modificar esas fechas desde la interfaz;
* si existen alertas antes de terminar;
* si el piloto puede convertirse sin perder historial;
* si la conversión crea o duplica suscripciones;
* si el piloto aparece incorrectamente como cortesía o trial gratuito.

Determina si el mecanismo actual de cortesía es adecuado para representar un piloto pago.

No consideres correcto un sistema que permita extender acceso, pero no conserve el significado comercial del piloto.

---

# 7. Precio por unidades

Audita:

* `PricingRule`;
* creación del tenant;
* número de unidades;
* selección de tarifa;
* cambio de rango;
* Super Admin;
* suscripción;
* propuesta o valor mostrado;
* cobros manuales;
* Mercado Pago.

Comprueba si están configurados actualmente estos rangos:

```text
1–100       $119.000
101–200     $159.000
201–400     $199.000
401–600     $249.000
>600        cotización
```

Confirma:

* si las reglas pueden administrarse desde Super Admin;
* si modificar una regla altera clientes existentes;
* si la tarifa contratada queda congelada como snapshot;
* si el sistema recalcula automáticamente precios anteriores;
* qué sucede al cambiar el número de unidades;
* cómo se maneja un conjunto de más de 600 unidades;
* si existe override manual;
* si el override exige motivo y auditoría.

No modifiques todavía las reglas.

Solo reporta el comportamiento real.

---

# 8. Precio del piloto

Comprueba si el sistema puede registrar:

```text
1–200       $99.000
201–400     $129.000
401–600     $159.000
>600        cotización
```

Determina:

* si existe una tabla independiente para precio de piloto;
* si el piloto se registra como Payment real;
* si se confunde con mensualidad;
* si puede registrar transferencia;
* si puede emitir una notificación correcta;
* si aparece en MRR;
* si se cuenta como conversión;
* si altera la fecha de suscripción;
* si el precio posterior queda guardado.

Un pago de piloto no debe:

* aparecer como mensualidad ordinaria;
* activar anualidad;
* contar como segundo pago para comisión;
* tratarse como cortesía;
* deformar MRR recurrente.

---

# 9. Clientes fundadores

Comprueba si existe un concepto equivalente a:

```text
isFounderCustomer
founderNumber
founderGrantedAt
priceProtectedUntil
implementationFeeWaived
```

No exijas estos nombres exactos.

Determina si la aplicación puede:

* identificar los primeros diez clientes pagos;
* evitar asignar el beneficio al piloto que no convierte;
* mostrar cuántos cupos fundadores quedan;
* registrar el orden de conversión;
* proteger el precio durante doce meses;
* saber cuándo termina la protección;
* impedir que el beneficio se convierta en descuento permanente;
* mostrar el beneficio en Super Admin;
* auditar cambios manuales.

Comprueba si “primeros diez” se puede determinar de manera estable frente a:

* pagos simultáneos;
* cancelaciones;
* pilotos fallidos;
* reactivaciones;
* clientes eliminados;
* pagos anulados.

---

# 10. Anualidad

Audita si el sistema soporta realmente:

* periodo anual;
* pago anticipado;
* descuento del 10 %;
* fecha de inicio;
* fecha final exacta;
* renovación;
* cancelación;
* notificación;
* pago manual;
* Mercado Pago, si aplica;
* precio protegido;
* historial.

Determina si actualmente todo billing está hardcodeado a treinta días.

Comprueba qué ocurriría si Super Admin intenta registrar manualmente doce meses.

No consideres “soportada” una anualidad únicamente porque puede otorgarse una cortesía de 365 días.

Una anualidad debe conservar:

* que existió pago;
* valor;
* descuento;
* periodo contratado;
* modalidad;
* próxima renovación;
* auditoría.

---

# 11. Descuentos

Comprueba si la aplicación puede:

* registrar un descuento porcentual;
* limitarlo a 5 %;
* exigir motivo;
* exigir fecha de inicio y finalización;
* identificar quién lo aprobó;
* aplicarlo a una cotización o suscripción;
* evitar aplicarlo al piloto;
* evitar acumulación con anualidad;
* conservar el precio de lista;
* conservar el precio efectivo;
* mostrar ambos valores;
* auditar cambios;
* evitar descuentos negativos o superiores.

Determina si actualmente los descuentos se representan mediante:

* PricingRule;
* override;
* cortesía;
* cambio directo del precio;
* metadata;
* ningún mecanismo.

---

# 12. Implementación estándar y asistida

Comprueba si la aplicación registra:

* tipo de implementación;
* tarifa;
* si está incluida;
* si fue exonerada por fundador;
* estado de pago;
* horas invertidas;
* fecha de inicio;
* fecha de finalización;
* checklist de onboarding.

Determina si la aplicación diferencia:

```text
STANDARD
ASSISTED
FOUNDER_WAIVED
```

No es obligatorio que exista una factura separada dentro del software para tres pilotos.

Sí debe evaluarse si Super Admin puede saber:

* qué se prometió;
* qué falta;
* cuánto trabajo ha consumido;
* si debe cobrarse.

---

# 13. Referidos y comisión

Comprueba si existe un registro de:

* fuente del prospecto;
* referido;
* nombre;
* contacto;
* tipo de acuerdo;
* comisión prometida;
* base de cálculo;
* estado;
* fecha de causación;
* fecha de pago;
* excepción fundadora.

Determina si el sistema puede saber automáticamente:

* si el piloto convirtió;
* si el cliente completó el segundo pago;
* cuál fue la mensualidad neta;
* si existió descuento;
* si hubo devolución;
* si la comisión ya puede pagarse.

No es necesario automatizar el pago bancario.

Sí debe evaluarse si la aplicación puede impedir:

* pagar comisión por un piloto fallido;
* pagar dos veces;
* calcular sobre precio bruto incorrecto;
* perder la relación del referido.

---

# 14. Add-ons Reservas y Pagos

Audita cómo se habilitan actualmente:

* Reservas;
* Pagos de residentes.

Comprueba:

* si están visibles para todos los tenants;
* si existe feature flag;
* si pueden activarse por tenant;
* si el ADMIN ve menús aunque no los haya contratado;
* si el RESIDENTE ve funciones no incluidas;
* si pueden desactivarse sin afectar datos;
* si Super Admin puede ver qué add-ons tiene cada tenant;
* si existe precio o estado comercial;
* si activarlos genera soporte o configuración pendiente.

No implementes paywalls todavía.

Determina la solución mínima para que:

* Gestión no muestre add-ons no contratados;
* una activación sea explícita;
* el histórico permanezca;
* Super Admin controle el acceso.

---

# 15. Decisiones desde la propia página

El usuario quiere que la plataforma le ayude a tomar decisiones.

Audita si Super Admin muestra de manera accionable:

## Antes del piloto

* documentos pendientes;
* pago pendiente;
* base de residentes pendiente;
* configuración pendiente;
* capacitación pendiente;
* smoke test pendiente;
* fecha de lanzamiento.

## Durante el piloto

* días restantes;
* días de uso real;
* PQRS creadas;
* adopción;
* usuarios activados;
* solicitudes fuera del sistema;
* minutos de soporte;
* fallos;
* próxima revisión;
* riesgo de no conversión.

## Al terminar

* fecha de decisión;
* precio posterior;
* mensual o anual;
* descuento aplicable;
* fundador;
* referido;
* conversión;
* cancelación;
* exportación.

Clasifica cada elemento como:

* disponible automáticamente;
* disponible en otro menú;
* solo calculable manualmente;
* no disponible;
* no debería estar en la plataforma todavía.

No conviertas esta auditoría en la recomendación de construir un CRM completo.

---

# 16. Capacidad de modificar reglas desde la página

Audita qué puede modificar actualmente Super Admin sin código:

* precios;
* rangos;
* unidades;
* periodo de gracia;
* duración de trial;
* fechas de acceso;
* estado del tenant;
* pago manual;
* cortesía;
* add-ons;
* categorías;
* workflows;
* descuento;
* anualidad;
* fundador;
* referido;
* comisión;
* implementación;
* fecha de piloto;
* precio posterior;
* fecha de decisión;
* soporte;
* retención.

Entrega una matriz:

| Regla | UI | API | Base de datos | Código | Auditoría |
| ----- | -: | --: | ------------: | -----: | --------: |

La plataforma no debe depender de editar código para decisiones normales.

Pero tampoco debe convertir cada política comercial en configuración editable sin controles.

---

# 17. Flujo completo del fundador

Reconstruye el camino real actual:

```text
Prospecto acepta
→ se recibe pago
→ se crea tenant
→ se asigna precio
→ se configura
→ se importan usuarios
→ se inicia piloto
→ se hace seguimiento
→ se convierte
→ se renueva o cancela
```

Para cada paso indica:

* pantalla;
* acción;
* dato;
* validación;
* qué se registra;
* qué falta;
* riesgo de error;
* dependencia manual.

Identifica:

* pasos duplicados;
* navegación confusa;
* campos que deben copiarse entre pantallas;
* cálculos manuales;
* estados contradictorios;
* decisiones que pueden olvidarse.

---

# 18. Fuente de verdad

Comprueba si actualmente existe una fuente de verdad para cada tenant que muestre:

```text
Unidades
Tarifa de lista
Tarifa contratada
Tipo de cliente
Estado comercial
Estado técnico
Piloto
Inicio y fin
Precio de piloto
Precio posterior
Modalidad
Descuento
Fundador
Protección de precio
Referido
Comisión
Implementación
Add-ons
Próxima acción
Fecha de decisión
```

Determina dónde vive cada valor:

* Tenant;
* Subscription;
* Payment;
* PricingRule;
* PlatformSetting;
* metadata;
* UI;
* ningún lugar.

Señala duplicaciones y contradicciones.

---

# 19. Estados comerciales y técnicos

Comprueba si los estados existentes permiten distinguir:

```text
PROSPECT
PILOT_PENDING
PILOT_ACTIVE
PILOT_EVALUATION
CONVERTED_MONTHLY
CONVERTED_ANNUAL
NOT_CONVERTED
CANCELLED
```

No exijas agregar estos estados si el modelo actual puede representar correctamente el proceso mediante otra estructura.

Pero identifica si se están usando estados técnicos como:

* TRIAL;
* ACTIVE;
* GRACE_PERIOD;
* PENDING_PAYMENT;
* SUSPENDED;
* CANCELLED;

para representar decisiones comerciales distintas que deberían permanecer separadas.

Un tenant puede estar técnicamente `ACTIVE` y comercialmente en piloto.

No mezclar ambos conceptos.

---

# 20. Métricas de piloto

Audita cuáles métricas ya pueden obtenerse:

* primera PQRS;
* PQRS totales;
* PQRS por semana;
* casos cerrados;
* primer contacto;
* tiempo de cierre;
* usuarios invitados;
* usuarios activados;
* administradores activos;
* consejo activo;
* correcciones;
* evidencias;
* soporte;
* minutos de soporte;
* solicitudes fuera de la plataforma;
* reuniones;
* objeciones;
* decisión.

Clasifica:

* automática;
* derivable;
* manual;
* inexistente.

No recomiendes instrumentación compleja para una métrica que pueda registrarse manualmente durante tres pilotos.

---

# 21. Contradicciones documentales

Busca contradicciones entre:

* piloto de 30 o 45 días;
* trial de 15 días;
* precios anteriores;
* precios actuales;
* plan Esencial/Gestión/Premium;
* add-ons;
* implementación;
* descuentos;
* anualidad;
* comisión;
* soporte.

Identifica qué documentos deben marcarse como:

* vigentes;
* históricos;
* reemplazados;
* contradictorios.

No edites los documentos.

---

# 22. Seguridad y autorización

Para cualquier configuración comercial existente o recomendada, revisa:

* solo SUPER_ADMIN puede modificar;
* tenant target explícito;
* auditoría;
* validación;
* idempotencia;
* no exposición a ADMIN/RESIDENTE;
* no confianza en valores enviados por cliente;
* manejo opaco cross-tenant.

No reaudites todo el sistema de autenticación.

Revisa únicamente los flujos comerciales y de configuración relacionados.

---

# 23. Uso de pruebas

Esta es una auditoría.

No ejecutes la suite integral.

No ejecutes migraciones.

No modifiques la base.

Puedes ejecutar pruebas focalizadas existentes únicamente si una afirmación importante no puede confirmarse por lectura.

No crees pruebas nuevas.

No ejecutes Prisma, typecheck o lint porque no habrá cambios.

---

# 24. Matriz obligatoria de reglas

Entrega una tabla con al menos estas filas:

| Regla                   | Documento | Código | UI | Automatizada | Manual viable | Falta |
| ----------------------- | --------- | ------ | -- | ------------ | ------------- | ----- |
| Piloto 45 días          |           |        |    |              |               |       |
| Precio piloto           |           |        |    |              |               |       |
| Precio mensual          |           |        |    |              |               |       |
| Fundadores              |           |        |    |              |               |       |
| Precio protegido        |           |        |    |              |               |       |
| Implementación incluida |           |        |    |              |               |       |
| Implementación asistida |           |        |    |              |               |       |
| Anualidad 10 %          |           |        |    |              |               |       |
| Descuento máximo 5 %    |           |        |    |              |               |       |
| No acumulación          |           |        |    |              |               |       |
| Referido                |           |        |    |              |               |       |
| Comisión segundo pago   |           |        |    |              |               |       |
| Add-on Reservas         |           |        |    |              |               |       |
| Add-on Pagos            |           |        |    |              |               |       |
| Conversión piloto       |           |        |    |              |               |       |
| Cancelación             |           |        |    |              |               |       |
| Exportación             |           |        |    |              |               |       |
| Próxima acción          |           |        |    |              |               |       |
| Métricas piloto         |           |        |    |              |               |       |

Estados permitidos:

* `IMPLEMENTADO`;
* `PARCIAL`;
* `MANUAL`;
* `SOLO DOCUMENTADO`;
* `NO NECESARIO AÚN`;
* `BLOQUEANTE`.

---

# 25. Clasificación de brechas

Clasifica cada brecha como:

## P0 — Antes del primer piloto

Solo si:

* puede cobrar mal;
* asigna fechas incorrectas;
* confunde piloto con cortesía o pago;
* impide operar;
* muestra módulos no contratados;
* puede causar una promesa comercial falsa;
* obliga a editar la base de datos;
* puede perder información comercial esencial.

## P1 — Antes del cuarto cliente

Para:

* reducir errores manuales;
* estandarizar onboarding;
* controlar fundadores;
* administrar anualidades;
* gestionar referidos;
* mejorar decisiones.

## P2 — Después de validar

Para:

* automatización avanzada;
* CRM;
* dashboards comerciales complejos;
* comisiones automáticas;
* forecasting;
* analítica sofisticada.

---

# 26. Recomendación de capa comercial mínima

Sin implementar, diseña la solución mínima que permitiría operar correctamente.

Debe responder si conviene tener:

## Ficha comercial por tenant

Posibles datos:

* estado comercial;
* piloto;
* fechas;
* precio;
* modalidad;
* fundador;
* descuento;
* referido;
* implementación;
* add-ons;
* próxima acción.

## Panel operativo de piloto

Posibles datos:

* checklist;
* días;
* métricas;
* próxima reunión;
* riesgos;
* decisión.

## Configuración comercial

Posibles controles:

* rangos;
* piloto;
* anualidad;
* descuentos;
* fundadores;
* add-ons.

No des por hecho que todo requiere tablas nuevas.

Identifica qué puede reutilizar:

* Tenant;
* Subscription;
* Payment;
* PricingRule;
* PlatformSetting;
* AuditLog;
* feature flags;
* metadata existente.

---

# 27. Qué debe permanecer manual

Recomienda explícitamente qué debe mantenerse fuera del código durante tres pilotos.

Posibles ejemplos:

* CRM de prospectos;
* minutos de soporte;
* solicitudes recibidas fuera de la plataforma;
* actas de reuniones;
* aprobación del consejo;
* pago bancario de comisión;
* documentos legales;
* firma;
* facturación o cuenta de cobro;
* limpieza de bases.

No propongas automatizar algo solo porque puede programarse.

---

# 28. Qué sí debería controlar la aplicación

Recomienda únicamente controles donde un error manual afectaría:

* acceso;
* precio;
* fechas;
* cobro;
* módulos habilitados;
* compromiso comercial;
* renovación;
* cancelación;
* historial.

Justifica cada uno.

---

# 29. Veredicto

Entrega uno de estos resultados:

* `ADAPTADA PARA PILOTOS`;
* `ADAPTADA CON OPERACIÓN MANUAL CONTROLADA`;
* `REQUIERE CAPA COMERCIAL MÍNIMA`;
* `NO ADAPTADA PARA PILOTOS`.

El veredicto debe distinguir:

* capacidad técnica del producto;
* capacidad operativa del fundador;
* cumplimiento de las reglas comerciales;
* facilidad de uso.

---

# 30. Informe final

Estructura:

1. Resumen ejecutivo.
2. Documentos comerciales encontrados.
3. Experiencia por rol.
4. Flujo actual del fundador.
5. Pilotos y fechas.
6. Precios y billing.
7. Fundadores.
8. Descuentos y anualidad.
9. Referidos y comisiones.
10. Implementación.
11. Add-ons.
12. Decisiones desde Super Admin.
13. Fuente de verdad.
14. Estados técnicos y comerciales.
15. Métricas.
16. Matriz completa.
17. Brechas P0/P1/P2.
18. Capa comercial mínima recomendada.
19. Trabajo que debe permanecer manual.
20. Veredicto.

No modifiques el repositorio fuera de los archivos `01` y `02` de esta fase.

No hagas commit.

No inicies implementación.

Respeta las reglas permanentes de carpetas, archivos, orden Codex/Claude, revisión independiente y commits definidas para este proyecto.
