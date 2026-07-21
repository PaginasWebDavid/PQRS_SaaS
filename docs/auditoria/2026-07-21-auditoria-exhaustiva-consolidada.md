# Auditoría exhaustiva de calidad — 2026-07-21

Consolidado de 14 agentes de auditoría en paralelo (A1-A14), cada uno con propiedad exclusiva de un área del código, formato de severidad fijo, y sin solape. Ver `zany-beaming-flask.md` (plan original) para la metodología completa.

**Convención de severidad:** P0 crítico (dinero/seguridad/fuga entre tenants) · P1 alto (feature central rota) · P2 medio (caso borde/robustez) · P3 bajo (limpieza/cosmético) · RULE-Q (no es un bug, es una decisión de producto).

Se aplicaron ya (y quedaron commiteados en `10133c1`) los 3 arreglos de mojibake autorizados de antemano (auth.ts, pqrs/route.ts, dashboard/excel/route.ts). Todo lo demás en este documento **requiere tu decisión antes de tocarse**.

---

## P0 — Crítico

### Dinero / facturación

1. **[A4] Doble extensión del período de facturación por un solo pago real.** `mercado-pago.service.ts` (`upsertMercadoPagoPayment`). Mercado Pago manda dos notificaciones distintas (`subscription_authorized_payment` y `payment`) para el mismo cobro. El código deduplica correctamente la fila de `Payment`, pero **no** evita extender `currentPeriodEnd` dos veces — cada pago real legítimo puede regalar ~30 días extra de servicio gratis.

2. **[A4 + A9] El candado "requiere pago aprobado" solo verifica que pagó ALGUNA VEZ, no que el pago cubra el período ACTUAL.** Afecta dos lugares distintos con la misma falla:
   - `tenant-admin.service.ts` (botón manual "Reactivar" del Super Admin) — un tenant que pagó una vez, se atrasó y quedó suspendido, se puede reactivar gratis con un click.
   - `mercado-pago.service.ts` (webhook automático) — un webhook viejo/repetido de "autorizado" puede reactivar un tenant atrasado sin cobro nuevo.
   Necesita el mismo arreglo (exigir que el pago cubra el período vigente) en ambos lugares.

3. **[A3] El "trial" de 15 días nunca se aplica de verdad.** El cron de mora (`applyOverdueLicenseRules`) solo compara contra el período de facturación de 30 días, nunca contra `trialEndsAt`. Resultado: hasta ~35 días de acceso gratis antes de la primera suspensión, no los ~20 días (15 trial + 5 gracia) que sugiere el diseño.

### Seguridad / aislamiento entre tenants

4. **[A6] Posible fuga de fotos/evidencias entre residentes/tenants.** El bucket de Supabase Storage parece usar URLs **públicas** (`getPublicStorageUrl`). Además, la rama de "editar descripción" del residente en `api/pqrs/[id]/route.ts` devuelve el registro completo de `PqrsFoto` (sin `select`), filtrando esa URL pública y el campo `data` (base64) al cliente — quien capture esa respuesta puede acceder al archivo directamente, sin pasar por el chequeo de tenant/dueño.

5. **[A1] El middleware nunca revisa si la cuenta está desactivada o el tenant suspendido, usando solo el JWT.** Una cuenta que un admin desactiva, o un tenant que se suspende, sigue con acceso completo hasta que la cookie de sesión expire por su cuenta — no hay invalidación de sesión activa.

6. **[A1] Ventana de persistencia de rol viejo.** Si cambian el rol de un usuario, la cookie JWT (usada por el middleware) puede seguir reflejando el rol anterior hasta el próximo login, aunque el servidor ya tenga el rol correcto en otros contextos — una ventana de privilegio obsoleto.

### Ya corregido, falta commitear

7. **[A7] El export de Excel del dashboard tenía el nombre del conjunto hardcodeado** ("Parque Residencial Calle 100") para **todos** los tenants — fuga real entre inquilinos en un reporte descargable. Ya está arreglado en el árbol de trabajo por la otra conversación (sin commitear todavía).

---

## P1 — Alto

- **[A8]** Condición de carrera (dos solicitudes simultáneas) en la protección de "último admin activo" — podría dejar un conjunto sin ningún ADMIN, bloqueando su propia gestión.
- **[A4]** Si Mercado Pago manda un reembolso/contracargo, el código lo trata igual que un pago pendiente normal y da 5 días de gracia extra, en vez de suspender de inmediato — mala señal ante fraude.
- **[A4]** Si el webhook no encuentra la suscripción localmente (por una posible carrera), la ruta responde 200 igual — Mercado Pago nunca reintenta, y esa actualización se pierde en silencio para siempre.
- **[A5]** Las transiciones de historial de PQRS (primer contacto, fase, cierre) no están en una transacción con la actualización del PQRS — si falla el segundo paso, queda un registro de auditoría "mintiendo" sobre algo que nunca ocurrió.
- **[A5]** La vista de residente no filtra el texto dentro del array de historial — la nota interna de "primer contacto" (se supone solo para admin) se filtra igual por ahí.
- **[A5]** Validación de fotos solo verifica el tipo declarado por el cliente, no los bytes reales del archivo.
- **[A9]** La categoría de auditoría "pago fallido" nunca se usa — un cobro recurrente que falla no deja ningún rastro.
- **[A13]** Consejo puede consultar el log completo de actividad de usuarios y facturación (correos de invitados, fallos de pago, suspensiones) pese a que la app le dice explícitamente "solo tienes acceso a PQRS y Reportes".

