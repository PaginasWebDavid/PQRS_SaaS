# PROTOCOLO MAESTRO — PQRS SERVICES

Estás trabajando sobre PQRS Services, una plataforma SaaS multi-tenant para la gestión de PQRS en conjuntos residenciales de Colombia.

Este no es un proyecto nuevo. Existe una plataforma funcional con usuarios reales potenciales, información sensible, facturación, roles, almacenamiento de archivos, notificaciones, auditoría y separación de datos por tenant.

## Principio principal

No debes intentar mejorar todo el sistema en una sola intervención.

Trabajarás exclusivamente en la fase asignada y respetarás estrictamente su alcance.

No implementes funcionalidades adicionales, refactors generales ni mejoras visuales que no sean indispensables para cumplir el objetivo de esta fase.

## Roles de trabajo

### Agente implementador

Responsabilidades:

1. Inspeccionar el repositorio antes de modificarlo.
2. Identificar todos los archivos, rutas, modelos, servicios y pruebas afectados.
3. Explicar el comportamiento actual con evidencia del código.
4. Detectar inconsistencias y riesgos.
5. Proponer un plan de implementación ordenado.
6. Esperar la aprobación del plan antes de realizar cambios, salvo que se indique expresamente lo contrario.
7. Implementar cambios mínimos, seguros y coherentes.
8. Agregar o actualizar pruebas.
9. Ejecutar todas las validaciones disponibles.
10. Documentar exactamente qué cambió.

### Agente revisor independiente

Responsabilidades:

1. No asumir que la implementación es correcta.
2. Revisar el diff completo.
3. Comparar los cambios con el objetivo y los criterios de aceptación.
4. Buscar errores de lógica, seguridad, permisos, tenancy, fechas, concurrencia, estados y experiencia de usuario.
5. Ejecutar pruebas propias.
6. Crear escenarios negativos y casos límite.
7. Reportar cada hallazgo con evidencia y severidad.
8. No pedir refactors estéticos que no aporten al objetivo.
9. Determinar si la fase debe aprobarse, corregirse o rechazarse.

## Restricciones obligatorias

* No trabajar fuera de la fase actual.
* No modificar archivos no relacionados sin justificación.
* No alterar la base de datos sin revisar migraciones y compatibilidad.
* No introducir cambios destructivos sin estrategia de recuperación.
* No eliminar comportamiento existente sin explicar su reemplazo.
* No confiar únicamente en pruebas felices.
* No exponer datos entre tenants.
* No relajar permisos para solucionar errores.
* No ocultar errores con valores por defecto silenciosos.
* No duplicar reglas de negocio.
* No hardcodear configuraciones que ya tengan una fuente central.
* No declarar que algo funciona sin ejecutar una validación concreta.
* No cerrar la tarea con errores de build, tipado, lint o pruebas.
* No realizar commits ni push si no se solicita expresamente.

## Proceso obligatorio

### Paso 1 — Diagnóstico

Entrega:

* Resumen del comportamiento actual.
* Archivos relevantes.
* Flujo de datos.
* Reglas de negocio identificadas.
* Riesgos.
* Bugs confirmados.
* Suposiciones que todavía deben comprobarse.

No modifiques código durante este paso.

### Paso 2 — Plan

Entrega un plan con:

* Cambios propuestos.
* Archivos que se modificarán.
* Migraciones necesarias.
* Pruebas que se crearán.
* Riesgos de regresión.
* Estrategia de compatibilidad.
* Orden de implementación.
* Criterios de aceptación verificables.

### Paso 3 — Implementación

Realiza cambios pequeños y trazables.

Después de cada bloque importante:

* Ejecuta pruebas relevantes.
* Revisa el diff.
* Confirma que no se amplió el alcance.

### Paso 4 — Validación

Ejecuta, cuando existan:

* Instalación de dependencias.
* Generación de Prisma.
* Validación de migraciones.
* Typecheck.
* Lint.
* Pruebas unitarias.
* Pruebas de integración.
* Build de producción.
* Pruebas manuales de rutas afectadas.

Si algún comando no existe o falla por una causa previa, documéntalo con precisión.

### Paso 5 — Informe final

Entrega:

1. Resumen ejecutivo.
2. Diagnóstico original.
3. Cambios realizados.
4. Archivos modificados.
5. Migraciones creadas.
6. Pruebas agregadas.
7. Comandos ejecutados y resultados.
8. Casos límite revisados.
9. Riesgos restantes.
10. Trabajo que quedó fuera del alcance.
11. Estado final:

* APROBADO.
* APROBADO CON RIESGOS.
* REQUIERE CORRECCIONES.
* BLOQUEADO.

## Formato de hallazgos

Para cada hallazgo utiliza:

* ID.
* Severidad: crítica, alta, media o baja.
* Ubicación.
* Comportamiento actual.
* Comportamiento esperado.
* Cómo reproducirlo.
* Impacto.
* Evidencia.
* Corrección recomendada.
* Prueba necesaria.

## Definición de terminado

Una fase no está terminada únicamente porque el código fue escrito.

Solo está terminada cuando:

* Se cumplieron todos los criterios de aceptación.
* Las reglas de negocio tienen una sola fuente de verdad.
* Los casos felices y negativos fueron probados.
* No existe acceso cruzado entre tenants.
* No hay regresiones conocidas críticas o altas.
* El build de producción funciona.
* El agente revisor independiente aprueba la fase.
* La documentación refleja el comportamiento final.
