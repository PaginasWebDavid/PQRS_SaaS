# FASE R0 — REENCUADRE CONTRA EL DIAGNÓSTICO ORIGINAL DEL NEGOCIO

Guarda este prompt en:

`docs/programa-mejora/14-reencuadre-comercial/01-prompt-claude-auditoria-diagnostico-original.md`

Guarda el informe en:

`docs/programa-mejora/14-reencuadre-comercial/02-respuesta-claude-auditoria-diagnostico-original.md`

## Objetivo

Revisa el estado actual del producto contra el diagnóstico original del negocio.

Esta fase es exclusivamente de auditoría y priorización.

No implementes código.

No modifiques schema, migraciones, UI, servicios, pruebas ni configuración.

No hagas commit.

No ejecutes pruebas, suite, Prisma, typecheck o lint.

No revises Git, rama, HEAD o staged.

## Contexto

El producto comenzó como un SaaS de gestión de PQRS para propiedad horizontal.

Durante las fases técnicas se implementaron y aseguraron:

* multi-tenancy;
* membresías multi-conjunto;
* autorización;
* PQRS y evidencias;
* usuarios e invitaciones;
* cuenta global;
* billing SaaS;
* reservas;
* pagos de residentes;
* suite de pruebas separada.

Reservas y pagos se conservarán como funcionalidades Premium.

Se congela temporalmente la creación de:

* documentos generales;
* comunicados;
* directorio;
* nuevos módulos;
* nuevas integraciones;
* nuevas funcionalidades Premium.

El objetivo inmediato vuelve a ser:

> Convertir el producto actual en una oferta vendible, implementable y operable por una sola persona, validada con tres conjuntos reales.

## 1. Matriz del diagnóstico original

Evalúa los siguientes puntos:

1. Producto sobreconstruido.
2. Flujo PQRS demasiado adaptado a un conjunto.
3. Reglas excesivamente rígidas.
4. Soporte directo a residentes.
5. Cliente ideal insuficientemente definido.
6. Precio basado únicamente en unidades.
7. Necesidad de paquetes comerciales.
8. Costo de implementación.
9. Trial automático de 15 días.
10. Piloto guiado de 30 días.
11. Fricción de Mercado Pago.
12. Alternativas de transferencia y pago manual.
13. Divergencia del periodo de gracia.
14. Documentos legales incompletos.
15. Retención y eliminación de datos.
16. Exportación al cancelar.
17. Procedimiento de cancelación.
18. Notificaciones declaradas pero no operativas.
19. Estado legacy `PENDING_PAYMENT`.
20. Propuesta de valor basada en resultados.
21. Tres pilotos reales.
22. Métricas correctas para pilotos.
23. Horas de soporte por cliente.
24. Operación acompañada para los primeros clientes.

Para cada punto indica:

* `CERRADO`;
* `PARCIAL`;
* `ABIERTO`;
* `NO REQUIERE CÓDIGO`;
* `POSPUESTO HASTA VALIDACIÓN`.

## 2. Evidencia

Para cada elemento técnico:

* cita archivos, servicios, rutas, migraciones o pruebas;
* explica brevemente qué existe realmente;
* no asumas que algo funciona solo porque aparece en la UI;
* distingue implementación técnica de decisión comercial.

Ejemplo:

```text
Periodo de gracia
Estado: CERRADO / PARCIAL / ABIERTO
Evidencia:
- archivo;
- fuente de verdad;
- pruebas.
Riesgo:
Acción pendiente:
Requiere código: Sí/No
```

## 3. Revisión técnica de bloqueantes originales

Inspecciona específicamente, sin modificar:

### Periodo de gracia

Confirma si existe una sola fuente de verdad para:

* webhook;
* cron;
* suspensión;
* mensajes;
* licencia;
* configuración global.

### Soporte

Confirma:

* quién puede abrir tickets;
* si RESIDENTE puede contactar directamente al proveedor;
* si existe separación entre soporte operativo del conjunto y soporte técnico del SaaS.

### Correcciones auditadas

Confirma si hoy pueden corregirse con trazabilidad:

* descripción de PQRS;
* bloque/apartamento;
* evidencia;
* duplicados;
* ruta o flujo;
* datos sensibles cargados por error.

### Flujos PQRS

Confirma si el producto soporta:

