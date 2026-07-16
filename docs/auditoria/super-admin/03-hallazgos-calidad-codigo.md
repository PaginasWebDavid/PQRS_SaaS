# Hallazgos de calidad y arquitectura

## SA-009 - Componente monolitico

- Severidad: Media. Categoria: mantenibilidad/rendimiento.
- Evidencia: `src/app/(protected)/super-admin/page.tsx:1-1800` contiene tipos, fetches, nueve modulos, formularios, graficas y hojas modales.
- Impacto: cualquier cambio vuelve a renderizar el arbol completo y aumenta el riesgo de regresiones entre modulos independientes.
- Recomendacion: extraer por modulo `Overview`, `Tenants`, `Billing`, `Pricing`, `Analytics`, `Users`, `Audit`, `Support`, `Settings`, manteniendo contratos existentes.

## SA-012 - Lint no pasa

- Severidad: Media. Categoria: calidad/build.
- Evidencia reproducible: `npm run lint` fallo por `GREEN` no usado en `src/app/api/reportes/excel/route.ts:15`, `DANGER` no usado en `src/app/api/reportes/pdf/route.ts:17`, y `Link` no usado en `src/components/shell/SuperAdminShell.tsx:3`.
- Riesgo: la puerta de calidad esta rota y puede bloquear CI/deploy.

## SA-013 - Texto con codificacion corrupta

- Severidad: Baja. Categoria: UX/calidad.
- Evidencia: `page.tsx:18-20,84,129` muestra cadenas como `AuditorÃ­a`, `PeticiÃ³n`, `TÃ©cnico`.
- Resultado: textos visibles con mojibake; no afecta datos pero reduce credibilidad.

## SA-014 - Cobertura de pruebas insuficiente para SUPER_ADMIN

- Severidad: Media. Categoria: pruebas.
- Evidencia: `tests/phase2-flows.test.ts` cubre invitaciones y residente; la busqueda solo encontro una prueba de permisos ADMIN contra invitacion. No hay pruebas de crear/suspender/reactivar/renovar conjunto, reglas de precio, metricas, auditoria global o APIs SUPER_ADMIN.
- Recomendacion: agregar pruebas de servicio y route handler para SA-001 a SA-007 antes de cambios de UI.

## Observacion

`SuperAdminShell.tsx` importa `Link` sin usar y contiene valores por defecto productivos. Esto combina problema de lint y dato hardcodeado (SA-008).
