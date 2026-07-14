# Known Issues

## ~~`admin/pqrs`: "Avanzar estado" no funciona correctamente~~ — Resuelto 2026-07-16

Se reemplazó el botón único "Avanzar estado" por tres acciones reales conectadas correctamente al contrato del backend (`src/app/api/pqrs/[id]/route.ts`):

1. **Registrar primer contacto** (`EN_ESPERA` → `EN_PROGRESO`): sheet con selector de categoría (las 9 válidas) + nota obligatoria. Envía `{ primerContacto: true, asunto, notaPrimerContacto }`.
2. **Actualizar fase de gestión** (solo visible en `EN_PROGRESO`): sheet para fijar `faseActual` (1-5), `faseTipo` (INSUMOS/PROVEEDOR) y la nota de la fase correspondiente (`fase{N}Nota`, 1-4). Envía `{ actualizarFase: true, faseActual, faseTipo?, fase{N}Nota? }`.
3. **Cerrar PQRS**: sheet con acción tomada (obligatoria), "qué se hizo para cerrar" (obligatorio solo si `faseActual !== 5`), y evidencia de cierre (texto y/o archivo). El archivo se sube realmente a Supabase Storage (`uploadToStorage`, carpeta `evidencias`) en vez de guardar el base64 crudo en la base de datos — antes el backend aceptaba `evidenciaArchivoData` y lo escribía tal cual en la columna; ahora se resuelve a `evidenciaArchivoPath` igual que las fotos de PQRS. Envía `{ terminar: true, accionTomada, queSeHizoParaCerrar?, evidenciaCierre?, evidenciaArchivoData?, evidenciaArchivoNombre? }`.

Archivos tocados: `src/app/admin/pqrs/page.tsx` (rediseño completo del panel de detalle/acciones), `src/app/api/pqrs/[id]/route.ts` (import de `uploadToStorage`/`dataUrlToBuffer`, `ALLOWED_EVIDENCE_TYPES`, bloque de evidencia reescrito para subir a storage en vez de guardar base64 inline).

**Nota aparte (no arreglada, fuera de alcance):** el archivo `src/app/api/pqrs/[id]/route.ts` tiene varios literales de string con mojibake (acentos corruptos tipo `Ã¢â‚¬â„¢`) en mensajes de error y plantillas de email — probablemente de un copy/paste con encoding incorrecto en algún momento. No afecta la lógica, solo la legibilidad de esos mensajes para el usuario final. Vale la pena limpiarlo en algún momento.
