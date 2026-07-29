# FASE 9B - Revisión adversarial y cierre de pagos de residentes

## Resultado

Se encontraron tres defectos acotados y se corrigieron. No se detectaron defectos críticos, altos ni problemas estructurales de modelo. El módulo queda listo para commit bajo el alcance de la Fase 9.

## Defectos y correcciones

1. **Carrera importación vs. alta manual.** La importación se serializaba por tenant, pero el alta manual no compartía una coordinación por identidad de obligación. Una carrera podía alcanzar una violación única y abortar una transacción PostgreSQL.
   - Se añadieron locks transaccionales por unidad y por identidad `(tenantId, unitId, period, concept)` compartidos entre importación y alta manual.
   - Ya no se captura un `P2002` dentro de una transacción abortada al crear una unidad perezosamente.

2. **Privacidad histórica por unidad.** Un residente nuevo podía consultar una obligación histórica de su unidad y recibir campos administrativos de pagos anteriores, incluyendo referencias y el actor que los registró.
   - La vista de residente conserva obligación, saldo y montos confirmados de la unidad, pero proyecta solo datos no sensibles de los pagos.
   - Los comprobantes siguen siendo estrictamente de la membresía que los subió.

3. **Retiro de comprobante.** El cambio de estado y su auditoría no eran una única transacción; además, un objeto cuyo borrado físico fallara podía continuar descargándose.
   - Retiro, lock de obligación, transición terminal y auditoría ahora son atómicos.
   - Una descarga excluye comprobantes `WITHDRAWN`; Storage se limpia fuera de la transacción como mejor esfuerzo.

## Importación e idempotencia

- Se valida `.xlsx` real, encabezados, fórmulas, tamaños, filas y errores por fila.
- La clave única `tenantId + unitId + period + concept` se mantiene como política actual: un concepto equivalente por unidad y período es único. Si el producto necesita dos cargos homónimos en el mismo período, deberá añadir una referencia externa explícita como decisión de producto.
- Importación contra importación e importación contra alta manual quedan coordinadas sin duplicar obligaciones ni dejar el batch en estado incoherente.

## Dinero y saldo

- Los montos se almacenan como `Int` en centavos con máximo validado; no hay cálculo financiero repetido con flotantes.
- Strings monetarios ambiguos en Excel se rechazan; solo valores numéricos reales de Excel se aceptan y se convierten una vez a centavos.
- Pago manual, aprobación, reversión y cancelación comparten lock de obligación y actualizan pago, `paidCents` y estado dentro de una misma transacción.

## Comprobantes y concurrencia

- Archivo privado, path generado por servidor, verificación de tenant/membresía/obligación, MIME/firma/extensión/tamaño y descarga autenticada.
- Aprobación contra retiro termina en exactamente una transición terminal: si gana aprobación hay un pago; si gana retiro no hay pago.
- Doble aprobación y doble reversión quedan protegidas por transición/CAS y lock.

## Privacidad

- Obligaciones y saldo son visibles por unidad para la membresía activa actual.
- Referencias, actores administrativos y comprobantes históricos no son visibles ni descargables para una membresía distinta, incluso de la misma unidad.
- ADMIN conserva alcance por tenant. CONSEJO recibe únicamente agregados.

## Pruebas ejecutadas

- `node --import tsx --test tests/unit/payment-security.test.ts tests/unit/payment-excel.test.ts`: **24/24**.
- `tests/payment-integration.test.ts` con marca y barreras de base de pruebas: **40/40**.
- `npx prisma validate`: correcto.
- `npx tsc --noEmit`: correcto.
- `npm run lint`: correcto, sin warnings.

Se añadieron pruebas focalizadas para importación vs. alta manual, historial de residente nuevo y aprobación vs. retiro.

## Riesgos restantes

- **Archivo huérfano de Storage:** si falla el borrado tras retiro o la compensación tras un fallo de DB, puede quedar un objeto privado huérfano. No bloquea commit ni despliegue; requiere tarea operativa de reconciliación/limpieza.
- **Unidad creada perezosamente:** coordinada y segura; no bloquea. La asignación explícita de unidades puede ser una mejora de producto futura.
- **Historial financiero por unidad:** obligación y saldo se conservan para la unidad. No bloquea; es una política explícita de producto.
- **CONSEJO solo agregado, vencimientos retroactivos e importación sin pagos:** no bloquean; son límites funcionales intencionales.
- **Int en centavos y emails best-effort:** no bloquean con los máximos actuales y el patrón de outbox/notificación existente.

## Estado

`CORREGIDO Y LISTO PARA COMMIT`