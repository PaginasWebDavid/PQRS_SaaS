# Hallazgos de consistencia funcional, visual y de datos

## SA-004 - Terminologia financiera inconsistente

MRR se usa para ingreso historico total y para pagos del mes. Ver `page.tsx:811-812,860` y `billing.service.ts:199-269`. Esto puede llevar decisiones comerciales con una metrica equivocada.

## SA-005 - Consistencia de conjuntos

La lista muestra conteos de PQRS reales, pero el detalle reusa el conteo total como abiertas y muestra telefono `-` fijo. Ver `page.tsx:307-331,1783-1792`. La informacion de conjunto no es consistente entre lista, detalle y fuente de datos.

## SA-006 - Usuarios globales incompletos

- Severidad: Media.
- Evidencia: modulo Usuarios permite buscar conjuntos y luego cargar usuarios de uno (`page.tsx:1404-1482`). No existe busqueda por nombre/email global, filtro por rol, estado, ni detalle de usuario.
- Impacto: no cumple el inventario funcional esperado para administracion global y no escala con muchos conjuntos.

## SA-008 - Identidad de plataforma hardcodeada

- Severidad: Media.
- Evidencia: `SuperAdminShell.tsx:21-23` asigna `userName = 'Sofia Pena'`; avatares fijos `SP` en lineas 78,100,114. La pagina no pasa `userName` (`page.tsx:860`).
- Impacto: el SUPER_ADMIN real ve otra identidad, incumpliendo que la UI provenga de datos reales.

## SA-013 - Codificacion

Los acentos corruptos hacen inconsistente el idioma en labels, pestañas y mensajes. Corregir codificacion UTF-8 sin cambiar contenido.