* flujo simple;
* flujo de mantenimiento;
* variación limitada por conjunto.

No recomiendes un editor libre complejo.

### Pagos del SaaS

Confirma si el sistema permite o contempla operativamente:

* Mercado Pago;
* transferencia;
* pago manual;
* pago trimestral;
* pago anual;
* activación manual controlada.

### Notificaciones prometidas

Construye una tabla:

| Evento                     | In-app | Email | Durable | Probado |
| -------------------------- | -----: | ----: | ------: | ------: |
| Invitación                 |        |       |         |         |
| Nueva PQRS                 |        |       |         |         |
| Confirmación PQRS          |        |       |         |         |
| Cambio de estado           |        |       |         |         |
| Aviso de vencimiento SaaS  |        |       |         |         |
| Pago SaaS aprobado         |        |       |         |         |
| Pago SaaS rechazado        |        |       |         |         |
| Periodo de gracia          |        |       |         |         |
| Suspensión                 |        |       |         |         |
| Recuperación de contraseña |        |       |         |         |

### Cancelación y salida

Confirma si existe una política o flujo para:

* detener renovación;
* cancelar licencia;
* fecha efectiva;
* exportar información;
* periodo de conservación;
* eliminación;
* archivos;
* auditoría;
* reactivación.

### Legacy

Confirma qué uso real queda de:

* `PENDING_PAYMENT`;
* columnas legacy de `User`;
* aliases de sesión;
* otros estados o campos transitorios.

Distingue:

* riesgo actual;
* deuda aceptable;
* requisito antes de producción;
* requisito posterior.

## 4. Separación de planes

Clasifica las funcionalidades existentes:

### Producto base potencial

* PQRS;
* residentes;
* roles;
* consejo;
* evidencias;
* trazabilidad;
* notificaciones esenciales;
* reportes básicos;
* configuración inicial.

### Gestión

* múltiples administradores;
* auditoría;
* reportes avanzados;
* exportaciones;
* flujos de mantenimiento;
* multi-conjunto según política comercial.

### Premium

* reservas;
* pagos de residentes;
* futuros documentos;
* futuros comunicados;
* funcionalidades adicionales validadas.

### Portafolio

* múltiples conjuntos;
* vista consolidada;
* operación para empresas administradoras;
* precio negociado.

No implementes restricciones de planes. Solo clasifica lo existente.

## 5. Bloqueantes para primeros tres pilotos

Entrega un máximo de **cinco bloqueantes técnicos**.

Un elemento solo puede ser bloqueante si:

* impide cobrar;
* puede causar pérdida o exposición de información;
* genera una promesa comercial falsa;
* hace inviable operar el piloto;
* puede producir conflictos financieros o legales inmediatos.

No incluyas mejoras visuales ni funcionalidades deseables.

Para cada bloqueante:

1. problema;
2. impacto;
3. archivos afectados;
4. solución mínima;
5. pruebas necesarias;
6. esfuerzo relativo:

   * pequeño;
   * medio;
   * grande.

## 6. Trabajo no técnico pendiente

Lista por separado:

* definición de cliente ideal;
* paquetes;
* precios;
* implementación;
* descuentos;
* anualidad;
* comisión;
* piloto;
* propuesta;
* contrato;
* tratamiento de datos;
* política de retención;
* proceso de cancelación;
* capacitación;
* métricas;
* guion comercial.

No propongas programar estos elementos como módulos del producto.

## 7. Recomendación final

Entrega tres listas:

### Hacer antes del primer piloto

Máximo diez elementos.

### Hacer durante los tres pilotos

Máximo diez elementos.

### Posponer hasta tener evidencia de pago

Incluye todos los módulos o mejoras que no deben construirse ahora.

## 8. Informe final

Estructura:

1. Resumen ejecutivo.
2. Matriz del diagnóstico original.
3. Bloqueantes técnicos.
4. Trabajo comercial y operativo.
5. Clasificación de planes.
6. Qué congelar.
7. Plan antes/durante/después de pilotos.
8. Veredicto:

   * `LISTO PARA PREPARAR PILOTOS`;
   * `REQUIERE CIERRE TÉCNICO ACOTADO`;
   * `NO LISTO PARA PILOTOS`.

No modifiques el repositorio fuera de los documentos 01 y 02.

No hagas commit.

No inicies otra fase.
