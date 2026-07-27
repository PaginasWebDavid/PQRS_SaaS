# FASE 2I - Correccion final del efecto economico y estabilidad de cobertura
Fecha: 2026-07-27  
Autor: Codex (implementacion)  
Commit base: `5e4be50 feat(billing): enforce idempotent atomic webhook effects`  
Estado: **CORREGIDO**, pendiente de revision independiente.

## 1. Resumen ejecutivo
Se corrigieron F2H-01 a F2H-06: economia y acceso quedaron separados; preapproval y no-aprobados usan evidencia Serializable; Tenant no puede activarse sin cobertura validada; status externo queda acotado. Resultado: typecheck/lint limpios, 187/187 puras y 283/283 completas.
## 2. Estado inicial de Git
`HEAD` seguia en `5e4be50`, sin commit nuevo; `git diff --check` limpio; diff limitado a precedencia, facturacion, reactivacion, pruebas y docs; schema, migraciones, paquetes, variables y cron intactos.
## 3. Diagnostico F2H-01 a F2H-06
F2H-01 mezclaba economia/acceso; F2H-02 permitia evidencia mutable y retorno silencioso; F2H-03 auditaba snapshot obsoleto; F2H-04 persistia status externo crudo; F2H-05 no probaba esas carreras; F2H-06 documentaba incorrectamente `""` en PowerShell.
## 4. Separacion economia/acceso
APPROVED mantiene una transaccion, pero aplica primero Payment + CAS economico de Subscription y luego relee para un CAS exclusivo de acceso. El primero no compara `status`; el segundo no reescribe periodo, precio, unidades ni pendientes.
## 5. CAS economico
Compara identidad, ambos periodos, precio, unidades, moneda y todos los terminos pendientes. `count=0` lanza conflicto, revierte Payment/marcador/Subscription y permite un unico reintento; un segundo conflicto aborta sin parciales.
## 6. CAS de acceso
Tras la economia relee Subscription. SUSPENDED/CANCELLED se conservan; en otros estados el CAS solo cambia acceso. Si pierde, no toca Tenant, relee el ganador y deja ledger `PROCESSED` porque el dinero si fue aplicado.
## 7. Terminos pendientes
Se calculan desde el snapshot economico, se aplican y limpian en el mismo CAS y no dependen del acceso. #51 demuestra una sola aplicacion bajo suspension concurrente y replay sin extension.
## 8. Payment APPROVED
Conserva claim idempotente, cuarentena, rollback, reconciliacion y periodo unico. Se agregaron seams para snapshot economico, actualizacion economica y CAS de acceso; una suspension concurrente ya no bloquea economia.
## 9. Payment no aprobado
PENDING/REJECTED ejecuta relectura, cobertura, decision, CAS, Tenant, AuditLog y ledger bajo `Serializable`, con un solo reintento `P2034`. #60 preserva cobertura concurrente sin crear Grace.
## 10. Preapproval Serializable
El fetch remoto sigue fuera; Subscription, Payments exactos, decision, CAS, Tenant, AuditLog y WebhookEvent quedan dentro de una transaccion Serializable. #58/#59 reevalúan cuarentena y vencimiento concurrentes sin activar.
## 11. Manejo P2034
Solo reconoce `PrismaClientKnownRequestError` codigo `P2034`; no oculta otros errores ni crea loops. Reutiliza el payload ya obtenido y cada intento relee Subscription/Payments; una transaccion abortada no deja parciales.
## 12. Estado persistido tras CAS
`readPersistedSubscriptionSnapshot` relee status, periodos y grace. #49, #50 y #51 verifican SUSPENDED, CANCELLED y SUSPENDED reales en WebhookEvent y AuditLog.
## 13. Helper de Tenant
`applyTenantStatusInTx` ya no recarga evidencia para ACTIVE: exige `realPaymentCoverageValidated: true` y lanza si falta. Preapproval y APPROVED solo la entregan tras validar/aplicar cobertura dentro de su transaccion.
## 14. Status externo acotado
La creacion usa `providerStatusLabel` para Subscription y auditoria. #61 cubre 10.000 caracteres, objeto, array y null: solo persiste string de hasta 255 o null, sin serializar payload.
## 15. Seams
Los seams nuevos siguen detras de `NODE_ENV === "test"`, sin HTTP ni sleeps; los hooks se resetean en `finally` y `after()`, sin cambiar produccion.
## 16. Archivos modificados
Implementacion: `src/domains/billing/mercado-pago.service.ts`; pruebas: `tests/billing-webhook-idempotency.test.ts`; docs: 17 y 18. `precedence.ts` y `tenant-admin.service.ts` no requirieron cambios adicionales en Fase 2I.
## 17. Schema y migracion
`prisma/schema.prisma` y `prisma/migrations/` intactos; no hubo migracion, `db push`, seed, build ni servidor.
## 18. Pruebas puras
Se conservaron las 92 pruebas de precedencia; total unitario **187/187 PASS**, 0 fail/skip/todo. El primer intento tuvo `spawn EPERM` del sandbox y se repitio fuera por ser un bloqueo ambiental.
## 19. Pruebas de integracion
Facturacion tiene 61 escenarios. Nuevos #57 conflicto economico; #58 cuarentena concurrente; #59 vencimiento concurrente; #60 cobertura concurrente; #61 status de checkout. Suite final **283/283 PASS**.
## 20. Escenarios fortalecidos
#49 agrega estado/periodos/auditoria/ledger; #50 Payment/CANCELLED/Grace/auditoria; #51 todos los modelos, periodo, terminos, marcador, metadata y replay; #54 Subscription y ausencia de AuditLog parcial. No se redujeron aserciones.
## 21. Procedimiento seguro
`npm test` normal aborto antes de Prisma. La suite uso `DATABASE_URL=" "` y `DIRECT_URL=" "` solo en proceso, restauradas en `finally`; `.env`, `.env.test` y guard quedaron intactos.
## 22. Comandos ejecutados
Git status/log/diff; `npx tsc --noEmit`; `npm run lint`; puras; `npm test` inseguro esperado; conteos antes/despues; suite segura. No hubo build, servidor, cron, migracion, seed, proveedor real, commit ni push.
## 23. Resultados
Typecheck PASS; lint PASS; puras 187/187. Primera suite 282/283 por una asercion nueva que confundia `typeof null`; corregida deliberadamente a `string | null`, la segunda quedo 283/283. `git diff --check` limpio y cero skips.
## 24. Limpieza
Antes y despues: tenants=6, users=17, payments=5, pqrs=55, webhooks=0, mpPayments=0 y todos los fixtures=0. Todos los fetch de Mercado Pago fueron mocks.
## 25. Compatibilidad con Fase 1
Siguen verdes APPROVED nuevo, idempotencia, replay, concurrencia, tres rollbacks, reintento, cuarentena, reconciliacion, pendientes, periodo compartido, missing dataId, ledger y preapproval atomico; Payment y Subscription comparten siempre el periodo aplicado.
## 26. Riesgos restantes
Cancelacion definitiva, cron, notificaciones y reparacion de grace null siguen fuera de alcance. Dos conflictos consecutivos dejan ledger FAILED para entrega posterior. Se requiere revision independiente y separar Supabase antes de produccion.
## 27. Respuesta individual F2H-01 a F2H-06
F2H-01 CORREGIDO; F2H-02 CORREGIDO; F2H-03 CORREGIDO; F2H-04 CORREGIDO; F2H-05 CORREGIDO; F2H-06 CORREGIDO EN PROCEDIMIENTO.
## 28. Recomendacion sobre commit
No hice commit. Tras revision independiente puede usarse `feat(billing): enforce payment precedence and access coverage`, con staging explicito de archivos aprobados y nunca `git add .`.
## 29. Estado
**CORREGIDO.** Cumple los 22 criterios en el estado probado, sin autoaprobacion. Prompt exacto: [doc 17](C:/Users/d.hernandeza2/Documents/PQRS_Saas/docs/programa-mejora/03-precedencia-cron/17-prompt-codex-correccion-efecto-economico-cobertura.md). Informe: [doc 18](C:/Users/d.hernandeza2/Documents/PQRS_Saas/docs/programa-mejora/03-precedencia-cron/18-respuesta-codex-correccion-efecto-economico-cobertura.md). No hubo commit, push ni cron; la fase termina aqui.