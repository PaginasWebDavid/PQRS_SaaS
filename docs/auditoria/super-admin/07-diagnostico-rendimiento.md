# Diagnostico de rendimiento y lentitud percibida

Medicion no destructiva con sesion SUPER_ADMIN contra `localhost:3000`, tres muestras por endpoint:

| Accion/API | Medicion ms | Causa probable | Recomendacion |
|---|---:|---|---|
| Carga de overview | 1545, 1757, 1738 | JWT consulta DB + 10 consultas del overview + conexion remota | dividir payload, cachear datos estables y medir en build de produccion |
| Abrir Analytics | 1662, 1621, 1598 | 15+ consultas/lecturas y agregados en `analytics.service.ts:27-84` | agregados SQL/Prisma, indices compuestos, cache por periodo |
| Abrir Auditoria | 1563, 1594, 1701 | 8 conteos de categoria + pagina + total (`audit.service.ts:66-86`) | devolver conteos separados bajo demanda/cacheados |
| Abrir Soporte | 1074, 1225, 1080 | dos consultas y listado hasta 100 sin paginacion | paginar y seleccionar campos minimos |
| Configuracion | 1075, 1070, 1064 | autenticacion JWT consulta DB en cada request | reducir refresh de JWT/usar cache segura de sesion |

## SA-010 - Mutaciones con recarga completa

- Severidad: Media.
- Evidencia: suspender, renovar, editar conjunto, ejecutar mora, actualizar topes y reglas esperan `await fetchOverview()` despues del POST (`page.tsx:370-702,824-852`).
- Sintoma: cada click espera POST y luego 1.5-1.8 s adicionales de overview; muchos botones no tienen estado `pending` propio.
- Solucion: actualizar optimistamente la entidad afectada, revalidar solo el modulo, mostrar estado de envio/deshabilitar el boton y usar `startTransition` donde corresponda.

## SA-011 - Consultas y payload excesivos

- Severidad: Media.
- Overview ejecuta en paralelo stats, todos los tenants con relaciones/conteos, detalle opcional, auditoria, billing, reglas, 20 pagos, integraciones y settings (`super-admin.service.ts:8-30`), aunque la mayoria de pestañas no esta visible.
- Analytics carga arrays de pagos, tenants y PQRS y agrupa en Node (`analytics.service.ts:38-103`); con crecimiento aumentara transferencia y CPU.
- La pagina cliente de 1.800 lineas y muchos estados re-renderiza el panel completo en cada cambio (`page.tsx:161-225`).

## Diagnostico

La lentitud es mixta: infraestructura/DB remota y autenticacion explican el piso de ~1 s; frontend agrega percepcion lenta porque bloquea acciones tras una recarga global y no ofrece feedback granular. Las mediciones son de desarrollo local, por lo que se requiere repetir con tracing en Vercel antes de fijar SLA de produccion.