---

## P2 — Medio (backlog, sin urgencia)

- Constantes de gracia/período duplicadas entre `billing.service.ts` y `mercado-pago.service.ts` — pueden desincronizarse si se cambia una y no la otra.
- Exports de Excel no sanitizan fórmulas (`=`, `+`, `-`, `@`) en texto de usuario — riesgo bajo de inyección de fórmulas.
- Dos fórmulas distintas de "vencida"/SLA entre `reportes.service.ts` y `analytics.service.ts` — un PQRS cerrado justo en el límite puede salir "a tiempo" en un reporte y "vencido" en otro.
- Límites de fila (5000-20000) en reportes truncan datos sin avisar al usuario.
- `api/dashboard/excel` no tiene ningún llamador real en el frontend — endpoint huérfano que igual corre una consulta sin límite.
- Mensaje de error de invitaciones revela si un correo pertenece a otro tenant (oráculo de existencia cross-tenant).
- Un ADMIN puede promover a un residente directo a ADMIN sin ningún paso de confirmación, distinto (y más débil) que el flujo de invitación normal.
- El endpoint de invitaciones masivas parsea el archivo completo en memoria antes de aplicar el límite de 500 filas.
- Ningún shell (Admin/Residente/SuperAdmin) redirige al login cuando la sesión expira a mitad de uso — se queda "cargando" o, peor, en Residente actúa como si todo estuviera bien.
- `Sheet.tsx` (los paneles modales) no tiene atrapa-foco ni cierre con ESC.
- Falta validación de bytes reales (magic number) en subida de avatar/evidencias, solo se confía en el tipo MIME declarado.

---

## P3 — Bajo / limpieza (requiere tu aprobación antes de borrar algo)

- Todo el árbol `src/app/dashboard/*` (5 archivos) es código muerto — nada en la app enlaza ahí. Candidato a borrar.
- El enum `Medio` (canal de la PQRS) tiene un solo valor posible — o es código muerto o es scaffolding para un canal futuro (WhatsApp/teléfono).
- `PqrsFoto.data` (base64) ya no se escribe en ningún flujo nuevo, pero puede haber filas viejas que aún dependan de él — no borrar la columna sin confirmar antes.
- `HistorialPqrs` y `PqrsFoto` tienen `onDelete: Cascade` hacia `Pqrs`, lo cual contradice la regla documentada de que el historial nunca se borra (append-only).
- `docs/DATABASE.md` describe un modelo (`Membership`, `PqrsAttachment`, IDs tipo UUID) que ya no coincide con el esquema real — el documento quedó desactualizado.
- Colores hardcodeados en `SuperAdminShell.tsx` en vez de usar `tokens.ts`.
- Notificaciones sin paginación (tope fijo de 50, sin forma de ver más antiguas).
- El FAQ de ayuda del admin menciona un botón ("Avanzar estado") que ya no existe en la interfaz actual.
- `api/auth/register` es un endpoint muerto (403 fijo, nadie lo llama) — seguro pero podría eliminarse.
- Páginas alias `login` y `recuperar-contrasena` no tienen ningún enlace interno apuntándoles (la app usa `auth/login` y `auth/olvidar-contrasena`) — probablemente seguras de quitar.

---

## RULE-Q — Preguntas de producto (decisión tuya, no las cambio solo)

1. ¿Una PQRS que rompe el SLA debería escalar prioridad o volver a notificar automáticamente? Hoy no pasa nada cuando se vence.
2. `GRACE_PERIOD` da acceso completo sin ninguna advertencia visible al usuario de que está en modo de gracia — ¿debería mostrarse un aviso/banner en la app?
3. ¿Debería existir alguna forma de autoregistro, o el diseño final es 100% invitación (como está hoy)?
4. ¿Un ADMIN debería poder promover directamente a un residente a ADMIN sin pasar por invitación/confirmación?
5. El cálculo de días hábiles no cuenta festivos colombianos — ¿importa para cumplimiento real de SLA?
6. Consejo puede editar su perfil pero no tiene ningún paso de "bienvenida" la primera vez — ¿está bien así?
7. El árbol `dashboard/*` y las páginas alias — ¿los borro definitivamente, o los dejamos por si hay marcadores/enlaces externos viejos?

---

## Orden de trabajo recomendado

1. **Revisa y decide sobre el bloque P0** — especialmente los 3 primeros (dinero) y los 2 de seguridad (fuga de archivos, sesión no invalidada). Son los que de verdad importan antes de tener usuarios reales pagando.
2. Con tu visto bueno, los arreglo uno por uno, corriendo `tsc`/tests después de cada uno.
3. El backlog P2/P3 lo trabajamos después, sin prisa.
4. Las preguntas RULE-Q las respondes cuando quieras — no bloquean nada técnico.
