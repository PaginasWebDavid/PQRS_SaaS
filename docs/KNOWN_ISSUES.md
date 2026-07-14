# Known Issues

## `admin/pqrs`: "Avanzar estado" no funciona correctamente

**Encontrado:** 2026-07-13, durante la migración de diseño (`docs/superpowers/plans/2026-07-10-design-migration.md`, Task 10). Preexistente — no lo causó la migración, solo se detectó al verificar los `fetch` reales contra el endpoint.

**Archivos:** `src/app/admin/pqrs/page.tsx` (función `advance()`) vs. `src/app/api/pqrs/[id]/route.ts` (handler `PATCH`).

### Problema 1 — EN_ESPERA → EN_PROGRESO ("registrar primer contacto")

`advance()` envía:
```json
{ "estado": "EN_PROGRESO", "notaPrimerContacto": "..." }
```

El backend solo activa esta transición si `body.primerContacto === true` (no basta con enviar `estado`). Además exige:
- `notaPrimerContacto` no vacío (esto sí se envía).
- `asunto` presente, y que sea uno de 9 valores fijos: `AREA COMUN`, `AREA PRIVADA`, `CONTABILIDAD`, `CONVIVENCIA`, `HUMEDAD/CUBIERTA`, `HUMEDAD/DEPOSITO`, `HUMEDAD/VENTANAS`, `HUMEDAD/FACHADA`, `HUMEDAD/GARAJE` (`ASUNTOS_VALIDOS` en `route.ts:37`).

Como `primerContacto` nunca se envía, el backend cae al bloque final del handler, ve que el estado es `EN_ESPERA` y devuelve `400 "Debe registrar el primer contacto antes de gestionar la PQRS"`. El botón muestra el toast de error y no avanza nada.

**Gap adicional:** hoy el campo `asunto` se captura como texto libre al crear la PQRS (`submitCreate` en la misma página). Aunque se arregle el nombre del campo, la transición seguirá fallando si el texto libre no coincide exactamente con una de las 9 categorías válidas. Se necesita un selector de asunto (no un input libre) en algún punto del flujo — en creación, o en el momento de "avanzar", antes de que este botón pueda funcionar de punta a punta.

### Problema 2 — EN_PROGRESO → TERMINADO ("cerrar")

`advance()` envía:
```json
{ "estado": "TERMINADO", "queSeHizoParaCerrar": "...", "accionTomada": "..." }
```

El backend solo cierra la PQRS si `body.terminar === true`. Sin ese flag, el handler sí actualiza `accionTomada`/`queSeHizoParaCerrar` (porque esos campos se procesan fuera del bloque condicional), pero **nunca cambia `estado` a `TERMINADO`** — la respuesta es `200 OK`, la UI muestra "Estado actualizado ✓", pero la PQRS se queda en `EN_PROGRESO` para siempre. Es un fallo silencioso, más engañoso que el anterior.

Además, aun enviando `terminar: true`, el backend exige evidencia de cierre (`evidenciaCierre` o algún campo `evidenciaArchivo*`) — y hoy no existe ningún campo de evidencia en este botón rápido de "Avanzar estado".

### Opciones para resolver (sin decidir aún)

1. **Fix mínimo de contrato**: corregir los nombres de campos (`primerContacto`, `terminar`) y agregar al sheet existente un selector de asunto (dropdown con las 9 categorías) + un campo de texto para evidencia de cierre. Cubre el flujo real sin rediseñar nada más.
2. **Solo corregir nombres de campos**: dejar que el usuario vea el error de validación real del backend en vez del genérico "No se pudo actualizar" — más rápido, pero el botón seguirá fallando en la mayoría de los casos hasta agregar la UI faltante.
3. Rediseñar el flujo de gestión de PQRS admin con un formulario completo por fase (fuera del alcance de un ajuste rápido).

**Estado:** documentado, sin resolver. Pendiente de decisión del usuario sobre alcance antes de tocar código.
